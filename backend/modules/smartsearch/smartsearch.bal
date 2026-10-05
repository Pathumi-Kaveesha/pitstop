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

import pitstop.authorization;
import pitstop.constants;
import pitstop.database;
import pitstop.types;

import ballerina/http;
import ballerina/log;
import ballerina/task;
import ballerina/time;
import ballerina/url;

# Runs a search against the Smart Search service.
#
# + userQuery - What the user typed into the search box
# + includeAnswer - False returns just the sources, without waiting for the generated answer
# + return - A generated answer plus its sources, or an error
public isolated function searchDocuments(string userQuery, boolean includeAnswer)
    returns SmartSearchResponse|error {

    // Explicit encoding - a query can contain a comma, which Ballerina's
    // query-parameter parser otherwise treats as a list separator.
    string encodedQuery = check url:encode(userQuery, "UTF-8");
    return smartSearchServiceClient->get(string `/search?userQuery=${encodedQuery}&includeAnswer=${includeAnswer}`);
}

# Whether the caller may see this content - the same rule search uses. Denies on any doubt.
#
# + ctx - Request object
# + contentId - The content whose file is being requested
# + return - Whether the caller is allowed to see it
public isolated function canViewContent(http:RequestContext ctx, int contentId) returns boolean {
    string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
    string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
    if userGroups is error || userEmail is error {
        return false;
    }
    boolean isUser = !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups);

    types:ContentResponse[]|error matched = database:getContentsByIds([contentId], isUser, userEmail);
    if matched is error {
        log:printWarn("Smart Search: could not verify access to a document file", matched);
        return false;
    }
    return matched.length() > 0;
}

// User email -> [window start in seconds, downloads in that window]
isolated map<[int, int]> fileDownloadWindows = {};

# Counts one PDF download for the caller and says whether they are still within the limit.
#
# + ctx - Request object
# + return - False once the caller has used up this minute's downloads
public isolated function isWithinDownloadLimit(http:RequestContext ctx) returns boolean {
    string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
    if userEmail is error {
        return false;
    }
    int now = time:utcNow()[0];

    lock {
        if fileDownloadWindows.length() > MAX_TRACKED_DOWNLOAD_USERS {
            foreach string email in fileDownloadWindows.keys() {
                if now - fileDownloadWindows.get(email)[0] >= DOWNLOAD_WINDOW_SECONDS {
                    _ = fileDownloadWindows.remove(email);
                }
            }
        }

        [int, int]? window = fileDownloadWindows[userEmail];
        if window is () || now - window[0] >= DOWNLOAD_WINDOW_SECONDS {
            fileDownloadWindows[userEmail] = [now, 1];
            return true;
        }
        if window[1] >= MAX_FILE_DOWNLOADS_PER_MINUTE {
            return false;
        }
        fileDownloadWindows[userEmail] = [window[0], window[1] + 1];
        return true;
    }
}

// User email -> [window start in seconds, indexing requests in that window]
isolated map<[int, int]> ingestWindows = {};

# Counts one indexing-triggering save for the caller and says whether they are still within the limit.
#
# + ctx - Request object
# + return - False once the caller has used up this minute's indexing requests
public isolated function isIngestAllowed(http:RequestContext ctx) returns boolean {
    string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
    if userEmail is error {
        return false;
    }
    int now = time:utcNow()[0];

    lock {
        [int, int]? window = ingestWindows[userEmail];
        if window is () || now - window[0] >= INGEST_WINDOW_SECONDS {
            ingestWindows[userEmail] = [now, 1];
            return true;
        }
        if window[1] >= MAX_INGESTS_PER_USER {
            return false;
        }
        ingestWindows[userEmail] = [window[0], window[1] + 1];
        return true;
    }
}

// "content:<id>" or "user:<email>" -> [window start in seconds, retries in that window]
isolated map<[int, int]> retryState = {};

