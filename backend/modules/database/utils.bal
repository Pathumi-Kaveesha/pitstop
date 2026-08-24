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

import pitstop.constants;
import pitstop.types;

import ballerina/lang.regexp;
import ballerina/log;
import ballerina/sql;
import ballerina/time;

# Build the database update query with dynamic attributes.
#
# + mainQuery - Main query without the new sub query  
# + subQueries - Sub Query array which needed to be appended with the main query
# + return - Dynamically build sql:ParameterizedQuery
isolated function buildSqlUpdateQuery(sql:ParameterizedQuery mainQuery, sql:ParameterizedQuery[] subQueries)
    returns sql:ParameterizedQuery {

    sql:ParameterizedQuery updatedQuery = mainQuery;
    int i = 0;
    foreach var subQuery in subQueries {
        i += 1;
        if i == 1 {
            updatedQuery = sql:queryConcat(updatedQuery, subQuery);
            continue;
        }
        updatedQuery = sql:queryConcat(updatedQuery, ` , `, subQuery);
    }
    return updatedQuery;
}

# Determines whether to show suggested content section based on pinned contents.
#
# + userEmail - User email
# + suggestedContentsLimit - Number of records to retrieve
# + suggestedContentsThreshold - Minimum number of suggestions required to show the section
# + return - Whether to show suggested section or error
public isolated function hasSuggestedContentFromPinnedContents(string userEmail, int suggestedContentsLimit,
        int suggestedContentsThreshold) returns boolean|error {

    types:ContentResponse[]|error result = getSuggestionsFromPinnedContents(userEmail, suggestedContentsLimit, 0);

    if result is types:ContentResponse[] {
        if result.length() > suggestedContentsThreshold {
            return true;
        }
    } else {
        log:printWarn("Failed to fetch suggestions from pinned contents for user ", result,
                userEmail = userEmail);
    }
    return false;
}

# Extract unique tags from content responses.
#
# + contents - Content responses
# + return - Array of unique tags
isolated function extractUniqueTags(types:ContentResponse[] contents) returns string[] {
    map<boolean> tagMap = {};

    foreach var content in contents {
        string[]? tags = content.tags;
        if tags is string[] {
            foreach string tag in tags {
                tagMap[tag] = true;
            }
        }
    }

    string[] uniqueTags = tagMap.keys();
    log:printDebug("Unique tags extracted", count = uniqueTags.length());
    return tagMap.keys();
}

# Get related contents based on tags and keywords.
#
# + userEmail - User email
# + uniqueTags - Unique tags
# + searchedKeywords - Searched keywords
# + 'limit - Number of records to retrieve
# + return - Related contents or error
isolated function getRelatedContents(string userEmail, string[] uniqueTags, string[] searchedKeywords, int 'limit)
    returns types:ContentResponse[]|error {

    if uniqueTags.length() == 0 && searchedKeywords.length() == 0 {
        log:printDebug("No tags or keywords for related contents");
        return [];
    }

    types:ContentResponse[] contents = check getContentsByTagsAndKeywords(
            userEmail, uniqueTags, searchedKeywords, 'limit, 0);
    log:printDebug("Related contents fetched", count = contents.length());
    return contents;
}

# Merge and deduplicate contents with fallback to pinned suggestions.
#
# + viewedBasedContents - Contents based on viewed items
# + relatedContents - Contents based on tags and keywords
# + userEmail - User email
# + 'limit - Maximum number of contents to return
# + return - Final merged and deduplicated contents or error
isolated function mergeAndDeduplicateContents(types:ContentResponse[] viewedBasedContents,
        types:ContentResponse[] relatedContents, string userEmail, int 'limit)
    returns types:ContentResponse[]|error {

    map<boolean> uniqueContentIds = {};
    types:ContentResponse[] finalContents = [];

    // Add viewed-based contents first
    foreach var content in viewedBasedContents {
        string key = content.contentId.toString();
        if !uniqueContentIds.hasKey(key) {
            uniqueContentIds[key] = true;
            finalContents.push(content);
        }
    }

    // Add related contents
    foreach var content in relatedContents {
        string key = content.contentId.toString();
        if !uniqueContentIds.hasKey(key) {
            uniqueContentIds[key] = true;
            finalContents.push(content);
            if finalContents.length() >= 'limit {
                log:printDebug("Final suggested contents", count = finalContents.length(), email = userEmail);
                return finalContents;
            }
        }
    }

    // Fallback: pinned suggestions if still under limit
    if finalContents.length() < 'limit {
        int remaining = 'limit - finalContents.length();
        types:ContentResponse[] fallback = check getSuggestionsFromPinnedContents(userEmail, remaining, 0);

        foreach var content in fallback {
            string key = content.contentId.toString();
            if !uniqueContentIds.hasKey(key) {
                finalContents.push(content);
                uniqueContentIds[key] = true;
                if finalContents.length() >= 'limit {
                    break;
                }
            }
        }
    }

    log:printDebug("Final suggested contents", count = finalContents.length(), email = userEmail);
    return finalContents;
}

