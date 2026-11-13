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

"""Reads Google Drive files through the Drive Service, the only service that talks to Google Drive."""

import json
import logging
import re
import threading
import time
from typing import Optional, Union
from urllib.parse import quote

import requests

from config import (
    DRIVE_SERVICE_AUTH_TOKEN,
    DRIVE_SERVICE_CLIENT_ID,
    DRIVE_SERVICE_CLIENT_SECRET,
    DRIVE_SERVICE_MAX_RETRIES,
    DRIVE_SERVICE_RETRY_DELAY_SECONDS,
    DRIVE_SERVICE_TOKEN_URL,
    DRIVE_SERVICE_URL,
)
from http_session import make_session

logger = logging.getLogger("smart-search-service")

_session = make_session()

# (connect, read) seconds - a big file can take a while to start sending.
_TIMEOUT = (15, 420)

# The most the Drive Service accepts as a download limit.
_SERVICE_MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024
# The most words one Slides, Docs or Sheets answer may hold. A real deck or document is far under 1 MB; this stops a
# freak one from filling the service's memory.
_MAX_TEXT_ANSWER_BYTES = 32 * 1024 * 1024

# The longest wait a Retry-After from the service is allowed to cause.
_MAX_RETRY_AFTER_SECONDS = 30

# "bytes 100-199/5000" (or "/*" when the total is unknown) - the part a 206 answer holds.
_CONTENT_RANGE = re.compile(r"bytes (\d+)-(\d+)/(?:\d+|\*)")

# Statuses worth asking again about.
_RETRY_STATUSES = {429, 500, 502, 503, 504}

# The Drive Service's own words for a file that's gone or that the Pitstop Google account can no longer open. A 403 or
# 404 without them came from somewhere else (a missing route, the gateway), so it says nothing about the file.
_FILE_MISSING_DETAILS = {
    "the file was not found, or this service cannot read it",
    "this service is not allowed to read the file",
}

# Access token cache, for the client credentials grant.
_cached_token: Optional[str] = None
_cached_token_expires_at: float = 0.0
_token_lock = threading.Lock()


class DriveServiceError(RuntimeError):
    """A failed read through the Drive Service. kind: unavailable, busy, timeout, unreachable, auth or other.
    file_missing: the Drive Service itself said the file is gone or can't be opened, not just some 403 or 404."""

    def __init__(self, kind: str, message: str, file_missing: bool = False):
        super().__init__(message)
        self.kind = kind
        self.file_missing = file_missing


class PartNotSupportedError(DriveServiceError):
    """The Drive Service did not send just the part of the file that was asked for - most likely it is a version that
    cannot do that yet. A whole-file download still works."""

    def __init__(self, message: str):
        super().__init__("other", message)


def _service_token() -> Optional[str]:
    """The token for calling the Drive Service: from the token endpoint if set, else the fixed local one, else none."""
    global _cached_token, _cached_token_expires_at

    if DRIVE_SERVICE_TOKEN_URL is None:
        return DRIVE_SERVICE_AUTH_TOKEN

    if _cached_token and time.time() < _cached_token_expires_at - 60:
        return _cached_token

    # Several threads can need a token at once - only one should ask for it.
    with _token_lock:
        if _cached_token and time.time() < _cached_token_expires_at - 60:
            return _cached_token

        response = requests.post(
            DRIVE_SERVICE_TOKEN_URL,
            data={"grant_type": "client_credentials"},
            auth=(DRIVE_SERVICE_CLIENT_ID, DRIVE_SERVICE_CLIENT_SECRET),
            timeout=30,
        )
        response.raise_for_status()
        try:
            data = response.json()
            _cached_token = data["access_token"]
            _cached_token_expires_at = time.time() + float(data.get("expires_in", 3600))
        except (KeyError, ValueError, TypeError, AttributeError) as error:
            raise DriveServiceError("auth", "Unreadable answer from the token endpoint.") from error
        return _cached_token


def _forget_token() -> None:
    global _cached_token
    _cached_token = None


def _detail(response: requests.Response) -> str:
    """The service's own message for a failed answer, kept short."""
    try:
        return str(response.json().get("message", ""))[:300]
    except ValueError:
        return response.text[:300]


def _retry_after(response: requests.Response) -> Optional[float]:
    try:
        return min(max(float(response.headers.get("Retry-After", "")), 0), _MAX_RETRY_AFTER_SECONDS)
    except ValueError:
        return None