# Check whether the caller may retry this content now, and count the retry if so.
#
# + ctx - Request object
# + contentId - The content being retried
# + return - False if this content or this caller is over its retry limit for the current minute
public isolated function isRetryAllowed(http:RequestContext ctx, int contentId) returns boolean {
    string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
    if userEmail is error {
        return false;
    }
    if !isIngestAllowed(ctx) {
        return false;
    }
    string contentKey = string `content:${contentId}`;
    string userKey = string `user:${userEmail}`;
    int now = time:utcNow()[0];

    lock {
        if retryState.length() > MAX_TRACKED_RETRIES {
            foreach string key in retryState.keys() {
                if now - retryState.get(key)[0] >= RETRY_WINDOW_SECONDS {
                    _ = retryState.remove(key);
                }
            }
        }

        [int, int]? contentWindow = retryState[contentKey];
        if contentWindow is [int, int] && now - contentWindow[0] < RETRY_WINDOW_SECONDS
                && contentWindow[1] >= MAX_RETRIES_PER_CONTENT {
            return false;
        }

        [int, int]? userWindow = retryState[userKey];
        if userWindow is [int, int] && now - userWindow[0] < RETRY_WINDOW_SECONDS
                && userWindow[1] >= MAX_RETRIES_PER_USER {
            return false;
        }

        retryState[contentKey] = contentWindow is [int, int] && now - contentWindow[0] < RETRY_WINDOW_SECONDS
                ? [contentWindow[0], contentWindow[1] + 1]
                : [now, 1];
        retryState[userKey] = userWindow is [int, int] && now - userWindow[0] < RETRY_WINDOW_SECONDS
                ? [userWindow[0], userWindow[1] + 1]
                : [now, 1];
        return true;
    }
}

# Fetches an indexed PDF from the Smart Search service, so the browser can open it at a page.
#
# + contentId - The content whose PDF to fetch
# + return - The file's bytes, a not-found or too-large response, or an error
public isolated function fetchDocumentFile(int contentId) returns byte[]|http:NotFound|http:PayloadTooLarge|error {
    http:Response upstream = check smartSearchServiceClient->get(string `/documents/${contentId}/file`);
    if upstream.statusCode == http:STATUS_NOT_FOUND {
        return http:NOT_FOUND;
    }
    if upstream.statusCode == http:STATUS_PAYLOAD_TOO_LARGE {
        return http:PAYLOAD_TOO_LARGE;
    }
    if upstream.statusCode != http:STATUS_OK {
        return error(string `Smart Search service returned status ${upstream.statusCode} for a document file`);
    }
    return check upstream.getBinaryPayload();
}

# Can Smart Search index this content? Keyed on the link rather than where
# the content sits, so content added to any page is indexed, and so nothing
# depends on ids that differ between environments.
#
# + contentLink - The content's link
# + return - Whether this content should also be indexed
public isolated function isIndexableLink(string contentLink) returns boolean {
    string link = contentLink.trim().toLowerAscii();
    if !link.startsWith("https://") {
        return false;
    }
    string afterScheme = link.substring(8);

    int hostEnd = afterScheme.length();
    foreach string terminator in ["/", "?", "#"] {
        int? idx = afterScheme.indexOf(terminator);
        if idx is int && idx < hostEnd {
            hostEnd = idx;
        }
    }
    string hostAndPort = afterScheme.substring(0, hostEnd);

    int? portSep = hostAndPort.indexOf(":");
    string host = portSep is int ? hostAndPort.substring(0, portSep) : hostAndPort;

    return host == "drive.google.com" || host == "docs.google.com";
}

# Whether this link is an ordinary webpage Smart Search can read directly, not a Google Drive/Docs one.
#
# + link - The content's link
# + return - Whether this looks like a plain, readable webpage
public isolated function isWebPageLink(string link) returns boolean {
    return link.trim().toLowerAscii().startsWith("https://") && !isIndexableLink(link);
}

# Whether Smart Search can index this content, given its type.
#
# + contentType - Type of the content
# + contentSubtype - Subtype of the content, when set
# + link - The link that would be indexed
# + return - Whether this content should also be indexed
public isolated function isContentLinkIndexable(string contentType, string? contentSubtype, string link)
        returns boolean {
    if contentType == "external" && contentSubtype == "generic" {
        return isWebPageLink(link);
    }
    return isIndexableLink(link);
}

