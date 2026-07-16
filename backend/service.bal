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

import pitstop.analytics;
import pitstop.authorization;
import pitstop.constants;
import pitstop.database;
import pitstop.email;
import pitstop.entity;
import pitstop.types;

import ballerina/http;
import ballerina/log;
import ballerina/time;

configurable int recentContentsLimit = 6;
configurable int suggestedContentsLimit = 12;
configurable int suggestedContentsThreshold = 4;

configurable string frontendBaseUrl = ?;

configurable string appName = ?;

configurable types:AppInfo appInfo = {
    blockedIframeUrls: []
};

@display {
    label: "Pitstop",
    id: "pitstop"
}

service http:InterceptableService / on new http:Listener(9090) {

    public function createInterceptors() returns [authorization:JwtInterceptor, ResponseInterceptor] =>
        [new authorization:JwtInterceptor(), new ResponseInterceptor()];

    # Get application specific information.
    #
    # + return - App information
    resource function get app\-info() returns types:AppInfo|http:InternalServerError => appInfo;

    # Retrieve the App privileges of the logged in user.
    #
    # + ctx - Request object
    # + return - Internal Server Error or Employee Privileges object
    resource function get employee\-privileges(http:RequestContext ctx)
        returns int[]|http:InternalServerError {

        int[] privileges = [authorization:EMPLOYEE_PRIVILEGE];

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        if authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            privileges.push(authorization:SALES_ADMIN_PRIVILEGE);
        }
        return privileges;
    }

    # Retrieve basic information of a user from the local database.
    #
    # + userId - User ID
    # + return - User object or error
    resource function get users/[int userId](http:RequestContext ctx)
        returns types:User|http:NotFound|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: constants:GET_USER_ID_ERROR
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }
        
        types:User|error? userResult = database:getUserById(userId);

        if userResult is () {
            string customError = "User not found";
            log:printError(customError);
            return <http:NotFound> {
                body: customError
            };
        }

        if userResult is error {
            string customError = "Error while fetching user details";
            log:printError(customError, userResult);
            return <http:InternalServerError> {
                body: customError
            };
        }

        return userResult;
    }

    # Retrieve basic information of a employee.
    #
    # + email - Employee work email
    # + return - Internal Server Error, NotFound, or CombinedEmployeeResponse object
    resource function get employees/[string email](http:RequestContext ctx) 
        returns entity:Employee|http:NotFound|http:Forbidden|http:InternalServerError {
        
        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:USER_INFO_HEADER_NOT_FOUND, userEmail);
            return <http:InternalServerError> { body: constants:USER_INFO_HEADER_NOT_FOUND };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError> { body: constants:GET_USER_ROLE_ERROR };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        entity:Employee|error? employee = entity:getEmployee(email);
        
        if employee is error {
            string customError = "Error while fetching employee details";
            log:printError(customError, employee);
            return <http:InternalServerError> { body: customError };
        }

        if employee is () {
            return <http:NotFound> { body: "Requested employee is not found" };
        }
        
        error? addResult = database:addUser(employee);
        if addResult is error {
            log:printError("Error occurred while syncing user to local database", addResult);
        }
        
        int|error? userIdResult = database:getUserIdByUserEmail(email);
        if userIdResult is int {
            employee.userId = userIdResult;
        } else if userIdResult is error {
            log:printError("Error occurred while fetching local application database mapping ID", userIdResult);
        }

        return employee;
    }

    # Search for employees by partial name or email for @mention autocomplete.
    #
    # + searchPayload - Search query payload
    # + return - Array of matching employees or error responses
    resource function post employees/search(types:EmployeeSearchPayload searchPayload)
        returns entity:Employee[]|http:BadRequest|http:InternalServerError {

        if searchPayload.searchQuery.length() < 2 {
            string customError = "Search query must be at least 2 characters long";
            return <http:BadRequest>{
                body: customError
            };
        }

        entity:Employee[]|error employees = entity:searchEmployees(searchPayload.searchQuery);
        if employees is error {
            string customError = "Error while searching for employees";
            log:printError(customError, employees);
            return <http:InternalServerError>{
                body: customError
            };
        }
        return employees;
    }

    # Get all routePaths from database.
    #
    # + routePath - Route path
    # + return - Route path list or http status code
    resource function get routes(string? routePath)
        returns types:RouteResponse[]|types:PageResponse|http:NotFound|http:InternalServerError {

        if routePath is string {
            types:PageResponse|error? result = database:getPageDetails(routePath);

            if result is error {
                string customError = "Error while getting page details";
                log:printError(customError, result);
                return <http:InternalServerError>{
                    body: {
                        message: customError
                    }
                };
            }

            if result is () {
                return <http:NotFound>{
                    body: {
                        message: "Page not found"
                    }
                };
            }

            return result;
        }

        types:Route[]|error allRoutes = database:getAllRoutesFlat();

        if allRoutes is error {
            string customError = "Error while getting all routes";
            log:printError(customError, allRoutes);
            return <http:InternalServerError>{
                body: {
                    message: customError
                }
            };
        }

        return buildRouteTree(allRoutes);
    }

    # Add a new route path to the database.
    #
    # + requestPageData - Route path data
    # + return - Internal Server Error 
    resource function post routes(types:RoutePayload requestPageData, http:RequestContext ctx)
        returns http:Created|http:Forbidden|http:BadRequest|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }
        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        string menuItem = requestPageData.label;
        requestPageData.label = replaceSpacesWithHyphens(requestPageData.label);

        error? result = database:addRoutePath({...requestPageData, menuItem});
        if result is error {
            string customError = "Error while adding route path";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {
                    message: customError
                }
            };
        }

        return http:CREATED;
    }

    # Add a new content under a particular section or route.
    #
    # + ctx - Request context
    # + contentPayload - ContentPayload data (can contain either sectionId or routeId, but not both)
    # + return - Success or error responses
    resource function post contents(http:RequestContext ctx, types:ContentPayload contentPayload)
        returns http:Created|http:Conflict|http:Forbidden|http:BadRequest|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: constants:GET_USER_ID_ERROR
            };
        }
        string createdBy = userEmail;

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        if contentPayload.sectionId is () && contentPayload.routeId is () {
            string customError = "Either section or route is required to create a content";
            log:printWarn(customError);
            return <http:BadRequest>{
                body: customError
            };
        }

        if contentPayload.sectionId is int && contentPayload.routeId is int {
            string customError = "Both section and route is not allowed to create a content";
            log:printWarn(customError);
            return <http:BadRequest>{
                body: customError
            };
        }

        if contentPayload.routeId is int {
            contentPayload.contentType = database:ROUTE_CONTENT_TYPE;
        }

        boolean|error? isContentExistsResult = database:checkContentExists(
                contentPayload.contentLink,
                contentPayload.contentType,
                contentPayload.sectionId,
                (),
                contentPayload.routeId
        );
        if isContentExistsResult is error {
            string customError = "Error while checking content existence";
            log:printError(customError, isContentExistsResult);
            return <http:InternalServerError>{
                body: customError
            };
        }

        if isContentExistsResult is boolean && isContentExistsResult {
            log:printError(constants:CONTENT_ALREADY_EXISTS_ERROR);
            return http:CONFLICT;
        }

        error? content = database:addContent(contentPayload, createdBy);
        if content is error {
            string customError = "Error while adding a content";
            log:printError(customError, content);
            return <http:InternalServerError>{
                body: customError
            };
        }

        return http:CREATED;
    }

    # Add a new comment for a content.
    #
    # + commentPayload - Comment data
    # + return - Success or error responses
    resource function post comments(types:CommentPayload commentPayload, http:RequestContext ctx)
        returns http:Created|http:BadRequest|http:NotFound|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:USER_INFO_HEADER_NOT_FOUND, userEmail);
            return <http:InternalServerError>{
                body: constants:USER_INFO_HEADER_NOT_FOUND
            };
        }

        // OPTIMIZATION: Extracting pre-decoded user profile claims from the context.
        // Replaces the legacy, blocking external GraphQL HR service call (entity:)
        authorization:UserProfile|error userProfile = ctx.getWithType(authorization:REQUESTED_BY_USER_PROFILE);
        if userProfile is error {
            log:printError(constants:GET_USER_PROFILE_ERROR, userProfile);
            return <http:InternalServerError> { 
                body: constants:USER_PROFILE_READ_ERROR
            };
        }

        entity:Employee employeeInfo = {
            workEmail: userEmail,
            firstName: userProfile.firstName,
            lastName: userProfile.lastName,
            department: userProfile.department,
            team: userProfile.team,
            subTeam: userProfile.subTeam,
            employeeThumbnail: userProfile.employeeThumbnail
        };
        
        
        error? user = database:addUser(employeeInfo);
        if user is error {
            string customError = "Error while adding user";
            log:printError(customError, user);
            return <http:InternalServerError>{
                body: customError
            };
        }
        int|error? userId = database:getUserIdByUserEmail(userEmail);
        if userId == () {
            string customError = "User ID not found";
            log:printError(customError);
            return <http:NotFound>{
                body: customError
            };
        }
        if userId is error {
            string customError = "Error occurred while fetching user ID";
            log:printError(customError, userId);
            return <http:InternalServerError>{
                body: customError
            };
        }

        string[] validatedMentions = [];
        string[]? mentionedEmailsList = commentPayload.mentionedEmails;
        if mentionedEmailsList is string[] && mentionedEmailsList.length() > 0 {
            foreach string email in mentionedEmailsList {
                boolean|error exists = validateMentionedEmailExists(email);
                if exists is error {
                    string customError = "Error occurred while validating mentioned emails";
                    return <http:InternalServerError>{
                        body: {
                            message: customError
                        }
                    };
                }
                if !exists {
                    log:printWarn("Mentioned employee not found", email = email);
                }

                validatedMentions.push(email);
            }
        }

        error? comment = database:addComment({contentId: commentPayload.contentId, userId, 
            comment: commentPayload.comment});
        if comment is error {
            string customError = "Error while adding comment";
            log:printError(customError, comment);
            return <http:InternalServerError>{
                body: customError
            };
        }

        types:ContentResponseById|error? contentResponse = database:getContentDetailById(commentPayload.contentId);
        if contentResponse is error {
            string customError = "Error while fetching content";
            log:printError(customError, contentResponse);
            return <http:InternalServerError>{
                body: customError
            };
        }
        if contentResponse is () {
            string notFoundError = "Content not found";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {
                    message: notFoundError
                }
            };
        }
        
        // Send email notification to the configured email address with the content title about the new comment activity.
        string emailSubject = string `${appName}: ${contentResponse.description} Comment Activity`;

        string renderedTemplate = renderAppName(email:commentNotificationTemplate, appName);

        string|error content = email:bindKeyValues(renderedTemplate,
                {
                    "EMAIL_BODY": string `A new comment has been <b>added</b> to a content on the ${appName} application.`,
                    "COMMENT": commentPayload.comment,
                    "USER_EMAIL": userEmail,
                    "CONTENT_NAME": contentResponse.description,
                    "SHAREABLE_LINK": string `${frontendBaseUrl}${contentResponse.routePath}?sectionId=${
                    contentResponse.sectionId}&contentId=${commentPayload.contentId}`
                }
        );

        if content is error {
            string customError = "Error with email template!";
            log:printError(customError, content);
            return <http:InternalServerError>{
                body: {
                    "message": content.message()
                }
            };
        }

        error? emailResponse = email:sendEmail(
                {
                    to: email:emailServiceConfig.to,
                    'from: email:emailServiceConfig.'from,
                    subject: emailSubject,
                    template: content
                });
        if emailResponse is error {
            log:printError("Error occurred while sending the email!", emailResponse);
        }

        foreach string mentionedEmail in validatedMentions {
            string mentionEmailSubject = string `${appName}: ${contentResponse.description} Comment Activity`;
            string mentionRenderedTemplate = renderAppName(email:mentionNotificationTemplate, appName);
            string|error mentionContent = email:bindKeyValues(mentionRenderedTemplate,
                    {
                        "COMMENTER_NAME": string `${employeeInfo.firstName} ${employeeInfo.lastName}`,
                        "CONTENT_NAME": contentResponse.description,
                        "COMMENT": commentPayload.comment,
                        "SHAREABLE_LINK": string `${frontendBaseUrl}${contentResponse.routePath}?sectionId=${
                        contentResponse.sectionId}&contentId=${commentPayload.contentId}`
                    }
            );

            if mentionContent is error {
                log:printError("Error occurred while processing comment mention email template!", mentionContent);
                continue;
            }

            error? response = email:sendEmail(
                    {
                        to: [mentionedEmail],
                        'from: email:emailServiceConfig.'from,
                        subject: mentionEmailSubject,
                        template: mentionContent
                    });
            if response is error {
                log:printError("Error occurred while sending mention email!", response);
            }
        }

        return http:CREATED;
    }

    # Get comments for a particular content.
    #
    # + contentId - Content ID
    # + return - Success or error responses
    resource function get comments(int contentId) returns types:CommentResponse[]|http:InternalServerError {
        types:CommentResponse[]|error comments = database:getCommentsByContentId(contentId);
        if comments is error {
            string customError = "Error while fetching comments for content";
            log:printError(customError, comments);
            return <http:InternalServerError>{
                body: {
                    message: customError
                }
            };
        }
        return comments;
    }

    # Retrieve all tags from the database.
    #
    # + return - Tags or error responses
    resource function get tags() returns types:TagResponse[]|http:InternalServerError {
        types:TagResponse[]|error tagResponse = database:getAllTags();
        if tagResponse is error {
            string customError = "Error while fetching tag details";
            log:printError(customError, tagResponse);
            return <http:InternalServerError>{
                body: customError
            };
        }
        return tagResponse;
    }

    # Get sections under a given route ID.
    #
    # + routePath - Route path to get contents
    # + limit - Number of sections to retrieve
    # + offset - Number of sections to offset
    # + return - Sections or error responses
    resource function get routes/sections(int 'limit, int offset, string? routePath, http:RequestContext ctx)
        returns types:SectionResponse[]|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        types:Section[]|error dbSections = database:getSectionByRoutePath('limit, offset, routePath, userEmail);
        if dbSections is error {
            log:printError("Error while fetching sections for route path.", dbSections);
            return <http:InternalServerError>{
                body: {message: "Error while fetching sections."}
            };
        }

        types:Section[] sections = dbSections.clone();

        if routePath == "/" || routePath == "/home" {
            types:Section[] specialSectionsInOrder = [];

            //  Recent contents section first
            specialSectionsInOrder.push({
                sectionId: RECENT_CONTENT_SECTION_ID,
                title: RECENT_CONTENTS_TITLE,
                description: "",
                sectionType: RECENT_CONTENT_SECTION_TYPE,
                imageUrl: (),
                redirectUrl: (),
                sectionOrder: RECENT_CONTENT_ORDER,
                customSectionTheme: (),
                tags: ()
            });

            if userEmail is string {
                analytics:VisitSummary|error hasSuggested = analytics:processRecentActivityForUser(userEmail);
                boolean hasSuggestedContent = hasSuggested is analytics:VisitSummary;

                boolean|error hasSuggestedFromPinned = database:hasSuggestedContentFromPinnedContents(
                userEmail, suggestedContentsLimit, suggestedContentsThreshold);

                if hasSuggested is error {
                    string customError = "Error processing recent activity for suggested content.";
                    log:printError(customError, hasSuggested);
                    return <http:InternalServerError>{
                        body: {message: customError}
                    };
                }
                if hasSuggestedFromPinned is error {
                    string customError = "Error checking suggested content from pinned contents.";
                    log:printError(customError, hasSuggestedFromPinned);
                    return <http:InternalServerError>{
                        body: {message: customError}
                    };
                }

                //Suggested For You section secondly
                if hasSuggestedContent || hasSuggestedFromPinned {
                    specialSectionsInOrder.push({
                        sectionId: SUGGESTED_CONTENT_SECTION_ID,
                        title: SUGGESTED_FOR_YOU_TITLE,
                        description: "",
                        sectionType: SUGGESTED_CONTENT_SECTION_TYPE,
                        imageUrl: (),
                        redirectUrl: (),
                        sectionOrder: SUGGESTED_CONTENT_ORDER,
                        customSectionTheme: (),
                        tags: ()
                    });
                }

                boolean|error hasPinned = database:hasPinnedContent(userEmail);
                if hasPinned is error {
                    log:printError("Error checking pinned content.", hasPinned);
                } else if hasPinned == true {
                    specialSectionsInOrder.push({
                        sectionId: PINNED_CONTENT_SECTION_ID,
                        title: MY_BOARD_TITLE,
                        description: "",
                        sectionType: PINNED_CONTENT_SECTION_TYPE,
                        imageUrl: (),
                        redirectUrl: (),
                        sectionOrder: PINNED_CONTENT_ORDER,
                        customSectionTheme: (),
                        tags: ()
                    });
                }
            }
            sections = [...specialSectionsInOrder, ...sections];
        }

        types:SectionResponse[] sectionResponseData = from var section in sections
            select {...section, contentData: []};

        return sectionResponseData;
    }

    # Get contents with optional filtering by section ID or route ID.
    #
    # + ctx - Request context
    # + sectionId - Section ID to get contents
    # + routeId - Route ID
    # + limit - Number of contents to retrieve
    # + offset - Number of contents to offset
    # + return - Contents or error responses
    resource function get contents(http:RequestContext ctx, int? sectionId = (), int? routeId = (), 
        int 'limit = DEFAULT_CONTENTS_LIMIT, int 'offset = DEFAULT_CONTENTS_OFFSET)
        returns types:ContentResponse[]|http:NotFound|http:Forbidden|http:BadRequest|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        boolean isUser = !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups);

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        if sectionId is () && routeId is () {
            string customError = "Either section or route is required to create a content";
            log:printWarn(customError);
            return <http:BadRequest>{
                body: customError
            };
        }

        if sectionId is int && routeId is int {
            string customError = "Both section and route is not allowed to create a content";
            log:printWarn(customError);
            return <http:BadRequest>{
                body: customError
            };
        }

        types:ContentResponse[]|error contents = [];

        if sectionId is int {
            if sectionId == RECENT_CONTENT_SECTION_ID {
                contents = database:getRecentContents(userEmail, recentContentsLimit, 0);
            } else if sectionId == PINNED_CONTENT_SECTION_ID {
                contents = database:getPinnedContents(userEmail, 'limit, 'offset);
            } else if sectionId == SUGGESTED_CONTENT_SECTION_ID {
                analytics:VisitSummary|error visitSummary = analytics:processRecentActivityForUser(userEmail);
                if visitSummary is error {
                    log:printWarn("Analytics unavailable. Using fallback suggestions", userEmail = userEmail);
                    contents = database:getSuggestionsFromPinnedContents(userEmail, suggestedContentsLimit, 0);
                } else {
                    log:printDebug("Analytics data loaded for suggested section", userEmail = userEmail);
                    contents = database:getSuggestionsFromRecentActivity(userEmail, visitSummary.searchedKeywords,
                        visitSummary.viewedContentNames, suggestedContentsLimit, 0);
                }
            } else {
                boolean|error? exists = database:checkSectionExists((), (), sectionId);
                if exists is error {
                    string customError = "Error while checking section existence.";
                    log:printError(customError, exists);
                    return <http:InternalServerError>{
                        body: {message: customError}
                    };
                }
                if exists is boolean && !exists {
                    return <http:NotFound>{
                        body: {message: "Section not found."}
                    };
                }
                contents = database:getContents(isUser, 'limit, 'offset, sectionId, (), userEmail);
            }
        } else if routeId is int {
            contents = database:getContents(isUser, 'limit, 'offset, (), routeId, userEmail);
        }

        if contents is error {
            string customError = sectionId is int ? 
                "Error while fetching contents for section ID: " + sectionId.toString() :
                "Error while fetching contents for route ID: " + (routeId is int ? routeId.toString() : "unknown");
            log:printError(customError, contents);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        return contents;
    }

    # Get pinned content for the current user.
    #
    # + limit - Number of contents to retrieve
    # + offset - Number of contents to offset
    # + return - Pinned contents or error responses
    resource function get contents/pinned(int 'limit, int 'offset, http:RequestContext ctx)
        returns types:ContentResponse[]|http:BadRequest|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        types:ContentResponse[]|error contentResponse =
        database:getPinnedContents(userEmail, 'limit, 'offset);

        if contentResponse is error {
            string customError = "Error while fetching pinned contents.";
            log:printError(customError, contentResponse);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        return contentResponse;
    }

    # Delete a content.
    #
    # + contentId - Content ID
    # + return - Success or error responses
    resource function delete contents/[int contentId](http:RequestContext ctx)
        returns http:Ok|http:Forbidden|http:NotFound|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        int|error? result = database:deleteContentById(contentId);
        if result is error || result == () {
            string customError = "Error while deleting content!";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }
        if result == 0 {
            return http:NOT_FOUND;
        }

        return http:OK;
    }

    # Add like to a component.
    #
    # + contentId - Content ID
    # + return - Success or error responses
    resource function post contents/[int contentId]/likes(http:RequestContext ctx)
        returns http:Created|http:NotFound|http:Conflict|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:USER_INFO_HEADER_NOT_FOUND, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:USER_INFO_HEADER_NOT_FOUND}
            };
        }

        // OPTIMIZATION: Extracting pre-decoded user profile claims from the context.
        // Replaces the legacy, blocking external GraphQL HR service call (entity:getEmployee)
        authorization:UserProfile|error userProfile = ctx.getWithType(authorization:REQUESTED_BY_USER_PROFILE);
        if userProfile is error {
            log:printError(constants:GET_USER_PROFILE_ERROR, userProfile);
            return <http:InternalServerError> { 
                body: constants:USER_PROFILE_READ_ERROR
            };
        }
        
        entity:Employee employee = {
            workEmail: userEmail,
            firstName: userProfile.firstName,
            lastName: userProfile.lastName,
            department: userProfile.department,
            team: userProfile.team,
            subTeam: userProfile.subTeam,
            employeeThumbnail: userProfile.employeeThumbnail
        };

        error? addUserErr = database:addUser(employee);
        if addUserErr is error {
            string customError = "Failed to add user";
            log:printError(customError, addUserErr);
            return <http:InternalServerError>{
                body: customError
            };
        }

        int|error? userId = database:getUserIdByUserEmail(userEmail);
        if userId == () {
            string customError = "User ID not found";
            log:printError(customError);
            return <http:NotFound>{
                body: customError
            };
        }
        if userId is error {
            string customErr = "Error occurred while fetching user ID";
            log:printError(customErr, userId);
            return <http:InternalServerError>{
                body: customErr
            };
        }

        error? result = database:addLike({contentId, userId});
        if result is error {
            string customErr = "Failed to add like";
            log:printError(customErr, result);
            return <http:Conflict>{
                body: customErr
            };
        }

        return http:CREATED;
    }

    # Get all users who liked a content.
    #
    # + contentId - Content ID
    # + ctx - Request context
    # + return - Array of likes or error responses
    resource function get contents/[int contentId]/likes(http:RequestContext ctx)
        returns types:LikeResponse[]|http:NotFound|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        types:ContentResponseById|error? contentResponse = database:getContentDetailById(contentId);
        if contentResponse is error {
            string customError = "Error while fetching content";
            log:printError(customError, contentResponse);
            return <http:InternalServerError>{
                body: customError
            };
        }

        if contentResponse is () {
            string notFoundError = "Content not found";
            return <http:NotFound>{
                body: notFoundError
            };
        }

        types:LikeResponse[]|error likes = database:getLikes(contentId);
        if likes is error {
            string customErr = "Failed to fetch likes";
            log:printError(customErr, likes);
            return <http:InternalServerError>{
                body: customErr
            };
        }

        return likes;
    }

    # Pin a content item.
    #
    # + pinPayload - Pin content payload containing contentId
    # + return - Success or error responses
    resource function post users/me/pinned\-contents(types:PinContentPayload pinPayload, http:RequestContext ctx)
        returns http:Created|http:NotFound|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:USER_INFO_HEADER_NOT_FOUND, userEmail);
            return <http:InternalServerError>{
                body: constants:USER_INFO_HEADER_NOT_FOUND
            };
        }

        // OPTIMIZATION: Extracting pre-decoded user profile claims from the context.
        // Replaces the legacy, blocking external GraphQL HR service call (entity:getEmployee)

        authorization:UserProfile|error userProfile = ctx.getWithType(authorization:REQUESTED_BY_USER_PROFILE);
        if userProfile is error {
            log:printError(constants:GET_USER_PROFILE_ERROR, userProfile);
            return <http:InternalServerError> { 
                body: constants:USER_PROFILE_READ_ERROR
            };
        }

        entity:Employee employee = {
            workEmail: userEmail,
            firstName: userProfile.firstName,
            lastName: userProfile.lastName,
            department: userProfile.department,
            team: userProfile.team,
            subTeam: userProfile.subTeam,
            employeeThumbnail: userProfile.employeeThumbnail
        };

        error? result = database:addUser(employee);
        if result is error {
            string customErr = "Failed to add user";
            log:printError(customErr, result);
            return <http:InternalServerError>{
                body: customErr
            };
        }

        int|error? pinContentResult = database:pinContents({contentId: pinPayload.contentId, userEmail: userEmail});
        if pinContentResult is error || pinContentResult == () {
            string customPinErr = "Failed to pin content";
            log:printError(customPinErr, pinContentResult);
            return <http:InternalServerError>{
                body: customPinErr
            };
        }
        if pinContentResult == 0 {
            return http:NOT_FOUND;
        }
        return http:CREATED;
    }

    # Unpin a content item.
    #
    # + contentId - Content ID
    # + return - Success or error responses
    resource function delete users/me/pinned\-contents/[int contentId](http:RequestContext ctx)
        returns http:Ok|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:USER_INFO_HEADER_NOT_FOUND, userEmail);
            return <http:InternalServerError>{
                body: constants:USER_INFO_HEADER_NOT_FOUND
            };
        }

        error? unpinResult = database:unpinContents({contentId, userEmail: userEmail});
        if unpinResult is error {
            string customUnpinErr = "Failed to unpin content";
            log:printError(customUnpinErr, unpinResult);
            return <http:InternalServerError>{
                body: customUnpinErr
            };
        }
        return http:OK;
    }

    # Delete a route.
    #
    # + routeId - Route ID
    # + return - Success or error responses
    resource function delete routes/[int routeId](http:RequestContext ctx)
        returns http:Ok|http:NotFound|http:Forbidden|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        // [Start] Custom Resource level authorization.
        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        int|error? route = database:deleteRoute(routeId);
        if route is error || route == () {
            string customError = "Error while deleting route";
            log:printError(customError, route);
            return <http:InternalServerError>{
                body: customError
            };
        }
        if route == 0 {
            return http:NOT_FOUND;
        }
        return http:OK;
    }

    # Update a route.
    #
    # + updateRoutePayload - New route details
    # + return - Success or error responses
    resource function patch routes/[int routeId](http:RequestContext ctx, types:UpdateRoutePayload updateRoutePayload)
        returns http:Ok|http:Forbidden|http:NotFound|http:BadRequest|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }
        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        string? thumbnail = updateRoutePayload.thumbnail;
        thumbnail = thumbnail == "" ? () : thumbnail;
        if thumbnail is string && !constants:URL.isFullMatch(thumbnail) {
            log:printError(constants:INVALID_URL_ERROR, thumbnail = thumbnail);
            return http:BAD_REQUEST;
        }
        int|error? route = database:updateRoute(routeId, updateRoutePayload);
        if route is error || route is () {
            string customError = "Error while updating route";
            log:printError(customError, route);
            return <http:InternalServerError>{
                body: customError
            };
        }
        if route == 0 {
            return http:NOT_FOUND;
        }
        return http:OK;
    }

    # Update a content.
    #
    # + updateContentPayload - New content details
    # + return - Success or error responses
    resource function patch contents/[int contentId](http:RequestContext ctx,
            types:UpdateContentPayload updateContentPayload)
        returns http:Ok|http:Forbidden|http:NotFound|http:BadRequest|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:USER_INFO_HEADER_NOT_FOUND, userEmail);
            return <http:InternalServerError>{
                body: constants:USER_INFO_HEADER_NOT_FOUND
            };
        }
        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        string? contentLink = updateContentPayload.contentLink;
        contentLink = contentLink == "" ? () : contentLink;
        if contentLink is string && !constants:URL.isFullMatch(contentLink) {
            log:printError(constants:INVALID_URL_ERROR, contentLink = contentLink);
            return http:BAD_REQUEST;
        }

        int|error? content = database:updateContent(contentId, updateContentPayload, userEmail);
        if content is error || content is () {
            string customError = "Error while updating content";
            log:printError(customError, content);
            return <http:InternalServerError>{
                body: customError
            };
        }
        if content == 0 {
            return http:NOT_FOUND;
        }
        return http:OK;
    }

    # Add a new section under a particular router path.
    #
    # + sectionPayload - Section payload data
    # + return - Success or error responses
    resource function post sections(types:SectionPayload sectionPayload, http:RequestContext ctx)
        returns http:Created|http:NotFound|http:Conflict|http:BadRequest|http:Forbidden|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        // [Start] Custom Resource level authorization.
        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            return http:FORBIDDEN;
        }
        // [End] Custom Resource level authorization.

        if sectionPayload.sectionType == "image" && sectionPayload.imageUrl == () {
            log:printError(constants:IMAGE_LINK_REQUIRED_ERROR);
            return http:BAD_REQUEST;
        }

        boolean|error? isSectionExists = database:checkSectionExists(sectionPayload.title, sectionPayload.routeId);
        if isSectionExists is error {
            string customError = "Error while checking section existence";
            log:printError(customError, isSectionExists);
            return <http:InternalServerError>{
                body: customError
            };
        }
        if isSectionExists is boolean && isSectionExists {
            log:printError(constants:SECTION_ALREADY_EXISTS_ERROR);
            return http:CONFLICT;
        }

        error? section = database:addSection(sectionPayload);
        if section is error {
            string customError = "Error while adding section";
            log:printError(customError, section);
            return <http:InternalServerError>{
                body: customError
            };
        }
        return http:CREATED;
    }

    # Update a section.
    #
    # + updatedSectionPayload - New section details
    # + return - Success or error respon
    resource function patch sections/[int sectionId](http:RequestContext ctx, types:UpdateSectionPayload 
        updatedSectionPayload) returns http:Ok|http:Forbidden|http:NotFound|http:BadRequest|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }
        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        if updatedSectionPayload.sectionType == "image" && updatedSectionPayload.imageUrl == () {
            log:printError(constants:IMAGE_LINK_REQUIRED_ERROR);
            return http:BAD_REQUEST;
        }

        string? imageUrl = updatedSectionPayload.imageUrl;
        imageUrl = imageUrl == "" ? () : imageUrl;
        if imageUrl is string && !constants:URL.isFullMatch(imageUrl) {
            log:printError(constants:INVALID_URL_ERROR, imageUrl = imageUrl);
            return http:BAD_REQUEST;
        }

        string? redirectUrl = updatedSectionPayload.redirectUrl;
        redirectUrl = redirectUrl == "" ? () : redirectUrl;
        if redirectUrl is string && redirectUrl != "" {
            boolean isMatch = constants:URL.isFullMatch(redirectUrl);
            if !isMatch {
                log:printError(constants:INVALID_URL_ERROR, redirectUrl = redirectUrl);
                return http:BAD_REQUEST;
            }
        }

        int|error? section = database:updateSection(sectionId, updatedSectionPayload);
        if section is error || section is () {
            string customError = "Error while updating section";
            log:printError(customError, section);
            return <http:InternalServerError>{
                body: customError
            };
        }
        if section == 0 {
            return http:NOT_FOUND;
        }
        return http:OK;
    }

    # Delete a section.
    #
    # + sectionId - Section ID
    # + return - Success or error responses
    resource function delete sections/[int sectionId](http:RequestContext ctx)
        returns http:Ok|http:BadRequest|http:NotFound|http:Forbidden|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        // [Start] Custom Resource level authorization.
        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }
        // [End] Custom Resource level authorization.

        int|error? sectionById = database:deleteSectionById(sectionId);
        if sectionById is error || sectionById == () {
            string customError = "Error while deleting section.";
            log:printError(customError, sectionById);
            return <http:InternalServerError>{
                body: customError
            };
        }
        if sectionById == 0 {
            return http:NOT_FOUND;
        }
        return http:OK;
    }

    # Search contents.
    #
    # + userInput - User input
    # + return - Success or error responses
    resource function post search\-content(http:RequestContext ctx, string userInput)
        returns types:ContentResponse[]|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        string customEmailError = "Error while fetching user email.";
        if userEmail is error {
            log:printError(customEmailError, userEmail);
            return <http:InternalServerError>{
                body: customEmailError
            };
        }

        types:ContentResponse[]|error contentResponse = database:getContentsByText(userInput, userEmail);
        if contentResponse is error {
            log:printError(constants:GET_CONTENTS_BY_TEXT_ERROR, contentResponse);
            return <http:InternalServerError>{
                body: "Error while searching contents."
            };
        }
        return contentResponse;
    }

    # Search contents basic info.
    #
    # + return - Success or error responses
    resource function get search\-content/basic(http:RequestContext ctx)
        returns types:ContentReport[]|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        types:ContentReport[]|error result = database:getContentDetails();
        if result is error {
            string customError = "Error while fetching basic content search info";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: customError
            };
        }
        return result;
    }

    # Filter contents by tags.
    #
    # + inputTags - Input tags
    # + return - Success or error responses
    resource function post filter\-content(http:RequestContext ctx, string[] inputTags)
        returns types:ContentResponse[]|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        string customEmailError = "Error while fetching user email.";
        if userEmail is error {
            log:printError(customEmailError, userEmail);
            return <http:InternalServerError>{
                body: customEmailError
            };
        }

        types:ContentResponse[]|error contentResponse = database:getContentsByTags(inputTags, userEmail);
        if contentResponse is error {
            log:printError(constants:GET_CONTENTS_BY_TAGS_ERROR, contentResponse);
            return <http:InternalServerError>{
                body: "Error while filtering content by tags."
            };
        }
        return contentResponse;
    }

    # Add a new tag.
    #
    # + tagPayload - Tag details
    # + return - Success or error responses
    resource function post tags(http:RequestContext ctx, types:TagPayload tagPayload)
        returns http:Created|http:BadRequest|http:Forbidden|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        error? result = database:addTag(tagPayload);
        if result is error {
            string customError = "Error while adding tag!";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {
                    "message": customError
                }
            };
        }
        return http:CREATED;
    }

    # Delete a tag.
    #
    # + tagName - Tag details
    # + return - Success or error responses
    resource function delete tags/[string tagName](http:RequestContext ctx)
        returns http:Ok|http:NotFound|http:Forbidden|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        int|error? result = database:deleteTag(tagName);
        if result is error || result == () {
            string customError = "Error while deleting tag!";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {
                    "message": customError
                }
            };
        }
        if result == 0 {
            return http:NOT_FOUND;
        }
        return http:OK;
    }

    # Reparent one or more routes.
    #
    # + payload - Reparenting info
    # + return - Success or error responses
    resource function patch routes/reparent(http:RequestContext ctx, types:ReParentRoutesPayload payload)
        returns http:Ok|http:BadRequest|http:Forbidden|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        error? result = database:reparentRoutes(payload);
        if result is error {
            string customError = "Error while reparenting routes.";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {
                    "message": customError
                }
            };
        }
        return http:OK;
    }

    # Updates the text of an testimonial comment in the database.
    #
    # + commentId - Comment ID
    # + commentPayload - Comment payload data
    # + return - Success or error responses
    resource function patch comments/[int commentId](http:RequestContext ctx, types:UpdateCommentPayload commentPayload)
        returns http:Ok|http:Forbidden|http:NotFound|http:BadRequest|http:InternalServerError {

        if commentPayload.commentId != commentId {
            log:printError(constants:COMMENT_ID_MISMATCH_ERROR, 
                pathCommentId = commentId, payloadCommentId = commentPayload.commentId);
            return http:BAD_REQUEST;
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        string customEmailError = "Error while fetching user email.";
        if userEmail is error {
            log:printError(customEmailError, userEmail);
            return <http:InternalServerError>{
                body: customEmailError
            };
        }

        boolean isAdmin = authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups);

        types:CommentData|error? data = database:getCommentData(commentId, userEmail);
        string customError = "Error while fetching comment data";
        if data is error {
            log:printError(customError, data);
            return <http:NotFound>{
                body: {"message": customError}
            };
        }

        if data is () {
            string notFoundError = "Comment not found or not owned by user.";
            return <http:NotFound>{
                body: {"message": notFoundError}
            };
        }
        types:CommentData commentData = data;

        if !isAdmin {
            time:Utc now = time:utcNow();
            decimal ageSec = time:utcDiffSeconds(now, commentData.createdOn);
            if ageSec > 3600d {
                log:printError("Update window expired (>1h)", commentId = commentId, userEmail = userEmail);
                return http:FORBIDDEN;
            }
        }

        int|error? updateErr = database:updateComment(commentPayload, userEmail);
        if updateErr is error || updateErr is () {
            string customUpdateError = "Error while updating comment";
            log:printError(customUpdateError, updateErr);
            return <http:InternalServerError>{
                body: {"message": customUpdateError}
            };
        }
        if updateErr == 0 {
            return http:NOT_FOUND;
        }

        types:ContentResponseById|error? contentResponse = database:getContentDetailById(commentPayload.contentId);
        if contentResponse is error {
            string customContentResponseError = "Error while fetching content details";
            log:printError(customContentResponseError, contentResponse);
            return <http:InternalServerError>{
                body: {"message": customContentResponseError}
            };
        }
        if contentResponse is () {
            string notFoundError = "Content not found.";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {
                    message: notFoundError
                }
            };
        }

        string emailSubject = string `[${appName}] ${contentResponse.description} Comment Activity`;

        string renderedTemplate = renderAppName(email:commentNotificationTemplate, appName);

        string|error content = email:bindKeyValues(renderedTemplate,
                {
                    "EMAIL_BODY": string `An <b>update</b> has been made to a comment for a content within the 
                    ${appName} application.`,
                    "COMMENT": commentPayload.comment,
                    "USER_EMAIL": userEmail,
                    "CONTENT_NAME": contentResponse.description,
                    "SHAREABLE_LINK": string `${frontendBaseUrl}${contentResponse.routePath}?sectionId=${
                    contentResponse.sectionId}&contentId=${commentPayload.contentId}`
                }
        );

        string customContentError = "Error with email template!";
        if content is error {
            log:printError(customContentError, content);
            return <http:InternalServerError>{
                body: {"message": customContentError}
            };
        }

        error? emailResponse = email:sendEmail(
                {
                    to: email:emailServiceConfig.to,
                    'from: email:emailServiceConfig.'from,
                    subject: emailSubject,
                    template: content
                });
        if emailResponse is error {
            log:printError("Error occurred while sending the email!", emailResponse);
        }

        return http:OK;
    }

    # Deletes a comment from the database.
    #
    # + commentId - Comment ID
    # + commentPayload - Comment payload data
    # + return - Success or error responses
    resource function delete comments/[int commentId](http:RequestContext ctx,
            types:UpdateCommentPayload commentPayload)
        returns http:Ok|http:BadRequest|http:NotFound|http:Forbidden|http:InternalServerError {

        if commentPayload.commentId != commentId {
            log:printError(constants:COMMENT_ID_MISMATCH_ERROR, 
                pathCommentId = commentId, payloadCommentId = commentPayload.commentId);
            return http:BAD_REQUEST;
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: constants:GET_USER_ROLE_ERROR
            };
        }

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        string customEmailError = "Error while fetching user email.";
        if userEmail is error {
            log:printError(customEmailError, userEmail);
            return <http:InternalServerError>{
                body: customEmailError
            };
        }

        types:CommentData|error? commentDataResult = database:getCommentData(commentId, userEmail);
        string customCommentDataError = "Error while fetching comment data";
        if commentDataResult is error {
            log:printError(customCommentDataError, commentDataResult);
            return <http:InternalServerError>{
                body: {"message": customCommentDataError}
            };
        }

        boolean isAdmin = authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups);

        if commentDataResult is () {
            if !isAdmin {
                log:printError("Unauthorized: not owner or comment not found", commentId = commentId,
                    userEmail = userEmail);
                return http:FORBIDDEN;
            }
        } else {
            types:CommentData commentData = <types:CommentData>commentDataResult;
            if !isAdmin {
                time:Utc now = time:utcNow();
                decimal ageSeconds = time:utcDiffSeconds(now, commentData.createdOn);
                if ageSeconds > 3600d {
                    log:printError("Delete window expired (over 1h)", commentId = commentId, userEmail = userEmail);
                    return http:FORBIDDEN;
                }
            }
        }

        int|error? result = database:deleteComment(commentPayload, userEmail);

        if result is error || result == () {
            string customDeleteError = "Error while deleting comment";
            log:printError(customDeleteError, result);
            return <http:InternalServerError>{
                body: {"message": customDeleteError}
            };
        }
        if result == 0 {
            return http:NOT_FOUND;
        }

        types:ContentResponseById|error? contentResponse = database:getContentDetailById(commentPayload.contentId);
        string customContentError = "Error while fetching content details";
        if contentResponse is error {
            log:printError(customContentError, contentResponse);
            return <http:InternalServerError>{
                body: {
                    "message": customContentError
                }
            };
        }
        if contentResponse is () {
            string notFoundError = "Content not found.";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {
                    message: notFoundError
                }
            };
        }

        string emailSubject = string `[${appName}] ${contentResponse.description} Comment Activity`;

        string renderedTemplate = renderAppName(email:commentNotificationTemplate, appName);

        string|error content = email:bindKeyValues(renderedTemplate,
                {
                    "EMAIL_BODY": string `This comment has been <b>deleted</b> from a content in the 
                    ${appName} application.`,
                    "COMMENT": commentPayload.comment,
                    "USER_EMAIL": userEmail,
                    "CONTENT_NAME": contentResponse.description,
                    "SHAREABLE_LINK": string `${frontendBaseUrl}${contentResponse.routePath}?sectionId=${
                    contentResponse.sectionId}&contentId=${commentPayload.contentId}`
                }
        );

        if content is error {
            string customError = "Error with email template!";
            log:printError(customError, content);
            return <http:InternalServerError>{
                body: {
                    "message": customError
                }
            };
        }
        error? emailResponse = email:sendEmail(
                {
                    to: email:emailServiceConfig.to,
                    'from: email:emailServiceConfig.'from,
                    subject: emailSubject,
                    template: content
                });
        if emailResponse is error {
            log:printError("Error occurred while sending the email !", emailResponse);
        }

        return http:OK;
    }

    # Create a new custom button.
    #
    # + ctx - Request context
    # + button - Custom button payload
    # + return - Success or error responses
    resource function post custom\-buttons(http:RequestContext ctx, database:CustomButtonCreatePayload button)
        returns http:Created|http:BadRequest|http:Forbidden|http:InternalServerError {

        string customerErr = "Failed to get user roles";
        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(customerErr, userGroups);
            return <http:InternalServerError>{
                body: customerErr
            };
        }
        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        if button.contentId == "" || button.action == "" || button.actionValue == ()
        || button.actionValue == "" {
            log:printError(constants:EMPTY_FIELDS_ERROR);
            return http:BAD_REQUEST;
        }

        int|error result = database:addCustomButton(button);
        if result is error {
            string customError = "Error while adding custom button!";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        return http:CREATED;
    }

    # Get all custom buttons for a content.
    #
    # + ctx - Request context
    # + contentId - Content ID
    # + return - Custom buttons or error responses
    resource function get contents/[string contentId]/custom\-buttons(http:RequestContext ctx)
        returns database:CustomButton[]|http:InternalServerError {

        database:CustomButton[]|error result = database:getCustomButtons(contentId);
        if result is error {
            string customError = "Error while fetching custom buttons!";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        return result;
    }

    # Update a custom button.
    #
    # + ctx - Request context
    # + buttonId - Button ID
    # + return - Success or error responses
    resource function patch contents/[int buttonId]/custom\-buttons(http:RequestContext ctx,
            database:CustomButtonUpdatePayload button)
        returns http:Ok|http:BadRequest|http:NotFound|http:Conflict|http:Forbidden|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            string customError = "Failed to get user roles";
            log:printError(customError, userGroups);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }
        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        database:CustomButton|error? customButton = database:getCustomButton(buttonId);
        if customButton is error {
            string customError = "Error while fetching the custom button!";
            log:printError(customError, customButton);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        if customButton is () {
            string notFoundError = "Custom button not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {
                    message: notFoundError
                }
            };
        }

        int|error? updateErr = database:updateCustomButton(buttonId, button);
        if updateErr is error || updateErr is () {
            string updateError = "Error while updating the custom button!";
            log:printError(updateError, updateErr);
            return <http:InternalServerError>{
                body: {message: updateError}
            };
        }
        if updateErr == 0 {
            return http:NOT_FOUND;
        }

        return http:OK;
    }

    # Delete a custom button.
    #
    # + ctx - Request context
    # + buttonId - Button ID
    # + return - Success or error responses
    resource function delete custom\-buttons/[int buttonId](http:RequestContext ctx)
        returns http:Ok|http:Forbidden|http:NotFound|http:BadRequest|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            string customError = "Failed to get user roles";
            log:printError(customError, userGroups);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }
        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        database:CustomButton|error? customButton = database:getCustomButton(buttonId);
        if customButton is error {
            string fetchError = "Error while fetching the custom button!";
            log:printError(fetchError, customButton);
            return <http:InternalServerError>{
                body: {message: fetchError}
            };
        }
        if customButton is () {
            string notFoundError = "Custom button not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }

        int|error? result = database:deleteCustomButton(buttonId);
        if result is error || result == () {
            string customError = "Error while deleting custom button!";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }
        if result == 0 {
            return http:NOT_FOUND;
        }

        return http:OK;
    }

    # Get trending contents.
    #
    # + ctx - Request context
    # + return - Trending contents or error
    resource function get trending\-contents(http:RequestContext ctx)
        returns types:ContentResponse[]|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            return <http:InternalServerError>{body: constants:GET_USER_ID_ERROR};
        }
        string[]|error trendingContentNames = analytics:processTrendingContents();
        if trendingContentNames is error {
            string customError = "Error while processing trending contents";
            log:printError(customError, trendingContentNames);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if trendingContentNames.length() == 0 {
            return [];
        }

        types:ContentResponse[]|error result = database:getTrendingContents(userEmail, trendingContentNames);

        if result is error {
            string customError = "Error while fetching trending contents";
            log:printError(customError, result);
            return <http:InternalServerError>{body: {message: customError}};
        }

        return result;
    }

    # Get public visible testimonials.
    #
    # + ctx - Request context
    # + return - Visible testimonials or error
    resource function get testimonials(http:RequestContext ctx)
        returns database:CustomerTestimonial[]|http:InternalServerError {

        database:CustomerTestimonial[]|error result = database:getAllTestimonials();
        if result is error {
            string customError = "Error while fetching testimonials";
            log:printError(customError, result);
            return <http:InternalServerError>{body: {message: customError}};
        }

        return result;
    }

    # Create a new customer testimonial (admin only).
    #
    # + ctx - Request context
    # + testimonial - Testimonial create payload
    # + return - Success or error
    resource function post testimonials(http:RequestContext ctx, database:CustomerTestimonialCreatePayload testimonial)
        returns http:Created|http:BadRequest|http:Forbidden|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{body: {message: constants:GET_USER_ROLE_ERROR}};
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{body: {message: constants:GET_USER_ID_ERROR}};
        }

        int|error result = database:createTestimonial(testimonial, userEmail);
        if result is error {
            string customError = "Error while creating testimonial";
            log:printError(customError, result);
            return <http:InternalServerError>{body: {message: customError}};
        }

        return http:CREATED;
    }

    # Update a customer testimonial (admin only).
    #
    # + ctx - Request context
    # + id - Testimonial ID
    # + testimonial - Testimonial update payload
    # + return - Success or error
    resource function patch testimonials/[int id](http:RequestContext ctx,
            database:CustomerTestimonialUpdatePayload testimonial)
            returns http:Ok|http:NotFound|http:Forbidden|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{body: {message: constants:GET_USER_ROLE_ERROR}};
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{body: {message: constants:GET_USER_ID_ERROR}};
        }

        database:CustomerTestimonial|error? testimonials = database:getTestimonialById(id);
        if testimonials is error {
            string customError = "Error while checking testimonials existence";
            log:printError(customError, testimonials);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if testimonials is () {
            return http:NOT_FOUND;
        }

        int|error? result = database:updateTestimonial(id, testimonial, userEmail);
        if result is error || result is () {
            string customError = "Error while updating testimonial";
            log:printError(customError, result);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if result == 0 {
            return http:NOT_FOUND;
        }

        return http:OK;
    }

    # Delete a customer testimonial (admin only).
    #
    # + ctx - Request context
    # + id - Testimonial ID
    # + return - Success or error
    resource function delete testimonials/[int id](http:RequestContext ctx)
        returns http:Ok|http:NotFound|http:Forbidden|http:InternalServerError {

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{body: {message: constants:GET_USER_ROLE_ERROR}};
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return http:FORBIDDEN;
        }

        database:CustomerTestimonial|error? testimonials = database:getTestimonialById(id);
        if testimonials is error {
            string customError = "Error while checking testimonial existence";
            log:printError(customError, testimonials);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if testimonials is () {
            return http:NOT_FOUND;
        }

        int|error? result = database:deleteTestimonialById(id);
        if result is error || result is () {
            string customError = "Error while deleting testimonial";
            log:printError(customError, result);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if result == 0 {
            return http:NOT_FOUND;
        }

        return http:OK;
    }
    
    # Get quizzes for the logged-in user. 
    #
    # + ctx - Request context
    # + return - Quiz list or error response
    resource function get users/me/quizzes(http:RequestContext ctx)
        returns database:Quiz[]|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        int|error? userId = database:getUserIdByUserEmail(userEmail);
        if userId is error {
            log:printError(constants:GET_USER_ID_ERROR, userId);
            return <http:InternalServerError>{
                body: {message: "Error fetching user ID"}
            };
        }

        if userId is () {
            return [];
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        database:Quiz[]|error result = database:getQuizzes(userId);
        if result is error {
            string customError = "Error while fetching quizzes";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        string|error offsetHeaderVal = ctx.getWithType(authorization:REQUESTED_BY_USER_TIMEZONE_OFFSET);
        string? offsetHeader = offsetHeaderVal is string ? offsetHeaderVal : ();

        foreach database:Quiz quiz in result {
            string|error converted = database:formatDueDateWithOffset(quiz.dueDate, offsetHeader);
            if converted is string {
                quiz.dueDate = converted;
            }
        }

        return result;
    }

    # Get all quizzes for admins.
    #
    # + ctx - Request context
    # + req - HTTP request
    # + return - Quiz list or error response
    resource function get quizzes(http:RequestContext ctx, http:Request req)
        returns database:Quiz[]|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        int|error? userId = database:getUserIdByUserEmail(userEmail);
        if userId is error {
            log:printError(constants:GET_USER_ID_ERROR, userId);
            return <http:InternalServerError>{
                body: {message: "Error fetching user ID"}
            };
        }

        if userId is () {
            return [];
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        database:Quiz[]|error result = database:getQuizzes();
        if result is error {
            string customError = "Error while fetching quizzes";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        string|error offsetHeaderVal = ctx.getWithType(authorization:REQUESTED_BY_USER_TIMEZONE_OFFSET);
        string? offsetHeader = offsetHeaderVal is string ? offsetHeaderVal : ();

        foreach database:Quiz quiz in result {
            string|error converted = database:formatDueDateWithOffset(quiz.dueDate, offsetHeader);
            if converted is string {
                quiz.dueDate = converted;
            }
        }

        return result;
    }

    # Create a quiz (admin only).
    #
    # + ctx - Request context
    # + quiz - Quiz payload
    # + return - Created, forbidden, or error response
    resource function post quizzes(http:RequestContext ctx, database:QuizCreatePayload quiz)
        returns http:Created|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        int|error result = database:createQuiz(quiz, userEmail);
        if result is error {
            string customError = "Error while creating quiz";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        return http:CREATED;
    }

    # Update a quiz (admin only).
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + payload - Update payload
    # + return - OK, not found, bad request, forbidden, or error response
    resource function patch quizzes/[int quizId](http:RequestContext ctx, database:QuizUpdatePayload payload)
        returns http:InternalServerError|http:BadRequest|http:NotFound|http:Ok|http:Forbidden {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        database:QuizStatus|error currentStatus = database:getQuizStatus(quizId);
        if currentStatus is error {
            string customError = "Error while fetching quiz status";
            log:printError(customError, currentStatus);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        // Block publishing if the target quiz is overdue
        if payload.status != () && payload.status.toString() == "PUBLISHED" {
            database:Quiz|error completeQuiz = database:getQuizById(quizId);
            if completeQuiz is database:Quiz {
                string? dueDateStr = completeQuiz.dueDate;
                if dueDateStr is string && dueDateStr.trim() != "" {
                    time:Utc|error dueUtc = time:utcFromString(dueDateStr);
                    if dueUtc is time:Utc {
                        decimal diff = time:utcDiffSeconds(dueUtc, time:utcNow());
                        if diff < 0d {
                            return <http:BadRequest>{
                                body: {message: "Cannot publish an overdue quiz. Please update the due date first."}
                            };
                        }
                    }
                }
            }
        }

        // If PUBLISHED — only allow status changes in the payload, block everything else
        if currentStatus.toString() == database:PUBLISHED {
            boolean hasOtherFields =
                    payload.title != () ||
                    payload.description != () ||
                    payload.thumbnail != () ||
                    payload.passingScore != () ||
                    payload.dueDate != () ||
                    payload.questions != ();

            if hasOtherFields {
                return <http:BadRequest>{
                    body: {message: "Cannot edit a published quiz."}
                };
            }
        }

        int|error? result = database:updateQuiz(quizId, payload, userEmail);
        if result is error || result is () {
            string customError = "Error while updating quiz";
            log:printError(customError, result);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if result == 0 {
            string notFoundError = "Quiz not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }

        return http:OK;
    }

    # Assign users to a quiz.
    # Newly assigned users are notified by email.
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + payload - User assignment payload
    # + return - OK, not found, forbidden, or error response
    resource function post quizzes/[int quizId]/assignees(http:RequestContext ctx,
            database:AssignUsersPayload payload)
        returns http:Ok|http:NotFound|http:Forbidden|http:InternalServerError|http:BadRequest {

        // OPTIMIZATION: Extracting pre-decoded user profile claims from the context.
        // Replaces the legacy, blocking external GraphQL HR service call (entity:getEmployee)
        authorization:UserProfile|error userProfile = ctx.getWithType(authorization:REQUESTED_BY_USER_PROFILE);
        if userProfile is error {
            log:printError(constants:GET_USER_PROFILE_ERROR, userProfile);
            return <http:InternalServerError> { 
                body: constants:USER_PROFILE_READ_ERROR
            };
        }

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        int[]|error currentAssignedUserIds = database:getAssignedUserIds(quizId);
        if currentAssignedUserIds is error {
            string customError = "Error fetching current assigned users";
            log:printError(customError, currentAssignedUserIds);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        entity:Employee employeeInfo = {
            workEmail: userEmail,
            firstName: userProfile.firstName,
            lastName: userProfile.lastName,
            department: userProfile.department,
            team: userProfile.team,
            subTeam: userProfile.subTeam,
            employeeThumbnail: userProfile.employeeThumbnail
        };


        int[] assignedUserIds = currentAssignedUserIds;
        int[] newlyAssignedUserIds = payload.userIds.filter(userId => assignedUserIds.indexOf(userId) is ());
        int|error? result = database:assignUsersToQuiz(quizId, payload.userIds, userEmail);
        if result is error || result is () {
            string customError = "Error while assigning users to quiz";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        if result == 0 {
            string notFoundError = "Quiz not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }

        // Notify NEWLY assigned users
        if newlyAssignedUserIds.length() > 0 {
            database:Quiz|error quizDetails = database:getQuizById(quizId);
            if quizDetails is database:Quiz {
                foreach int userId in newlyAssignedUserIds {
                    types:User|error? user = database:getUserById(userId);
                    if user is types:User {
                        string userEmailAddress = user.email;
                        string emailSubject = string `${appName}: New Quiz - ${quizDetails.title}`;
                        string renderedTemplate = renderAppName(email:quizAssignmentTemplate, appName);
                        string timeLimitText = string `${payload.timeLimitMinutes} mins`;
                        string dueDateText = quizDetails.dueDate;
                        if dueDateText.length() >= 10 {
                            dueDateText = dueDateText.substring(0, 10);
                        }

                        string|error content = email:bindKeyValues(renderedTemplate,
                            {
                                "USER_NAME": string `${user.firstName}`,
                                "QUIZ_TITLE": quizDetails.title,
                                "DUE_DATE": dueDateText,
                                "TIME_LIMIT": timeLimitText,
                                "ASSIGNED_BY": employeeInfo.firstName + " " + employeeInfo.lastName,
                                "QUIZ_LINK": string `${frontendBaseUrl}/my-board?quizId=${quizId}`
                            });

                        if content is string {
                            error? emailResponse = email:sendEmail({
                                to: [userEmailAddress],
                                'from: email:emailServiceConfig.'from,
                                subject: emailSubject,
                                template: content
                            });
                            if emailResponse is error {
                                log:printError("Error sending quiz assignment email to " + userEmailAddress, emailResponse);
                            }
                        }
                    }
                }
            } else {
                log:printError("Error fetching quiz details", quizDetails);
            }
        }

        return http:OK;
    }

    # Get all answers for a quiz (admin and user view).
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + isAdmin - Whether the user is requesting as an admin
    # + return - Answer list or error response
    resource function get quizzes/[int quizId]/answers(http:RequestContext ctx, boolean isAdmin = false)
            returns database:Answer[]|database:AnswerPublic[]|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if isAdmin {
            if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
                log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
                return <http:Forbidden>{body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}};
            }

            database:Answer[]|error result = database:getAnswersByQuizId(quizId);
            if result is error {
                string customError = "Error while fetching answers";
                log:printError(customError, result);
                return <http:InternalServerError>{body: {message: customError}};
            }

            return result;

        } else {
            
            database:AnswerPublic[]|error result = database:getAnswersByQuizIdPublic(quizId);
            if result is error {
                string customError = "Error while fetching answers";
                log:printError(customError, result);
                return <http:InternalServerError>{body: {message: customError}};
            }

            return result;
        }
    }

    # Unassign users from a quiz.
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + payload - User unassignment payload
    # + return - OK, not found, forbidden, or error response
    resource function delete quizzes/[int quizId]/assignees(http:RequestContext ctx,
            database:UnassignUsersPayload payload)
        returns http:Ok|http:NotFound|http:Forbidden|http:InternalServerError|http:BadRequest {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        int[]|error currentAssignedUserIds = database:getAssignedUserIds(quizId);
        if currentAssignedUserIds is error {
            string customError = "Error fetching current assigned users";
            log:printError(customError, currentAssignedUserIds);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        int[] remainingUserIds = [];
        foreach int assignedUserId in currentAssignedUserIds {
            boolean shouldRemove = false;
            foreach int userId in payload.userIds {
                if userId == assignedUserId {
                    shouldRemove = true;
                    break;
                }
            }

            if !shouldRemove {
                remainingUserIds.push(assignedUserId);
            }
        }

        int|error? result = database:assignUsersToQuiz(quizId, remainingUserIds, userEmail);
        if result is error || result is () {
            string customError = "Error while unassigning users from quiz";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        if result == 0 {
            string notFoundError = "Quiz not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }

        return http:OK;
    }

    # Delete a quiz (admin only).
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + return - OK, not found, forbidden, or error response
    resource function delete quizzes/[int quizId](http:RequestContext ctx)
        returns http:Ok|http:NotFound|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        int|error? result = database:deleteQuiz(quizId);
        if result is error || result is () {
            string customError = "Error while deleting quiz";
            log:printError(customError, result);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if result == 0 {
            string notFoundError = "Quiz not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }

        return http:OK;
    }

    # Get all questions for a quiz.
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + return - Question list or error response
    resource function get quizzes/[int quizId]/questions(http:RequestContext ctx)
        returns database:Question[]|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        database:Question[]|error result = database:getQuestionsByQuizId(quizId);
        if result is error {
            string customError = "Error while fetching questions";
            log:printError(customError, result);
            return <http:InternalServerError>{body: {message: customError}};
        }

        return result;
    }

    # Create a question (admin only).
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + payload - Question payload
    # + return - Created, forbidden, or error response
    resource function post quizzes/[int quizId]/questions(http:RequestContext ctx,
            database:QuestionCreatePayload payload)
        returns http:Created|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        int|error result = database:createQuestion(quizId, payload, userEmail);
        if result is error {
            string customError = "Error while creating question";
            log:printError(customError, result);
            return <http:InternalServerError>{body: {message: customError}};
        }

        return http:CREATED;
    }

    # Update a question (admin only).
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + questionId - Question ID
    # + payload - Update payload
    # + return - OK, not found, forbidden, or error response
    resource function patch quizzes/[int quizId]/questions/[int questionId](http:RequestContext ctx,
            database:QuestionUpdatePayload payload)
        returns http:Ok|http:NotFound|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        database:Question|error? question = database:getQuestionById(questionId);
        if question is error {
            string customError = "Error while fetching question";
            log:printError(customError, question);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if question is () || question.quizId != quizId {
            string notFoundError = "Question not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }

        int|error? result = database:updateQuestion(questionId, payload, userEmail);
        if result is error || result is () {
            string customError = "Error while updating question";
            log:printError(customError, result);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if result == 0 {
            string notFoundError = "Question not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }
        return http:OK;
    }

    # Delete a question (admin only).
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + questionId - Question ID
    # + return - OK, not found, forbidden, or error response
    resource function delete quizzes/[int quizId]/questions/[int questionId](http:RequestContext ctx)
        returns http:Ok|http:NotFound|http:Forbidden|http:BadRequest|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        database:Question|error? question = database:getQuestionById(questionId);
        if question is error {
            string customError = "Error while fetching question";
            log:printError(customError, question);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if question is () || question.quizId != quizId {
            string notFoundError = "Question not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }

        database:QuizStatus|error currentStatus = database:getQuizStatus(quizId);
        if currentStatus is error {
            string customError = "Error while fetching quiz status";
            log:printError(customError, currentStatus);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        int|error? result = database:deleteQuestion(questionId);
        if result is error || result is () {
            string customError = "Error while deleting question";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        if result == 0 {
            string notFoundError = "Question not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }

        return http:OK;
    }

    # Create an answer option (admin only).
    #
    # + ctx - Request context
    # + questionId - Question ID
    # + payload - Answer payload
    # + return - Created, forbidden, or error response
    resource function post questions/[int questionId]/answers(http:RequestContext ctx, database:AnswerPayload payload)
        returns http:Created|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        int|error result = database:createAnswer(questionId, payload, userEmail);
        if result is error {
            string customError = "Error while creating answer";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        return http:CREATED;
    }

    # Update an answer option (admin only).
    #
    # + ctx - Request context
    # + questionId - Question ID
    # + answerId - Answer ID
    # + payload - Update payload
    # + return - OK, not found, forbidden, or error response
    resource function patch questions/[int questionId]/answers/[int answerId](http:RequestContext ctx,
            database:UpdateAnswerPayload payload)
        returns http:Ok|http:NotFound|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        database:Answer|error? answer = database:getAnswerById(answerId);
        if answer is error {
            string customError = "Error while fetching answer";
            log:printError(customError, answer);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if answer is () || answer.questionId != questionId {
            string notFoundError = "Answer not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }

        int|error? result = database:updateAnswer(answerId, payload, userEmail);
        if result is error || result is () {
            string customError = "Error while updating answer";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        if result == 0 {
            string notFoundError = "Answer not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }

        return http:OK;
    }

    # Delete an answer option (admin only).
    #
    # + ctx - Request context
    # + questionId - Question ID
    # + answerId - Answer ID
    # + return - OK, not found, forbidden, or error response
    resource function delete questions/[int questionId]/answers/[int answerId](http:RequestContext ctx)
        returns http:Ok|http:NotFound|http:Forbidden|http:BadRequest|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        database:Answer|error? answer = database:getAnswerById(answerId);
        if answer is error {
            string customError = "Error while fetching answer";
            log:printError(customError, answer);
            return <http:InternalServerError>{body: {message: customError}};
        }

        if answer is () || answer.questionId != questionId {
            string notFoundError = "Answer not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }

        database:QuizStatus|error? currentStatus = database:getQuizStatusByAnswerId(answerId);
        if currentStatus is database:PUBLISHED {
            string errorMessage = "Published quizzes cannot be modified!";
            return <http:BadRequest>{
                body: {message: errorMessage}
            };

        } else if currentStatus is error {
            string customError = "Error while fetching quiz status";
            log:printError(customError, currentStatus);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        int|error? result = database:deleteAnswer(answerId);
        if result is error || result is () {
            string customError = "Error while deleting answer";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        if result == 0 {
            string notFoundError = "Answer not found!";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }
        return http:OK;
    }

    # Submit answers for a quiz.
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + answers - Submitted answers
    # + return - OK or error response
    resource function post quizzes/[int quizId]/submissions(http:RequestContext ctx,
            database:UserAnswerPayload[] answers) returns http:Ok|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        int|error? userId = database:getUserIdByUserEmail(userEmail);
        if userId == () {
            string notFoundError = "User not found";
            log:printError(notFoundError);
            return <http:InternalServerError>{
                body: {message: notFoundError}
            };
        }

        if userId is error {
            string customError = "Error fetching user ID";
            log:printError(customError, userId);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        int[]|error assignedIds = database:getAssignedUserIds(quizId);
        if assignedIds is error || assignedIds.indexOf(userId) is () {
            string forbiddenError = "You are not assigned to this quiz";
            log:printError(forbiddenError);
            return <http:Forbidden>{
                body: {message: forbiddenError}
            };
        }

        int|error result = database:submitQuizAnswers(quizId, userId, answers);
        if result is error {
            string customError = "Error while submitting quiz";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        return http:OK;
    }

    # Get the calling user's result for a quiz.
    # Includes submitted answers with correctness and ref_links only if the user failed.
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + return - Quiz result, not found, or error response
    resource function get quizzes/[int quizId]/results/me(http:RequestContext ctx)
        returns database:QuizResult|http:NotFound|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        database:QuizResult|error? result = database:getUserQuizResult(quizId, userEmail);
        if result is () {
            string notFoundError = "No submission found for this user";
            log:printError(notFoundError);
            return <http:NotFound>{
                body: {message: notFoundError}
            };
        }
        if result is error {
            string customError = "Error while fetching quiz result";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        return result;
    }

    # Get per-user summary analytics for a quiz (admin only).
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + return - Analytics list, forbidden, or error response
    resource function get quizzes/[int quizId]/analytics(http:RequestContext ctx)
        returns database:UserQuizAnalytics[]|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        database:UserQuizAnalytics[]|error result = database:getQuizAnalytics(quizId);
        if result is error {
            string customError = "Error while fetching analytics";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        return result;
    }

    # Get a specific user's submitted answers for a quiz (admin-only).
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + userId - User ID
    # + return - Drill-down data, forbidden, or error response
    resource function get quizzes/[int quizId]/submissions/[int userId](http:RequestContext ctx)
        returns database:UserAnswerDrillDown|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }

        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        database:SubmittedAnswer[]|error answers = database:getUserSubmittedAnswers(quizId, userId);
        if answers is error {
            string customError = "Error while fetching user answers";
            log:printError(customError, answers);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        database:UserFeedback|error? feedback = database:getUserFeedback(quizId, userId);
        if feedback is error {
            string customError = "Error while fetching user feedback";
            log:printError(customError, feedback);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        return {answers: answers, feedback: feedback};
    }

    # Get all feedback submissions for a quiz (admin only).
    #
    # + ctx - Request context
    # + quizId - Quiz ID
    # + return - Feedback list, forbidden, or error response
    resource function get quizzes/[int quizId]/feedback(http:RequestContext ctx)
        returns database:Feedback[]|http:Forbidden|http:InternalServerError {

        string|error userEmail = ctx.getWithType(authorization:REQUESTED_BY_USER_EMAIL);
        if userEmail is error {
            log:printError(constants:GET_USER_ID_ERROR, userEmail);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ID_ERROR}
            };
        }

        string[]|error userGroups = ctx.getWithType(authorization:REQUESTED_BY_USER_ROLES);
        if userGroups is error {
            log:printError(constants:GET_USER_ROLE_ERROR, userGroups);
            return <http:InternalServerError>{
                body: {message: constants:GET_USER_ROLE_ERROR}
            };
        }
        
        if !authorization:hasPermission([authorization:authorizedRoles.adminRole], userGroups) {
            log:printError(constants:UNAUTHORIZED_ACCESS_ERROR);
            return <http:Forbidden>{
                body: {message: constants:UNAUTHORIZED_ACCESS_ERROR}
            };
        }

        database:Feedback[]|error result = database:getAllFeedbackForQuiz(quizId);
        if result is error {
            string customError = "Error while fetching feedback";
            log:printError(customError, result);
            return <http:InternalServerError>{
                body: {message: customError}
            };
        }

        return result;
    }

    # Validates an external URL for security, availability, and embed layout safety.
    #
    # + url - The target website link sent as a query parameter from the React frontend
    # + return - Returns a 200 OK containing the link analysis report, or a 400 Bad Request if syntax is invalid
    resource function get verify\-preview(string url) returns types:PreviewStatusResponse|http:BadRequest {

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            return <http:BadRequest>{
                body: { message: "Invalid scheme layout. URL must start with http:// or https://" }
            };
        }

        http:Client|error targetClient = new (url, {
            timeout: 15.0
        });

        if targetClient is error {
            return <types:PreviewStatusResponse>{
                body: { status: "BROKEN", reason: "Client Initialization Failure (ClientInitializationError)" }
            };
        }

        http:Response|error response = targetClient->head("");

        if response is error {
            response = targetClient->get("");
        } else if (response.statusCode == 405 || response.statusCode == 400) {
            response = targetClient->get("");
        }

        if response is error {
            if response is http:IdleTimeoutError {
                return <types:PreviewStatusResponse>{
                    body: { status: "BROKEN", reason: "InitializationInboundConnectTimeoutError - Remote Host Offline (Timeout)" }
                };
            } else {
                return <types:PreviewStatusResponse>{
                    body: { status: "BROKEN", reason: "RemoteConnectError/Network Error: " + response.message() }
                };
            }
        }

        int statusCode = response.statusCode;
        if (statusCode == 404) {
            return <types:PreviewStatusResponse>{
                body: { status: "BROKEN", reason: "Resource Path Not Found (404)" }
            };
        } 
        else if (statusCode >= 500) {
            return <types:PreviewStatusResponse>{
                body: { status: "BROKEN", reason: "Target Application Code Crashed (500)" }
            };
        } 
        else if (statusCode >= 400) {
            return <types:PreviewStatusResponse>{
                body: { status: "BROKEN", reason: "Unexpected Server Status: " + statusCode.toString() }
            };
        }

        string|error xFrameOptions = response.getHeader("X-Frame-Options");
        if xFrameOptions is string {
            string upperHeader = xFrameOptions.toUpperAscii();
            if (upperHeader == "DENY" || upperHeader == "SAMEORIGIN") {
                return <types:PreviewStatusResponse>{
                    body: { status: "RESTRICTED", reason: "Embedding blocked via X-Frame-Options: " + xFrameOptions }
                };
            }
        }

        string|error csp = response.getHeader("Content-Security-Policy");
        if csp is string {
            if (csp.includes("frame-ancestors")) {
                return <types:PreviewStatusResponse>{
                    body: { status: "RESTRICTED", reason: "Embedding restricted via Content-Security-Policy rules" }
                };
            }
        }

        return <types:PreviewStatusResponse>{
            body: { status: "SUCCESS", reason: "URL is healthy and safe to embed" }
        };
    }
}
