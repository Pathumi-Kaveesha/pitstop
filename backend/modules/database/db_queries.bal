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

import ballerina/sql;

# Create a route path.
#
# + route - Route details
# + return - SQL parameterized query
isolated function addRoutePathQuery(RoutePayload route) returns sql:ParameterizedQuery => `
    INSERT INTO 
        route (parent_id, label, thumbnail, description, title, menu_item, styling_info)
    VALUES (
        ${route.parentId},
        ${route.label},
        ${route.thumbnail},
        ${route.description},
        ${route.title},
        ${route.menuItem},
        ${route.customPageTheme.toJsonString()}
    );
`;

# Query to get user by ID.
#
# + userId - User ID
# + return - SQL parameterized query
isolated function getUserByIdQuery(int userId) returns sql:ParameterizedQuery => `
    SELECT
        user_id AS userId,
        email,
        thumbnail,
        first_name AS firstName,
        last_name AS lastName
    FROM user
    WHERE user_id = ${userId}
`;

# Query to get all routes in a flat structure.
#
# + return - SQL parameterized query
isolated function getAllRoutesFlatQuery() returns sql:ParameterizedQuery =>
`
    SELECT 
        route_id, 
        parent_id, 
        route_path, 
        menu_item, 
        route_order, 
        title, 
        thumbnail, 
        description, 
        isVisible,
        isRouteVisible
     FROM 
        route
     WHERE 
        is_deleted = false
     ORDER BY parent_id, route_order
`;

# Query to update child route paths when a route path is updated.
#
# + routeId - Route ID of the updated route
# + newPath - New path of the updated route
# + return - SQL parameterized query
isolated function updateChildRoutePathsQuery(int routeId, string newPath) returns sql:ParameterizedQuery =>
`
    UPDATE
        route
    SET
        route_path = CONCAT(
            (CASE WHEN ${newPath} = '/' THEN '' ELSE ${newPath} END),
            SUBSTRING(
                route_path,
                LENGTH((
                    SELECT old_path FROM (
                        SELECT CASE WHEN route_path = '/' THEN '' ELSE route_path END AS old_path
                        FROM route
                        WHERE route_id = ${routeId}
                          AND is_deleted = false
                    ) AS r
                )) + 1
            )
        )
    WHERE
        route_path LIKE CONCAT(
            (
                SELECT old_path FROM (
                    SELECT CASE WHEN route_path = '/' THEN '' ELSE route_path END AS old_path
                    FROM route
                    WHERE route_id = ${routeId}
                      AND is_deleted = false
                ) AS r2
            ),
            '/%'
        )
        AND is_deleted = false
`;

# Query to update route.
#
# + routeId - Route ID to update
# + payload - Route data to change
# + return - SQL parameterized query
isolated function updateRouteQuery(int? routeId, types:UpdateRoutePayload payload)
    returns sql:ParameterizedQuery[] {

    sql:ParameterizedQuery[] sqlQueries = [];

    //Normal field updates 
    if payload.title is string {
        sqlQueries.push(`title = ${payload.title}`);
    }

    if payload.description is string {
        sqlQueries.push(`description = ${payload.description}`);
    }

    if payload.thumbnail is string {
        sqlQueries.push(`thumbnail = ${payload.thumbnail}`);
    }

    if payload.menuItem is string {
        sqlQueries.push(`menu_item = ${payload.menuItem}`);
    }

    if payload.isVisible is boolean {
        sqlQueries.push(`isVisible = ${payload.isVisible}`);
    }

    if payload.customPageTheme is types:CustomTheme {
        sqlQueries.push(`styling_info = ${payload.customPageTheme.toJsonString()}`);
    }

    if payload.isRouteVisible is boolean {
        sqlQueries.push(`isRouteVisible = ${payload.isRouteVisible}`);
    }

    if payload.label is string {
        sqlQueries.push(`label = ${payload.label}`);
    }

    if payload.routePath is string {
        sqlQueries.push(`route_path = ${payload.routePath}`);
    }

    //Reordering
    sql:ParameterizedQuery? reorderClause = ();
    sql:ParameterizedQuery[] reorderIds = [];
    var reorderRoutes = payload.reorderRoutes;

    if reorderRoutes is types:ReorderRouteItem[] && reorderRoutes.length() > 0 {
        sql:ParameterizedQuery[] caseWhen = [];
        foreach var route in reorderRoutes {
            caseWhen.push(`WHEN route_id = ${route.routeId} THEN ${route.routeOrder} `);
            reorderIds.push(`${route.routeId}`);
        }
        caseWhen.push(` END`);
        reorderClause = sql:queryConcat(`route_order = CASE `, ...caseWhen);
    }

    if sqlQueries.length() == 0 && reorderClause is () {
        sql:ParameterizedQuery[] emptyResult = [];
        emptyResult.push(`SELECT 0 WHERE FALSE`);
        return emptyResult;
    }

    sql:ParameterizedQuery[] queries = [];

    if sqlQueries.length() > 0 && routeId is int {
        sql:ParameterizedQuery fieldQuery = `UPDATE route SET `;
        boolean isFirst = true;

        foreach var clause in sqlQueries {
            if !isFirst {
                fieldQuery = sql:queryConcat(fieldQuery, `, `);
            }
            fieldQuery = sql:queryConcat(fieldQuery, clause);
            isFirst = false;
        }

        if payload.isRouteVisible is boolean {
            fieldQuery = sql:queryConcat(fieldQuery, ` 
        WHERE (route_id = ${routeId} OR parent_id = ${routeId}) AND is_deleted = false`);
        } else {
            fieldQuery = sql:queryConcat(fieldQuery, ` 
        WHERE route_id = ${routeId} AND is_deleted = false`);
        }
        queries.push(fieldQuery);
    }

    if reorderClause is sql:ParameterizedQuery {
        sql:ParameterizedQuery reorderQuery = `UPDATE route SET `;
        reorderQuery = sql:queryConcat(reorderQuery, reorderClause);

        sql:ParameterizedQuery idList = reorderIds[0];
        foreach int i in 1 ..< reorderIds.length() {
            idList = sql:queryConcat(idList, `, `, reorderIds[i]);
        }

        reorderQuery = sql:queryConcat(reorderQuery, ` 
        WHERE route_id IN (`, idList, `) AND is_deleted = false`);
        queries.push(reorderQuery);
    }

    if queries.length() == 0 {
        queries.push(`SELECT 0 WHERE FALSE`);
    }

    return queries;
}

# Query to add a unified content (section or route content).
#
# + content - Content payload (with either sectionId or routeId)
# + createdBy - User email who created the content
# + return - SQL parameterized query
isolated function addContentQuery(types:ContentPayload content, string createdBy)
    returns sql:ParameterizedQuery => `
        INSERT INTO content(
            section_id, 
            route_id,
            content_link, 
            content_type, 
            content_sub_type,
            description, 
            thumbnail, 
            styling_info, 
            is_deleted, 
            created_by, 
            updated_by, 
            last_verified_by,
            note,
            tags,
            is_reused
        ) 
        VALUES (
            ${content.sectionId}, 
            ${content.routeId},
            ${content.contentLink}, 
            ${content.contentType},
            ${content.contentSubtype},
            ${content.description}, 
            ${content.thumbnail}, 
            ${(content.customContentTheme is types:CustomTheme) ? content.customContentTheme.toJsonString() : ()},
            ${content.isDeleted}, 
            ${createdBy}, 
            ${createdBy}, 
            ${createdBy},
            ${content.note},
            ${content.tags},
            ${content.isReused}
        )
    `;

# Query to add comment.
#
# + comment - Comment details
# + return - SQL parameterized query
isolated function addCommentQuery(types:Comment comment) returns sql:ParameterizedQuery => `
    INSERT INTO 
        comment(content_id, comment, user_id, is_deleted)
    VALUES(
        ${comment.contentId},
        ${comment.comment},
        ${comment.userId},
        false
    )
`;

# Query to get content ID for given content details.
#
# + contentLink - Link of the content
# + contentType - Type of the content
# + contentId - Content ID of the content
# + sectionId - Section ID of the content
# + routeId - Route ID of the content
# + return - SQL parameterized query
isolated function getContentIdQuery(string? contentLink, string? contentType, int? sectionId, int? contentId,
        int? routeId = ())
    
    returns sql:ParameterizedQuery {

    sql:ParameterizedQuery query = `
        SELECT
            content_id
        FROM
            content
        WHERE
            is_deleted = false
    `;

    if contentId is int {
        return sql:queryConcat(query, ` AND content_id = ${contentId}`);
    } else if contentType is string && contentLink is string && sectionId is int {
        return sql:queryConcat(query, ` AND content_type = ${contentType} 
            AND content_link = ${contentLink} 
            AND section_id = ${sectionId}`
            );
    } else if contentType is string && contentLink is string && routeId is int {
        return sql:queryConcat(query, ` AND content_type = ${contentType} 
            AND content_link = ${contentLink} 
            AND route_id = ${routeId}`
            );
    }
    return query;
}

# Query to get section ID for given section details.
#
# + title - Title of the section
# + routeId - Route ID of the content
# + sectionId - Route ID of the section
# + return - SQL parameterized query
isolated function getSectionIdQuery(string? title, int? routeId, int? sectionId) returns sql:ParameterizedQuery {
    sql:ParameterizedQuery query = `
        SELECT 
            section_id 
        FROM 
            section 
        WHERE 
            is_deleted = false`;

    if sectionId is int {
        return sql:queryConcat(query, ` AND section_id = ${sectionId}`);
    } else if routeId is int && title is string {
        return sql:queryConcat(query, ` AND title = ${title} AND route_id = ${routeId}`);
    }
    return query;
}

