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

"""Reading a public web page: which links are allowed, how redirects are checked, what each kind of response turns into,
the limit of three downloads at a time, and the size and time limits on a download. The time-limit tests talk to a real
fake server on a local port; everything else uses prepared responses and never reaches the internet."""

import gzip
import socket
import threading
import time

import pytest
import requests

import sources.web_page as wp
from helpers import FakeWebServer

PUBLIC = "https://93.184.216.34"  # a public address written as numbers, so no name lookup is needed

ARTICLE = (
    "<html><head><title>Choreo overview</title></head><body><article>"
    + "".join(
        f"<p>Paragraph {number}: Choreo helps teams ship APIs faster with managed gateways, built-in observability and "
        f"simple deployments for every environment they run.</p>"
        for number in range(4)
    )
    + "</article></body></html>"
).encode()


# ---- which links are web page links, and which are safe


@pytest.mark.parametrize(
    "url, expected",
    [
        ("https://example.com/page", True),
        ("https://docs.wso2.com/a?b=c#d", True),
        ("http://example.com/page", False),
        ("https://drive.google.com/file/d/abc/view", False),
        ("https://docs.google.com/document/d/abc/edit", False),
        ("ftp://example.com/file", False),
        ("https://", False),
        ("not a link", False),
        ("", False),
    ],
)
def test_which_links_count_as_web_pages(url, expected):
    assert wp.is_web_page_link(url) is expected


@pytest.mark.parametrize(
    "address, unsafe",
    [
        ("127.0.0.1", True),
        ("10.1.2.3", True),
        ("172.16.0.1", True),
        ("192.168.1.1", True),
        ("169.254.169.254", True),
        ("0.0.0.0", True),
        ("224.0.0.1", True),
        ("::1", True),
        ("fe80::1", True),
        ("93.184.216.34", False),
        ("8.8.8.8", False),
        ("2606:4700:4700::1111", False),
    ],
)
def test_private_and_internal_addresses_are_unsafe(address, unsafe):
    assert wp._is_unsafe_ip(address) is unsafe


@pytest.mark.parametrize(
    "url, message",
    [
        ("http://example.com/page", "Only https links can be indexed."),
        ("ftp://example.com/page", "Only https links can be indexed."),
        ("https:///no-host", "Only https links can be indexed."),
        ("https://localhost/page", "This link can't be indexed."),
        ("https://127.0.0.1/page", "This link can't be indexed."),
        ("https://10.0.0.5/page", "This link can't be indexed."),
        ("https://[::1]/page", "This link can't be indexed."),
    ],
)
def test_links_to_unsafe_places_are_refused_before_anything_is_downloaded(url, message):
    with pytest.raises(ValueError, match=message):
        wp.require_safe_web_link(url)


def test_a_public_address_is_accepted():
    wp.require_safe_web_link(PUBLIC + "/page")


def test_a_name_that_cannot_be_looked_up_is_refused_rather_than_guessed(monkeypatch):
    def no_such_host(*args, **kwargs):
        raise socket.gaierror("no such host")

    monkeypatch.setattr(wp.socket, "getaddrinfo", no_such_host)
    with pytest.raises(ValueError, match="can't be indexed"):
        wp.require_safe_web_link("https://nowhere.example/page")


def test_a_name_that_points_at_a_private_address_is_refused(monkeypatch):
    monkeypatch.setattr(wp.socket, "getaddrinfo", lambda *args, **kwargs: [(2, 1, 6, "", ("10.9.8.7", 0))])
    with pytest.raises(ValueError, match="can't be indexed"):
        wp.require_safe_web_link("https://sneaky.example/page")


def test_a_name_with_even_one_private_address_among_several_is_refused(monkeypatch):
    answers = [(2, 1, 6, "", ("93.184.216.34", 0)), (2, 1, 6, "", ("192.168.0.9", 0))]
    monkeypatch.setattr(wp.socket, "getaddrinfo", lambda *args, **kwargs: answers)
    with pytest.raises(ValueError, match="can't be indexed"):
        wp.require_safe_web_link("https://mixed.example/page")


# ---- turning a page into text


def test_a_heading_or_bold_title_starts_a_new_paragraph_and_links_keep_only_their_words():
    markdown = "Intro text\n## A heading with [a link](https://x.example/y)\nBody **with bold** and _italic_ words\n**Bold title**\nMore"
    assert wp._markdown_to_plain_text(markdown) == (
        "Intro text\n\nA heading with a link\nBody with bold and italic words\n\nBold title\nMore"
    )


def test_a_heading_repeated_straight_after_itself_is_collapsed():
    assert wp._dedupe_adjacent_lines("Pricing\nPricing\nPlans start small\nPlans start small\nOther") == (
        "Pricing\nPlans start small\nOther"
    )