# Parse tags from comma-separated string.
#
# + tagsString - Tags as string or ()
# + return - Array of parsed tags
isolated function parseTagsFromString(string? tagsString) returns string[] {
    if tagsString is () {
        log:printDebug("No tags string provided");
        return [];
    }

    string tagsStr = <string>tagsString;
    if (tagsStr.trim().length() == 0) {
        log:printDebug("Empty tags string after trimming");
        return [];
    }

    regexp:RegExp comma = re `,`;
    string[] tags = comma.split(tagsStr);

    return from string part in tags
        let string trimmed = part.trim()
        where trimmed.length() > 0
        select trimmed;
}

# Trim whitespace and filter out empty strings from an array.
#
# + arr - Input string array
# + return - Trimmed array
isolated function trimArray(string[] arr) returns string[] =>
    from string element in arr
let string trimmed = element.trim()
where trimmed.length() > 0
select trimmed;

# Transform content response from database format to application format.
#
# + customContentTheme - Custom theme
# + tags - Tags as comma separated string or ()
# + contentRest - Rest of the content response fields
# + return - Transformed content response or error
public isolated function transformContentResponse(string? customContentTheme, string? tags, 
        types:ContentResponse contentRest) returns types:ContentResponse|error {
    
    types:ContentResponse convertedContent = {...contentRest};
    
    if customContentTheme is string {
        types:CustomTheme convertedCustomContentTheme = check customContentTheme.fromJsonStringWithType();
        convertedContent.customContentTheme = convertedCustomContentTheme;
    }
    
    if tags is string {
        regexp:RegExp separator = re `,`;
        string[] tagsArray = separator.split(tags);
        convertedContent.tags = tagsArray;
    }
    
    return convertedContent;
}

# Transform section response from database format to application format.
#
# + customSectionTheme - Custom theme
# + sectionRest - Rest of the section response fields
# + return - Transformed section response or error
public isolated function transformSectionResponse(string? customSectionTheme, types:Section sectionRest) 
        returns types:Section|error {
    
    types:Section convertedSection = {...sectionRest};
    
    if customSectionTheme is string {
        types:CustomTheme convertedCustomSectionTheme = check customSectionTheme.fromJsonStringWithType();
        convertedSection.customSectionTheme = convertedCustomSectionTheme;
    }
    
    return convertedSection;
}

# Convert a PinnedContentResponse DB row into a ContentResponse.
#
# + row - Pinned content DB row
# + return - ContentResponse or error
public isolated function toContentResponseFromPinned(PinnedContentResponse row)
        returns types:ContentResponse|error {

    types:ContentResponse convertedContent = {
        contentId: row.contentId,
        sectionId: row.sectionId,
        contentLink: row.contentLink,
        contentType: row.contentType,
        contentSubtype: row.contentSubtype,
        thumbnail: row.thumbnail,
        note: row.note,
        description: row.description,
        likesCount: row.likesCount,
        status: row.status,
        contentOrder: row.contentOrder,
        createdOn: row.createdOn,
        commentCount: row.commentCount,
        customContentTheme: (),
        tags: (),
        routeId: row.routeId,
        isVisible: row.isVisible,
        isReused: row.isReused
    };

    if row.customContentTheme is string {
        types:CustomTheme|error convertedCustomContentTheme = row.customContentTheme.fromJsonStringWithType();
        if convertedCustomContentTheme is error {
            log:printError(constants:GET_PINNED_CONTENT_ERROR, convertedCustomContentTheme);
            return error(constants:GET_PINNED_CONTENT_ERROR);
        }
        convertedContent.customContentTheme = convertedCustomContentTheme;
    }

    if row.tags is string {
        regexp:RegExp separator = re `,`;
        convertedContent.tags = separator.split(row.tags);
    }

    return convertedContent;
}