# Query to get route details of a given path.
#
# + routeId - Route ID to find route details
# + return - SQL parameterized query
isolated function getRouteByIdQuery(int routeId) returns sql:ParameterizedQuery => `
    SELECT 
        route_id,
        parent_id,
        title,
        thumbnail,
        menu_item,
        description,
        route_path
    FROM 
        route
    WHERE 
        route_id = ${routeId} AND
        is_deleted = false;
`;

# Query to get section information.
#
# + sectionId - Section ID
# + return - SQL parameterized query
isolated function getSectionByIdQuery(int sectionId) returns sql:ParameterizedQuery => `
    SELECT 
        section_id,
        route_id,
        title
    FROM 
        section
    WHERE
        section_id =${sectionId} AND
        is_deleted = false;
`;

# Query to delete the content of the given content ID.
#
# + contentId - Content ID
# + return - SQL parameterized query
isolated function deleteContentByIdQuery(int contentId) returns sql:ParameterizedQuery => `
    UPDATE 
        content
    SET 
        is_deleted = true
    WHERE 
        content_id = ${contentId}
`;

# Query to get contents by section ID or route ID using a unified query.
#
# + isUser - Boolean indicating if the requester is a user or admin
# + sectionId - Section ID (optional, null if filtering by route)
# + routeId - Route ID (optional, null if filtering by section)
# + userEmail - User email for like status filtering
# + 'limit - Number of records to retrieve
# + 'offset - Number of records to offset
# + return - SQL parameterized query
isolated function getContentsQuery(boolean isUser, int? sectionId, int? routeId, string? userEmail,
        int 'limit, int 'offset) returns sql:ParameterizedQuery => `
    SELECT
        c.content_id,
        c.section_id,
        c.content_link,
        c.content_type,
        c.content_sub_type,
        c.description,
        c.thumbnail,
        c.note,
        c.styling_info,
        c.content_order,
        c.created_on,
        c.tags,
        c.is_visible,
        c.is_reused,
        c.route_id,
        cl.status,
        COUNT(cmt.comment_id) AS comment_count,
        (
            SELECT 
                COUNT(*) 
            FROM 
                content_like cl_total 
            WHERE 
                cl_total.content_id = c.content_id AND cl_total.status = true 
        ) AS likes_count
    FROM
        content c
    LEFT JOIN
        (SELECT 
            content_id, status
        FROM 
            content_like 
        WHERE 
            user_id = (
                SELECT 
                    user_id 
                FROM 
                    user 
                WHERE 
                    email=${userEmail}
            ) AND status = true
        ) AS cl ON c.content_id = cl.content_id
    LEFT JOIN 
        comment cmt ON c.content_id = cmt.content_id
        AND cmt.is_deleted = false
    WHERE
        (${sectionId} IS NULL OR section_id = ${sectionId}) AND
        (${routeId} IS NULL OR route_id = ${routeId}) AND
        c.is_deleted = false AND
        (CASE WHEN ${isUser} THEN c.is_visible = 1 ELSE true END)
    GROUP BY 
        c.content_id,
        c.section_id,
        c.content_link,
        c.content_type,
        c.content_sub_type,
        c.description,
        c.thumbnail,
        c.note,
        c.styling_info,
        c.content_order,
        c.created_on,
        c.tags,
        c.is_visible,
        c.is_reused,
        c.route_id,
        cl.status  
    ORDER BY c.content_order DESC      
    LIMIT ${'limit} 
    OFFSET ${'offset} 
`;

# Query to add like to a content.
#
# + likeContent - Content ID
# + return - SQL parameterized query
isolated function addLikeQuery(types:LikeContent likeContent) returns sql:ParameterizedQuery => `
    INSERT INTO 
        content_like (content_id, user_id, status)
    VALUES (
        ${likeContent.contentId},
        ${likeContent.userId},
        1
        )
    ON 
        DUPLICATE KEY 
    UPDATE 
        status = NOT status;
`;

# Query to get all users who liked a content.
#
# + contentId - Content ID
# + return - SQL parameterized query
isolated function getLikesQuery(int contentId) returns sql:ParameterizedQuery => `
    SELECT 
        u.user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.thumbnail
    FROM 
        user u
    INNER JOIN 
        content_like cl ON u.user_id = cl.user_id
    WHERE 
        cl.content_id = ${contentId}
        AND cl.status = 1
    ORDER BY 
        u.first_name, u.last_name, u.email
`;

# Query to get basic information of a page.
#
# + routePath - Route path to find route details
# + return - SQL parameterized query
isolated function getPageDataQuery(string routePath) returns sql:ParameterizedQuery => `
    SELECT 
        route_id,
        title,
        description,
        thumbnail,
        styling_info,
        isVisible
    FROM 
        route
    WHERE 
        route_path = ${routePath} AND
        is_deleted = false;
`;

# Query to delete route by ID and their child routes.
#
# + routeId - Route ID 
# + return - SQL parameterized query
isolated function deleteRoutesQuery(int routeId) returns sql:ParameterizedQuery => `
    WITH RECURSIVE RecursiveRouteIds AS (
        SELECT route_id
        FROM route
        WHERE route_id = ${routeId}

        UNION ALL

        SELECT r.route_id
        FROM route r
        JOIN RecursiveRouteIds rec ON r.parent_id = rec.route_id
    )
    UPDATE route r
    LEFT JOIN content c ON c.route_id = r.route_id
    SET
        r.is_deleted = TRUE,
        c.is_deleted = TRUE
    WHERE r.route_id IN (
        SELECT route_id
        FROM RecursiveRouteIds
    );
`;

# Query to delete sections by route ID.
#
# + routeId - Route ID 
# + return - SQL parameterized query
isolated function deleteSectionsByRouteIdQuery(int routeId) returns sql:ParameterizedQuery => `
    WITH RECURSIVE RecursiveRouteIds AS (
        SELECT route_id
        FROM route
        WHERE route_id = ${routeId}

        UNION

        SELECT r.route_id
        FROM route r
        JOIN RecursiveRouteIds rec ON r.parent_id = rec.route_id
    )
    UPDATE section s
    LEFT JOIN content c ON c.section_id = s.section_id
    SET
        s.is_deleted = TRUE,
        c.is_deleted = TRUE
    WHERE s.route_id IN (
        SELECT route_id
        FROM RecursiveRouteIds
    );
`;

# Query to delete contents by section ID.
#
# + sectionId - Section ID 
# + return - SQL parameterized query
isolated function deleteContentsBySectionIdQuery(int sectionId) returns sql:ParameterizedQuery => `
    UPDATE content
    SET is_deleted = TRUE
    WHERE section_id = ${sectionId}
`;

# Query to update content.
#
# + contentId - Content ID to update
# + payload - Content data to change
# + userEmail - Email of the user for last verified by / updated by
# + return - SQL parameterized query
isolated function updateContentQuery(int? contentId, types:UpdateContentPayload payload, string? userEmail = ())
    returns sql:ParameterizedQuery[] {

    sql:ParameterizedQuery[] sqlQueries = [];

    sqlQueries.push(` updated_by = ${userEmail} `);

    if payload.description is string {
        sqlQueries.push(` description = ${payload.description} `);
    }

    if payload.contentLink is string {
        sqlQueries.push(` content_link = ${payload.contentLink} `);
    }

    if payload.contentType is string {
        sqlQueries.push(` content_type = ${payload.contentType} `);
    }
    if payload.contentSubtype is string {
        sqlQueries.push(` content_sub_type = ${payload.contentSubtype} `);
    }

    if payload.thumbnail is string {
        sqlQueries.push(` thumbnail = ${payload.thumbnail} `);
    }

    if payload.note is string {
        sqlQueries.push(` note = ${payload.note} `);
    }

    if payload.customContentTheme is types:CustomTheme {
        sqlQueries.push(` styling_info = ${payload.customContentTheme.toJsonString()} `);
    }

    if payload.verifyContent is boolean {
        sqlQueries.push(`last_verified_on = CURRENT_TIMESTAMP()`);
        if userEmail is string {
            sqlQueries.push(`last_verified_by = ${userEmail}`);
        }
    }

    if payload.tags is string {
        sqlQueries.push(`tags = ${payload.tags}`);
    }
    if payload.isVisible is boolean {
        sqlQueries.push(`is_visible = ${payload.isVisible}`);
    }
    if payload.isReused is boolean {
        sqlQueries.push(`is_reused = ${payload.isReused}`);
    }

    if sqlQueries.length() > 0 && contentId is int {
        sql:ParameterizedQuery fieldQuery = `UPDATE content SET `;
        boolean isFirst = true;

        foreach var clause in sqlQueries {
            if !isFirst {
                fieldQuery = sql:queryConcat(fieldQuery, `, `);
            }
            fieldQuery = sql:queryConcat(fieldQuery, clause);
            isFirst = false;
        }

        fieldQuery = sql:queryConcat(fieldQuery, ` WHERE content_id = ${contentId} AND is_deleted = false`);
        sqlQueries = [];
        sqlQueries.push(fieldQuery);
    }

    //Reordering 
    var reorderContents = payload.reorderContents;

    if reorderContents is types:SwapContentOrders[] && reorderContents.length() > 0 {
        sql:ParameterizedQuery[] caseWhen = [];
        sql:ParameterizedQuery[] contentIds = [];

        foreach var item in reorderContents {
            caseWhen.push(`WHEN content_id = ${item.contentId} THEN ${item.contentOrder} `);
            contentIds.push(`${item.contentId}`);
        }

        caseWhen.push(` END`);
        sql:ParameterizedQuery caseClause = sql:queryConcat(`content_order = CASE `, ...caseWhen);
        sql:ParameterizedQuery reorderQuery = sql:queryConcat(`UPDATE content SET `, caseClause);

        sql:ParameterizedQuery idList = contentIds[0];
        foreach int i in 1 ..< contentIds.length() {
            idList = sql:queryConcat(idList, `, `, contentIds[i]);
        }

        reorderQuery = sql:queryConcat(reorderQuery, ` WHERE content_id IN (`, idList, `) AND is_deleted = false`);

        if payload.sectionId is int {
            reorderQuery = sql:queryConcat(reorderQuery, ` AND section_id = ${payload.sectionId}`);
        } else if payload.routeId is int {
            reorderQuery = sql:queryConcat(reorderQuery, ` AND route_id = ${payload.routeId}`);
        }

        sqlQueries.push(reorderQuery);
    }

    if sqlQueries.length() == 0 {
        sqlQueries.push(`SELECT 0 WHERE FALSE`);
    }

    return sqlQueries;
}

