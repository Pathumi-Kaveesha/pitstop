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
import ballerina/lang.regexp;
import ballerina/lang.runtime;
import ballerina/log;
import ballerina/task;
import ballerina/time;
import ballerina/url;

public isolated function isSmartSearchEnabled() returns boolean => smartSearchEnabled;

# The caller's login token for this request, to forward to the Smart Search service.
#
# + ctx - Request context
# + return - The token, or nil when the request has none
public isolated function userJwtOf(http:RequestContext ctx) returns string? {
    string|error userJwt = ctx.getWithType(authorization:REQUESTED_BY_USER_JWT);
    return userJwt is string ? userJwt : ();
}

# Headers that carry the caller's login token to the Smart Search service, when there is one.
#
# + userJwt - The caller's login token
# + return - The headers to send
isolated function userJwtHeaders(string? userJwt) returns map<string|string[]> {
    map<string|string[]> headers = {};
    if userJwt is string {
        headers[USER_JWT_HEADER] = userJwt;
    }
    return headers;
}

# Runs a search against the Smart Search service.
#
# + userQuery - What the user typed into the search box
# + includeAnswer - False returns just the sources, without waiting for the generated answer
# + userJwt - The caller's login token, forwarded so the service can check it
# + return - A generated answer plus its sources, or an error
public isolated function searchDocuments(string userQuery, boolean includeAnswer, string? userJwt = ())
    returns SmartSearchResponse|error {

    // Explicit encoding - a query can contain a comma, which Ballerina's
    // query-parameter parser otherwise treats as a list separator.
    string encodedQuery = check url:encode(userQuery, "UTF-8");
    http:Client serviceClient = check getSearchClient();
    return serviceClient->get(string `/search?userQuery=${encodedQuery}&includeAnswer=${includeAnswer}`,
            userJwtHeaders(userJwt));
}

// User email -> [window start in seconds, search calls in that window]
isolated map<[int, int]> searchWindows = {};

# Counts one search call for the caller and says whether they are still within the limit.
#
# + ctx - Request object
# + return - False once the caller has used up this minute's searches
public isolated function isSearchAllowed(http:RequestContext ctx) returns boolean {
    string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
    if userEmail is error || userEmail.trim() == "" {
        return false;
    }
    int now = time:utcNow()[0];

    lock {
        if searchWindows.length() > MAX_TRACKED_SEARCH_USERS {
            foreach string email in searchWindows.keys() {
                if now - searchWindows.get(email)[0] >= SEARCH_WINDOW_SECONDS {
                    _ = searchWindows.remove(email);
                }
            }
        }

        [int, int]? window = searchWindows[userEmail];
        if window is () || now - window[0] >= SEARCH_WINDOW_SECONDS {
            searchWindows[userEmail] = [now, 1];
            return true;
        }
        if window[1] >= MAX_SEARCHES_PER_MINUTE {
            return false;
        }
        searchWindows[userEmail] = [window[0], window[1] + 1];
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
    // No subtype is shown as Generic in Pitstop, so it follows the same rule: a webpage only.
    if contentType == "external" && (contentSubtype == "generic" || isSubtypeBlank(contentSubtype)) {
        return isWebPageLink(link);
    }
    return isIndexableLink(link);
}

# Whether a content has no subtype set - older content, which Pitstop treats as Generic.
#
# + contentSubtype - Subtype of the content, when set
# + return - True when it is missing or empty
isolated function isSubtypeBlank(string? contentSubtype) returns boolean {
    return contentSubtype is () || contentSubtype.trim() == "";
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
            SmartSearchResult cleaned = searchResult.clone();
            cleaned.content = stripControlCharacters(searchResult.content);
            cleaned.title = stripControlCharacters(searchResult.title);
            authorizedSources.push(cleaned);
        }
    }

    string? answerText = response.answer;
    return {
        answer: authorizedSources.length() == response.sources.length()
                ? (answerText is string ? stripControlCharacters(answerText) : ())
                : (),
        sources: authorizedSources,
        contents: from types:ContentResponse content in matched
            select cleanContent(content)
    };
}

const string SERVICE_UNREACHABLE_REASON = "Smart Search could not be reached. Please retry.";

# Removes the control characters a JSON string can't carry raw. A PowerPoint soft line break is one, and a single
# one left in made the browser reject the whole search response and show "No results found".
#
# + text - Text taken from an indexed document
# + return - The text without those characters, keeping newlines, tabs and carriage returns
isolated function stripControlCharacters(string text) returns string {
    return regexp:replaceAll(re `[\u{00}-\u{08}\u{0B}\u{0C}\u{0E}-\u{1F}]`, text, "");
}

# Removes those characters from every text value inside a JSON value, however deeply nested.
#
# + value - The JSON value to clean
# + return - The same value with its text cleaned
isolated function stripControlCharactersInJson(json value) returns json {
    if value is string {
        return stripControlCharacters(value);
    }
    if value is json[] {
        json[] cleaned = [];
        foreach json item in value {
            cleaned.push(stripControlCharactersInJson(item));
        }
        return cleaned;
    }
    if value is map<json> {
        map<json> cleaned = {};
        foreach [string, json] [key, item] in value.entries() {
            cleaned[key] = stripControlCharactersInJson(item);
        }
        return cleaned;
    }
    return value;
}

