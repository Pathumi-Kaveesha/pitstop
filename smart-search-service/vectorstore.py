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


# Shared pool - a new connection per call doesn't scale under concurrent search and indexing.
_pool = ConnectionPool(POSTGRES_DSN, min_size=1, max_size=10, open=True)

_schema_ready = False
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
            conn.execute(queries.SCHEMA)
        _schema_ready = True


def _vector_literal(vector: list[float]) -> str:
    """Turns a list of numbers into the text form pgvector reads, like [0.1,0.2]."""
    return "[" + ",".join(str(float(value)) for value in vector) + "]"


def upsert_chunks(
    vectors: list[list[float]],
    texts: list[str],
    title: str,
    pages: list[int],
    document_id: str,
    unit_label: str,
    file_extension: str,
    source: str,
    drive_link: str,
    native_links: list[Optional[str]],
    moments: Optional[list[Optional[list[tuple[str, str]]]]] = None,
) -> None:
    """Stores each (vector, text, metadata) triple in PostgreSQL."""
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
    _ensure_schema()
    last_error: Exception | None = None
    for attempt in range(UPSERT_MAX_RETRIES + 1):
        try:
            with _pool.connection() as conn:
                with conn.cursor() as cur:
                    cur.executemany(queries.UPSERT_CHUNK, rows)
            return
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


def find_document_source(document_id: str) -> Optional[tuple[str, str]]:
    """The Drive link and file type recorded for an indexed document, or
    None when nothing is indexed under that id."""
    _ensure_schema()
    with _pool.connection() as conn, conn.cursor() as cur:
        cur.execute(queries.FIND_DOCUMENT_SOURCE, (document_id,))
        row = cur.fetchone()
    if row is None:
        return None
    return row[0], row[1]


def delete_stale_chunks(document_id: str, keep_count: int) -> None:
    """Removes chunks left over from an earlier version of this document -
    the extras from a longer version. Runs after a successful upsert, never before."""
    expected = [f"{document_id}#{index}" for index in range(keep_count)]
    _ensure_schema()
    with _pool.connection() as conn:
        conn.execute(queries.DELETE_STALE_CHUNKS, (document_id, expected))


def delete_by_document_id(document_id: str) -> None:
    """Removes every chunk belonging to one Pitstop content item. Deleting an
    already-deleted or never-indexed id is a safe no-op, so this retries just like upsert_chunks.

    Keyed on documentId rather than the title - the id is the content's own
    id and never changes, while two documents can share a title."""
    _ensure_schema()
    last_error: Exception | None = None
    for attempt in range(DELETE_MAX_RETRIES + 1):
        try:
            with _pool.connection() as conn:
                conn.execute(queries.DELETE_BY_DOCUMENT_ID, (document_id,))
            return
        except psycopg.Error as error:
            last_error = error

        if attempt < DELETE_MAX_RETRIES:
            time.sleep(DELETE_RETRY_DELAY_SECONDS)
    raise RuntimeError(f"Failed to delete document {document_id} from PostgreSQL: {last_error}") from last_error