# Query to update section fields and reorder sections in one query.
#
# + sectionId - Section ID to update
# + payload - Combined update + reorder payload
# + return - SQL parameterized query
isolated function updateSectionQuery(int sectionId, types:UpdateSectionPayload payload)
    returns sql:ParameterizedQuery[] {

    sql:ParameterizedQuery[] queries = [];
    sql:ParameterizedQuery[] sqlQueries = [];

    //Normal field updates
    if payload.title is string {
        sqlQueries.push(`title = ${payload.title}`);
    }

    if payload.description is string {
        sqlQueries.push(`description = ${payload.description}`);
    }

    if payload.sectionType is string {
        sqlQueries.push(`section_type = ${payload.sectionType}`);
    }

    if payload.imageUrl is string {
        sqlQueries.push(`image_url = ${payload.imageUrl}`);
    }

    if payload.redirectUrl is string {
        sqlQueries.push(`redirect_url = ${payload.redirectUrl}`);
    }

    if payload.tags is string {
        sqlQueries.push(`tags = ${payload.tags}`);
    }

    if payload.customSectionTheme is types:CustomTheme {
        sqlQueries.push(`styling_info = ${payload.customSectionTheme.toJsonString()}`);
    }

    if sqlQueries.length() > 0 {
        sql:ParameterizedQuery fieldQuery = `UPDATE section SET `;
        boolean isFirst = true;

        foreach var clause in sqlQueries {
            if !isFirst {
                fieldQuery = sql:queryConcat(fieldQuery, `, `);
            }
            fieldQuery = sql:queryConcat(fieldQuery, clause);
            isFirst = false;
        }

        fieldQuery = sql:queryConcat(fieldQuery, ` WHERE section_id = ${sectionId} AND is_deleted = false`);
        queries.push(fieldQuery);
    }

    //Reordering
    var reorderSections = payload.reorderSections;

    if reorderSections is types:SwapSectionOrders[] && reorderSections.length() > 0 {
        sql:ParameterizedQuery[] caseWhen = [];
        sql:ParameterizedQuery[] reorderIds = [];

        foreach var item in reorderSections {
            caseWhen.push(`WHEN section_id = ${item.sectionId} THEN ${item.sectionOrder} `);
            reorderIds.push(`${item.sectionId}`);
        }
        caseWhen.push(` END`);

        sql:ParameterizedQuery reorderClause = sql:queryConcat(`section_order = CASE `, ...caseWhen);
        sql:ParameterizedQuery reorderQuery = sql:queryConcat(`UPDATE section SET `, reorderClause);

        sql:ParameterizedQuery idList = reorderIds[0];
        foreach int i in 1 ..< reorderIds.length() {
            idList = sql:queryConcat(idList, `, `, reorderIds[i]);
        }

        reorderQuery = sql:queryConcat(reorderQuery, ` 
        WHERE section_id IN (`, idList, `) AND is_deleted = false`);
        queries.push(reorderQuery);
    }

    if queries.length() == 0 {
        queries.push(`SELECT 0 WHERE FALSE`);
    }

    return queries;
}

# Get section data of a given route path.
#
# + routePath - Route path
# + limit - Number of records to retrieve
# + offset - Number of records to offset
# + return - SQL parameterized query
isolated function getSectionByRoutePathQuery(int 'limit, int 'offset, string? routePath)
    returns sql:ParameterizedQuery => `
    SELECT 
        section_id,
        title,
        description,
        image_url,
        section_type,
        redirect_url,
        styling_info,
        section_order
    FROM 
        section
    WHERE 
        route_id = (
            SELECT route_id
            FROM route
            WHERE route_path = ${routePath}
            AND is_deleted = false
        )
        AND is_deleted = false
        AND section_type IN ('image', 'section')
    ORDER BY section_order DESC
    LIMIT ${'limit} OFFSET ${'offset}   
`;

# Query to delete section by ID.
#
# + sectionId - Section ID 
# + return - SQL parameterized query
isolated function deleteSectionsQuery(int sectionId) returns sql:ParameterizedQuery => `
    UPDATE section s
    LEFT JOIN content c ON c.section_id = s.section_id
    SET
        s.is_deleted = TRUE,
        c.is_deleted = TRUE
    WHERE s.section_id = ${sectionId}
    AND s.is_deleted = FALSE;
`;

# Query to create a section.
#
# + section - Section details
# + return - SQL parameterized query
isolated function addSectionQuery(types:SectionPayload section) returns sql:ParameterizedQuery => `
    INSERT INTO
        section(route_id, title, description, section_type, image_url, redirect_url, styling_info, tags)
    VALUES(
        ${section.routeId},
        ${section.title},
        ${section.description},
        ${section.sectionType},
        ${section.imageUrl},
        ${section.redirectUrl},
        ${section.customSectionTheme.toJsonString()},
        ${section.tags}
    )
`;

# Query to get user ID for a given email.
#
# + userEmail - User email
# + return - SQL parameterized query
isolated function getUserIdQuery(string userEmail) returns sql:ParameterizedQuery => `
    SELECT 
        user_id
    FROM 
        user
    WHERE email = ${userEmail}; 
`;

# Query to create a user.
#
# + employee - User details
# + return - SQL parameterized query
isolated function addUserQuery(entity:Employee employee) returns sql:ParameterizedQuery => `
    INSERT IGNORE INTO
        user(email, thumbnail, first_name, last_name)
    VALUES(
        ${employee.workEmail},
        ${employee.employeeThumbnail},
        ${employee.firstName},
        ${employee.lastName}
    )
`;

# Query to get comments by content ID.
#
# + contentId - Content ID
# + return - SQL parameterized query
isolated function getCommentsByContentIdQuery(int contentId) returns sql:ParameterizedQuery => `
    SELECT
        comment_id as commentId,
                comment,
                created_on as createdOn,
        CONCAT(u.first_name," ",u.last_name) as userName,
        u.email as userEmail,
        u.thumbnail as userThumbnail
    FROM 
        comment c
    LEFT JOIN user u 
    ON u.user_id = c.user_id 
    WHERE
        content_id =${contentId} AND is_deleted = false;
`;

# Query to get required details of all content for report.
#
# + return - SQL parameterized query
isolated function getContentDetailsQuery() returns sql:ParameterizedQuery => `
    SELECT
        c.description AS contentName,
        c.content_link AS contentLink,
        GROUP_CONCAT(DISTINCT r.label ORDER BY r.label SEPARATOR ', ') AS pageName,
        GROUP_CONCAT(DISTINCT s.title ORDER BY s.title SEPARATOR ', ') AS sectionName,
        SUBSTRING_INDEX(
            GROUP_CONCAT(c.created_by ORDER BY c.created_on ASC, c.content_id ASC),
            ',', 1
        ) AS createdBy,
        DATE_FORMAT(MIN(c.created_on), '%Y-%m-%d %H:%i:%s') AS createdDate,
        SUBSTRING_INDEX(
            GROUP_CONCAT(c.last_verified_by ORDER BY c.last_verified_on DESC, c.content_id DESC),
            ',', 1
        ) AS lastVerifiedBy,
        DATE_FORMAT(MAX(c.last_verified_on), '%Y-%m-%d %H:%i:%s') AS lastVerifiedDate
    FROM 
        content AS c
    JOIN 
        section AS s ON s.section_id = c.section_id
    JOIN
        route AS r ON r.route_id = s.route_id
    WHERE
        c.is_deleted = 0
        AND c.content_type != ${ROUTE_CONTENT_TYPE}
    GROUP BY c.description, c.content_link
    ORDER BY createdDate DESC
`;

# Get content description by content id.
#
# + contentId - content id
# + return - content description, content ID, and section ID
isolated function getContentDetailsByIdQuery(int contentId) returns sql:ParameterizedQuery => `
    SELECT
        c.content_id AS contentId,
        c.section_id AS sectionId,
        c.description AS description,
        COALESCE(r.route_path, '') AS routePath
    FROM
        content c
        INNER JOIN section s ON s.section_id = c.section_id
        LEFT JOIN route r ON r.route_id = s.route_id
    WHERE
        c.content_id = ${contentId}
        AND c.is_deleted = FALSE;
`;

# Query to get all tags.
#
# + return - SQL parameterized query
isolated function getAllTagsQuery() returns sql:ParameterizedQuery => `
    SELECT
        tag_name as tagName,
        color
    FROM tag
    WHERE is_deleted = false`;

# Query to add tag.
#
# + tagName - Tag details
# + return - SQL parameterized query
isolated function addTagQuery(types:TagPayload tagName) returns sql:ParameterizedQuery => `
    INSERT INTO 
        tag(tag_name, color, is_deleted)
    VALUES(
        ${tagName.tagName},
        "#FF0000",
        false
    )
`;

