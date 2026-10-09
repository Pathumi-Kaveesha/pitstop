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
import ballerina/lang.runtime;
import ballerina/log;
import ballerina/task;
import ballerina/time;
import ballerina/url;

public isolated function isSmartSearchEnabled() returns boolean => smartSearchEnabled;

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
    http:Client serviceClient = check getSearchClient();
    return serviceClient->get(string `/search?userQuery=${encodedQuery}&includeAnswer=${includeAnswer}`);
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
    return isIngestAllowedForEmail(userEmail);
}

# Same as isIngestAllowed, but for a background job that has no live request context.
#
# + userEmail - The admin whose quota to count against
# + return - False once the caller has used up this minute's indexing requests
isolated function isIngestAllowedForEmail(string userEmail) returns boolean {
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

    }

    // Only a retry that's actually allowed uses up a shared indexing slot
    if !isIngestAllowed(ctx) {
        return false;
    }

    lock {
        [int, int]? contentWindow = retryState[contentKey];
        [int, int]? userWindow = retryState[userKey];
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
    http:Client serviceClient = check getSearchClient();
    http:Response upstream = check serviceClient->get(string `/documents/${contentId}/file`);
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

# Records why a content item's link can't be indexed, so an admin sees a reason instead of silence.
#
# + contentId - The content whose link isn't indexable
# + contentType - Its content type
# + contentSubtype - Its content subtype, when set
public isolated function recordUnindexableLink(int contentId, string contentType, string? contentSubtype) {
    recordIndexFailure(contentId, unindexableLinkReason(contentType, contentSubtype));
}

# Indexes a content item. Launched with `start` so the caller never waits on it.
#
# + contentId - The content's own id, reused as Smart Search's documentId
# + driveLink - The link to read text from
# + title - The content's title
# + displayLink - Set only when driveLink is a transcript, not the content's own link
# + requestedBy - Email of the admin whose action triggered this, for the logs
public isolated function indexContentForSmartSearch(int contentId, string driveLink, string title,
        string? displayLink = (), string? requestedBy = ()) {
    DriveLinkIngestRequest payload = {
        driveLink,
        title,
        contentId: contentId.toString(),
        displayLink,
        adminEmail: requestedBy
    };

    http:Client|error ingestClient = getIngestClient();
    if ingestClient is error {
        // Never actually submitted - a reserved backfill slot shouldn't wait out its TTL for this.
        releaseBackfillReservation(contentId);
        return;
    }
    http:Response|http:ClientError response = ingestClient->post("/ingest-drive-link", payload);
    if response is http:ClientError {
        log:printWarn(string `Smart Search: could not reach the indexing service for content ${contentId}`,
                reason = response.message());
        releaseBackfillReservation(contentId);
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
    releaseBackfillReservation(contentId);
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
    error? clearIndexedAtError = database:clearSmartSearchIndexedAt(contentId);
    if clearIndexedAtError is error {
        log:printWarn("Smart Search: could not clear a deleted content's confirmed-indexed marker",
                clearIndexedAtError, contentId = contentId);
    }

    _ = clearIndexedEntries(contentId, deletedBy);
    releaseBackfillReservation(contentId);
}

# Removes a content's entries from the search index.
#
# + contentId - The content whose entries to remove
# + deletedBy - Email of the admin who deleted the content, when this is a real deletion
# + return - False if the entries could not be removed
isolated function clearIndexedEntries(int contentId, string? deletedBy = ()) returns boolean {
    map<string|string[]> headers = {};
    if deletedBy is string {
        headers["X-Admin-Email"] = deletedBy;
    }
    http:Client|error serviceClient = getSearchClient();
    if serviceClient is error {
        return false;
    }
    http:Response|http:ClientError response =
        serviceClient->delete(string `/documents/${contentId}`, headers = headers);
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
# + requestedBy - Email of the admin who made the edit, for the logs
public isolated function reindexAfterLinkChange(int contentId, string? newLink, string? requestedBy = ()) {
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

        // An old failure, or a confirmed index, both belong to the old link
        error? clearError = database:clearSmartSearchIndexFailure(contentId);
        if clearError is error {
            log:printWarn("Smart Search: could not clear index failure after a link change", clearError,
                    contentId = contentId);
        }
        error? clearIndexedAtError = database:clearSmartSearchIndexedAt(contentId);
        if clearIndexedAtError is error {
            log:printWarn("Smart Search: could not clear confirmed-indexed marker after a link change",
                    clearIndexedAtError, contentId = contentId);
        }

        // Clear the old version first, so a failed re-index never leaves stale results
        if !clearIndexedEntries(contentId) {
            recordIndexFailure(contentId, "Could not remove the previous version. Please retry.");
            return;
        }

        if newLink is string && isContentLinkIndexable(current.contentType, current.contentSubtype, newLink) {
            indexContentForSmartSearch(contentId, newLink, current.description,
                    displayLinkFor(current.contentType, current.contentSubtype, current.contentLink), requestedBy);
        } else if newLink is string && newLink != "" {
            // Whether or not the previous link was indexable - the admin should see a reason either way.
            recordIndexFailure(contentId, unindexableLinkReason(current.contentType, current.contentSubtype));
        }
    }
}

# Re-triggers indexing for a content item.
#
# + contentId - The content to retry
# + requestedBy - Email of the admin who retried it, for the logs
# + return - Not-found when there's no such content, an error, or nil on success
public isolated function retryIndexContent(int contentId, string? requestedBy = ()) returns http:NotFound|error? {
    lock {
        reindexRuns += 1;

        database:IndexingInfo? info = check database:getIndexingInfo(contentId);
        if info is () {
            return http:NOT_FOUND;
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
        error? clearError = database:clearSmartSearchIndexFailure(contentId);
        if clearError is error {
            log:printWarn("Smart Search: could not clear index failure before a retry", clearError, contentId = contentId);
        }
        error? clearIndexedAtError = database:clearSmartSearchIndexedAt(contentId);
        if clearIndexedAtError is error {
            log:printWarn("Smart Search: could not clear confirmed-indexed marker before a retry",
                    clearIndexedAtError, contentId = contentId);
        }
        indexContentForSmartSearch(contentId, link, info.description,
                displayLinkFor(info.contentType, info.contentSubtype, info.contentLink), requestedBy);
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

// content_id -> when it was reserved for an in-flight backfill submission, released once indexed or failed.
isolated map<int> backfillReservations = {};

# Whether content is currently reserved by an in-flight backfill submission.
#
# + contentId - The content to check
# + return - True if still reserved and the reservation hasn't expired
isolated function isReservedForBackfill(int contentId) returns boolean {
    lock {
        int? reservedAt = backfillReservations[contentId.toString()];
        if reservedAt is () {
            return false;
        }
        if time:utcNow()[0] - reservedAt >= BACKFILL_RESERVATION_TTL_SECONDS {
            // Expired - a crashed job shouldn't block this content from being offered again forever.
            _ = backfillReservations.remove(contentId.toString());
            return false;
        }
        return true;
    }
}

# Reserves content for an in-flight backfill submission, unless already reserved.
#
# + contentId - The content to reserve
# + return - False if it was already reserved (and not expired) - nothing changed
isolated function reserveForBackfill(int contentId) returns boolean {
    lock {
        int? reservedAt = backfillReservations[contentId.toString()];
        if reservedAt is int && time:utcNow()[0] - reservedAt < BACKFILL_RESERVATION_TTL_SECONDS {
            return false;
        }
        backfillReservations[contentId.toString()] = time:utcNow()[0];
        return true;
    }
}

# Releases a content's backfill reservation. A no-op if it was never reserved.
#
# + contentId - The content whose reservation to release
isolated function releaseBackfillReservation(int contentId) {
    lock {
        _ = backfillReservations.removeIfHasKey(contentId.toString());
    }
}

# Records or clears a content item's indexing failure based on its status.
#
# + contentId - The content to check
# + return - False if the Smart Search service could not be reached
isolated function reconcileIndexStatus(int contentId) returns boolean {
    // Shares reindexRuns with reindexAfterLinkChange/retryIndexContent, so a status read from
    // before an edit can never be written after that edit's own clear-and-reindex has finished.
    lock {
        reindexRuns += 1;

        http:Client|error serviceClient = getSearchClient();
        if serviceClient is error {
            return false;
        }
        IndexStatusResponse|http:ClientError status = serviceClient->get(string `/documents/${contentId}/status`);
        if status is http:ClientError {
            return false;
        }

        string? errorMessage = status.errorMessage;
        if errorMessage is string {
            error? updateError = database:setSmartSearchIndexFailure(contentId, errorMessage);
            if updateError is error {
                log:printWarn("Smart Search: could not record an index failure", updateError, contentId = contentId);
            }
            releaseBackfillReservation(contentId);
        } else if status.indexed {
            error? clearError = database:clearSmartSearchIndexFailure(contentId);
            if clearError is error {
                log:printWarn("Smart Search: could not clear a resolved index failure", clearError,
                        contentId = contentId);
            }
            error? updateError = database:setSmartSearchIndexedAt(contentId);
            if updateError is error {
                log:printWarn("Smart Search: could not record a confirmed index", updateError, contentId = contentId);
            }
            releaseBackfillReservation(contentId);
        }
        return true;
    }
}

# Whether a content item has never been indexed and never failed - a genuine backfill candidate.
#
# + contentId - The content to check
# + return - True only when nothing has been attempted for it yet, or an error if Smart Search couldn't be reached
isolated function isPendingSmartSearchIndex(int contentId) returns boolean|error {
    // Shares reindexRuns with reindexAfterLinkChange/retryIndexContent - see reconcileIndexStatus.
    lock {
        reindexRuns += 1;

        http:Client serviceClient = check getSearchClient();
        IndexStatusResponse status = check serviceClient->get(string `/documents/${contentId}/status`);
        if status.indexed {
            // Learned just now - remembered from here on, so future searches skip the live check.
            error? updateError = database:setSmartSearchIndexedAt(contentId);
            if updateError is error {
                log:printWarn("Smart Search: could not record a confirmed index", updateError, contentId = contentId);
            }
            releaseBackfillReservation(contentId);
            return false;
        }
        string? errorMessage = status.errorMessage;
        if errorMessage is string {
            // Known to Smart Search but not yet to Pitstop's own failure list - sync it now.
            error? updateError = database:setSmartSearchIndexFailure(contentId, errorMessage);
            if updateError is error {
                log:printWarn("Smart Search: could not record an index failure", updateError, contentId = contentId);
            }
            releaseBackfillReservation(contentId);
            return false;
        }
        return true;
    }
}

# Finds content that hasn't been indexed or flagged as failed yet, for an admin-run backfill.
#
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + count - How many pending items to return
# + return - Up to `count` pending content items plus whether the scan was incomplete, or an error
public isolated function findBackfillCandidates(string? contentType, string? contentSubtype, int count)
        returns BackfillCandidatesResult|error {
    int effectiveCount = count;
    if effectiveCount < 1 {
        effectiveCount = 1;
    } else if effectiveCount > MAX_BACKFILL_BATCH_SIZE {
        effectiveCount = MAX_BACKFILL_BATCH_SIZE;
    }
    database:IndexingInfo[] pending = [];
    int afterContentId = 0;
    int pageSize = effectiveCount * 5;
    int statusChecks = 0;
    // True only once a page proves there's nothing left to check - a safety cap exiting early leaves this false.
    boolean exhausted = false;
    // Pages forward instead of stopping at the first window, or a long already-indexed run could hide real candidates.
    foreach int _ in 0 ..< MAX_BACKFILL_SCAN_PAGES {
        database:IndexingInfo[] candidates =
            check database:getSmartSearchBackfillCandidates(contentType, contentSubtype, afterContentId, pageSize);
        if candidates.length() == 0 {
            exhausted = true;
            break;
        }

        boolean stoppedEarly = false;
        foreach database:IndexingInfo candidate in candidates {
            afterContentId = candidate.contentId;
            if pending.length() >= effectiveCount || statusChecks >= MAX_BACKFILL_STATUS_CHECKS {
                stoppedEarly = true;
                break;
            }
            string? link = indexingLinkFor(candidate.contentType, candidate.contentSubtype, candidate.contentLink,
                    candidate.transcriptLink);
            if link is () || link == "" {
                recordIndexFailure(candidate.contentId, "A Google Doc link is required for this content type");
                continue;
            }
            // Still being indexed from an earlier batch - don't offer it again.
            if isReservedForBackfill(candidate.contentId) {
                continue;
            }
            statusChecks += 1;
            if check isPendingSmartSearchIndex(candidate.contentId) {
                pending.push(candidate);
            }
        }

        if !stoppedEarly && candidates.length() < pageSize {
            exhausted = true;
            break;
        }
        if pending.length() >= effectiveCount || statusChecks >= MAX_BACKFILL_STATUS_CHECKS {
            break;
        }
    }
    return {candidates: pending, scanIncomplete: !exhausted};
}

# Indexes a chosen batch of content for an admin-run backfill.
#
# + ctx - Request context, for the caller's save limit
# + contentIds - The content items to index
# + requestedBy - Email of the admin who triggered this, for the logs
# + return - A summary of what happened to each item
public isolated function runBackfillBatch(http:RequestContext ctx, int[] contentIds, string? requestedBy)
        returns BackfillResult {
    string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
    return runBackfillBatchForEmail(userEmail is string ? userEmail : (), contentIds, requestedBy);
}

# Same as runBackfillBatch, but for a background job that has no live request context.
#
# + userEmail - The admin whose save-limit quota to count against, when known
# + contentIds - The content items to index
# + requestedBy - Email of the admin who triggered this, for the logs
# + recordDeferralFailure - False to leave a rate-limited item pending instead of marking it
#                            failed - for a background run that will just retry it itself later
# + return - A summary of what happened to each item
isolated function runBackfillBatchForEmail(string? userEmail, int[] contentIds, string? requestedBy,
        boolean recordDeferralFailure = true) returns BackfillResult {
    int[] boundedIds = contentIds.length() > MAX_BACKFILL_BATCH_SIZE
        ? contentIds.slice(0, MAX_BACKFILL_BATCH_SIZE)
        : contentIds;
    int submitted = 0;
    int deferred = 0;
    int notIndexableCount = 0;
    foreach int contentId in boundedIds {
        if !reserveForBackfill(contentId) {
            // Already in flight from an earlier submission - skip, don't start a duplicate job.
            continue;
        }
        database:IndexingInfo?|error info = database:getIndexingInfo(contentId);
        if info is error || info is () {
            releaseBackfillReservation(contentId);
            continue;
        }
        string? link = indexingLinkFor(info.contentType, info.contentSubtype, info.contentLink, info.transcriptLink);
        if link is () || link == "" {
            recordIndexFailure(contentId, "A Google Doc link is required for this content type");
            releaseBackfillReservation(contentId);
            continue;
        }
        if !isContentLinkIndexable(info.contentType, info.contentSubtype, link) {
            recordUnindexableLink(contentId, info.contentType, info.contentSubtype);
            notIndexableCount += 1;
            releaseBackfillReservation(contentId);
            continue;
        }
        if userEmail is () || !isIngestAllowedForEmail(userEmail) {
            if recordDeferralFailure {
                deferReindex(contentId);
            }
            deferred += 1;
            releaseBackfillReservation(contentId);
            continue;
        }
        _ = start indexContentForSmartSearch(contentId, link, info.description,
                displayLinkFor(info.contentType, info.contentSubtype, info.contentLink), requestedBy);
        submitted += 1;
    }
    return {submitted, deferred, notIndexable: notIndexableCount};
}

// True while one "index everything" run is active - only one at a time, admin tool, kept simple.
isolated boolean bulkIndexRunning = false;

# Whether an "index everything" run is currently active.
#
# + return - True if one is running
public isolated function isBulkIndexRunning() returns boolean {
    lock {
        return bulkIndexRunning;
    }
}

# Claims the bulk-index run, unless one is already active.
#
# + return - False if one was already running - nothing changed
isolated function tryStartBulkIndexRun() returns boolean {
    lock {
        if bulkIndexRunning {
            return false;
        }
        bulkIndexRunning = true;
        return true;
    }
}

isolated function clearBulkIndexRun() {
    lock {
        bulkIndexRunning = false;
    }
}

# Where one content item stands, combining its DB record with any live backfill reservation.
#
# + row - The content's raw status from the database
# + return - Its current backfill status
isolated function classifyBackfillStatus(database:ContentIndexStatus row) returns BackfillStatus {
    if row.indexedFlag is string {
        return "indexed";
    }
    if row.failureReason is string {
        return "failed";
    }
    if isReservedForBackfill(row.contentId) {
        return "in_progress";
    }
    return "not_started";
}

# Content ids currently reserved for an in-flight backfill submission, expired ones excluded.
#
# + return - The reserved content ids, in no particular order
isolated function backfillReservationContentIds() returns int[] {
    lock {
        int now = time:utcNow()[0];
        int[] ids = [];
        foreach string key in backfillReservations.keys() {
            if now - backfillReservations.get(key) < BACKFILL_RESERVATION_TTL_SECONDS {
                int|error contentId = int:fromString(key);
                if contentId is int {
                    ids.push(contentId);
                }
            }
        }
        return ids.clone();
    }
}

# The "in progress" status page - served straight from the live reservation set rather than the
# database, since that's the only authoritative source for it and it's normally small.
#
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + page - Which page to return (1-based)
# + count - How many items per page
# + return - A page of results, or an error
isolated function getInProgressStatusPage(string? contentType, string? contentSubtype, int page, int count)
        returns BackfillStatusResult|error {
    BackfillStatusItem[] matching = [];
    foreach int contentId in backfillReservationContentIds() {
        database:IndexingInfo?|error info = database:getIndexingInfo(contentId);
        if info is error || info is () {
            continue;
        }
        if (contentType is string && info.contentType != contentType)
                || (contentSubtype is string && info.contentSubtype != contentSubtype) {
            continue;
        }
        matching.push({
            contentId: info.contentId,
            description: info.description,
            contentType: info.contentType,
            contentSubtype: info.contentSubtype,
            contentLink: info.contentLink,
            status: "in_progress",
            failureReason: ()
        });
    }

    int totalCount = matching.length();
    int totalPages = totalCount == 0 ? 1 : ((totalCount - 1) / count) + 1;
    int effectivePage = page > totalPages ? totalPages : page;
    int startIndex = (effectivePage - 1) * count;
    BackfillStatusItem[] pageItems = startIndex < matching.length()
        ? matching.slice(startIndex, int:min(startIndex + count, matching.length()))
        : [];
    return {
        items: pageItems,
        page: effectivePage,
        totalPages,
        totalCount,
        countIsApproximate: false,
        running: isBulkIndexRunning()
    };
}

# Lists content with its indexing status, for the admin bulk-index status page.
#
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + statusFilter - Only include items in this status, when set
# + page - Which page to return (1-based)
# + count - How many items per page
# + return - A page of results, or an error
public isolated function getBackfillStatusList(string? contentType, string? contentSubtype,
        BackfillStatus? statusFilter, int page, int count) returns BackfillStatusResult|error {
    int effectiveCount = count;
    if effectiveCount < 1 {
        effectiveCount = 1;
    } else if effectiveCount > MAX_STATUS_LIST_COUNT {
        effectiveCount = MAX_STATUS_LIST_COUNT;
    }
    int requestedPage = page < 1 ? 1 : page;

    // "in progress" only exists live, in memory - the database has no notion of it at all.
    if statusFilter == "in_progress" {
        return getInProgressStatusPage(contentType, contentSubtype, requestedPage, effectiveCount);
    }

    // "not started" is approximate - it shares its DB bucket with "in progress", which SQL can't tell apart.
    string bucket = statusFilter == "indexed" ? "indexed"
        : statusFilter == "failed" ? "failed"
        : statusFilter == "not_started" ? "pending"
        : "all";
    int totalCount = check database:getSmartSearchContentStatusCount(contentType, contentSubtype, bucket);
    int totalPages = totalCount == 0 ? 1 : ((totalCount - 1) / effectiveCount) + 1;
    int effectivePage = requestedPage > totalPages ? totalPages : requestedPage;
    int offsetRows = (effectivePage - 1) * effectiveCount;

    database:ContentIndexStatus[] rows = check database:getSmartSearchContentStatus(contentType, contentSubtype,
            bucket, offsetRows, effectiveCount);
    BackfillStatusItem[] items = [];
    foreach database:ContentIndexStatus row in rows {
        BackfillStatus status = classifyBackfillStatus(row);
        // The "pending" bucket mixes in whatever's reserved - filter those back out here.
        if statusFilter == "not_started" && status != "not_started" {
            continue;
        }
        items.push({
            contentId: row.contentId,
            description: row.description,
            contentType: row.contentType,
            contentSubtype: row.contentSubtype,
            contentLink: row.contentLink,
            status,
            failureReason: row.failureReason
        });
    }

    return {
        items,
        page: effectivePage,
        totalPages,
        totalCount,
        countIsApproximate: statusFilter == "not_started",
        running: isBulkIndexRunning()
    };
}

# Works through everything matching the filters in automatic batches, pacing itself against the
# admin's own save limit. Launched with `start`, so the triggering request never waits on it.
# Trapped so a panic anywhere in the loop can't leave bulkIndexRunning stuck true forever.
#
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + maxCount - Stop once this many have been submitted, when set - unlimited otherwise
# + requestedBy - Email of the admin who started this run
isolated function runBulkIndexInBackground(string? contentType, string? contentSubtype, int? maxCount,
        string? requestedBy) {
    error? result = trap runBulkIndexLoop(contentType, contentSubtype, maxCount, requestedBy);
    if result is error {
        log:printError("Smart Search: bulk index run failed unexpectedly", result);
    }
    clearBulkIndexRun();
}

isolated function runBulkIndexLoop(string? contentType, string? contentSubtype, int? maxCount,
        string? requestedBy) {
    int totalSubmitted = 0;
    int emptyIncompleteScans = 0;
    foreach int _ in 0 ..< MAX_BULK_INDEX_ITERATIONS {
        int batchSize = MAX_BACKFILL_BATCH_SIZE;
        if maxCount is int {
            int remaining = maxCount - totalSubmitted;
            if remaining <= 0 {
                break;
            }
            batchSize = remaining < MAX_BACKFILL_BATCH_SIZE ? remaining : MAX_BACKFILL_BATCH_SIZE;
        }
        BackfillCandidatesResult|error candidatesResult = findBackfillCandidates(contentType, contentSubtype,
                batchSize);
        if candidatesResult is error {
            log:printWarn("Smart Search: bulk index scan failed, stopping this run", candidatesResult);
            break;
        }
        database:IndexingInfo[] candidates = candidatesResult.candidates;
        if candidates.length() > 0 {
            emptyIncompleteScans = 0;
            int[] contentIds = from database:IndexingInfo candidate in candidates select candidate.contentId;
            BackfillResult batchResult = runBackfillBatchForEmail(requestedBy, contentIds, requestedBy, false);
            totalSubmitted += batchResult.submitted;
        } else if !candidatesResult.scanIncomplete {
            // A genuinely empty scan - nothing left matching these filters.
            break;
        } else {
            emptyIncompleteScans += 1;
            if emptyIncompleteScans >= 3 {
                log:printWarn("Smart Search: bulk index scan made no progress for 3 scans in a row, stopping this run");
                break;
            }
        }
        runtime:sleep(BULK_INDEX_BATCH_INTERVAL_SECONDS);
    }
}

# Starts an "index everything" run for the given filters, unless one is already active.
#
# + ctx - Request context, for the admin's identity
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + maxCount - Stop once this many have been submitted, when set - unlimited otherwise
# + return - Whether a run actually started - false if one was already active
public isolated function startBulkIndex(http:RequestContext ctx, string? contentType, string? contentSubtype,
        int? maxCount) returns BulkIndexStartResult {
    if !tryStartBulkIndexRun() {
        return {started: false};
    }
    string|error requestedBy = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
    _ = start runBulkIndexInBackground(contentType, contentSubtype, maxCount, requestedBy is string ? requestedBy : ());
    return {started: true};
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

# Actively re-checks every currently-reserved content item, so one that's actually finished gets
# recognized (and its reservation released) promptly, rather than only once its TTL expires.
isolated function reconcileReservedContent() {
    foreach int contentId in backfillReservationContentIds() {
        if !reconcileIndexStatus(contentId) {
            // Service unreachable right now - the rest would fail the same way, try again next run.
            break;
        }
    }
}

class ReservationReconciliationJob {
    *task:Job;

    public function execute() {
        reconcileReservedContent();
    }
}

function init() {
    if !smartSearchEnabled {
        return;
    }
    // A scheduling failure must not stop the backend from starting
    task:JobId|task:Error scheduled =
        task:scheduleJobRecurByFrequency(new IndexReconciliationJob(), RECONCILE_INTERVAL_SECONDS);
    if scheduled is task:Error {
        log:printError("Smart Search: could not schedule the periodic index reconciliation job", scheduled);
    }
    task:JobId|task:Error reservationScheduled = task:scheduleJobRecurByFrequency(
            new ReservationReconciliationJob(), RESERVATION_RECONCILE_INTERVAL_SECONDS);
    if reservationScheduled is task:Error {
        log:printError("Smart Search: could not schedule the reservation reconciliation job", reservationScheduled);
    }
}