# Format ISO date string to MySQL datetime format.
#
# + dateTimeStr - ISO date string
# + return - Formatted date string or ()
public isolated function formatDateTime(string? dateTimeStr) returns string? {
    if dateTimeStr is () {
        return ();
    }
    string formatted = regexp:replace(re `T`, dateTimeStr, " ");
    formatted = regexp:replace(re `\.\d+Z$`, formatted, "");
    formatted = regexp:replace(re `Z$`, formatted, "");
    return formatted;
}

# Orchestrates quiz creation with nested questions and answers in a single transaction.
#
# + quiz - Quiz payload with nested questions and answers
# + createdBy - User email who created the quiz
# + return - Created quiz ID or error
isolated function createQuizWithQuestionsAndAnswers(QuizCreatePayload quiz, string createdBy) returns int|error {
    int quizId;

    transaction {
        sql:ExecutionResult result = check dbClient->execute(createQuizQuery(quiz, createdBy));
        quizId = check result.lastInsertId.ensureType(int);

        foreach int questionIndex in 0 ..< quiz.questions.length() {
            NestedQuestionPayload question = quiz.questions[questionIndex];
            QuestionCreatePayload qPayload = {
                questionNumber: questionIndex + 1,
                questionText: question.text,
                questionType: question.'type,
                refLinks: question.refLinks
            };
            int questionId = check createQuestion(quizId, qPayload, createdBy);

            foreach NestedAnswerPayload answer in question.answers {
                AnswerPayload aPayload = {
                    answerText: answer.text,
                    isCorrect: answer.isCorrect
                };
                _ = check createAnswer(questionId, aPayload, createdBy);
            }
        }
        check commit;
    }
    return quizId;
}

# Orchestrates quiz update with nested questions and answers in a single transaction.
#
# + quizId - Quiz ID to update
# + payload - Updated quiz payload with nested questions and answers
# + updatedBy - User email who updated the quiz
# + return - Total affected rows for the quiz update or error
isolated function updateQuizWithQuestionsAndAnswers(int quizId, QuizUpdatePayload payload, string updatedBy)
    returns int|error? {

    int totalAffectedRows = 0;

    transaction {
        sql:ExecutionResult result = check dbClient->execute(updateQuizQuery(quizId, payload, updatedBy));
        totalAffectedRows = check result.affectedRowCount.ensureType(int);

        NestedQuestionPayload[]? questions = payload.questions;
        if questions is NestedQuestionPayload[] {
            _ = check dbClient->execute(deleteAnswersByQuizIdQuery(quizId));
            _ = check dbClient->execute(deleteQuestionsByQuizIdQuery(quizId));

            foreach int i in 0 ..< questions.length() {
                NestedQuestionPayload nestedQuestion = questions[i];
                QuestionCreatePayload qPayload = {
                    questionNumber: i + 1,
                    questionText: nestedQuestion.text,
                    questionType: nestedQuestion.'type,
                    refLinks: nestedQuestion.refLinks
                };
                int questionId = check createQuestion(quizId, qPayload, updatedBy);

                foreach NestedAnswerPayload nestedAnswer in nestedQuestion.answers {
                    AnswerPayload aPayload = {
                        answerText: nestedAnswer.text,
                        isCorrect: nestedAnswer.isCorrect
                    };
                    _ = check createAnswer(questionId, aPayload, updatedBy);
                }
            }
        }
        check commit;
    }
    return totalAffectedRows;
}

# Submits user answers with conditional logic for feedback and re-attempts in a single transaction.
#
# + quizId - Quiz ID being attempted
# + userId - User ID submitting the answers
# + answers - Array of user answer payloads with question type and feedback
# + return - Total affected rows for the submission or error
isolated function submitUserAnswersWithFeedback(int quizId, int userId, UserAnswerPayload[] answers) returns int|error {
    
    int totalAffected = 0;

    transaction {
        foreach UserAnswerPayload ua in answers {
            if ua.questionType == "feedback" {
                string feedbackText = ua.feedbackText ?: "";
                sql:ExecutionResult fbResult = check dbClient->execute(
                    insertQuizFeedbackQuery(quizId, userId, feedbackText)
                );

                int? rowCount = fbResult.affectedRowCount;
                if rowCount is int {
                    totalAffected += rowCount;
                }
            } else {
                _ = check dbClient->execute(
                    deleteUserAnswersForQuestionQuery(quizId, userId, ua.questionId)
                );
                foreach int answerId in ua.selectedAnswerIds {
                    sql:ExecutionResult result = check dbClient->execute(
                        insertUserAnswerQuery(quizId, userId, ua.questionId, answerId)
                    );

                    int? rowCount = result.affectedRowCount;
                    if rowCount is int {
                        totalAffected += rowCount;
                    }
                }
            }
        }
        check commit;
    }
    return totalAffected;
}