# Query to delete a Tag.
#
# + tagName - Tag details
# + return - SQL parameterized query
isolated function deleteTagQuery(string tagName) returns sql:ParameterizedQuery => `
    UPDATE tag
    SET is_deleted = TRUE
    WHERE tag_name = ${tagName}
    AND is_deleted = FALSE;
`;

# Query to reparent routes to a new parent.
#
# + newParentId - New parent route ID
# + routeId - Route ID to be reparented
# + return - SQL parameterized query    
isolated function reparentRoutesQuery(int newParentId, int routeId) returns sql:ParameterizedQuery => `
    WITH RECURSIVE new_tree AS (
        SELECT
            r.route_id,
            ${newParentId} AS new_parent_id,
            r.label,
            (SELECT 
                CASE WHEN route_path = '/' THEN '' ELSE route_path END
            FROM route
            WHERE route_id = ${newParentId}
            LIMIT 1
            ) AS base_path,
            CONCAT(
                (SELECT CASE WHEN route_path = '/' THEN '' ELSE route_path END
                FROM route
                WHERE route_id = ${newParentId}
                LIMIT 1
                ),
                '/', r.label
            ) AS new_path
        FROM route AS r
        WHERE r.route_id = ${routeId}

        UNION ALL

        SELECT
            c.route_id,
            p.new_parent_id,
            c.label,
            p.new_path AS base_path,
            CONCAT(p.new_path, '/', c.label) AS new_path
        FROM route AS c
        JOIN new_tree AS p
            ON c.parent_id = p.route_id
    )

    UPDATE route AS tgt
    JOIN new_tree AS src
        ON tgt.route_id = src.route_id
    SET
        tgt.parent_id  = CASE WHEN tgt.route_id = ${routeId} THEN src.new_parent_id ELSE tgt.parent_id END,
        tgt.route_path = src.new_path
`;

# Query to update a comment.
#
# + payload - UpdateCommentPayload containing commentId and updated comment text
# + updatedBy - User who updated the comment
# + return - SQL parameterized query
isolated function updateCommentQuery(types:UpdateCommentPayload payload, string updatedBy)
    returns sql:ParameterizedQuery => `
        UPDATE 
            comment
        SET 
            comment = ${payload.comment},
            updated_by = ${updatedBy}
        WHERE 
            comment_id = ${payload.commentId} AND is_deleted = false;
`;

# Query to delete a comment.
#
# + payload - UpdateCommentPayload containing commentId of the comment to be deleted
# + updatedBy - User who deleted the comment
# + return - SQL parameterized query
isolated function deleteCommentQuery(types:UpdateCommentPayload payload, string updatedBy)
    returns sql:ParameterizedQuery => `
        UPDATE 
            comment
        SET 
            is_deleted = true,
            updated_by = ${updatedBy}
        WHERE 
            comment_id = ${payload.commentId} AND is_deleted = false;
`;

# Query to fetch owner’s email and creation time.
#
# + commentId - ID of the comment to fetch metadata
# + email - Email of the user to verify ownership
# + return - SQL parameterized query 
isolated function getCommentDataQuery(int commentId, string email) returns sql:ParameterizedQuery => `
    SELECT 
        u.user_id AS created_by, 
        c.created_on AS created_on 
    FROM 
        comment c 
        JOIN user u ON c.user_id = u.user_id 
    WHERE 
        c.comment_id = ${commentId} 
        AND c.is_deleted = false 
        AND u.email = ${email};
`;

# Add a new custom button.
#
# + button - Custom button create payload
# + return - SQL parameterized query
isolated function addCustomButtonQuery(CustomButtonCreatePayload button) returns sql:ParameterizedQuery => `
    INSERT INTO custom_buttons (
        content_id, 
        label, 
        description, 
        icon, 
        color, 
        action, 
        action_value, 
        is_visible, 
        button_order, 
        is_deleted
    )
    VALUES (
        ${button.contentId},
        ${button.label},
        ${button.description},
        ${button?.icon},
        ${button.color},
        ${button.action},
        ${button.actionValue},
        ${button.isVisible},
        ${button.'order},
        false
    );`;

# Get all custom buttons for a content.
#
# + contentId - Content ID
# + return - SQL parameterized query
isolated function getCustomButtonsQuery(string contentId) returns sql:ParameterizedQuery => `
    SELECT 
        id, 
        content_id, 
        label, 
        description, 
        icon, 
        color, 
        action, 
        action_value, 
        is_visible, 
        button_order, 
        created_at, 
        updated_at
    FROM 
        custom_buttons
    WHERE 
        content_id = ${contentId}
        AND is_deleted = false
    ORDER BY 
        button_order ASC
`;

# Update a custom button.
#
# + id - Custom button ID
# + button - Custom button update payload
# + return - SQL parameterized query
isolated function updateCustomButtonQuery(int id, CustomButtonUpdatePayload button) returns sql:ParameterizedQuery {
    sql:ParameterizedQuery sqlQuery = `
        UPDATE
            custom_buttons
        SET 
    `;

    sql:ParameterizedQuery[] sqlQueries = [];

    sqlQueries.push(` updated_at = CURRENT_TIMESTAMP `);

    if button.label is string {
        sqlQueries.push(` label = ${button.label} `);
    }
    if button.description is string {
        sqlQueries.push(` description = ${button.description} `);
    }

    if button?.icon is string {
        sqlQueries.push(` icon = ${button.icon} `);
    } else if button?.icon is () {
        sqlQueries.push(` icon = NULL `);
    }
    if button.color is string {
        sqlQueries.push(` color = ${button.color} `);
    }
    if button.action is string {
        sqlQueries.push(` action = ${button.action} `);
    }
    if button.actionValue is string {
        sqlQueries.push(` action_value = ${button.actionValue} `);
    }
    if button.isVisible is boolean {
        sqlQueries.push(` is_visible = ${button.isVisible} `);
    }
    if button.'order is int {
        sqlQueries.push(` button_order = ${button.'order} `);
    }

    sqlQuery = buildSqlUpdateQuery(sqlQuery, sqlQueries);
    return sql:queryConcat(sqlQuery, ` WHERE id = ${id} AND is_deleted = false`);
}

# Delete a custom button (soft delete).
#
# + buttonId - Button ID
# + return - SQL parameterized query
isolated function deleteCustomButtonQuery(int buttonId) returns sql:ParameterizedQuery => ` 
    UPDATE 
        custom_buttons 
    SET 
        is_deleted = true,
        updated_at = CURRENT_TIMESTAMP
    WHERE 
        id = ${buttonId}
        AND is_deleted = false
`;

# Get custom button by ID.
#
# + buttonId - Button ID
# + return - SQL parameterized query
isolated function getCustomButtonByIdQuery(int buttonId) returns sql:ParameterizedQuery => `
    SELECT 
        id, 
        content_id, 
        label, 
        description, 
        icon, 
        color, 
        action, 
        action_value, 
        is_visible, 
        button_order, 
        created_at, 
        updated_at
    FROM 
        custom_buttons
    WHERE 
        id = ${buttonId}
        AND is_deleted = false
`;

# Get recent content created within the last month.
#
# + userEmail - User email for like status
# + limit - Number of contents to retrieve
# + offset - Number of contents to offset
# + return - SQL parameterized query
isolated function getRecentContentsQuery(string userEmail, int 'limit, int 'offset)
    returns sql:ParameterizedQuery => `
    SELECT
        c.content_id,
        c.section_id,
        c.content_link,
        c.content_type,
        c.content_sub_type,
        c.description,
        c.thumbnail,
        c.note,
        c.styling_info,
        c.content_order,
        c.created_on,
        c.tags,
        c.is_visible,
        c.is_reused,
        cl.status,
        COUNT(cmt.comment_id) AS comment_count,
        (
            SELECT 
                COUNT(cl_total.content_id) 
            FROM 
                content_like cl_total 
            WHERE 
                cl_total.content_id = c.content_id AND cl_total.status = true 
        ) AS likes_count
    FROM
        content c
    LEFT JOIN
        (SELECT 
            content_id, status
        FROM 
            content_like 
        WHERE 
            user_id = (
                SELECT 
                    user_id 
                FROM 
                    user 
                WHERE 
                    email=${userEmail}
            ) AND status = true
    ) AS cl ON c.content_id = cl.content_id
    LEFT JOIN 
        comment cmt ON c.content_id = cmt.content_id
        AND cmt.is_deleted = false
    WHERE
        c.is_deleted = false
        AND c.is_visible = 1
        AND c.is_reused = 0
        AND (c.content_type IS NULL OR c.content_type != ${ROUTE_CONTENT_TYPE})
    GROUP BY 
        c.content_id,
        c.section_id,
        c.content_link,
        c.content_type,
        c.content_sub_type,
        c.description,
        c.thumbnail,
        c.note,
        c.styling_info,
        c.content_order,
        c.created_on,
        c.tags,
        c.is_visible,
        c.is_reused,
        cl.status,
        c.content_sub_type
    ORDER BY c.created_on DESC      
    LIMIT ${'limit} 
    OFFSET ${'offset} 
`;

# Query to add/remove pin to/from a content.
#
# + pinContents - Pin content details
# + return - SQL parameterized query
isolated function pinContentsQuery(types:PinContents pinContents) returns sql:ParameterizedQuery => `
    INSERT IGNORE INTO 
        pinned_content (user_email, content_id, pinned_at)
    VALUES (
        ${pinContents.userEmail},
        ${pinContents.contentId},
        CURRENT_TIMESTAMP
    );
`;

