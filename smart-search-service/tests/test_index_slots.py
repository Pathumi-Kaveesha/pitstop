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

"""Which files run alone and which share the three index slots, and what happens to a Google file whose whole export would
be too big. Needs TEST_POSTGRES_DSN (the endpoint claims a generation in the database)."""

import pytest

pytestmark = pytest.mark.db

MB = 1024 * 1024
PDF = "application/pdf"
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
SLIDES = "application/vnd.google-apps.presentation"


@pytest.fixture
def main(main_module):
    return main_module


@pytest.fixture
def queued(main, monkeypatch):
    jobs = []
    monkeypatch.setattr(main, "_submit_index_job", lambda *job: jobs.append(job))
    return jobs


def drive_file(size_mb, mime=PDF, extension="pdf"):
    from sources.google_drive import DriveFileInfo

    size = None if size_mb is None else int(size_mb * MB)
    return DriveFileInfo(file_id="f1", mime_type=mime, drive_title="File", extension=extension, size_bytes=size)


def runner_for(main, api, new_id, queued, monkeypatch, info):
    monkeypatch.setattr(main, "resolve_drive_file", lambda link: info)
    response = api.post(
        "/ingest-drive-link", {"driveLink": "https://drive.google.com/file/d/f1/view", "contentId": new_id()}
    )
    assert response.status_code == 200
    return queued[-1][1]


def test_the_default_is_50_mb(main):
    assert main.LARGE_FILE_EXCLUSIVE_THRESHOLD_BYTES == 50 * MB


@pytest.mark.parametrize("size_mb", [1, 20, 50])
def test_a_file_up_to_the_threshold_shares_the_slots(main, api, new_id, queued, monkeypatch, size_mb):
    runner = runner_for(main, api, new_id, queued, monkeypatch, drive_file(size_mb))
    assert runner is main._run_in_index_slot


@pytest.mark.parametrize("size_mb", [51, 60, 120, 150])
def test_a_file_over_the_threshold_runs_alone_with_every_slot(main, api, new_id, queued, monkeypatch, size_mb):
    runner = runner_for(main, api, new_id, queued, monkeypatch, drive_file(size_mb))
    assert runner is main._run_in_index_slot_exclusive


def test_a_file_whose_size_is_not_known_shares_the_slots(main, api, new_id, queued, monkeypatch):
    runner = runner_for(main, api, new_id, queued, monkeypatch, drive_file(None, SLIDES, "pptx"))
    assert runner is main._run_in_index_slot


def test_a_big_powerpoint_read_in_parts_holds_almost_nothing_so_it_shares_the_slots(
    main, api, new_id, queued, monkeypatch
):
    runner = runner_for(main, api, new_id, queued, monkeypatch, drive_file(280, PPTX, "pptx"))
    assert runner is main._run_in_index_slot


def test_a_google_file_of_unknown_size_is_exported_whole_only_up_to_the_threshold(main, monkeypatch):
    asked = []

    def export(info, max_bytes):
        asked.append(max_bytes)
        return b"exported"

    monkeypatch.setattr(main, "download_drive_file", export)
    assert main._read_for_indexing(drive_file(None, SLIDES, "pptx")) == (b"exported", "pptx")
    assert asked == [50 * MB]


def test_a_google_file_whose_export_is_over_the_threshold_is_read_as_text_instead_so_nothing_is_lost(main, monkeypatch):
    def too_big(info, max_bytes):
        raise ValueError(f"File is over the {max_bytes // MB} MB limit Smart Search can index.")

    monkeypatch.setattr(main, "download_drive_file", too_big)
    monkeypatch.setattr(main, "_native_text_bytes", lambda info: (b'{"slides": []}', "slides_text"))
    assert main._read_for_indexing(drive_file(None, SLIDES, "pptx")) == (b'{"slides": []}', "slides_text")


def test_a_file_that_is_not_a_google_file_is_never_read_as_text_when_it_is_too_big(main, monkeypatch):
    def too_big(info, max_bytes=None):
        raise ValueError("File is over the limit.")

    monkeypatch.setattr(main, "download_drive_file", too_big)
    monkeypatch.setattr(main, "_native_text_bytes", lambda info: pytest.fail("text must not be used for a stored file"))
    with pytest.raises(ValueError, match="over the limit"):
        main._read_for_indexing(drive_file(20, PDF, "pdf"))
