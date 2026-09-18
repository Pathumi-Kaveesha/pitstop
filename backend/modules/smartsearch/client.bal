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

// Smart Search (POC) runs as a separate Python service - the AI libraries
// it needs are far more mature there than in Ballerina today.
public configurable SmartSearchServiceConfig smartSearchServiceConfig = ?;

// Used for search and delete - safe to retry, neither has a side effect
// that duplicates on a second attempt.
final http:Client smartSearchServiceClient = check initSmartSearchClient(true);

// Used only for /ingest-drive-link. No retry - a retried POST after a
// connection failure can land while the first attempt's background
// indexing job is still running, producing two overlapping jobs and
// duplicate vectors for the same document.
final http:Client smartSearchIngestClient = check initSmartSearchClient(false);

final http:RetryConfig & readonly smartSearchRetryConfig = {
    count: 2,
    interval: 2,
    backOffFactor: 2.0,
    maxWaitInterval: 10,
    statusCodes: [http:STATUS_INTERNAL_SERVER_ERROR, http:STATUS_BAD_GATEWAY,
        http:STATUS_SERVICE_UNAVAILABLE, http:STATUS_GATEWAY_TIMEOUT]
};

# Builds a client for the Smart Search service. Goes through Choreo's
# gateway when oauthConfig is set, and straight to the service when it isn't.
#
# + withRetry - Whether transient failures on this client retry
# + return - The client, or an error if it could not be initialised
isolated function initSmartSearchClient(boolean withRetry) returns http:Client|error {
    // HTTP/1.1 - the Python server (uvicorn) doesn't support the HTTP/2
    // cleartext upgrade Ballerina otherwise attempts for larger bodies.
    Oauth2Config? oauthConfig = smartSearchServiceConfig.oauthConfig;
    if oauthConfig is () {
        return withRetry
            ? new (smartSearchServiceConfig.serviceUrl, {
                httpVersion: http:HTTP_1_1,
                timeout: 300,
                retryConfig: smartSearchRetryConfig
            })
            : new (smartSearchServiceConfig.serviceUrl, {
                httpVersion: http:HTTP_1_1,
                timeout: 300
            });
    }
    return withRetry
        ? new (smartSearchServiceConfig.serviceUrl, {
            auth: {...oauthConfig},
            httpVersion: http:HTTP_1_1,
            timeout: 300,
            retryConfig: smartSearchRetryConfig
        })
        : new (smartSearchServiceConfig.serviceUrl, {
            auth: {...oauthConfig},
            httpVersion: http:HTTP_1_1,
            timeout: 300
        });
}
