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

import io
from dataclasses import dataclass

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph
from langchain_text_splitters import RecursiveCharacterTextSplitter
from openpyxl import load_workbook
from pptx import Presentation
from pypdf import PdfReader

from config import MAX_CHUNK_OVERLAP, MAX_CHUNK_SIZE, MIN_CHUNK_LENGTH

UNIT_LABELS = {
    "pdf": "Page",
    "pptx": "Slide",
    "docx": "Section",
    "xlsx": "Sheet",
}

@dataclass
class Chunk:
    text: str
    page: int


def _extract_pdf(file_bytes: bytes) -> list[str]:
    """One string per page."""
    reader = PdfReader(io.BytesIO(file_bytes))
    return [page.extract_text() or "" for page in reader.pages]


def _extract_pptx(file_bytes: bytes) -> list[str]:
    """One string per slide, including speaker notes."""
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
    """Yields paragraphs and tables in document order."""
    for child in document.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, document)
        elif child.tag == qn("w:tbl"):
            yield Table(child, document)


def _extract_docx(file_bytes: bytes) -> list[str]:
    """One string per heading-delimited section."""
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
    """One string per sheet, rows written as "Header: value" pairs."""
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


def extract_units(file_bytes: bytes, extension: str) -> list[str]:
    """One string per piece of the document, in order."""
    return _EXTRACTORS[extension](file_bytes)


def chunk_document(file_bytes: bytes, extension: str) -> list[Chunk]:
    """Extract -> join -> split -> tag with page -> drop short chunks."""
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
    """Which piece a chunk came from, by its offset in the joined text."""
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