# ---- what each response turns into


class FakeRaw:
    def __init__(self, chunks):
        self.chunks, self.shut_down = chunks, False

    def stream(self, amount, decode_content=True):
        yield from self.chunks

    def shutdown(self):
        self.shut_down = True


class FakeResponse:
    def __init__(self, status=200, body=b"", content_type="text/html; charset=utf-8", location=None, chunks=None):
        self.status_code = status
        self.headers = {"Content-Type": content_type}
        if location:
            self.headers["Location"] = location
        self.encoding = "utf-8"
        self.raw = FakeRaw(chunks if chunks is not None else ([body] if body else []))
        self.closed = False
        self.is_redirect = location is not None and status in (301, 302, 303, 307)
        self.is_permanent_redirect = location is not None and status == 308

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code} error")

    def close(self):
        self.closed = True

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        self.close()


class FakeSession:
    """Answers each address with the next prepared response, and remembers which addresses were asked for."""

    def __init__(self, answers):
        self.answers, self.asked = answers, []

    def get(self, url, **kwargs):
        self.asked.append(url)
        answer = self.answers[url]
        if isinstance(answer, Exception):
            raise answer
        return answer.pop(0) if isinstance(answer, list) else answer


@pytest.fixture
def session(monkeypatch):
    def install(answers):
        fake = FakeSession(answers)
        monkeypatch.setattr(wp, "_session", fake)
        return fake

    return install


def test_a_normal_page_gives_its_title_and_text(session):
    session({PUBLIC + "/page": FakeResponse(body=ARTICLE)})
    page = wp.fetch_web_page_text(PUBLIC + "/page")
    assert page.title == "Choreo overview"
    assert "Choreo helps teams ship APIs faster" in page.text


def test_a_page_with_no_title_is_named_after_its_site(session):
    session({PUBLIC + "/page": FakeResponse(body=ARTICLE.replace(b"<title>Choreo overview</title>", b""))})
    assert wp.fetch_web_page_text(PUBLIC + "/page").title == "93.184.216.34"


@pytest.mark.parametrize("status", [404, 410])
def test_a_page_the_site_says_is_gone_is_reported_as_gone(session, status):
    session({PUBLIC + "/old": FakeResponse(status=status)})
    with pytest.raises(wp.WebPageGoneError, match=rf"The page no longer exists \({status}\)\."):
        wp.fetch_web_page_text(PUBLIC + "/old")


def test_the_gone_error_is_a_kind_of_network_error_so_older_callers_still_handle_it():
    assert issubclass(wp.WebPageGoneError, RuntimeError)


@pytest.mark.parametrize("status", [401, 403, 500, 503])
def test_any_other_failing_status_is_a_network_style_error(session, status):
    session({PUBLIC + "/bad": FakeResponse(status=status)})
    with pytest.raises(RuntimeError, match="Could not read that page.") as error:
        wp.fetch_web_page_text(PUBLIC + "/bad")
    assert not isinstance(error.value, wp.WebPageGoneError)


def test_something_that_is_not_a_web_page_is_refused(session):
    session({PUBLIC + "/file.pdf": FakeResponse(body=b"%PDF-1.4", content_type="application/pdf")})
    with pytest.raises(ValueError, match="doesn't point to a readable web page"):
        wp.fetch_web_page_text(PUBLIC + "/file.pdf")


def test_a_page_with_nothing_worth_reading_is_refused(session):
    session({PUBLIC + "/empty": FakeResponse(body=b"<html><body><script>var x = 1;</script></body></html>")})
    with pytest.raises(ValueError, match="Nothing worth indexing was found on this page"):
        wp.fetch_web_page_text(PUBLIC + "/empty")


def test_a_network_failure_is_reported_in_one_plain_way_and_keeps_its_cause(session):
    session({PUBLIC + "/down": requests.ConnectionError("connection refused")})
    with pytest.raises(RuntimeError, match="Could not read that page.") as error:
        wp.fetch_web_page_text(PUBLIC + "/down")
    assert isinstance(error.value.__cause__, requests.ConnectionError)


def test_a_page_over_the_size_limit_is_refused_as_too_large(session, monkeypatch):
    monkeypatch.setattr(wp, "MAX_WEB_PAGE_BYTES", 1000)
    session({PUBLIC + "/big": FakeResponse(chunks=[b"a" * 600, b"b" * 600])})
    with pytest.raises(ValueError, match="too large to index"):
        wp.fetch_web_page_text(PUBLIC + "/big")


