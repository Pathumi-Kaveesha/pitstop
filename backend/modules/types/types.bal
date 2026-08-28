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

import ballerina/constraint;
import ballerina/sql;
import ballerina/time;
import ballerina/http;

# Route payload.
public type RoutePayload record {|
    # Parent ID
    int parentId;
    # Page title
    string title;
    # Page description
    string? description = ();
    # Page thumbnail
    @constraint:String {pattern: constants:URL}
    string? thumbnail = ();
    # Navbar item name
    string label;
    # Page custom theme
    CustomTheme customPageTheme?;
    # Page visibility
    boolean isVisible;
|};

# Section payload.
public type SectionPayload record {|
    # Route ID
    @sql:Column {name: "route_id"}
    int routeId;
    # Type of the section
    @sql:Column {name: "section_type"}
    string sectionType;
    # Image url
    @constraint:String {pattern: constants:URL}
    @sql:Column {name: "image_url"}
    string? imageUrl = ();
    # Redirect url
    @constraint:String {pattern: constants:URL}
    @sql:Column {name: "redirect_url"}
    string? redirectUrl = ();
    # Title
    @sql:Column {name: "title"}
    string title;
    # Description
    @sql:Column {name: "description"}
    string description?;
    # Section custom theme
    CustomTheme customSectionTheme?;
    # Tags associated with the section
    @sql:Column {name: "tags"}
    string tags?;
|};

# Content payload. Can be used for both regular content (with sectionId) and route content (with routeId).
public type ContentPayload record {|
    # Section ID
    int? sectionId = ();
    # Route ID
    int? routeId = ();
    # Link to redirect to the content
    @constraint:String {pattern: constants:URL}
    string contentLink;
    # Type of the content
    string contentType;
    # Content subtype of the content
    string? contentSubtype = ();
    # Thumbnail image url
    string? thumbnail = ();
    # Content notes
    string? note = ();
    # Content description
    string description;
    # Content custom theme 
    CustomTheme? customContentTheme = ();
    # Boolean value to check the deletion of the content
    boolean isDeleted = false;
    # Content tags
    string? tags = ();
    # Content reuse 
    boolean isReused = false;
|};

# Analytics event payload sent from the React frontend
public type AnalyticsEvent record {|
    # User email
    string userEmail = "";
    # User name
    string? userName = ();
    # User department
    string? department = ();
    # User region
    string? region = ();
    # Type of interaction
    string eventType;      // "VIEW", "SEARCH", "COMPLETION", "ENGAGEMENT", "SESSION_TIME"
    # Id of target content 
    int? contentId = ();
    # Unique session identifier
    string? sessionId = ();
    # Additional dynamic attributes
    json? metadata = ();   // Dynamic JSON for extra details (e.g. watch %, scroll depth)
|};


# Standard HTTP response for analytics ingestion
public type AnalyticsResponse record {|
    # Result message
    string message;
    # Success status flag
    boolean success;
|};

# Filter parameters for analytics queries.
public type AnalyticsFilter record {|
    # Optional start date (ISO string YYYY-MM-DD)
    string? startDate = ();
    # Optional end date (ISO string YYYY-MM-DD)
    string? endDate = ();
    # Optional region filter
    string? region = ();
    # Optional individual user email filter
    string? userEmail = ();
    # Optional page route filter
    string? pageRoute = ();
    # Optional sorting field for top content queries
    string? sortBy = "totalViews";
    # Viewer timezone offset in minutes (e.g. 330 for +05:30)
    int? timezoneOffsetMinutes = ();
|};

# Holds platform-wide aggregate totals for analytics summary metrics.
public type AnalyticsTotals record {|
    # Total number of content views
    int totalViews;
    # Total number of distinct users who viewed content
    int totalUniqueViews;
    # List of distinct platform visitors
    VisitorUser[] totalUniqueVisitorDetails = [];
    # Total cumulative user active time spent in seconds
    int totalTimeSpentSeconds;
    # Total overall platform interaction events
    int totalEngagements;
    # Average actions performed per visit
    decimal avgActionsPerVisit;
|};

# Visitor identity summary.
public type VisitorUser record {|
    # User email
    string email;
    # User name
    string? name = ();
|};

# Content performance metrics.
public type ContentPerformanceMetric record {|
    # Unique identifier of the content
    int contentId;
    # Title or name of the content
    string title;
    # Number of times preview button was clicked
    int previewClicks;
    # Number of times outlink button was clicked
    int outlinkClicks;
    # Total count of view events
    int totalViews;
    # Count of distinct user views
    int uniqueViews;
    # List of unique visitor details
    VisitorUser[] uniqueVisitorDetails = [];
    # Count of full completions
    int fullCompletions;
|};