# Narrows a raw search response down to sources whose document the caller
# is actually allowed to see
#
# + ctx - Request object
# + response - The raw response from the Smart Search service
# + return - The response with only sources, contents and an answer the
#            caller is authorized to see
public isolated function filterToAuthorizedSources(http:RequestContext ctx, SmartSearchResponse response)
    returns SmartSearchResponse {

    string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
    string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
    if userGroups is error || userEmail is error {
        return {answer: (), sources: [], contents: []};
    }
    boolean isUser = !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups);

    // One document can contribute several passages, but stays one card.
    int[] contentIds = [];
    foreach SmartSearchResult searchResult in response.sources {
        int|error contentId = int:fromString(searchResult.documentId);
        if contentId is error || contentIds.indexOf(contentId) !is () {
            continue;
        }
        contentIds.push(contentId);
    }
    if contentIds.length() == 0 {
        return {answer: (), sources: [], contents: []};
    }

    types:ContentResponse[]|error matched = database:getContentsByIds(contentIds, isUser, userEmail);
    if matched is error {
        log:printWarn("Smart Search: could not verify source authorization", matched);
        return {answer: (), sources: [], contents: []};
    }

    map<boolean> authorizedIds = {};
    foreach types:ContentResponse content in matched {
        authorizedIds[content.contentId.toString()] = true;
    }

    SmartSearchResult[] authorizedSources = [];
    foreach SmartSearchResult searchResult in response.sources {
        if authorizedIds.hasKey(searchResult.documentId) {
            authorizedSources.push(searchResult);
        }
    }

    return {
        answer: authorizedSources.length() == response.sources.length() ? response.answer : (),
        sources: authorizedSources,
        contents: matched
    };
}

# Saves an indexing failure, logging a warning if it can't be saved.
#
# + contentId - The content that failed to index
# + reason - Why indexing failed
isolated function recordIndexFailure(int contentId, string reason) {
    error? failureError = database:setSmartSearchIndexFailure(contentId, reason);
    if failureError is error {
        log:printWarn("Smart Search: could not record an index failure", failureError, contentId = contentId);
    }
}

# Records that a re-index was skipped because of the caller's save limit, so an admin can retry it.
#
# + contentId - The content whose re-index was skipped
public isolated function deferReindex(int contentId) {
    recordIndexFailure(contentId, constants:SMART_SEARCH_DEFERRED_REINDEX);
}

# Indexes a content item. Launched with `start` so the caller never waits on it.
#
# + contentId - The content's own id, reused as Smart Search's documentId
# + driveLink - The link to read text from
# + title - The content's title
# + displayLink - Set only when driveLink is a transcript, not the content's own link
public isolated function indexContentForSmartSearch(int contentId, string driveLink, string title,
        string? displayLink = ()) {
    DriveLinkIngestRequest payload = {
        driveLink,
        title,
        contentId: contentId.toString(),
        displayLink
    };

    http:Response|http:ClientError response = smartSearchIngestClient->post("/ingest-drive-link", payload);
    if response is http:ClientError {
        log:printWarn(string `Smart Search: could not reach the indexing service for content ${contentId}`,
                reason = response.message());
        return;
    }

    if response.statusCode >= 200 && response.statusCode < 300 {
        log:printInfo(string `Smart Search: indexed content ${contentId}`);
        return;
    }

    // Rejected before indexing started, so record it right away
    json|http:ClientError responseBody = response.getJsonPayload();
    string reason = "Smart Search rejected this file.";
    if responseBody is json {
        json|error detail = responseBody.detail;
        if detail is string {
            reason = detail;
        }
    }
    log:printWarn(string `Smart Search: skipped indexing content ${contentId}`,
            link = driveLink, status = response.statusCode, reason = reason);
    recordIndexFailure(contentId, reason);
}

# Clears a deleted content's entries from the search index. Content that
# was never indexed simply has nothing to clear. Launched with `start` so
# deleting a content never waits on it.
#
# + contentId - The content that was deleted
# + deletedBy - Email of the admin who deleted it, for the audit log
public isolated function deleteContentFromSmartSearch(int contentId, string deletedBy) {
    error? clearError = database:clearSmartSearchIndexFailure(contentId);
    if clearError is error {
        log:printWarn("Smart Search: could not clear a deleted content's index failure", clearError,
                contentId = contentId);
    }

    _ = clearIndexedEntries(contentId, deletedBy);
}