# Query to remove pin from a content.
#
# + pinContents - Pin content details
# + return - SQL parameterized query
isolated function unpinContentsQuery(types:PinContents pinContents) returns sql:ParameterizedQuery => `
    DELETE FROM 
        pinned_content
    WHERE 
        user_email = ${pinContents.userEmail}
        AND content_id = ${pinContents.contentId};
`;

# Query to get pinned content for a user.
#
# + userEmail - User email
# + limit - Number of records to retrieve
# + offset - Number of records to offset
# + return - SQL parameterized query
isolated function getPinnedContentsQuery(string userEmail, int 'limit, int 'offset) returns sql:ParameterizedQuery => `
    SELECT
        c.content_id,
        c.section_id,
        c.content_link,
        c.content_type,
        c.content_sub_type,
        c.description,
        c.thumbnail,
        c.note,
        c.styling_info,
        c.content_order,
        c.created_on,
        c.tags,
        c.is_reused,
        c.is_visible,
        cl.status,
        COUNT(cmt.comment_id) AS comment_count,
        (
            SELECT 
            COUNT(cl_total.content_id)
            FROM 
            content_like cl_total 
            WHERE 
            cl_total.content_id = c.content_id AND cl_total.status = true 
        ) AS likes_count,
        pc.pinned_at
    FROM
        pinned_content pc
    INNER JOIN 
        content c ON pc.content_id = c.content_id
    LEFT JOIN
        (SELECT 
            content_id, status
        FROM 
            content_like 
        WHERE 
            user_id = (
                SELECT 
                    user_id 
                FROM 
                    user 
                WHERE 
                    email = ${userEmail}
            ) AND status = true
        ) AS cl ON c.content_id = cl.content_id
    LEFT JOIN 
        comment cmt 
        ON c.content_id = cmt.content_id
        AND cmt.is_deleted = false
    WHERE 
        pc.user_email = ${userEmail}
        AND c.is_deleted = false
        AND c.is_visible = 1
    GROUP BY 
        c.content_id,
        c.section_id,
        c.content_link,
        c.content_type,
        c.content_sub_type,
        c.description,
        c.thumbnail,
        c.note,
        c.styling_info,
        c.content_order,
        c.created_on,
        c.tags,
        c.is_reused,
        c.is_visible,
        cl.status,
        pc.pinned_at
    ORDER BY pc.pinned_at DESC      
    LIMIT ${'limit} 
    OFFSET ${'offset} 
`;

# Query to check if user has any pinned content.
#
# + userEmail - User email
# + return - SQL parameterized query
isolated function getPinnedContentIdsQuery(string userEmail) returns sql:ParameterizedQuery => `
    SELECT 
        pc.content_id
    FROM 
        pinned_content pc
    INNER JOIN 
        content c ON pc.content_id = c.content_id
    WHERE 
        pc.user_email = ${userEmail}
        AND c.is_deleted = false
        AND c.is_visible = 1
`;

# Unified search function for all content queries.
#
# + filter - Content query filtersx
# + return - Parameterized query ready to execute
isolated function searchContentsQuery(ContentFilter filter) returns sql:ParameterizedQuery {
    sql:ParameterizedQuery query = `
        SELECT
            c.content_id,
            c.section_id,
            c.content_link,
            c.content_type,
            c.content_sub_type,
            c.description,
            c.thumbnail,
            c.note,
            c.styling_info,
            c.content_order,
            c.created_on,
            c.tags,
            c.is_visible,
            c.is_reused,
            cl.status,
            COUNT(cmt.comment_id) AS comment_count,
            (
                SELECT COUNT(*)
                FROM content_like cl_total
                WHERE cl_total.content_id = c.content_id
                  AND cl_total.status = true
            ) AS likes_count
        FROM content c
        LEFT JOIN (
            SELECT content_id, status
            FROM content_like
                WHERE user_id = (SELECT user_id FROM user WHERE email = ${filter.userEmail})
              AND status = true
        ) AS cl ON c.content_id = cl.content_id
        LEFT JOIN comment cmt
               ON c.content_id = cmt.content_id
              AND cmt.is_deleted = false
        WHERE c.is_deleted = false
          AND c.is_visible = 1
          AND c.is_reused = 0
          AND (c.content_type IS NULL OR c.content_type != ${ROUTE_CONTENT_TYPE})
    `;

    if filter.mode == TEXT && filter.text is string {
        query = sql:queryConcat(query, `
            AND c.content_id IN (
                -- Match contents by description text
                SELECT content_id FROM content 
                WHERE description LIKE ${filter.text}
            )
        `);
    }

    else if filter.mode == TAGS {
        string[] trimmedTags = trimArray(filter.tags);

        // Add one FIND_IN_SET condition per tag
        foreach string tag in trimmedTags {
            query = sql:queryConcat(query, ` AND FIND_IN_SET(${tag}, c.tags) > 0`);
        }

        // If no tags provided, force empty result
        if trimmedTags.length() == 0 {
            query = sql:queryConcat(query, ` AND 1 = 0`);
        }
    }

    else if filter.mode == TAGS_AND_KEYWORDS {
        string[] trimmedTags = trimArray(filter.tags);
        string[] trimmedKeywords = trimArray(filter.keywords);

        sql:ParameterizedQuery[] conditions = [];

        // Tag filters
        foreach string tag in trimmedTags {
            conditions.push(`FIND_IN_SET(${tag}, c.tags) > 0`);
        }

        // Keyword filters 
        foreach string kw in trimmedKeywords {
            string pattern = "%" + kw + "%";
            conditions.push(`c.tags LIKE ${pattern}`);
        }

        if conditions.length() > 0 {
            // Combine all conditions with OR
            sql:ParameterizedQuery joined = conditions[0];
            foreach int i in 1 ..< conditions.length() {
                joined = sql:queryConcat(joined, ` OR `, conditions[i]);
            }

            query = sql:queryConcat(query, ` AND (`, joined, `)`);
        } else {
            query = sql:queryConcat(query, ` AND 1 = 0`);
        }
    }

    else if filter.mode == TRENDING && filter.trendingDescriptions is string[] {
        string[] trimmed = trimArray(filter.trendingDescriptions);

        if trimmed.length() == 0 {
            query = sql:queryConcat(query, ` AND 1 = 0`);
        } else {
            // Convert to value list for IN clause
            sql:Value[] values = from string d in trimmed
                select d;

            // Subquery to get the latest content by description
            sql:ParameterizedQuery latestSub = sql:queryConcat(`
                SELECT description, MAX(created_on) AS max_created
                FROM content
                WHERE description IN (`, sql:arrayFlattenQuery(values), `)
                  AND is_deleted = false AND is_visible = 1 AND is_reused = 0
                GROUP BY description
            `);

            // Only return content items matching the latest-created version
            query = sql:queryConcat(query, `
                AND EXISTS (
                    SELECT 1 FROM (`, latestSub, `) lp
                    WHERE lp.description = c.description
                      AND lp.max_created = c.created_on
                )
            `);
        }
    }

    // DEFAULT: no valid mode, no results
    else {
        query = sql:queryConcat(query, ` AND 1 = 0`);
    }

    sql:ParameterizedQuery footer = `
        GROUP BY
            c.content_id, 
            c.section_id, 
            c.content_link, 
            c.content_type, 
            c.content_sub_type,
            c.description,
            c.thumbnail, 
            c.note, 
            c.styling_info, 
            c.content_order, 
            c.created_on,
            c.tags, 
            c.is_visible, 
            c.is_reused, 
            cl.status,
            c.content_sub_type
        ORDER BY c.created_on DESC
    `;

    footer = sql:queryConcat(footer, ` LIMIT ${filter.'limit} OFFSET ${filter.'offset}`);

    return sql:queryConcat(query, footer);
}

# Query to get suggested content based on tags from user's pinned content.
#
# + userEmail - User email
# + 'limit - Number of records to retrieve
# + 'offset - Number of records to offset
# + return - SQL parameterized query
isolated function getSuggestedContentsQuery(string userEmail, int 'limit, int 'offset)
    returns sql:ParameterizedQuery => `
    SELECT
        c.content_id,
        c.section_id,
        c.content_link,
        c.content_type,
        c.content_sub_type,
        c.description,
        c.thumbnail,
        c.note,
        c.styling_info,
        c.content_order,
        c.created_on,
        c.tags,
        c.is_visible,
        cl.status,
        COUNT(cmt.comment_id) AS comment_count,
        (
            SELECT COUNT(cl_total.content_id)
            FROM content_like cl_total
            WHERE cl_total.content_id = c.content_id
              AND cl_total.status = true
        ) AS likes_count
    FROM content c
    LEFT JOIN (
        SELECT content_id, status
        FROM content_like
        WHERE user_id = (
            SELECT user_id
            FROM user
            WHERE email = ${userEmail}
        )
          AND status = true
    ) AS cl ON c.content_id = cl.content_id
    LEFT JOIN comment cmt
           ON c.content_id = cmt.content_id
          AND cmt.is_deleted = false
    WHERE
        c.is_deleted = false
        AND c.is_visible = 1
        AND c.tags IS NOT NULL
        AND c.tags <> ''
        AND EXISTS (
            SELECT 1
            FROM (
                SELECT DISTINCT TRIM(j.tag) AS tag
                FROM pinned_content pc
                JOIN content c2 ON c2.content_id = pc.content_id
                JOIN JSON_TABLE(
                    CONCAT('[\"', REPLACE(c2.tags, ',', '\",\"'), '\"]'),
                    '$[*]' COLUMNS (tag VARCHAR(255) PATH '$')
                ) AS j
                WHERE pc.user_email = ${userEmail}
                  AND c2.is_deleted = false
                  AND c2.is_visible = 1
                  AND c2.tags IS NOT NULL
                  AND c2.tags <> ''
                  AND TRIM(j.tag) <> ''
            ) user_tags
        )
        AND c.content_id NOT IN (
            SELECT pc2.content_id
            FROM pinned_content pc2
            WHERE pc2.user_email = ${userEmail}
        )
        AND EXISTS (
            SELECT 1
            FROM (
                SELECT DISTINCT TRIM(j.tag) AS tag
                FROM pinned_content pc
                JOIN content c2 ON c2.content_id = pc.content_id
                JOIN JSON_TABLE(
                    CONCAT('[\"', REPLACE(c2.tags, ',', '\",\"'), '\"]'),
                    '$[*]' COLUMNS (tag VARCHAR(255) PATH '$')
                ) AS j
                WHERE pc.user_email = ${userEmail}
                  AND c2.is_deleted = false
                  AND c2.is_visible = 1
                  AND c2.tags IS NOT NULL
                  AND c2.tags <> ''
                  AND TRIM(j.tag) <> ''
            ) user_tags
            WHERE FIND_IN_SET(user_tags.tag, c.tags) > 0
        )
    GROUP BY
        c.content_id,
        c.section_id,
        c.content_link,
        c.content_type,
        c.content_sub_type,
        c.description,
        c.thumbnail,
        c.note,
        c.styling_info,
        c.content_order,
        c.created_on,
        c.tags,
        c.is_visible,
        cl.status,
        c.content_sub_type
    ORDER BY c.created_on DESC
    LIMIT ${'limit}
    OFFSET ${'offset}
`;

