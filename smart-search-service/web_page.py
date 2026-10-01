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

"""Fetches an ordinary public webpage and pulls out its readable text - the
source for "External Link, Generic" content, which has no file to download.
Only plain HTML is read - a page that needs JavaScript to show its real
content won't index."""

import ipaddress
import re
import socket
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import requests
import trafilatura

from config import MAX_WEB_PAGE_BYTES, WEB_PAGE_FETCH_TIMEOUT_SECONDS
from http_session import make_session

_session = make_session()

_USER_AGENT = "Mozilla/5.0 (compatible; PitstopSmartSearch/1.0)"
_MAX_REDIRECTS = 5


@dataclass
class WebPageInfo:
    title: str
    text: str


_DRIVE_HOSTS = {"drive.google.com", "docs.google.com"}


def is_web_page_link(url: str) -> bool:
    """Whether this is an ordinary https link, not a Google Drive/Docs one - used to route indexing."""
    parsed = urlparse(url)
    return parsed.scheme == "https" and bool(parsed.hostname) and parsed.hostname not in _DRIVE_HOSTS


def _is_private_address(host: str) -> bool:
    """Blocks the server from being pointed at internal/private network addresses."""
    try:
        addr_info = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return True  # can't resolve - refuse rather than guess
    for _family, _type, _proto, _canonname, sockaddr in addr_info:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return True
    return False


def _require_safe_https_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Only https links can be indexed.")
    if _is_private_address(parsed.hostname):
        raise ValueError("This link can't be indexed.")


def _fetch_following_safe_redirects(url: str) -> requests.Response:
    """Fetches a URL, checking each hop a redirect leads to the same way the original link was
    checked - `requests`' own automatic redirect handling never re-checks where it ends up, so a
    page that looks public could otherwise redirect somewhere internal and this would fetch it."""
    current_url = url
    for _ in range(_MAX_REDIRECTS + 1):
        _require_safe_https_url(current_url)
        response = _session.get(
            current_url,
            timeout=WEB_PAGE_FETCH_TIMEOUT_SECONDS,
            stream=True,
            headers={"User-Agent": _USER_AGENT},
            allow_redirects=False,
        )
        if response.is_redirect or response.is_permanent_redirect:
            location = response.headers.get("Location")
            response.close()
            if not location:
                raise ValueError("This link doesn't point to a readable web page.")
            current_url = urljoin(current_url, location)
            continue
        return response
    raise ValueError("This link redirects too many times.")


def _dedupe_adjacent_lines(text: str) -> str:
    """Card/grid layouts often repeat a heading right next to itself (once visible, once for
    accessibility), sometimes as its own line, sometimes trailing the line before it - collapses
    those exact repeats, which otherwise break text-fragment matching."""
    lines = text.split("\n")
    deduped: list[str] = []
    for line in lines:
        stripped = line.strip()
        if deduped and stripped and deduped[-1].strip().endswith(stripped):
            continue
        deduped.append(line)
    return "\n".join(deduped)


_HEADING_LINE = re.compile(r"^#{1,6}\s+(.*)$")
_WHOLE_LINE_BOLD = re.compile(r"^\*\*(.+)\*\*$")
_INLINE_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_INLINE_EMPHASIS = re.compile(r"\*\*(.+?)\*\*|__(.+?)__|(?<!\*)\*([^*]+?)\*(?!\*)|(?<!_)_([^_]+?)_(?!_)")


def _markdown_to_plain_text(markdown: str) -> str:
    """Plain-text extraction throws away headings and card titles, letting unrelated page
    sections (e.g. neighbouring cards in a feature grid) read as one continuous paragraph.
    Markdown keeps that structure - this puts a hard paragraph break before each heading or
    standalone bold title, so the chunker keeps those sections apart."""
    blocks: list[str] = []
    for line in markdown.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue
        heading_match = _HEADING_LINE.match(stripped)
        bold_match = _WHOLE_LINE_BOLD.match(stripped)
        text = heading_match.group(1) if heading_match else (bold_match.group(1) if bold_match else stripped)
        text = _INLINE_LINK.sub(r"\1", text)
        text = _INLINE_EMPHASIS.sub(lambda m: next(g for g in m.groups() if g is not None), text)
        if heading_match or bold_match:
            blocks.append("")
        blocks.append(text)
    return "\n".join(blocks)


def fetch_web_page_text(url: str) -> WebPageInfo:
    """Fetches a public webpage and extracts its title and main readable text - raises ValueError
    for anything not safe or not readable, RuntimeError for a genuine network failure."""
    _require_safe_https_url(url)

    try:
        with _fetch_following_safe_redirects(url) as response:
            response.raise_for_status()

            content_type = response.headers.get("Content-Type", "")
            if "html" not in content_type.lower():
                raise ValueError("This link doesn't point to a readable web page.")

            raw = response.raw.read(MAX_WEB_PAGE_BYTES + 1, decode_content=True)
            if len(raw) > MAX_WEB_PAGE_BYTES:
                raise ValueError(f"This page is too large to index (over {MAX_WEB_PAGE_BYTES // 1_048_576} MB).")
            encoding = response.encoding
    except ValueError:
        raise
    except Exception as error:  # noqa: BLE001 - any network failure is reported the same way
        raise RuntimeError("Could not read that page.") from error

    html = raw.decode(encoding or "utf-8", errors="replace")
    markdown = trafilatura.extract(html, url=url, output_format="markdown", include_tables=True) or ""
    text = _dedupe_adjacent_lines(_markdown_to_plain_text(markdown))
    if not text.strip():
        raise ValueError("Nothing worth indexing was found on this page.")

    metadata = trafilatura.extract_metadata(html, default_url=url)
    title = (metadata.title if metadata and metadata.title else urlparse(url).hostname) or url

    return WebPageInfo(title=title, text=text)
