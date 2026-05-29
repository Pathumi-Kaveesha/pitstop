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

import ballerina/constraint;
import ballerina/sql;

# [Configurable] Database configuration.
type DatabaseConfig record {|
    # Database Host
    string host;
    # Database User
    string user;
    # Database Password
    string password;
    # Database Name
    string database;
    # Maximum open connections
    int maxOpenConnections = 10;
    # Maximum lifetime of a connection
    decimal maxConnectionLifeTime = 180.0;
    # Minimum idle time of a connection  
    int minIdleConnections = 5;
|};

# Route payload.
public type RoutePayload record {|
    # Parent ID
    int parentId;
    # Page title
    string title;
    # Page description
    string? description = ();
    # Page thumbnail
    string? thumbnail = ();
    # Route Path item name
    string label;
    # Navbar menu item
    string menuItem;
    # Page custom theme
    types:CustomTheme? customPageTheme = ();
    # Page visibility
    boolean isVisible;
|};

# Custom button record.
public type CustomButton record {|
    # Button ID
    int id;
    # Content ID
    @sql:Column {name: "content_id"}
    string contentId;
    # Button label
    string label;
    # Button description
    string? description = ();
    # Button icon
    string? icon = ();
    # Button color
    string? color = ();
    # Button action type
    string action;
    # Button action value
    @sql:Column {name: "action_value"}
    string? actionValue = ();
    # Button visibility
    @sql:Column {name: "is_visible"}
    boolean isVisible;
    # Button order
    @sql:Column {name: "button_order"}
    int 'order;
    # Created timestamp
    @sql:Column {name: "created_at"}
    string? createdAt = ();
    # Updated timestamp
    @sql:Column {name: "updated_at"}
    string? updatedAt = ();
|};

# Custom button create payload.
public type CustomButtonCreatePayload record {|
    # Content ID
    string contentId;
    # Button label
    string label;
    # Button description
    string? description = ();
    # Button icon
    string? icon = ();
    # Button color
    string? color = ();
    # Button action type
    string? action = ();
    # Button action value
    string? actionValue = ();
    # Button visibility
    boolean? isVisible;
    # Button order
    int 'order;
|};

# Custom button update payload.
public type CustomButtonUpdatePayload record {|
    # Content ID
    string? contentId = ();
    # Button label
    string? label = ();
    # Button description
    string? description = ();
    # Button icon
    string? icon = ();
    # Button color
    string? color = ();
    # Button action type
    string? action = ();
    # Button action value
    string? actionValue = ();
    # Button visibility
    boolean? isVisible = ();
    # Button order
    int? 'order = ();
|};

# Page response record.
public type PageResponse record {|
    # Route ID
    @sql:Column {name: "route_id"}
    int routeId;
    # Page title
    string title;
    # Page description
    string description?;
    # Page thumbnail
    string thumbnail?;
    # Custom Page theme
    @sql:Column {name: "styling_info"}
    string? customPageTheme;
    # Sub page visibility
    boolean isVisible;
|};

# Content response record.
public type ContentResponse record {|
    # Id of the content
    @sql:Column {name: "content_id"}
    int contentId;
    # Section ID
    @sql:Column {name: "section_id"}
    int? sectionId;
    # Link to redirect to the content
    @sql:Column {name: "content_link"}
    string contentLink;
    # Type of the content
    @sql:Column {name: "content_type"}
    string contentType;
    # Content subtype of the content
    @sql:Column {name: "content_sub_type"}
    string? contentSubtype;
    # Thumbnail image url
    string thumbnail?;
    # Content notes
    string note?;
    # Content description
    string description;
    # Likes count of the content
    @sql:Column {name: "likes_count"}
    int likesCount;
    # likes for the content
    boolean status?;
    # Custom theme for the content
    @sql:Column {name: "styling_info"}
    string? customContentTheme;
    # Content order
    @sql:Column {name: "content_order"}
    int contentOrder;
    # content created date
    @sql:Column {name: "created_on"}
    string createdOn;
    # number of comments
    @sql:Column {name: "comment_count"}
    int commentCount;
    # Content tags
    string tags?;
    #route id
    @sql:Column {name: "route_id"}
    int? routeId;
    # Content visibility
    @sql:Column {name: "is_visible"}
    boolean isVisible;
    # Content reuse 
    @sql:Column {name: "is_reused"}
    boolean isReused;
|};

