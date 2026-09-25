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

"""Builds a link per slide, tab or heading, so a result opens at the right spot."""

import logging
from typing import Optional

from drive_constants import DOCS_API_BASE, EXPORT_FORMATS, SHEETS_API_BASE, SLIDES_API_BASE
from google_drive import DriveFileInfo, _request_with_retry

logger = logging.getLogger("smart-search-service")


def _get_slide_ids(presentation_id: str) -> list[str]:
    """Slide ids in order - Google picks them, so they can't be guessed."""
    response = _request_with_retry(
        "GET", f"{SLIDES_API_BASE}/{presentation_id}", params={"fields": "slides.objectId"}
    )
    return [slide["objectId"] for slide in response.json().get("slides", [])]


def _get_sheet_gids(spreadsheet_id: str) -> list[int]:
    """Tab ids, left to right."""
    response = _request_with_retry(
        "GET",
        f"{SHEETS_API_BASE}/{spreadsheet_id}",
        params={"fields": "sheets.properties(sheetId,index)"},
    )
    sheets = response.json().get("sheets", [])
    sheets.sort(key=lambda s: s["properties"]["index"])
    return [s["properties"]["sheetId"] for s in sheets]


def _get_heading_ids(document_id: str) -> dict[str, str]:
    """Heading text -> the id Google gave it. A repeated heading keeps the last id."""
    response = _request_with_retry("GET", f"{DOCS_API_BASE}/{document_id}")
    content = response.json().get("body", {}).get("content", [])

    heading_ids: dict[str, str] = {}
    for element in content:
        paragraph = element.get("paragraph")
        if not paragraph:
            continue
        heading_id = paragraph.get("paragraphStyle", {}).get("headingId")
        if not heading_id:
            continue
        text = "".join(
            run.get("textRun", {}).get("content", "") for run in paragraph.get("elements", [])
        ).strip()
        if text:
            heading_ids[text] = heading_id
    return heading_ids


def build_native_links(info: DriveFileInfo, unit_headings: list[Optional[str]]) -> list[Optional[str]]:
    """One link per slide/tab/section, or None where there isn't one.

    Only native Google Slides, Sheets and Docs get links - uploaded files and
    pdfs, and any failure, give all None so indexing still succeeds."""
    none_links: list[Optional[str]] = [None] * len(unit_headings)
    if info.mime_type not in EXPORT_FORMATS:
        return none_links

    file_id = info.file_id
    try:
        if info.extension == "pptx":
            return [
                f"https://docs.google.com/presentation/d/{file_id}/present?slide=id.{slide_id}"
                for slide_id in _get_slide_ids(file_id)
            ]

        if info.extension == "xlsx":
            return [
                f"https://docs.google.com/spreadsheets/d/{file_id}/edit#gid={gid}"
                for gid in _get_sheet_gids(file_id)
            ]

        heading_ids = _get_heading_ids(file_id)
        return [
            f"https://docs.google.com/document/d/{file_id}/edit#heading={heading_ids[heading]}"
            if heading and heading in heading_ids else None
            for heading in unit_headings
        ]
    except Exception:  # noqa: BLE001 - deep links must never block indexing
        logger.exception("Could not build deep links for '%s' - using the plain Drive link", info.drive_title)
        return none_links
