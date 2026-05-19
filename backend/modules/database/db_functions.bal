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

import pitstop.entity;
import pitstop.types;

import ballerina/log;
import ballerina/sql;

# Get a user by their user ID.
#
# + userId - User ID
# + return - User or error if not found
public isolated function getUserById(int userId) returns types:User|error? {
    types:User|error result = dbClient->queryRow(getUserByIdQuery(userId));
    return result is sql:NoRowsError ? () : result;
}

# Create a route path.
#
# + route - Route details
# + return - Sql error if any
public isolated function addRoutePath(RoutePayload route) returns error? {
    _ = check dbClient->execute(addRoutePathQuery(route));
}

# Get all routes.
#
# + return - Route list or errorreturn results;
public isolated function getAllRoutesFlat() returns types:Route[]|error {
    stream<types:Route, sql:Error?> resultStream = dbClient->query(getAllRoutesFlatQuery());
    return from types:Route result in resultStream
        select result;
}

# Add a new content that can be either section content or route content.
#
# + createdBy - Created by user email
# + content - Content details
# + return - Error or nil
public isolated function addContent(types:ContentPayload content, string createdBy) returns error? {
    _ = check dbClient->execute(addContentQuery(content, createdBy));
}

# Verify the presence of content.
#
# + contentLink - Link to navigate to the content
# + contentType - Type of the content
# + sectionId - Section ID of the content
# + contentId - Content ID of the content
# + routeId - Route ID of the content
# + return - Whether content exists or error
public isolated function checkContentExists(string? contentLink = (), string? contentType = (), int? sectionId = (),
        int? contentId = (), int? routeId = ()) returns boolean|error? {

    int|error result = dbClient->queryRow(getContentIdQuery(contentLink, contentType, sectionId, contentId, routeId));

    if result is error {
        if result is sql:NoRowsError {
            // This function handles a POST request. Error logging is intentionally omitted for this operation.
            return;
        }
        return result;
    }
    return true;
}

# Verify the presence of section.
#
# + title - Section title
# + routeId - Route ID of the section
# + sectionId - Section ID of the section 
# + return - Whether section exists or error
public isolated function checkSectionExists(string? title = (), int? routeId = (), int? sectionId = ())
    returns boolean|error? {
    int|error result = dbClient->queryRow(getSectionIdQuery(title, routeId, sectionId));

    if result is error {
        if result is sql:NoRowsError {
            // This function handles a POST request. Error logging is intentionally omitted for this operation.
            return;
        }
        return result;
    }
    return true;
}

# Add a new comment.
#
# + comment - Comment details
# + return - Error or nil
public isolated function addComment(types:Comment comment) returns error? {
    _ = check dbClient->execute(addCommentQuery(comment));
}

# Get contents by section ID or route ID using a unified query.
#
# + isUser - Whether the requester is from a normal user
# + 'limit - Number of records to retrieve
# + 'offset - Number of records to offset
# + sectionId - Section ID
# + routeId - Route ID
# + userEmail - User email
# + return - Contents or error
public isolated function getContents(boolean isUser, int 'limit, int 'offset, int? sectionId = (), int? routeId = (),
        string? userEmail = ()) returns types:ContentResponse[]|error {

    types:ContentResponse[] contents = [];
    stream<ContentResponse, sql:Error?> resultStream = dbClient->query(
        getContentsQuery(isUser, sectionId, routeId, userEmail, 'limit, 'offset));

    check from ContentResponse {customContentTheme, tags, ...contentRest} in resultStream
        do {
            types:ContentResponse convertedContent = check transformContentResponse(customContentTheme, tags,
                    {...contentRest});
            contents.push(convertedContent);
        };

    return contents;
}

# Delete content under a given ID.
#
# + contentId - Content ID
# + return - Error or nil
public isolated function deleteContentById(int contentId) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(deleteContentByIdQuery(contentId));
    return result.affectedRowCount;
}

# Delete section under a given ID.
#
# + sectionId - Section ID
# + return - Error or nil
public isolated function deleteSectionById(int sectionId) returns int|error? {
    int? rowCount = ();
    transaction {
        sql:ExecutionResult result = check dbClient->execute(deleteSectionsQuery(sectionId));
        rowCount = result.affectedRowCount;

        if rowCount is int && rowCount > 0 {
            _ = check dbClient->execute(deleteContentsBySectionIdQuery(sectionId));
            check commit;
        } else {
            rollback;
        }
    }
    return rowCount;
}

# Add like to a content.
#
# + likeContent - Like details
# + return - Error or nil
public isolated function addLike(types:LikeContent likeContent) returns error? {
    _ = check dbClient->execute(addLikeQuery(likeContent));
}

