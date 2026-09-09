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

"""Talks directly to Pinecone's REST API to store and search chunk vectors,
and applies the score-based filtering that decides what counts as a real
match. This filtering is pure arithmetic on numbers Pinecone already
returned - nothing here reads or judges the document text itself."""

import uuid
from dataclasses import dataclass

import requests

from config import (
    MAX_SCORE_GAP_FROM_TOP_MATCH,
    MINIMUM_SIMILARITY_SCORE,
    PINECONE_API_KEY,
    PINECONE_SERVICE_URL,
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


def upsert_chunks(vectors: list[list[float]], texts: list[str], title: str, pages: list[int]) -> None:
    """Stores each (vector, text, metadata) triple in Pinecone. Each
    vector gets its own random id - nothing meaningful is encoded in the
    id itself, all the useful info lives in the metadata."""
    records = [
        {
            "id": str(uuid.uuid4()),
            "values": vector,
            "metadata": {"fileName": title, "page": page, "content": text},
        }
        for vector, text, page in zip(vectors, texts, pages)
    ]
    response = requests.post(
        f"{PINECONE_SERVICE_URL}/vectors/upsert",
        headers=_HEADERS,
        json={"vectors": records},
        timeout=30,
    )
    response.raise_for_status()


def search(query_vector: list[float], top_results_count: int, pool_multiplier: int) -> list[SearchResult]:
    """Embeds-and-compares step: pulls a wider pool of raw chunk matches
    than requested (several of the closest chunks often belong to the same
    document), then narrows it down to the top distinct documents."""
    raw_pool_size = top_results_count * pool_multiplier
    response = requests.post(
        f"{PINECONE_SERVICE_URL}/query",
        headers=_HEADERS,
        json={"vector": query_vector, "topK": raw_pool_size, "includeMetadata": True},
        timeout=30,
    )
    response.raise_for_status()
    matches = response.json().get("matches", [])

    # Keep only the single best-scoring chunk per document title. Anything
    # below the noise floor is dropped here - see MINIMUM_SIMILARITY_SCORE
    # in config.py for why that number.
    best_per_document: dict[str, SearchResult] = {}
    for match in matches:
        score = match["score"]
        if score < MINIMUM_SIMILARITY_SCORE:
            continue

        metadata = match.get("metadata", {})
        title = metadata.get("fileName", "Untitled")
        existing = best_per_document.get(title)
        if existing is None or score > existing.similarity_score:
            best_per_document[title] = SearchResult(
                content=metadata.get("content", ""),
                title=title,
                page=metadata.get("page", 1),
                similarity_score=score,
            )

    sorted_results = sorted(best_per_document.values(), key=lambda r: r.similarity_score, reverse=True)

    # On top of the floor already applied above, also drop anything
    # trailing too far behind the single best match of *this* search - see
    # MAX_SCORE_GAP_FROM_TOP_MATCH in config.py for why.
    if sorted_results:
        top_score = sorted_results[0].similarity_score
        sorted_results = [r for r in sorted_results if top_score - r.similarity_score <= MAX_SCORE_GAP_FROM_TOP_MATCH]

    return sorted_results[:top_results_count]


def delete_document(title: str) -> None:
    """Removes every chunk belonging to one document, by title."""
    response = requests.post(
        f"{PINECONE_SERVICE_URL}/vectors/delete",
        headers=_HEADERS,
        json={"filter": {"fileName": {"$eq": title}}},
        timeout=30,
    )
    response.raise_for_status()
