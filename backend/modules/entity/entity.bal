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

import ballerina/graphql;

// Employee Service Client.
final graphql:Client employeeGqlClient = check initializeEmployeeServiceClient();

# Retrieve Employee Data.
#
# + workEmail - WSO2 Email
# + return - Employee Info
public isolated function getEmployee(string workEmail) returns Employee|error? {

    //GraphQL query to fetch employee information
    string document = string `
        query employeeQuery ($workEmail: String!) {
            employee(email: $workEmail) {
                workEmail,
                firstName,
                lastName,
                employeeThumbnail,
                location,
                department,
                team,
                subTeam
            }
        }
    `;

    EmployeeResults|graphql:ClientError employeeData = employeeGqlClient->execute(document, {workEmail});

    if employeeData is graphql:ClientError {
        return handleGraphQlResultError(employeeData);
    }

    return employeeData.data.employee;
}

# Search for employees by name or email.
#
# + searchQuery - Partial name/email query
# + return - List of employees matching the query
public isolated function searchEmployees(string searchQuery) returns Employee[]|error {
    string document = string `
        query searchEmployees($searchQuery: String!) {
            employees(filter: { emailSearchString: $searchQuery }) {
                workEmail,
                firstName,
                lastName,
                employeeThumbnail,
                employeeStatus
            }
        }
    `;

    EmployeeSearchResults|graphql:ClientError employeeData = employeeGqlClient->execute(document, {searchQuery});

    if employeeData is graphql:ClientError {
        return handleGraphQlResultError(employeeData);
    }

    Employee[]? employees = employeeData.data.employees;
    if employees is () {
        return <Employee[]>[];
    }

    Employee[] activeEmployees = from var emp in employees
        let string? status = emp?.employeeStatus
        where status != Left
        select emp;

    return activeEmployees;
}