# Get all users who liked a content.
#
# + contentId - Content ID
# + return - Array of LikeResponse or error
public isolated function getLikes(int contentId) returns types:LikeResponse[]|error {
    stream<types:LikeResponse, sql:Error?> resultStream = dbClient->query(getLikesQuery(contentId));
    return from types:LikeResponse liker in resultStream
        select liker;
}

# Delete route path and corresponding sections of a given route ID.
#
# + routeId - Route ID
# + return - Error or nil
public isolated function deleteRoute(int routeId) returns int|error? {
    int? rowCount = ();
    transaction {
        sql:ExecutionResult res = check dbClient->execute(deleteRoutesQuery(routeId));
        rowCount = res.affectedRowCount;

        if rowCount is int && rowCount > 0 {
            _ = check dbClient->execute(deleteSectionsByRouteIdQuery(routeId));
            check commit;
        } else {
            rollback;
        }
    }
    return rowCount;
}

# Update route.
#
# + routeId - Route ID
# + updateRoutePayload - New route details
# + return - Error or nil
public isolated function updateRoute(int routeId, types:UpdateRoutePayload updateRoutePayload) returns int|error? {
    sql:ParameterizedQuery[] queries = updateRouteQuery(routeId, updateRoutePayload);
    int totalAffectedRows = 0;

    transaction {
        if updateRoutePayload.routePath is string {
            sql:ExecutionResult childResult = check dbClient->execute(
                updateChildRoutePathsQuery(routeId, <string>updateRoutePayload.routePath)
            );
            int? childRows = childResult.affectedRowCount;
            if childRows is int {
                totalAffectedRows += childRows;
            }
        }

        foreach sql:ParameterizedQuery query in queries {
            sql:ExecutionResult result = check dbClient->execute(query);
            int? rowCount = result.affectedRowCount;

            if rowCount is int {
                totalAffectedRows += rowCount;
            }
        }
        check commit;
    }

    return totalAffectedRows;
}

# Get route details of a given path.
#
# + routeId - Route ID
# + return - Route details or error
public isolated function getRouteById(int routeId) returns types:Route|error? {
    types:Route|error result = dbClient->queryRow(getRouteByIdQuery(routeId));

    if result is error {
        if result is sql:NoRowsError {
            log:printError("No route found", routeId = routeId);
            return;
        }
    }
    return result;
}

# Get basic information of a page.
#
# + routePath - Route path
# + return - Page details or error
public isolated function getPageDetails(string routePath) returns types:PageResponse|error? {
    PageResponse|error result = dbClient->queryRow(getPageDataQuery(routePath));

    if result is error {
        if result is sql:NoRowsError {
            log:printError("Page not found", routePath = routePath);
            return;
        }
        return result;
    }

    PageResponse {customPageTheme, routeId, ...pageRest} = result;
    types:CustomTheme? convertedTheme = ();

    if customPageTheme is () {
    } else {
        types:CustomTheme convertedCustomPageTheme = check customPageTheme.fromJsonStringWithType();
        convertedTheme = convertedCustomPageTheme;
    }

    types:ContentResponse[]|error routeContents = getContents(false, DEFAULT_CONTENTS_LIMIT,
            DEFAULT_CONTENTS_OFFSET, (), routeId, "");
    if routeContents is error {
        log:printWarn("Could not fetch route contents", routeId = routeId);
        return {...pageRest, routeId: routeId, customPageTheme: convertedTheme, routeContents: []};
    }

    return {...pageRest, routeId: routeId, customPageTheme: convertedTheme, routeContents: routeContents};
}

# Update content.
#
# + contentId - Content ID 
# + updateContentPayload - New content details
# + userEmail - Email of the user for last verified by / updated by
# + return - Error or nil
public isolated function updateContent(int contentId, types:UpdateContentPayload updateContentPayload, string userEmail)
    returns int?|error {

    sql:ParameterizedQuery[] queries = updateContentQuery(contentId, updateContentPayload, userEmail);
    int totalAffectedRows = 0;

    transaction {
        foreach sql:ParameterizedQuery query in queries {
            sql:ExecutionResult result = check dbClient->execute(query);
            int? rowCount = result.affectedRowCount;

            if rowCount is int {
                totalAffectedRows += rowCount;
            }
        }
        check commit;
    }

    return totalAffectedRows;
}

# Get section data using section ID.
#
# + sectionId - Section ID
# + return - Section data or error
public isolated function getSectionById(int sectionId) returns types:SectionPayload|error? {
    types:SectionPayload|error result = dbClient->queryRow(getSectionByIdQuery(sectionId));

    if result is error {
        if result is sql:NoRowsError {
            log:printError("No section found", sectionId = sectionId);
            return;
        }
    }
    return result;
}