def test_a_page_exactly_at_the_size_limit_is_read_in_full(session, monkeypatch):
    monkeypatch.setattr(wp, "MAX_WEB_PAGE_BYTES", len(ARTICLE))
    session({PUBLIC + "/exact": FakeResponse(chunks=[ARTICLE[:100], ARTICLE[100:]])})
    assert wp.fetch_web_page_text(PUBLIC + "/exact").title == "Choreo overview"


def test_an_unsafe_link_is_refused_without_a_single_request(session):
    fake = session({})
    for url in ("https://localhost/x", "http://example.com/x", "https://10.0.0.1/x"):
        with pytest.raises(ValueError):
            wp.fetch_web_page_text(url)
    assert fake.asked == []


# ---- redirects are checked hop by hop


def test_a_redirect_to_another_public_page_is_followed_including_a_relative_one(session):
    fake = session(
        {
            PUBLIC + "/start": FakeResponse(status=301, location="/moved"),
            PUBLIC + "/moved": FakeResponse(status=302, location="https://8.8.8.8/final"),
            "https://8.8.8.8/final": FakeResponse(body=ARTICLE),
        }
    )
    assert wp.fetch_web_page_text(PUBLIC + "/start").title == "Choreo overview"
    assert fake.asked == [PUBLIC + "/start", PUBLIC + "/moved", "https://8.8.8.8/final"]


def test_a_redirect_into_a_private_address_is_refused_and_never_requested(session):
    fake = session({PUBLIC + "/start": FakeResponse(status=302, location="https://10.0.0.5/secret")})
    with pytest.raises(ValueError, match="can't be indexed"):
        wp.fetch_web_page_text(PUBLIC + "/start")
    assert fake.asked == [PUBLIC + "/start"]


def test_a_redirect_down_to_plain_http_is_refused(session):
    session({PUBLIC + "/start": FakeResponse(status=302, location="http://example.com/page")})
    with pytest.raises(ValueError, match="Only https links can be indexed"):
        wp.fetch_web_page_text(PUBLIC + "/start")


def test_a_redirect_with_no_destination_is_refused(session):
    response = FakeResponse(status=302, location="x")
    del response.headers["Location"]
    session({PUBLIC + "/start": response})
    with pytest.raises(ValueError, match="doesn't point to a readable web page"):
        wp.fetch_web_page_text(PUBLIC + "/start")


def test_a_page_that_redirects_for_ever_is_given_up_on_after_five_redirects(session):
    fake = session({PUBLIC + "/loop": [FakeResponse(status=302, location="/loop") for _ in range(10)]})
    with pytest.raises(ValueError, match="redirects too many times"):
        wp.fetch_web_page_text(PUBLIC + "/loop")
    assert len(fake.asked) == 6  # the first request and five redirects


def test_a_redirecting_response_is_closed_before_the_next_request(session):
    first = FakeResponse(status=302, location="/next")
    session({PUBLIC + "/start": first, PUBLIC + "/next": FakeResponse(body=ARTICLE)})
    wp.fetch_web_page_text(PUBLIC + "/start")
    assert first.closed


# ---- the limit of three downloads at a time