# Section helper record.
public type Section record {|
    # Section Id
    @sql:Column {name: "section_id"}
    int sectionId;
    # Section title
    string title;
    # Section description
    string description?;
    # Type of the section
    @sql:Column {name: "section_type"}
    string sectionType;
    # Image url
    @sql:Column {name: "image_url"}
    string imageUrl?;
    # Redirect url
    @sql:Column {name: "redirect_url"}
    string redirectUrl?;
    # Section order
    @sql:Column {name: "section_order"}
    int sectionOrder;
    # Custom section theme
    @sql:Column {name: "styling_info"}
    string customSectionTheme?;
    # Tags associated with the section
    @sql:Column {name: "tags"}
    string tags?;
|};

# Pinned content response record.
public type PinnedContentResponse record {|
    # Id of the content
    @sql:Column {name: "content_id"}
    int contentId;
    # Route ID
    @sql:Column {name: "section_id"}
    int? sectionId;
    # Link to redirect to the content
    @sql:Column {name: "content_link"}
    string contentLink;
    # Type of the content
    @sql:Column {name: "content_type"}
    string contentType;
    # Content subtype of the content
    @sql:Column {name: "content_sub_type"}
    string? contentSubtype;
    # Thumbnail image url
    string thumbnail?;
    # Content notes
    string note?;
    # Content description
    string description;
    # Likes count of the content
    @sql:Column {name: "likes_count"}
    int likesCount;
    # likes for the content
    boolean status?;
    # Custom theme for the content
    @sql:Column {name: "styling_info"}
    string customContentTheme;
    # Content order
    @sql:Column {name: "content_order"}
    int contentOrder;
    # content created date
    @sql:Column {name: "created_on"}
    string createdOn;
    # number of comments
    @sql:Column {name: "comment_count"}
    int commentCount;
    # Content tags
    string tags;
    # route id
    @sql:Column {name: "route_id"}
    int? routeId;
    # Content visibility
    @sql:Column {name: "is_visible"}
    boolean isVisible;
    # Pinned timestamp
    @sql:Column {name: "pinned_at"}
    string pinnedAt;
    # Content reuse 
    @sql:Column {name: "is_reused"}
    boolean isReused;
|};

# Count response record.
public type CountResponse record {|
    # Count value
    int count;
|};

# Content ID response record.
public type ContentIdResponse record {|
    # Content ID
    @sql:Column {name: "content_id"}
    int contentId;
|};

# Customer testimonial record.
public type CustomerTestimonial record {|
    # Testimonial ID
    int id;
    # Logo URL
    @sql:Column {name: "logo_url"}
    string logoUrl;
    # Customer name
    string name;
    # Subtitle (optional)
    @sql:Column {name: "sub_title"}
    string? subTitle;
    # Website URL
    @sql:Column {name: "website_url"}
    string websiteUrl;
    # Link label
    @sql:Column {name: "link_label"}
    string linkLabel;
    # Created by user email
    @sql:Column {name: "created_by"}
    string? createdBy;
    # Updated by user email
    @sql:Column {name: "updated_by"}
    string? updatedBy;
    # Created timestamp
    @sql:Column {name: "created_at"}
    string? createdAt;
    # Updated timestamp
    @sql:Column {name: "updated_at"}
    string? updatedAt;
    # Shareable status
    @sql:Column {name: "is_shareable"}
    boolean isShareable;
|};

