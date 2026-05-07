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
            if !isFirst { fieldQuery = sql:queryConcat(fieldQuery, `, `); }
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
            if !isFirst { fieldQuery = sql:queryConcat(fieldQuery, `, `); }
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
            if !isFirst { fieldQuery = sql:queryConcat(fieldQuery, `, `); }
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
