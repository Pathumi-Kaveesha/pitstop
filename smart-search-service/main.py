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

"""Smart Search service, in Python. Handles chunking, embedding and
vector search; login and admin checks stay in the Ballerina backend."""

import hashlib
import logging
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import asynccontextmanager

from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query
from pydantic import BaseModel, Field
from fastapi.concurrency import run_in_threadpool

from auth import verify_caller
from chunking import Chunk, UNIT_LABELS, chunk_document
from deep_links import build_native_links, build_video_timestamp_links
from google_drive import DriveFileInfo, download_drive_file, resolve_drive_file
from web_page import fetch_web_page_text, is_web_page_link
from config import (
    DEFAULT_SEARCH_RESULT_LIMIT,
    INDEX_ERROR_TTL_SECONDS,
    INDEX_HEARTBEAT_SECONDS,
    INDEX_STALE_AFTER_SECONDS,
    LARGE_FILE_EXCLUSIVE_THRESHOLD_BYTES,
    MAX_CONCURRENT_INDEX_JOBS,
    RAW_MATCH_POOL_MULTIPLIER,
    EMBED_REQUEST_SPACING_SECONDS,
    SEARCH_CACHE_MAX_ENTRIES,
    SEARCH_CACHE_TTL_SECONDS,
)
from embeddings import embed_chunks, embed_text, format_query_text
from generation import generate_answer
from vectorstore import (
    SearchResult,
    claim_generation,
    delete_document,
    document_exists,
    clear_stale_index_job,
    finish_index_job,
    is_current_generation,
    is_index_job_stale,
    list_document_ids,
    search,
    start_index_job,
    store_chunks_if_current,
    touch_index_job,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smart-search-service")

# Index jobs run in a small pool of their own. Waiting jobs then sit in a queue, and don't each hold a worker thread
# of the pool that search, status and every other request share - a long queue used to starve those.
_index_executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_INDEX_JOBS, thread_name_prefix="index-job")


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    yield
    # Jobs still waiting are dropped, so a restart doesn't wait out the whole queue; a running job is left to finish.
    _index_executor.shutdown(wait=False, cancel_futures=True)


# Network visibility is Choreo's "Project" level (only components in this project can reach it, not just the backend), so every
# route also runs verify_caller, which checks the user's token the backend forwards. Who may see which result is still decided in the backend.
app = FastAPI(title="Pitstop Smart Search", dependencies=[Depends(verify_caller)], lifespan=_lifespan)


class ErrorResponse(BaseModel):
    detail: str


# document_id -> (when it failed, reason)
_index_errors: dict[str, tuple[float, str]] = {}
_index_errors_lock = threading.Lock()


def _friendly_index_error(error: Exception) -> str:
    """Turns a raised error into something a non-technical admin can read."""
    if isinstance(error, ValueError):
        return str(error) or "This content can't be indexed."

    message = str(error)
    lowered = message.lower()
    if "429" in message or "too many requests" in lowered or "rate limit" in lowered:
        return ("Hit Google's usage limit while indexing. Use the Retry action to try "
                "this content again once the limit clears.")
    if "timed out" in lowered or "timeout" in lowered:
        return "Indexing timed out partway through. Try again in a moment."
    if "connection" in lowered or "network" in lowered:
        return "A network problem interrupted indexing. Try again in a moment."

    return "Something went wrong while indexing this. Try again, and let the team know if it keeps happening."


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
_exclusive_acquire_lock = threading.Lock()  # stops two exclusive acquires from deadlocking each other


def _run_in_index_slot(job, *args) -> None:
    with _index_slots:
        job(*args)


def _run_in_index_slot_exclusive(job, *args) -> None:
    """Claims every slot, so a large file's memory use is never multiplied by concurrent jobs."""
    with _exclusive_acquire_lock:
        for _ in range(MAX_CONCURRENT_INDEX_JOBS):
            _index_slots.acquire()
    try:
        job(*args)
    finally:
        for _ in range(MAX_CONCURRENT_INDEX_JOBS):
            _index_slots.release()


INTERRUPTED_INDEX_MESSAGE = (
    "Indexing was interrupted before it finished - the service restarted or ran out of memory. "
    "Use Retry, and if it keeps happening the file may be too large."
)


def _best_effort(action, *args, quiet: bool = False) -> None:
    """Runs a bookkeeping step that must never stop an index job - a failure is only logged."""
    try:
        action(*args)
    except Exception:  # noqa: BLE001 - the job itself matters more than this record of it
        if quiet:
            logger.debug("Index job bookkeeping step %s failed", action.__name__, exc_info=True)
        else:
            logger.warning("Index job bookkeeping step %s failed", action.__name__, exc_info=True)


