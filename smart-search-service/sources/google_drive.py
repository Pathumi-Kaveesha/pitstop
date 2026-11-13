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

from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

from config import MAX_DRIVE_FILE_SIZE_BYTES, MAX_SLIM_FILE_SIZE_BYTES, SLIM_READ_ENABLED, SLIM_READ_MIN_BYTES
from sources.drive_constants import (
    ALLOWED_DRIVE_HOSTS,
    EXPORT_FORMATS,
    FILE_ID_PATTERNS,
    MIME_TYPE_EXTENSIONS,
)
from sources.drive_service import download_file, get_file_info

# A native Google file Google builds an Office file from when asked for its bytes, which it cannot do for one that is
# too large. Each can instead be read as words, through its own API; the value is the kind of text chunking reads.
NATIVE_TEXT_KINDS = {
    "application/vnd.google-apps.presentation": "slides_text",
    "application/vnd.google-apps.document": "docs_text",
    "application/vnd.google-apps.spreadsheet": "sheets_text",
}


@dataclass
class DriveFileInfo:
    """What a Drive link points at, known before anything is downloaded."""

    file_id: str
    mime_type: str
    drive_title: str
    extension: str
    size_bytes: Optional[int] = None
    # When the file last changed, as Google reports it - None when the Drive Service doesn't say.
    modified_time: Optional[str] = None
    # In the trash. Google only shows a trashed file to its owner.
    trashed: bool = False

    @property
    def read_in_parts(self) -> bool:
        """Whether this file is read in parts, so only its text is held (see slim_read.py)."""
        return can_read_in_parts(self.extension, self.mime_type, self.size_bytes)

    @property
    def only_readable_in_parts(self) -> bool:
        """Whether it is too large for a whole download, so reading it in parts is the only way."""
        return self.read_in_parts and self.size_bytes > MAX_DRIVE_FILE_SIZE_BYTES

    @property
    def text_kind(self) -> Optional[str]:
        """For a native Google Slides, Docs or Sheets file, the kind of text its API gives; None for any other file."""
        return NATIVE_TEXT_KINDS.get(self.mime_type)

    @property
    def only_readable_as_text(self) -> bool:
        """A native Google file Drive says is too large for a whole download: its text is read through its API."""
        return self.text_kind is not None and self.size_bytes is not None and self.size_bytes > MAX_DRIVE_FILE_SIZE_BYTES

    @property
    def holds_little_memory(self) -> bool:
        """Whether indexing it holds only its text, however large the file, so it needs no slot to itself."""
        return self.only_readable_in_parts or self.only_readable_as_text


class FileTrashedError(RuntimeError):
    """A Drive file that is in the trash, found by a change check. Indexing still reads such a file, as before."""


class UnindexableDriveFile(ValueError):
    """A Drive file that exists but can't be indexed (too big, a video, an unsupported type). A ValueError, so indexing
    reports it as before; modified_time is when the file last changed, when Google says."""

    def __init__(self, message: str, modified_time: Optional[str] = None, trashed: bool = False):
        super().__init__(message)
        self.modified_time = modified_time
        self.trashed = trashed


def can_read_in_parts(extension: Optional[str], mime_type: str, size_bytes: Optional[int]) -> bool:
    """A stored Word or PowerPoint file (not a Google file exported on the fly, which cannot be read in parts) that is
    large enough for reading in parts to be worth it."""
    return (
        SLIM_READ_ENABLED
        and extension in ("docx", "pptx")
        and mime_type not in EXPORT_FORMATS
        and size_bytes is not None
        and size_bytes >= SLIM_READ_MIN_BYTES
    )


_NOT_A_DRIVE_LINK_ERROR = "That doesn't look like a Google Drive link - couldn't find a file id in it."


def extract_file_id(drive_link: str) -> str:
    """Pulls the file id out of any of Drive's usual link shapes."""
    parsed = urlparse(drive_link)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_DRIVE_HOSTS:
        raise ValueError(_NOT_A_DRIVE_LINK_ERROR)

    for pattern in FILE_ID_PATTERNS:
        match = pattern.search(drive_link)
        if match:
            return match.group(1)
    raise ValueError(_NOT_A_DRIVE_LINK_ERROR)


def resolve_drive_file(drive_link: str) -> DriveFileInfo:
    """Resolves what a link points at, without downloading it."""
    file_id = extract_file_id(drive_link)

    metadata = get_file_info(file_id)
    mime_type = metadata.get("mimeType", "")
    drive_title = metadata.get("name", "Untitled")

    # A file Google reports no size for.
    size_bytes = int(metadata["size"]) if metadata.get("size") is not None else None
    modified_time = metadata.get("modifiedTime")
    if not isinstance(modified_time, str) or not modified_time.strip():
        modified_time = None
    trashed = metadata.get("trashed") is True

    if mime_type in EXPORT_FORMATS:
        extension, _ = EXPORT_FORMATS[mime_type]
    else:
        extension = MIME_TYPE_EXTENSIONS.get(mime_type)
        if extension is None and "." in drive_title:
            extension = drive_title.rsplit(".", 1)[-1].lower()
        if mime_type.startswith("video/"):
            raise UnindexableDriveFile(
                f"'{drive_title}' is a video file, which Smart Search can't read - "
                "set this content's subtype to Video and add a Google Doc transcript link instead.",
                modified_time, trashed,
            )
        if extension not in ("pdf", "docx", "pptx", "xlsx"):
            raise UnindexableDriveFile(
                f"'{drive_title}' isn't a file type Smart Search can read "
                "(supported: PDF, Word, PowerPoint, Excel, and native Google Docs/Sheets/Slides).",
                modified_time, trashed,
            )

    # A file read in parts holds only its text, so it may be far larger than one downloaded whole.
    size_limit = (
        max(MAX_SLIM_FILE_SIZE_BYTES, MAX_DRIVE_FILE_SIZE_BYTES)
        if can_read_in_parts(extension, mime_type, size_bytes)
        else MAX_DRIVE_FILE_SIZE_BYTES
    )
    # A native Google file too large to export is read through its API instead, which has no size to exceed.
    if size_bytes is not None and size_bytes > size_limit and mime_type not in NATIVE_TEXT_KINDS:
        raise UnindexableDriveFile(
            f"'{drive_title}' is {size_bytes / 1_048_576:.0f} MB, over the "
            f"{size_limit / 1_048_576:.0f} MB limit Smart Search can index.",
            modified_time, trashed,
        )

    return DriveFileInfo(
        file_id=file_id, mime_type=mime_type, drive_title=drive_title, extension=extension,
        size_bytes=size_bytes, modified_time=modified_time, trashed=trashed,
    )


def download_drive_file(info: DriveFileInfo, max_bytes: int = MAX_DRIVE_FILE_SIZE_BYTES) -> bytes:
    """Fetches the actual bytes of an already-resolved file, bounded to
    max_bytes (MAX_DRIVE_FILE_SIZE_BYTES by default)."""
    # A native Google file is exported to its Office format; any other file is downloaded as it is.
    export_as = info.extension if info.mime_type in EXPORT_FORMATS else None
    return download_file(info.file_id, max_bytes, export_as)
