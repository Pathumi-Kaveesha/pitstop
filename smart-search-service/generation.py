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

"""Tool 2: turns Tool 1's matched chunks into one written answer.

This is the one deliberate exception to this project's earlier rule of
never sending document content to an AI - explicitly approved, and kept
isolated to this single file. Only ever called with chunks that already
passed Tool 1's similarity floor (vectorstore.py), so nothing unrelated
reaches the model here either.

Swapping providers (Gemini now, Claude for production) is meant to stay
contained to this file - the rest of the app only ever calls
generate_answer(query, results) and doesn't know or care which model
answers it."""

import time

import requests

from config import (
    GEMINI_API_KEY,
    GEMINI_BASE_URL,
    GEMINI_GENERATION_MODEL,
    GENERATION_MAX_RETRIES,
    GENERATION_RETRY_DELAY_SECONDS,
    GENERATION_TEMPERATURE,
    GENERATION_TIMEOUT_SECONDS,
)
from vectorstore import SearchResult


def build_prompt(query: str, results: list[SearchResult]) -> str:
    """Lays out the matched chunks as labeled excerpts, then asks for one
    answer grounded only in what's given - not the model's general
    knowledge, and not anything beyond these specific excerpts."""
    excerpts = "\n\n".join(f"[Source: {r.title}, page {r.page}]\n{r.content}" for r in results)

    return f"""You are answering a question using only the excerpts below, taken from internal company documents. Answer clearly, in a few sentences.

Rules:
- Use only the information in the excerpts below. Do not add anything from outside them.
- If the excerpts don't actually answer the question, say so plainly instead of guessing.
- Mention which source(s) your answer is drawn from, by name.

Question: {query}

Excerpts:
{excerpts}

Answer:"""


def generate_answer(query: str, results: list[SearchResult]) -> str:
    """Sends the already-filtered chunks plus the user's question to
    Gemini, and returns one synthesized, grounded answer. Retries a couple
    of times on a transient failure (a slow response, or an occasional 503
    from Google's side) rather than failing the whole search over it."""
    prompt = build_prompt(query, results)

    url = f"{GEMINI_BASE_URL}/models/{GEMINI_GENERATION_MODEL}:generateContent"
    headers = {"x-goog-api-key": GEMINI_API_KEY}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": GENERATION_TEMPERATURE},
    }

    last_error = None
    for attempt in range(GENERATION_MAX_RETRIES + 1):
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=GENERATION_TIMEOUT_SECONDS)
            response.raise_for_status()
            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception as error:  # noqa: BLE001 - genuinely want to retry on anything
            last_error = error
            if attempt < GENERATION_MAX_RETRIES:
                time.sleep(GENERATION_RETRY_DELAY_SECONDS)

    raise RuntimeError(f"Failed to call the Gemini generateContent API: {last_error}") from last_error