# User activity leaderboard entry.
public type UserLeaderboardEntry record {|
    # Email address of the user
    string userEmail;
    # Full name of the user
    string userName;
    # Department of the user
    string department;
    # Region or sub-team of the user
    string region;
    # Total session visits by the user
    int visits;
    # Total active actions performed by the user
    int actions;
    # Average time spent per visit in seconds
    int avgTimeSpentSeconds;
|};

# Global team / regional performance metric.
public type RegionalTimeMetric record {|
    # Region or team name
    string region;
    # Count of distinct visitors (unique users) in this team
    int uniqueVisits;
    # Total number of visits / sessions in this team
    int totalVisits;
    # Total active engagement actions performed
    int actions;
    # Average time spent per visit in seconds
    int avgTimeSpentSeconds;
    # List of unique visitor details in this region
    VisitorUser[] uniqueVisitorDetails = [];
|};

# Most searched query metric.
public type SearchMetric record {|
    # Term or query typed in the search bar
    string searchTerm;
    # Number of times the term was searched
    int searchCount;
    # Number of distinct users who searched for this term
    int uniqueSearchCount;
|};

# Traffic and peak time distribution metric.
public type TrafficPeakMetric record {|
    # Hour of the day when activity peaked (0-23)
    int peakHour;
    # Day of the week (Monday - Sunday)
    string dayOfWeek;
    # Number of visits during the peak time
    int visitCount;
|};

# Daily trend metric breakdown.
public type DailyTrendMetric record {|
    # Date of the recorded activity trend (YYYY-MM-DD)
    string date;
    # Total page views recorded on this date
    int totalViews;
    # Number of distinct visitors on this date
    int uniqueViews;
    # Total cumulative time spent in seconds on this date
    int timeSpentSeconds;
    # Total user interactions and engagements on this date
    int totalEngagements;
    # Average number of actions performed per visit on this date
    decimal avgActionsPerVisit;
|};

# Comprehensive Admin Analytics Summary.
public type ComprehensiveAnalyticsSummary record {|
    # Total views across all content
    int totalViews;
    # Total unique views across all content
    int totalUniqueViews;
    # List of distinct platform visitors
    VisitorUser[] totalUniqueVisitorDetails = [];
    # Total cumulative time spent by users in seconds
    int totalTimeSpentSeconds;
    # Total platform engagement interactions
    int totalEngagements;
    # Average actions performed per visit session
    decimal avgActionsPerVisit;
    # Daily trend breakdown of performance metrics over time
    DailyTrendMetric[] trends = [];
    # List of top performing content items
    ContentPerformanceMetric[] topContent = [];
    # Ranked list of active users
    UserLeaderboardEntry[] leaderboard = [];
    # Regional breakdown of time spent
    RegionalTimeMetric[] regionalTimeSpent = [];
    # List of most searched queries
    SearchMetric[] topSearches = [];
    # Peak activity times breakdown
    TrafficPeakMetric[] peakActivityTimes = [];
|};


# Comment payload.
public type CommentPayload record {|
    # Id of the content
    int contentId;
    # Provided comment for the post
    string comment;
    # List of mentioned user emails
    string[]? mentionedEmails = ();
|};

# Update route payload.
public type UpdateRoutePayload record {|
    # Page title
    string title?;
    # Page description
    string description?;
    # Page thumbnail
    string thumbnail?;
    # Page label
    string label?;  
    # Route path
    string routePath?;
    # Navbar item name
    string menuItem?;
    # Page custom theme
    CustomTheme customPageTheme?;
    # Sub page visibility
    boolean isVisible?;
    # Route visibility status
    boolean isRouteVisible?;
    # Parent ID
    int parentId?;
    # Array of routes items to reorder
    ReorderRouteItem[] reorderRoutes?;
|};

public type SwapSectionOrders record {|
    # Section ID
    int sectionId;
    # Section Order
    int sectionOrder;
|};

# Simple mapping record for quiz id lookups
public type QuizIdRow record {|
    # Quiz ID
    int quizId;
|};

# Update section payload.
public type UpdateSectionPayload record {|
    # Type of the section
    string sectionType?;
    # Image url
    string imageUrl?;
    # Redirect url
    string redirectUrl?;
    # Title
    string title?;
    # Description
    string description?;
    # Section custom theme
    CustomTheme customSectionTheme?;
    # Vertical tags
    string tags?;
    # Array of section items to reorder
    SwapSectionOrders[] reorderSections?;
|};

