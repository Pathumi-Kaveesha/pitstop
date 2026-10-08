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

import hashlib
import logging
import threading
import time

from typing import Optional

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Path, Query, Response
from pydantic import BaseModel, Field
from fastapi.concurrency import run_in_threadpool

from chunking import Chunk, UNIT_LABELS, chunk_document
from deep_links import build_native_links, build_video_timestamp_links
from google_drive import DriveFileInfo, download_drive_file, resolve_drive_file
from web_page import fetch_web_page_text, is_web_page_link
from config import (
    DEFAULT_SEARCH_RESULT_LIMIT,
    DELETE_TOMBSTONE_TTL_SECONDS,
    INDEX_ERROR_TTL_SECONDS,
    MAX_CONCURRENT_INDEX_JOBS,
    MAX_PDF_VIEW_BYTES,
    RAW_MATCH_POOL_MULTIPLIER,
    EMBED_REQUEST_SPACING_SECONDS,
    SEARCH_CACHE_MAX_ENTRIES,
    SEARCH_CACHE_TTL_SECONDS,
)
from embeddings import embed_chunks, embed_text, format_query_text
from generation import generate_answer
from vectorstore import (
    SearchResult,
    delete_by_document_id,
    delete_stale_chunks,
    document_exists,
    find_document_source,
    search,
    upsert_chunks,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smart-search-service")

# No route here checks who's calling - relies on Choreo "Organization" network visibility (not public, but not backend-only either) plus access checks living in the Ballerina backend
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


def _is_tombstoned(document_id: str, since: float) -> bool:
    """Whether an id was deleted at or after `since` - a job's own start
    time, not "now", so a delete still counts no matter how long the job
    that started before it has been running."""
    with _deleted_ids_lock:
        deleted_at = _deleted_content_ids.get(document_id)
    return deleted_at is not None and deleted_at >= since


# document_id -> generation number, bumped when an index or delete job starts, so an older job can tell it's been superseded
_document_generations: dict[str, int] = {}
_document_generations_lock = threading.Lock()


def _bump_generation(document_id: str) -> int:
    """Claims the next generation for a document - call once, right when a job for it starts."""
    with _document_generations_lock:
        next_generation = _document_generations.get(document_id, 0) + 1
        _document_generations[document_id] = next_generation
        return next_generation


def _is_current_generation(document_id: str, generation: int) -> bool:
    """Whether no newer job has started for this document since the caller claimed its generation."""
    with _document_generations_lock:
        return _document_generations.get(document_id, 0) == generation


# document_id -> lock serializing its actual writes/deletes, so two jobs for the same document can never have their remote mutations interleave
_document_mutation_locks: dict[str, threading.Lock] = {}
_document_mutation_locks_meta_lock = threading.Lock()


def _document_mutation_lock(document_id: str) -> threading.Lock:
    """The lock a document's writes/deletes must hold - created once per id, reused after that."""
    with _document_mutation_locks_meta_lock:
        lock = _document_mutation_locks.get(document_id)
        if lock is None:
            lock = threading.Lock()
            _document_mutation_locks[document_id] = lock
        return lock


# document_id -> (when it failed, reason)
_index_errors: dict[str, tuple[float, str]] = {}
_index_errors_lock = threading.Lock()


def _set_index_error(document_id: str, message: str) -> None:
    now = time.time()
    with _index_errors_lock:
        _index_errors[document_id] = (now, message[:300])
        expired = [doc_id for doc_id, (at, _) in _index_errors.items()
                   if now - at > INDEX_ERROR_TTL_SECONDS]
        for doc_id in expired:
            del _index_errors[doc_id]


def _clear_index_error(document_id: str) -> None:
    with _index_errors_lock:
        _index_errors.pop(document_id, None)


# (query, limit) -> (when stored, results). Results are the same for every caller -
# who may see them is decided later, in the backend.
_search_cache: dict[tuple[str, int], tuple[float, list[SearchResult]]] = {}
_search_cache_lock = threading.Lock()


def _find_results(user_query: str, limit: int) -> list[SearchResult]:
    """Looks a query up, reusing a very recent identical lookup."""
    key = (user_query, limit)
    now = time.time()
    with _search_cache_lock:
        cached = _search_cache.get(key)
        if cached and now - cached[0] < SEARCH_CACHE_TTL_SECONDS:
            return cached[1]

    results = search(embed_text(format_query_text(user_query)), user_query, limit, RAW_MATCH_POOL_MULTIPLIER)

    with _search_cache_lock:
        _search_cache[key] = (now, results)
        if len(_search_cache) > SEARCH_CACHE_MAX_ENTRIES:
            for stale_key in [k for k, (at, _) in _search_cache.items() if now - at >= SEARCH_CACHE_TTL_SECONDS]:
                del _search_cache[stale_key]
            while len(_search_cache) > SEARCH_CACHE_MAX_ENTRIES:
                del _search_cache[min(_search_cache, key=lambda k: _search_cache[k][0])]
    return results


def _clear_search_cache() -> None:
    """Forgets every remembered lookup - called when the index changes."""
    with _search_cache_lock:
        _search_cache.clear()


def _forget_results(user_query: str, limit: int) -> None:
    """Drops a remembered lookup once its answer has been written."""
    with _search_cache_lock:
        _search_cache.pop((user_query, limit), None)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


_index_slots = threading.BoundedSemaphore(MAX_CONCURRENT_INDEX_JOBS)


def _run_in_index_slot(job, *args) -> None:
    with _index_slots:
        job(*args)


def _index_drive_file_in_background(
    info: DriveFileInfo, title: str, document_id: str, drive_link: str, job_started_at: float, generation: int,
    display_link: Optional[str] = None
) -> None:
    """Downloads, chunks, embeds and stores one Drive document, run after
    the response has already gone back. Never raises - failures go to the
    log, since there's no caller left to report them to.

    job_started_at/generation are claimed by the caller at accept time, not in here, so a queued task can't miss a delete that lands before it actually starts.

    display_link is set when drive_link is only a stand-in document, read for its text but never itself shown."""
    logger.info("Started indexing '%s' (id %s, %s) - downloading", title, document_id, info.extension)
    _clear_index_error(document_id)  # a fresh attempt - any earlier failure no longer applies

    try:
        file_bytes = download_drive_file(info)
        logger.info("Downloaded '%s' (%.1f MB), chunking", title, len(file_bytes) / 1_048_576)

        # A stand-in doc is read for timestamps instead of headings - only docx actually has them
        extraction_extension = "transcript" if display_link and info.extension == "docx" else info.extension
        chunks, unit_headings = chunk_document(file_bytes, extraction_extension)
        if not chunks:
            logger.warning(
                "Nothing worth indexing in '%s' (id %s) - too short or unreadable", title, document_id
            )
            _set_index_error(document_id, "Nothing worth indexing was found in this file.")
            return

        if _is_tombstoned(document_id, since=job_started_at):
            logger.info("Content %s was deleted before indexing finished - discarding.", document_id)
            return

        if display_link:
            # Also called for LMS/Salesforce transcripts, which just have no timestamps to find
            unit_native_links = build_video_timestamp_links(display_link, unit_headings)
        else:
            unit_native_links = build_native_links(info, unit_headings)
        chunk_native_links = [
            unit_native_links[c.page - 1] if c.page - 1 < len(unit_native_links) else None
            for c in chunks
        ]

        _embed_and_store(
            chunks, title, document_id, job_started_at, generation,
            UNIT_LABELS[extraction_extension], "reference" if display_link else info.extension,
            "drive", display_link or drive_link, chunk_native_links,
        )
    except Exception as error:  # noqa: BLE001 - nobody is left to return an error to
        logger.exception("Background indexing failed for '%s' (id %s)", title, document_id)
        _set_index_error(document_id, str(error) or type(error).__name__)


def _embed_and_store(
    chunks: list[Chunk], title: str, document_id: str, job_started_at: float, generation: int,
    unit_label: str, file_extension: str, source: str, link: str, native_links: list[Optional[str]],
) -> None:
    """Shared tail of every background indexing job: embed, store, and clean up if the content
    was deleted, or re-indexed again by a newer job, while this was running."""
    # Skip the billed embedding calls entirely if a newer job already superseded this one
    if not _is_current_generation(document_id, generation):
        logger.info("Content %s was re-indexed again before this job started embedding - discarding this attempt.", document_id)
        return

    logger.info("Embedding '%s': %d chunks, roughly %d min", title, len(chunks), max(1, len(chunks) // 60))
    vectors = embed_chunks([c.text for c in chunks], title, EMBED_REQUEST_SPACING_SECONDS)

    # Everything below actually touches Pinecone - held for one document at a time, so two jobs'
    # writes/deletes for it can never interleave, only the generation checks they gate on could
    with _document_mutation_lock(document_id):
        # Embedding is slow - a newer job could easily have already finished and written fresher chunks
        if not _is_current_generation(document_id, generation):
            logger.info("Content %s was re-indexed again while this job was embedding - discarding this attempt.", document_id)
            return

        # Chunk ids are derived from the document id, so this overwrites a
        # previous version in place - the old copy stays searchable if the
        # write fails, instead of being deleted up front.
        upsert_chunks(
            vectors, [c.text for c in chunks], title, [c.page for c in chunks],
            document_id, unit_label, file_extension, source, link, native_links,
            [c.moments for c in chunks],
        )

        # Delete may have landed mid-upsert - undo the write if so.
        if _is_tombstoned(document_id, since=job_started_at):
            logger.info("Content %s was deleted while indexing was writing - cleaning up.", document_id)
            delete_by_document_id(document_id)
            _clear_search_cache()
            return

        # Only once the new version is safely stored.
        delete_stale_chunks(document_id, len(chunks))
        _clear_search_cache()
        logger.info("Indexed '%s' (%d chunks, id %s)", title, len(chunks), document_id)


def _index_webpage_in_background(
    title: str, document_id: str, url: str, text: str, job_started_at: float, generation: int
) -> None:
    """Chunks, embeds and stores one webpage's already-extracted text, run after the response
    has already gone back. Never raises - failures go to the log, since there's no caller left
    to report them to.

    job_started_at/generation are claimed by the caller at accept time - see the same note on _index_drive_file_in_background."""
    logger.info("Started indexing '%s' (id %s, webpage) - chunking", title, document_id)
    _clear_index_error(document_id)

    try:
        chunks, _unit_headings = chunk_document(text.encode("utf-8"), "webpage")
        if not chunks:
            logger.warning("Nothing worth indexing in '%s' (id %s) - too short", title, document_id)
            _set_index_error(document_id, "Nothing worth indexing was found on this page.")
            return

        if _is_tombstoned(document_id, since=job_started_at):
            logger.info("Content %s was deleted before indexing finished - discarding.", document_id)
            return

        _embed_and_store(
            chunks, title, document_id, job_started_at, generation,
            UNIT_LABELS["webpage"], "webpage", "web", url, [None] * len(chunks),
        )
    except Exception as error:  # noqa: BLE001 - nobody is left to report an error to
        logger.exception("Background indexing failed for '%s' (id %s)", title, document_id)
        _set_index_error(document_id, str(error) or type(error).__name__)


def _safe_actor(value: Optional[str]) -> str:
    """Strips control characters and caps length, so a caller-supplied value can't forge log lines."""
    cleaned = "".join(ch for ch in (value or "") if ch.isprintable())[:254]
    return cleaned or "unknown"


class IngestDriveLinkRequest(BaseModel):
    driveLink: str
    title: Optional[str] = None
    # Reused as this document's documentId when given, falls back to the
    # Drive file's own id when not. Digits only - rejects garbage outright.
    contentId: Optional[str] = Field(default=None, pattern=r"^[0-9]+$")
    # Set when driveLink is only a stand-in document, read for its text but never itself shown
    displayLink: Optional[str] = None
    # The admin whose action triggered this, for the logs only
    adminEmail: Optional[str] = None


@app.post("/ingest-drive-link")
async def ingest_drive_link(body: IngestDriveLinkRequest, background_tasks: BackgroundTasks) -> dict:
    """Indexes a document from a Google Drive link, or an ordinary public webpage, no local
    copy saved.

    Split either side of the response so document size doesn't affect
    how long this takes to answer: metadata/text is resolved first (fast,
    catches real errors), then chunk/embed/store happens in the
    background - a failure there only reaches the log, not the caller."""
    logger.info("Ingest requested for %s by %s", body.contentId or body.driveLink, _safe_actor(body.adminEmail))
    if is_web_page_link(body.driveLink):
        try:
            page = await run_in_threadpool(fetch_web_page_text, body.driveLink)
        except ValueError as error:
            if body.contentId:
                _set_index_error(body.contentId, str(error))
            raise HTTPException(status_code=400, detail=str(error)) from error
        except RuntimeError as error:
            logger.exception("Could not read webpage for indexing")
            if body.contentId:
                _set_index_error(body.contentId, "Could not read that page.")
            raise HTTPException(status_code=502, detail="Could not read that page.") from error

        title = body.title.strip() if body.title and body.title.strip() else page.title
        document_id = body.contentId or hashlib.sha256(body.driveLink.encode()).hexdigest()[:16]

        # Claimed now, not once the task actually starts, or a delete queued behind it would go unnoticed
        job_started_at = time.time()
        generation = _bump_generation(document_id)
        background_tasks.add_task(
            _run_in_index_slot, _index_webpage_in_background, title, document_id, body.driveLink, page.text,
            job_started_at, generation,
        )

        return {"status": "indexing", "title": title, "documentId": document_id, "fileType": "webpage"}

    try:
        info = await run_in_threadpool(resolve_drive_file, body.driveLink)
    except ValueError as error:
        # Rejected before indexing started, so record it now
        if body.contentId:
            _set_index_error(body.contentId, str(error))
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        logger.exception("Could not read Drive link for indexing")
        if body.contentId:
            _set_index_error(body.contentId, "Could not read that file from Google Drive.")
        raise HTTPException(status_code=502, detail="Could not read that file from Google Drive.") from error

    title = body.title.strip() if body.title and body.title.strip() else info.drive_title
    document_id = body.contentId if body.contentId else info.file_id

    _clear_index_error(document_id)
    # Claimed now, not once the background task actually starts - see the note above.
    job_started_at = time.time()
    generation = _bump_generation(document_id)
    background_tasks.add_task(
        _run_in_index_slot, _index_drive_file_in_background, info, title, document_id, body.driveLink,
        job_started_at, generation, body.displayLink,
    )

    return {
        "status": "indexing",
        "title": title,
        "documentId": document_id,
        "fileType": "reference" if body.displayLink else info.extension,
    }


@app.delete(
    "/documents/{document_id}",
    responses={404: {"model": ErrorResponse, "description": "No indexed chunks found for this document id."}},
)
def delete_document_endpoint(
    document_id: str, x_admin_email: Optional[str] = Header(default=None),
) -> dict:
    """Removes a document's chunks. Marks the id deleted first, so a
    background index for the same id discards its work instead of
    recreating what was just deleted. A never-indexed id gets a 404."""
    logger.info("Delete requested for document %s by %s", document_id, _safe_actor(x_admin_email))
    _tombstone(document_id)
    _bump_generation(document_id)

    # Waits for any in-flight indexing job's own write to finish first, so this can never
    # delete chunks that job is still in the middle of writing.
    with _document_mutation_lock(document_id):
        try:
            existed = document_exists(document_id)
        except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
            logger.exception("Failed to check document %s before deleting", document_id)
            raise HTTPException(status_code=500, detail="Error while deleting document.") from error

        if not existed:
            raise HTTPException(status_code=404, detail=f"No indexed chunks found for document {document_id}.")

        try:
            delete_by_document_id(document_id)
        except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
            logger.exception("Failed to delete document %s", document_id)
            raise HTTPException(status_code=500, detail="Error while deleting document.") from error

    _clear_search_cache()
    logger.info("Removed indexed chunks for document %s", document_id)
    return {"status": "deleted", "documentId": document_id}


@app.get(
    "/documents/{document_id}/file",
    response_class=Response,
    responses={
        200: {"content": {"application/pdf": {}}, "description": "The document's original PDF."},
        404: {"model": ErrorResponse, "description": "No indexed PDF found for this document id."},
        413: {"model": ErrorResponse, "description": "The PDF is too large to open at a page."},
    },
)
def get_document_file(document_id: str = Path(..., pattern=r"^[0-9]+$")) -> Response:
    """Returns an indexed PDF's original file. Drive's own viewer ignores a
    page number in the link, but a browser opening the file from us honours
    "#page=N". PDF only."""
    try:
        source = find_document_source(document_id)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Failed to look up document %s", document_id)
        raise HTTPException(status_code=500, detail="Could not look up the document.") from error

    if source is None or source[1] != "pdf":
        raise HTTPException(status_code=404, detail=f"No indexed PDF found for document {document_id}.")

    try:
        info = resolve_drive_file(source[0])
        if info.size_bytes is not None and info.size_bytes > MAX_PDF_VIEW_BYTES:
            raise HTTPException(status_code=413, detail="This PDF is too large to open at a page.")
        file_bytes = download_drive_file(info, max_bytes=MAX_PDF_VIEW_BYTES)
    except (ValueError, RuntimeError) as error:
        logger.exception("Failed to fetch the PDF for document %s", document_id)
        raise HTTPException(status_code=502, detail="Could not retrieve the document.") from error

    return Response(
        content=file_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'inline; filename="document.pdf"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/documents/{document_id}/status")
def get_document_status(document_id: str = Path(..., pattern=r"^[0-9]+$")) -> dict:
    """Whether a document has indexed pieces, and why its latest attempt failed, if it did."""
    try:
        indexed = document_exists(document_id)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Failed to check indexing status for document %s", document_id)
        raise HTTPException(status_code=500, detail="Could not check indexing status.") from error

    with _index_errors_lock:
        entry = _index_errors.get(document_id)
    error_message = entry[1] if entry else None

    return {"indexed": indexed, "errorMessage": error_message}


@app.get("/search")
def search_endpoint(
    userQuery: str = Query(..., min_length=1),
    limit: int = Query(DEFAULT_SEARCH_RESULT_LIMIT, ge=1, le=50),
    includeAnswer: bool = Query(True),
) -> dict:
    """Tool 1: embeds the query and finds the closest matches by score.
    Tool 2 (generate_answer) then writes an answer, but only runs when
    Tool 1 actually found something to ground it in. includeAnswer=false
    skips Tool 2, so the sources come back without waiting for the model."""
    try:
        results = _find_results(userQuery, limit)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail="Error while searching.") from error

    sources = [
        {
            # A "reference" result's text is a stand-in document's own text - never sent to the browser
            "content": "" if r.file_extension == "reference" else r.content,
            "title": r.title,
            "page": r.page,
            "similarityScore": r.similarity_score,
            "documentId": r.document_id,
            "unitLabel": r.unit_label,
            "fileExtension": r.file_extension,
            "source": r.source,
            "driveLink": r.drive_link,
            "nativeLink": r.native_link or "",
        }
        for r in results
    ]

    if not results or not includeAnswer:
        return {"answer": None, "sources": sources}

    try:
        answer = generate_answer(userQuery, results)
        _forget_results(userQuery, limit)
    except Exception:  # noqa: BLE001 - degrade gracefully rather than fail the search
        logger.exception("Answer generation failed - returning sources without a generated answer")
        answer = None

    return {"answer": answer, "sources": sources}
