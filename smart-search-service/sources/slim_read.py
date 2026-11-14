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

"""Reads the text of a very large Word or PowerPoint file without ever holding the file.

A .docx or .pptx is a zip archive: its parts, then a table of contents at the end. A 280 MB deck is almost all
pictures; the words are in small XML parts. This asks the Drive Service for the table of contents and then for only
those parts, and builds a small archive of the same document in which every other part (pictures, videos, embedded
files) is empty. Chunking reads that archive as it would the whole file, and finds the same slides, text and notes."""

import bisect
import io
import logging
import time
import zipfile
import zlib
from typing import Callable

from config import MAX_OOXML_UNCOMPRESSED_BYTES
from sources.drive_service import DriveServiceError, PartNotSupportedError, download_part

logger = logging.getLogger("smart-search-service")

_KB = 1024
_MB = 1024 * _KB

# Asked for first: the end-of-archive record and, for most files, the whole table of contents.
_TAIL_BYTES = 256 * _KB
# Something fetched on the spot is never asked for in less than this, so a read does not turn into many tiny requests.
_MIN_FETCH_BYTES = 64 * _KB
# One request asks for no more than this, except that nothing is split smaller than it needs to be.
_MAX_FETCH_BYTES = 16 * _MB
# The largest stored text part that is read, and the most text (uncompressed) read from one file. The reader that
# makes the chunks holds about 8 times the text it reads, so 64 MB of text is about 500 MB of memory.
_MAX_PART_BYTES = 64 * _MB
_MAX_TEXT_BYTES = 64 * _MB
# Across one file: requests made and bytes fetched (gaps between parts included). Past either, it is not worth it.
_MAX_REQUESTS = 1000
_MAX_FETCHED_BYTES = 192 * _MB
# Parts close together are fetched with one request. The gap allowed grows until the plan has few enough requests,
# unless that would fetch more than _MAX_WASTED_BYTES of bytes between the parts that are not needed.
_MERGE_GAPS = (64 * _KB, 256 * _KB, 1 * _MB, 4 * _MB, 16 * _MB)
_MAX_PLANNED_REQUESTS = 150
_MAX_WASTED_BYTES = 64 * _MB
# A part's header in the archive is 30 bytes plus its name and an "extra" field, which can differ from the table's.
_LOCAL_HEADER_BYTES = 30
_LOCAL_EXTRA_GUESS = 512
# The names of the parts in an archive that is the same document with its pictures and binary parts left out.
_NOT_TEXT_FOLDERS = ("/media/", "/embeddings/")


class SlimReadUnavailable(Exception):
    """This file cannot be read in parts (the Drive Service cannot send parts, or the archive is unusual). A
    whole-file download is the way to read it, where the file is small enough for that."""


class _PartsFile:
    """A read-only, seekable file whose bytes are fetched from the Drive Service when they are first needed."""

    closed = False

    def __init__(self, fetch: Callable[[int, int], bytes], size: int):
        self._fetch = fetch
        self._size = size
        self._pos = 0
        self._starts: list[int] = []
        self._blocks: dict[int, bytes] = {}
        self.requests = 0
        self.fetched = 0
        self.text_bytes = 0

    # --- what zipfile uses
    def seekable(self) -> bool:
        return True

    def readable(self) -> bool:
        return True

    def tell(self) -> int:
        return self._pos

    def seek(self, offset: int, whence: int = 0) -> int:
        base = {0: 0, 1: self._pos, 2: self._size}.get(whence)
        if base is None:
            raise ValueError(f"invalid whence ({whence})")
        if base + offset < 0:
            raise OSError("seek before the start of the file")
        self._pos = base + offset
        return self._pos

    def read(self, size: int | None = -1) -> bytes:
        if size is None or size < 0:
            size = self._size - self._pos
        end = min(self._pos + size, self._size)
        if end <= self._pos:
            return b""
        self.load(self._pos, end)
        data = self._slice(self._pos, end)
        self._pos = end
        return data

    def close(self) -> None:
        self._starts.clear()
        self._blocks.clear()

    # --- fetching
    def load(self, start: int, end: int) -> None:
        """Makes sure every byte from start up to end is held, fetching only what is missing."""
        end = min(end, self._size)
        position = start
        while position < end:
            index = bisect.bisect_right(self._starts, position) - 1
            if index >= 0:
                block_start = self._starts[index]
                block_end = block_start + len(self._blocks[block_start])
                if position < block_end:
                    position = block_end
                    continue
            # position is in a gap: fetch up to the next block or the end wanted, but not a trifle
            following = self._starts[index + 1] if index + 1 < len(self._starts) else self._size
            gap_end = min(max(end, position + _MIN_FETCH_BYTES), following, self._size)
            self._fetch_into_blocks(position, gap_end)
            position = gap_end

    def _fetch_into_blocks(self, start: int, end: int) -> None:
        while start < end:
            length = min(end - start, _MAX_FETCH_BYTES)
            if self.requests >= _MAX_REQUESTS or self.fetched + length > _MAX_FETCHED_BYTES:
                raise SlimReadUnavailable("reading this file in parts would take too many requests")
            self.requests += 1
            data = self._fetch(start, length)
            if len(data) != length:
                raise SlimReadUnavailable("the Drive Service sent a part of the wrong size")
            self.fetched += length
            self._starts.insert(bisect.bisect_left(self._starts, start), start)
            self._blocks[start] = data
            start += length

    def _slice(self, start: int, end: int) -> bytes:
        pieces = []
        position = start
        while position < end:
            index = bisect.bisect_right(self._starts, position) - 1
            block_start = self._starts[index] if index >= 0 else position
            block = self._blocks.get(block_start, b"")
            if position >= block_start + len(block):
                raise OSError("bytes that were never fetched were read")
            pieces.append(block[position - block_start:end - block_start])
            position = min(end, block_start + len(block))
        return pieces[0] if len(pieces) == 1 else b"".join(pieces)

    def drop(self, start: int, end: int) -> None:
        """Lets go of the fetched blocks that begin inside start..end, once what they held has been read."""
        for block_start in [s for s in self._starts if start <= s < end]:
            self._starts.remove(block_start)
            del self._blocks[block_start]