# Removes a content's entries from the search index.
#
# + contentId - The content whose entries to remove
# + deletedBy - Email of the admin who deleted the content, when this is a real deletion
# + return - False if the entries could not be removed
isolated function clearIndexedEntries(int contentId, string? deletedBy = ()) returns boolean {
    http:Response|http:ClientError response =
        smartSearchServiceClient->delete(string `/documents/${contentId}`);
    if response is http:ClientError {
        log:printWarn(string `Smart Search: could not reach the indexing service to un-index content ${contentId}`,
                reason = response.message());
        return false;
    }

    if response.statusCode >= 200 && response.statusCode < 300 {
        if deletedBy is string {
            log:printInfo(string `Smart Search: cleared any indexed entries for content ${contentId}`, deletedBy = deletedBy);
        } else {
            log:printInfo(string `Smart Search: cleared any indexed entries for content ${contentId}`);
        }
        return true;
    }

    if response.statusCode == http:STATUS_NOT_FOUND {
        return true;
    }

    string|http:ClientError responseBody = response.getTextPayload();
    log:printWarn(string `Smart Search: could not clear indexed entries for content ${contentId}`,
            status = response.statusCode,
            reason = responseBody is string ? responseBody : "(no details returned)");
    return false;
}

# Content types that read from a stand-in document instead of their own link.
#
# + contentType - Type of the content
# + contentSubtype - Subtype of the content, when set
# + return - Whether this content is indexed via a stand-in document
public isolated function requiresTranscript(string contentType, string? contentSubtype) returns boolean {
    return (contentType == "external" && contentSubtype == "video")
        || contentType == "lms"
        || contentType == "salesforce";
}

# What should be indexed for a content item right now - its own link, or its transcript link.
#
# + contentType - Type of the content
# + contentSubtype - Subtype of the content, when set
# + contentLink - The content's link
# + transcriptLink - The content's transcript link, when set
# + return - The link to index
public isolated function indexingLinkFor(string contentType, string? contentSubtype, string contentLink,
        string? transcriptLink) returns string? {
    return requiresTranscript(contentType, contentSubtype) ? transcriptLink : contentLink;
}

# The content's own link, when that's not also the link being indexed.
#
# + contentType - Type of the content
# + contentSubtype - Subtype of the content, when set
# + contentLink - The content's link
# + return - The content's own link, when it differs from what's indexed
public isolated function displayLinkFor(string contentType, string? contentSubtype, string contentLink)
        returns string? {
    return requiresTranscript(contentType, contentSubtype) ? contentLink : ();
}

# The reason a content's link can't be indexed, tailored to what its type actually needs.
#
# + contentType - Type of the content
# + contentSubtype - Subtype of the content, when set
# + return - A user-facing reason
isolated function unindexableLinkReason(string contentType, string? contentSubtype) returns string {
    if contentType == "external" && contentSubtype == "generic" {
        return "This link can't be indexed. Smart Search couldn't read that page.";
    }
    return "This link can't be indexed. Smart Search only reads Google Drive links.";
}

// Counts clear-and-index runs; only exists so they share one lock and never overlap
isolated int reindexRuns = 0;

# Re-syncs Smart Search after a content's indexed link may have changed. Launched with `start` so the edit never waits on it.
#
# + contentId - The content that was edited
# + newLink - What should be indexed after the edit, when known at the time
# + previousLink - What was indexed before the edit, when known
public isolated function reindexAfterLinkChange(int contentId, string? newLink, string? previousLink) {
    lock {
        reindexRuns += 1;

        database:IndexingInfo?|error current = database:getIndexingInfo(contentId);
        if current is error {
            log:printWarn("Smart Search: could not look up content after a link change", current, contentId = contentId);
            _ = clearIndexedEntries(contentId);
            recordIndexFailure(contentId, "Could not check this content after its link changed. Please retry.");
            return;
        }
        if current is () {
            return;
        }
        // A newer edit has its own job
        if indexingLinkFor(current.contentType, current.contentSubtype, current.contentLink,
                current.transcriptLink) != newLink {
            return;
        }

        // An old failure belongs to the old link
        error? clearError = database:clearSmartSearchIndexFailure(contentId);
        if clearError is error {
            log:printWarn("Smart Search: could not clear index failure after a link change", clearError,
                    contentId = contentId);
        }

        // Clear the old version first, so a failed re-index never leaves stale results
        if !clearIndexedEntries(contentId) {
            recordIndexFailure(contentId, "Could not remove the previous version. Please retry.");
            return;
        }

        if newLink is string && isContentLinkIndexable(current.contentType, current.contentSubtype, newLink) {
            indexContentForSmartSearch(contentId, newLink, current.description,
                    displayLinkFor(current.contentType, current.contentSubtype, current.contentLink));
        } else if newLink is string && newLink != "" && previousLink is string
                && isContentLinkIndexable(current.contentType, current.contentSubtype, previousLink) {
            recordIndexFailure(contentId, unindexableLinkReason(current.contentType, current.contentSubtype));
        }
    }
}

