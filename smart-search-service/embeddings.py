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

"""Talks to Gemini's embedContent REST API - text in, a vector out."""

from __future__ import annotations

import time

import requests

from config import (
    EMBED_MAX_RETRIES,
    EMBED_RETRY_DELAY_SECONDS,
    EMBEDDING_DIMENSION,
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    GEMINI_EMBEDDING_MODEL,
)
from http_session import make_session

_session = make_session()


def format_query_text(query: str) -> str:
    return f"task: search result | query: {query}"


def format_document_text(title: str, text: str) -> str:
    return f"title: {title} | text: {text}"


def embed_text(text: str) -> list[float]:
    """Embeds one piece of text, retrying a few times on failure."""
    url = f"{GEMINI_BASE_URL}/models/{GEMINI_EMBEDDING_MODEL}:embedContent"
    headers = {"x-goog-api-key": GEMINI_API_KEY}
    payload = {
        "content": {"parts": [{"text": text}]},
        "embedContentConfig": {
            "outputDimensionality": EMBEDDING_DIMENSION,
        },
    }

    last_error: Exception | None = None
    for attempt in range(EMBED_MAX_RETRIES + 1):
        try:
            response = _session.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            return response.json()["embedding"]["values"]
        except requests.exceptions.HTTPError as error:
            # A rejected key or malformed request fails the same way every
            # time - only rate limits and server-side faults are worth a retry.
            last_error = error
            status = error.response.status_code if error.response is not None else None
            if status is not None and status != 429 and status < 500:
                break
        except requests.exceptions.RequestException as error:
            last_error = error
        except (KeyError, TypeError) as error:
            raise RuntimeError(f"Unexpected response from the Gemini embedContent API: {error}") from error

        if attempt < EMBED_MAX_RETRIES:
            time.sleep(EMBED_RETRY_DELAY_SECONDS)

    raise RuntimeError(f"Failed to call the Gemini embedContent API: {last_error}") from last_error


def embed_chunks(texts: list[str], title: str, spacing_seconds: float) -> list[list[float]]:
    """Embeds each chunk for storage, paced to stay within the rate limit."""
    vectors = []
    for i, text in enumerate(texts):
        vectors.append(embed_text(format_document_text(title, text)))
        if i < len(texts) - 1:
            time.sleep(spacing_seconds)
    return vectors
