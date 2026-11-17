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

"""Reading each kind of document into pieces (pages, slides, sections, sheets, moments) and cutting them into chunks."""

import datetime
import io
import json

import pytest
from docx import Document
from openpyxl import Workbook
from pptx import Presentation
from pptx.util import Inches

import indexing.chunking as chunking
from config import MAX_CHUNK_SIZE, MIN_CHUNK_LENGTH
from helpers import make_pdf


def docx_bytes(build) -> bytes:
    document = Document()
    build(document)
    output = io.BytesIO()
    document.save(output)
    return output.getvalue()


def pptx_bytes(slides: list[tuple[list[str], str | None]]) -> bytes:
    """Each slide is (texts, speaker notes)."""
    presentation = Presentation()
    for texts, notes in slides:
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        for number, text in enumerate(texts):
            slide.shapes.add_textbox(Inches(1), Inches(1 + number), Inches(5), Inches(1)).text_frame.text = text
        if notes:
            slide.notes_slide.notes_text_frame.text = notes
    output = io.BytesIO()
    presentation.save(output)
    return output.getvalue()


def xlsx_bytes(sheets: dict[str, list[tuple]]) -> bytes:
    workbook = Workbook()
    workbook.remove(workbook.active)
    for title, rows in sheets.items():
        sheet = workbook.create_sheet(title)
        for row in rows:
            sheet.append(list(row))
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def sentences(topic: str, count: int) -> str:
    return " ".join(f"The {topic} notes explain point number {number} in plain words." for number in range(count))


# ---- one piece per page, slide, section or sheet


def test_a_pdf_gives_one_piece_per_page():
    units, headings = chunking.extract_units(make_pdf(["First page text", "Second page text"]), "pdf")
    assert [unit.strip() for unit in units] == ["First page text", "Second page text"]
    assert headings == [None, None]


def test_a_pdf_page_with_no_text_still_counts_as_a_page():
    units, _ = chunking.extract_units(make_pdf(["First", "", "Third"]), "pdf")
    assert [unit.strip() for unit in units] == ["First", "", "Third"]


def test_a_pptx_gives_one_piece_per_slide_with_the_speaker_notes_after_the_text():
    data = pptx_bytes([(["Title", "Subtitle"], "Say this out loud"), (["Second slide"], None), ([], None)])
    units, headings = chunking.extract_units(data, "pptx")
    assert units == ["Title\nSubtitle\nSay this out loud", "Second slide", ""]
    assert headings == [None, None, None]


def test_a_docx_is_split_at_its_headings_and_remembers_them():
    def build(document):
        document.add_paragraph("Before any heading")
        document.add_heading("Pricing", level=1)
        document.add_paragraph("Plans start small.")
        document.add_paragraph("")
        document.add_heading("Support", level=2)
        document.add_paragraph("We answer quickly.")

    units, headings = chunking.extract_units(docx_bytes(build), "docx")
    assert units == ["Before any heading", "Pricing\nPlans start small.", "Support\nWe answer quickly."]
    assert headings == [None, "Pricing", "Support"]


def test_a_docx_table_is_written_as_comma_separated_rows_inside_its_section():
    def build(document):
        document.add_heading("Plans", level=1)
        table = document.add_table(rows=2, cols=3)
        for row, values in enumerate([("Name", "Seats", ""), ("Basic", "5", "monthly")]):
            for column, value in enumerate(values):
                table.cell(row, column).text = value

    units, headings = chunking.extract_units(docx_bytes(build), "docx")
    assert units == ["Plans\nName, Seats\nBasic, 5, monthly"]
    assert headings == ["Plans"]


def test_an_xlsx_gives_one_piece_per_sheet_written_as_header_value_pairs():
    data = xlsx_bytes(
        {
            "Sales": [("Product", "Units"), ("Choreo", 12), ("Asgardeo", None), (None, None)],
            "Empty": [],
        }
    )
    units, _ = chunking.extract_units(data, "xlsx")
    assert units == ["Sheet: Sales\nProduct: Choreo, Units: 12\nProduct: Asgardeo", ""]


# ---- the xlsx header row


def test_a_title_above_a_table_is_kept_as_text_and_the_header_is_found_below_it():
    rows = [("Quarterly report", None, None), (None, None, None), ("Region", "Revenue", "Owner"), ("EMEA", 5, "Ann")]
    assert chunking.sheet_text("Q1", iter(rows)) == (
        "Sheet: Q1\nQuarterly report\nRegion, Revenue, Owner\nRegion: EMEA, Revenue: 5, Owner: Ann"
    )


def test_a_first_row_of_plain_numbers_is_data_not_a_header():
    text = chunking.sheet_text("Numbers", iter([(1, 2), (3, 4)]))
    assert text == "Sheet: Numbers\n1: 3, 2: 4"


def test_a_column_header_stored_as_the_first_of_a_month_reads_as_the_month():
    rows = [("Product", datetime.datetime(2026, 7, 1)), ("Choreo", 3)]
    assert chunking.sheet_text("Months", iter(rows)) == "Sheet: Months\nProduct: Choreo, July 2026: 3"