# Update section.
#
# + sectionId - Section ID
# + updateSectionPayload - New section details
# + return - Error or nil
public isolated function updateSection(int sectionId, types:UpdateSectionPayload updateSectionPayload)
    returns int|error? {

    sql:ParameterizedQuery[] queries = updateSectionQuery(sectionId, updateSectionPayload);
    int totalAffectedRows = 0;

    transaction {
        foreach sql:ParameterizedQuery query in queries {
            sql:ExecutionResult result = check dbClient->execute(query);
            int? rowCount = result.affectedRowCount;

            if rowCount is int {
                totalAffectedRows += rowCount;
            }
        }
        check commit;
    }

    return totalAffectedRows;
}

# Get section data of a given route path.
#
# + routePath - Route path
# + 'limit - Number of records to retrieve
# + 'offset - Number of records to offset
# + userEmail - User email to show pinned content section
# + return - Section id list or error
public isolated function getSectionByRoutePath(int 'limit, int 'offset, string? routePath, string? userEmail = ())
    returns types:Section[]|error {

    types:Section[] sections = [];

    stream<Section, sql:Error?> resultStream = dbClient->query(getSectionByRoutePathQuery('limit, 'offset, routePath));

    check from Section {customSectionTheme, ...sectionRest} in resultStream
        do {
            types:Section convertedSection = check transformSectionResponse(customSectionTheme, {...sectionRest});
            sections.push(convertedSection);
        };

    return sections;

}

# Add a new section.
#
# + section - Section details
# + return - Error or nil
public isolated function addSection(types:SectionPayload section) returns error? {
    _ = check dbClient->execute(addSectionQuery(section));
}

# Get user ID using user email.
#
# + userEmail - User_email
# + return - User ID or error 
public isolated function getUserIdByUserEmail(string userEmail) returns int|error? {
    int|error result = dbClient->queryRow(getUserIdQuery(userEmail));

    if result is error {
        if result is sql:NoRowsError {
            log:printError("User not found");
            return;
        }
        return result;
    }
    return result;
}

# Add a new user.
#
# + user - User details
# + return - Error or nil
public isolated function addUser(entity:Employee user) returns error? {
    _ = check dbClient->execute(addUserQuery(user));
}

# Get comments by content ID.
#
# + contentId - Content ID
# + return - Comments or error
public isolated function getCommentsByContentId(int contentId) returns types:CommentResponse[]|error {
    stream<types:CommentResponse, sql:Error?> resultStream = dbClient->query(
        getCommentsByContentIdQuery(contentId));
    return from types:CommentResponse result in resultStream
        select result;
}

# Get all the contents that contains a particular text.
#
# + userInput - User input
# + userEmail - User email
# + return - Contents or error
public isolated function getContentsByText(string userInput, string userEmail)
    returns types:ContentResponse[]|error {

    types:ContentResponse[] contents = [];
    string text = "%" + userInput + "%";

    ContentFilter filter = {
        userEmail,
        mode: TEXT,
        text,
        'limit: DEFAULT_CONTENTS_LIMIT,
        'offset: DEFAULT_CONTENTS_OFFSET
    };

    stream<ContentResponse, sql:Error?> resultStream = dbClient->query(searchContentsQuery(filter));

    check from ContentResponse {customContentTheme, tags, ...contentRest} in resultStream
        do {
            types:ContentResponse convertedContent = check transformContentResponse(customContentTheme, tags,
                    {...contentRest});
            contents.push(convertedContent);
        };
    return contents;
}

# Get all content that contains a particular tag/s.
#
# + inputTags - Input tags
# + userEmail - User email
# + return - Contents or error
public isolated function getContentsByTags(string[] inputTags, string userEmail)
    returns types:ContentResponse[]|error {

    types:ContentResponse[] contents = [];

    ContentFilter filter = {
        userEmail,
        mode: TAGS,
        tags: inputTags,
        'limit: DEFAULT_CONTENTS_LIMIT,
        'offset: DEFAULT_CONTENTS_OFFSET
    };

    stream<ContentResponse, sql:Error?> resultStream = dbClient->query(searchContentsQuery(filter));

    check from ContentResponse {customContentTheme, tags, ...contentRest} in resultStream
        do {
            types:ContentResponse convertedContent = check transformContentResponse(customContentTheme, tags,
                    {...contentRest});
            contents.push(convertedContent);
        };
    return contents;
}

# Get content details for content report.
#
# + return - Content or error
public isolated function getContentDetails() returns types:ContentReport[]|error {
    stream<types:ContentReport, sql:Error?> resultStream = dbClient->query(getContentDetailsQuery());
    return from types:ContentReport result in resultStream
        select result;
}

# Get content title by content id.
#
# + contentId - content id
# + return - content description
public isolated function getContentDetailById(int contentId) returns types:ContentResponseById|error? {
    types:ContentResponseById|error result = dbClient->queryRow(getContentDetailsByIdQuery(contentId));

    if result is error {
        if result is sql:NoRowsError {
            log:printError("No content found", contentId = contentId);
            return;
        }
    }
    return result;
}