def _call(
    path: str, params: Optional[dict] = None, max_bytes: Optional[int] = None, part: Optional[tuple[int, int]] = None
) -> Union[requests.Response, bytes]:
    """Calls the Drive Service, retrying busy answers and dropped connections. ValueError if over the size limit.
    part is (offset, length) when only that part of a file is asked for: the answer must then be exactly a part, else
    PartNotSupportedError, and the bytes come back whole."""
    url = f"{DRIVE_SERVICE_URL}{path}"
    last_error = "no answer"
    last_kind = "unreachable"
    for attempt in range(DRIVE_SERVICE_MAX_RETRIES + 1):
        delay: float = DRIVE_SERVICE_RETRY_DELAY_SECONDS
        kind = ""  # why this attempt failed, set where it fails
        try:
            try:
                token = _service_token()
            except requests.exceptions.RequestException:
                kind = "auth"
                raise
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            response = _session.get(url, headers=headers, params=params, stream=max_bytes is not None, timeout=_TIMEOUT)
            try:
                status = response.status_code
                if status == 401:
                    if DRIVE_SERVICE_TOKEN_URL is None:
                        raise DriveServiceError("auth", "Drive Service rejected the token.")
                    _forget_token()
                    kind = "auth"
                    last_error = "Drive Service rejected the token"
                elif status == 413 and part is not None:
                    # A part is never too large for the service that supports parts, so this is one that ignored it
                    raise PartNotSupportedError("The Drive Service answered as if the whole file was asked for.")
                elif status == 413:
                    limit = max_bytes if max_bytes is not None else 0
                    raise ValueError(f"File is over the {limit / 1_048_576:.0f} MB limit Smart Search can index.")
                elif status in _RETRY_STATUSES:
                    kind = "busy"
                    last_error = f"Drive Service busy (status {status}): {_detail(response)}"
                    delay = _retry_after(response) or delay
                elif status in (403, 404):
                    # Missing, or the Pitstop Google account cannot open it: asking again changes nothing.
                    detail = _detail(response)
                    raise DriveServiceError(
                        "unavailable", f"File not found or not accessible ({status}): {detail}",
                        file_missing=detail in _FILE_MISSING_DETAILS,
                    )
                elif status == 501 and part is not None:
                    raise PartNotSupportedError(
                        "The Drive Service could not get just that part of the file from Google."
                    )
                elif part is not None and status in (200, 206):
                    return _read_part(response, status, part)
                elif status != 200:
                    raise DriveServiceError("other", f"Drive Service error (status {status}): {_detail(response)}")
                elif max_bytes is None:
                    return response
                else:
                    return _read_limited(response, max_bytes)
            finally:
                response.close()
        except requests.exceptions.RequestException as error:
            last_error = f"{type(error).__name__}: {error}"
            delay = DRIVE_SERVICE_RETRY_DELAY_SECONDS
            if not kind:
                took_too_long = isinstance(error, requests.exceptions.Timeout) and not isinstance(
                    error, requests.exceptions.ConnectTimeout
                )
                kind = "timeout" if took_too_long else "unreachable"
        last_kind = kind or last_kind

        if attempt < DRIVE_SERVICE_MAX_RETRIES:
            logger.warning(
                "Drive Service request failed (attempt %d of %d), retrying: %s",
                attempt + 1, DRIVE_SERVICE_MAX_RETRIES + 1, last_error,
            )
            time.sleep(delay)

    raise DriveServiceError(last_kind, f"Drive Service request failed: {last_error}")


def _read_part(response: requests.Response, status: int, part: tuple[int, int]) -> bytes:
    """The body of a 206 answer, once its Content-Range is checked to be the part that was asked for. Nothing is read
    from any other answer, so a service that ignores the request and starts sending the whole file is cut off."""
    offset, length = part
    if status != 206:
        raise PartNotSupportedError(f"The Drive Service answered {status}, not a part of the file.")
    match = _CONTENT_RANGE.fullmatch(response.headers.get("Content-Range", "").strip())
    if match is None:
        raise PartNotSupportedError("The Drive Service sent a part without saying which part.")
    first, last = int(match.group(1)), int(match.group(2))
    if first != offset or last < first or last > offset + length - 1:
        raise PartNotSupportedError("The Drive Service sent a different part than the one asked for.")
    expected = last - first + 1
    data = _read_limited(response, expected)
    if len(data) != expected:
        raise requests.exceptions.ChunkedEncodingError(f"The part ended early: got {len(data)} of {expected} bytes")
    return data


