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

"""Reads an uploaded document, joins its pieces back into one continuous
piece of text, and chunks *that* by actual paragraph boundaries rather than
by piece - splitting piece-by-piece would cut a paragraph in two if it
happened to straddle a boundary. Each resulting chunk is still tagged with
the piece it came from, worked out afterwards from where it sits in the
joined text, so search results can still point back to a specific place.

Every supported format is reduced to the same shape here - an ordered list
of text pieces - so that everything downstream (chunking, embedding,
storing, searching, generating an answer) is completely unaware of what
kind of file it originally came from. Only the extractors below differ.

What one "piece" means depends on the format, because the formats
genuinely differ:
  - PDF   -> a page.
  - PPTX  -> a slide.
  - DOCX  -> a section, split at headings. Word files have no page numbers
             to report: .docx does not store pages at all, pagination is
             decided when the document is rendered, based on the fonts,
             margins and paper size in use. Headings are the most stable
             locator the format actually offers.
  - XLSX  -> a sheet tab, with each row written out as "Header: value"
             pairs so a row carries some meaning on its own rather than
             being a bare list of numbers.
"""

import io
from dataclasses import dataclass
from datetime import date, datetime, time

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openpyxl import load_workbook
from pptx import Presentation
from pypdf import PdfReader

from config import MAX_CHUNK_OVERLAP, MAX_CHUNK_SIZE, MIN_CHUNK_LENGTH

# What one piece of each format is called, for display in search results -
# "Slide 7" is meaningful to a person in a way "Page 7" is not, when the
# thing they will open is a slide deck.
UNIT_LABELS = {
    "pdf": "Page",
    "pptx": "Slide",
    "docx": "Section",
    "xlsx": "Sheet",
}

SUPPORTED_EXTENSIONS = tuple(UNIT_LABELS)


@dataclass
class Chunk:
    text: str
    page: int


def _extract_pdf(file_bytes: bytes) -> list[str]:
    """One string per page, in order."""
    reader = PdfReader(io.BytesIO(file_bytes))
    return [page.extract_text() or "" for page in reader.pages]


def _extract_pptx(file_bytes: bytes) -> list[str]:
    """One string per slide: every shape that holds text, joined in the
    order the shapes appear. Speaker notes are included too - they often
    carry the actual explanation behind a sparse slide."""
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


def _iter_docx_blocks(document):
    """Yields a Word document's paragraphs and tables in the order they
    actually appear. python-docx exposes .paragraphs and .tables as two
    separate lists, which loses how they were interleaved - a table sitting
    at the end of the document would otherwise be reported as if it came
    before the last few paragraphs, and so be tagged with the wrong
    section number. Walking the body's own child elements preserves the
    real order."""
    for child in document.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, document)
        elif child.tag == qn("w:tbl"):
            yield Table(child, document)


def _extract_docx(file_bytes: bytes) -> list[str]:
    """One string per heading-delimited section. Word documents have no
    page numbers to extract (see the module docstring), so the document is
    divided at its headings instead - the nearest thing to a stable,
    meaningful location the format offers. A document with no headings at
    all comes back as a single section. Tables are kept inline, in place,
    since they hold real content in a lot of Word documents."""
    document = Document(io.BytesIO(file_bytes))

    sections: list[str] = []
    current: list[str] = []
    for block in _iter_docx_blocks(document):
        if isinstance(block, Table):
            rows = [
                ", ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                for row in block.rows
            ]
            current.extend(row for row in rows if row)
            continue

        text = block.text.strip()
        if not text:
            continue

        if block.style.name.startswith("Heading") and current:
            sections.append("\n".join(current))
            current = []
        current.append(text)

    if current:
        sections.append("\n".join(current))
    return sections


