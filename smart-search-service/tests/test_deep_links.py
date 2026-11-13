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

"""The links that open a result at the right spot: a video moment, a slide, a sheet tab or a heading."""

import pytest

import sources.deep_links as deep_links
from sources.drive_constants import EXPORT_FORMATS
from sources.google_drive import DriveFileInfo

SLIDES = "application/vnd.google-apps.presentation"
SHEETS = "application/vnd.google-apps.spreadsheet"
DOCS = "application/vnd.google-apps.document"


def info(mime_type: str, extension: str) -> DriveFileInfo:
    return DriveFileInfo(file_id="FILE123", mime_type=mime_type, drive_title="Title", extension=extension)


# ---- video moments


def test_the_timestamp_is_added_to_the_video_link():
    assert deep_links.with_timestamp("https://drive.google.com/file/d/X/view", "90") == (
        "https://drive.google.com/file/d/X/view?t=90"
    )


def test_an_existing_timestamp_is_replaced_and_other_parts_of_the_link_are_kept():
    link = "https://drive.google.com/file/d/X/view?usp=sharing&t=5#section"
    assert deep_links.with_timestamp(link, "90") == "https://drive.google.com/file/d/X/view?usp=sharing&t=90#section"


def test_video_links_are_built_per_moment_and_skip_segments_without_a_start_time():
    links = deep_links.build_video_timestamp_links("https://drive.google.com/file/d/X/view", ["5", None, "", "90"])
    assert links == [
        "https://drive.google.com/file/d/X/view?t=5",
        None,
        None,
        "https://drive.google.com/file/d/X/view?t=90",
    ]


@pytest.mark.parametrize(
    "link", ["https://example.com/video.mp4", "https://docs.google.com/file/d/X/view", "not a link", ""]
)
def test_only_drive_video_links_get_moment_links(link):
    assert deep_links.build_video_timestamp_links(link, ["5", "90"]) == [None, None]


def test_the_host_is_compared_without_regard_to_case():
    assert deep_links.build_video_timestamp_links("https://DRIVE.GOOGLE.COM/file/d/X/view", ["5"]) == [
        "https://DRIVE.GOOGLE.COM/file/d/X/view?t=5"
    ]


# ---- links into native Google files


def test_every_native_google_type_is_covered_by_the_link_builder():
    assert {SLIDES, SHEETS, DOCS} == set(EXPORT_FORMATS)


@pytest.mark.parametrize("mime_type, extension", [("application/pdf", "pdf"), ("application/zip", "docx"), ("", "")])
def test_files_that_are_not_native_google_files_get_no_links(mime_type, extension, monkeypatch):
    monkeypatch.setattr(
        deep_links, "get_structure", lambda file_id: pytest.fail("the Drive Service must not be called")
    )
    assert deep_links.build_native_links(info(mime_type, extension), ["A", None, "B"]) == [None, None, None]


def test_slides_get_one_link_per_slide(monkeypatch):
    monkeypatch.setattr(deep_links, "get_structure", lambda file_id: {"slideIds": ["p1", "p2", "p3"]})
    links = deep_links.build_native_links(info(SLIDES, "pptx"), [None, None, None])
    assert links == [
        f"https://docs.google.com/presentation/d/FILE123/present?slide=id.{slide}" for slide in ("p1", "p2", "p3")
    ]


def test_spreadsheets_get_one_link_per_tab(monkeypatch):
    monkeypatch.setattr(deep_links, "get_structure", lambda file_id: {"sheetIds": [0, 987]})
    assert deep_links.build_native_links(info(SHEETS, "xlsx"), [None, None]) == [
        "https://docs.google.com/spreadsheets/d/FILE123/edit#gid=0",
        "https://docs.google.com/spreadsheets/d/FILE123/edit#gid=987",
    ]


def test_documents_link_each_section_to_its_heading(monkeypatch):
    structure = {"headings": [{"text": "Pricing", "id": "h.1"}, {"text": "Support", "id": "h.2"}]}
    monkeypatch.setattr(deep_links, "get_structure", lambda file_id: structure)
    links = deep_links.build_native_links(info(DOCS, "docx"), [None, "Pricing", "Support", "Missing"])
    assert links == [
        None,
        "https://docs.google.com/document/d/FILE123/edit#heading=h.1",
        "https://docs.google.com/document/d/FILE123/edit#heading=h.2",
        None,
    ]


def test_headings_with_the_same_text_are_matched_in_order():
    doc_headings = [("Overview", "h.a"), ("Details", "h.b"), ("Overview", "h.c")]
    links = deep_links._match_heading_links("F", ["Overview", "Overview", "Overview"], doc_headings)
    assert links == [
        "https://docs.google.com/document/d/F/edit#heading=h.a",
        "https://docs.google.com/document/d/F/edit#heading=h.c",
        None,
    ]


def test_a_failure_getting_the_structure_never_blocks_indexing(monkeypatch):
    def broken(file_id):
        raise RuntimeError("the Drive Service is down")

    monkeypatch.setattr(deep_links, "get_structure", broken)
    assert deep_links.build_native_links(info(SLIDES, "pptx"), [None, None]) == [None, None]


def test_a_structure_missing_what_was_expected_also_gives_plain_links(monkeypatch):
    monkeypatch.setattr(deep_links, "get_structure", lambda file_id: {})
    assert deep_links.build_native_links(info(SLIDES, "pptx"), [None]) == [None]