def _read_limited(response: requests.Response, max_bytes: int) -> bytes:
    """The whole body, refusing one over max_bytes or one that ends before the length the service announced."""
    buffer = bytearray()
    for chunk in response.iter_content(chunk_size=1_048_576):
        buffer.extend(chunk)
        if len(buffer) > max_bytes:
            raise ValueError(f"File is over the {max_bytes / 1_048_576:.0f} MB limit Smart Search can index.")
    announced = response.headers.get("Content-Length")
    # Not when the body was compressed on the way: the announced length is then the compressed one.
    if (announced is not None and announced.isdigit() and not response.headers.get("Content-Encoding")
            and len(buffer) != int(announced)):
        raise requests.exceptions.ChunkedEncodingError(
            f"The download ended early: got {len(buffer)} of {announced} bytes"
        )
    return bytes(buffer)


def _json(path: str, params: Optional[dict] = None, max_bytes: Optional[int] = None) -> dict:
    """An answer from the Drive Service that is JSON; ValueError if it is over max_bytes, when that is given."""
    try:
        answer = _call(path, params=params, max_bytes=max_bytes)
    except ValueError as error:
        if max_bytes is None:
            raise
        raise ValueError(
            f"The text of this file is over the {max_bytes // 1_048_576} MB Smart Search can read."
        ) from error
    try:
        return json.loads(answer) if isinstance(answer, bytes) else answer.json()
    except ValueError as error:
        raise DriveServiceError("other", "Unreadable answer from the Drive Service.") from error


def download_part(file_id: str, offset: int, length: int) -> bytes:
    """Just the bytes from offset, up to length of them (fewer at the end of the file), of a stored file. The Drive
    Service sends a whole file's bytes otherwise; PartNotSupportedError means it cannot send only a part."""
    if offset < 0 or length < 1 or length > _SERVICE_MAX_DOWNLOAD_BYTES:
        raise ValueError("A part needs an offset from 0 and a length from 1 to the service's largest download.")
    params = {"offset": offset, "length": length, "maxBytes": length}
    return _call(f"/files/{quote(file_id, safe='')}/download", params=params, max_bytes=length, part=(offset, length))


def get_slides_text(file_id: str) -> dict:
    """The text of every slide of a native Google Slides file, read through the Slides API: {"slides": [{"id", "texts",
    "notes"}]}. For a presentation too large to export, since the answer holds only words."""
    return _json(f"/files/{quote(file_id, safe='')}/slides-text", max_bytes=_MAX_TEXT_ANSWER_BYTES)


def get_doc_text(file_id: str) -> dict:
    """The content of a native Google Docs file, read through the Docs API: {"blocks": [{"heading", "text"} or
    {"rows"}]}, paragraphs and tables in order. For a document too large to export, since the answer holds only
    words."""
    return _json(f"/files/{quote(file_id, safe='')}/doc-text", max_bytes=_MAX_TEXT_ANSWER_BYTES)


def get_sheet_list(file_id: str) -> dict:
    """The tabs of a native Google Sheets file, left to right: {"sheets": [{"title", "rows", "columns"}]}."""
    return _json(f"/files/{quote(file_id, safe='')}/sheet-list", max_bytes=_MAX_TEXT_ANSWER_BYTES)


def get_sheet_rows(file_id: str, sheet: int, first_row: int, count: int) -> dict:
    """count rows of one tab (its position in get_sheet_list) from first_row, which counts from 1: {"rows": [[...]]}.
    Rows past the end of the data are left out."""
    params = {"sheet": sheet, "firstRow": first_row, "count": count}
    return _json(f"/files/{quote(file_id, safe='')}/sheet-rows", params, _MAX_TEXT_ANSWER_BYTES)


def get_file_info(file_id: str) -> dict:
    """The file's name, type, size and last-modified time (size and modifiedTime are missing if Google reports none)."""
    return _json(f"/files/{quote(file_id, safe='')}/info")


def get_structure(file_id: str) -> dict:
    """What a deep link into a native Google file needs: slide ids, sheet tab ids or document headings."""
    return _json(f"/files/{quote(file_id, safe='')}/structure")


def download_file(file_id: str, max_bytes: int, export_as: Optional[str] = None) -> bytes:
    """The file's bytes. A native Google Doc, Sheet or Slides file is exported as export_as (docx, xlsx or pptx)."""
    params = {"maxBytes": min(max_bytes, _SERVICE_MAX_DOWNLOAD_BYTES)}
    if export_as:
        params["exportAs"] = export_as
    return _call(f"/files/{quote(file_id, safe='')}/download", params=params, max_bytes=max_bytes)
