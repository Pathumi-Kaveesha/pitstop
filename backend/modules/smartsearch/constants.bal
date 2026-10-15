// Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

// The user's login token, forwarded so the Smart Search service can check it too. Not x-jwt-assertion: Choreo's gateway sets that one itself.
const string USER_JWT_HEADER = "x-user-jwt";

const int SEARCH_WINDOW_SECONDS = 60;
// One search on the page makes two calls (sources, then the answer), so this allows about 20 searches a minute.
const int MAX_SEARCHES_PER_MINUTE = 40;
const int MAX_TRACKED_SEARCH_USERS = 1000;
const int INGEST_WINDOW_SECONDS = 60;
const int MAX_INGESTS_PER_USER = 20;

const int RETRY_WINDOW_SECONDS = 60;
const int MAX_RETRIES_PER_CONTENT = 2;
const int MAX_RETRIES_PER_USER = 20;
const int MAX_TRACKED_RETRIES = 1000;

const int RECHECK_WINDOW_HOURS = 24;

// Matches MAX_INGESTS_PER_USER - a full batch shouldn't be able to exceed the admin's own save limit in one click.
const int MAX_BACKFILL_BATCH_SIZE = 20;

// Caps one search from turning into an unbounded scan of an already-mostly-indexed corpus.
const int MAX_BACKFILL_SCAN_PAGES = 10;

// Caps the serial Smart Search status checks allowed in one backfill scan.
const int MAX_BACKFILL_STATUS_CHECKS = 100;

// Safety net - bounds how long a crashed/stuck job can block a content item from being retried.
const int BACKFILL_RESERVATION_TTL_SECONDS = 30 * 60;

const decimal RECONCILE_INTERVAL_SECONDS = 6 * 60 * 60;

// How often reserved (in-flight) content gets actively re-checked, so a finished item is
// recognized promptly instead of sitting reserved until its TTL expires.
const decimal RESERVATION_RECONCILE_INTERVAL_SECONDS = 60;

// How long after a single retry or edit to confirm its indexing outcome - long enough for a typical job to finish.
const decimal INDEX_CONFIRMATION_DELAY_SECONDS = 65;

// How often the backend looks for indexed chunks whose Pitstop content no longer exists.
const decimal ORPHAN_SWEEP_INTERVAL_SECONDS = 24 * 60 * 60;

// A sweep removes nothing if more than this share of the index looks orphaned - that means the wrong database, not leftovers.
const float MAX_ORPHAN_SHARE = 0.5;

// Bounds how much one sweep removes.
const int MAX_ORPHANS_PER_SWEEP = 200;

// A delete sent to the search service is tried this many times in all, so a brief outage doesn't leave chunks behind.
const int DELETE_INDEX_MAX_ATTEMPTS = 3;

const decimal DELETE_INDEX_RETRY_DELAY_SECONDS = 5;

// Pace between automatic batches in a one-click "index everything" run - roughly one ingest window.
const decimal BULK_INDEX_BATCH_INTERVAL_SECONDS = 65;

// Safety net - bounds how many batches one "index everything" run can submit before giving up.
const int MAX_BULK_INDEX_ITERATIONS = 500;

// Stops a run that keeps scanning without ever finding anything to submit.
const int MAX_EMPTY_INCOMPLETE_SCANS = 3;

const int MAX_STATUS_LIST_COUNT = 100;
