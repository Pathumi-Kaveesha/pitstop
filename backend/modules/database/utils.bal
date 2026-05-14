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

import pitstop.types;
import pitstop.constants;

import ballerina/lang.regexp;
import ballerina/log;
import ballerina/sql;

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
isolated function createQuizWithQuestionsAndAnswers(QuizPayload quiz, string createdBy) returns int|error {
    int quizId;
    
    transaction {
        // Create base quiz record
        sql:ExecutionResult result = check dbClient->execute(createQuizQuery(quiz, createdBy));
        quizId = check result.lastInsertId.ensureType(int);

        // Process each question
        foreach int i in 0 ..< quiz.questions.length() {
            var q = quiz.questions[i];
            QuestionPayload qPayload = {
                questionNumber: i + 1,
                questionText: q.text,
                questionType: q.'type,
                refLinks: q.refLinks
            };
            int questionId = check createQuestion(quizId, qPayload, createdBy);

            // Process each answer for this question
            foreach var a in q.answers {
                AnswerPayload aPayload = {
                    answerText: a.text,
                    isCorrect: a.isCorrect
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
isolated function updateQuizWithQuestionsAndAnswers(int quizId, UpdateQuizPayload payload, string updatedBy) returns int|error? {
    int totalAffectedRows = 0;
    
    transaction {
        // Update base quiz record
        sql:ExecutionResult result = check dbClient->execute(updateQuizQuery(quizId, payload, updatedBy));
        totalAffectedRows = check result.affectedRowCount.ensureType(int);

        // Check if questions need to be updated
        NestedQuestionPayload[]? questions = payload.questions;
        if questions is NestedQuestionPayload[] {
            // Delete existing answers first (FK constraint)
            _ = check dbClient->execute(deleteAnswersByQuizIdQuery(quizId));
            
            // Delete existing questions
            _ = check dbClient->execute(deleteQuestionsByQuizIdQuery(quizId));

            // Recreate questions with new answers
            foreach int i in 0 ..< questions.length() {
                var q = questions[i];
                QuestionPayload qPayload = {
                    questionNumber: i + 1,
                    questionText: q.text,
                    questionType: q.'type,
                    refLinks: q.refLinks
                };
                int questionId = check createQuestion(quizId, qPayload, updatedBy);

                foreach var a in q.answers {
                    AnswerPayload aPayload = {
                        answerText: a.text,
                        isCorrect: a.isCorrect
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
        // Process each answer with conditional logic
        foreach UserAnswerPayload ua in answers {
            if ua.questionType == "feedback" {
                // Handle feedback submission
                string feedbackText = ua.feedbackText ?: "";
                sql:ExecutionResult fbResult = check dbClient->execute(
                    insertQuizFeedbackQuery(quizId, userId, feedbackText)
                );
                
                int? rowCount = fbResult.affectedRowCount;
                if rowCount is int {
                    totalAffected += rowCount;
                }
            } else {
                // Handle regular answer submission (handles re-attempts)
                _ = check dbClient->execute(
                    deleteUserAnswersForQuestionQuery(quizId, userId, ua.questionId)
                );
                
                // Insert one row per selected answer
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

# builds the quiz result for a user.
# + quizId - Quiz ID for which to build the result
# + userEmail - User email to fetch the result for
# + return - QuizResult with transformations applied or error
isolated function buildQuizResultWithTransformations(int quizId, string userEmail) returns sql:Error|QuizResult|error {
    // Step 1: Get raw score summary
    QuizResultRaw|sql:Error raw = dbClient->queryRow(getUserResultQuery(quizId, userEmail));
    if raw is sql:Error {
        return raw;
    }

    int|error? userId = getUserIdByUserEmail(userEmail);
    if userId is () || userId is error {
        return error("User not found for email: " + userEmail);
    }

    SubmittedAnswer[]|error answers = getUserSubmittedAnswers(quizId, userId);
    if answers is error {
        return answers;
    }

    foreach var i in 0 ..< answers.length() {
        if answers[i].isCorrect {
            answers[i].refLinks = ();
        }
    }

    QuizFeedback|error? feedback = getUserFeedback(quizId, userId);
    if feedback is error {
        return feedback;
    }

    return {
        totalQuestions: raw.totalQuestions,
        correctAnswers: <int>(raw.correctAnswers ?: 0),
        scorePercentage: raw.scorePercentage,
        totalMarks: <int>(raw.totalMarks ?: 0),
        marksObtained: <int>(raw.marksObtained ?: 0),
        passed: raw.passed == 1,
        completed: raw.completed == 1,
        answers: answers,
        feedback: feedback
    };
}

# Transforms raw database rows of submitted answers into structured SubmittedAnswer records.
# + resultStream - Stream of raw database rows for submitted answers
# + return - Array of SubmittedAnswer or error
isolated function transformRawAnswersToSubmittedAnswers(stream<record {}, sql:Error?> resultStream) 
        returns SubmittedAnswer[]|error {
    SubmittedAnswer[] answers = [];

    error? err = from record {} raw in resultStream
        do {
            map<anydata> row = <map<anydata>>raw;

            anydata qId = row.get("question_id");
            anydata qNum = row.get("question_number");
            anydata qText = row.get("question_text");
            anydata qType = row.get("question_type");
            anydata refLinks = row.get("ref_links");
            anydata ansId = row.get("selected_answer_id");
            anydata ansText = row.get("answer_text");
            anydata isCorrect = row.get("is_correct");
            anydata submittedAt = row.get("submitted_at");

            if qId is int && qNum is int && qText is string && qType is string &&
                ansId is int && ansText is string && isCorrect is boolean && submittedAt is string {

                json? refLinksJson = refLinks is json ? refLinks : ();

                SubmittedAnswer answer = {
                    questionId: qId,
                    questionNumber: qNum,
                    questionText: qText,
                    questionType: qType,
                    refLinks: refLinksJson,
                    selectedAnswerId: ansId,
                    selectedAnswerText: ansText,
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