# Get all tags.
#
# + return - Tags or error
public isolated function getAllTags() returns types:TagResponse[]|error {
    stream<types:TagResponse, error?> resultStream = dbClient->query(getAllTagsQuery());
    return from types:TagResponse result in resultStream
        select result;
}

# Add a new tag.
#
# + tag - Tag details
# + return - Error or nil
public isolated function addTag(types:TagPayload tag) returns error? {
    _ = check dbClient->execute(addTagQuery(tag));
}

# Delete a Tag.
# + tagName - Tag details
# + return - Error or nil
public isolated function deleteTag(string tagName) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(deleteTagQuery(tagName));
    return result.affectedRowCount;
}

# Reparent routes to a new parent route.
#
# + payload - Route reparenting payload
# + return - Error or nil
public isolated function reparentRoutes(types:ReParentRoutesPayload payload) returns error? {
    transaction {
        sql:ParameterizedQuery[] reparentQueries = from int routeId in payload.routeIds
            select reparentRoutesQuery(payload.newParentId, routeId);

        _ = check dbClient->batchExecute(reparentQueries);
        check commit;
    }
}

# Updates the text of an existing comment in the database.
#
# + payload - Update comment details
# + updatedBy - Email of the user who updated the comment
# + return - Error or nil
public isolated function updateComment(types:UpdateCommentPayload payload, string updatedBy) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(updateCommentQuery(payload, updatedBy));
    return result.affectedRowCount;
}

# Deletes a comment from the database.
#
# + payload - Update comment details
# + updatedBy - Email of the user who deleted the comment
# + return - Error or nil
public isolated function deleteComment(types:UpdateCommentPayload payload, string updatedBy) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(deleteCommentQuery(payload, updatedBy));
    return result.affectedRowCount;
}

# Get comment data for a given comment ID and email.
#
# + commentId - parameter description  
# + email - parameter description
# + return - return value description
public isolated function getCommentData(int commentId, string email) returns types:CommentData|error? {
    types:CommentData|error result = dbClient->queryRow(getCommentDataQuery(commentId, email));

    if result is error {
        if result is sql:NoRowsError {
            log:printError("Comment data not found", commentId = commentId, email = email);
            return;
        }
    }
    return result;
}

# Add a new custom button.
#
# + button - Custom button create payload
# + return - Error 
public isolated function addCustomButton(CustomButtonCreatePayload button) returns int|error {
    sql:ExecutionResult result = check dbClient->execute(addCustomButtonQuery(button));
    return result.lastInsertId.ensureType(int);
}

# Get all custom buttons for a content.
#
# + contentId - Content ID
# + return - Custom button list or error
public isolated function getCustomButtons(string contentId) returns CustomButton[]|error {
    stream<CustomButton, sql:Error?> resultStream = dbClient->query(getCustomButtonsQuery(contentId));
    return from CustomButton result in resultStream
        select result;
}

# Update a custom button.
#
# + id - Custom button ID
# + button - Custom button update payload
# + return - Error or nil
public isolated function updateCustomButton(int id, CustomButtonUpdatePayload button) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(updateCustomButtonQuery(id, button));
    return result.affectedRowCount;
}

# Delete a custom button.
#
# + buttonId - Button ID
# + return - Error or nil
public isolated function deleteCustomButton(int buttonId) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(deleteCustomButtonQuery(buttonId));
    return result.affectedRowCount;
}

# Check if a custom button exists.
#
# + buttonId - Button ID
# + return - Whether button exists or error
public isolated function getCustomButton(int buttonId) returns CustomButton|error? {
    CustomButton|error result = dbClient->queryRow(getCustomButtonByIdQuery(buttonId));

    if result is error {
        if result is sql:NoRowsError {
            log:printError("Custom button not found", buttonId = buttonId);
            return;
        }
    }
    return result;
}

# Get recent content created within the last month.
#
# + userEmail - User email
# + 'limit - Number of records to retrieve
# + 'offset - Number of records to offset
# + return - Recent contents or error
public isolated function getRecentContents(string userEmail, int 'limit, int 'offset)
    returns types:ContentResponse[]|error {

    types:ContentResponse[] contents = [];
    stream<ContentResponse, sql:Error?> resultStream = dbClient->query(
        getRecentContentsQuery(userEmail, 'limit, 'offset));

    check from ContentResponse {customContentTheme, tags, ...contentRest} in resultStream
        do {
            types:ContentResponse convertedContent = check transformContentResponse(customContentTheme, tags,
                    {...contentRest});
            contents.push(convertedContent);
        };

    return contents;
}