async def _record_ingest_rejection(content_id: Optional[str], message: str) -> None:
    """Remembers why a request was turned away before indexing, and drops any older dead job's mark so it can't override this."""
    if not content_id:
        return
    _set_index_error(content_id, message)
    try:
        await run_in_threadpool(clear_stale_index_job, content_id, INDEX_STALE_AFTER_SECONDS)
    except Exception:  # noqa: BLE001 - the rejection itself still has to reach the caller
        logger.warning(
            "Could not clear an old index job mark for document %s", _safe_log_value(content_id), exc_info=True
        )


def _keep_job_marked_alive(document_id: str, generation: int, stop: threading.Event) -> None:
    while not stop.wait(INDEX_HEARTBEAT_SECONDS):
        _best_effort(touch_index_job, document_id, generation, quiet=True)


def _run_tracked(runner, job, document_id: str, generation: int, *args) -> None:
    """Runs an index job while it keeps a mark in the database fresh, so a crash can be told from a slow job."""
    stop = threading.Event()
    _best_effort(start_index_job, document_id, generation)
    threading.Thread(target=_keep_job_marked_alive, args=(document_id, generation, stop), daemon=True).start()
    try:
        runner(job, *args)
    finally:
        stop.set()
        _best_effort(finish_index_job, document_id, generation)


def _log_crashed_job(future: Future) -> None:
    if not future.cancelled() and future.exception() is not None:
        logger.error("An index job crashed", exc_info=future.exception())


def _submit_index_job(*job) -> None:
    """Queues an index job. At most MAX_CONCURRENT_INDEX_JOBS run at once, and the rest wait their turn."""
    _index_executor.submit(*job).add_done_callback(_log_crashed_job)


def _index_job_interrupted(document_id: str) -> bool:
    try:
        return is_index_job_stale(document_id, INDEX_STALE_AFTER_SECONDS)
    except Exception:  # noqa: BLE001 - a failed check must not break the status call
        logger.warning(
            "Could not check whether indexing for document %s was interrupted", _safe_log_value(document_id), exc_info=True
        )
        return False


def _index_drive_file_in_background(
    info: DriveFileInfo, title: str, document_id: str, drive_link: str, generation: int,
    display_link: Optional[str] = None
) -> None:
    """Downloads, chunks, embeds and stores one Drive document, run after
    the response has already gone back. Never raises - failures go to the
    log, since there's no caller left to report them to.

    generation is claimed by the caller at accept time, not in here, so a queued task can't miss a delete that lands before it actually starts.

    display_link is set when drive_link is only a stand-in document, read for its text but never itself shown."""
    logger.info("Started indexing '%s' (id %s, %s) - downloading", _safe_log_value(title), document_id, info.extension)
    _clear_index_error(document_id)  # a fresh attempt - any earlier failure no longer applies

    try:
        # Unknown size (native Google files) shares the normal slot pool, so cap its download too.
        file_bytes = (
            download_drive_file(info, max_bytes=LARGE_FILE_EXCLUSIVE_THRESHOLD_BYTES)
            if info.size_bytes is None
            else download_drive_file(info)
        )
        logger.info("Downloaded '%s' (%.1f MB), chunking", _safe_log_value(title), len(file_bytes) / 1_048_576)

        # A stand-in doc is read for timestamps instead of headings - only docx actually has them
        extraction_extension = "transcript" if display_link and info.extension == "docx" else info.extension
        chunks, unit_headings = chunk_document(file_bytes, extraction_extension)
        if not chunks:
            logger.warning(
                "Nothing worth indexing in '%s' (id %s) - too short or unreadable", _safe_log_value(title), document_id
            )
            _set_index_error(document_id, "Nothing worth indexing was found in this file.")
            return

        if not is_current_generation(document_id, generation):
            logger.info("Content %s was deleted or re-indexed before indexing finished - discarding.", document_id)
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
            chunks, title, document_id, generation,
            UNIT_LABELS[extraction_extension], "reference" if display_link else info.extension,
            "drive", display_link or drive_link, chunk_native_links,
        )
    except Exception as error:  # noqa: BLE001 - nobody is left to return an error to
        logger.exception("Background indexing failed for '%s' (id %s)", _safe_log_value(title), document_id)
        _set_index_error(document_id, _friendly_index_error(error))


