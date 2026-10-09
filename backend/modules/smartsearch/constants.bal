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

const int MAX_FILE_DOWNLOADS_PER_MINUTE = 10;
const int DOWNLOAD_WINDOW_SECONDS = 60;
const int MAX_TRACKED_DOWNLOAD_USERS = 1000;
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

// Pace between automatic batches in a one-click "index everything" run - roughly one ingest window.
const decimal BULK_INDEX_BATCH_INTERVAL_SECONDS = 65;

// Safety net - bounds how many batches one "index everything" run can submit before giving up.
const int MAX_BULK_INDEX_ITERATIONS = 500;

const int MAX_STATUS_LIST_COUNT = 100;
