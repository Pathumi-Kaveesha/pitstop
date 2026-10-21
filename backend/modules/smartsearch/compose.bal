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

import pitstop.types;

import ballerina/http;
import ballerina/lang.regexp;
import ballerina/url;

// Writing a short message (email, chat message, summary, explanation or something the seller describes) from the
// results of a search. Its types, limits and client are in types.bal, constants.bal and client.bal.

# An email's subject line, tidied: on one line, without control characters, and not empty or too long.
#
# + subject - The subject the Smart Search service wrote, when it wrote one
# + return - The subject to use, or nothing when there is none worth using
isolated function cleanSubject(string? subject) returns string? {
    if subject is () {
        return ();
    }
    string oneLine = regexp:replaceAll(re `\s+`, stripControlCharacters(subject), " ").trim();
    return oneLine == "" || oneLine.length() > MAX_COMPOSE_SUBJECT_LENGTH ? () : oneLine;
}

// How many messages are being written right now.
isolated int composesInFlight = 0;

# Takes one of the places for writing a message, when there is one free.
#
# + return - False when too many messages are already being written
isolated function tryStartCompose() returns boolean {
    lock {
        if composesInFlight >= MAX_COMPOSE_IN_FLIGHT {
            return false;
        }
        composesInFlight += 1;
        return true;
    }
}

# Gives a place for writing a message back.
isolated function finishCompose() {
    lock {
        composesInFlight = int:max(0, composesInFlight - 1);
    }
}

# The page's search, but with a short timeout and no retry.
#
# + query - What the user searched for
# + userJwt - The caller's login token
# + return - The sources found, or an error
isolated function searchForCompose(string query, string? userJwt) returns SmartSearchResponse|error {
    string encodedQuery = check url:encode(query, "UTF-8");
    http:Client searchClient = check getComposeSearchClient();
    return searchClient->get(string `/search?userQuery=${encodedQuery}&includeAnswer=false`, userJwtHeaders(userJwt));
}

# Writes a short message from the sources a search found, but only while there is room: with too many being written
# at once, the Smart Search service would have no time for searches and answers.
#
# + ctx - Request object
# + request - Which results, what the user searched for, and what kind of message
# + userJwt - The caller's login token, forwarded so the service can check it
# + return - The message, or bad-request, not-found or too-many-requests, or an error if it could not be written
public isolated function composeMessage(http:RequestContext ctx, ComposeRequest request, string? userJwt)
        returns ComposeResponse|http:BadRequest|http:NotFound|http:TooManyRequests|error {
    if !tryStartCompose() {
        return http:TOO_MANY_REQUESTS;
    }
    // Trapped, so that a failure inside can't leave the place taken for good.
    ComposeResponse|http:BadRequest|http:NotFound|error result = trap writeComposedMessage(ctx, request, userJwt);
    finishCompose();
    return result;
}

# Writes a short message from the sources a search found, drawing on all of them. The search is run again and narrowed
# to what the caller may see, so a result they can't see is never written from.
#
# + ctx - Request object
# + request - Which results, what the user searched for, and what kind of message
# + userJwt - The caller's login token, forwarded so the service can check it
# + return - The message and the results it was written from, bad-request for an empty or too long question, no results
#            or too many, not-found when none of the results are in the caller's search, or an error if the message
#            could not be written
isolated function writeComposedMessage(http:RequestContext ctx, ComposeRequest request, string? userJwt)
        returns ComposeResponse|http:BadRequest|http:NotFound|error {
    string query = request.query.trim();
    if query == "" || query.length() > MAX_QUERY_LENGTH {
        return http:BAD_REQUEST;
    }
    // Only a "custom" message uses the user's own words, and then they are required.
    string? purpose = ();
    if request.intent == "custom" {
        string typed = stripControlCharacters(request.purpose ?: "").trim();
        if typed == "" || typed.length() > MAX_COMPOSE_PURPOSE_LENGTH {
            return http:BAD_REQUEST;
        }
        purpose = typed;
    }
    string[] wanted = [];
    foreach string documentId in request.documentIds {
        string id = documentId.trim();
        if id != "" && wanted.indexOf(id) is () {
            wanted.push(id);
        }
    }
    if wanted.length() == 0 || wanted.length() > MAX_COMPOSE_DOCUMENTS {
        return http:BAD_REQUEST;
    }

    SmartSearchResponse allowed = filterToAuthorizedSources(ctx, check searchForCompose(query, userJwt));
    map<string> titles = {};
    foreach types:ContentResponse content in allowed.contents {
        if content.description.trim() != "" {
            titles[content.contentId.toString()] = content.description;
        }
    }

    // In the order the search ranked them, so the best match comes first.
    ComposePassage[] passages = [];
    string[] used = [];
    foreach SmartSearchResult hit in allowed.sources {
        if passages.length() >= MAX_COMPOSE_PASSAGES {
            break;
        }
        string text = hit.content.trim();
        if wanted.indexOf(hit.documentId) is () || text == "" {
            continue;
        }
        int? page = hit.page;
        passages.push({
            title: titles[hit.documentId] ?: hit.title,
            label: page is int ? string `${hit.unitLabel} ${page}` : "Excerpt",
            text: text.length() > MAX_COMPOSE_PASSAGE_LENGTH ? text.substring(0, MAX_COMPOSE_PASSAGE_LENGTH) : text
        });
        if used.indexOf(hit.documentId) is () {
            used.push(hit.documentId);
        }
    }
    if passages.length() == 0 {
        return http:NOT_FOUND;
    }

    // No retry: a second attempt after a slow answer would only pay for the same message twice.
    http:Client composeClient = check getComposeClient();
    ComposePayload payload = {intent: request.intent, query, passages, purpose};
    record {|string text; string? subject = ();|} written =
        check composeClient->post("/compose", payload, userJwtHeaders(userJwt));
    return {text: stripControlCharacters(written.text), documentIds: used, subject: cleanSubject(written.subject)};
}
