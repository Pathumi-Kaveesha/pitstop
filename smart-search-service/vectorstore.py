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

"""Talks to Pinecone's REST API: stores chunk vectors, searches them, and
applies the score-based filtering that decides what counts as a real match."""

import json
import re
from dataclasses import dataclass
from typing import Optional

import requests

import time

from config import (
    EMBEDDING_DIMENSION,
    MAX_CHUNKS_PER_DOCUMENT,
    MAX_SCORE_GAP_FROM_TOP_MATCH,
    MINIMUM_SIMILARITY_SCORE,
    PINECONE_API_KEY,
    PINECONE_SERVICE_URL,
    UPSERT_MAX_RETRIES,
    UPSERT_RETRY_DELAY_SECONDS,
)
from deep_links import with_timestamp
from http_session import make_session

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

_session = make_session()
_delete_session = make_session(retry_read=False)

_HEADERS = {
    "Api-Key": PINECONE_API_KEY,
    "Content-Type": "application/json",
    "X-Pinecone-API-Version": "2025-04",
}


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


# For queries that only filter by documentId - an all-zero vector matches nothing on a cosine index.
_FILTER_ONLY_VECTOR = [1.0] + [0.0] * (EMBEDDING_DIMENSION - 1)


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
    """Stores each (vector, text, metadata) triple in Pinecone."""
    if len({len(vectors), len(texts), len(pages), len(native_links)}) > 1:
        raise ValueError(
            f"Vector/text/page/native_link length mismatch: vectors={len(vectors)}, "
            f"texts={len(texts)}, pages={len(pages)}, native_links={len(native_links)}"
        )
    chunk_moments = moments or [None] * len(vectors)
    records = [
        {
            "id": f"{document_id}#{index}",
            "values": vector,
            "metadata": {
                "fileName": title,
                "page": page,
                "content": text,
                "documentId": document_id,
                "unitLabel": unit_label,
                "fileExtension": file_extension,
                "source": source,
                "driveLink": drive_link,
                # Pinecone can't store null, so "" means no link.
                "nativeLink": native_link or "",
                "moments": json.dumps(entry_moments) if entry_moments else "",
            },
        }
        for index, (vector, text, page, native_link, entry_moments) in enumerate(
            zip(vectors, texts, pages, native_links, chunk_moments)
        )
    ]
    last_error: Exception | None = None
    for attempt in range(UPSERT_MAX_RETRIES + 1):
        try:
            response = _session.post(
                f"{PINECONE_SERVICE_URL}/vectors/upsert",
                headers=_HEADERS,
                json={"vectors": records},
                timeout=30,
            )
            response.raise_for_status()
            return
        except requests.exceptions.HTTPError as error:
            last_error = error
            status = error.response.status_code if error.response is not None else None
            if status is not None and status != 429 and status < 500:
                break
        except requests.exceptions.RequestException as error:
            last_error = error

        if attempt < UPSERT_MAX_RETRIES:
            time.sleep(UPSERT_RETRY_DELAY_SECONDS)
    raise RuntimeError(f"Failed to store chunks in Pinecone: {last_error}") from last_error


def search(
    query_vector: list[float], query_text: str, top_results_count: int, pool_multiplier: int
) -> list[SearchResult]:
    """Pulls a wider pool of raw matches than requested, then narrows it
    down to the strongest ones, allowing up to MAX_CHUNKS_PER_DOCUMENT
    from the same document."""
    query_words = _query_words(query_text)
    raw_pool_size = top_results_count * pool_multiplier
    response = _session.post(
        f"{PINECONE_SERVICE_URL}/query",
        headers=_HEADERS,
        json={"vector": query_vector, "topK": raw_pool_size, "includeMetadata": True},
        timeout=30,
    )
    response.raise_for_status()
    matches = response.json().get("matches", [])

    candidates = [m for m in matches if m["score"] >= MINIMUM_SIMILARITY_SCORE]
    if not candidates:
        return []

    candidates.sort(key=lambda m: m["score"], reverse=True)

    top_score = candidates[0]["score"]
    candidates = [m for m in candidates if top_score - m["score"] <= MAX_SCORE_GAP_FROM_TOP_MATCH]

    chunks_used_per_document: dict[str, int] = {}
    results: list[SearchResult] = []
    for match in candidates:
        metadata = match.get("metadata", {})
        title = metadata.get("fileName", "Untitled")
        document_key = metadata.get("documentId") or title
        used = chunks_used_per_document.get(document_key, 0)
        if used >= MAX_CHUNKS_PER_DOCUMENT:
            continue
        chunks_used_per_document[document_key] = used + 1

        results.append(
            SearchResult(
                content=metadata.get("content", ""),
                title=title,
                page=metadata.get("page", 1),
                similarity_score=match["score"],
                document_id=metadata.get("documentId", ""),
                unit_label=metadata.get("unitLabel", "Page"),
                file_extension=metadata.get("fileExtension", "pdf"),
                source=metadata.get("source", "upload"),
                drive_link=metadata.get("driveLink", ""),
                native_link=_best_native_link(metadata, metadata.get("driveLink", ""), query_words),
            )
        )
        if len(results) >= top_results_count:
            break

    return results


