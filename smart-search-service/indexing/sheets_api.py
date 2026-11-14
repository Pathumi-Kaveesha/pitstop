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

"""Reads the text of a native Google Sheets file too large to export, a block of rows at a time through the Sheets API.
Each tab is written exactly as chunking writes a tab of an exported Excel file, so the two read alike."""

import json
from typing import Callable, Iterator

from indexing.chunking import SheetTextTooLong, sheet_text
from sources.drive_service import get_sheet_list, get_sheet_rows

_MB = 1024 * 1024

# Cells asked for in one request. The Drive Service answers up to a million; this keeps a typical answer to a few MB.
_WINDOW_CELLS = 100_000
_MAX_ROWS_PER_REQUEST = 100_000
# Google allows ten million cells in a spreadsheet, so these only stop something that is not a real spreadsheet.
_MAX_REQUESTS = 400
# The most text read from one spreadsheet, counted twice: the characters in its cells, and the text written from them
# (each cell is written with its column name, so that is far more). Memory holds the text several times over.
_MAX_TEXT_CHARS = 16 * _MB


def _too_long() -> ValueError:
    return ValueError(f"The text of this spreadsheet is over the {_MAX_TEXT_CHARS // _MB} MB Smart Search can read.")


def _rows(
    file_id: str, sheet: int, rows: int, columns: int, spent: list[int],
    read_rows: Callable[[str, int, int, int], dict],
) -> Iterator[tuple]:
    """Every row of a tab in order, as the cells of an exported file give them: rows with nothing in them included,
    so a row's place is its place in the tab. spent holds the requests made, the characters read across the file, and
    the cells filled in this tab so far."""
    window = max(1, min(_MAX_ROWS_PER_REQUEST, _WINDOW_CELLS // max(1, columns)))
    first = 1
    while first <= rows:
        count = min(window, rows - first + 1)
        if spent[0] >= _MAX_REQUESTS:
            raise ValueError("This spreadsheet is too large for Smart Search to read.")
        spent[0] += 1
        answer = read_rows(file_id, sheet, first, count)
        got = answer["rows"]
        if not isinstance(got, list) or len(got) > count:
            raise ValueError("The spreadsheet's rows could not be read.")
        for index in range(count):
            row = tuple(got[index]) if index < len(got) else ()
            spent[1] += sum(len(str(value)) for value in row)
            spent[2] += sum(1 for value in row if value is not None and str(value) != "")
            if spent[1] > _MAX_TEXT_CHARS:
                raise _too_long()
            yield row
        first += count


def read_sheets_text(
    file_id: str,
    list_sheets: Callable[[str], dict] = get_sheet_list,
    read_rows: Callable[[str, int, int, int], dict] = get_sheet_rows,
) -> bytes:
    """{"units": [...]}, one string per tab in tab order, for chunking to read as sheets_text."""
    try:
        tabs = list_sheets(file_id)["sheets"]
        spent = [0, 0, 0]
        units = []
        written = 0
        for position, tab in enumerate(tabs):
            spent[2] = 0
            try:
                text = sheet_text(
                    tab["title"], _rows(file_id, position, tab["rows"], tab["columns"], spent, read_rows),
                    max_chars=_MAX_TEXT_CHARS - written,
                )
            except SheetTextTooLong as error:
                raise _too_long() from error
            # a tab with nothing in it has no text, as in an exported file
            units.append(text if spent[2] else "")
            written += len(units[-1])
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError("The spreadsheet's text could not be read.") from error
    return json.dumps({"units": units}).encode("utf-8")
