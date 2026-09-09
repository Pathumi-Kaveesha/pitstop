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

"""Reads an uploaded PDF, joins every page back into one continuous piece
of text, and chunks *that* by actual paragraph boundaries rather than by
page - a page-by-page split would cut a paragraph in two if it happened to
straddle a page break. Each resulting chunk still gets tagged with the page
it came from, worked out afterwards from where it sits in the joined text,
so search results can still point back to a specific page."""

import io
from dataclasses import dataclass

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

from config import MAX_CHUNK_OVERLAP, MAX_CHUNK_SIZE, MIN_CHUNK_LENGTH


@dataclass
class Chunk:
    text: str
    page: int


def extract_pages(pdf_bytes: bytes) -> list[str]:
    """One string per page, in order."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    return [page.extract_text() or "" for page in reader.pages]


def chunk_document(pdf_bytes: bytes) -> list[Chunk]:
    """Full pipeline: extract -> join -> split -> tag with page -> drop
    anything too short to be meaningfully searched."""
    page_texts = extract_pages(pdf_bytes)

    full_text = ""
    page_start_offsets: list[int] = []
    for page_text in page_texts:
        page_start_offsets.append(len(full_text))
        full_text += page_text + "\n"

    if not full_text.strip():
        raise ValueError("No readable text found in this PDF")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=MAX_CHUNK_SIZE,
        chunk_overlap=MAX_CHUNK_OVERLAP,
    )
    raw_chunks = splitter.split_text(full_text)

    chunks: list[Chunk] = []
    for text in raw_chunks:
        if len(text.strip()) < MIN_CHUNK_LENGTH:
            continue
        chunks.append(Chunk(text=text, page=find_page_number(full_text, text, page_start_offsets)))
    return chunks


def find_page_number(full_text: str, chunk_text: str, page_start_offsets: list[int]) -> int:
    """Works out which page a chunk of text came from, based on where it
    sits inside the full joined document. Falls back to page 1 if the exact
    text can't be located (shouldn't normally happen, since a chunk is a
    literal slice of full_text)."""
    offset = full_text.find(chunk_text)
    if offset == -1:
        return 1

    page = 1
    for i, start in enumerate(page_start_offsets):
        if start <= offset:
            page = i + 1
        else:
            break
    return page
