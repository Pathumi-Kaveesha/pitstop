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

"""Indexing a web page from its link: the request only checks the link and queues a job, the job downloads and stores
the page, and every way it can fail leaves a clear reason. Downloads are faked, so nothing reaches the internet; the
database is real. Needs TEST_POSTGRES_DSN."""

import socket
import threading
import time
import types

import pytest

import sources.web_page as web_page
from sources.web_page import WebPageGoneError

pytestmark = pytest.mark.db

GOOD_TEXT = "WSO2 Choreo helps teams ship APIs faster with managed gateways. " * 10


def page(text=GOOD_TEXT, title="Page title"):
    return types.SimpleNamespace(text=text, title=title)


@pytest.fixture
def main(main_module):
    return main_module


@pytest.fixture(autouse=True)
def fake_embeddings(main, monkeypatch):
    """Embedding is a paid call to Google, so every test uses a fixed fake vector instead."""
    monkeypatch.setattr(main, "embed_chunks", lambda texts, title, spacing: [[0.01] * 768 for _ in texts])


@pytest.fixture(autouse=True)
def public_dns_for_the_example_hosts(monkeypatch):
    """The service looks a link's host up before it accepts the link. These two hosts always get a fixed public address,
    so the tests do not need the internet; every other lookup stays real."""
    real_getaddrinfo = socket.getaddrinfo

    def getaddrinfo(host, *args, **kwargs):
        if host in {"example.com", "www.example.com"}:
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
        return real_getaddrinfo(host, *args, **kwargs)

    monkeypatch.setattr(web_page.socket, "getaddrinfo", getaddrinfo)


@pytest.fixture
def fetches(main, monkeypatch):
    """Makes every page download answer with a good page, and remembers which links were downloaded."""
    asked = []

    def good_fetch(link):
        asked.append(link)
        return page()

    monkeypatch.setattr(main, "fetch_web_page_text", good_fetch)
    return asked


@pytest.fixture
def queued(main, monkeypatch):
    """Stops jobs from running; collects what would have been queued."""
    jobs = []
    monkeypatch.setattr(main, "_submit_index_job", lambda *job: jobs.append(job))
    return jobs


@pytest.fixture
def stored(admin, schema):
    """Looks at what the service stored for a document."""

    class Stored:
        def chunks(self, document):
            return admin.execute(
                f'SELECT count(*) FROM "{schema}".chunks WHERE document_id = %s', (document,)
            ).fetchone()[0]

        def generation(self, document):
            row = admin.execute(
                f'SELECT generation FROM "{schema}".document_state WHERE document_id = %s', (document,)
            ).fetchone()
            return row[0] if row else None

        def source(self, document):
            return admin.execute(
                f'SELECT link, version FROM "{schema}".document_sources WHERE document_id = %s', (document,)
            ).fetchone()

        def titles(self, document):
            rows = admin.execute(f'SELECT DISTINCT title FROM "{schema}".chunks WHERE document_id = %s', (document,))
            return [row[0] for row in rows]

    return Stored()


@pytest.fixture
def job(main, vs, monkeypatch):
    """Runs the web page job for a document, with the download optionally replaced."""

    def run(document, *, title="Admin title", url="https://example.com/p", fetch=None, generation=None):
        if fetch is not None:
            monkeypatch.setattr(main, "fetch_web_page_text", fetch)
        claimed = generation if generation is not None else vs.claim_generation(document)
        main._index_webpage_in_background(title, document, url, claimed)
        return claimed

    return run


def raising(error):
    def fetch(link):
        raise error

    return fetch


# ---- accepting a link downloads nothing


def test_a_web_link_is_accepted_with_the_same_answer_shape_as_before_and_downloads_nothing(
    api, new_id, queued, fetches, stored
):
    document = new_id()
    before = stored.generation(document) or 0
    response = api.post(
        "/ingest-drive-link",
        {"driveLink": "https://example.com/story", "contentId": document, "title": "Customer story"},
    )
    assert response.status_code == 200
    assert response.json() == {
        "status": "indexing",
        "title": "Customer story",
        "documentId": document,
        "fileType": "webpage",
    }
    assert fetches == []
    assert stored.generation(document) == before + 1
    assert len(queued) == 1


def test_the_queued_job_gets_the_admins_title_the_id_the_link_and_the_generation(main, api, new_id, queued, stored):
    document = new_id()
    api.post(
        "/ingest-drive-link",
        {"driveLink": "https://example.com/story", "contentId": document, "title": "Customer story"},
    )
    tracker, runner, job_function, job_document, job_generation, *arguments = queued[0]
    generation = stored.generation(document)
    assert (tracker, runner, job_function) == (
        main._run_tracked,
        main._run_in_index_slot,
        main._index_webpage_in_background,
    )
    assert (job_document, job_generation) == (document, generation)
    assert arguments == ["Customer story", document, "https://example.com/story", generation]