# Customer testimonial create payload.
public type CustomerTestimonialCreatePayload record {|
    # Logo URL
    string logoUrl;
    # Customer name
    string name;
    # Subtitle (optional)
    string? subTitle;
    # Website URL
    string websiteUrl;
    # Link label
    string linkLabel;
    # Shareable status
    boolean? isShareable;
|};

# Customer testimonial update payload.
public type CustomerTestimonialUpdatePayload record {|
    # Logo URL
    string? logoUrl;
    # Customer name
    string? name;
    # Subtitle (optional)
    string? subTitle;
    # Website URL
    string? websiteUrl;
    # Link label
    string? linkLabel;
    # Shareable status
    boolean? isShareable;
|};

# Content query mode enum.
public enum ContentQueryMode {
    TEXT = "text",
    TAGS = "tags",
    TAGS_AND_KEYWORDS = "tagsAndKeywords",
    TRENDING = "trending"
}

# Content query parameters record.
public type ContentFilter record {|
    # Logged-in user email
    string userEmail;
    # Search mode
    ContentQueryMode mode;
    # Text search 
    string? text = ();
    # Array of tags for filtering
    string[] tags = [];
    # Array of keywords 
    string[] keywords = [];
    # Array of trending  content descriptions 
    string[] trendingDescriptions = [];
    # Pagination limit
    int 'limit = 10;
    # Pagination offset
    int 'offset = 0;
|};

# Quiz record.
public type Quiz record {|
    # Quiz ID
    @sql:Column {name: "quiz_id"}
    int quizId;
    # Title
    @constraint:String {minLength: 1, maxLength: 255}
    @sql:Column {name: "quiz_title"}
    string title;
    # Description
    @sql:Column {name: "quiz_description"}
    string? description;
    # Thumbnail URL
    @sql:Column {name: "thumbnail"}
    string? thumbnail;
    # Passing score %
    @sql:Column {name: "passing_score"}
    int passingScore;
    # Due date
    @sql:Column {name: "due_date"}
    string dueDate;
    # Assigned user IDs
    @sql:Column {name: "assigned_user_ids"}
    json? assignedUserIds;
    # Status
    @sql:Column {name: "status"}
    QuizStatus status;
    # Deleted
    @sql:Column {name: "is_deleted"}
    boolean isDeleted;
    # Created by
    @sql:Column {name: "created_by"}
    string createdBy;
    # Updated by
    @sql:Column {name: "updated_by"}
    string? updatedBy;
    # Created at
    @sql:Column {name: "created_at"}
    string createdAt;
    # Updated at
    @sql:Column {name: "updated_at"}
    string? updatedAt;
    # Total questions
    @sql:Column {name: "total_questions"}
    int totalQuestions;
|};

# Quiz assigned user IDs row.
public type QuizAssignedUserIds record {|
    # Assigned user IDs JSON array.
    @sql:Column {name: "assigned_user_ids"}
    json? assignedUserIds;
|};

# Quiz creation payload.
public type QuizCreatePayload record {
    # Title
    @constraint:String {minLength: 1, maxLength: 255}
    string title;
    # Description
    string? description = ();
    # Thumbnail URL
    string? thumbnail = ();
    # Passing score %
    int passingScore;
    # Due date
    string? dueDate = ();
    # User IDs
    int[] assignedUserIds = [];
    # Status
    QuizStatus status = DRAFTED;
    # Questions
    NestedQuestionPayload[] questions = [];
};

# Quiz update payload.
public type QuizUpdatePayload record {
    # Title
    @constraint:String {minLength: 1, maxLength: 255}
    string? title = ();
    # Description
    string? description = ();
    # Thumbnail URL
    string? thumbnail = ();
    # Passing score %
    int? passingScore = ();
    # Due date
    string? dueDate = ();
    # User IDs
    int[]? assignedUserIds = ();
    # Status
    QuizStatus? status = ();
    # Questions
    NestedQuestionPayload[]? questions = ();
};

