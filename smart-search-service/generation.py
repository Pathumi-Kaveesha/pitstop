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

"""Tool 2: turns the chunks Tool 1 already matched into one written answer.

This is the single place in the service where document text is sent to an
AI to be *read and reasoned about* - and only ever text that Tool 1 has
already decided is relevant, never a whole document. Everything else
(searching, filtering, ranking) is arithmetic on embedding vectors.

This is also the only file that knows which AI provider is in use, which
is what made swapping Gemini for Claude a change to this file alone.
"""

import logging
import time

import anthropic

from config import (
    ANTHROPIC_API_KEY,
    CLAUDE_GENERATION_MODEL,
    GENERATION_EFFORT,
    GENERATION_MAX_RETRIES,
    GENERATION_MAX_TOKENS,
    GENERATION_RETRY_DELAY_SECONDS,
    GENERATION_TIMEOUT_SECONDS,
)
from vectorstore import SearchResult

logger = logging.getLogger("smart-search-service")

# Built once and reused. The SDK retries connection errors, 429s and 5xx
# by itself, so the retry loop below only handles what it gives up on.
_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY, timeout=GENERATION_TIMEOUT_SECONDS)

SYSTEM_PROMPT = """You answer questions using only the excerpts you are given, which come from internal company documents.

Rules:
- Use only the information in the excerpts. Never add anything from outside them.
- If the excerpts don't actually answer the question, say so plainly instead of guessing.
- Mention which source(s) your answer is drawn from, by name.
- Answer in a few clear sentences. No preamble."""


def build_prompt(query: str, results: list[SearchResult]) -> str:
    excerpts = "\n\n".join(f"[Source: {r.title}, {r.unit_label.lower()} {r.page}]\n{r.content}" for r in results)
    return f"""Question: {query}

Excerpts:
{excerpts}"""


def generate_answer(query: str, results: list[SearchResult]) -> str:
    """Asks Claude to write one answer grounded in the given excerpts.

    Note there is no temperature setting: current Claude models reject
    sampling parameters outright. Groundedness comes from the system
    prompt and from the fact that only already-matched text is sent."""
    prompt = build_prompt(query, results)

    last_error: Exception | None = None
    for attempt in range(GENERATION_MAX_RETRIES + 1):
        try:
            response = _client.messages.create(
                model=CLAUDE_GENERATION_MODEL,
                max_tokens=GENERATION_MAX_TOKENS,
                output_config={"effort": GENERATION_EFFORT},
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            )

            # A safety decline comes back as a normal 200 response, not an
            # error, so it has to be checked for explicitly rather than
            # assuming there's text to read.
            if response.stop_reason == "refusal":
                logger.warning("Claude declined to answer this query")
                raise RuntimeError("The model declined to answer this question.")

            # content is a list of blocks, and only some of them are text
            # (adaptive thinking adds its own), so pick out the text ones.
            answer = "".join(block.text for block in response.content if block.type == "text").strip()
            if not answer:
                raise RuntimeError("The model returned an empty answer.")
            return answer

        except anthropic.APIStatusError as error:
            # 4xx that isn't a rate limit means the request itself is wrong -
            # retrying an identical bad request just wastes the user's time.
            last_error = error
            if error.status_code < 500 and error.status_code != 429:
                break
        except (anthropic.APIConnectionError, RuntimeError) as error:
            last_error = error

        if attempt < GENERATION_MAX_RETRIES:
            time.sleep(GENERATION_RETRY_DELAY_SECONDS)

    raise RuntimeError(f"Failed to generate an answer: {last_error}") from last_error
