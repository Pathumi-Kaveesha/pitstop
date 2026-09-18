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

"""Resolves a pasted Google Drive link into a real, indexable file."""

from __future__ import annotations

import logging
import re
import threading
import time
from dataclasses import dataclass
from urllib.parse import urlparse

import requests

from config import (
    GOOGLE_DRIVE_CLIENT_ID,
    GOOGLE_DRIVE_CLIENT_SECRET,
    GOOGLE_DRIVE_MAX_RETRIES,
    GOOGLE_DRIVE_REFRESH_TOKEN,
    GOOGLE_DRIVE_RETRY_DELAY_SECONDS,
    MAX_DRIVE_FILE_SIZE_BYTES,
)

logger = logging.getLogger("smart-search-service")

TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"

# Native Google files export as one of these.
EXPORT_FORMATS = {
    "application/vnd.google-apps.document": (
        "docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
    "application/vnd.google-apps.spreadsheet": (
        "xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    "application/vnd.google-apps.presentation": (
        "pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ),
}

# Mime type to extension, for real uploaded files.
MIME_TYPE_EXTENSIONS = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}

# Where a file id shows up in a Drive link.
_FILE_ID_PATTERNS = [
    re.compile(r"/d/([a-zA-Z0-9_-]{10,})"),
    re.compile(r"[?&]id=([a-zA-Z0-9_-]{10,})"),
]


@dataclass
class DriveFileInfo:
    """What a Drive link points at, known before anything is downloaded."""

    file_id: str
    mime_type: str
    drive_title: str
    extension: str
    size_bytes: int | None = None


_ALLOWED_DRIVE_HOSTS = {"drive.google.com", "docs.google.com"}
_NOT_A_DRIVE_LINK_ERROR = "That doesn't look like a Google Drive link - couldn't find a file id in it."


def extract_file_id(drive_link: str) -> str:
    """Pulls the file id out of any of Drive's usual link shapes."""
    parsed = urlparse(drive_link)
    if parsed.scheme != "https" or parsed.hostname not in _ALLOWED_DRIVE_HOSTS:
        raise ValueError(_NOT_A_DRIVE_LINK_ERROR)

    for pattern in _FILE_ID_PATTERNS:
        match = pattern.search(drive_link)
        if match:
            return match.group(1)
    raise ValueError(_NOT_A_DRIVE_LINK_ERROR)


# Access token cache.
_cached_access_token: str | None = None
_cached_token_expires_at: float = 0.0
_token_refresh_lock = threading.Lock()


def _get_access_token() -> str:
    global _cached_access_token, _cached_token_expires_at

    if _cached_access_token and time.time() < _cached_token_expires_at - 60:
        return _cached_access_token

    # Multiple threads can hit this at once - only one should refresh.
    with _token_refresh_lock:
        if _cached_access_token and time.time() < _cached_token_expires_at - 60:
            return _cached_access_token

        response = requests.post(
            TOKEN_URL,
            data={
                "client_id": GOOGLE_DRIVE_CLIENT_ID,
                "client_secret": GOOGLE_DRIVE_CLIENT_SECRET,
                "refresh_token": GOOGLE_DRIVE_REFRESH_TOKEN,
                "grant_type": "refresh_token",
            },
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()

        _cached_access_token = data["access_token"]
        _cached_token_expires_at = time.time() + data.get("expires_in", 3600)
        return _cached_access_token


def _request_with_retry(method: str, url: str, max_bytes: int | None = None,
        **kwargs) -> requests.Response | bytes:
    """Retries a request. With max_bytes, streams and aborts early if
    oversized, returning bytes directly."""
    last_error: Exception | None = None
    last_detail: str = ""
    for attempt in range(GOOGLE_DRIVE_MAX_RETRIES + 1):
        try:
            headers = kwargs.pop("headers", {})
            headers["Authorization"] = f"Bearer {_get_access_token()}"
            kwargs.setdefault("timeout", (30, 300))  # (connect, read)
            if max_bytes is not None:
                response = requests.request(method, url, headers=headers, stream=True, **kwargs)
                response.raise_for_status()
                buffer = bytearray()
                for chunk in response.iter_content(chunk_size=1_048_576):
                    buffer.extend(chunk)
                    if len(buffer) > max_bytes:
                        response.close()
                        raise ValueError(
                            f"File is over the {max_bytes / 1_048_576:.0f} MB limit Smart "
                            "Search can index."
                        )
                response.close()
                return bytes(buffer)
            response = requests.request(method, url, headers=headers, **kwargs)
            response.raise_for_status()
            return response
        except requests.exceptions.HTTPError as error:
            last_error = error
            if error.response is not None:
                last_detail = error.response.text[:500]
            if error.response is not None and error.response.status_code == 401:
                global _cached_access_token
                _cached_access_token = None
            elif error.response is not None and error.response.status_code < 500:
                break
        except requests.exceptions.RequestException as error:
            last_error = error

        if attempt < GOOGLE_DRIVE_MAX_RETRIES:
            logger.warning(
                "Google Drive request failed (attempt %d of %d), retrying: %s",
                attempt + 1,
                GOOGLE_DRIVE_MAX_RETRIES + 1,
                last_error,
            )
            time.sleep(GOOGLE_DRIVE_RETRY_DELAY_SECONDS)

    raise RuntimeError(
        f"Failed to reach Google Drive: {last_error}{' - ' + last_detail if last_detail else ''}"
    ) from last_error


# Drive's own web export endpoint.
_WEB_EXPORT_BASE = "https://docs.google.com"
_WEB_EXPORT_PATHS = {
    "application/vnd.google-apps.document": "document",
    "application/vnd.google-apps.spreadsheet": "spreadsheets",
    "application/vnd.google-apps.presentation": "presentation",
}

# Google's size-limit error string.
_EXPORT_TOO_LARGE = "exportSizeLimitExceeded"


def _export_native_file(file_id: str, mime_type: str, export_mime_type: str, extension: str,
        max_bytes: int) -> bytes:
    """Exports a native Google file, falling back to the web-UI endpoint
    on exportSizeLimitExceeded."""
    try:
        return _request_with_retry(
            "GET",
            f"{DRIVE_API_BASE}/files/{file_id}/export",
            max_bytes=max_bytes,
            params={"mimeType": export_mime_type},
        )
    except RuntimeError as api_error:
        web_path = _WEB_EXPORT_PATHS.get(mime_type)
        if web_path is None or _EXPORT_TOO_LARGE not in str(api_error):
            raise
        return _request_with_retry(
            "GET",
            f"{_WEB_EXPORT_BASE}/{web_path}/d/{file_id}/export",
            max_bytes=max_bytes,
            params={"format": extension},
        )


def resolve_drive_file(drive_link: str) -> DriveFileInfo:
    """Resolves what a link points at, without downloading it."""
    file_id = extract_file_id(drive_link)

    metadata_response = _request_with_retry(
        "GET",
        f"{DRIVE_API_BASE}/files/{file_id}",
        params={"fields": "name,mimeType,size"},
    )
    metadata = metadata_response.json()
    mime_type = metadata.get("mimeType", "")
    drive_title = metadata.get("name", "Untitled")

    # Native Google files report no size.
    size_bytes = int(metadata["size"]) if metadata.get("size") else None
    if size_bytes is not None and size_bytes > MAX_DRIVE_FILE_SIZE_BYTES:
        raise ValueError(
            f"'{drive_title}' is {size_bytes / 1_048_576:.0f} MB, over the "
            f"{MAX_DRIVE_FILE_SIZE_BYTES / 1_048_576:.0f} MB limit Smart Search can index."
        )

    if mime_type in EXPORT_FORMATS:
        extension, _ = EXPORT_FORMATS[mime_type]
    else:
        extension = MIME_TYPE_EXTENSIONS.get(mime_type)
        if extension is None and "." in drive_title:
            extension = drive_title.rsplit(".", 1)[-1].lower()
        if extension not in ("pdf", "docx", "pptx", "xlsx"):
            raise ValueError(
                f"'{drive_title}' isn't a file type Smart Search can read "
                "(supported: PDF, Word, PowerPoint, Excel, and native Google Docs/Sheets/Slides)."
            )

    return DriveFileInfo(
        file_id=file_id, mime_type=mime_type, drive_title=drive_title, extension=extension,
        size_bytes=size_bytes,
    )


def download_drive_file(info: DriveFileInfo) -> bytes:
    """Fetches the actual bytes of an already-resolved file, bounded to
    MAX_DRIVE_FILE_SIZE_BYTES."""
    if info.mime_type in EXPORT_FORMATS:
        _, export_mime_type = EXPORT_FORMATS[info.mime_type]
        return _export_native_file(
            info.file_id, info.mime_type, export_mime_type, info.extension, MAX_DRIVE_FILE_SIZE_BYTES
        )

    return _request_with_retry(
        "GET",
        f"{DRIVE_API_BASE}/files/{info.file_id}",
        max_bytes=MAX_DRIVE_FILE_SIZE_BYTES,
        params={"alt": "media"},
    )