def test_with_no_title_the_answer_names_the_site_and_the_job_uses_the_pages_own_title(api, new_id, queued):
    response = api.post(
        "/ingest-drive-link", {"driveLink": "https://www.example.com/path/story", "contentId": new_id()}
    )
    assert response.json()["title"] == "www.example.com"
    assert queued[0][5] is None


def test_a_blank_title_counts_as_no_title(api, new_id, queued):
    response = api.post(
        "/ingest-drive-link", {"driveLink": "https://example.com/story", "contentId": new_id(), "title": "   "}
    )
    assert response.status_code == 200
    assert queued[0][5] is None


def test_the_same_link_without_a_content_id_always_gets_the_same_document_id(api, queued):
    link = f"https://example.com/no-id-{time.time_ns()}"
    first = api.post("/ingest-drive-link", {"driveLink": link}).json()["documentId"]
    second = api.post("/ingest-drive-link", {"driveLink": link}).json()["documentId"]
    assert first == second and len(first) == 16


@pytest.mark.parametrize(
    "link, message",
    [
        ("http://example.com/p", "That doesn't look like a Google Drive link"),
        ("https://localhost/p", "This link can't be indexed."),
        ("https://127.0.0.1/p", "This link can't be indexed."),
        ("https://10.1.2.3/p", "This link can't be indexed."),
    ],
)
def test_unsafe_links_are_refused_up_front_and_nothing_is_queued(api, new_id, queued, stored, status_of, link, message):
    document = new_id()
    response = api.post("/ingest-drive-link", {"driveLink": link, "contentId": document})
    assert response.status_code == 400
    assert message in response.json()["detail"]
    assert stored.generation(document) is None
    assert queued == []
    assert status_of(document)[1]["errorMessage"] == response.json()["detail"]


# ---- the job


def test_a_good_page_is_indexed_and_its_fingerprint_is_recorded_for_the_weekly_check(
    main, new_id, job, stored, status_of
):
    document = new_id()
    job(document, fetch=lambda link: page())
    assert stored.chunks(document) > 0
    assert status_of(document) == (200, {"indexed": True, "errorMessage": None})
    assert stored.source(document) == ("https://example.com/p", main._web_page_version(GOOD_TEXT))


def test_with_no_admin_title_the_pages_own_title_is_stored(new_id, job, stored):
    document = new_id()
    job(document, title=None, fetch=lambda link: page(title="The page's own title"))
    assert stored.titles(document) == ["The page's own title"]


def test_the_admins_title_wins_over_the_pages(new_id, job, stored):
    document = new_id()
    job(document, title="Admin title", fetch=lambda link: page(title="The page's own title"))
    assert stored.titles(document) == ["Admin title"]


@pytest.mark.parametrize(
    "error, reason",
    [
        (ValueError("This page is too large to index (over 10 MB)."), "This page is too large to index (over 10 MB)."),
        (
            ValueError("This link doesn't point to a readable web page."),
            "This link doesn't point to a readable web page.",
        ),
        (
            ValueError("Nothing worth indexing was found on this page."),
            "Nothing worth indexing was found on this page.",
        ),
        (WebPageGoneError("The page no longer exists (404)."), "The page no longer exists (404)."),
        (RuntimeError("Could not read that page."), "Could not read that page."),
    ],
)
def test_every_way_a_page_can_fail_leaves_its_reason_and_stores_nothing(new_id, job, stored, status_of, error, reason):
    document = new_id()
    job(document, fetch=raising(error))
    assert status_of(document) == (200, {"indexed": False, "errorMessage": reason})
    assert stored.chunks(document) == 0


def test_a_page_whose_text_is_too_short_gives_the_same_reason_as_before(new_id, job, status_of):
    document = new_id()
    job(document, fetch=lambda link: page("too short"))
    assert status_of(document)[1]["errorMessage"] == "Nothing worth indexing was found on this page."


def test_an_unexpected_failure_while_indexing_still_leaves_a_friendly_reason(
    main, new_id, job, stored, status_of, monkeypatch
):
    document = new_id()

    def embedding_down(texts, title, spacing):
        raise RuntimeError("embedding service unavailable")

    monkeypatch.setattr(main, "embed_chunks", embedding_down)
    job(document, fetch=lambda link: page())
    assert status_of(document)[1]["errorMessage"]
    assert stored.chunks(document) == 0


# ---- reasons survive a restart, and a retry clears them