# Pin or update pin timestamp for a content.
#
# + pinContents - Pin details
# + return - Error or nil
public isolated function pinContents(types:PinContents pinContents) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(pinContentsQuery(pinContents));
    return result.affectedRowCount;
}

# Unpin a content.
#
# + pinContents - Pin details
# + return - Error or nil
public isolated function unpinContents(types:PinContents pinContents) returns error? {
    _ = check dbClient->execute(unpinContentsQuery(pinContents));
}

# Get pinned content for a user.
#
# + userEmail - User email
# + 'limit - Number of records to retrieve
# + 'offset - Number of records to offset
# + return - Pinned contents or error
public isolated function getPinnedContents(string userEmail, int 'limit, int 'offset)
    returns types:ContentResponse[]|error {

    types:ContentResponse[] contents = [];
    stream<PinnedContentResponse, sql:Error?> resultStream = dbClient->query(
        getPinnedContentsQuery(userEmail, 'limit, 'offset));

    check from PinnedContentResponse row in resultStream
        do {
            types:ContentResponse|error converted = toContentResponseFromPinned(row);
            if converted is error {
                return converted;
            }
            contents.push(converted);
        };

    return contents;
}

# Check if user has any pinned content.
#
# + userEmail - User email
# + return - Boolean indicating if user has pinned content or error
public isolated function hasPinnedContent(string userEmail) returns boolean|error {
    stream<ContentIdResponse, sql:Error?> resultStream = dbClient->query(getPinnedContentIdsQuery(userEmail));

    ContentIdResponse[] ids = check from ContentIdResponse id in resultStream
        select id;
    return ids.length() > 0;
}

# Get trending contents from the database.
#
# + userEmail - User email 
# + names - Names of trending contents
# + return - Array of ContentResponse or error
public isolated function getTrendingContents(string userEmail, string[] names)
    returns types:ContentResponse[]|error {

    if names.length() == 0 {
        log:printDebug("No trending content names provided, returning empty result", userEmail = userEmail);
        return [];
    }

    types:ContentResponse[] contents = [];

    ContentFilter filter = {
        userEmail,
        mode: TRENDING,
        trendingDescriptions: names,
        'limit: DEFAULT_TRENDING_CONTENTS_LIMIT,
        'offset: DEFAULT_TRENDING_CONTENTS_OFFSET
    };

    stream<ContentResponse, sql:Error?> resultStream = dbClient->query(searchContentsQuery(filter));

    check from ContentResponse {customContentTheme, tags, ...rest} in resultStream
        do {
            types:ContentResponse item = check transformContentResponse(customContentTheme, tags, {...rest});
            contents.push(item);
        };

    return contents;
}

# Get content based on tags from user's pinned content.
#
# + userEmail - User email
# + 'limit - Number of records to retrieve
# + 'offset - Number of records to offset
# + return - Suggested contents or error
public isolated function getSuggestionsFromPinnedContents(string userEmail, int 'limit, int 'offset)
    returns types:ContentResponse[]|error {

    types:ContentResponse[] contents = [];
    stream<ContentResponse, sql:Error?> resultStream = dbClient->query(
        getSuggestedContentsQuery(userEmail, 'limit, 'offset));

    check from ContentResponse {customContentTheme, tags, ...contentRest} in resultStream
        do {
            types:ContentResponse convertedContent = check transformContentResponse(customContentTheme, tags,
                    {...contentRest});
            contents.push(convertedContent);
        };
    return contents;
}

# Get contents by tags and keywords. 
#
# + userEmail - User email
# + tags - Tags to search for
# + searchedKeywords - Keywords to search in description/note
# + 'limit - Number of records to retrieve
# + 'offset - Number of records to offset
# + return - Contents or error
public isolated function getContentsByTagsAndKeywords(string userEmail, string[] tags, string[] searchedKeywords,
        int 'limit, int 'offset) returns types:ContentResponse[]|error {

    types:ContentResponse[] contents = [];

    ContentFilter filter = {
        userEmail,
        mode: TAGS_AND_KEYWORDS,
        tags,
        keywords: searchedKeywords
    };

    stream<ContentResponse, sql:Error?> resultStream = dbClient->query(searchContentsQuery(filter));

    check from ContentResponse {customContentTheme, tags: contentTags, ...contentRest} in resultStream
        do {
            types:ContentResponse convertedContent = check transformContentResponse(customContentTheme, contentTags,
                    {...contentRest});
            contents.push(convertedContent);
        };

    return contents;
}