# Re-triggers indexing for a content item.
#
# + contentId - The content to retry
# + return - Not-found when there's no such content, an error, or nil on success
public isolated function retryIndexContent(int contentId) returns http:NotFound|error? {
    lock {
        reindexRuns += 1;

        database:IndexingInfo? info = check database:getIndexingInfo(contentId);
        if info is () {
            return http:NOT_FOUND;
        }
        error? clearError = database:clearSmartSearchIndexFailure(contentId);
        if clearError is error {
            log:printWarn("Smart Search: could not clear index failure before a retry", clearError, contentId = contentId);
        }
        string? link = indexingLinkFor(info.contentType, info.contentSubtype, info.contentLink, info.transcriptLink);
        // A retry only runs on content that's already flagged as failing, so the problem is real - record why
        if link is () {
            recordIndexFailure(contentId, "A Google Doc link is required for this content type");
            return;
        }
        if !isContentLinkIndexable(info.contentType, info.contentSubtype, link) {
            recordIndexFailure(contentId, unindexableLinkReason(info.contentType, info.contentSubtype));
            return;
        }
        if !clearIndexedEntries(contentId) {
            return error("Could not clear the previous version of this content");
        }
        indexContentForSmartSearch(contentId, link, info.description,
                displayLinkFor(info.contentType, info.contentSubtype, info.contentLink));
        return;
    }
}

# Indexing status of a document.
#
# + indexed - Whether it's currently indexed
# + errorMessage - Why the latest attempt failed, when known
type IndexStatusResponse record {|
    boolean indexed;
    string? errorMessage;
|};

# Records or clears a content item's indexing failure based on its status.
#
# + contentId - The content to check
# + return - False if the Smart Search service could not be reached
isolated function reconcileIndexStatus(int contentId) returns boolean {
    IndexStatusResponse|http:ClientError status =
        smartSearchServiceClient->get(string `/documents/${contentId}/status`);
    if status is http:ClientError {
        return false;
    }

    string? errorMessage = status.errorMessage;
    if errorMessage is string {
        error? updateError = database:setSmartSearchIndexFailure(contentId, errorMessage);
        if updateError is error {
            log:printWarn("Smart Search: could not record an index failure", updateError, contentId = contentId);
        }
    } else if status.indexed {
        error? clearError = database:clearSmartSearchIndexFailure(contentId);
        if clearError is error {
            log:printWarn("Smart Search: could not clear a resolved index failure", clearError,
                    contentId = contentId);
        }
    }
    return true;
}

# Re-checks known and recent failures and returns the content that failed to index.
#
# + return - The list, or an error
public isolated function listUnindexedContent() returns database:SmartSearchIndexFailure[]|error {
    database:SmartSearchIndexFailure[] knownFailures = check database:getSmartSearchIndexFailures();
    boolean reachable = true;
    foreach database:SmartSearchIndexFailure failure in knownFailures {
        // Old version is still indexed, so a status check would wrongly clear this marker
        if failure.errorMessage == constants:SMART_SEARCH_DEFERRED_REINDEX {
            continue;
        }
        reachable = reconcileIndexStatus(failure.contentId);
        if !reachable {
            break;
        }
    }

    if reachable {
        database:UncheckedIndexCandidate[] candidates =
            check database:getUncheckedIndexCandidates(RECHECK_WINDOW_HOURS);
        foreach database:UncheckedIndexCandidate candidate in candidates {
            string? link = indexingLinkFor(candidate.contentType, candidate.contentSubtype, candidate.contentLink,
                    candidate.transcriptLink);
            if link is string && isContentLinkIndexable(candidate.contentType, candidate.contentSubtype, link)
                    && !reconcileIndexStatus(candidate.contentId) {
                break;
            }
        }
    }

    return database:getSmartSearchIndexFailures();
}

class IndexReconciliationJob {
    *task:Job;

    public function execute() {
        database:SmartSearchIndexFailure[]|error result = listUnindexedContent();
        if result is error {
            log:printWarn("Smart Search: periodic index reconciliation failed", result);
        }
    }
}

function init() {
    // A scheduling failure must not stop the backend from starting
    task:JobId|task:Error scheduled =
        task:scheduleJobRecurByFrequency(new IndexReconciliationJob(), RECONCILE_INTERVAL_SECONDS);
    if scheduled is task:Error {
        log:printError("Smart Search: could not schedule the periodic index reconciliation job", scheduled);
    }
}
