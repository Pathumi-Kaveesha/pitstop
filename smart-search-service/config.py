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

"""Tunable settings for the smart search service."""

import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
ANTHROPIC_BASE_URL = os.environ.get("ANTHROPIC_BASE_URL") or None
if ANTHROPIC_BASE_URL and not ANTHROPIC_BASE_URL.startswith("https://"):
    raise ValueError("ANTHROPIC_BASE_URL must use https:// - the API key is sent to this host.")

# OAuth refresh token, obtained once via Google's OAuth Playground.
GOOGLE_DRIVE_CLIENT_ID = os.environ["GOOGLE_DRIVE_CLIENT_ID"]
GOOGLE_DRIVE_CLIENT_SECRET = os.environ["GOOGLE_DRIVE_CLIENT_SECRET"]
GOOGLE_DRIVE_REFRESH_TOKEN = os.environ["GOOGLE_DRIVE_REFRESH_TOKEN"]

GOOGLE_DRIVE_MAX_RETRIES = 2
GOOGLE_DRIVE_RETRY_DELAY_SECONDS = 2
PINECONE_API_KEY = os.environ["PINECONE_API_KEY"]
PINECONE_SERVICE_URL = os.environ["PINECONE_SERVICE_URL"]

# Reject a Drive file before downloading it if it's bigger than this.
MAX_DRIVE_FILE_SIZE_BYTES = 100 * 1024 * 1024

# Office files are zip archives - a small one can expand to something huge.
# Checked against the entries' declared sizes before any parsing.
MAX_OOXML_UNCOMPRESSED_BYTES = 400 * 1024 * 1024

# Changing this means re-embedding and re-indexing everything already stored.
GEMINI_EMBEDDING_MODEL = "gemini-embedding-2"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# Must match the Pinecone index's own configured dimension.
EMBEDDING_DIMENSION = 768

DEFAULT_SEARCH_RESULT_LIMIT = 10

# Chunk size and overlap, in characters.
MAX_CHUNK_SIZE = 1000
MAX_CHUNK_OVERLAP = 150

# Chunks shorter than this are dropped - too little text to embed meaningfully.
MIN_CHUNK_LENGTH = 150

EMBED_REQUEST_SPACING_SECONDS = 1

# Purely a memory-cleanup safety margin for the tombstone dict, not a
# correctness deadline - a job always checks against its own start time,
# never against elapsed time, so this can be generous.
DELETE_TOMBSTONE_TTL_SECONDS = 6 * 60 * 60
EMBED_MAX_RETRIES = 3
EMBED_RETRY_DELAY_SECONDS = 5

UPSERT_MAX_RETRIES = 2
UPSERT_RETRY_DELAY_SECONDS = 3

# Raw matches fetched per result wanted, before narrowing down.
RAW_MATCH_POOL_MULTIPLIER = 6

# Max chunks from the same document allowed into one result set.
MAX_CHUNKS_PER_DOCUMENT = 2

# Tuned from observed scores: unrelated queries top out ~0.60, real matches
# start ~0.68.
MINIMUM_SIMILARITY_SCORE = 0.65
MAX_SCORE_GAP_FROM_TOP_MATCH = 0.03

# Answer generation - a separate model from embedding, used in generation.py.
CLAUDE_GENERATION_MODEL = os.environ.get("CLAUDE_GENERATION_MODEL", "claude-sonnet-5")
GENERATION_EFFORT = "low"
GENERATION_MAX_TOKENS = 8000
GENERATION_TIMEOUT_SECONDS = 90
GENERATION_MAX_RETRIES = 1
GENERATION_RETRY_DELAY_SECONDS = 3
