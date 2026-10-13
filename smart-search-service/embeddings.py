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

"""Talks to Vertex AI's embedContent REST API - text in, a vector out."""

from __future__ import annotations

import json
import time

import requests
from google.auth import default as default_credentials
from google.auth.exceptions import RefreshError
from google.auth.exceptions import TimeoutError as AuthTimeoutError
from google.auth.exceptions import TransportError
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

from config import (
    EMBED_MAX_RETRIES,
    EMBED_RETRY_DELAY_SECONDS,
    EMBEDDING_DIMENSION,
    GEMINI_EMBEDDING_MODEL,
    VERTEX_LOCATION,
    VERTEX_PROJECT_ID,
    VERTEX_SERVICE_ACCOUNT_JSON,
)
from http_session import make_session

_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]

_HOST = "aiplatform.googleapis.com" if VERTEX_LOCATION == "global" else f"{VERTEX_LOCATION}-aiplatform.googleapis.com"
_EMBED_URL = (
    f"https://{_HOST}/v1/projects/{VERTEX_PROJECT_ID}/locations/{VERTEX_LOCATION}"
    f"/publishers/google/models/{GEMINI_EMBEDDING_MODEL}:embedContent"
)


def _make_session() -> AuthorizedSession:
    """A connection pool that signs in to Google Cloud and refreshes its own access token."""
    if VERTEX_SERVICE_ACCOUNT_JSON:
        # strict=False lets a key pasted with real line breaks load too.
        credentials = service_account.Credentials.from_service_account_info(
            json.loads(VERTEX_SERVICE_ACCOUNT_JSON, strict=False), scopes=_SCOPES
        )
    else:
        credentials, _ = default_credentials(scopes=_SCOPES)
    session = AuthorizedSession(credentials, refresh_timeout=30)
    session.mount("https://", make_session().get_adapter("https://"))
    return session


_session = _make_session()


def format_query_text(query: str) -> str:
    return f"task: search result | query: {query}"


def format_document_text(title: str, text: str) -> str:
    return f"title: {title} | text: {text}"


def embed_text(text: str) -> list[float]:
    """Embeds one piece of text, retrying a few times on failure."""
    payload = {
        "content": {"parts": [{"text": text}]},
        "embedContentConfig": {
            "outputDimensionality": EMBEDDING_DIMENSION,
        },
    }

    last_error: Exception | None = None
    for attempt in range(EMBED_MAX_RETRIES + 1):
        try:
            response = _session.post(_EMBED_URL, json=payload, timeout=30)
            response.raise_for_status()
            values = response.json()["embedding"]["values"]
            # A wrong-sized vector would corrupt the stored index, so refuse it.
            if len(values) != EMBEDDING_DIMENSION:
                raise RuntimeError(f"Vertex AI returned {len(values)} values, expected {EMBEDDING_DIMENSION}")
            return values
        except requests.exceptions.HTTPError as error:
            # A rejected key or malformed request fails the same way every
            # time - only rate limits and server-side faults are worth a retry.
            last_error = error
            status = error.response.status_code if error.response is not None else None
            if status is not None and status != 429 and status < 500:
                break
        except (requests.exceptions.RequestException, TransportError, AuthTimeoutError) as error:
            # Google's library raises its own error types for a network blip while signing in.
            last_error = error
        except RefreshError as error:
            # A rejected key fails the same way every time - only a temporary sign-in problem is worth a retry.
            last_error = error
            if not error.retryable:
                break
        except (KeyError, TypeError) as error:
            raise RuntimeError(f"Unexpected response from the Vertex AI embedContent API: {error}") from error

        if attempt < EMBED_MAX_RETRIES:
            time.sleep(EMBED_RETRY_DELAY_SECONDS)

    raise RuntimeError(f"Failed to call the Vertex AI embedContent API: {last_error}") from last_error


def embed_chunks(texts: list[str], title: str, spacing_seconds: float) -> list[list[float]]:
    """Embeds each chunk for storage, paced to stay within the rate limit."""
    vectors = []
    for i, text in enumerate(texts):
        vectors.append(embed_text(format_document_text(title, text)))
        if i < len(texts) - 1:
            time.sleep(spacing_seconds)
    return vectors