# Query to get all customer testimonials (admin view).
#
# + return - SQL parameterized query
isolated function getAllTestimonialsQuery() returns sql:ParameterizedQuery => `
    SELECT 
        id,
        logo_url,
        name,
        sub_title,
        website_url,
        link_label,
        is_shareable,
        created_by,
        updated_by,
        created_at,
        updated_at
    FROM 
        customer_testimonial
    WHERE 
        is_deleted = FALSE
    ORDER BY 
        created_at DESC
`;

# Query to create a new customer testimonial.
#
# + testimonial - Testimonial create payload
# + createdBy - User email who created
# + return - SQL parameterized query
isolated function createTestimonialQuery(CustomerTestimonialCreatePayload testimonial, string createdBy)
    returns sql:ParameterizedQuery => `
    INSERT INTO customer_testimonial (
        logo_url,
        name,
        sub_title,
        website_url,
        link_label,
        is_shareable,
        is_deleted,
        created_by,
        updated_by
    ) VALUES (
        ${testimonial.logoUrl},
        ${testimonial.name},
        ${testimonial.subTitle},
        ${testimonial.websiteUrl},
        ${testimonial.linkLabel},
        ${testimonial.isShareable ?: true},
        FALSE,
        ${createdBy},
        ${createdBy}
    )
`;

# Query to update a customer testimonial.
#
# + id - Testimonial ID
# + testimonial - Testimonial update payload
# + updatedBy - User email who updated
# + return - SQL parameterized query
isolated function updateTestimonialQuery(int id, CustomerTestimonialUpdatePayload testimonial, string updatedBy)
    returns sql:ParameterizedQuery {

    sql:ParameterizedQuery sqlQuery = `
        UPDATE customer_testimonial
        SET 
    `;

    sql:ParameterizedQuery[] sqlQueries = [];

    sqlQueries.push(` updated_by = ${updatedBy} `);
    sqlQueries.push(` updated_at = CURRENT_TIMESTAMP `);

    if testimonial.logoUrl is string {
        sqlQueries.push(` logo_url = ${testimonial.logoUrl} `);
    }

    if testimonial.name is string {
        sqlQueries.push(` name = ${testimonial.name} `);
    }

    if testimonial.subTitle is string {
        sqlQueries.push(` sub_title = ${testimonial.subTitle} `);
    }

    if testimonial.websiteUrl is string {
        sqlQueries.push(` website_url = ${testimonial.websiteUrl} `);
    }

    if testimonial.linkLabel is string {
        sqlQueries.push(` link_label = ${testimonial.linkLabel} `);
    }

    if testimonial.isShareable is boolean {
        sqlQueries.push(` is_shareable = ${testimonial.isShareable} `);
    }

    sqlQuery = buildSqlUpdateQuery(sqlQuery, sqlQueries);
    return sql:queryConcat(sqlQuery, ` WHERE id = ${id} AND is_deleted = FALSE`);
}

# Query to delete a customer testimonial (soft delete).
#
# + id - Testimonial ID
# + return - SQL parameterized query
isolated function deleteTestimonialQuery(int id) returns sql:ParameterizedQuery => `
    UPDATE customer_testimonial
    SET is_deleted = TRUE,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    AND is_deleted = FALSE
`;

# Query to get testimonial by ID.
#
# + id - Testimonial ID
# + return - SQL parameterized query
isolated function getTestimonialByIdQuery(int id) returns sql:ParameterizedQuery => `
    SELECT 
        id,
        logo_url,
        name,
        sub_title,
        website_url,
        link_label,
        is_shareable,
        created_by,
        updated_by,
        created_at,
        updated_at
    FROM 
        customer_testimonial
    WHERE 
        id = ${id}
        AND is_deleted = FALSE
`;

# Create a new quiz.
#
# + quiz - Quiz payload details
# + createdBy - User email who created the quiz
# + return - SQL parameterized query
isolated function createQuizQuery(QuizCreatePayload quiz, string createdBy) returns sql:ParameterizedQuery => `
    INSERT INTO quiz (
        title,
        description,
        thumbnail,
        passing_score,
        due_date,
        assigned_user_ids,
        status,
        created_by,
        updated_by
    ) VALUES (
        ${quiz.title},
        ${quiz.description},
        ${quiz.thumbnail},
        ${quiz.passingScore},
        ${formatDateTime(quiz.dueDate)},
        ${quiz.assignedUserIds.toJsonString()},
        ${quiz.status},
        ${createdBy},
        ${createdBy}
    )
`;

# Delete all answers for a quiz.
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function deleteAnswersByQuizIdQuery(int quizId) returns sql:ParameterizedQuery => `
    DELETE 
    FROM answer 
    WHERE 
        question_id IN (SELECT question_id 
    FROM question 
    WHERE 
        quiz_id = ${quizId})
`;

# Mark all questions of a quiz as deleted.
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function deleteQuestionsByQuizIdQuery(int quizId) returns sql:ParameterizedQuery => `
    UPDATE 
        question 
    SET is_deleted = true 
    WHERE 
        quiz_id = ${quizId} 
        AND is_deleted = false
`;

# Get quizzes with question count.
#
# + userId - Optional User ID. When provided, returns only the user's published quizzes.
# + return - SQL parameterized query
isolated function getQuizzesQuery(int? userId = ()) returns sql:ParameterizedQuery {
    sql:ParameterizedQuery query = `
        SELECT
            q.quiz_id,
            q.title AS quiz_title,
            q.description AS quiz_description,
            q.thumbnail,
            q.passing_score,
            q.due_date,
            q.assigned_user_ids,
            q.status,
            q.is_deleted,
            q.created_by,
            q.updated_by,
            q.created_at,
            q.updated_at,
            COUNT(qn.question_id) AS total_questions
        FROM quiz q
        LEFT JOIN question qn ON qn.quiz_id = q.quiz_id AND qn.is_deleted = false
        WHERE q.is_deleted = false
    `;

    if userId is int {
        query = sql:queryConcat(query, `
            AND q.status = ${PUBLISHED}
            AND q.assigned_user_ids IS NOT NULL
            AND JSON_CONTAINS(q.assigned_user_ids, JSON_ARRAY(${userId}))
        `);
    }

    query = sql:queryConcat(query, `
        GROUP BY q.quiz_id
        ORDER BY q.created_at DESC
    `);

    return query;
}

# Get the status of a quiz.
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function getQuizStatusQuery(int quizId) returns sql:ParameterizedQuery => `
    SELECT 
        status
    FROM 
        quiz 
    WHERE 
        quiz_id = ${quizId} 
        AND is_deleted = false
`;

# Get the status of a quiz by answer ID.
#
# + answerId - Answer ID
# + return - SQL parameterized query
isolated function getQuizStatusByAnswerIdQuery(int answerId) returns sql:ParameterizedQuery => `
    SELECT
        qz.quiz_id
    FROM
        quiz qz
    JOIN
        question q ON qz.quiz_id = q.quiz_id
    JOIN
        answer a ON q.question_id = a.question_id
    WHERE
        a.answer_id = ${answerId}
        AND qz.is_deleted = false
        AND q.is_deleted = false
`;

# Get quiz details by ID.
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function getQuizByIdQuery(int quizId) returns sql:ParameterizedQuery => `
    SELECT
        quiz_id, 
        title AS quiz_title, 
        description AS quiz_description, 
        thumbnail, 
        passing_score,
        due_date, 
        assigned_user_ids, 
        status,
        is_deleted,
        created_by, 
        updated_by, 
        created_at, 
        updated_at,
        (SELECT COUNT(*) FROM question WHERE quiz_id = ${quizId} AND is_deleted = false) AS total_questions
    FROM quiz
    WHERE 
        quiz_id = ${quizId} 
        AND is_deleted = false
`;

