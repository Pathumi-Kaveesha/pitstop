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
import ballerina/test;

configurable string jwtKey = ?;

http:Client testClient = check new ("http://localhost:9090");

# Test get collections resource.
#
# + return - Error if so
@test:Config
public function getCollectionsTest() returns error? {
    // Resource get collections.
    http:Response errorResponse = check testClient->/collections.get();
    test:assertEquals(errorResponse.statusCode, http:STATUS_INTERNAL_SERVER_ERROR, "Assertion Failed! : get collections HeaderTest");

    // Happy path.
    http:Response successResponse = check testClient->/collections.get(headers = {"x-jwt-assertion": jwtKey});
    test:assertEquals(
        successResponse.statusCode,
        http:STATUS_OK,
        string `Assertion Failed! : ${(check successResponse.getJsonPayload()).toString()}`
    );

    // Invalid media type.
    json|error responseData = successResponse.getJsonPayload();
    if responseData is error {
        test:assertFail("Assertion Failed! : JSON response expected");
    }
}

# Test post collections resource.
#
# + return - Error if so
@test:Config
public function postCollectionsTest() returns error? {
    // Resource get collections.
    http:Response errorResponse = check testClient->/collections.post(
        message = {
            "name": "test 1"
        }
    );
    test:assertEquals(
        errorResponse.statusCode,
        http:STATUS_INTERNAL_SERVER_ERROR,
        "Assertion Failed! : get collections HeaderTest"
    );

    // Happy path.
    http:Response successResponse = check testClient->/collections.post(
        message = {
            "name": "test 2"
        },
        headers = {"x-jwt-assertion": jwtKey}
    );
    test:assertEquals(
        successResponse.statusCode,
        http:STATUS_CREATED,
        string `Assertion Failed! : ${(check successResponse.getJsonPayload()).toString()}`
    );

    // Invalid media type.
    json|error responseData = successResponse.getJsonPayload();
    if responseData is error {
        test:assertFail("Assertion Failed! : JSON response expected");
    }

    // Malformed response body.
    PostCollectionResponseData|error convertedData = responseData.cloneWithType();
    if convertedData is error {
        test:assertFail("Assertion Failed! : Malformed response");
    }
}


# Test patch quizzes validation for overdue items.
#
# + return - Error if so
@test:Config
public function patchQuizOverdueValidationTest() returns error? {
    // Missing Authorization Header Test.
    http:Response errorResponse = check testClient->/quizzes/[1].patch(
        message = {
            "dueDate": "2000-01-01T00:00:00Z",
            "status": "PUBLISHED"
        }
    );
    test:assertEquals(
        errorResponse.statusCode, 
        http:STATUS_INTERNAL_SERVER_ERROR, 
        "Assertion Failed! : patch quiz HeaderTest"
    );

    // Overdue Block Path (Valid Auth, Expired Due Date).
    http:Response validationResponse = check testClient->/quizzes/[1].patch(
        message = {
            "dueDate": "2000-01-01T00:00:00Z",
            "status": "PUBLISHED"
        },
        headers = {"x-jwt-assertion": jwtKey}
    );
    test:assertEquals(
        validationResponse.statusCode,
        http:STATUS_BAD_REQUEST,
        string `Assertion Failed! : ${(check validationResponse.getJsonPayload()).toString()}`
    );

    // Response Validation.
    json|error responseData = validationResponse.getJsonPayload();
    if responseData is error {
        test:assertFail("Assertion Failed! : JSON response expected");
    }

    // Verify specific domain error body rule.
    json|error messageField = responseData.message;
    if messageField is json {
        test:assertEquals(
            messageField.toString(), 
            "Cannot publish an overdue quiz. Please update the due date to a future time first.",
            "Assertion Failed! : Unexpected error message payload description returned"
        );
    } else {
        test:assertFail("Assertion Failed! : Expected a 'message' field in error payload response");
    }
}