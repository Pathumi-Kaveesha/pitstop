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

import uuid
from dataclasses import dataclass

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
) -> None:
    """Stores each (vector, text, metadata) triple in Pinecone."""
    records = [
        {
            "id": str(uuid.uuid4()),
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
            },
        }
        for vector, text, page in zip(vectors, texts, pages)
    ]
    last_error: Exception | None = None
    for attempt in range(UPSERT_MAX_RETRIES + 1):
        try:
            response = requests.post(
                f"{PINECONE_SERVICE_URL}/vectors/upsert",
                headers=_HEADERS,
                json={"vectors": records},
                timeout=30,
            )
            response.raise_for_status()
            return
        except requests.exceptions.RequestException as error:
            last_error = error
            if attempt < UPSERT_MAX_RETRIES:
                time.sleep(UPSERT_RETRY_DELAY_SECONDS)
    raise RuntimeError(f"Failed to store chunks in Pinecone: {last_error}") from last_error


def search(query_vector: list[float], top_results_count: int, pool_multiplier: int) -> list[SearchResult]:
    """Pulls a wider pool of raw matches than requested, then narrows it
    down to the strongest ones, allowing up to MAX_CHUNKS_PER_DOCUMENT
    from the same document."""
    raw_pool_size = top_results_count * pool_multiplier
    response = requests.post(
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
            )
        )
        if len(results) >= top_results_count:
            break

    return results


def delete_document(title: str) -> None:
    """Removes every chunk belonging to one document, by title."""
    response = requests.post(
        f"{PINECONE_SERVICE_URL}/vectors/delete",
        headers=_HEADERS,
        json={"filter": {"fileName": {"$eq": title}}},
        timeout=30,
    )
    response.raise_for_status()


def document_exists(document_id: str) -> bool:
    """Whether any chunk is indexed under this documentId - checked before
    a delete so a never-indexed id gets an honest 404."""
    response = requests.post(
        f"{PINECONE_SERVICE_URL}/query",
        headers=_HEADERS,
        json={
            "vector": [0.0] * EMBEDDING_DIMENSION,
            "topK": 1,
            "filter": {"documentId": {"$eq": document_id}},
        },
        timeout=30,
    )
    response.raise_for_status()
    return len(response.json().get("matches", [])) > 0


def delete_by_document_id(document_id: str) -> None:
    """Removes every chunk belonging to one Pitstop content item.

    Keyed on documentId rather than the title - the id is the content's own
    id and never changes, while two documents can share a title."""
    response = requests.post(
        f"{PINECONE_SERVICE_URL}/vectors/delete",
        headers=_HEADERS,
        json={"filter": {"documentId": {"$eq": document_id}}},
        timeout=30,
    )
    response.raise_for_status()
