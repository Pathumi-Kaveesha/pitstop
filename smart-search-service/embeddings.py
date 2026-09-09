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

"""Talks directly to Gemini's embedContent REST API - text in, a list of
numbers out. This is the *only* thing document content is ever sent to an
AI for: turning it into a meaning-code for comparison. Nothing here ever
asks an AI to read, summarize, or judge the text."""

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
    TASK_TYPE_DOCUMENT,
)


def embed_text(text: str, task_type: str) -> list[float]:
    """Embeds one piece of text. Retries a few times with a short wait if
    the call fails (e.g. a rate limit), rather than failing outright over
    one rejected request."""
    url = f"{GEMINI_BASE_URL}/models/{GEMINI_EMBEDDING_MODEL}:embedContent"
    headers = {"x-goog-api-key": GEMINI_API_KEY}
    payload = {
        "content": {"parts": [{"text": text}]},
        "embedContentConfig": {
            "taskType": task_type,
            "outputDimensionality": EMBEDDING_DIMENSION,
        },
    }

    last_error: Exception | None = None
    for attempt in range(EMBED_MAX_RETRIES + 1):
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            return response.json()["embedding"]["values"]
        except Exception as error:  # noqa: BLE001 - genuinely want to retry on anything
            last_error = error
            if attempt < EMBED_MAX_RETRIES:
                time.sleep(EMBED_RETRY_DELAY_SECONDS)

    raise RuntimeError(f"Failed to call the Gemini embedContent API: {last_error}") from last_error


def embed_chunks(texts: list[str], spacing_seconds: float) -> list[list[float]]:
    """Embeds several chunks of text for storage (RETRIEVAL_DOCUMENT), one
    at a time with a pause between calls - a long document can produce
    dozens of chunks, and firing that many requests back-to-back is what
    trips Gemini's free-tier per-minute rate limit partway through an
    upload."""
    vectors = []
    for i, text in enumerate(texts):
        vectors.append(embed_text(text, TASK_TYPE_DOCUMENT))
        if i < len(texts) - 1:
            time.sleep(spacing_seconds)
    return vectors
