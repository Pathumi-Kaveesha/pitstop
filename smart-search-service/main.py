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
import uuid

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse

from chunking import chunk_document
from config import (
    DEFAULT_SEARCH_RESULT_LIMIT,
    RAW_MATCH_POOL_MULTIPLIER,
    TASK_TYPE_QUERY,
    EMBED_REQUEST_SPACING_SECONDS,
    UPLOADED_PDFS_DIR,
)
from embeddings import embed_chunks, embed_text
from generation import generate_answer
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

    # A fresh, random id for this specific upload - used both to tag every
    # chunk that comes from it (so a search result can point back to the
    # right file) and as the saved file's name on disk.
    document_id = str(uuid.uuid4())
    await run_in_threadpool((UPLOADED_PDFS_DIR / f"{document_id}.pdf").write_bytes, pdf_bytes)

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
        await run_in_threadpool(
            upsert_chunks, vectors, [c.text for c in chunks], title, [c.page for c in chunks], document_id
        )
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Failed to index uploaded document")
        raise HTTPException(status_code=500, detail=f"Error while indexing document: {error}") from error

    return {"status": "success", "title": title, "chunksIndexed": len(chunks)}


@app.get("/search")
def search_endpoint(
    userQuery: str = Query(..., min_length=1),
    limit: int = Query(DEFAULT_SEARCH_RESULT_LIMIT, ge=1, le=50),
) -> dict:
    """Tool 1 (search): embeds the query and finds the closest matching
    documents, purely by similarity score - unchanged by Tool 2 below.

    Tool 2 (generate_answer): only ever runs on chunks Tool 1 already
    decided are real matches. If Tool 1 finds nothing, Tool 2 is skipped
    entirely - there's nothing grounded to answer from, and calling an LLM
    with no real context risks it guessing instead of saying so."""
    try:
        query_vector = embed_text(userQuery, TASK_TYPE_QUERY)
        results = search(query_vector, limit, RAW_MATCH_POOL_MULTIPLIER)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail=f"Error while searching: {error}") from error

    sources = [
        {
            "content": r.content,
            "title": r.title,
            "page": r.page,
            "similarityScore": r.similarity_score,
            "documentId": r.document_id,
        }
        for r in results
    ]

    if not results:
        return {"answer": None, "sources": []}

    # Tool 1 already succeeded at this point - real matches were found.
    # If Tool 2 fails (e.g. a transient error on Gemini's side), that
    # shouldn't take down the whole search: the matching documents are
    # still genuinely useful on their own, so they're returned with no
    # answer rather than failing the request entirely.
    try:
        answer = generate_answer(userQuery, results)
    except Exception:  # noqa: BLE001 - degrade gracefully rather than fail the search
        logger.exception("Answer generation failed - returning sources without a generated answer")
        answer = None

    return {"answer": answer, "sources": sources}


@app.get("/documents/{document_id}")
def get_document(document_id: str):
    """Serves back the original uploaded PDF for a search result, so a
    match can be opened and checked against the real document instead of
    just trusted from a snippet.

    document_id comes straight from the URL, so it's validated as a real
    UUID before it's ever combined with a file path - otherwise a crafted
    id like "../../some/other/file" could be used to read files outside
    of uploaded_pdfs/ (a path traversal attack)."""
    try:
        uuid.UUID(document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document id.")

    file_path = UPLOADED_PDFS_DIR / f"{document_id}.pdf"
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document not found.")

    return FileResponse(file_path, media_type="application/pdf")
