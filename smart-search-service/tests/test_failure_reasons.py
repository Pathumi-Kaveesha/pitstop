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

"""Why indexing failed, as the service reports it: saved in the database so a restart or another copy of the service still
knows, cleared by a newer attempt, and never able to break the code that records it. Needs TEST_POSTGRES_DSN."""

import threading
import time
import types

import psycopg
import pytest

pytestmark = pytest.mark.db

DRIVE_LINK = "https://drive.google.com/file/d/f1/view"


@pytest.fixture
def main(main_module):
    return main_module


@pytest.fixture
def pdf_info():
    from sources.google_drive import DriveFileInfo

    return DriveFileInfo(file_id="f1", mime_type="application/pdf", drive_title="Doc", extension="pdf")


def boom(*args, **kwargs):
    raise RuntimeError("database down")


def reason_of(status_of, document_id):
    return status_of(document_id)[1]["errorMessage"]


# ---- the status answer reads the database


def test_the_status_reports_the_saved_reason(main, vs, new_id, status_of):
    document = new_id()
    main._set_index_error(document, "could not read this file", vs.claim_generation(document))
    code, body = status_of(document)
    assert (code, body["errorMessage"], body["indexed"]) == (200, "could not read this file", False)


def test_the_reason_is_still_reported_after_this_copy_forgot_everything_it_held_in_memory(main, vs, new_id, status_of):
    document = new_id()
    main._set_index_error(document, "could not read this file", vs.claim_generation(document))
    main._index_errors.clear()  # a restart, or another copy of the service that never saw the failure
    assert reason_of(status_of, document) == "could not read this file"


def test_a_newer_attempt_retires_the_reason_by_itself(main, vs, new_id, status_of):
    document = new_id()
    main._set_index_error(document, "old failure", vs.claim_generation(document))
    vs.claim_generation(document)
    assert reason_of(status_of, document) is None


def test_an_explicit_clear_removes_it_from_the_database_and_from_memory(main, vs, new_id, status_of):
    document = new_id()
    main._set_index_error(document, "failure", vs.claim_generation(document))
    main._clear_index_error(document)
    assert reason_of(status_of, document) is None
    assert document not in main._index_errors


def test_a_document_that_was_never_touched_is_not_indexed_and_has_no_reason(new_id, status_of):
    assert status_of(new_id()) == (200, {"indexed": False, "errorMessage": None})


def test_a_document_id_that_is_not_a_number_is_refused(status_of):
    assert status_of("abc")[0] == 422


# ---- the messages


def test_a_long_reason_is_cut_to_300_characters(main, new_id, status_of):
    document = new_id()
    main._set_index_error(document, "x" * 500)
    assert len(reason_of(status_of, document)) == 300


def test_a_nul_character_is_removed_instead_of_losing_the_whole_reason(main, new_id, status_of):
    document = new_id()
    main._set_index_error(document, "bad\x00char")
    assert reason_of(status_of, document) == "badchar"


def test_a_failure_reason_is_kept_seven_days(main):
    assert main.INDEX_ERROR_TTL_SECONDS == 7 * 24 * 3600


# ---- the database misbehaves


def test_a_failed_save_never_raises_because_it_is_called_from_error_handlers(main, new_id, monkeypatch):
    document = new_id()
    monkeypatch.setattr(main, "save_index_error", boom)
    main._set_index_error(document, "reason while the database is down")
    assert main._index_errors[document][1] == "reason while the database is down"


def test_when_the_database_cannot_be_read_this_copys_memory_is_used(main, new_id, monkeypatch):
    document, other = new_id(), new_id()
    monkeypatch.setattr(main, "save_index_error", boom)
    main._set_index_error(document, "reason while the database is down")
    monkeypatch.setattr(main, "get_index_error", boom)
    assert main._current_index_error(document) == "reason while the database is down"
    assert main._current_index_error(other) is None


def test_a_memory_entry_older_than_seven_days_is_not_used(main, new_id, monkeypatch):
    document = new_id()
    monkeypatch.setattr(main, "get_index_error", boom)
    main._index_errors[document] = (time.time() - main.INDEX_ERROR_TTL_SECONDS - 5, "too old")
    assert main._current_index_error(document) is None


def test_a_failed_clear_never_raises(main, new_id, monkeypatch):
    monkeypatch.setattr(main, "clear_index_error", boom)
    main._clear_index_error(new_id())


def test_a_database_that_fails_twice_and_then_works_still_gets_the_reason(main, vs, new_id, status_of, monkeypatch):
    document = new_id()
    real_ensure, calls = vs._ensure_schema, [0]

    def flaky():
        calls[0] += 1
        if calls[0] <= 2:
            raise psycopg.OperationalError("connection lost")
        return real_ensure()

    monkeypatch.setattr(vs, "INDEX_ERROR_RETRY_DELAY_SECONDS", 0.01)
    monkeypatch.setattr(vs, "_ensure_schema", flaky)
    main._set_index_error(document, "saved after two failed tries")
    monkeypatch.setattr(vs, "_ensure_schema", real_ensure)
    assert calls[0] == 3
    assert reason_of(status_of, document) == "saved after two failed tries"


# ---- the real indexing jobs leave their reason