# Builds the quiz result for a user.
#
# + quizId - Quiz ID for which to build the result
# + userEmail - User email to fetch the result for
# + return - QuizResult with transformations applied or error
isolated function buildQuizResultWithTransformations(int quizId, string userEmail) returns QuizResult|error? {
    QuizResultRaw|sql:Error result = dbClient->queryRow(getUserResultQuery(quizId, userEmail));
    if result is sql:Error {
        return result is sql:NoRowsError ? () : result;
    }

    int|error? userId = getUserIdByUserEmail(userEmail);
    if userId is () {
        return ();
    }
    if userId is error {
        return userId;
    }

    SubmittedAnswer[]|error answers = getUserSubmittedAnswers(quizId, userId);
    if answers is error {
        return answers;
    }

    UserFeedback|error? feedback = getUserFeedback(quizId, userId);
    if feedback is error {
        return feedback;
    }

    return {
        totalQuestions: result.totalQuestions,
        correctAnswers: <int>(result.correctAnswers ?: 0),
        scorePercentage: result.scorePercentage,
        marksObtained: <int>(result.marksObtained ?: 0),
        passed: result.passed == 1,
        completed: result.completed == 1,
        answers,
        feedback
    };
}

# Transforms raw database rows of submitted answers into structured SubmittedAnswer records.
#
# + resultStream - Stream of raw database rows for submitted answers
# + return - Array of SubmittedAnswer or error
isolated function transformRawAnswersToSubmittedAnswers(stream<SubmittedAnswer, sql:Error?> resultStream)
        returns SubmittedAnswer[]|error {
            
    SubmittedAnswer[] answers = [];

    error? err = from SubmittedAnswer raw in resultStream
        do {
            int? qId = raw.questionId;
            int? qNum = raw.questionNumber;
            string? qText = raw.questionText;
            string? qType = raw.questionType;
            int? ansId = raw.selectedAnswerId;
            string? ansText = raw.selectedAnswerText;
            boolean? isCorrect = raw.isCorrect;
            string? submittedAt = raw.submittedAt;

            if qId is int && qNum is int && qText is string && qType is string &&
                ansId is int && ansText is string && isCorrect is boolean && submittedAt is string {

                SubmittedAnswer answer = {
                    questionId: qId,
                    questionNumber: qNum,
                    questionText: qText,
                    questionType: qType,
                    refLinks: raw.refLinks,
                    selectedAnswerId: ansId,
                    selectedAnswerText: ansText,
                    correctAnswerText: raw.correctAnswerText,
                    isCorrect: isCorrect,
                    submittedAt: submittedAt
                };
                answers.push(answer);
            }
        };

    if err is error {
        return err;
    }

    return answers;
}

# Shift and format a UTC date string to the local timezone of the client based on header.
#
# + dueDateStr - UTC due date string from database
# + offsetHeader - Header representing the timezone offset in minutes from the client
# + return - Formatted ISO-8601 string with local timezone offset or error
public isolated function formatDueDateWithOffset(string dueDateStr, string? offsetHeader) returns string|error {
    string formatted = dueDateStr.trim();
    if formatted.includes(" ") {
        formatted = regexp:replace(re ` `, formatted, "T");
    }
    if !formatted.endsWith("Z") && !formatted.includes("+") {
        formatted = formatted + "Z";
    }

    time:Utc utc = check time:utcFromString(formatted);

    int offsetMinutes = 0;
    if offsetHeader is string {
        var parsedOffset = int:fromString(offsetHeader);
        if parsedOffset is int {
            offsetMinutes = parsedOffset;
        }
    }

    if offsetMinutes == 0 {
        return formatted;
    }

    int offsetSeconds = -offsetMinutes * 60;
    time:Utc shifted = [utc[0] + offsetSeconds, utc[1]];
    string localUtcStr = time:utcToString(shifted);
    string withoutZ = localUtcStr.substring(0, localUtcStr.length() - 1);
    int absOffset = offsetMinutes < 0 ? -offsetMinutes : offsetMinutes;
    int offHours = absOffset / 60;
    int offMins = absOffset % 60;

    string sign = offsetMinutes < 0 ? "+" : "-";
    string offHoursStr = offHours < 10 ? "0" + offHours.toString() : offHours.toString();
    string offMinsStr = offMins < 10 ? "0" + offMins.toString() : offMins.toString();

    return string `${withoutZ}${sign}${offHoursStr}:${offMinsStr}`;
}

