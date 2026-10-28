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

import ballerina/http;
import ballerina/log;

// Writing the answer to a search again, from only the sources the caller may see, when filterToAuthorizedSources had to
// drop the first one. Its types, limit and client are in types.bal, constants.bal and client.bal.

// How many answers are being written again right now.
isolated int answerRewritesInFlight = 0;

# Takes one of the places for writing an answer again, when there is one free.
#
# + return - False when too many are already being written
isolated function tryStartAnswerRewrite() returns boolean {
    lock {
        if answerRewritesInFlight >= MAX_ANSWER_REWRITES_IN_FLIGHT {
            return false;
        }
        answerRewritesInFlight += 1;
        return true;
    }
}

# Gives a place for writing an answer again back.
isolated function finishAnswerRewrite() {
    lock {
        answerRewritesInFlight = int:max(0, answerRewritesInFlight - 1);
    }
}

# Asks the Smart Search service for an answer written from only the given documents.
#
# + userQuery - What the user searched for
# + documentIds - The only documents the answer may be written from
# + userJwt - The caller's login token, forwarded so the service can check it
# + return - The answer, nothing when there was nothing to write it from, or an error if it could not be written
isolated function rewriteAnswer(string userQuery, string[] documentIds, string? userJwt) returns string?|error {
    // No retry: a second attempt after a slow answer would only pay for the same answer twice.
    http:Client answerClient = check getComposeClient();
    AnswerPayload payload = {userQuery, documentIds};
    AnswerResponse written = check answerClient->post("/answer", payload, userJwtHeaders(userJwt));
    return written.answer;
}

# Gives a search the answer that filterToAuthorizedSources had to drop. The Smart Search service writes its answer from
# every match, so when some of them are not for the caller (hidden from them, or deleted) the answer is dropped with
# them; this asks for one written from only the sources that are left. If that can't be done, the answer stays dropped,
# as it was before.
#
# + userQuery - What the user searched for
# + found - The raw response from the Smart Search service
# + allowed - The same response after filterToAuthorizedSources
# + userJwt - The caller's login token, forwarded so the service can check it
# + return - The response to send the caller
public isolated function answerFromAllowedSources(string userQuery, SmartSearchResponse found,
        SmartSearchResponse allowed, string? userJwt = ()) returns SmartSearchResponse {
    // Nothing to redo when there was no answer, when it was kept, or when no source is left to write one from.
    if found.answer is () || allowed.answer is string || allowed.sources.length() == 0 {
        return allowed;
    }
    string[] documentIds = [];
    foreach SmartSearchResult hit in allowed.sources {
        if documentIds.indexOf(hit.documentId) is () {
            documentIds.push(hit.documentId);
        }
    }
    if !tryStartAnswerRewrite() {
        return allowed;
    }
    // Trapped, so that a failure inside can't leave the place taken for good.
    string?|error written = trap rewriteAnswer(userQuery, documentIds, userJwt);
    finishAnswerRewrite();
    if written is error {
        log:printWarn("Smart Search: could not write the answer again without the sources the caller can't see", written);
        return allowed;
    }
    if written is () {
        return allowed;
    }
    string answer = stripControlCharacters(written).trim();
    if answer == "" {
        return allowed;
    }
    return {answer, sources: allowed.sources, contents: allowed.contents};
}
