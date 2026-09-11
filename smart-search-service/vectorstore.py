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
    MAX_CHUNKS_PER_DOCUMENT,
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
    document_id: str
    unit_label: str
    file_extension: str


def upsert_chunks(
    vectors: list[list[float]],
    texts: list[str],
    title: str,
    pages: list[int],
    document_id: str,
    unit_label: str,
    file_extension: str,
) -> None:
    """Stores each (vector, text, metadata) triple in Pinecone. Each
    vector gets its own random id - nothing meaningful is encoded in the
    id itself, all the useful info lives in the metadata. document_id is
    the same for every chunk of one upload - it's how a search result
    later points back to the actual saved file (see main.py's
    /documents/{document_id}). unit_label and file_extension travel with
    every chunk so a result can say "Slide 7" rather than "Page 7", and so
    the browser knows which kind of file it is about to render."""
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
            },
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
    than requested, then narrows it down to the strongest, most relevant
    ones - allowing more than one chunk from the same document through
    (up to MAX_CHUNKS_PER_DOCUMENT), since a document can genuinely be
    relevant in more than one place and Tool 2 needs to see all of the
    real matches to answer completely, not just whichever single passage
    happened to score highest."""
    raw_pool_size = top_results_count * pool_multiplier
    response = requests.post(
        f"{PINECONE_SERVICE_URL}/query",
        headers=_HEADERS,
        json={"vector": query_vector, "topK": raw_pool_size, "includeMetadata": True},
        timeout=30,
    )
    response.raise_for_status()
    matches = response.json().get("matches", [])

    # Drop anything below the noise floor - see MINIMUM_SIMILARITY_SCORE
    # in config.py for why that number.
    candidates = [m for m in matches if m["score"] >= MINIMUM_SIMILARITY_SCORE]
    if not candidates:
        return []

    # Pinecone already returns matches sorted by score, but sort explicitly
    # so the "top score" used just below is reliable regardless.
    candidates.sort(key=lambda m: m["score"], reverse=True)

    # Drop anything trailing too far behind the single best match of *this*
    # search - see MAX_SCORE_GAP_FROM_TOP_MATCH in config.py for why. This
    # compares against the best score across *all* candidates, not per
    # document, so a document's second-best chunk is judged the same way
    # a different document's only chunk would be.
    top_score = candidates[0]["score"]
    candidates = [m for m in candidates if top_score - m["score"] <= MAX_SCORE_GAP_FROM_TOP_MATCH]

    # Walk down the survivors in score order, keeping up to
    # MAX_CHUNKS_PER_DOCUMENT chunks per document title rather than only
    # ever the single best one.
    chunks_used_per_document: dict[str, int] = {}
    results: list[SearchResult] = []
    for match in candidates:
        metadata = match.get("metadata", {})
        title = metadata.get("fileName", "Untitled")
        used = chunks_used_per_document.get(title, 0)
        if used >= MAX_CHUNKS_PER_DOCUMENT:
            continue
        chunks_used_per_document[title] = used + 1

        results.append(
            SearchResult(
                content=metadata.get("content", ""),
                title=title,
                page=metadata.get("page", 1),
                similarity_score=match["score"],
                document_id=metadata.get("documentId", ""),
                unit_label=metadata.get("unitLabel", "Page"),
                file_extension=metadata.get("fileExtension", "pdf"),
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