def _is_text_part(name: str) -> bool:
    lowered = name.lower()
    return lowered.endswith((".xml", ".rels")) and not any(folder in f"/{lowered}" for folder in _NOT_TEXT_FOLDERS)


def _merge(intervals: list[tuple[int, int]], gap: int) -> list[tuple[int, int]]:
    spans: list[list[int]] = []
    for start, end in intervals:
        if spans and start - spans[-1][1] <= gap and max(end, spans[-1][1]) - spans[-1][0] <= _MAX_FETCH_BYTES:
            spans[-1][1] = max(spans[-1][1], end)
        else:
            spans.append([start, end])
    return [(start, end) for start, end in spans]


def _plan(parts: list[zipfile.ZipInfo], limit: int) -> list[tuple[int, int]]:
    """The byte ranges to fetch, few enough to be quick and not so loose that they fetch the pictures between."""
    intervals = sorted(
        (info.header_offset, min(limit, info.header_offset + _LOCAL_HEADER_BYTES + 4 * len(info.filename)
                                 + len(info.extra) + _LOCAL_EXTRA_GUESS + info.compress_size))
        for info in parts
    )
    intervals = [(start, end) for start, end in intervals if start < end]
    needed = sum(end - start for start, end in intervals)
    plan: list[tuple[int, int]] = []
    for gap in _MERGE_GAPS:
        spans = _merge(intervals, gap)
        if plan and sum(end - start for start, end in spans) - needed > _MAX_WASTED_BYTES:
            break
        plan = spans
        if len(plan) <= _MAX_PLANNED_REQUESTS:
            break
    return plan


def _read_part(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> bytes:
    with archive.open(info) as handle:
        data = handle.read(info.file_size + 1)
    if len(data) != info.file_size:
        raise zipfile.BadZipFile(f"'{info.filename}' is not the size its table of contents says")
    return data


def _build(parts: _PartsFile, size: int) -> bytes:
    if size < 22:
        raise SlimReadUnavailable("this is not a Word or PowerPoint file")
    parts.load(max(0, size - _TAIL_BYTES), size)
    archive = zipfile.ZipFile(parts)
    by_name = {info.filename: info for info in archive.infolist()}
    table_start = min(getattr(archive, "start_dir", size), size)

    text = [info for name, info in by_name.items() if _is_text_part(name)]
    if any(info.flag_bits & 0x1 for info in text):
        raise SlimReadUnavailable("this file is password protected")
    if any(info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED) for info in text):
        raise SlimReadUnavailable("this file uses a compression Smart Search cannot read in parts")
    if any(info.compress_size > _MAX_PART_BYTES for info in text):
        raise SlimReadUnavailable("a text part of this file is too large to read in parts")
    parts.text_bytes = sum(info.file_size for info in text)
    if parts.text_bytes > min(_MAX_TEXT_BYTES, MAX_OOXML_UNCOMPRESSED_BYTES):
        raise SlimReadUnavailable("the text of this file is too large to read in parts")

    light = io.BytesIO()
    with zipfile.ZipFile(light, "w", zipfile.ZIP_DEFLATED) as copy:
        in_order = sorted(text, key=lambda info: info.header_offset)
        next_part = 0
        for start, end in _plan(text, table_start):
            parts.load(start, end)
            while next_part < len(in_order) and in_order[next_part].header_offset < end:
                info = in_order[next_part]
                copy.writestr(info.filename, _read_part(archive, info))
                next_part += 1
            parts.drop(start, end)
        # a part that no planned range covered (an empty one, or one past the table of contents) is read where it is
        for info in in_order[next_part:]:
            copy.writestr(info.filename, _read_part(archive, info))
        text_names = {info.filename for info in text}
        for name in by_name:
            if name not in text_names:
                copy.writestr(name, b"")
    return light.getvalue()


def read_text_parts(
    file_id: str, size_bytes: int, part_reader: Callable[[str, int, int], bytes] = download_part
) -> bytes:
    """A small archive of the same document - its text parts as they are, every other part empty - read from a stored
    Word or PowerPoint file of size_bytes without fetching the rest. SlimReadUnavailable when it cannot be done this
    way; other errors from the Drive Service are raised as they are."""
    started = time.monotonic()
    parts = _PartsFile(lambda offset, length: part_reader(file_id, offset, length), size_bytes)
    try:
        light = _build(parts, size_bytes)
    except PartNotSupportedError as error:
        raise SlimReadUnavailable(str(error)) from error
    except DriveServiceError:
        raise
    except SlimReadUnavailable:
        raise
    except (zipfile.BadZipFile, zlib.error, EOFError, NotImplementedError, RuntimeError, OSError, ValueError) as error:
        raise SlimReadUnavailable(f"the file could not be read in parts ({type(error).__name__}: {error})") from error
    finally:
        requests, fetched, text_bytes = parts.requests, parts.fetched, parts.text_bytes
        parts.close()
    logger.info(
        "Read the text parts of a %.0f MB file: %.1f MB fetched in %d requests, %.1f MB of text (%.1f MB kept), %.1fs",
        size_bytes / _MB, fetched / _MB, requests, text_bytes / _MB, len(light) / _MB, time.monotonic() - started,
    )
    return light