def test_a_sheet_with_no_rows_gives_no_text():
    assert chunking.sheet_text("Nothing", iter([])) == ""


def test_a_sheet_whose_text_grows_past_the_allowed_size_is_stopped():
    rows = [("Name", "Value")] + [(f"row{number}", "x" * 50) for number in range(100)]
    with pytest.raises(chunking.SheetTextTooLong):
        chunking.sheet_text("Big", iter(rows), max_chars=500)
    assert chunking.sheet_text("Big", iter(rows), max_chars=1_000_000).startswith("Sheet: Big\nName: row0")


# ---- the text the Google APIs give instead of a file


def test_slides_text_from_the_slides_api_matches_what_a_pptx_gives():
    data = json.dumps(
        {"slides": [{"texts": ["Title", "  ", "Subtitle"], "notes": "Notes here"}, {"texts": [], "notes": ""}]}
    ).encode()
    units, _ = chunking.extract_units(data, "slides_text")
    assert units == ["Title\nSubtitle\nNotes here", ""]


def test_docs_text_is_split_at_headings_like_a_docx():
    data = json.dumps(
        {
            "blocks": [
                {"text": "Intro paragraph"},
                {"text": "Pricing", "heading": True},
                {"text": "Plans start small.\u000bSecond line"},
                {"rows": [["Name", "Seats"], ["Basic", "5"]]},
            ]
        }
    ).encode()
    units, headings = chunking.extract_units(data, "docs_text")
    assert units == ["Intro paragraph", "Pricing\nPlans start small.\nSecond line\nName, Seats\nBasic, 5"]
    assert headings == [None, "Pricing"]


def test_sheets_text_passes_the_sheets_through():
    units, headings = chunking.extract_units(json.dumps({"units": ["Sheet: A", "Sheet: B"]}).encode(), "sheets_text")
    assert units == ["Sheet: A", "Sheet: B"]
    assert headings == [None, None]


@pytest.mark.parametrize(
    "extension, payload",
    [
        ("slides_text", b"not json"),
        ("slides_text", json.dumps({"nothing": []}).encode()),
        ("slides_text", json.dumps({"slides": [{"texts": "oops", "notes": 5}]}).encode()),
        ("docs_text", b"not json"),
        ("docs_text", json.dumps({"blocks": [{"text": 5}]}).encode()),
        ("docs_text", json.dumps({"blocks": [{"rows": [[1]]}]}).encode()),
        ("sheets_text", b"not json"),
        ("sheets_text", json.dumps({"units": [1, 2]}).encode()),
        ("sheets_text", json.dumps({}).encode()),
    ],
)
def test_text_from_the_google_apis_that_cannot_be_read_is_refused_with_a_clear_error(extension, payload):
    with pytest.raises(ValueError, match="could not be read"):
        chunking.extract_units(payload, extension)


# ---- transcripts


def test_timestamps_become_seconds_and_impossible_ones_are_not_timestamps():
    assert chunking._timestamp_to_seconds("0:05") == 5
    assert chunking._timestamp_to_seconds("1:05") == 65
    assert chunking._timestamp_to_seconds("1:02:03") == 3723
    assert chunking._timestamp_to_seconds("1:65") is None
    assert chunking._timestamp_to_seconds("0:60") is None


def test_a_transcript_is_split_at_its_timestamps():
    def build(document):
        for line in [
            "0:05",
            "Welcome everyone.",
            "Today we talk about APIs.",
            "1:30",
            "Next, security.",
            "2:99",
            "7:45",
        ]:
            document.add_paragraph(line)

    units, starts = chunking.extract_units(docx_bytes(build), "transcript")
    # "2:99" is not a real time, so it stays as text; "7:45" has nothing after it, so it adds no segment
    assert units == ["Welcome everyone.\nToday we talk about APIs.", "Next, security.\n2:99"]
    assert starts == ["5", "90"]


def test_a_docs_transcript_matches_a_docx_transcript():
    data = json.dumps({"blocks": [{"text": "0:05\nWelcome."}, {"text": "1:30"}, {"text": "Next part."}]}).encode()
    units, starts = chunking.extract_units(data, "docs_transcript")
    assert units == ["Welcome.", "Next part."]
    assert starts == ["5", "90"]


def test_a_chunk_of_a_transcript_lists_every_moment_it_spans():
    def build(document):
        for minute in range(0, 6):
            document.add_paragraph(f"{minute}:00")
            document.add_paragraph(f"Moment {minute}: " + "talking about the product roadmap in detail " * 3)

    chunks, starts = chunking.chunk_document(docx_bytes(build), "transcript")
    assert starts == ["0", "60", "120", "180", "240", "300"]
    spanned = [moment[0] for chunk in chunks for moment in (chunk.moments or [])]
    assert spanned[0] == "0" and "300" in spanned
    assert all(isinstance(moment[1], str) for chunk in chunks for moment in (chunk.moments or []))


# ---- the size guard on office files


