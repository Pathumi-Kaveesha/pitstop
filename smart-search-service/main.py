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

"""Smart Search POC service, in Python. Handles chunking, embedding and
vector search; login and admin checks stay in the Ballerina backend."""

import logging
import threading
import time

from typing import Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from fastapi.concurrency import run_in_threadpool

from chunking import UNIT_LABELS, chunk_document
from google_drive import DriveFileInfo, download_drive_file, resolve_drive_file
from config import (
    DEFAULT_SEARCH_RESULT_LIMIT,
    DELETE_TOMBSTONE_TTL_SECONDS,
    RAW_MATCH_POOL_MULTIPLIER,
    EMBED_REQUEST_SPACING_SECONDS,
)
from embeddings import embed_chunks, embed_text, format_query_text
from generation import generate_answer
from vectorstore import (
    delete_by_document_id,
    delete_stale_chunks,
    document_exists,
    search,
    upsert_chunks,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smart-search-service")

app = FastAPI(title="Pitstop Smart Search (POC)")


class ErrorResponse(BaseModel):
    detail: str


# document_id -> when it was deleted
_deleted_content_ids: dict[str, float] = {}
_deleted_ids_lock = threading.Lock()


def _tombstone(document_id: str) -> None:
    """Marks an id deleted, and opportunistically forgets expired ones."""
    now = time.time()
    with _deleted_ids_lock:
        _deleted_content_ids[document_id] = now
        expired = [doc_id for doc_id, at in _deleted_content_ids.items()
                   if now - at > DELETE_TOMBSTONE_TTL_SECONDS]
        for doc_id in expired:
            del _deleted_content_ids[doc_id]


def _is_tombstoned(document_id: str) -> bool:
    """Whether an id was deleted recently enough to still matter."""
    with _deleted_ids_lock:
        deleted_at = _deleted_content_ids.get(document_id)
    return deleted_at is not None and time.time() - deleted_at <= DELETE_TOMBSTONE_TTL_SECONDS


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


async def _chunk_embed_and_store(
    file_bytes: bytes, extension: str, title: str, document_id: str, source: str, drive_link: str = ""
) -> dict:
    """Chunks a document, embeds each chunk, and stores the results in
    Pinecone."""
    try:
        chunks = await run_in_threadpool(chunk_document, file_bytes, extension)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    if not chunks:
        raise HTTPException(
            status_code=400,
            detail="This document produced no chunks worth indexing (too short or unreadable).",
        )

    try:
        vectors = await run_in_threadpool(embed_chunks, [c.text for c in chunks], title, EMBED_REQUEST_SPACING_SECONDS)
        await run_in_threadpool(
            upsert_chunks,
            vectors,
            [c.text for c in chunks],
            title,
            [c.page for c in chunks],
            document_id,
            UNIT_LABELS[extension],
            extension,
            source,
            drive_link,
        )
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Failed to index document")
        raise HTTPException(status_code=500, detail=f"Error while indexing document: {error}") from error

    return {"status": "success", "title": title, "chunksIndexed": len(chunks)}


def _index_drive_file_in_background(
    info: DriveFileInfo, title: str, document_id: str, drive_link: str
) -> None:
    """Downloads, chunks, embeds and stores one Drive document, run after
    the response has already gone back. Never raises - failures go to the
    log, since there's no caller left to report them to."""
    logger.info("Started indexing '%s' (id %s, %s) - downloading", title, document_id, info.extension)

    try:
        file_bytes = download_drive_file(info)
        logger.info("Downloaded '%s' (%.1f MB), chunking", title, len(file_bytes) / 1_048_576)

        chunks = chunk_document(file_bytes, info.extension)
        if not chunks:
            logger.warning(
                "Nothing worth indexing in '%s' (id %s) - too short or unreadable", title, document_id
            )
            return

        if _is_tombstoned(document_id):
            logger.info("Content %s was deleted before indexing finished - discarding.", document_id)
            return

        logger.info("Embedding '%s': %d chunks, roughly %d min", title, len(chunks), max(1, len(chunks) // 60))
        vectors = embed_chunks([c.text for c in chunks], title, EMBED_REQUEST_SPACING_SECONDS)

        # Chunk ids are derived from the document id, so this overwrites a
        # previous version in place - the old copy stays searchable if the
        # write fails, instead of being deleted up front.
        upsert_chunks(
            vectors,
            [c.text for c in chunks],
            title,
            [c.page for c in chunks],
            document_id,
            UNIT_LABELS[info.extension],
            info.extension,
            "drive",
            drive_link,
        )

        # Delete may have landed mid-upsert - undo the write if so.
        if _is_tombstoned(document_id):
            logger.info("Content %s was deleted while indexing was writing - cleaning up.", document_id)
            delete_by_document_id(document_id)
            return

        # Only once the new version is safely stored.
        delete_stale_chunks(document_id, len(chunks))
        logger.info("Indexed '%s' (%d chunks, id %s)", title, len(chunks), document_id)
    except Exception:  # noqa: BLE001 - nobody is left to return an error to
        logger.exception("Background indexing failed for '%s' (id %s)", title, document_id)


class IngestDriveLinkRequest(BaseModel):
    driveLink: str
    title: Optional[str] = None
    # Reused as this document's documentId when given, falls back to the
    # Drive file's own id when not. Digits only - rejects garbage outright.
    contentId: Optional[str] = Field(default=None, pattern=r"^[0-9]+$")


@app.post("/ingest-drive-link")
async def ingest_drive_link(body: IngestDriveLinkRequest, background_tasks: BackgroundTasks) -> dict:
    """Indexes a document from a Google Drive link, no local copy saved.

    Split either side of the response so document size doesn't affect
    how long this takes to answer: metadata is resolved first (fast,
    catches real errors), then download/chunk/embed/store happens in the
    background - a failure there only reaches the log, not the caller."""
    try:
        info = await run_in_threadpool(resolve_drive_file, body.driveLink)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    title = body.title.strip() if body.title and body.title.strip() else info.drive_title
    document_id = body.contentId if body.contentId else info.file_id

    background_tasks.add_task(
        _index_drive_file_in_background, info, title, document_id, body.driveLink
    )

    return {
        "status": "indexing",
        "title": title,
        "documentId": document_id,
        "fileType": info.extension,
    }


@app.delete(
    "/documents/{document_id}",
    responses={404: {"model": ErrorResponse, "description": "No indexed chunks found for this document id."}},
)
def delete_document_endpoint(document_id: str) -> dict:
    """Removes a document's chunks. Marks the id deleted first, so a
    background index for the same id discards its work instead of
    recreating what was just deleted. A never-indexed id gets a 404."""
    _tombstone(document_id)

    try:
        existed = document_exists(document_id)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Failed to check document %s before deleting", document_id)
        raise HTTPException(status_code=500, detail=f"Error while deleting document: {error}") from error

    if not existed:
        raise HTTPException(status_code=404, detail=f"No indexed chunks found for document {document_id}.")

    try:
        delete_by_document_id(document_id)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Failed to delete document %s", document_id)
        raise HTTPException(status_code=500, detail=f"Error while deleting document: {error}") from error

    logger.info("Removed indexed chunks for document %s", document_id)
    return {"status": "deleted", "documentId": document_id}


@app.get("/search")
def search_endpoint(
    userQuery: str = Query(..., min_length=1),
    limit: int = Query(DEFAULT_SEARCH_RESULT_LIMIT, ge=1, le=50),
) -> dict:
    """Tool 1: embeds the query and finds the closest matches by score.
    Tool 2 (generate_answer) then writes an answer, but only runs when
    Tool 1 actually found something to ground it in."""
    try:
        query_vector = embed_text(format_query_text(userQuery))
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
            "unitLabel": r.unit_label,
            "fileExtension": r.file_extension,
            "source": r.source,
            "driveLink": r.drive_link,
        }
        for r in results
    ]

    if not results:
        return {"answer": None, "sources": []}

    try:
        answer = generate_answer(userQuery, results)
    except Exception:  # noqa: BLE001 - degrade gracefully rather than fail the search
        logger.exception("Answer generation failed - returning sources without a generated answer")
        answer = None

    return {"answer": answer, "sources": sources}
