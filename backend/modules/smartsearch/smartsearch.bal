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

const int MAX_FILE_DOWNLOADS_PER_MINUTE = 10;
const int DOWNLOAD_WINDOW_SECONDS = 60;
const int MAX_TRACKED_DOWNLOAD_USERS = 1000;

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

const int RETRY_COOLDOWN_SECONDS = 60;
const int MAX_RETRIES_PER_WINDOW = 10;
const int RETRY_RATE_WINDOW_SECONDS = 5 * 60;
const int MAX_TRACKED_RETRIES = 1000;

// "content:<id>" -> [last retry time, 0]; "user:<email>" -> [window start in seconds, retries in that window]
isolated map<[int, int]> retryState = {};

# Check whether the caller may retry this content now, and count the retry if so.
#
# + ctx - Request object
# + contentId - The content being retried
# + return - False if the content was retried recently or the caller is over the retry limit
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
                if now - retryState.get(key)[0] >= RETRY_RATE_WINDOW_SECONDS {
                    _ = retryState.remove(key);
                }
            }
        }

        [int, int]? lastRetry = retryState[contentKey];
        if lastRetry is [int, int] && now - lastRetry[0] < RETRY_COOLDOWN_SECONDS {
            return false;
        }

        [int, int]? window = retryState[userKey];
        if window is () || now - window[0] >= RETRY_RATE_WINDOW_SECONDS {
            retryState[userKey] = [now, 1];
        } else if window[1] >= MAX_RETRIES_PER_WINDOW {
            return false;
        } else {
            retryState[userKey] = [window[0], window[1] + 1];
        }
        retryState[contentKey] = [now, 0];
        return true;
    }
}

# Fetches an indexed PDF from the Smart Search service, so the browser can open it at a page.
#
# + contentId - The content whose PDF to fetch
# + return - The file's bytes, a not-found response, or an error
public isolated function fetchDocumentFile(int contentId) returns byte[]|http:NotFound|error {
    http:Response upstream = check smartSearchServiceClient->get(string `/documents/${contentId}/file`);
    if upstream.statusCode == http:STATUS_NOT_FOUND {
        return http:NOT_FOUND;
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

# Indexes a content item. Launched with `start` so the caller never waits on it.
#
# + contentId - The content's own id, reused as Smart Search's documentId
# + driveLink - The content's link
# + title - The content's title
public isolated function indexContentForSmartSearch(int contentId, string driveLink, string title) {
    DriveLinkIngestRequest payload = {
        driveLink,
        title,
        contentId: contentId.toString()
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

    error? failureError = database:setSmartSearchIndexFailure(contentId, reason);
    if failureError is error {
        log:printWarn("Smart Search: could not record an index failure", failureError, contentId = contentId);
    }
}

# Clears a deleted content's entries from the search index. Content that
# was never indexed simply has nothing to clear. Launched with `start` so
# deleting a content never waits on it.
#
# + contentId - The content that was deleted
public isolated function deleteContentFromSmartSearch(int contentId) {
    error? clearError = database:clearSmartSearchIndexFailure(contentId);
    if clearError is error {
        log:printWarn("Smart Search: could not clear a deleted content's index failure", clearError,
                contentId = contentId);
    }

    http:Response|http:ClientError response =
        smartSearchServiceClient->delete(string `/documents/${contentId}`);
    if response is http:ClientError {
        log:printWarn(string `Smart Search: could not reach the indexing service to un-index content ${contentId}`,
                reason = response.message());
        return;
    }

    if response.statusCode >= 200 && response.statusCode < 300 {
        log:printInfo(string `Smart Search: cleared any indexed entries for content ${contentId}`);
        return;
    }

    if response.statusCode == http:STATUS_NOT_FOUND {
        return;
    }

    string|http:ClientError responseBody = response.getTextPayload();
    log:printWarn(string `Smart Search: could not clear indexed entries for content ${contentId}`,
            status = response.statusCode,
            reason = responseBody is string ? responseBody : "(no details returned)");
}

# Re-syncs Smart Search after a content's link is edited. Launched with `start` so the edit never waits on it.
#
# + contentId - The content that was edited
# + newLink - Its link after the edit
# + previousLink - Its link before the edit, when known
public isolated function reindexAfterLinkChange(int contentId, string newLink, string? previousLink) {
    // Clear old entries first so a failed re-index never leaves stale results
    if previousLink is string && isIndexableLink(previousLink) {
        deleteContentFromSmartSearch(contentId);
    }

    if isIndexableLink(newLink) {
        types:ContentResponse[]|error current = database:getContentsByIds([contentId], false, "");
        if current is error || current.length() == 0 {
            log:printWarn("Smart Search: could not look up content after a link change", contentId = contentId);
            return;
        }
        indexContentForSmartSearch(contentId, newLink, current[0].description);
    }
}

# Re-triggers indexing for a content item.
#
# + contentId - The content to retry
# + return - Not-found when there's no such content, an error, or nil on success
public isolated function retryIndexContent(int contentId) returns http:NotFound|error? {
    types:ContentResponse[] matched = check database:getContentsByIds([contentId], false, "");
    if matched.length() == 0 {
        return http:NOT_FOUND;
    }
    indexContentForSmartSearch(contentId, matched[0].contentLink, matched[0].description);
    return;
}

# Indexing status of a document.
#
# + indexed - Whether it's currently indexed
# + errorMessage - Why the last attempt failed, when known and not indexed
type IndexStatusResponse record {|
    boolean indexed;
    string? errorMessage;
|};

const int RECHECK_WINDOW_HOURS = 24;

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

    if status.indexed {
        error? clearError = database:clearSmartSearchIndexFailure(contentId);
        if clearError is error {
            log:printWarn("Smart Search: could not clear a resolved index failure", clearError,
                    contentId = contentId);
        }
    } else if status.errorMessage is string {
        error? updateError = database:setSmartSearchIndexFailure(contentId, <string>status.errorMessage);
        if updateError is error {
            log:printWarn("Smart Search: could not record an index failure", updateError, contentId = contentId);
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
        reachable = reconcileIndexStatus(failure.contentId);
        if !reachable {
            break;
        }
    }

    if reachable {
        database:UncheckedIndexCandidate[] candidates =
            check database:getUncheckedIndexCandidates(RECHECK_WINDOW_HOURS);
        foreach database:UncheckedIndexCandidate candidate in candidates {
            if isIndexableLink(candidate.contentLink) && !reconcileIndexStatus(candidate.contentId) {
                break;
            }
        }
    }

    return database:getSmartSearchIndexFailures();
}

const decimal RECONCILE_INTERVAL_SECONDS = 6 * 60 * 60;

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