def _embed_and_store(
    chunks: list[Chunk], title: str, document_id: str, generation: int,
    unit_label: str, file_extension: str, source: str, link: str, native_links: list[Optional[str]],
) -> None:
    """Shared tail of every background indexing job: embed, then store - unless the content was
    deleted, or re-indexed again by a newer job, while this was running."""
    # Skip the billed embedding calls entirely if a newer job already superseded this one
    if not is_current_generation(document_id, generation):
        logger.info("Content %s was deleted or re-indexed before this job started embedding - discarding this attempt.", document_id)
        return

    logger.info(
        "Embedding '%s': %d chunks, roughly %d min", _safe_log_value(title), len(chunks), max(1, len(chunks) // 60)
    )
    vectors = embed_chunks([c.text for c in chunks], title, EMBED_REQUEST_SPACING_SECONDS)

    # Embedding is slow - a delete or newer job could easily have landed meanwhile, on any copy of the
    # service. The check and the write happen together in the database, so none can slip in between.
    stored = store_chunks_if_current(
        vectors, [c.text for c in chunks], title, [c.page for c in chunks],
        document_id, generation, unit_label, file_extension, source, link, native_links,
        [c.moments for c in chunks],
    )
    if not stored:
        logger.info("Content %s was deleted or re-indexed while this job was embedding - discarding this attempt.", document_id)
        return

    _clear_search_cache()
    logger.info("Indexed '%s' (%d chunks, id %s)", _safe_log_value(title), len(chunks), document_id)


def _index_webpage_in_background(
    title: str, document_id: str, url: str, text: str, generation: int
) -> None:
    """Chunks, embeds and stores one webpage's already-extracted text, run after the response
    has already gone back. Never raises - failures go to the log, since there's no caller left
    to report them to.

    generation is claimed by the caller at accept time - see the same note on _index_drive_file_in_background."""
    logger.info("Started indexing '%s' (id %s, webpage) - chunking", _safe_log_value(title), document_id)
    _clear_index_error(document_id)

    try:
        chunks, _unit_headings = chunk_document(text.encode("utf-8"), "webpage")
        if not chunks:
            logger.warning("Nothing worth indexing in '%s' (id %s) - too short", _safe_log_value(title), document_id)
            _set_index_error(document_id, "Nothing worth indexing was found on this page.")
            return

        if not is_current_generation(document_id, generation):
            logger.info("Content %s was deleted or re-indexed before indexing finished - discarding.", document_id)
            return

        _embed_and_store(
            chunks, title, document_id, generation,
            UNIT_LABELS["webpage"], "webpage", "web", url, [None] * len(chunks),
        )
    except Exception as error:  # noqa: BLE001 - nobody is left to report an error to
        logger.exception("Background indexing failed for '%s' (id %s)", _safe_log_value(title), document_id)
        _set_index_error(document_id, _friendly_index_error(error))


def _safe_log_value(value: object) -> str:
    """Strips control characters and caps length, so a caller-supplied value can't forge log lines."""
    text = ("" if value is None else str(value)).replace("\r", "").replace("\n", "")
    cleaned = "".join(ch for ch in text if ch.isprintable())[:254]
    return cleaned or "unknown"


async def _claim_generation(document_id: str) -> int:
    """Claims the document's next generation off the event loop, as a clean 503 the admin can retry if the database is down."""
    try:
        return await run_in_threadpool(claim_generation, document_id)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 503
        logger.exception("Failed to claim a generation for document %s", _safe_log_value(document_id))
        raise HTTPException(status_code=503, detail="Could not start indexing. Please try again.") from error


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
async def ingest_drive_link(body: IngestDriveLinkRequest) -> dict:
    """Indexes a document from a Google Drive link, or an ordinary public webpage, no local
    copy saved.

    Split either side of the response so document size doesn't affect
    how long this takes to answer: metadata/text is resolved first (fast,
    catches real errors), then chunk/embed/store happens in the
    background - a failure there only reaches the log, not the caller."""
    logger.info(
        "Ingest requested for %s by %s",
        _safe_log_value(body.contentId or body.driveLink), _safe_log_value(body.adminEmail),
    )
    if is_web_page_link(body.driveLink):
        try:
            page = await run_in_threadpool(fetch_web_page_text, body.driveLink)
        except ValueError as error:
            await _record_ingest_rejection(body.contentId, str(error))
            raise HTTPException(status_code=400, detail=str(error)) from error
        except RuntimeError as error:
            logger.exception("Could not read webpage for indexing")
            await _record_ingest_rejection(body.contentId, "Could not read that page.")
            raise HTTPException(status_code=502, detail="Could not read that page.") from error

        title = body.title.strip() if body.title and body.title.strip() else page.title
        document_id = body.contentId or hashlib.sha256(body.driveLink.encode()).hexdigest()[:16]

        # Claimed now, not once the task actually starts, or a delete queued behind it would go unnoticed
        generation = await _claim_generation(document_id)
        _submit_index_job(
            _run_tracked, _run_in_index_slot, _index_webpage_in_background, document_id, generation,
            title, document_id, body.driveLink, page.text, generation,
        )

        return {"status": "indexing", "title": title, "documentId": document_id, "fileType": "webpage"}

    lookup_started = time.monotonic()
    try:
        info = await run_in_threadpool(resolve_drive_file, body.driveLink)
        logger.info(
            "Drive lookup for %s took %.1fs", _safe_log_value(body.contentId or body.driveLink),
            time.monotonic() - lookup_started,
        )
    except ValueError as error:
        # Rejected before indexing started, so record it now
        await _record_ingest_rejection(body.contentId, str(error))
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        logger.exception("Could not read Drive link for indexing")
        await _record_ingest_rejection(body.contentId, "Could not read that file from Google Drive.")
        raise HTTPException(status_code=502, detail="Could not read that file from Google Drive.") from error

    title = body.title.strip() if body.title and body.title.strip() else info.drive_title
    document_id = body.contentId if body.contentId else info.file_id

    _clear_index_error(document_id)
    # Claimed now, not once the background task actually starts - see the note above.
    generation = await _claim_generation(document_id)
    # A large file runs alone, so its memory use is never multiplied by concurrent jobs.
    runner = (
        _run_in_index_slot_exclusive
        if info.size_bytes is not None and info.size_bytes > LARGE_FILE_EXCLUSIVE_THRESHOLD_BYTES
        else _run_in_index_slot
    )
    _submit_index_job(
        _run_tracked, runner, _index_drive_file_in_background, document_id, generation,
        info, title, document_id, body.driveLink, generation, body.displayLink,
    )

    return {
        "status": "indexing",
        "title": title,
        "documentId": document_id,
        "fileType": "reference" if body.displayLink else info.extension,
    }


@app.get("/documents")
def list_documents_endpoint() -> dict:
    """The id of every indexed document, so the backend can remove chunks whose Pitstop content is gone."""
    try:
        document_ids = list_document_ids()
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Failed to list indexed documents")
        raise HTTPException(status_code=500, detail="Could not list indexed documents.") from error
    return {"documentIds": sorted(document_ids)}


@app.delete(
    "/documents/{document_id}",
    responses={404: {"model": ErrorResponse, "description": "No indexed chunks found for this document id."}},
)
def delete_document_endpoint(
    document_id: str = Path(..., pattern=r"^[0-9]+$"), x_admin_email: Optional[str] = Header(default=None),
) -> dict:
    """Removes a document's chunks. In the same database transaction it claims a new generation, so a
    background index for the same id - on any copy of the service - discards its work instead of
    recreating what was just deleted. A never-indexed id gets a 404."""
    logger.info("Delete requested for document %s by %s", _safe_log_value(document_id), _safe_log_value(x_admin_email))

    try:
        existed = delete_document(document_id)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Failed to delete document %s", _safe_log_value(document_id))
        raise HTTPException(status_code=500, detail="Error while deleting document.") from error

    if not existed:
        raise HTTPException(status_code=404, detail=f"No indexed chunks found for document {document_id}.")

    _clear_search_cache()
    logger.info("Removed indexed chunks for document %s", _safe_log_value(document_id))
    return {"status": "deleted", "documentId": document_id}


@app.get("/documents/{document_id}/status")
def get_document_status(document_id: str = Path(..., pattern=r"^[0-9]+$")) -> dict:
    """Whether a document has indexed pieces, and why its latest attempt failed, if it did."""
    try:
        indexed = document_exists(document_id)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 500
        logger.exception("Failed to check indexing status for document %s", _safe_log_value(document_id))
        raise HTTPException(status_code=500, detail="Could not check indexing status.") from error

    with _index_errors_lock:
        entry = _index_errors.get(document_id)
    error_message = entry[1] if entry else None
    if not indexed and error_message is None and _index_job_interrupted(document_id):
        error_message = INTERRUPTED_INDEX_MESSAGE

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
