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

"""Extracts text per format, joins it, and splits it into chunks tagged
with the page/slide/section/sheet they came from.

One "piece" per format: PDF -> page, PPTX -> slide, DOCX -> heading-delimited
section (no page numbers in .docx), XLSX -> sheet tab.
"""

import datetime
import io
import itertools
import json
import re
import zipfile
from dataclasses import dataclass
from typing import Iterator, Optional

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openpyxl import load_workbook
from pptx import Presentation
from pypdf import PdfReader

from config import (
    MAX_CHUNK_OVERLAP,
    MAX_CHUNK_SIZE,
    MAX_OOXML_UNCOMPRESSED_BYTES,
    MIN_CHUNK_LENGTH,
)

UNIT_LABELS = {
    "pdf": "Page",
    "pptx": "Slide",
    "slides_text": "Slide",
    "docx": "Section",
    "docs_text": "Section",
    "sheets_text": "Sheet",
    "xlsx": "Sheet",
    "webpage": "Section",
    "transcript": "Moment",
    "docs_transcript": "Moment",
}

@dataclass
class Chunk:
    text: str
    page: int
    # (seconds, text) for every transcript moment this chunk spans, not just its first one
    moments: Optional[list[tuple[str, str]]] = None


def _extract_pdf(file_bytes: bytes) -> list[str]:
    """One string per page."""
    reader = PdfReader(io.BytesIO(file_bytes))
    return [page.extract_text() or "" for page in reader.pages]


def _reject_oversized_ooxml(file_bytes: bytes) -> None:
    """Office files are zip archives - a small one can expand to something
    huge once parsed. The entries declare their own uncompressed sizes, so
    this reads them without decompressing anything."""
    try:
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
            total = sum(entry.file_size for entry in archive.infolist())
    except zipfile.BadZipFile as error:
        raise ValueError("This file isn't a readable Office document.") from error

    if total > MAX_OOXML_UNCOMPRESSED_BYTES:
        raise ValueError(
            f"This document expands to {total / 1_048_576:.0f} MB, over the "
            f"{MAX_OOXML_UNCOMPRESSED_BYTES / 1_048_576:.0f} MB limit Smart Search can read."
        )


def _extract_pptx(file_bytes: bytes) -> list[str]:
    """One string per slide, including speaker notes."""
    _reject_oversized_ooxml(file_bytes)
    presentation = Presentation(io.BytesIO(file_bytes))

    slides = []
    for slide in presentation.slides:
        parts = [shape.text for shape in slide.shapes if shape.has_text_frame and shape.text.strip()]

        if slide.has_notes_slide:
            notes = slide.notes_slide.notes_text_frame
            if notes is not None and notes.text.strip():
                parts.append(notes.text)

        slides.append("\n".join(parts))
    return slides


def _extract_slides_text(file_bytes: bytes) -> list[str]:
    """One string per slide, from the text the Slides API gave: each shape's text, then the speaker notes - as
    _extract_pptx writes them. Every slide has its own unit, empty or not, so a unit's place is its slide's place."""
    try:
        slides = json.loads(file_bytes)["slides"]
        units = []
        for slide in slides:
            parts = [text for text in slide["texts"] if text.strip()]
            if slide["notes"].strip():
                parts.append(slide["notes"])
            units.append("\n".join(parts))
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        raise ValueError("The slides' text could not be read.") from error
    return units


def _iter_docx_blocks(document):
    """Yields paragraphs and tables in document order."""
    for child in document.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, document)
        elif child.tag == qn("w:tbl"):
            yield Table(child, document)


def _sections(blocks) -> tuple[list[str], list[str | None]]:
    """Heading-delimited sections from (is_heading, text, table_rows) blocks; table_rows is None for a paragraph."""
    sections: list[str] = []
    headings: list[str | None] = []
    current: list[str] = []
    current_heading: str | None = None
    for is_heading, text, table_rows in blocks:
        if table_rows is not None:
            rows = [", ".join(cell.strip() for cell in row if cell.strip()) for row in table_rows]
            current.extend(row for row in rows if row)
            continue

        text = text.strip()
        if not text:
            continue

        if is_heading:
            if current:
                sections.append("\n".join(current))
                headings.append(current_heading)
                current = []
            current_heading = text
        current.append(text)

    if current:
        sections.append("\n".join(current))
        headings.append(current_heading)
    return sections, headings


def _extract_docx(file_bytes: bytes) -> tuple[list[str], list[str | None]]:
    """One string per heading-delimited section, plus each section's heading."""
    _reject_oversized_ooxml(file_bytes)
    document = Document(io.BytesIO(file_bytes))

    def blocks():
        for block in _iter_docx_blocks(document):
            if isinstance(block, Table):
                yield False, "", [[cell.text for cell in row.cells] for row in block.rows]
            else:
                yield block.style.name.startswith("Heading"), block.text, None

    return _sections(blocks())