def test_no_more_downloads_run_at_once_than_the_limit_allows(monkeypatch):
    running, peak, lock = [0], [0], threading.Lock()

    def slow(url):
        with lock:
            running[0] += 1
            peak[0] = max(peak[0], running[0])
        time.sleep(0.15)
        with lock:
            running[0] -= 1
        return url

    monkeypatch.setattr(wp, "_fetch_web_page_text", slow)
    results = []
    threads = [threading.Thread(target=lambda n=n: results.append(wp.fetch_web_page_text(f"u{n}"))) for n in range(9)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert sorted(results) == sorted(f"u{n}" for n in range(9))
    assert peak[0] == wp.MAX_CONCURRENT_WEB_FETCHES == 3


def test_a_download_that_cannot_get_a_free_place_gives_up_with_the_usual_error(monkeypatch):
    monkeypatch.setattr(wp, "WEB_FETCH_WAIT_SECONDS", 0.2)
    held = [wp._fetch_slots.acquire(blocking=False) for _ in range(wp.MAX_CONCURRENT_WEB_FETCHES)]
    try:
        started = time.time()
        with pytest.raises(RuntimeError, match="Could not read that page.") as error:
            wp.fetch_web_page_text(PUBLIC + "/page")
        assert 0.15 < time.time() - started < 3
        assert isinstance(error.value.__cause__, TimeoutError)
    finally:
        for taken in held:
            if taken:
                wp._fetch_slots.release()


def test_a_failed_download_gives_its_place_back(session):
    session({PUBLIC + "/bad": FakeResponse(status=500)})
    for _ in range(wp.MAX_CONCURRENT_WEB_FETCHES + 2):
        with pytest.raises(RuntimeError):
            wp.fetch_web_page_text(PUBLIC + "/bad")
    free = [wp._fetch_slots.acquire(blocking=False) for _ in range(wp.MAX_CONCURRENT_WEB_FETCHES)]
    for taken in free:
        if taken:
            wp._fetch_slots.release()
    assert all(free)


# ---- the time limit, on a real local connection


def read_in_a_thread(server, scheme, wait=8):
    """Reads a page like the service does, in a thread, so a hang shows up as 'still running' instead of hanging the test."""
    outcome = {}

    def go():
        started = time.time()
        try:
            response = requests.get(f"{scheme}://127.0.0.1:{server.port}/", stream=True, timeout=5, verify=False)
            outcome["body"] = wp._read_html(response)
        except Exception as error:  # noqa: BLE001
            outcome["error"] = error
        outcome["seconds"] = time.time() - started

    thread = threading.Thread(target=go, daemon=True)
    thread.start()
    thread.join(wait)
    return outcome, thread.is_alive()


@pytest.fixture
def servers():
    made = []

    def make(*args, **kwargs):
        server = FakeWebServer(*args, **kwargs)
        made.append(server)
        return server

    yield make
    for server in made:
        server.close()


@pytest.fixture
def short_limit(monkeypatch):
    monkeypatch.setattr(wp, "WEB_PAGE_TOTAL_TIMEOUT_SECONDS", 1.5)


@pytest.mark.filterwarnings("ignore::urllib3.exceptions.InsecureRequestWarning")
@pytest.mark.parametrize("scheme, tls", [("http", False), ("https", True)])
def test_a_server_that_sends_one_byte_at_a_time_is_cut_off_at_the_time_limit(servers, short_limit, scheme, tls):
    outcome, hung = read_in_a_thread(servers(gap=0.3, tls=tls), scheme)
    assert not hung
    assert isinstance(outcome["error"], RuntimeError)
    assert "took too long" in str(outcome["error"])
    assert outcome["seconds"] < 4


@pytest.mark.filterwarnings("ignore::urllib3.exceptions.InsecureRequestWarning")
@pytest.mark.parametrize("scheme, tls", [("http", False), ("https", True)])
def test_a_normal_page_is_read_in_full(servers, short_limit, scheme, tls):
    outcome, hung = read_in_a_thread(servers(gap=0, tls=tls), scheme)
    assert not hung
    assert outcome["body"] == b"<p>hello</p>" * 5


def test_a_slow_compressed_page_is_cut_off_too(servers, short_limit):
    server = servers(gap=0.3, body=gzip.compress(b"<p>hello</p>" * 5000), encoding="gzip")
    outcome, hung = read_in_a_thread(server, "http")
    assert not hung
    assert isinstance(outcome["error"], RuntimeError)
    assert outcome["seconds"] < 4


def test_the_size_limit_still_applies_on_a_real_connection_and_stays_a_value_error(servers, short_limit, monkeypatch):
    monkeypatch.setattr(wp, "MAX_WEB_PAGE_BYTES", 1000)
    outcome, hung = read_in_a_thread(servers(gap=0, body=b"A" * 50_000), "http")
    assert not hung
    assert isinstance(outcome["error"], ValueError) and "too large" in str(outcome["error"])


def test_a_normal_page_right_after_a_cut_off_one_still_downloads(servers, short_limit):
    read_in_a_thread(servers(gap=0.3), "http")
    outcome, hung = read_in_a_thread(servers(gap=0), "http")
    assert not hung and outcome["body"] == b"<p>hello</p>" * 5


def test_a_slow_page_that_finishes_inside_the_limit_is_not_cut_off(servers, monkeypatch):
    monkeypatch.setattr(wp, "WEB_PAGE_TOTAL_TIMEOUT_SECONDS", 3)
    outcome, hung = read_in_a_thread(servers(gap=0.05, body=b"abcdefghij", content_length=10), "http")
    assert not hung
    assert outcome["body"] == b"abcdefghij"


def test_the_service_leaves_no_timer_thread_behind_after_a_normal_or_a_cut_off_read(servers, short_limit):
    for gap in (0, 0.3):
        read_in_a_thread(servers(gap=gap), "http")
    time.sleep(0.3)
    assert [thread for thread in threading.enumerate() if isinstance(thread, threading.Timer)] == []


def test_the_fake_server_lets_go_of_a_client_that_hangs_up_before_sending_its_request(servers):
    server = servers(gap=0)
    with socket.create_connection(("127.0.0.1", server.port)):
        pass  # connects, sends nothing, hangs up
    time.sleep(0.5)
    assert [thread for thread in threading.enumerate() if getattr(thread, "_target", None) == server._answer] == []
