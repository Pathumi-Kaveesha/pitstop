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

import pitstop.database;

configurable int topActivitiesCount = 6; // Number of top activities to consider

// Not used any more. Kept so a deployment that still has these values in its configuration can start.
// Delete both once the values are removed from every environment.
configurable string analyticsServiceBaseUrl = "";
configurable record {|
    string tokenAuth = "";
    string idSite = "1";
    string date = "last30";
    string filterLimit = "2";
|} analyticsRequestParams = {};

const ACTIVITY_LOOKBACK_DAYS = 30;
const TRENDING_CANDIDATES_COUNT = 25;
const RECENT_ACTIVITY_ROWS_COUNT = 100;
const SEARCH = "SEARCH";

# Get the names of the contents that most users viewed recently.
#
# + return - Array of unique trending content names (highest number of viewers first) or error
public isolated function processTrendingContents() returns string[]|error {
    return database:getTrendingContentNames(ACTIVITY_LOOKBACK_DAYS, TRENDING_CANDIDATES_COUNT);
}

# Process recent activity of a user to extract searched keywords and viewed content names.
#
# + email - Email of the user
# + return - Visit summary or error
public isolated function processRecentActivityForUser(string email) returns VisitSummary|error {
    database:RecentActivityRow[] rows =
        check database:getRecentActivity(email, ACTIVITY_LOOKBACK_DAYS, RECENT_ACTIVITY_ROWS_COUNT);
    int processedActivitiesCount = 0;
    string[] searchedKeywords = [];
    string[] viewedContentNames = [];
    foreach database:RecentActivityRow row in rows {
        if processedActivitiesCount >= topActivitiesCount {
            break;
        }
        if row.eventType.toUpperAscii() == SEARCH {
            string? searchText = row.searchText;
            if searchText is () {
                continue;
            }
            string keyword = searchText.trim().toLowerAscii();
            // Check if keyword is not empty and not already in the array
            if keyword != "" && searchedKeywords.indexOf(keyword) is () {
                searchedKeywords.push(keyword);
                processedActivitiesCount += 1;
            }
        } else {
            string? contentName = row.contentName;
            // Check if content name is not null, not empty and not already in the array
            if contentName is string && contentName != "" && viewedContentNames.indexOf(contentName) is () {
                viewedContentNames.push(contentName);
                processedActivitiesCount += 1;
            }
        }
    }
    return {searchedKeywords, viewedContentNames};
}