# Validates and normalizes timezone offset in minutes from UTC.
#
# + timezoneOffsetMinutes - Optional timezone offset input in minutes
# + return - Validated timezone offset integer
isolated function getValidatedTzOffset(int? timezoneOffsetMinutes) returns int {
    int rawTzOffset = timezoneOffsetMinutes ?: DEFAULT_TZ_OFFSET_MINUTES;

    if rawTzOffset < MIN_TZ_OFFSET_MINUTES || rawTzOffset > MAX_TZ_OFFSET_MINUTES {
        log:printWarn(string `Invalid timezone offset received: ${rawTzOffset}. Falling back to UTC (0).`);
        return 0;
    }

    return rawTzOffset;
}

# Validates whether a date string strictly follows canonical ISO YYYY-MM-DD format with a valid calendar date.
# Prevents single-digit strings and impossible dates (e.g., '2026-13-40', '2026-02-31') from corrupting SQL predicates.
#
# + dateStr - Date string to validate
# + return - True if strictly YYYY-MM-DD and a valid calendar date, false otherwise
isolated function isValidCanonicalDate(string dateStr) returns boolean {
    if dateStr.length() != 10 {
        return false;
    }
    if dateStr.substring(4, 5) != "-" || dateStr.substring(7, 8) != "-" {
        return false;
    }
    foreach int i in 0 ..< 10 {
        if i == 4 || i == 7 {
            continue;
        }
        string charStr = dateStr.substring(i, i + 1);
        if charStr < "0" || charStr > "9" {
            return false;
        }
    }

    int|error year = int:fromString(dateStr.substring(0, 4));
    int|error month = int:fromString(dateStr.substring(5, 7));
    int|error day = int:fromString(dateStr.substring(8, 10));

    if year is error || month is error || day is error {
        return false;
    }

    if month < 1 || month > 12 || day < 1 || day > 31 {
        return false;
    }

    // Days-per-month validation
    if month == 4 || month == 6 || month == 9 || month == 11 {
        if day > 30 {
            return false;
        }
    } else if month == 2 {
        boolean isLeapYear = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        int maxFebDays = isLeapYear ? 29 : 28;
        if day > maxFebDays {
            return false;
        }
    }

    return true;
}

# Constructs parameterized SQL predicates for date range filtering.
# Converts local date inputs to UTC timestamp boundaries to enable index-seeking on event_timestamp.
# Enforces a strict minimum start date of PROD_LAUNCH_DATE_STR (2026-08-21) across all analytics queries.
#
# + startDate - Optional start date string (YYYY-MM-DD)
# + endDate - Optional end date string (YYYY-MM-DD)
# + tzOffset - Timezone offset in minutes for local day alignment
# + return - Parameterized SQL query fragment
isolated function buildDateRangePredicates(string? startDate, string? endDate, int tzOffset = DEFAULT_TZ_OFFSET_MINUTES) 
    returns sql:ParameterizedQuery {

    string? cleanStart = startDate is string ? startDate.trim() : ();
    string? cleanEnd = endDate is string ? endDate.trim() : ();

    // Strictly enforce minimum production launch date (2026-08-21)
    string effectiveStart = PROD_LAUNCH_DATE_STR;
    if cleanStart is string && isValidCanonicalDate(cleanStart) && cleanStart > PROD_LAUNCH_DATE_STR {
        effectiveStart = cleanStart;
    }

    sql:ParameterizedQuery query = ` AND l.event_timestamp >= DATE_SUB(${effectiveStart}, INTERVAL ${tzOffset} MINUTE)`;

    if cleanEnd is string && isValidCanonicalDate(cleanEnd) {
        query = sql:queryConcat(query, ` AND l.event_timestamp < DATE_SUB(DATE_ADD(${cleanEnd}, INTERVAL 1 DAY), INTERVAL ${tzOffset} MINUTE)`);
    }

    return query;
}

# Constructs parameterized SQL predicate for regional team filtering (supports multi-select).
#
# + region - Optional comma-separated region or team names
# + return - Parameterized SQL query fragment
isolated function buildRegionPredicate(string? region) returns sql:ParameterizedQuery {
    if region is () || region.trim() == "" {
        return ``;
    }
    string[] regions = splitCommaSeparated(region);
    if regions.length() == 0 {
        return ``;
    }
    if regions.length() == 1 {
        return ` AND UPPER(l.region) = ${regions[0].trim().toUpperAscii()}`;
    }
    sql:ParameterizedQuery query = ` AND UPPER(l.region) IN (`;
    foreach int i in 0 ..< regions.length() {
        if i > 0 {
            query = sql:queryConcat(query, `, `);
        }
        query = sql:queryConcat(query, `${regions[i].trim().toUpperAscii()}`);
    }
    query = sql:queryConcat(query, `)`);
    return query;
}

