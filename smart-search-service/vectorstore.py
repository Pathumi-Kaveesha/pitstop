# Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
#
# WSO2 LLC. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.

"""Stores chunk vectors in PostgreSQL (pgvector), searches them, and
applies the score-based filtering that decides what counts as a real match."""

import json
import re
import threading
import time
from dataclasses import dataclass
from typing import Optional

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

import queries
from config import (
    DELETE_MAX_RETRIES,
    DELETE_RETRY_DELAY_SECONDS,
    MAX_CHUNKS_PER_DOCUMENT,
    MAX_SCORE_GAP_FROM_TOP_MATCH,
    MINIMUM_SIMILARITY_SCORE,
    POSTGRES_DSN,
    UPSERT_MAX_RETRIES,
    UPSERT_RETRY_DELAY_SECONDS,
)
from deep_links import with_timestamp

# Common words a question is full of but that say nothing about which moment actually matters
_STOP_WORDS = {
    "this", "that", "with", "from", "have", "does", "what", "when", "where", "which", "about",
    "there", "would", "could", "should", "while", "these", "those", "into", "over", "then", "than",
}


def _query_words(query: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9]+", query.lower()) if len(w) > 3 and w not in _STOP_WORDS]


def _score_text(text: str, query_words: list[str]) -> int:
    lower = text.lower()
    return sum(1 for word in query_words if re.search(rf"\b{re.escape(word)}\b", lower))


def _best_native_link(metadata: dict, drive_link: str, query_words: list[str]) -> Optional[str]:
    """Picks whichever of the chunk's moments actually matches the query, not just the first one."""
    fallback = metadata.get("nativeLink") or None
    raw_moments = metadata.get("moments")
    if not raw_moments or not query_words:
        return fallback
    try:
        moments = json.loads(raw_moments)
    except (TypeError, ValueError):
        return fallback
    if not moments:
        return fallback

    best_seconds, best_text = max(moments, key=lambda m: _score_text(m[1], query_words))
    if _score_text(best_text, query_words) == 0 or not drive_link:
        return fallback
    return with_timestamp(drive_link, best_seconds)


@dataclass
class SearchResult:
    content: str
    title: str
    page: int
    similarity_score: float
    document_id: str
    unit_label: str
    file_extension: str
    source: str
    drive_link: str
    # Link to this chunk's slide/tab/heading - None where there isn't one.
    native_link: Optional[str] = None


def _use_db_named_schema(conn: psycopg.Connection) -> None:
    """Keeps this service in its own schema, named after its database, on a server shared with other apps."""
    schema = conn.info.dbname
    try:
        conn.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema)))
        conn.commit()
    except psycopg.errors.UniqueViolation:
        # Another connection created it first, at the same moment - fine, it exists now.
        conn.rollback()
    # public stays in the path too, so an extension already installed there is still visible.
    conn.execute(sql.SQL("SET search_path TO {}, public").format(sql.Identifier(schema)))
    conn.commit()


# Shared pool - a new connection per call doesn't scale under concurrent search and indexing.
_pool = ConnectionPool(POSTGRES_DSN, min_size=1, max_size=10, open=True, configure=_use_db_named_schema)

_schema_ready = False
_SCHEMA_LOCK_KEY = 7341902518
_schema_lock = threading.Lock()


def _ensure_schema() -> None:
    """Creates the table the first time it's needed. Safe to call from multiple threads at once."""
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        with _pool.connection() as conn:
            # Copies of the service starting together on an empty database would otherwise collide creating the tables.
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (_SCHEMA_LOCK_KEY,))
            conn.execute(queries.SCHEMA)
        _schema_ready = True


def _vector_literal(vector: list[float]) -> str:
    """Turns a list of numbers into the text form pgvector reads, like [0.1,0.2]."""
    return "[" + ",".join(str(float(value)) for value in vector) + "]"


def claim_generation(document_id: str) -> int:
    """Claims the next generation for a document. The counter lives in the database, so every copy of
    the service sees it - a job holding an older number knows it was superseded, wherever that happened."""
    _ensure_schema()
    with _pool.connection() as conn:
        return conn.execute(queries.CLAIM_GENERATION, (document_id,)).fetchone()[0]