# Update content payload.
public type UpdateContentPayload record {|
    # Link to redirect to the content
    string? contentLink = ();
    # Thumbnail image url
    string thumbnail?;
    # Content notes
    string note?;
    # Type of the content
    string contentType?;
    # Content subtype of the content
    string contentSubtype?;
    # Content description
    string description?;
    # Content custom theme
    CustomTheme customContentTheme?;
    # Boolean value if verified content
    boolean verifyContent?;
    # Content tags
    string tags?;
    # Content visibility
    boolean isVisible?;
    # Content reuse
    boolean isReused?;
    # Array of content items to reorder
    SwapContentOrders[] reorderContents?;
    # Section ID for reorder operations
    int? sectionId = ();
    # Route ID for reorder operations
    int? routeId = ();
|};

# Route response.
public type RouteResponse record {|
    # Route ID
    int routeId;
    # Route path
    string path;
    # Navbar item name
    string menuItem;
    # Route order
    int routeOrder;
    # Children route paths
    RouteResponse[] children;
    # Route visibility status
    boolean isRouteVisible?;
|};

# Page response.
public type PageResponse record {|
    # Route ID
    int routeId?;
    # Page title
    string title;
    # Page description
    string description?;
    # Page thumbnail
    string thumbnail?;
    # Page custom theme
    CustomTheme customPageTheme?;
    # Route contents
    ContentResponse[] routeContents?;
    # Sub page visibility
    boolean isVisible;
|};

# Section response.
public type SectionResponse record {|
    # Section id
    int sectionId;
    # Section title
    string title;
    # Section description
    string description?;
    # Type of the section
    string sectionType;
    # Image url
    string imageUrl?;
    # Redirect url
    string redirectUrl?;
    # Section order
    int sectionOrder;
    # Section content
    ContentResponse[] contentData;
    # Section custom theme
    CustomTheme customSectionTheme?;
    # Vertical tags
    string tags?;
|};

# Content response.
public type ContentResponse record {|
    # Content ID
    int contentId;
    # Route ID
    int? sectionId;
    # Link to redirect to the content
    string contentLink;
    # Type of the content
    string contentType;
    # Content subtype of the content
    string? contentSubtype;
    # Thumbnail image url
    string thumbnail?;
    # Content notes
    string note?;
    # Content description
    string description;
    # Likes count of the content
    int likesCount;
    # likes for the content
    boolean status?;
    # Content order
    int contentOrder;
    # Custom theme for the content
    CustomTheme customContentTheme?;
    # content creaeted date
    string createdOn;
    # number of comments
    int commentCount;
    # Content tags
    string[] tags?;
    #route id
    int? routeId;
    # Content visibility
    boolean isVisible;
    # Content reuse
    boolean isReused;
|};

# Comment response.
public type CommentResponse record {|
    # Id of the comment
    int commentId;
    # Provided comment for the post
    string comment;
    # Created on date
    string createdOn;
    # User name 
    string userName;
    # User email 
    string userEmail;
    # User thumbnail
    string? userThumbnail;
|};

# Tag response.
public type TagResponse record {|
    # Tag name
    string tagName;
    # Tag color
    string color;
|};

# Like response.
public type LikeResponse record {|
    # User ID
    @sql:Column {name: "user_id"}
    int userId;
    # User email
    string email;
    # User first name
    @sql:Column {name: "first_name"}
    string? firstName;
    # User last name
    @sql:Column {name: "last_name"}
    string? lastName;
    # User thumbnail
    string? thumbnail;
|};

# Application User
public type User record {|
    # User ID
    int userId;
    # User email
    string email;
    # User thumbnail
    string? thumbnail;
    # User first name
    string firstName;
    # User last name
    string lastName;
|};
# Route helper.
public type Route record {|
    # Route ID
    @sql:Column {name: "route_id"}
    int routeId;
    # Parent Route ID
    @sql:Column {name: "parent_id"}
    int parentId?;
    # Route path
    @sql:Column {name: "route_path"}
    string path;
    # Route Menu Item
    @sql:Column {name: "menu_item"}
    string menuItem;
    # Route order
    @sql:Column {name: "route_order"}
    int routeOrder;
    # Page title
    string title;
    # Page description
    string description?;
    # Page thumbnail
    string thumbnail?;
    # Sub page visibility
    boolean isVisible;
    # Route visibility status
    boolean isRouteVisible?;
|};