# Constructs parameterized SQL predicate for individual user email filtering (supports multi-select).
#
# + userEmail - Optional comma-separated target user emails
# + return - Parameterized SQL query fragment
isolated function buildUserEmailPredicate(string? userEmail) returns sql:ParameterizedQuery {
    if userEmail is () || userEmail.trim() == "" {
        return ``;
    }
    string[] emails = splitCommaSeparated(userEmail);
    if emails.length() == 0 {
        return ``;
    }
    if emails.length() == 1 {
        return ` AND LOWER(TRIM(l.user_email)) = ${emails[0].toLowerAscii()}`;
    }
    sql:ParameterizedQuery query = ` AND LOWER(TRIM(l.user_email)) IN (`;
    foreach int i in 0 ..< emails.length() {
        string email = emails[i].toLowerAscii();
        if i > 0 {
            query = sql:queryConcat(query, `, `);
        }
        query = sql:queryConcat(query, `${email}`);
    }
    query = sql:queryConcat(query, `)`);
    return query;
}

# Constructs parameterized SQL predicates for single page route filtering.
#
# + pageRoute - Optional target page route string
# + return - Parameterized SQL query fragment
isolated function buildPageRoutePredicate(string? pageRoute) returns sql:ParameterizedQuery {
    if pageRoute is () || pageRoute.trim() == "" {
        return ``;
    }
    
    // Trim spaces and strip trailing slash for consistent matching
    string rawRoute = pageRoute.trim();
    string cleanRoute = (rawRoute.length() > 1 && rawRoute.endsWith("/")) 
        ? rawRoute.substring(0, rawRoute.length() - 1) 
        : rawRoute;

    if cleanRoute == "/" {
        return ` AND (
            TRIM(r.route_path) = '/'
            OR TRIM(parent_r.route_path) = '/'
            OR l.meta_page_route = '/'
            OR (l.meta_page_route IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(l.metadata, '$.path')) = '/')
        )`;
    }

    return ` AND (
        LOWER(TRIM(r.route_path)) LIKE CONCAT('%', LOWER(TRIM(${cleanRoute})), '%')
        OR LOWER(TRIM(parent_r.route_path)) LIKE CONCAT('%', LOWER(TRIM(${cleanRoute})), '%')
        OR LOWER(TRIM(r.label)) LIKE CONCAT('%', REPLACE(LOWER(TRIM(${cleanRoute})), '/', ''), '%')
        OR LOWER(TRIM(parent_r.label)) LIKE CONCAT('%', REPLACE(LOWER(TRIM(${cleanRoute})), '/', ''), '%')
        OR LOWER(REPLACE(r.label, ' ', '-')) LIKE CONCAT('%', REPLACE(LOWER(TRIM(${cleanRoute})), '/', ''), '%')
        OR LOWER(REPLACE(parent_r.label, ' ', '-')) LIKE CONCAT('%', REPLACE(LOWER(TRIM(${cleanRoute})), '/', ''), '%')
        OR l.meta_page_route = ${cleanRoute}
        OR l.meta_page_route LIKE CONCAT(${cleanRoute}, '/%')
        OR (l.meta_page_route IS NULL AND (
            JSON_UNQUOTE(JSON_EXTRACT(l.metadata, '$.path')) = ${cleanRoute}
            OR JSON_UNQUOTE(JSON_EXTRACT(l.metadata, '$.path')) LIKE CONCAT(${cleanRoute}, '/%')
        ))
    )`;
}

# Helper function to split comma-separated filter strings into clean arrays.
#
# + input - Optional comma-separated string (e.g. "NA, APAC, LATAM")
# + return - Array of clean string items
isolated function splitCommaSeparated(string input) returns string[] {
    string[] parts = [];
    string current = "";
    int len = input.length();
    foreach int i in 0 ..< len {
        string char = input.substring(i, i + 1);
        if char == "," {
            if current.trim() != "" {
                parts.push(current.trim());
            }
            current = "";
        } else {
            current += char;
        }
    }
    if current.trim() != "" {
        parts.push(current.trim());
    }
    return parts;
}
