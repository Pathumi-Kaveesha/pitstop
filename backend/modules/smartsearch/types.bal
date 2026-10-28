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

import pitstop.database;
import pitstop.types;

# One matching document chunk found by search.
#
# + content - The matching chunk's text
# + title - The document it came from
# + page - Which page of the document it came from
# + similarityScore - How closely it matched the search query (0-1)
# + documentId - Id of the content this chunk came from
# + unitLabel - What one piece of this file type is called - Page, Slide, Section or Sheet
# + fileExtension - The original file's type (pdf/pptx/docx/xlsx/webpage), or "reference" for a stand-in document
# + source - "upload" or "drive"
# + driveLink - The link used to index this document, when source is "drive"
# + nativeLink - Link to this chunk's slide/tab/heading, empty when there isn't one
public type SmartSearchResult record {|
    string content;
    string title;
    int? page = ();
    float similarityScore;
    string documentId = "";
    string unitLabel = "Page";
    string fileExtension = "pdf";
    string 'source = "upload";
    string driveLink = "";
    string nativeLink = "";
|};

# Full response from the Smart Search service.
#
# + answer - A generated answer, or () if nothing matched
# + sources - The document chunks the answer was based on
# + contents - The real Pitstop content records behind the matches
public type SmartSearchResponse record {|
    string? answer;
    SmartSearchResult[] sources;
    types:ContentResponse[] contents = [];
|};

# What kind of message to write about a piece of material.
public type ComposeIntent "email"|"chat"|"plain"|"explain"|"custom";

# A request to write a message from the sources a search found.
#
# + query - What the user searched for
# + documentIds - The Pitstop content ids of the results to write from, best first
# + intent - What kind of message to write
# + purpose - What the user needs it for, in their own words - required for "custom", ignored for the others
public type ComposeRequest record {|
    string query;
    string[] documentIds;
    ComposeIntent intent;
    string? purpose = ();
|};

# The written message.
#
# + text - The message, as plain text - for an email, without its subject line
# + documentIds - The results it was written from, in the order they were ranked
# + subject - An email's subject line, when one was written
public type ComposeResponse record {|
    string text;
    string[] documentIds;
    string? subject = ();
|};

# One excerpt of one source, sent to the Smart Search service to write from.
#
# + title - The document it comes from
# + label - Where in it, such as "Slide 7"
# + text - The excerpt's text
type ComposePassage record {|
    string title;
    string label;
    string text;
|};

# What the Smart Search service is asked to write.
#
# + intent - What kind of message to write
# + query - What the user searched for
# + passages - The excerpts of every source to write from, best first
# + purpose - What the user needs it for, in their own words - only sent for "custom"
type ComposePayload record {|
    ComposeIntent intent;
    string query;
    ComposePassage[] passages;
    string? purpose = ();
|};

# What the Smart Search service is asked to write an answer from.
#
# + userQuery - What the user searched for
# + documentIds - The only documents the answer may be written from
type AnswerPayload record {|
    string userQuery;
    string[] documentIds;
|};

# The answer the Smart Search service wrote.
#
# + answer - The answer, or nothing when there was nothing to write it from
type AnswerResponse record {
    string? answer = ();
};

# Result of an admin-run backfill scan.
#
# + candidates - Up to the requested count of pending content items
# + scanIncomplete - True if a safety cap stopped the scan before it checked everything
# + progressed - True if the scan changed anything (reconciled a stale record, recorded a failure,
#                or found a candidate) - a background run shouldn't treat this as stuck
public type BackfillCandidatesResult record {|
    database:IndexingInfo[] candidates;
    boolean scanIncomplete;
    boolean progressed;
|};

# Where one content item stands in an admin bulk-index run.
public type BackfillStatus "not_started"|"queued"|"in_progress"|"indexed"|"failed";

