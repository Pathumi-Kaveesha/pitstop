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

"""Smart Search POC service, in Python.

Only handles the AI-heavy part of this feature (PDF chunking, embedding,
vector search). Login and admin-permission checks stay in the Ballerina
backend, which is the only intended caller of this service - it forwards
already-authorized requests here and passes the response straight back to
the browser.
"""

import logging

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool

from chunking import chunk_document
from config import DEFAULT_SEARCH_RESULT_LIMIT, RAW_MATCH_POOL_MULTIPLIER, TASK_TYPE_QUERY, EMBED_REQUEST_SPACING_SECONDS
from embeddings import embed_chunks, embed_text
from vectorstore import search, upsert_chunks

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smart-search-service")

app = FastAPI(title="Pitstop Smart Search (POC)")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/ingest")
async def ingest(request: Request, title: str = Query(..., min_length=1)) -> dict:
    """Reads a PDF from the raw request body, chunks it, embeds each
    chunk, and stores the results in Pinecone."""
    pdf_bytes = await request.body()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="No file content received.")

    # Everything below is blocking, synchronous work (PDF parsing, and a
    # deliberately paced sequence of Gemini/Pinecone calls that can take a
    # while for a long document). Run it in a worker thread rather than
    # directly on the event loop - otherwise the whole server, including
    # unrelated requests like /health or /search, would freeze for the
    # entire duration of one upload.
    try:
        chunks = await run_in_threadpool(chunk_document, pdf_bytes)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="This document produced no chunks worth indexing (too short or unreadable).",
        )

    try:
        vectors = await run_in_threadpool(embed_chunks, [c.text for c in chunks], EMBED_REQUEST_SPACING_SECONDS)
        await run_in_threadpool(upsert_chunks, vectors, [c.text for c in chunks], title, [c.page for c in chunks])
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Failed to index uploaded document")
        raise HTTPException(status_code=500, detail=f"Error while indexing document: {error}") from error

    return {"status": "success", "title": title, "chunksIndexed": len(chunks)}


@app.get("/search")
def search_endpoint(
    userQuery: str = Query(..., min_length=1),
    limit: int = Query(DEFAULT_SEARCH_RESULT_LIMIT, ge=1, le=50),
) -> list[dict]:
    """Embeds the query and returns the closest matching documents, one
    result per document."""
    try:
        query_vector = embed_text(userQuery, TASK_TYPE_QUERY)
        results = search(query_vector, limit, RAW_MATCH_POOL_MULTIPLIER)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail=f"Error while searching: {error}") from error

    return [
        {
            "content": r.content,
            "title": r.title,
            "page": r.page,
            "similarityScore": r.similarity_score,
        }
        for r in results
    ]
