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
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()


def _positive_int_env(name: str, default: int) -> int:
    """A whole number above zero from the environment - the default only when it's unset or blank, an error when it's set but unusable."""
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        value = 0
    if value <= 0:
        raise ValueError(f"{name} must be a whole number above 0, got {raw!r}.")
    return value


VERTEX_PROJECT_ID = os.environ["VERTEX_PROJECT_ID"]
# "global" is where Vertex serves gemini-embedding-2 from.
VERTEX_LOCATION = os.environ.get("VERTEX_LOCATION") or "global"
# The service account key's JSON - the environment's default credentials are used if unset.
VERTEX_SERVICE_ACCOUNT_JSON = os.environ.get("VERTEX_SERVICE_ACCOUNT_JSON") or None
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
ANTHROPIC_BASE_URL = os.environ.get("ANTHROPIC_BASE_URL") or None
if ANTHROPIC_BASE_URL and not ANTHROPIC_BASE_URL.startswith("https://"):
    raise ValueError("ANTHROPIC_BASE_URL must use https:// - the API key is sent to this host.")

# The Drive Service, which reads Google Drive for this service - https, or localhost for development.
DRIVE_SERVICE_URL = os.environ["DRIVE_SERVICE_URL"].strip().rstrip("/")
_drive_service = urlparse(DRIVE_SERVICE_URL)
_is_local = _drive_service.scheme == "http" and _drive_service.hostname in ("localhost", "127.0.0.1")
if not ((_drive_service.scheme == "https" and _drive_service.hostname) or _is_local):
    raise ValueError("DRIVE_SERVICE_URL must use https:// - a token is sent to this host.")

# Authentication to the Drive Service: client credentials (the Choreo connection), or a fixed token for local runs only.
DRIVE_SERVICE_TOKEN_URL = (os.environ.get("DRIVE_SERVICE_TOKEN_URL") or "").strip() or None
if DRIVE_SERVICE_TOKEN_URL:
    _token_url = urlparse(DRIVE_SERVICE_TOKEN_URL)
    if not (_token_url.scheme == "https" and _token_url.hostname):
        raise ValueError("DRIVE_SERVICE_TOKEN_URL must use https:// - the client secret is sent to this host.")
    DRIVE_SERVICE_CLIENT_ID = os.environ["DRIVE_SERVICE_CLIENT_ID"]
    DRIVE_SERVICE_CLIENT_SECRET = os.environ["DRIVE_SERVICE_CLIENT_SECRET"]
else:
    DRIVE_SERVICE_CLIENT_ID = DRIVE_SERVICE_CLIENT_SECRET = None
DRIVE_SERVICE_AUTH_TOKEN = (os.environ.get("DRIVE_SERVICE_AUTH_TOKEN") or "").strip() or None

DRIVE_SERVICE_MAX_RETRIES = 2
DRIVE_SERVICE_RETRY_DELAY_SECONDS = 2
# Connection string for the PostgreSQL database that stores the chunk vectors.
POSTGRES_DSN = os.environ["POSTGRES_DSN"]

# Above this, a file gets every concurrency slot to itself instead of sharing MAX_CONCURRENT_INDEX_JOBS.
LARGE_FILE_EXCLUSIVE_THRESHOLD_BYTES = 100 * 1024 * 1024

# Reject a Drive file before downloading it if it's bigger than this - set MAX_DRIVE_FILE_SIZE_MB per environment, roughly (memory - 250 MB) / 3.5.
MAX_DRIVE_FILE_SIZE_BYTES = _positive_int_env("MAX_DRIVE_FILE_SIZE_MB", 150) * 1024 * 1024

# Office files are zip archives - a small one can expand to something huge.
# Checked against the entries' declared sizes before any parsing.
MAX_OOXML_UNCOMPRESSED_BYTES = 400 * 1024 * 1024

# Reject a webpage before reading past this many bytes of its HTML.
MAX_WEB_PAGE_BYTES = 10 * 1024 * 1024

WEB_PAGE_FETCH_TIMEOUT_SECONDS = 20

# Changing this means re-embedding and re-indexing everything already stored.
GEMINI_EMBEDDING_MODEL = "gemini-embedding-2"

# Must match the vector column's dimension in the chunks table.
EMBEDDING_DIMENSION = 768

DEFAULT_SEARCH_RESULT_LIMIT = 10

# Chunk size and overlap, in characters.
MAX_CHUNK_SIZE = 1000
MAX_CHUNK_OVERLAP = 150

# Chunks shorter than this are dropped - too little text to embed meaningfully.
MIN_CHUNK_LENGTH = 150

EMBED_REQUEST_SPACING_SECONDS = 1

# Each running job holds its whole file in memory, so this bounds peak memory use.
MAX_CONCURRENT_INDEX_JOBS = 3

# The first change check of a document indexed before versions were kept trusts it as unchanged only when its file was
# last modified this long before the backend confirmed it indexed - that confirmation can lag the real indexing.
SOURCE_FIRST_CHECK_MARGIN_SECONDS = 24 * 60 * 60

# How long an indexing failure reason is remembered
INDEX_ERROR_TTL_SECONDS = 24 * 60 * 60

# A running index job refreshes its mark this often; without a refresh for the second period it counts as interrupted.
INDEX_HEARTBEAT_SECONDS = 20
INDEX_STALE_AFTER_SECONDS = 180

EMBED_MAX_RETRIES = 3
EMBED_RETRY_DELAY_SECONDS = 5

UPSERT_MAX_RETRIES = 2
UPSERT_RETRY_DELAY_SECONDS = 3

DELETE_MAX_RETRIES = 2
DELETE_RETRY_DELAY_SECONDS = 3

# A search's results are kept this long, so its answer request reuses them instead of looking up again.
SEARCH_CACHE_TTL_SECONDS = 60
SEARCH_CACHE_MAX_ENTRIES = 100

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
GENERATION_CONNECT_TIMEOUT_SECONDS = 5
GENERATION_MAX_RETRIES = 1
GENERATION_RETRY_DELAY_SECONDS = 3

# Checking the user's login token on each call (see auth.py): the same issuer, audience and JWKS address the backend
# validates with. The audience can list several, comma-separated.
JWT_ISSUER = os.environ["JWT_ISSUER"].strip()
JWT_AUDIENCE = [value.strip() for value in os.environ["JWT_AUDIENCE"].split(",") if value.strip()]
JWT_JWKS_URL = os.environ["JWT_JWKS_URL"].strip()
JWT_CLOCK_SKEW_SECONDS = _positive_int_env("JWT_CLOCK_SKEW_SECONDS", 60)
# The group names the backend allows (authorizedRoles.adminRole and employeeRole): any of them may search, only admins may index or delete.
JWT_ADMIN_ROLE = os.environ["JWT_ADMIN_ROLE"].strip()
JWT_EMPLOYEE_ROLE = os.environ["JWT_EMPLOYEE_ROLE"].strip()
if not (JWT_ISSUER and JWT_AUDIENCE and JWT_JWKS_URL and JWT_ADMIN_ROLE and JWT_EMPLOYEE_ROLE):
    raise ValueError(
        "JWT_ISSUER, JWT_AUDIENCE, JWT_JWKS_URL, JWT_ADMIN_ROLE and JWT_EMPLOYEE_ROLE must all be set and not blank."
    )
if not JWT_JWKS_URL.startswith("https://"):
    raise ValueError("JWT_JWKS_URL must use https:// - the keys that sign the tokens come from this address.")