# Get suggested contents for a user based on their recent activity.
#
# + userEmail - User email
# + searchedKeywords - Keywords searched by the user
# + viewedContentNames - Names of contents recently viewed by the user
# + 'limit - Number of records to retrieve
# + 'offset - Number of records to offset
# + return - Suggested contents or error
public isolated function getSuggestionsFromRecentActivity(string userEmail, string[] searchedKeywords,
        string[] viewedContentNames, int 'limit, int 'offset) returns types:ContentResponse[]|error {

    log:printDebug("Fetched analytics data", searchedKeywords = searchedKeywords,
            viewedContentNames = viewedContentNames);

    if searchedKeywords.length() == 0 && viewedContentNames.length() == 0 {
        log:printDebug("No recent activity from analytics");
        return getSuggestionsFromPinnedContents(userEmail, 'limit, 'offset);
    }

    types:ContentResponse[] viewedBasedContents = check getViewedContents(userEmail, viewedContentNames);
    string[] uniqueTags = extractUniqueTags(viewedBasedContents);
    types:ContentResponse[] relatedContents = check getRelatedContents(userEmail, uniqueTags, searchedKeywords, 'limit);

    return mergeAndDeduplicateContents(viewedBasedContents, relatedContents, userEmail, 'limit);
}

# Get contents based on viewed content names.
#
# + userEmail - User email
# + viewedContentNames - Names of viewed contents
# + return - Viewed based contents or error
isolated function getViewedContents(string userEmail, string[] viewedContentNames)
    returns types:ContentResponse[]|error {

    if viewedContentNames.length() == 0 {
        log:printDebug("No viewed content names provided, returning empty result", userEmail = userEmail);
        return [];
    }

    types:ContentResponse[] contents = [];

    ContentFilter filter = {
        userEmail,
        mode: TRENDING,
        trendingDescriptions: viewedContentNames
    };

    stream<ContentResponse, sql:Error?> resultStream = dbClient->query(searchContentsQuery(filter));

    check from ContentResponse {customContentTheme, tags, ...rest} in resultStream
        do {
            types:ContentResponse item = check transformContentResponse(customContentTheme, tags, {...rest});
            contents.push(item);
        };

    log:printDebug("Viewed based contents fetched", count = contents.length());
    return contents;
}

# Get all customer testimonials (admin view).
#
# + return - Array of testimonials or error
public isolated function getAllTestimonials() returns CustomerTestimonial[]|error {
    stream<CustomerTestimonial, sql:Error?> resultStream = dbClient->query(getAllTestimonialsQuery());
    return from CustomerTestimonial result in resultStream
        select result;
}

# Create a new customer testimonial.
#
# + testimonial - Testimonial create payload
# + createdBy - User email who created
# + return - Inserted testimonial ID or error
public isolated function createTestimonial(CustomerTestimonialCreatePayload testimonial, string createdBy)
    returns int|error {

    sql:ExecutionResult result = check dbClient->execute(createTestimonialQuery(testimonial, createdBy));
    return result.lastInsertId.ensureType(int);
}

# Update a customer testimonial.
#
# + id - Testimonial ID
# + testimonial - Testimonial update payload
# + updatedBy - User email who updated
# + return - Affected row count or error
public isolated function updateTestimonial(int id, CustomerTestimonialUpdatePayload testimonial, string updatedBy)
    returns int|error? {

    sql:ExecutionResult result = check dbClient->execute(updateTestimonialQuery(id, testimonial, updatedBy));
    return result.affectedRowCount;
}

# Delete a customer testimonial.
#
# + id - Testimonial ID
# + return - Affected row count or error
public isolated function deleteTestimonialById(int id) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(deleteTestimonialQuery(id));
    return result.affectedRowCount;
}

# Get testimonial by ID.
#
# + id - Testimonial ID
# + return - Testimonial or error
public isolated function getTestimonialById(int id) returns CustomerTestimonial|error? {
    CustomerTestimonial|error result = dbClient->queryRow(getTestimonialByIdQuery(id));

    if result is error {
        if result is sql:NoRowsError {
            log:printError("Testimonial not found", id = id);
            return;
        }
    }
    return result;
}

# Get quizzes for admin or a specific user.
#
# + userId - Optional User ID. When provided, returns only that user's quizzes.
# + return - Array of quizzes or error
public isolated function getQuizzes(int? userId = ()) returns Quiz[]|error {
    stream<Quiz, sql:Error?> resultStream = dbClient->query(getQuizzesQuery(userId));
    return from Quiz result in resultStream
        select result;
}

# Create a new quiz with questions and answers.
# 
# + quiz - Quiz create payload
# + createdBy - User email who created
# + return - Inserted quiz ID or error
public isolated function createQuiz(QuizCreatePayload quiz, string createdBy) returns int|error {
    return createQuizWithQuestionsAndAnswers(quiz, createdBy);
}

# Update an existing quiz with questions and answers.
# 
# + quizId - Quiz ID
# + payload - Quiz update payload
# + updatedBy - User email who updated
# + return - Affected row count or error
public isolated function updateQuiz(int quizId, QuizUpdatePayload payload, string updatedBy) returns int|error? {
    return updateQuizWithQuestionsAndAnswers(quizId, payload, updatedBy);
}

# Assign users to a quiz.
# 
# + quizId - Quiz ID
# + userIds - Array of user IDs to assign
# + updatedBy - User email who updated
# + return - Affected row count or error
public isolated function assignUsersToQuiz(int quizId, int[] userIds, string updatedBy) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(assignUsersToQuizQuery(quizId, userIds, updatedBy));
    return result.affectedRowCount;
}