# Question payload.
public type NestedQuestionPayload record {|
    # Text
    string text;
    # Type
    string 'type;
    # Reference links
    string[]? refLinks = ();
    # Answers
    NestedAnswerPayload[] answers = [];
|};

# Answer payload.
public type NestedAnswerPayload record {|
    # Text
    string text;
    # Correct
    boolean isCorrect;
|};

# Quiz lifecycle status.
public enum QuizStatus {
    DRAFTED,
    PUBLISHED
}

# Assign users payload.
public type AssignUsersPayload record {|
    # User IDs
    int[] userIds;
    # Time limit (minutes). Used for email notification only
    int timeLimitMinutes;
    # User IDs to notify by email
    int[] notifyUserIds?;
|};

# Unassign users payload.
public type UnassignUsersPayload record {| 
    # User IDs
    int[] userIds;
|};

# Question record.
public type Question record {|
    # ID
    @sql:Column {name: "question_id"}
    int questionId;
    # Number
    @sql:Column {name: "question_number"}
    int questionNumber;
    # Quiz ID
    @sql:Column {name: "quiz_id"}
    int quizId;
    # Text
    @sql:Column {name: "question_text"}
    string questionText;
    # Type
    @sql:Column {name: "question_type"}
    string questionType;
    # Reference links
    @sql:Column {name: "ref_links"}
    json? refLinks;
    # Deleted
    @sql:Column {name: "is_deleted"}
    boolean isDeleted;
    # Created by
    @sql:Column {name: "created_by"}
    string createdBy;
    # Updated by
    @sql:Column {name: "updated_by"}
    string? updatedBy;
    # Created at
    @sql:Column {name: "created_at"}
    string createdAt;
    # Updated at
    @sql:Column {name: "updated_at"}
    string? updatedAt;
|};

# Question payload.
public type QuestionCreatePayload record {|
    # Number
    int questionNumber;
    # Text
    string questionText;
    # Type
    string questionType;
    # Reference links
    string[]? refLinks = ();
|};

# Update question payload.
public type QuestionUpdatePayload record {|
    # Text
    string? questionText;
    # Type
    string? questionType;
    # Reference links
    string[]? refLinks = ();
|};

# Answer record.
public type Answer record {|
    # ID
    @sql:Column {name: "answer_id"}
    int answerId;
    # Question ID
    @sql:Column {name: "question_id"}
    int questionId;
    # Text
    @sql:Column {name: "answer_text"}
    string answerText;
    # Correct
    @sql:Column {name: "is_correct"}
    boolean isCorrect;
    # Created by
    @sql:Column {name: "created_by"}
    string createdBy;
    # Updated by
    @sql:Column {name: "updated_by"}
    string? updatedBy;
    # Created at
    @sql:Column {name: "created_at"}
    string createdAt;
    # Updated at
    @sql:Column {name: "updated_at"}
    string? updatedAt;
|};

# Public answer record.
public type AnswerPublic record {|
    # ID
    @sql:Column {name: "answer_id"}
    int answerId;
    # Question ID
    @sql:Column {name: "question_id"}
    int questionId;
    # Text
    @sql:Column {name: "answer_text"}
    string answerText;
    # Created at
    @sql:Column {name: "created_at"}
    string createdAt;
    # Updated at
    @sql:Column {name: "updated_at"}
    string? updatedAt;
|};

# Answer creation payload.
public type AnswerPayload record {|
    # Text
    string answerText;
    # Correct
    boolean isCorrect;
|};

# Answer update payload.
public type UpdateAnswerPayload record {|
    # Text
    string? answerText;
    # Correct
    boolean? isCorrect;
|};

# User answer submission.
public type UserAnswerPayload record {
    # Question ID
    int questionId;
    # Question type
    string questionType;
    # Selected answer IDs
    int[] selectedAnswerIds;
    # Feedback
    string? feedbackText = ();
};