# Update quiz with selective field updates.
#
# + quizId - Quiz ID
# + payload - Update quiz payload
# + updatedBy - User email who updated the quiz
# + return - SQL parameterized query
isolated function updateQuizQuery(int quizId, QuizUpdatePayload payload, string updatedBy)
        returns sql:ParameterizedQuery {

    sql:ParameterizedQuery[] clauses = [`updated_by = ${updatedBy}`];

    if payload.title is string {
        clauses.push(`title = ${payload.title}`);
    }
    if payload.description is string {
        clauses.push(`description = ${payload.description}`);
    }
    if payload.thumbnail is string {
        clauses.push(`thumbnail = ${payload.thumbnail}`);
    }
    if payload.passingScore is int {
        clauses.push(`passing_score = ${payload.passingScore}`);
    }
    if payload.dueDate is string {
        clauses.push(`due_date = ${formatDateTime(payload.dueDate)}`);
    }
    if payload.assignedUserIds is int[] {
        string jsonVal = (<int[]>payload.assignedUserIds).toJsonString();
        clauses.push(`assigned_user_ids = ${jsonVal}`);
    }

    if payload.status is string {
        clauses.push(`status = ${payload.status}`);
    }

    sql:ParameterizedQuery q = `UPDATE quiz SET `;
    boolean isFirst = true;
    foreach var clause in clauses {
        if !isFirst {
            q = sql:queryConcat(q, `, `);
        }
        q = sql:queryConcat(q, clause);
        isFirst = false;
    }
    return sql:queryConcat(q, ` WHERE quiz_id = ${quizId} AND is_deleted = false`);
}

# Update assignees of a quiz.
#
# + quizId - Quiz ID
# + userIds - Array of user IDs to assign
# + updatedBy - User email who made the assignment
# + return - SQL parameterized query
isolated function updateAssigneesQuery(int quizId, int[] userIds, string updatedBy)
        returns sql:ParameterizedQuery => `

    UPDATE 
        quiz
    SET
        assigned_user_ids = ${userIds.toJsonString()}, 
        updated_by = ${updatedBy}
    WHERE 
        quiz_id = ${quizId} 
        AND is_deleted = false
`;

# Mark a quiz as deleted.
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function deleteQuizQuery(int quizId) returns sql:ParameterizedQuery => `
    UPDATE 
        quiz 
    SET 
        is_deleted = true 
    WHERE 
        quiz_id = ${quizId} 
        AND is_deleted = false
`;

# Get all questions for a quiz.
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function getQuestionsByQuizIdQuery(int quizId) returns sql:ParameterizedQuery => `
    SELECT
        question_id, 
        question_number, 
        quiz_id, 
        question_text,
        question_type,
        COALESCE(ref_links, JSON_ARRAY()) AS ref_links, 
        is_deleted, 
        created_by, 
        updated_by, 
        created_at, 
        updated_at
    FROM question
    WHERE quiz_id = ${quizId} AND is_deleted = false
    ORDER BY question_number ASC
`;

# Get question by ID.
#
# + questionId - Question ID
# + return - SQL parameterized query
isolated function getQuestionByIdQuery(int questionId) returns sql:ParameterizedQuery => `
    SELECT
        question_id,
        question_number,
        quiz_id,
        question_text,
        question_type,
        COALESCE(ref_links, JSON_ARRAY()) AS ref_links,
        is_deleted,
        created_by,
        updated_by,
        created_at,
        updated_at
    FROM question
    WHERE question_id = ${questionId}
        AND is_deleted = false
`;

# Create a new question for a quiz.
#
# + quizId - Quiz ID
# + q - Question payload
# + createdBy - User email who created the question
# + return - SQL parameterized query
isolated function createQuestionQuery(int quizId, QuestionCreatePayload q, string createdBy)
        returns sql:ParameterizedQuery => `
    INSERT INTO question (
        question_number,
        quiz_id,
        question_text,
        question_type,
        ref_links,
        created_by,
        updated_by
    ) VALUES (
        ${q.questionNumber},
        ${quizId},
        ${q.questionText},
        ${q.questionType},
        ${(q.refLinks is string[] ? (<string[]>q.refLinks).toJsonString() : null)},
        ${createdBy},
        ${createdBy}
    )
    ON DUPLICATE KEY UPDATE
        question_id = LAST_INSERT_ID(question_id),
        question_text = VALUES(question_text),
        question_type = VALUES(question_type),
        ref_links = VALUES(ref_links),
        updated_by = VALUES(updated_by),
        is_deleted = false
`;

# Update a question with selective field updates.
#
# + questionId - Question ID
# + payload - Update question payload
# + updatedBy - User email who updated the question
# + return - SQL parameterized query
isolated function updateQuestionQuery(int questionId, QuestionUpdatePayload payload, string updatedBy)
        returns sql:ParameterizedQuery {

    sql:ParameterizedQuery[] clauses = [`updated_by = ${updatedBy}`];

    if payload.questionText is string {
        clauses.push(`question_text = ${payload.questionText}`);
    }
    if payload.questionType is string {
        clauses.push(`question_type = ${payload.questionType}`);
    }
    if payload.refLinks is string[] {
        string jsonVal = (<string[]>payload.refLinks).toJsonString();
        clauses.push(`ref_links = ${jsonVal}`);
    }

    sql:ParameterizedQuery q = `UPDATE question SET `;
    boolean isFirst = true;
    foreach var clause in clauses {
        if !isFirst {
            q = sql:queryConcat(q, `, `);
        }
        q = sql:queryConcat(q, clause);
        isFirst = false;
    }
    return sql:queryConcat(q, ` WHERE question_id = ${questionId} AND is_deleted = false`);
}

# Mark a question as deleted.
#
# + questionId - Question ID
# + return - SQL parameterized query
isolated function deleteQuestionQuery(int questionId) returns sql:ParameterizedQuery => `
    UPDATE 
        question 
    SET 
        is_deleted = true 
    WHERE 
        question_id = ${questionId} 
        AND is_deleted = false
`;

# Create a new answer for a question.
#
# + questionId - Question ID
# + a - Answer payload
# + createdBy - User email who created the answer
# + return - SQL parameterized query
isolated function createAnswerQuery(int questionId, AnswerPayload a, string createdBy)
        returns sql:ParameterizedQuery => `
    INSERT INTO answer (
        question_id, 
        answer_text, 
        is_correct, 
        created_by, 
        updated_by
    ) VALUES (
        ${questionId}, 
        ${a.answerText}, 
        ${a.isCorrect}, 
        ${createdBy}, 
        ${createdBy}
    )
`;

# Get answer by ID.
#
# + answerId - Answer ID
# + return - SQL parameterized query
isolated function getAnswerByIdQuery(int answerId) returns sql:ParameterizedQuery => `
    SELECT
        answer_id,
        question_id,
        answer_text,
        is_correct,
        created_by,
        updated_by,
        created_at,
        updated_at
    FROM answer
    WHERE answer_id = ${answerId}
`;

# Update an answer with selective field updates.
#
# + answerId - Answer ID
# + payload - Update answer payload
# + updatedBy - User email who updated the answer
# + return - SQL parameterized query
isolated function updateAnswerQuery(int answerId, UpdateAnswerPayload payload, string updatedBy)
        returns sql:ParameterizedQuery {

    sql:ParameterizedQuery[] clauses = [`updated_by = ${updatedBy}`];

    if payload.answerText is string {
        clauses.push(`answer_text = ${payload.answerText}`);
    }
    if payload.isCorrect is boolean {
        clauses.push(`is_correct = ${payload.isCorrect}`);
    }

    sql:ParameterizedQuery q = `UPDATE answer SET `;
    boolean isFirst = true;
    foreach var clause in clauses {
        if !isFirst {
            q = sql:queryConcat(q, `, `);
        }
        q = sql:queryConcat(q, clause);
        isFirst = false;
    }
    return sql:queryConcat(q, ` WHERE answer_id = ${answerId}`);
}

# Delete an answer.
#
# + answerId - Answer ID
# + return - SQL parameterized query
isolated function deleteAnswerQuery(int answerId) returns sql:ParameterizedQuery => `
    DELETE FROM 
        answer 
    WHERE 
        answer_id = ${answerId}
`;

# Delete user answers for a specific question (for re-attempts).
#
# + quizId - Quiz ID
# + userId - User ID
# + questionId - Question ID
# + return - SQL parameterized query
isolated function deleteUserAnswersForQuestionQuery(int quizId, int userId, int questionId)
        returns sql:ParameterizedQuery => `
    DELETE FROM 
        user_answer
    WHERE 
        quiz_id = ${quizId} 
        AND user_id = ${userId} 
        AND question_id = ${questionId}
`;

# Insert a user answer submission.
#
# + quizId - Quiz ID
# + userId - User ID
# + questionId - Question ID
# + selectedAnswerId - Selected answer ID
# + return - SQL parameterized query
isolated function insertUserAnswerQuery(int quizId, int userId, int questionId, int selectedAnswerId)
        returns sql:ParameterizedQuery => `
    INSERT INTO user_answer (
        quiz_id, 
        user_id, 
        question_id, 
        selected_answer_id
    ) VALUES (
        ${quizId}, 
        ${userId}, 
        ${questionId}, 
        ${selectedAnswerId}
    )
`;

# Insert or update quiz feedback submission.
#
# + quizId - Quiz ID
# + userId - User ID
# + feedbackText - Feedback text
# + return - SQL parameterized query
isolated function insertQuizFeedbackQuery(int quizId, int userId, string feedbackText)
        returns sql:ParameterizedQuery => `
    INSERT INTO quiz_feedback (
        quiz_id, 
        user_id, 
        feedback_text
    ) VALUES (
        ${quizId}, 
        ${userId}, 
        ${feedbackText})
    ON DUPLICATE KEY UPDATE feedback_text = ${feedbackText}, created_at = CURRENT_TIMESTAMP
`;