def start_index_job(document_id: str, generation: int) -> None:
    """Marks an index job as running, so a service that dies mid-job leaves a mark that stops being refreshed."""
    _ensure_schema()
    with _pool.connection() as conn:
        conn.execute(queries.START_INDEX_JOB, (document_id, generation))


def touch_index_job(document_id: str, generation: int) -> None:
    """Proves the job is still alive."""
    with _pool.connection() as conn:
        conn.execute(queries.TOUCH_INDEX_JOB, (document_id, generation))


def finish_index_job(document_id: str, generation: int) -> None:
    """Removes the job's mark once it has ended, however it ended."""
    with _pool.connection() as conn:
        conn.execute(queries.FINISH_INDEX_JOB, (document_id, generation))


def clear_stale_index_job(document_id: str, stale_after_seconds: float) -> None:
    """Drops the mark of a job that died, once a newer request has already been answered some other way."""
    _ensure_schema()
    with _pool.connection() as conn:
        conn.execute(queries.CLEAR_STALE_INDEX_JOB, (document_id, stale_after_seconds))


def is_index_job_stale(document_id: str, stale_after_seconds: float) -> bool:
    """Whether a job was marked running but hasn't refreshed its mark recently - the service died mid-job."""
    _ensure_schema()
    with _pool.connection() as conn:
        return conn.execute(queries.STALE_INDEX_JOB, (document_id, stale_after_seconds)).fetchone() is not None


def is_current_generation(document_id: str, generation: int) -> bool:
    """Whether no newer job or delete has claimed this document since the caller claimed its generation."""
    _ensure_schema()
    with _pool.connection() as conn:
        row = conn.execute(queries.GET_GENERATION, (document_id,)).fetchone()
    return row is not None and row[0] == generation


def store_chunks_if_current(
    vectors: list[list[float]],
    texts: list[str],
    title: str,
    pages: list[int],
    document_id: str,
    generation: int,
    unit_label: str,
    file_extension: str,
    source: str,
    drive_link: str,
    native_links: list[Optional[str]],
    moments: Optional[list[Optional[list[tuple[str, str]]]]] = None,
) -> bool:
    """Stores each (vector, text, metadata) triple in PostgreSQL, and clears leftover chunks from an
    earlier, longer version - but only if no newer job or delete has claimed this document meanwhile.
    The check and the write share one transaction holding the document's row lock, so they can't be
    interleaved by another copy of the service. Returns False when it was superseded and wrote nothing."""
    if len({len(vectors), len(texts), len(pages), len(native_links)}) > 1:
        raise ValueError(
            f"Vector/text/page/native_link length mismatch: vectors={len(vectors)}, "
            f"texts={len(texts)}, pages={len(pages)}, native_links={len(native_links)}"
        )
    chunk_moments = moments or [None] * len(vectors)
    rows = [
        (
            f"{document_id}#{index}",
            document_id,
            _vector_literal(vector),
            text,
            title,
            page,
            unit_label,
            file_extension,
            source,
            drive_link,
            # native_link is NOT NULL, so "" means no link.
            native_link or "",
            json.dumps(entry_moments) if entry_moments else "",
        )
        for index, (vector, text, page, native_link, entry_moments) in enumerate(
            zip(vectors, texts, pages, native_links, chunk_moments)
        )
    ]
    last_error: Exception | None = None
    for attempt in range(UPSERT_MAX_RETRIES + 1):
        try:
            _ensure_schema()
            with _pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(queries.LOCK_GENERATION, (document_id,))
                    row = cur.fetchone()
                    if row is None or row[0] != generation:
                        return False
                    # Chunk ids are derived from the document id, so this overwrites a previous version in
                    # place - the old copy stays searchable if the write fails.
                    cur.executemany(queries.UPSERT_CHUNK, rows)
                    expected = [f"{document_id}#{index}" for index in range(len(rows))]
                    cur.execute(queries.DELETE_STALE_CHUNKS, (document_id, expected))
            return True
        except psycopg.Error as error:
            last_error = error

        if attempt < UPSERT_MAX_RETRIES:
            time.sleep(UPSERT_RETRY_DELAY_SECONDS)
    raise RuntimeError(f"Failed to store chunks in PostgreSQL: {last_error}") from last_error