# Delete a quiz along with its questions, answers, and user assignments.
# 
# + quizId - Quiz ID
# + return - Affected row count or error
public isolated function deleteQuiz(int quizId) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(deleteQuizQuery(quizId));
    return result.affectedRowCount;
}

# Get quiz title by quiz ID.
#
# + quizId - Quiz ID
# + return - Quiz title or error
public isolated function getQuizTitle(int quizId) returns string|error {
    Quiz result = check dbClient->queryRow(getQuizByIdQuery(quizId));
    return result.title;
}

# Get a quiz by its ID.
# + quizId - Quiz ID
# + return - Quiz record or error
public isolated function getQuizById(int quizId) returns Quiz|error {
    Quiz result = check dbClient->queryRow(getQuizByIdQuery(quizId));
    return result;
}

# Get assigned user IDs for a quiz.
# + quizId - Quiz ID
# + return - Array of assigned user IDs or error
public isolated function getAssignedUserIds(int quizId) returns int[]|error {
    QuizAssignedUserIds|error result = dbClient->queryRow(getAssignedUserIdsQuery(quizId));
    if result is error {
        return result;
    }
    json? assigned = result.assignedUserIds;
    if assigned is json[] {
        return from var item in assigned
            select check item.ensureType(int);
    }
    return [];
}

# Get questions and answers for a quiz.
# + quizId - Quiz ID
# + return - Array of questions with answers or error
public isolated function getQuestionsByQuizId(int quizId) returns Question[]|error {
    stream<Question, sql:Error?> resultStream = dbClient->query(getQuestionsByQuizIdQuery(quizId));
    return from Question result in resultStream
        select result;
}

# Get public questions (without correct answer) for a quiz.
# + quizId - Quiz ID
# + payload - Additional payload if needed for fetching public questions
# + createdBy - User email who is fetching the questions
# + return - Array of public questions or error
public isolated function createQuestion(int quizId, QuestionCreatePayload payload, string createdBy) returns int|error {
    sql:ExecutionResult result = check dbClient->execute(createQuestionQuery(quizId, payload, createdBy));
    return result.lastInsertId.ensureType(int);
}

# Update a question.
# + questionId - Question ID
# + payload - Question update payload
# + updatedBy - User email who updated the question
# + return - Affected row count or error
public isolated function updateQuestion(int questionId, QuestionUpdatePayload payload, string updatedBy) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(updateQuestionQuery(questionId, payload, updatedBy));
    return result.affectedRowCount;
}

# Delete a question along with its answers.
# + questionId - Question ID
# + return - Affected row count or error
public isolated function deleteQuestion(int questionId) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(deleteQuestionQuery(questionId));
    return result.affectedRowCount;
}

# Get answers for a question.
# + questionId - Question ID
# + return - Array of answers or error
public isolated function getAnswersByQuestionId(int questionId) returns Answer[]|error {
    stream<Answer, sql:Error?> resultStream = dbClient->query(getAnswersByQuestionIdQuery(questionId));
    return from Answer result in resultStream
        select result;
}

# Get public answers (without correct answer) for a question.
# + questionId - Question ID
# + return - Array of public answers or error
public isolated function getAnswersByQuestionIdPublic(int questionId) returns AnswerPublic[]|error {
    stream<AnswerPublic, sql:Error?> resultStream = dbClient->query(getAnswersByQuestionIdPublicQuery(questionId));
    return from AnswerPublic result in resultStream
        select result;
}

# Get answers for a quiz.
# + quizId - Quiz ID
# + return - Array of answers or error
public isolated function getAnswersByQuizId(int quizId) returns Answer[]|error {
    stream<Answer, sql:Error?> resultStream = dbClient->query(getAnswersByQuizIdQuery(quizId));
    return from Answer result in resultStream
        select result;
}

# Get public answers (without correct answer) for a quiz.
# + quizId - Quiz ID
# + return - Array of public answers or error
public isolated function getAnswersByQuizIdPublic(int quizId) returns AnswerPublic[]|error {
    stream<AnswerPublic, sql:Error?> resultStream = dbClient->query(getAnswersByQuizIdPublicQuery(quizId));
    return from AnswerPublic result in resultStream
        select result;
}