def test_a_page_failure_is_still_reported_after_a_restart_and_a_retry_that_works_clears_it(
    main, new_id, job, status_of
):
    document = new_id()
    job(document, fetch=raising(RuntimeError("net")))
    main._index_errors.clear()
    assert status_of(document)[1]["errorMessage"] == "Could not read that page."
    job(document, fetch=lambda link: page())
    assert status_of(document) == (200, {"indexed": True, "errorMessage": None})


def test_a_refresh_that_fails_leaves_the_old_version_searchable(new_id, job, stored, status_of):
    document = new_id()
    job(document, fetch=lambda link: page())
    kept = stored.chunks(document)
    job(document, fetch=raising(WebPageGoneError("404")))
    assert stored.chunks(document) == kept
    assert status_of(document)[1]["indexed"] is True


# ---- an older attempt can never overwrite a newer one


def test_a_job_superseded_while_it_ran_stores_nothing_and_a_late_failure_is_not_shown(
    vs, new_id, job, stored, status_of
):
    document = new_id()
    old = vs.claim_generation(document)
    new = vs.claim_generation(document)
    job(document, generation=old, fetch=lambda link: page())
    assert stored.chunks(document) == 0
    job(document, generation=old, fetch=raising(RuntimeError("late")))
    assert status_of(document)[1]["errorMessage"] is None
    job(document, generation=new, fetch=lambda link: page())
    assert stored.chunks(document) > 0


# ---- at most three downloads at a time, through the real queue


def test_twelve_requests_at_once_are_all_answered_straight_away_and_never_more_than_three_download_together(
    main, api, new_id, stored, monkeypatch
):
    running, peak, lock = [0], [0], threading.Lock()

    def slow_fetch(link):
        with lock:
            running[0] += 1
            peak[0] = max(peak[0], running[0])
        try:
            time.sleep(0.4)
            return page()
        finally:
            with lock:
                running[0] -= 1

    monkeypatch.setattr(main, "fetch_web_page_text", slow_fetch)
    documents = [new_id() for _ in range(12)]
    started = time.time()
    responses = api.post_many(
        "/ingest-drive-link",
        [
            {"driveLink": f"https://example.com/burst-{number}", "contentId": document}
            for number, document in enumerate(documents)
        ],
    )
    assert all(response.status_code == 200 for response in responses)
    assert time.time() - started < 2.0, "requests waited for downloads instead of being answered at once"

    deadline = time.time() + 40
    while time.time() < deadline and not all(stored.chunks(document) > 0 for document in documents):
        time.sleep(0.3)
    assert all(stored.chunks(document) > 0 for document in documents)
    assert 2 <= peak[0] <= 3


def test_a_job_that_cannot_get_a_download_place_gives_up_with_the_usual_reason_and_frees_every_place(
    main, vs, new_id, status_of, monkeypatch
):
    document = new_id()
    monkeypatch.setattr(web_page, "WEB_FETCH_WAIT_SECONDS", 0.3)
    held = [web_page._fetch_slots.acquire(blocking=False) for _ in range(3)]
    try:
        generation = vs.claim_generation(document)
        started = time.time()
        main._index_webpage_in_background("T", document, "https://example.com/p", generation)
        waited = time.time() - started
    finally:
        for taken in held:
            if taken:
                web_page._fetch_slots.release()
    assert status_of(document)[1]["errorMessage"] == "Could not read that page."
    assert 0.25 < waited < 3
    free = [web_page._fetch_slots.acquire(blocking=False) for _ in range(3)]
    for taken in free:
        if taken:
            web_page._fetch_slots.release()
    assert all(free)


# ---- other kinds of link are untouched


def test_a_drive_link_still_takes_the_drive_path_and_queues_the_file_job(
    main, api, new_id, queued, fetches, monkeypatch
):
    from sources.google_drive import DriveFileInfo

    monkeypatch.setattr(
        main,
        "resolve_drive_file",
        lambda link: DriveFileInfo(file_id="f9", mime_type="application/pdf", drive_title="F", extension="pdf"),
    )
    response = api.post(
        "/ingest-drive-link",
        {"driveLink": "https://drive.google.com/file/d/f9/view", "contentId": new_id(), "title": "F"},
    )
    assert response.status_code == 200
    assert response.json()["fileType"] != "webpage"
    assert queued[0][2] is main._index_drive_file_in_background
    assert fetches == []


def test_the_weekly_check_downloads_through_the_same_function(main, fetches):
    version, _ = main._current_source_version("https://example.com/x")
    assert version == main._web_page_version(GOOD_TEXT)
    assert fetches == ["https://example.com/x"]