# Get comprehensive quiz result for a user including score, marks, and pass status.
#
# + quizId - Quiz ID
# + userEmail - User email
# + return - SQL parameterized query
isolated function getUserResultQuery(int quizId, string userEmail) returns sql:ParameterizedQuery => `
    SELECT 
        COUNT(*) AS total_questions,
        CAST(SUM(perq.is_correct) AS SIGNED) AS correct_answers,
        ROUND(SUM(perq.is_correct) / NULLIF(COUNT(*), 0) * 100, 2) AS score_percentage,
        CAST(SUM(perq.is_correct) AS SIGNED) AS marks_obtained,
        COUNT(*) = SUM(perq.answered) AS completed,
        ROUND(SUM(perq.is_correct) / NULLIF(COUNT(*), 0) * 100, 2) >= qz.passing_score AS passed

    FROM quiz qz
    JOIN question q ON q.quiz_id = qz.quiz_id
    LEFT JOIN (
        SELECT 
            qn.question_id,
            CASE 
                WHEN qn.question_type IN ('rating', 'feedback') THEN 0
                WHEN (
                    SELECT COUNT(*) FROM answer a 
                    WHERE a.question_id = qn.question_id AND a.is_correct = 1
                ) = (
                    SELECT COUNT(DISTINCT ua.selected_answer_id)
                    FROM user_answer ua 
                    JOIN answer a ON a.answer_id = ua.selected_answer_id
                    WHERE ua.question_id = qn.question_id 
                    AND ua.user_id = (SELECT user_id FROM user WHERE email = ${userEmail})
                    AND a.is_correct = 1
                )
                AND NOT EXISTS (
                    SELECT 1 
                    FROM user_answer ua 
                    JOIN answer a ON a.answer_id = ua.selected_answer_id
                    WHERE ua.question_id = qn.question_id 
                    AND ua.user_id = (SELECT user_id FROM user WHERE email = ${userEmail})
                    AND a.is_correct = 0
                )
                THEN 1 ELSE 0 
            END AS is_correct,

            EXISTS (
                SELECT 1 FROM user_answer ua 
                WHERE ua.question_id = qn.question_id 
                AND ua.user_id = (SELECT user_id FROM user WHERE email = ${userEmail})
            ) AS answered

        FROM question qn
        WHERE qn.quiz_id = ${quizId} AND qn.is_deleted = FALSE
    ) perq ON perq.question_id = q.question_id

    WHERE q.quiz_id = ${quizId} 
    AND q.is_deleted = FALSE 
    AND q.question_type NOT IN ('rating', 'feedback')
    GROUP BY qz.passing_score
`;

# Get analytics for a quiz across all users with score and completion metrics.
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function getQuizAnalyticsQuery(int quizId) returns sql:ParameterizedQuery => `
    WITH quiz_stats AS (
        SELECT
            COUNT(*) AS total_questions,
            COUNT(
                CASE
                    WHEN question_type NOT IN ('rating', 'feedback')
                    THEN 1
                END
            ) AS scorable_questions
        FROM question
        WHERE quiz_id = ${quizId}
            AND is_deleted = false
    ),

    user_question_scores AS (
        SELECT
            ua.user_id,
            qn.question_id,
            qn.question_type,

            CASE
                WHEN qn.question_type IN ('rating', 'feedback') THEN 0

                WHEN (
                    SELECT COUNT(*)
                    FROM answer a2
                    WHERE a2.question_id = qn.question_id
                        AND a2.is_correct = 1
                ) = SUM(
                    CASE
                        WHEN a.is_correct = 1 THEN 1
                        ELSE 0
                    END
                )
                AND SUM(
                    CASE
                        WHEN a.is_correct = 0 THEN 1
                        ELSE 0
                    END
                ) = 0
                THEN 1

                ELSE 0
            END AS is_correct,

            MAX(ua.submitted_at) AS submitted_at

        FROM question qn
        JOIN user_answer ua
            ON ua.question_id = qn.question_id
        LEFT JOIN answer a
            ON a.answer_id = ua.selected_answer_id

        WHERE qn.quiz_id = ${quizId}
            AND qn.is_deleted = false

        GROUP BY
            ua.user_id,
            qn.question_id,
            qn.question_type
    )

    SELECT
        u.user_id,
        u.email AS user_email,
        CONCAT(u.first_name, ' ', u.last_name) AS user_name,

        CAST(qs.total_questions AS SIGNED) AS total_questions,
        CAST(COUNT(uqs.question_id) AS SIGNED) AS answered,

        CAST(SUM(uqs.is_correct) AS SIGNED) AS correct_answers,

        ROUND(
            SUM(uqs.is_correct)
            / NULLIF(qs.scorable_questions, 0) * 100,
            2
        ) AS score_percentage,

        CAST(SUM(uqs.is_correct) AS SIGNED) AS marks_obtained,

        IF(
            COUNT(uqs.question_id) = qs.total_questions,
            1,
            0
        ) AS completed,

        IF(
            ROUND(
                SUM(uqs.is_correct)
                / NULLIF(qs.scorable_questions, 0) * 100,
                2
            ) >= qz.passing_score,
            1,
            0
        ) AS passed,

        MAX(uqs.submitted_at) AS submitted_at

    FROM user u
    JOIN user_question_scores uqs
        ON uqs.user_id = u.user_id
    JOIN quiz qz
        ON qz.quiz_id = ${quizId}
    CROSS JOIN quiz_stats qs

    WHERE qz.is_deleted = false

    GROUP BY
        u.user_id,
        u.email,
        u.first_name,
        u.last_name,
        qs.total_questions,
        qs.scorable_questions,
        qz.passing_score

    ORDER BY score_percentage DESC
`;

# Get user's submitted answers for a quiz.
#
# + quizId - Quiz ID
# + userId - User ID
# + return - SQL parameterized query
isolated function getUserSubmittedAnswersQuery(int quizId, int userId) returns sql:ParameterizedQuery => `
    SELECT
        qn.question_id,
        qn.question_number,
        qn.question_text,
        qn.question_type,
        CAST(IF(qn.ref_links IS NULL, NULL, qn.ref_links) AS JSON) AS ref_links,
        a.answer_id AS selected_answer_id,
        a.answer_text,
        (
            SELECT GROUP_CONCAT(a2.answer_text ORDER BY a2.answer_id SEPARATOR ', ')
            FROM answer a2
            WHERE a2.question_id = qn.question_id
                AND a2.is_correct = 1
        ) AS correct_answer_text,
        a.is_correct,
        ua.submitted_at
    FROM 
        question qn
    JOIN 
        user_answer ua ON ua.question_id = qn.question_id AND ua.user_id = ${userId}
    JOIN 
        answer a ON a.answer_id = ua.selected_answer_id
    WHERE 
        qn.quiz_id = ${quizId} AND qn.is_deleted = false
        ORDER BY qn.question_number ASC
`;

# Get feedback for a user's quiz submission.
#
# + quizId - Quiz ID
# + userId - User ID
# + return - SQL parameterized query
isolated function getUserFeedbackQuery(int quizId, int userId) returns sql:ParameterizedQuery => `
    SELECT 
        feedback_id, 
        quiz_id, 
        user_id, 
        feedback_text, 
        created_at
    FROM 
        quiz_feedback
    WHERE 
        quiz_id = ${quizId} 
        AND user_id = ${userId}
`;

# Get all feedback submissions for a quiz.
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function getAllFeedbackForQuizQuery(int quizId) returns sql:ParameterizedQuery => `
    SELECT
        qf.feedback_id,
        qf.quiz_id,
        qf.user_id,
        CONCAT(u.first_name, ' ', u.last_name) AS user_name,
        u.email                                AS user_email,
        qf.feedback_text,
        qf.created_at
    FROM 
        quiz_feedback qf
    JOIN 
        user u ON u.user_id = qf.user_id
    WHERE 
        qf.quiz_id = ${quizId}
        ORDER BY qf.created_at DESC
`;

# Get quiz title by ID.
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function getQuizTitleQuery(int quizId) returns sql:ParameterizedQuery => `
    SELECT 
        title 
    FROM quiz 
    WHERE quiz_id = ${quizId} AND is_deleted = false
`;

# Get assigned user IDs for a quiz.
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function getAssignedUserIdsQuery(int quizId) returns sql:ParameterizedQuery => `
    SELECT 
        (
            SELECT COALESCE(array_agg((v)::int), ARRAY[]::int[])
            FROM jsonb_array_elements_text(assigned_user_ids) AS v
        ) AS assigned_user_ids
    FROM quiz 
    WHERE quiz_id = ${quizId} AND is_deleted = false
`;

# Get all answers for a quiz (public view - excludes is_correct).
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function getAnswersByQuizIdPublicQuery(int quizId) returns sql:ParameterizedQuery => `
    SELECT
        a.answer_id, 
        a.question_id, 
        a.answer_text,
        a.created_at, 
        a.updated_at
    FROM 
        answer a
    JOIN 
        question q ON a.question_id = q.question_id
    WHERE 
        q.quiz_id = ${quizId}
        AND q.is_deleted = false
`;

# Get all answers for a quiz (includes is_correct).
#
# + quizId - Quiz ID
# + return - SQL parameterized query
isolated function getAnswersByQuizIdQuery(int quizId) returns sql:ParameterizedQuery => `
    SELECT
        a.answer_id, 
        a.question_id, 
        a.answer_text, 
        a.is_correct,
        a.created_by, 
        a.updated_by, 
        a.created_at, 
        a.updated_at
    FROM 
        answer a
    JOIN 
        question q ON a.question_id = q.question_id
    WHERE 
        q.quiz_id = ${quizId}
        AND q.is_deleted = false
`;