def test_a_file_that_is_not_a_zip_is_refused_as_an_unreadable_office_document():
    for extension in ("docx", "pptx", "xlsx", "transcript"):
        with pytest.raises(ValueError, match="isn't a readable Office document"):
            chunking.extract_units(b"this is not a zip file", extension)


def test_an_office_file_that_would_expand_too_much_is_refused_before_it_is_opened(monkeypatch):
    data = docx_bytes(lambda document: document.add_paragraph("hello"))
    monkeypatch.setattr(chunking, "MAX_OOXML_UNCOMPRESSED_BYTES", 1000)
    with pytest.raises(ValueError, match="over the .* limit"):
        chunking.extract_units(data, "docx")


# ---- cutting into chunks


def test_a_long_page_is_cut_into_chunks_no_longer_than_the_limit_and_all_on_its_page():
    chunks, headings = chunking.chunk_document(sentences("pricing", 60).encode(), "webpage")
    assert len(chunks) > 1
    assert all(len(chunk.text) <= MAX_CHUNK_SIZE for chunk in chunks)
    assert {chunk.page for chunk in chunks} == {1}
    assert headings == [None]


def test_text_that_is_too_short_to_be_useful_gives_no_chunks_but_is_not_an_error():
    assert len("short") < MIN_CHUNK_LENGTH
    assert chunking.chunk_document(b"short", "webpage") == ([], [None])


def test_a_document_with_no_text_at_all_is_an_error():
    with pytest.raises(ValueError, match="No readable text found"):
        chunking.chunk_document(b"   \n  ", "webpage")
    with pytest.raises(ValueError, match="No readable text found"):
        chunking.chunk_document(make_pdf(["", ""]), "pdf")


@pytest.fixture
def one_chunk_per_piece(monkeypatch):
    """Small chunks with no overlap, so a piece of about 300 characters fills exactly one chunk."""
    monkeypatch.setattr(chunking, "MAX_CHUNK_SIZE", 400)
    monkeypatch.setattr(chunking, "MAX_CHUNK_OVERLAP", 0)
    monkeypatch.setattr(chunking, "MIN_CHUNK_LENGTH", 10)


def slides_text(*slides: list[str]) -> bytes:
    return json.dumps({"slides": [{"texts": texts, "notes": ""} for texts in slides]}).encode()


def line(text: str) -> str:
    return text.ljust(120, ".")


def test_each_chunk_knows_which_page_it_came_from(one_chunk_per_piece):
    data = make_pdf([line("alpha page " * 20)[:250], line("beta page " * 20)[:250], line("gamma page " * 20)[:250]])
    chunks, _ = chunking.chunk_document(data, "pdf")
    assert [(chunk.text.split()[0], chunk.page) for chunk in chunks] == [("alpha", 1), ("beta", 2), ("gamma", 3)]


def test_repeated_text_on_later_slides_is_not_credited_to_the_first_slide(one_chunk_per_piece):
    same = [
        line("The same boilerplate line one"),
        line("The same boilerplate line two"),
        line("The same boilerplate line three"),
    ]
    chunks, _ = chunking.chunk_document(slides_text(same, same, same), "slides_text")
    assert len({chunk.text for chunk in chunks}) == 1
    assert [chunk.page for chunk in chunks] == [1, 2, 3]


def test_a_chunk_that_starts_on_a_slide_is_credited_to_that_slide_even_when_it_runs_on(monkeypatch):
    monkeypatch.setattr(chunking, "MIN_CHUNK_LENGTH", 10)
    first = [line(f"First slide line {number}") for number in range(5)]
    second = [line(f"Second slide line {number}") for number in range(5)]
    chunks, _ = chunking.chunk_document(slides_text(first, second), "slides_text")
    assert chunks[0].page == 1
    assert chunks[-1].page == 2
    assert [chunk.page for chunk in chunks] == sorted(chunk.page for chunk in chunks)


def test_headings_of_a_docx_come_back_with_the_chunks_for_deep_links(one_chunk_per_piece):
    def build(document):
        document.add_heading("Pricing", level=1)
        document.add_paragraph(line("Plans start small"))
        document.add_paragraph(line("and grow with you"))
        document.add_heading("Support", level=1)
        document.add_paragraph(line("We answer quickly"))
        document.add_paragraph(line("every working day"))

    chunks, headings = chunking.chunk_document(docx_bytes(build), "docx")
    assert headings == ["Pricing", "Support"]
    assert [chunk.page for chunk in chunks] == [1, 2]


def test_find_page_number_picks_the_last_piece_that_starts_at_or_before_the_offset():
    starts = [0, 100, 250]
    assert chunking.find_page_number(0, starts) == 1
    assert chunking.find_page_number(99, starts) == 1
    assert chunking.find_page_number(100, starts) == 2
    assert chunking.find_page_number(1000, starts) == 3
    assert chunking.find_page_number(-1, starts) == 1


def test_every_kind_of_document_the_service_accepts_has_a_label_for_its_pieces():
    assert set(chunking.UNIT_LABELS) == set(chunking._EXTRACTORS)
