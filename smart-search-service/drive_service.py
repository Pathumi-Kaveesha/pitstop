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

import logging
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

# The longest wait a Retry-After from the service is allowed to cause.
_MAX_RETRY_AFTER_SECONDS = 30

# Statuses worth asking again about.
_RETRY_STATUSES = {429, 500, 502, 503, 504}

# Access token cache, for the client credentials grant.
_cached_token: Optional[str] = None
_cached_token_expires_at: float = 0.0
_token_lock = threading.Lock()


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
            raise RuntimeError("The token endpoint sent an answer that could not be read.") from error
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


def _call(path: str, params: Optional[dict] = None, max_bytes: Optional[int] = None) -> Union[requests.Response, bytes]:
    """Calls the Drive Service, retrying busy answers and dropped connections. ValueError if over the size limit."""
    url = f"{DRIVE_SERVICE_URL}{path}"
    last_error = "no answer"
    for attempt in range(DRIVE_SERVICE_MAX_RETRIES + 1):
        delay: float = DRIVE_SERVICE_RETRY_DELAY_SECONDS
        try:
            token = _service_token()
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            response = _session.get(url, headers=headers, params=params, stream=max_bytes is not None, timeout=_TIMEOUT)
            try:
                status = response.status_code
                if status == 401 and DRIVE_SERVICE_TOKEN_URL is not None:
                    _forget_token()
                    last_error = "the Drive Service did not accept the token"
                elif status == 413:
                    limit = max_bytes if max_bytes is not None else 0
                    raise ValueError(f"File is over the {limit / 1_048_576:.0f} MB limit Smart Search can index.")
                elif status in _RETRY_STATUSES:
                    last_error = (
                        f"the Drive Service is busy or unavailable (status {status}, too many requests): "
                        f"{_detail(response)}"
                    )
                    delay = _retry_after(response) or delay
                elif status != 200:
                    # A missing file, a refusal, a bad request: asking again changes nothing.
                    raise RuntimeError(
                        f"The Drive Service could not read the file (status {status}): {_detail(response)}"
                    )
                elif max_bytes is None:
                    return response
                else:
                    return _read_limited(response, max_bytes)
            finally:
                response.close()
        except requests.exceptions.RequestException as error:
            last_error = f"{type(error).__name__}: {error}"
            delay = DRIVE_SERVICE_RETRY_DELAY_SECONDS

        if attempt < DRIVE_SERVICE_MAX_RETRIES:
            logger.warning(
                "Drive Service request failed (attempt %d of %d), retrying: %s",
                attempt + 1, DRIVE_SERVICE_MAX_RETRIES + 1, last_error,
            )
            time.sleep(delay)

    raise RuntimeError(f"Failed to reach the Drive Service: {last_error}")


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


def _json(path: str) -> dict:
    """An answer from the Drive Service that is JSON."""
    response = _call(path)
    try:
        return response.json()
    except ValueError as error:
        raise RuntimeError("The Drive Service sent an answer that could not be read.") from error


def get_file_info(file_id: str) -> dict:
    """The file's name, type and size (size is missing when Google reports none)."""
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