def _extract_xlsx(file_bytes: bytes) -> list[str]:
    """One string per sheet tab. Each row is written out as
    "Header: value, Header: value" using the first row as headers, so that
    a row means something on its own - the bare "Q3, 4521, 8.2%" that a
    spreadsheet actually stores carries almost nothing for a search to
    match against, since the meaning lives in the column headings rather
    than in the cells themselves."""
    workbook = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)

    sheets = []
    for worksheet in workbook.worksheets:
        rows = worksheet.iter_rows(values_only=True)

        headers = next(rows, None)
        if headers is None:
            sheets.append("")
            continue
        header_names = [str(h).strip() if h is not None else "" for h in headers]

        lines = [f"Sheet: {worksheet.title}"]
        for row in rows:
            pairs = [
                f"{name}: {value}"
                for name, value in zip(header_names, row)
                if name and value is not None and str(value).strip()
            ]
            if pairs:
                lines.append(", ".join(pairs))
        sheets.append("\n".join(lines))

    workbook.close()
    return sheets


_EXTRACTORS = {
    "pdf": _extract_pdf,
    "pptx": _extract_pptx,
    "docx": _extract_docx,
    "xlsx": _extract_xlsx,
}


def normalize_extension(file_name: str) -> str:
    """Pulls a lowercase extension out of a file name, and rejects
    anything this service cannot read. Note that only the modern XML-based
    Office formats are supported - the legacy .ppt/.doc/.xls files are an
    entirely different binary format that these libraries cannot open."""
    extension = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if extension not in SUPPORTED_EXTENSIONS:
        supported = ", ".join(f".{e}" for e in SUPPORTED_EXTENSIONS)
        raise ValueError(f"Unsupported file type '.{extension}'. Supported types are: {supported}")
    return extension


def extract_units(file_bytes: bytes, extension: str) -> list[str]:
    """One string per piece of the document, in order - see the module
    docstring for what a "piece" means per format."""
    return _EXTRACTORS[extension](file_bytes)


def chunk_document(file_bytes: bytes, extension: str) -> list[Chunk]:
    """Full pipeline: extract -> join -> split -> tag with a piece number
    -> drop anything too short to be meaningfully searched."""
    unit_texts = extract_units(file_bytes, extension)

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

    chunks: list[Chunk] = []
    for text in raw_chunks:
        if len(text.strip()) < MIN_CHUNK_LENGTH:
            continue
        chunks.append(Chunk(text=text, page=find_page_number(full_text, text, unit_start_offsets)))
    return chunks


def find_page_number(full_text: str, chunk_text: str, unit_start_offsets: list[int]) -> int:
    """Works out which piece (page/slide/section/sheet) a chunk of text
    came from, based on where it sits inside the full joined document.
    Falls back to 1 if the exact text can't be located (shouldn't normally
    happen, since a chunk is a literal slice of full_text)."""
    offset = full_text.find(chunk_text)
    if offset == -1:
        return 1

    page = 1
    for i, start in enumerate(unit_start_offsets):
        if start <= offset:
            page = i + 1
        else:
            break
    return page


def _format_cell(value) -> str:
    """A cell as it should read on screen. Dates arrive as full timestamps
    ("2026-10-01 00:00:00") even when the sheet only ever showed a date, so
    the empty time part is trimmed off."""
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d") if value.time() == time.min else value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, date):
        return value.strftime("%Y-%m-%d")
    return str(value)


def read_sheet_grid(file_bytes: bytes, max_rows: int) -> list[dict]:
    """Reads a spreadsheet as a plain grid of cells, for *displaying* it.

    Deliberately separate from _extract_xlsx above, which rewrites rows as
    "Header: value" text so they carry meaning for a search. This one keeps
    the original row-and-column shape, because that's what a person expects
    to look at.

    Done here rather than in the browser because this service already reads
    the file anyway - parsing it a second time in JavaScript would have
    meant shipping a large spreadsheet library to every user just to redo
    work that has already happened."""
    workbook = load_workbook(io.BytesIO(file_bytes), read_only=True, data_only=True)

    sheets = []
    for worksheet in workbook.worksheets:
        rows = []
        for row in worksheet.iter_rows(values_only=True):
            if len(rows) >= max_rows:
                break
            cells = [_format_cell(value) for value in row]
            # Trailing empty cells are padding from the sheet's used range,
            # not real columns - drop them so the table isn't full of gaps.
            while cells and not cells[-1].strip():
                cells.pop()
            if cells:
                rows.append(cells)
        sheets.append({"name": worksheet.title, "rows": rows})

    workbook.close()
    return sheets