def delete_document(title: str) -> None:
    """Removes every chunk belonging to one document, by title."""
    response = _delete_session.post(
        f"{PINECONE_SERVICE_URL}/vectors/delete",
        headers=_HEADERS,
        json={"filter": {"fileName": {"$eq": title}}},
        timeout=30,
    )
    response.raise_for_status()


def document_exists(document_id: str) -> bool:
    """Whether any chunk is indexed under this documentId - checked before
    a delete so a never-indexed id gets an honest 404."""
    response = _session.post(
        f"{PINECONE_SERVICE_URL}/query",
        headers=_HEADERS,
        json={
            "vector": _FILTER_ONLY_VECTOR,
            "topK": 1,
            "filter": {"documentId": {"$eq": document_id}},
        },
        timeout=30,
    )
    response.raise_for_status()
    return len(response.json().get("matches", [])) > 0


def find_document_source(document_id: str) -> Optional[tuple[str, str]]:
    """The Drive link and file type recorded for an indexed document, or
    None when nothing is indexed under that id."""
    response = _session.post(
        f"{PINECONE_SERVICE_URL}/query",
        headers=_HEADERS,
        json={
            "vector": _FILTER_ONLY_VECTOR,
            "topK": 1,
            "includeMetadata": True,
            "filter": {"documentId": {"$eq": document_id}},
        },
        timeout=30,
    )
    response.raise_for_status()
    matches = response.json().get("matches", [])
    if not matches:
        return None
    metadata = matches[0].get("metadata", {})
    return metadata.get("driveLink", ""), metadata.get("fileExtension", "")


def delete_stale_chunks(document_id: str, keep_count: int) -> None:
    """Removes chunks left over from an earlier version of this document -
    both extras from a longer version and any written before chunk ids
    became predictable. Runs after a successful upsert, never before."""
    expected = {f"{document_id}#{index}" for index in range(keep_count)}

    # Deterministic ids all share this prefix - list() enumerates every one
    # of them via pagination, with no cap on how many chunks a document has.
    all_ids: set[str] = set()
    pagination_token = None
    while True:
        params = {"prefix": f"{document_id}#", "limit": 100}
        if pagination_token:
            params["paginationToken"] = pagination_token
        response = _session.get(
            f"{PINECONE_SERVICE_URL}/vectors/list",
            headers=_HEADERS,
            params=params,
            timeout=30,
        )
        response.raise_for_status()
        page = response.json()
        all_ids.update(v["id"] for v in page.get("vectors", []))
        pagination_token = page.get("pagination", {}).get("next")
        if not pagination_token:
            break

    # Best-effort catch-all for chunks written before ids became
    # predictable (random uuids, so list()'s prefix match can't find them).
    response = _session.post(
        f"{PINECONE_SERVICE_URL}/query",
        headers=_HEADERS,
        json={
            "vector": _FILTER_ONLY_VECTOR,
            "topK": 1000,
            "includeMetadata": False,
            "filter": {"documentId": {"$eq": document_id}},
        },
        timeout=30,
    )
    response.raise_for_status()
    all_ids.update(m["id"] for m in response.json().get("matches", []))

    stale = [vid for vid in all_ids if vid not in expected]
    if not stale:
        return

    for i in range(0, len(stale), 1000):
        batch = stale[i:i + 1000]
        response = _delete_session.post(
            f"{PINECONE_SERVICE_URL}/vectors/delete",
            headers=_HEADERS,
            json={"ids": batch},
            timeout=30,
        )
        response.raise_for_status()

def delete_by_document_id(document_id: str) -> None:
    """Removes every chunk belonging to one Pitstop content item.

    Keyed on documentId rather than the title - the id is the content's own
    id and never changes, while two documents can share a title."""
    response = _delete_session.post(
        f"{PINECONE_SERVICE_URL}/vectors/delete",
        headers=_HEADERS,
        json={"filter": {"documentId": {"$eq": document_id}}},
        timeout=30,
    )
    response.raise_for_status()