def test_a_drive_file_job_that_fails_leaves_a_friendly_reason_that_survives_a_restart(
    main, vs, new_id, status_of, pdf_info, monkeypatch
):
    document = new_id()
    generation = vs.claim_generation(document)
    monkeypatch.setattr(main, "_read_for_indexing", boom)
    main._index_drive_file_in_background(pdf_info, "Doc", document, DRIVE_LINK, generation)
    reason = reason_of(status_of, document)
    assert reason
    main._index_errors.clear()
    assert reason_of(status_of, document) == reason


def test_a_job_that_was_superseded_while_it_ran_does_not_show_its_failure_against_the_newer_attempt(
    main, vs, new_id, status_of, pdf_info, monkeypatch
):
    document = new_id()
    old = vs.claim_generation(document)
    new = vs.claim_generation(document)  # saved again while the first job was still running
    monkeypatch.setattr(main, "_read_for_indexing", boom)
    main._index_drive_file_in_background(pdf_info, "Doc", document, DRIVE_LINK, old)
    assert reason_of(status_of, document) is None
    main._index_drive_file_in_background(pdf_info, "Doc", document, DRIVE_LINK, new)
    assert reason_of(status_of, document) is not None


def test_a_file_with_nothing_worth_indexing_leaves_its_reason(main, vs, new_id, status_of, pdf_info, monkeypatch):
    document = new_id()
    generation = vs.claim_generation(document)
    monkeypatch.setattr(main, "_read_for_indexing", lambda info: (b"x", "pdf"))
    monkeypatch.setattr(main, "chunk_document", lambda data, extension, *args, **kwargs: ([], []))
    main._index_drive_file_in_background(pdf_info, "Doc", document, DRIVE_LINK, generation)
    assert reason_of(status_of, document) == "Nothing worth indexing was found in this file."


def test_a_web_page_with_nothing_worth_indexing_leaves_its_reason_that_survives_a_restart(
    main, vs, new_id, status_of, monkeypatch
):
    document = new_id()
    generation = vs.claim_generation(document)
    monkeypatch.setattr(main, "fetch_web_page_text", lambda link: types.SimpleNamespace(text="too short", title="T"))
    main._index_webpage_in_background("Page", document, "https://example.com/p", generation)
    expected = "Nothing worth indexing was found on this page."
    assert reason_of(status_of, document) == expected
    main._index_errors.clear()
    assert reason_of(status_of, document) == expected


# ---- links turned away or accepted by the endpoint


def test_an_unreadable_link_is_refused_with_400_and_its_reason_is_saved_for_the_status(
    main, api, new_id, status_of, monkeypatch
):
    document = new_id()

    def bad_link(link):
        raise ValueError("This file type can't be indexed.")

    monkeypatch.setattr(main, "resolve_drive_file", bad_link)
    response = api.post("/ingest-drive-link", {"driveLink": DRIVE_LINK, "contentId": document, "title": "T"})
    assert response.status_code == 400
    assert response.json()["detail"] == "This file type can't be indexed."
    assert reason_of(status_of, document) == "This file type can't be indexed."
    main._index_errors.clear()
    assert reason_of(status_of, document) == "This file type can't be indexed."


def test_accepting_a_retry_answers_200_clears_the_old_reason_and_queues_the_job_with_the_new_generation(
    main, vs, api, new_id, status_of, pdf_info, admin, schema, monkeypatch
):
    document = new_id()
    submitted = []
    monkeypatch.setattr(main, "_submit_index_job", lambda *job: submitted.append(job))
    monkeypatch.setattr(main, "resolve_drive_file", lambda link: pdf_info)
    main._set_index_error(document, "failed last time", vs.claim_generation(document))
    assert reason_of(status_of, document) == "failed last time"

    response = api.post("/ingest-drive-link", {"driveLink": DRIVE_LINK, "contentId": document, "title": "T"})
    assert response.status_code == 200
    assert response.json()["status"] == "indexing"
    assert len(submitted) == 1
    assert reason_of(status_of, document) is None

    current = admin.execute(
        f'SELECT generation FROM "{schema}".document_state WHERE document_id = %s', (document,)
    ).fetchone()[0]
    job = submitted[0]
    assert job[4] == current and job[3] == document


def test_an_unsafe_web_link_is_refused_with_400_and_its_reason_is_saved(api, new_id, status_of):
    document = new_id()
    response = api.post(
        "/ingest-drive-link", {"driveLink": "https://localhost/page", "contentId": document, "title": "T"}
    )
    assert response.status_code == 400
    assert reason_of(status_of, document) == response.json()["detail"]


# ---- many threads at once


def test_twelve_threads_saving_reading_and_clearing_the_same_few_documents_never_raise(main, vs, new_id):
    documents = [new_id() for _ in range(3)]
    errors = []

    def hammer(worker):
        try:
            for step in range(30):
                document = documents[worker % 3]
                main._set_index_error(
                    document, f"r{worker}-{step}", vs.claim_generation(document) if step % 5 == 0 else None
                )
                main._current_index_error(document)
                if step % 7 == 0:
                    main._clear_index_error(document)
        except Exception as error:  # noqa: BLE001
            errors.append(error)

    threads = [threading.Thread(target=hammer, args=(worker,)) for worker in range(12)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