# Quiz result.
public type QuizResult record {|
    # Total questions
    int totalQuestions;
    # Correct answers
    int correctAnswers;
    # Score %
    decimal scorePercentage;
    # Marks obtained
    int marksObtained;
    # Passed
    boolean passed;
    # Completed
    boolean completed;
    # Answers
    SubmittedAnswer[] answers;
    # Feedback
    UserFeedback? feedback;
|};

# Raw quiz result (DB mapping).
public type QuizResultRaw record {|
    # Total questions
    @sql:Column {name: "total_questions"}
    int totalQuestions;
    # Correct answers
    @sql:Column {name: "correct_answers"}
    int? correctAnswers;
    # Score %
    @sql:Column {name: "score_percentage"}
    decimal scorePercentage;
    # Marks obtained
    @sql:Column {name: "marks_obtained"}
    int? marksObtained;
    # Passed
    @sql:Column {name: "passed"}
    int passed;
    # Completed
    @sql:Column {name: "completed"}
    int completed;
|};

# User quiz analytics.
public type UserQuizAnalytics record {|
    # User ID
    @sql:Column {name: "user_id"}
    int userId;
    # User email
    @sql:Column {name: "user_email"}
    string userEmail;
    # User name
    @sql:Column {name: "user_name"}
    string userName;
    # Total questions
    @sql:Column {name: "total_questions"}
    int totalQuestions;
    # Answered
    int answered;
    # Correct answers
    @sql:Column {name: "correct_answers"}
    int correctAnswers;
    # Score %
    @sql:Column {name: "score_percentage"}
    decimal scorePercentage;
    # Marks obtained
    @sql:Column {name: "marks_obtained"}
    int marksObtained;
    # Completed
    int completed;
    # Passed
    int passed;
    # Submitted at
    @sql:Column {name: "submitted_at"}
    string? submittedAt;
|};

# Submitted answer.
public type SubmittedAnswer record {|
    # Question ID
    @sql:Column {name: "question_id"}
    int questionId;
    # Question number
    @sql:Column {name: "question_number"}
    int questionNumber;
    # Question text
    @sql:Column {name: "question_text"}
    string questionText;
    # Question type
    @sql:Column {name: "question_type"}
    string questionType;
    # Reference links (JSON string from database)
    @sql:Column {name: "ref_links"}
    string refLinks;
    # Selected answer ID
    @sql:Column {name: "selected_answer_id"}
    int selectedAnswerId;
    # Answer text
    @sql:Column {name: "answer_text"}
    string selectedAnswerText;
    # Correct answer text
    @sql:Column {name: "correct_answer_text"}
    string correctAnswerText;
    # Correct
    @sql:Column {name: "is_correct"}
    boolean isCorrect;
    # Submitted at
    @sql:Column {name: "submitted_at"}
    string submittedAt;
|};

# User answer drill-down.
public type UserAnswerDrillDown record {|
    # Answers
    SubmittedAnswer[] answers;
    # Feedback
    UserFeedback? feedback;
|};

# User feedback.
public type UserFeedback record {|
    # ID
    @sql:Column {name: "feedback_id"}
    int feedbackId;
    # Quiz ID
    @sql:Column {name: "quiz_id"}
    int quizId;
    # User ID
    @sql:Column {name: "user_id"}
    int userId;
    # Feedback text
    @sql:Column {name: "feedback_text"}
    string feedbackText;
    # Created at
    @sql:Column {name: "created_at"}
    string createdAt;
|};

# Quiz feedback (admin view).
public type Feedback record {|
    # ID
    @sql:Column {name: "feedback_id"}
    int feedbackId;
    # Quiz ID
    @sql:Column {name: "quiz_id"}
    int quizId;
    # User ID
    @sql:Column {name: "user_id"}
    int userId;
    # User name
    @sql:Column {name: "user_name"}
    string userName;
    # User email
    @sql:Column {name: "user_email"}
    string userEmail;
    # Feedback text
    @sql:Column {name: "feedback_text"}
    string feedbackText;
    # Created at
    @sql:Column {name: "created_at"}
    string createdAt;
|};