def _docs_text_blocks(file_bytes: bytes) -> list[tuple[bool, str, list[list[str]] | None]]:
    """The blocks of a document as the Docs API gave them: (is_heading, text, table_rows)."""
    try:
        blocks = []
        for block in json.loads(file_bytes)["blocks"]:
            rows = block.get("rows")
            if rows is not None:
                if not all(isinstance(cell, str) for row in rows for cell in row):
                    raise TypeError("a table cell is not text")
                blocks.append((False, "", rows))
                continue
            text = block.get("text", "")
            if not isinstance(text, str):
                raise TypeError("a paragraph is not text")
            # Google writes a line break inside a paragraph as a vertical tab; a Word file writes it as a new line
            blocks.append((block.get("heading") is True, text.replace("\u000b", "\n"), None))
        return blocks
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        raise ValueError("The document's text could not be read.") from error


def _extract_docs_text(file_bytes: bytes) -> tuple[list[str], list[str | None]]:
    """The same sections _extract_docx finds, from the text the Docs API gave."""
    return _sections(_docs_text_blocks(file_bytes))


def _extract_sheets_text(file_bytes: bytes) -> list[str]:
    """One string per sheet, already written by sheets_api.py as _extract_xlsx writes them."""
    try:
        units = json.loads(file_bytes)["units"]
        if not all(isinstance(unit, str) for unit in units):
            raise TypeError("a sheet is not text")
    except (ValueError, KeyError, TypeError) as error:
        raise ValueError("The spreadsheet's text could not be read.") from error
    return units


_TIMESTAMP_LINE = re.compile(r"^\d{1,2}(:\d{2}){1,2}$")


def _timestamp_to_seconds(text: str) -> int | None:
    """None for a line that matches the shape of a timestamp but isn't a valid one, e.g. 1:65."""
    parts = [int(part) for part in text.split(":")]
    if any(part >= 60 for part in parts[1:]):
        return None
    seconds = 0
    for part in parts:
        seconds = seconds * 60 + part
    return seconds


def _transcript_segments(lines: list[str]) -> tuple[list[str], list[str | None]]:
    segments: list[str] = []
    timestamps: list[str | None] = []
    current: list[str] = []
    current_timestamp: str | None = None
    for line in lines:
        if not line:
            continue
        seconds = _timestamp_to_seconds(line) if _TIMESTAMP_LINE.match(line) else None
        if seconds is not None:
            if current:
                segments.append("\n".join(current))
                timestamps.append(current_timestamp)
                current = []
            current_timestamp = str(seconds)
            continue
        current.append(line)

    if current:
        segments.append("\n".join(current))
        timestamps.append(current_timestamp)
    return segments, timestamps


def _extract_transcript(file_bytes: bytes) -> tuple[list[str], list[str | None]]:
    """One string per timestamp-delimited segment, plus each segment's start time in seconds."""
    _reject_oversized_ooxml(file_bytes)
    document = Document(io.BytesIO(file_bytes))

    lines: list[str] = []
    for block in _iter_docx_blocks(document):
        if isinstance(block, Table):
            lines.extend(
                ", ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                for row in block.rows
            )
            continue
        lines.extend(line.strip() for line in block.text.split("\n"))
    return _transcript_segments(lines)


def _extract_docs_transcript(file_bytes: bytes) -> tuple[list[str], list[str | None]]:
    """The same segments _extract_transcript finds, from the text the Docs API gave."""
    lines: list[str] = []
    for _, text, table_rows in _docs_text_blocks(file_bytes):
        if table_rows is not None:
            lines.extend(", ".join(cell.strip() for cell in row if cell.strip()) for row in table_rows)
        else:
            lines.extend(line.strip() for line in text.split("\n"))
    return _transcript_segments(lines)


# How far down a sheet to look for its header row - titles and notes above a table are only a few rows.
_XLSX_HEADER_SEARCH_ROWS = 10


def _filled_cells(row) -> list[str]:
    return [str(value).strip() for value in row if value is not None and str(value).strip()]


def _looks_like_header_row(row) -> bool:
    """Two or more filled cells, made of text and month-style dates - plain numbers mean it's data, not column names."""
    filled = [value for value in row if value is not None and str(value).strip()]
    return (
        len(filled) >= 2
        and all(isinstance(value, (str, datetime.date)) for value in filled)
        and any(isinstance(value, str) for value in filled)
    )


def _header_name(value) -> str:
    """A column name. A first-of-the-month date (a "July 2026" column that Excel stored as a date) reads as the month."""
    if isinstance(value, datetime.datetime) and value.day == 1 and value.time() == datetime.time():
        return value.strftime("%B %Y")
    if isinstance(value, datetime.date) and not isinstance(value, datetime.datetime) and value.day == 1:
        return value.strftime("%B %Y")
    return str(value).strip() if value is not None else ""


class SheetTextTooLong(ValueError):
    """A sheet's text went over the size it was allowed (see sheet_text)."""


