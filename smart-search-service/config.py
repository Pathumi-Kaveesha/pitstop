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

"""All tunable settings for the smart search service, in one place -
mirrors the values previously used in the Ballerina version, so search
behavior (filtering, chunk sizes, scoring) doesn't change with the
language switch."""

import os

from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
PINECONE_API_KEY = os.environ["PINECONE_API_KEY"]
PINECONE_SERVICE_URL = os.environ["PINECONE_SERVICE_URL"]

# Gemini embedding model. NOTE: this must never change without re-embedding
# and re-indexing every document already stored in Pinecone - different
# embedding models produce vectors that are not comparable to each other.
GEMINI_EMBEDDING_MODEL = "gemini-embedding-2"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

# Must match the "Dimension" the Pinecone index was created with.
EMBEDDING_DIMENSION = 768

# Gemini lets you tell it *why* you're embedding a piece of text, which
# improves match quality - text meant to be searched later should use
# RETRIEVAL_DOCUMENT, and the search query itself should use RETRIEVAL_QUERY.
TASK_TYPE_DOCUMENT = "RETRIEVAL_DOCUMENT"
TASK_TYPE_QUERY = "RETRIEVAL_QUERY"

DEFAULT_SEARCH_RESULT_LIMIT = 10

# How big (in characters) each chunk of a document should be, and how much
# neighbouring chunks should overlap - shared text between consecutive
# chunks means a thought that gets split right at a chunk boundary is still
# at least partly present in both pieces, instead of being cut clean in
# half. Applied across the whole document at once (not per-page), so a
# paragraph that spans a PDF page break is chunked as one continuous piece
# of text, not two disconnected fragments.
MAX_CHUNK_SIZE = 1000
MAX_CHUNK_OVERLAP = 150

# A chunk this short (e.g. a lone copyright line, a page number, a heading
# by itself) doesn't carry enough real content to be meaningfully searched -
# with so few words, whichever one is most distinctive (like a company name)
# ends up dominating its whole embedding, making it look deceptively similar
# to any search mentioning that word even when the sentence itself is
# off-topic. Chunks shorter than this are skipped entirely at ingest time,
# so they're never stored or returned as a match.
MIN_CHUNK_LENGTH = 150

# A longer document can produce dozens of chunks, each needing its own
# call to Gemini to be embedded. Firing all of those back-to-back can trip
# Gemini's free-tier per-minute rate limit partway through an upload (a
# 429 "Resource exhausted"), so a small pause is inserted between chunks,
# and a failed call is retried a few times with a short wait rather than
# failing the whole upload over one rejected request.
EMBED_REQUEST_SPACING_SECONDS = 1
EMBED_MAX_RETRIES = 3
EMBED_RETRY_DELAY_SECONDS = 5

# How many raw chunk matches to pull per distinct document we want back -
# several of the closest chunks are often from the same document, so we
# over-fetch before de-duplicating by document title.
RAW_MATCH_POOL_MULTIPLIER = 6

# Filtering is embedding-score-only, on purpose - document content is never
# sent anywhere for an AI to read/judge, only the meaning-code (the list of
# numbers) is compared. Both numbers below are tuned from real scores
# observed in this project, across several different searches:
#   - a completely unrelated query still scores ~0.52-0.53 against real
#     documents just by chance - that's the baseline noise level of this
#     embedding space, not a real match, so anything below
#     MINIMUM_SIMILARITY_SCORE is dropped outright.
#   - separately, a document that only shares generic vocabulary with the
#     query (but isn't actually about it) has topped out around 0.66,
#     while genuinely correct matches - even weak ones - stayed at 0.69+.
#     MAX_SCORE_GAP_FROM_TOP_MATCH catches that case: anything trailing
#     too far behind the single best result of a given search is dropped,
#     since a real second-best match tends to sit close to the top one.
MINIMUM_SIMILARITY_SCORE = 0.70
MAX_SCORE_GAP_FROM_TOP_MATCH = 0.06