def search(
    query_vector: list[float], query_text: str, top_results_count: int, pool_multiplier: int
) -> list[SearchResult]:
    """Pulls a wider pool of raw matches than requested, then narrows it
    down to the strongest ones, allowing up to MAX_CHUNKS_PER_DOCUMENT
    from the same document."""
    query_words = _query_words(query_text)
    raw_pool_size = top_results_count * pool_multiplier
    vector_text = _vector_literal(query_vector)
    _ensure_schema()
    with _pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(queries.SET_EF_SEARCH, (str(max(40, raw_pool_size)),))
        cur.execute(queries.SEARCH, (vector_text, vector_text, raw_pool_size))
        matches = cur.fetchall()

    candidates = [m for m in matches if m["similarity"] >= MINIMUM_SIMILARITY_SCORE]
    if not candidates:
        return []

    candidates.sort(key=lambda m: m["similarity"], reverse=True)

    top_score = candidates[0]["similarity"]
    candidates = [m for m in candidates if top_score - m["similarity"] <= MAX_SCORE_GAP_FROM_TOP_MATCH]

    chunks_used_per_document: dict[str, int] = {}
    results: list[SearchResult] = []
    for match in candidates:
        title = match["title"]
        document_key = match["document_id"] or title
        used = chunks_used_per_document.get(document_key, 0)
        if used >= MAX_CHUNKS_PER_DOCUMENT:
            continue
        chunks_used_per_document[document_key] = used + 1

        results.append(
            SearchResult(
                content=match["content"],
                title=title,
                page=match["page"],
                similarity_score=float(match["similarity"]),
                document_id=match["document_id"],
                unit_label=match["unit_label"],
                file_extension=match["file_extension"],
                source=match["source"],
                drive_link=match["drive_link"],
                native_link=_best_native_link(
                    {"nativeLink": match["native_link"], "moments": match["moments"]},
                    match["drive_link"],
                    query_words,
                ),
            )
        )
        if len(results) >= top_results_count:
            break

    return results


def document_exists(document_id: str) -> bool:
    """Whether any chunk is indexed under this documentId - checked before
    a delete so a never-indexed id gets an honest 404."""
    _ensure_schema()
    with _pool.connection() as conn, conn.cursor() as cur:
        cur.execute(queries.DOCUMENT_EXISTS, (document_id,))
        return cur.fetchone() is not None


def list_document_ids() -> list[str]:
    """The id of every document with at least one indexed chunk - lets the backend find
    chunks whose Pitstop content no longer exists."""
    _ensure_schema()
    with _pool.connection() as conn:
        return [row[0] for row in conn.execute(queries.LIST_DOCUMENT_IDS).fetchall()]


def delete_document(document_id: str) -> bool:
    """Removes every chunk belonging to one Pitstop content item, and claims a new generation in the same
    transaction - so an index job that started earlier, on any copy of the service, discards its work
    instead of writing the document back. Returns False when nothing was indexed under this id.
    Safe to repeat, so this retries just like store_chunks_if_current.

    Keyed on documentId rather than the title - the id is the content's own
    id and never changes, while two documents can share a title."""
    last_error: Exception | None = None
    for attempt in range(DELETE_MAX_RETRIES + 1):
        try:
            _ensure_schema()
            with _pool.connection() as conn:
                conn.execute(queries.CLAIM_GENERATION, (document_id,))
                conn.execute(queries.CLEAR_INDEX_JOB, (document_id,))
                return conn.execute(queries.DELETE_BY_DOCUMENT_ID, (document_id,)).rowcount > 0
        except psycopg.Error as error:
            last_error = error

        if attempt < DELETE_MAX_RETRIES:
            time.sleep(DELETE_RETRY_DELAY_SECONDS)
    raise RuntimeError(f"Failed to delete document {document_id} from PostgreSQL: {last_error}") from last_error
