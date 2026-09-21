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
import ballerina/url;

# Runs a search against the Smart Search service.
#
# + userQuery - What the user typed into the search box
# + return - A generated answer plus its sources, or an error
public isolated function searchDocuments(string userQuery) returns SmartSearchResponse|error {
    // Explicit encoding - a query can contain a comma, which Ballerina's
    // query-parameter parser otherwise treats as a list separator.
    string encodedQuery = check url:encode(userQuery, "UTF-8");
    return smartSearchServiceClient->get(string `/search?userQuery=${encodedQuery}`);
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

# Indexes a just-created content item, if its link is a Google Drive link.
# Launched with `start` so content creation never waits on it.
#
# + contentId - The content's own id, reused as Smart Search's documentId
# + content - The content just created
public isolated function indexContentForSmartSearch(int contentId, types:ContentPayload content) {
    DriveLinkIngestRequest payload = {
        driveLink: content.contentLink,
        title: content.description,
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

    string|http:ClientError responseBody = response.getTextPayload();
    log:printWarn(string `Smart Search: skipped indexing content ${contentId}`,
            link = content.contentLink,
            status = response.statusCode,
            reason = responseBody is string ? responseBody : "(no details returned)");
}

# Clears a deleted content's entries from the search index. Content that
# was never indexed simply has nothing to clear. Launched with `start` so
# deleting a content never waits on it.
#
# + contentId - The content that was deleted
public isolated function deleteContentFromSmartSearch(int contentId) {
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

    string|http:ClientError responseBody = response.getTextPayload();
    log:printWarn(string `Smart Search: could not clear indexed entries for content ${contentId}`,
            status = response.statusCode,
            reason = responseBody is string ? responseBody : "(no details returned)");
}