# A content card with the control characters removed from all of its text - its title, note, tags and rich text.
#
# + content - The content card as stored
# + return - The cleaned card, or the original one if it couldn't be rebuilt
isolated function cleanContent(types:ContentResponse content) returns types:ContentResponse {
    types:ContentResponse|error cleaned = stripControlCharactersInJson(content.toJson()).fromJsonWithType();
    return cleaned is types:ContentResponse ? cleaned : content;
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
# + link - The link that was rejected
public isolated function recordUnindexableLink(int contentId, string contentType, string? contentSubtype,
        string link) {
    recordIndexFailure(contentId, unindexableLinkReason(contentType, contentSubtype, link));
}

# Indexes a content item. Launched with `start` so the caller never waits on it.
#
# + contentId - The content's own id, reused as Smart Search's documentId
# + driveLink - The link to read text from
# + title - The content's title
# + displayLink - Set only when driveLink is a transcript, not the content's own link
# + requestedBy - Email of the admin whose action triggered this, for the logs
# + recordUnreachable - Save a failure when the request can't be sent, so a retry never leaves the item with no reason
# + userJwt - The admin's login token, forwarded so the service can check it
public isolated function indexContentForSmartSearch(int contentId, string driveLink, string title,
        string? displayLink = (), string? requestedBy = (), boolean recordUnreachable = false,
        string? userJwt = ()) {
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
        if recordUnreachable {
            recordIndexFailure(contentId, SERVICE_UNREACHABLE_REASON);
        }
        return;
    }
    http:Response|http:ClientError response = ingestClient->post("/ingest-drive-link", payload, userJwtHeaders(userJwt));
    if response is http:ClientError {
        log:printWarn(string `Smart Search: could not reach the indexing service for content ${contentId}`,
                reason = response.message());
        releaseBackfillReservation(contentId);
        if recordUnreachable {
            recordIndexFailure(contentId, SERVICE_UNREACHABLE_REASON);
        }
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
# + userJwt - The admin's login token, forwarded so the service can check it
public isolated function deleteContentFromSmartSearch(int contentId, string deletedBy, string? userJwt = ()) {
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

    foreach int attempt in 1 ... DELETE_INDEX_MAX_ATTEMPTS {
        if clearIndexedEntries(contentId, deletedBy, userJwt) {
            break;
        }
        if attempt == DELETE_INDEX_MAX_ATTEMPTS {
            log:printWarn("Smart Search: gave up removing a deleted content from the index - the next orphan sweep will",
                    contentId = contentId, deletedBy = deletedBy);
        } else {
            runtime:sleep(DELETE_INDEX_RETRY_DELAY_SECONDS);
        }
    }
    releaseBackfillReservation(contentId);
}

# Removes a content's entries from the search index.
#
# + contentId - The content whose entries to remove
# + deletedBy - Email of the admin who deleted the content, when this is a real deletion
# + userJwt - The admin's login token, forwarded so the service can check it
# + return - False if the entries could not be removed
isolated function clearIndexedEntries(int contentId, string? deletedBy = (), string? userJwt = ()) returns boolean {
    map<string|string[]> headers = userJwtHeaders(userJwt);
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
# + link - The link that was rejected
# + return - A user-facing reason
isolated function unindexableLinkReason(string contentType, string? contentSubtype, string link) returns string {
    if contentType == "external" && (contentSubtype == "generic" || isSubtypeBlank(contentSubtype)) {
        // A Drive link here was never fetched - generic external links are only ever read as webpages.
        if isIndexableLink(link) {
            return "This looks like a Google Drive link, but this content is set to \"Generic\" - "
                + "change its subtype to Google Doc to index it.";
        }
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
# + userJwt - The admin's login token, forwarded so the service can check it
public isolated function reindexAfterLinkChange(int contentId, string? newLink, string? requestedBy = (),
        string? userJwt = ()) {
    if reindexAfterLinkChangeLocked(contentId, newLink, requestedBy, userJwt) {
        // Confirm the outcome directly, same as a retry - `start` can't run inside the lock below.
        _ = start confirmIndexOutcome(contentId, userJwt);
    }
}

# The lock-protected part of reindexAfterLinkChange - split out since `start` can't run inside a lock.
#
# + contentId - The content that was edited
# + newLink - What should be indexed after the edit, when known at the time
# + requestedBy - Email of the admin who made the edit, for the logs
# + userJwt - The admin's login token, forwarded so the service can check it
# + return - True if indexing was actually submitted
isolated function reindexAfterLinkChangeLocked(int contentId, string? newLink, string? requestedBy,
        string? userJwt) returns boolean {
    lock {
        reindexRuns += 1;

        database:IndexingInfo?|error current = database:getIndexingInfo(contentId);
        if current is error {
            log:printWarn("Smart Search: could not look up content after a link change", current, contentId = contentId);
            _ = clearIndexedEntries(contentId, userJwt = userJwt);
            recordIndexFailure(contentId, "Could not check this content after its link changed. Please retry.");
            return false;
        }
        if current is () {
            return false;
        }
        // A newer edit has its own job
        if indexingLinkFor(current.contentType, current.contentSubtype, current.contentLink,
                current.transcriptLink) != newLink {
            return false;
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
        if !clearIndexedEntries(contentId, userJwt = userJwt) {
            recordIndexFailure(contentId, "Could not remove the previous version. Please retry.");
            return false;
        }

        if newLink is string && isContentLinkIndexable(current.contentType, current.contentSubtype, newLink) {
            indexContentForSmartSearch(contentId, newLink, current.description,
                    displayLinkFor(current.contentType, current.contentSubtype, current.contentLink), requestedBy, false, userJwt);
            return true;
        } else if newLink is string && newLink != "" {
            // Whether or not the previous link was indexable - the admin should see a reason either way.
            recordIndexFailure(contentId, unindexableLinkReason(current.contentType, current.contentSubtype, newLink));
            return false;
        }
        return false;
    }
}

# Re-triggers indexing for a content item.
#
# + contentId - The content to retry
# + requestedBy - Email of the admin who retried it, for the logs
# + userJwt - The admin's login token, forwarded so the service can check it
# + return - Not-found when there's no such content, an error, or nil on success
public isolated function retryIndexContent(int contentId, string? requestedBy = (), string? userJwt = ())
        returns http:NotFound|error? {
    boolean|http:NotFound submitted = check retryIndexContentLocked(contentId, requestedBy, userJwt);
    if submitted is boolean && submitted {
        // Confirm the outcome directly, rather than relying on updated_on being bumped above.
        _ = start confirmIndexOutcome(contentId, userJwt);
        return;
    }
    if submitted is http:NotFound {
        return submitted;
    }
    return;
}

# The lock-protected part of retryIndexContent - split out since `start` can't run inside a lock.
#
# + contentId - The content to retry
# + requestedBy - Email of the admin who retried it, for the logs
# + userJwt - The admin's login token, forwarded so the service can check it
# + return - True if indexing was actually submitted, not-found when there's no such content, or an error
isolated function retryIndexContentLocked(int contentId, string? requestedBy, string? userJwt)
        returns boolean|http:NotFound|error {
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
            return false;
        }
        if !isContentLinkIndexable(info.contentType, info.contentSubtype, link) {
            recordIndexFailure(contentId, unindexableLinkReason(info.contentType, info.contentSubtype, link));
            return false;
        }
        if !clearIndexedEntries(contentId, userJwt = userJwt) {
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
        // Reserved so the status page lists it as in progress; released once indexed, failed, or not submitted.
        _ = reserveForBackfill(contentId);
        indexContentForSmartSearch(contentId, link, info.description,
                displayLinkFor(info.contentType, info.contentSubtype, info.contentLink), requestedBy, true, userJwt);
        return true;
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
# + userJwt - The admin's login token, forwarded so the service can check it; nil for scheduled jobs
# + return - False if the Smart Search service could not be reached
isolated function reconcileIndexStatus(int contentId, string? userJwt = ()) returns boolean {
    // Shares reindexRuns with reindexAfterLinkChange/retryIndexContent, so a status read from
    // before an edit can never be written after that edit's own clear-and-reindex has finished.
    lock {
        reindexRuns += 1;

        http:Client|error serviceClient = getSearchClient();
        if serviceClient is error {
            return false;
        }
        IndexStatusResponse|http:ClientError status =
            serviceClient->get(string `/documents/${contentId}/status`, userJwtHeaders(userJwt));
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

# Waits for a retry or edit to realistically finish indexing, then confirms its outcome.
#
# + contentId - The content that was just retried or edited
# + userJwt - The admin's login token, forwarded so the service can check it
isolated function confirmIndexOutcome(int contentId, string? userJwt = ()) {
    runtime:sleep(INDEX_CONFIRMATION_DELAY_SECONDS);
    _ = reconcileIndexStatus(contentId, userJwt);
}

# Whether a content item has never been indexed and never failed - a genuine backfill candidate.
#
# + contentId - The content to check
# + userJwt - The admin's login token, forwarded so the service can check it
# + return - True only when nothing has been attempted for it yet, or an error if Smart Search couldn't be reached
isolated function isPendingSmartSearchIndex(int contentId, string? userJwt = ()) returns boolean|error {
    // Shares reindexRuns with reindexAfterLinkChange/retryIndexContent - see reconcileIndexStatus.
    lock {
        reindexRuns += 1;

        http:Client serviceClient = check getSearchClient();
        IndexStatusResponse status =
            check serviceClient->get(string `/documents/${contentId}/status`, userJwtHeaders(userJwt));
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
# + userJwt - The admin's login token, forwarded so the service can check it; nil for a background run
# + return - Up to `count` pending content items plus whether the scan was incomplete, or an error
public isolated function findBackfillCandidates(string? contentType, string? contentSubtype, int count,
        string? userJwt = ()) returns BackfillCandidatesResult|error {
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
    // True once the scan has changed anything, even if nothing ended up in `pending` this time.
    boolean progressed = false;
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
                progressed = true;
                continue;
            }
            // Still being indexed from an earlier batch - don't offer it again.
            if isReservedForBackfill(candidate.contentId) {
                continue;
            }
            statusChecks += 1;
            // Either branch here changes something - adds a candidate, or reconciles a stale record.
            progressed = true;
            if check isPendingSmartSearchIndex(candidate.contentId, userJwt) {
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
    return {candidates: pending, scanIncomplete: !exhausted, progressed};
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
    return runBackfillBatchForEmail(userEmail is string ? userEmail : (), contentIds, requestedBy,
            userJwt = userJwtOf(ctx));
}

# Same as runBackfillBatch, but for a background job that has no live request context.
#
# + userEmail - The admin whose save-limit quota to count against, when known
# + contentIds - The content items to index
# + requestedBy - Email of the admin who triggered this, for the logs
# + recordDeferralFailure - False to leave a rate-limited item pending instead of marking it
#                            failed - for a background run that will just retry it itself later
# + userJwt - The admin's login token, forwarded so the service can check it; nil for a background run
# + return - A summary of what happened to each item
isolated function runBackfillBatchForEmail(string? userEmail, int[] contentIds, string? requestedBy,
        boolean recordDeferralFailure = true, string? userJwt = ()) returns BackfillResult {
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
            recordUnindexableLink(contentId, info.contentType, info.contentSubtype, link);
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
                displayLinkFor(info.contentType, info.contentSubtype, info.contentLink), requestedBy, false, userJwt);
        submitted += 1;
    }
    return {submitted, deferred, notIndexable: notIndexableCount};
}

// The active "index everything" run, if any - only one at a time, admin tool, kept simple.
isolated BulkRunScope? activeBulkRun = ();

# Whether an "index everything" run is currently active.
#
# + return - True if one is running
public isolated function isBulkIndexRunning() returns boolean {
    lock {
        return activeBulkRun is BulkRunScope;
    }
}

# Claims the bulk-index run, unless one is already active.
#
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + maxCount - Stop once this many have been submitted, when set - unlimited otherwise
# + retryFailed - Whether the run retries failed content, instead of indexing content never tried
# + return - False if one was already running - nothing changed
isolated function tryStartBulkIndexRun(string? contentType, string? contentSubtype, int? maxCount,
        boolean retryFailed) returns boolean {
    lock {
        if activeBulkRun is BulkRunScope {
            return false;
        }
        activeBulkRun = {contentType, contentSubtype, maxCount, submitted: 0, retryFailed};
        return true;
    }
}

# Ends the active bulk-index run, so a new one can start.
isolated function clearBulkIndexRun() {
    lock {
        activeBulkRun = ();
    }
}

# Adds to how many items the active run has sent so far.
#
# + count - How many items were just sent
isolated function addBulkRunSubmitted(int count) {
    lock {
        BulkRunScope? scope = activeBulkRun;
        if scope is BulkRunScope {
            scope.submitted += count;
        }
    }
}

# The active index run's scope.
#
# + return - The scope, or nothing when no run is active or it only retries failed items
isolated function currentBulkRunScope() returns BulkRunScope? {
    lock {
        BulkRunScope? scope = activeBulkRun;
        return scope is BulkRunScope && !scope.retryFailed ? scope.cloneReadOnly() : ();
    }
}

# How many more items a run may still send.
#
# + scope - The run
# + return - The count, or nothing when the run has no limit
isolated function bulkRunRemaining(BulkRunScope scope) returns int? {
    int? maxCount = scope.maxCount;
    return maxCount is int ? int:max(0, maxCount - scope.submitted) : ();
}

# Whether a content item falls under the filters of a run.
#
# + scope - The run
# + contentType - Type of the content
# + contentSubtype - Subtype of the content, when set
# + return - True if the run covers it
isolated function belongsToBulkRun(BulkRunScope scope, string contentType, string? contentSubtype) returns boolean {
    return (scope.contentType is () || scope.contentType == contentType)
        && (scope.contentSubtype is () || scope.contentSubtype == contentSubtype);
}

# Where one content item stands, combining its DB record with any live backfill reservation.
#
# + row - The content's raw status from the database
# + limitedQueuedIds - The items an index run with a limit will send next - leave out when the run has no limit
# + return - Its current backfill status
isolated function classifyBackfillStatus(database:ContentIndexStatus row, int[]? limitedQueuedIds = ())
        returns BackfillStatus {
    if row.indexedFlag is string {
        return "indexed";
    }
    if row.failureReason is string {
        return "failed";
    }
    if isReservedForBackfill(row.contentId) {
        return "in_progress";
    }
    BulkRunScope? scope = currentBulkRunScope();
    if scope is BulkRunScope && belongsToBulkRun(scope, row.contentType, row.contentSubtype) {
        // A run with a limit only queues the next few - the ones it will send before it reaches the limit.
        // Without a list of those (no limit, or too many to look up), everything matching the run is queued.
        if limitedQueuedIds is () || limitedQueuedIds.indexOf(row.contentId) is int {
            return "queued";
        }
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

# Waits until fewer than MAX_BULK_IN_FLIGHT items are still being indexed, so a bulk run never builds a long queue in
# the search service. Gives up after about an hour, so an item that never finishes can't hold the run forever.
#
# + return - How many more items may be sent now, or 0 if the service never caught up
isolated function waitForIndexingRoom() returns int {
    foreach int _ in 0 ..< MAX_BULK_ROOM_CHECKS {
        int room = MAX_BULK_IN_FLIGHT - backfillReservationContentIds().length();
        if room > 0 {
            return room;
        }
        runtime:sleep(BULK_IN_FLIGHT_CHECK_SECONDS);
    }
    return 0;
}

# Whether any content matching the filters is still waiting to be sent: not indexed, not failed, not already in flight.
# Assumes there is when it can't tell, so a database hiccup never ends a run early.
#
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + return - False only when the check shows nothing is left
isolated function hasUnsentPendingContent(string? contentType, string? contentSubtype) returns boolean {
    // The in-flight items sit in the same list, so look at one more row than there are of them.
    database:ContentIndexStatus[]|error rows = database:getSmartSearchContentStatus(contentType, contentSubtype,
            "pending", 0, backfillReservationContentIds().length() + 1);
    if rows is error {
        return true;
    }
    foreach database:ContentIndexStatus row in rows {
        if !isReservedForBackfill(row.contentId) {
            return true;
        }
    }
    return false;
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

# The items a run with a limit will send next, in the order it sends them: the first not-yet-sent ones matching the run.
#
# + scope - The active run
# + return - Up to the run's remaining count of rows, or an error if they couldn't be read
isolated function limitedQueuedRows(BulkRunScope scope) returns database:ContentIndexStatus[]|error {
    int remaining = bulkRunRemaining(scope) ?: 0;
    if remaining == 0 {
        return [];
    }
    // The sent-but-unfinished items sit in the same list, so ask for that many extra and skip them.
    database:ContentIndexStatus[] rows = check database:getSmartSearchContentStatus(scope.contentType,
            scope.contentSubtype, "pending", 0, remaining + backfillReservationContentIds().length());
    database:ContentIndexStatus[] queued = [];
    foreach database:ContentIndexStatus row in rows {
        if queued.length() < remaining && !isReservedForBackfill(row.contentId) {
            queued.push(row);
        }
    }
    return queued;
}

# One page of the queued items.
#
# + rows - Every row that belongs in the list
# + page - Which page to return (1-based)
# + count - How many items per page
# + return - That page, with counts
isolated function pageOfRows(database:ContentIndexStatus[] rows, int page, int count) returns BackfillStatusResult {
    int totalCount = rows.length();
    int totalPages = totalCount == 0 ? 1 : ((totalCount - 1) / count) + 1;
    int effectivePage = page > totalPages ? totalPages : page;
    int startIndex = (effectivePage - 1) * count;
    database:ContentIndexStatus[] pageRows = startIndex < totalCount
        ? rows.slice(startIndex, int:min(startIndex + count, totalCount))
        : [];
    BackfillStatusItem[] items = from database:ContentIndexStatus row in pageRows
        select {
            contentId: row.contentId,
            description: row.description,
            contentType: row.contentType,
            contentSubtype: row.contentSubtype,
            contentLink: row.contentLink,
            status: "queued",
            failureReason: ()
        };
    return {items, page: effectivePage, totalPages, totalCount, countIsApproximate: true, running: isBulkIndexRunning()};
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
    BackfillStatusResult result = check getBackfillStatusPage(contentType, contentSubtype, statusFilter, page, count);
    // Only a missing page link is lost if this fails - the list itself is still right.
    map<string>|error routePaths = database:getContentRoutePaths(
            from BackfillStatusItem item in result.items select item.contentId);
    if routePaths is error {
        log:printWarn("Smart Search: could not look up the pages of the listed content", routePaths);
        return result;
    }
    foreach BackfillStatusItem item in result.items {
        item.routePath = routePaths[item.contentId.toString()] ?: "";
    }
    return result;
}

# One page of the status list, without the page links of its items.
#
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + statusFilter - Only include items in this status, when set
# + page - Which page to return (1-based)
# + count - How many items per page
# + return - A page of results, or an error
isolated function getBackfillStatusPage(string? contentType, string? contentSubtype,
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

    // A run with a limit only queues the next few, so those are looked up first and used for both the queued
    // list and the labels in the other lists.
    BulkRunScope? scope = currentBulkRunScope();
    database:ContentIndexStatus[]? limitedQueued = ();
    if scope is BulkRunScope {
        int? remaining = bulkRunRemaining(scope);
        if remaining is int && remaining <= MAX_QUEUED_LOOKUP {
            limitedQueued = check limitedQueuedRows(scope);
        }
    }
    int[]? limitedQueuedIds = ();
    if limitedQueued is database:ContentIndexStatus[] {
        int[] ids = [];
        foreach database:ContentIndexStatus queuedRow in limitedQueued {
            ids.push(queuedRow.contentId);
        }
        limitedQueuedIds = ids;
    }
    if statusFilter == "queued" && limitedQueued is database:ContentIndexStatus[] {
        database:ContentIndexStatus[] shown = [];
        foreach database:ContentIndexStatus queuedRow in limitedQueued {
            if (contentType is () || queuedRow.contentType == contentType)
                    && (contentSubtype is () || queuedRow.contentSubtype == contentSubtype) {
                shown.push(queuedRow);
            }
        }
        return pageOfRows(shown, requestedPage, effectiveCount);
    }

    // Queued only exists while an index run is active, and only for what that run covers.
    string? listContentType = contentType;
    string? listContentSubtype = contentSubtype;
    if statusFilter == "queued" {
        if scope is () || (contentType is string && scope.contentType is string && contentType != scope.contentType)
                || (contentSubtype is string && scope.contentSubtype is string && contentSubtype != scope.contentSubtype) {
            return {items: [], page: 1, totalPages: 1, totalCount: 0, countIsApproximate: false,
                running: isBulkIndexRunning()};
        }
        listContentType = contentType ?: scope.contentType;
        listContentSubtype = contentSubtype ?: scope.contentSubtype;
    }

    // "not started" is approximate - it shares its DB bucket with "in progress", which SQL can't tell apart.
    string bucket = statusFilter == "indexed" ? "indexed"
        : statusFilter == "failed" ? "failed"
        : (statusFilter == "not_started" || statusFilter == "queued") ? "pending"
        : "all";
    int totalCount = check database:getSmartSearchContentStatusCount(listContentType, listContentSubtype, bucket);
    int totalPages = totalCount == 0 ? 1 : ((totalCount - 1) / effectiveCount) + 1;
    int effectivePage = requestedPage > totalPages ? totalPages : requestedPage;
    int offsetRows = (effectivePage - 1) * effectiveCount;

    database:ContentIndexStatus[] rows = check database:getSmartSearchContentStatus(listContentType,
            listContentSubtype, bucket, offsetRows, effectiveCount);
    BackfillStatusItem[] items = [];
    foreach database:ContentIndexStatus row in rows {
        BackfillStatus status = classifyBackfillStatus(row, limitedQueuedIds);
        // The "pending" bucket mixes in whatever's reserved - filter those back out here.
        if (statusFilter == "not_started" || statusFilter == "queued") && status != statusFilter {
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
        countIsApproximate: statusFilter == "not_started" || statusFilter == "queued",
        running: isBulkIndexRunning()
    };
}

# Works through everything matching the filters in automatic batches, pacing itself against the
# admin's own save limit. Launched with `start`, so the triggering request never waits on it.
# Trapped so a panic anywhere in the loop can't leave the run stuck as active forever.
#
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + maxCount - Stop once this many have been submitted, when set - unlimited otherwise
# + requestedBy - Email of the admin who started this run
# + retryFailed - Retry the content currently marked failed, instead of indexing content never tried
isolated function runBulkIndexInBackground(string? contentType, string? contentSubtype, int? maxCount,
        string? requestedBy, boolean retryFailed) {
    log:printInfo(string `Smart Search: bulk ${retryFailed ? "retry" : "index"} run started by ${requestedBy ?: "unknown"}`);
    error? result = retryFailed
        ? trap runBulkRetryFailedLoop(contentType, contentSubtype, maxCount, requestedBy)
        : trap runBulkIndexLoop(contentType, contentSubtype, maxCount, requestedBy);
    if result is error {
        log:printError("Smart Search: bulk index run failed unexpectedly", result);
    }
    log:printInfo("Smart Search: bulk run finished");
    clearBulkIndexRun();
}

# The loop behind an "index everything" run: sends batches of never-tried content, with only as many in flight at once
# as the search service has room for, until nothing is left or the limit is reached.
#
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + maxCount - Stop once this many have been submitted, when set - unlimited otherwise
# + requestedBy - Email of the admin who started this run
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
        // Nothing left to send means the run is done - no point waiting for room first.
        if !hasUnsentPendingContent(contentType, contentSubtype) {
            break;
        }
        // Only as many as the search service has room for, so it never builds a queue.
        int room = waitForIndexingRoom();
        if room == 0 {
            log:printWarn("Smart Search: the search service stayed busy for an hour, stopping this bulk run");
            break;
        }
        batchSize = int:min(batchSize, room);
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
            addBulkRunSubmitted(batchResult.submitted);
            log:printInfo(string `Smart Search: bulk run sent ${batchResult.submitted} item(s), ${totalSubmitted} so far`);
        } else if !candidatesResult.scanIncomplete {
            // A genuinely empty scan - nothing left matching these filters.
            break;
        } else if candidatesResult.progressed {
            emptyIncompleteScans = 0;
        } else {
            emptyIncompleteScans += 1;
            if emptyIncompleteScans >= MAX_EMPTY_INCOMPLETE_SCANS {
                log:printWarn(string `Smart Search: bulk index scan made no progress for ${MAX_EMPTY_INCOMPLETE_SCANS} scans in a row, stopping this run`);
                break;
            }
        }
        // Stop as soon as the target's reached, instead of sleeping out one more pacing interval first.
        if maxCount is int && totalSubmitted >= maxCount {
            break;
        }
        runtime:sleep(BULK_INDEX_BATCH_INTERVAL_SECONDS);
    }
}

# Every content id currently marked failed that matches the filters. Read in full before any retry starts,
# since retrying clears and re-records failures and would shift the pages of a live listing.
#
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + return - The ids in ascending order, or an error if the list couldn't be read
isolated function listFailedContentIds(string? contentType, string? contentSubtype) returns int[]|error {
    int[] ids = [];
    int offsetRows = 0;
    while ids.length() < MAX_BULK_INDEX_ITERATIONS * MAX_BACKFILL_BATCH_SIZE {
        database:ContentIndexStatus[] rows = check database:getSmartSearchContentStatus(contentType, contentSubtype,
                "failed", offsetRows, MAX_STATUS_LIST_COUNT);
        foreach database:ContentIndexStatus row in rows {
            ids.push(row.contentId);
        }
        if rows.length() < MAX_STATUS_LIST_COUNT {
            break;
        }
        offsetRows += rows.length();
    }
    return ids;
}

# Retries every failed content item matching the filters once, in paced batches - the same retry a single
# Retry click does. Each item is tried a single time, so one that fails again doesn't loop, and the failed list
# is re-read before every batch so an item fixed in the meantime isn't cleared and indexed again.
#
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + maxCount - Stop after this many items, when set - unlimited otherwise
# + requestedBy - Email of the admin who started this run
isolated function runBulkRetryFailedLoop(string? contentType, string? contentSubtype, int? maxCount,
        string? requestedBy) {
    int[]|error listed = listFailedContentIds(contentType, contentSubtype);
    if listed is error {
        log:printWarn("Smart Search: could not list failed content to retry, stopping this run", listed);
        return;
    }
    int[] failedIds = listed;
    if maxCount is int {
        int cap = maxCount < 0 ? 0 : maxCount;
        if cap < listed.length() {
            failedIds = listed.slice(0, cap);
        }
    }
    map<boolean> stillFailed = {};
    foreach int failedId in failedIds {
        stillFailed[failedId.toString()] = true;
    }
    int position = 0;
    int retried = 0;
    int skipped = 0;
    foreach int contentId in failedIds {
        // One batch, then a pause - the same pacing a normal bulk run keeps.
        if position > 0 && position % MAX_BACKFILL_BATCH_SIZE == 0 {
            runtime:sleep(BULK_INDEX_BATCH_INTERVAL_SECONDS);
            // The pause is long enough for an admin to fix some of the remaining items - only retry what still needs it.
            int[]|error current = listFailedContentIds(contentType, contentSubtype);
            if current is error {
                log:printWarn("Smart Search: could not re-check the failed list, stopping this run so nothing healthy is re-indexed",
                        current);
                break;
            }
            stillFailed = {};
            foreach int id in current {
                stillFailed[id.toString()] = true;
            }
        }
        position += 1;
        if !stillFailed.hasKey(contentId.toString()) || isReservedForBackfill(contentId) {
            skipped += 1;
            continue;
        }
        if requestedBy is string && !waitForIngestQuota(requestedBy) {
            log:printWarn("Smart Search: the indexing limit stayed full, stopping this retry run");
            break;
        }
        if waitForIndexingRoom() == 0 {
            log:printWarn("Smart Search: the search service stayed busy for an hour, stopping this retry run");
            break;
        }
        retried += 1;
        http:NotFound|error? result = retryIndexContent(contentId, requestedBy);
        if result is error {
            log:printWarn("Smart Search: retrying failed content did not go through", result, contentId = contentId);
        }
    }
    log:printInfo(string `Smart Search: retried ${retried} failed content item(s), skipped ${skipped} that no longer needed it`);
}

# Counts one indexing request against the admin's per-minute limit, waiting briefly for room when it is full.
#
# + userEmail - The admin whose limit to count against
# + return - False if there was still no room after waiting out a full window
isolated function waitForIngestQuota(string userEmail) returns boolean {
    int waited = 0;
    while !isIngestAllowedForEmail(userEmail) {
        if waited >= INGEST_WINDOW_SECONDS + 5 {
            return false;
        }
        runtime:sleep(5);
        waited += 5;
    }
    return true;
}

# Starts an "index everything" run for the given filters, unless one is already active.
#
# + ctx - Request context, for the admin's identity
# + contentType - Filter by content type, when set
# + contentSubtype - Filter by content subtype, when set
# + maxCount - Stop once this many have been submitted, when set - unlimited otherwise
# + retryFailed - Retry the content currently marked failed, instead of indexing content never tried
# + return - Whether a run actually started - false if one was already active
public isolated function startBulkIndex(http:RequestContext ctx, string? contentType, string? contentSubtype,
        int? maxCount, boolean retryFailed = false) returns BulkIndexStartResult {
    if !tryStartBulkIndexRun(contentType, contentSubtype, maxCount, retryFailed) {
        return {started: false};
    }
    string|error requestedBy = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
    _ = start runBulkIndexInBackground(contentType, contentSubtype, maxCount,
            requestedBy is string ? requestedBy : (), retryFailed);
    return {started: true};
}

# Live-checks content added or edited within the recheck window and not already a known failure.
#
# + return - False if unreachable partway through, or an error if the candidates couldn't be listed
isolated function reconcileUncheckedCandidates() returns boolean|error {
    database:UncheckedIndexCandidate[]|error candidates = database:getUncheckedIndexCandidates(RECHECK_WINDOW_HOURS);
    if candidates is error {
        log:printWarn("Smart Search: could not list unchecked index candidates", candidates);
        return candidates;
    }
    foreach database:UncheckedIndexCandidate candidate in candidates {
        string? link = indexingLinkFor(candidate.contentType, candidate.contentSubtype, candidate.contentLink,
                candidate.transcriptLink);
        if link is string && isContentLinkIndexable(candidate.contentType, candidate.contentSubtype, link)
                && !reconcileIndexStatus(candidate.contentId) {
            return false;
        }
    }
    return true;
}

# Returns the content that failed to index - reads the saved list, doesn't re-check it live.
#
# + return - The list, or an error
public isolated function listUnindexedContent() returns database:SmartSearchIndexFailure[]|error {
    return database:getSmartSearchIndexFailures();
}

# Live-checks every known failure against the Smart Search service, so the saved list stays current.
#
# + return - An error if a database read failed, () otherwise
isolated function reconcileAllUnindexedContent() returns error? {
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
        boolean _ = check reconcileUncheckedCandidates();
    }
}

# The ids the search service has indexed.
#
# + documentIds - The ids
type IndexedDocumentsResponse record {|
    string[] documentIds;
|};

# Which indexed document ids have no live Pitstop content. Only numeric ids are content ids - others aren't judged.
#
# + indexedIds - Every id the search service has indexed
# + liveIds - Every content id that hasn't been deleted
# + return - The orphaned content ids
isolated function findOrphanIds(string[] indexedIds, int[] liveIds) returns int[] {
    map<boolean> live = {};
    foreach int liveId in liveIds {
        live[liveId.toString()] = true;
    }
    int[] orphans = [];
    foreach string indexedId in indexedIds {
        int|error contentId = int:fromString(indexedId);
        if contentId is int && !live.hasKey(contentId.toString()) {
            orphans.push(contentId);
        }
    }
    return orphans;
}

# How many of the indexed ids are numeric - the only ones findOrphanIds can judge.
#
# + indexedIds - Every id the search service has indexed
# + return - The number of numeric ids
isolated function countNumericIds(string[] indexedIds) returns int {
    int count = 0;
    foreach string indexedId in indexedIds {
        if int:fromString(indexedId) is int {
            count += 1;
        }
    }
    return count;
}

# Whether the orphan count is small enough to trust - a large share means a mismatched database, not leftovers.
#
# + orphanCount - How many indexed ids have no live content
# + indexedCount - How many of the indexed ids can be judged (the numeric ones)
# + return - True if it's safe to remove them
isolated function isOrphanShareSafe(int orphanCount, int indexedCount) returns boolean {
    return <float>orphanCount <= <float>indexedCount * MAX_ORPHAN_SHARE;
}

# Removes indexed chunks whose Pitstop content no longer exists - a delete that never arrived or failed,
# or content deleted along with a whole section or route.
#
# + return - An error if the index or the database couldn't be read, () otherwise
isolated function sweepOrphanedIndexEntries() returns error? {
    http:Client serviceClient = check getSearchClient();
    IndexedDocumentsResponse indexed = check serviceClient->get("/documents");
    // Read after the index list: content is added to Pitstop before it's indexed, so nothing indexed since is missing here.
    int[] liveIds = check database:getLiveContentIds();

    int[] orphans = findOrphanIds(indexed.documentIds, liveIds);
    if orphans.length() == 0 {
        return;
    }
    // Only numeric ids are judged, so the share is measured against those, not the whole index.
    int judgeableCount = countNumericIds(indexed.documentIds);
    if !isOrphanShareSafe(orphans.length(), judgeableCount) {
        log:printWarn(string `Smart Search: orphan sweep removed nothing - ${orphans.length()} of ${judgeableCount} indexed documents have no Pitstop content, which looks like a database mismatch`);
        return;
    }

    int removed = 0;
    foreach int orphanId in orphans.slice(0, int:min(orphans.length(), MAX_ORPHANS_PER_SWEEP)) {
        if clearIndexedEntries(orphanId, "orphan-sweep") {
            removed += 1;
        }
    }
    log:printInfo(string `Smart Search: orphan sweep removed ${removed} of ${orphans.length()} orphaned documents from the index`);
}

class OrphanSweepJob {
    *task:Job;

    public function execute() {
        error? result = sweepOrphanedIndexEntries();
        if result is error {
            log:printWarn("Smart Search: periodic orphan sweep failed", result);
        }
    }
}

class IndexReconciliationJob {
    *task:Job;

    public function execute() {
        error? result = reconcileAllUnindexedContent();
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
    task:JobId|task:Error sweepScheduled =
        task:scheduleJobRecurByFrequency(new OrphanSweepJob(), ORPHAN_SWEEP_INTERVAL_SECONDS);
    if sweepScheduled is task:Error {
        log:printError("Smart Search: could not schedule the orphan sweep job", sweepScheduled);
    }
}