# One content item's status, for the admin bulk-index status list.
#
# + contentId - Id of the content
# + description - The content's title, for display
# + contentType - Type of the content
# + contentSubtype - Subtype of the content, when set
# + contentLink - The content's link
# + routePath - The Pitstop page this content is on, empty when it has none
# + status - Where this item stands
# + failureReason - Why it failed, when status is "failed"
public type BackfillStatusItem record {|
    int contentId;
    string description;
    string contentType;
    string? contentSubtype;
    string contentLink;
    string routePath = "";
    BackfillStatus status;
    string? failureReason;
|};

# A page of the admin bulk-index status list.
#
# + items - This page's content items
# + page - The page number returned (1-based) - may differ from what was asked for, if that was out of range
# + totalPages - How many pages exist in total
# + totalCount - How many items match in total
# + countIsApproximate - True if totalCount/totalPages are an upper bound, not exact - see getBackfillStatusList
# + running - True if an "index everything" run is currently active
public type BackfillStatusResult record {|
    BackfillStatusItem[] items;
    int page;
    int totalPages;
    int totalCount;
    boolean countIsApproximate;
    boolean running;
|};

# What an active "index everything" run covers, so the status list can show what is still waiting to be sent.
#
# + contentType - The content type the run is limited to, when set
# + contentSubtype - The content subtype the run is limited to, when set
# + maxCount - How many items the run may send in total, when limited
# + submitted - How many items the run has sent so far
# + retryFailed - True if the run retries failed content - those items already show as failed, so none are queued
type BulkRunScope record {|
    string? contentType;
    string? contentSubtype;
    int? maxCount;
    int submitted;
    boolean retryFailed;
|};

# Result of trying to start an "index everything" run.
#
# + started - False if a run was already active - nothing changed
public type BulkIndexStartResult record {|
    boolean started;
|};

# Body for triggering a backfill batch.
#
# + contentIds - The content items to index
public type BackfillIndexRequest record {|
    int[] contentIds;
|};

# Result of triggering a backfill batch.
#
# + submitted - How many were sent for indexing
# + deferred - How many were skipped because the caller's save limit was reached
# + notIndexable - How many weren't something Smart Search can read, recorded with a reason instead
public type BackfillResult record {|
    int submitted;
    int deferred;
    int notIndexable;
|};

# Body for the Python service's /ingest-drive-link.
#
# + driveLink - The link to read text from
# + title - Shown as this document's title in search results
# + contentId - Reused as Smart Search's own documentId
# + displayLink - Set when driveLink is only a transcript - the content's own link is shown instead
# + adminEmail - The admin whose action triggered this, for the logs only
public type DriveLinkIngestRequest record {|
    string driveLink;
    string? title = ();
    string? contentId = ();
    string? displayLink = ();
    string? adminEmail = ();
|};

# Asks whether the file or page behind an indexed document has changed.
#
# + link - The link indexing reads - the same one sent as driveLink
# + indexedAt - When the content was confirmed indexed, in Unix seconds
type SourceCheckRequest record {|
    string link;
    int? indexedAt;
|};

# Whether the file or page behind an indexed document has changed.
#
# + result - "changed", "unchanged", "gone" (deleted, or no longer shared with Pitstop), "unindexable" (it changed and
# can't be indexed any more), "unavailable" (still there and unchanged, but the rules no longer allow indexing it) or
# "unknown" (couldn't tell right now)
# + reason - Why it can't be indexed, for "unindexable"
type SourceCheckResponse record {
    string result;
    string reason?;
};

# Auth configurations, same shape the email module uses.
#
# + tokenUrl - The URL of the token endpoint
# + clientId - The client ID of the application
# + clientSecret - The client secret of the application
public type Oauth2Config record {|
    string tokenUrl;
    string clientId;
    string clientSecret;
|};

# Smart Search Service Configuration.
#
# + apiEndpoint - Smart Search service endpoint
# + oauthConfig - Auth Configurations, set once the service sits behind
#                 Choreo's gateway and absent when called directly
public type SmartSearchServiceConfig record {|
    string apiEndpoint;
    Oauth2Config oauthConfig?;
|};
