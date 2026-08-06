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
import pitstop.constants;

# Check permissions.
#
# + requiredRoles - Required Role list
# + userRoles - Roles list, the user has
# + return - Allow or not
public isolated function hasPermission(string[] requiredRoles, string[] userRoles) returns boolean {
    if userRoles.length() == 0 && requiredRoles.length() > 0 {
        return false;
    }

    final string[] & readonly userRolesReadOnly = userRoles.cloneReadOnly();
    return requiredRoles.every(role => userRolesReadOnly.indexOf(role) !is ());
}

# Check if the requesting user has admin access.
#
# + ctx - Request context
# + return - () if user is authorized, or http:Forbidden/http:InternalServerError on failure
public isolated function checkAdminAccess(http:RequestContext ctx) returns http:Forbidden|http:InternalServerError? {
    string[]|error userGroups = ctx.getWithType(REQUESTED_BY_USER_ROLES);
    if userGroups is error {
        log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
        return <http:InternalServerError> { body: constants:GET_USER_ROLE_ERROR };
    }

    if !hasPermission([authorizedRoles.adminRole], userGroups) {
        log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
        return http:FORBIDDEN;
    }

    return ();
}

# Converts a single string or an array of strings into a single consolidated string.
#
# + value - The dynamic claim value from the JWT
# + return - Consolidate string layout
isolated function stringifyClaim(string|string[]? value) returns string {
    if value is () {
        return "";
    }
    if value is string[] {
        // If it's an array, join elements with commas: "Sales Team, Customer Success Team"
        return ", ".join(...value);
    }
    return value;
}