# Create a new answer for a question.
# + questionId - Question ID
# + payload - Answer create payload
# + createdBy - User email who created the answer
# + return - Inserted answer ID or error
public isolated function createAnswer(int questionId, AnswerPayload payload, string createdBy) returns int|error {
    sql:ExecutionResult result = check dbClient->execute(createAnswerQuery(questionId, payload, createdBy));
    return result.lastInsertId.ensureType(int);
}

# Update an answer.
# + answerId - Answer ID
# + payload - Answer update payload
# + updatedBy - User email who updated the answer
# + return - Affected row count or error
public isolated function updateAnswer(int answerId, UpdateAnswerPayload payload, string updatedBy) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(updateAnswerQuery(answerId, payload, updatedBy));
    return result.affectedRowCount;
}

# Delete an answer.
# + answerId - Answer ID
# + return - Affected row count or error
public isolated function deleteAnswer(int answerId) returns int|error? {
    sql:ExecutionResult result = check dbClient->execute(deleteAnswerQuery(answerId));
    return result.affectedRowCount;
}

# Submit quiz answers for a user.
# + quizId - Quiz ID
# + userId - User ID
# + answers - Array of user answers to submit
# + return - Quiz result or error
public isolated function submitQuizAnswers(int quizId, int userId, UserAnswerPayload[] answers) returns int|error {
    return submitUserAnswersWithFeedback(quizId, userId, answers);
}

# Get quiz result for a user.
# + quizId - Quiz ID
# + userEmail - User email
# + return - Quiz result or error
public isolated function getUserQuizResult(int quizId, string userEmail) returns QuizResult|error {
    return buildQuizResultWithTransformations(quizId, userEmail);
}

# Get quiz analytics for a quiz.
# + quizId - Quiz ID
# + return - Array of user quiz analytics or error
public isolated function getQuizAnalytics(int quizId) returns UserQuizAnalytics[]|error {
    stream<UserQuizAnalytics, sql:Error?> resultStream = dbClient->query(getQuizAnalyticsQuery(quizId));
    return from UserQuizAnalytics result in resultStream
        select result;
}

#  Get submitted answers for a user in a quiz.
# + quizId - Quiz ID
# + userId - User ID
# + return - Array of submitted answers or error
public isolated function getUserSubmittedAnswers(int quizId, int userId) returns SubmittedAnswer[]|error {
    stream<record {}, sql:Error?> resultStream = dbClient->query(getUserSubmittedAnswersQuery(quizId, userId));
    return transformRawAnswersToSubmittedAnswers(resultStream);
}

# Get user feedback for a quiz.
# + quizId - Quiz ID
# + userId - User ID
# + return - User feedback or error
public isolated function getUserFeedback(int quizId, int userId) returns QuizFeedback|error? {
    QuizFeedback|error result = dbClient->queryRow(getUserFeedbackQuery(quizId, userId));
    if result is error {
        if result is sql:NoRowsError {
            return ();
        }
        return result;
    }
    return result;
}

# Get all feedback for a quiz (admin view).
# + quizId - Quiz ID
# + return - Array of quiz feedback or error
public isolated function getAllFeedbackForQuiz(int quizId) returns QuizFeedbackAdmin[]|error {
    stream<QuizFeedbackAdmin, sql:Error?> resultStream = dbClient->query(getAllFeedbackForQuizQuery(quizId));
    return from QuizFeedbackAdmin result in resultStream
        select result;
}

# Get quiz status for a quiz.
# + quizId - Quiz ID
# + return - Quiz status or error
public isolated function getQuizStatus(int quizId) returns string|error {
    Quiz result = check dbClient->queryRow(getQuizByIdQuery(quizId));
    return result.status;
}

# Get quiz status for a question ID.
# + questionId - Question ID
# + return - Quiz status or error
public isolated function getQuizStatusByQuestionId(int questionId) returns string|error {
    record { int quiz_id; } quizIdRow = check dbClient->queryRow(getQuizStatusByQuestionIdQuery(questionId));
    int quizId = quizIdRow.quiz_id;
    Quiz quiz = check dbClient->queryRow(getQuizByIdQuery(quizId));
    return quiz.status;
}

# Get quiz status for an answer ID.
# + answerId - Answer ID
# + return - Quiz status, no rows, or error
public isolated function getQuizStatusByAnswerId(int answerId) returns string|error? {
    record { int quiz_id; }|sql:Error quizIdResult = dbClient->queryRow(getQuizStatusByAnswerIdQuery(answerId));
    if quizIdResult is error {
        if quizIdResult is sql:NoRowsError {
            return ();
        }
        return quizIdResult;
    }
    record { int quiz_id; } quizIdRow = quizIdResult;
    int quizId = quizIdRow.quiz_id;
    Quiz quiz = check dbClient->queryRow(getQuizByIdQuery(quizId));
    return quiz.status;
}