# Section helper record.
public type Section record {|
    # Section Id
    int sectionId;
    # Section title
    string title;
    # Section description
    string description?;
    # Type of the section
    string sectionType;
    # Image url
    string imageUrl?;
    # Redirect url
    string redirectUrl?;
    # Section order
    int sectionOrder;
    # Custom section theme
    CustomTheme customSectionTheme?;
    # Tags associated with the section
    string tags?;
|};

# Comment helper record.
public type Comment record {|
    # Id of the content
    int contentId;
    # Id of the user 
    int userId;
    # Provided comment for the post
    string comment;
|};

# Like helper record.
public type LikeContent record {|
    # Content id
    int contentId;
    # User id
    int userId;
    # Boolean value for check whether user liked content or not
    boolean status = false;
|};

# Pin helper record.
public type PinContents record {|
    # Content id
    int contentId;
    # User email
    string userEmail;
|};

public enum SectionType {
    IMAGE = "image",
    SECTION = "section",
    RECENT_CONTENT = "recent_content",
    PINNED_CONTENT = "pinned_content"
}

# Custom theme record.
public type CustomTheme record {|
    # Custom title theme
    CustomStylingInfo title?;
    # Custom description theme
    CustomStylingInfo description?;
    # Custom note theme
    CustomStylingInfo note?;
    # Custom cropped image
    CroppedImageSizing cropSizing?;
|};

# Cropped image sizing information record.
public type CroppedImageSizing record {|
    # Cropped image width
    int width;
    # Cropped image height
    int height;
    # Cropped image x coordinate
    int x;
    # Cropped image y coordinate
    int y;
|};

# Styling information record.
public type CustomStylingInfo record {|
    # Background color
    string background?;
    # Font size
    int fontSize?;
    # Font family
    string fontFamily?;
    # Font weight
    string fontWeight?;
    # Font style
    string fontStyle?;
    # Text underline
    boolean underline?;
    # Text color
    string color?;
    # Flag to indicate if using rich text
    boolean richText?;
    # HTML content
    string htmlContent?;
|};

# Update content order record.
public type SwapContentOrders record {|
    # Content ID
    int contentId;
    # Content Order
    int contentOrder;
|};

# Update route order record.
public type ReorderRouteItem record {|
    # Route ID
    int routeId;
    # Route Order
    int routeOrder;
    # Route visibility status
    int isRouteVisible?;
|};

# Get all available content record.
public type ContentReport record {|
    # Content description
    string contentName;
    # Link to redirect to the content
    string contentLink;
    # Page name
    string pageName;
    # Section name
    string sectionName;
    # Created by user
    string? createdBy;
    # Created on date
    string createdDate;
    # Last verified by user
    string? lastVerifiedBy;
    # Last verified on date
    string lastVerifiedDate;
|};

# Content response record.
public type ContentResponseById record {|
    # Content ID
    int contentId;
    # Section ID
    int sectionId;
    # Content description
    string description;
    # Route path
    string routePath;
|};

# Tag payload record.
public type TagPayload record {|
    # Tag Name
    string tagName;
|};

# Individual route content item.
public type RouteContentItem record {|
    # Content ID
    int contentId;
    # Route ID
    int routeId;
    # Content link
    string contentLink;
    # Content description
    string description;
    # Type of the content
    string contentType;
    # Content order
    int contentOrder;
|};

# Payload for reparenting routes.
public type ReParentRoutesPayload record {|
    # Parent ID
    int newParentId;
    # Array of route IDs to reparent
    int[] routeIds;
|};

# Update comment payload record.
public type UpdateCommentPayload record {|
    # Id of the comment
    int commentId;
    # Id of the content
    int contentId;
    # Provided comment for the post
    string comment;
|};

# Comment data record.
public type CommentData record {|
    # The ID of the user who created the comment
    @sql:Column {name: "created_by"}
    int createdBy;
    # The timestamp when the comment was created
    @sql:Column {name: "created_on"}
    time:Utc createdOn;
|};

# Pin content payload.
public type PinContentPayload record {|
    # Content ID to pin
    int contentId;
|};

# Application information record.
public type AppInfo record {|
    # List of URLs that cannot be embedded in iframes
    string[] blockedIframeUrls;
|};

# Payload for employee search.
public type EmployeeSearchPayload record {|
   # Search query for employee search
   string searchQuery;
|};

# Previewtatus states.
public type PreviewStatusType "SUCCESS"|"BROKEN"|"RESTRICTED";

# Preview status details.
public type PreviewStatus record {|
    # Status classification.
    PreviewStatusType status;
    # Detailed explanation reason.
    string reason;
|};

# HTTP 200 OK wrapper for preview status.
public type PreviewStatusResponse record {|
    *http:Ok;
    # The payload body.
    PreviewStatus body;
|};