def sheet_text(title: str, rows: Iterator, max_chars: Optional[int] = None) -> str:
    """One sheet written as lines of "Header: value" pairs; rows are tuples of cell values. A title above the table is
    kept as plain text. SheetTextTooLong as soon as the text written goes over max_chars, when that is given: every
    pair repeats its column name, so the text can be far larger than the cells it comes from."""
    scanned = list(itertools.islice(rows, _XLSX_HEADER_SEARCH_ROWS))
    if not scanned:
        return ""
    # Rows above the table (a title, notes) have at most one filled cell, so the first row with two or more
    # is the header - but only when it's text (month-style dates allowed) and everything above it is text
    # too. Anything less certain keeps the first row as the header, as it always was.
    first_wide_row = next((i for i, row in enumerate(scanned) if len(_filled_cells(row)) >= 2), 0)
    titles_are_text = all(
        isinstance(value, str) for row in scanned[:first_wide_row] for value in row if _filled_cells([value])
    )
    header_at = first_wide_row if titles_are_text and _looks_like_header_row(scanned[first_wide_row]) else 0
    headers = scanned[header_at]
    header_names = [_header_name(h) for h in headers]

    lines = [f"Sheet: {title}"]
    for above in scanned[:header_at]:
        lines.extend(_filled_cells(above))
    if header_at:
        # It may really be data, so it stays searchable as plain text.
        lines.append(", ".join(_header_name(h) for h in headers if _header_name(h)))
    written = sum(len(line) + 1 for line in lines)
    for row in itertools.chain(scanned[header_at + 1:], rows):
        pairs = [
            f"{name}: {value}"
            for name, value in zip(header_names, row)
            if name and value is not None and str(value).strip()
        ]
        if pairs:
            line = ", ".join(pairs)
            written += len(line) + 1
            if max_chars is not None and written > max_chars:
                raise SheetTextTooLong("The sheet's text is over the size it was allowed.")
            lines.append(line)
    return "\n".join(lines)


def _extract_xlsx(file_bytes: bytes) -> list[str]:
    """One string per sheet, rows written as "Header: value" pairs. A title above the table is kept as plain text."""
    _reject_oversized_ooxml(file_bytes)
    workbook = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)
    sheets = [sheet_text(worksheet.title, worksheet.iter_rows(values_only=True)) for worksheet in workbook.worksheets]
    workbook.close()
    return sheets


def _extract_webpage(file_bytes: bytes) -> list[str]:
    """Already-extracted page text, passed through as one single unit - a webpage has no natural pages."""
    return [file_bytes.decode("utf-8")]


_EXTRACTORS = {
    "pdf": _extract_pdf,
    "pptx": _extract_pptx,
    "slides_text": _extract_slides_text,
    "docx": _extract_docx,
    "xlsx": _extract_xlsx,
    "docs_text": _extract_docs_text,
    "sheets_text": _extract_sheets_text,
    "webpage": _extract_webpage,
    "transcript": _extract_transcript,
    "docs_transcript": _extract_docs_transcript,
}

_EXTRACTORS_WITH_UNIT_METADATA = {"docx", "docs_text", "transcript", "docs_transcript"}


def extract_units(file_bytes: bytes, extension: str) -> tuple[list[str], list[str | None]]:
    """One string per piece of the document, plus each piece's heading (docx) or start time (transcript)."""
    result = _EXTRACTORS[extension](file_bytes)
    if extension in _EXTRACTORS_WITH_UNIT_METADATA:
        return result
    return result, [None] * len(result)


def chunk_document(file_bytes: bytes, extension: str) -> tuple[list[Chunk], list[str | None]]:
    """Extract -> join -> split -> tag with page -> drop short chunks.
    Also returns each unit's heading, for building deep links."""
    unit_texts, unit_headings = extract_units(file_bytes, extension)

    full_text = ""
    unit_start_offsets: list[int] = []
    for unit_text in unit_texts:
        unit_start_offsets.append(len(full_text))
        full_text += unit_text + "\n"

    if not full_text.strip():
        raise ValueError("No readable text found in this document")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=MAX_CHUNK_SIZE,
        chunk_overlap=MAX_CHUNK_OVERLAP,
    )
    raw_chunks = splitter.split_text(full_text)

    # Chunks come back in document order, so each one starts at or after the
    # previous one. Searching from there stops repeated text (a boilerplate
    # slide, a repeated header) from matching its first occurrence and
    # reporting the wrong page. The cursor advances for skipped chunks too.
    chunks: list[Chunk] = []
    search_from = 0
    for text in raw_chunks:
        offset = full_text.find(text, search_from)
        if offset == -1:
            offset = full_text.find(text)
        if offset != -1:
            search_from = offset + 1

        if len(text.strip()) < MIN_CHUNK_LENGTH:
            continue
        moments = None
        if extension == "transcript" and offset != -1:
            end = offset + len(text)
            moments = [
                (unit_headings[i], unit_texts[i])
                for i, start in enumerate(unit_start_offsets)
                if offset <= start < end and unit_headings[i] is not None
            ] or None
        chunks.append(Chunk(text=text, page=find_page_number(offset, unit_start_offsets), moments=moments))
    return chunks, unit_headings


def find_page_number(offset: int, unit_start_offsets: list[int]) -> int:
    """Which piece a chunk came from, by its offset in the joined text."""
    if offset == -1:
        return 1

    page = 1
    for i, start in enumerate(unit_start_offsets):
        if start <= offset:
            page = i + 1
        else:
            break
    return page
