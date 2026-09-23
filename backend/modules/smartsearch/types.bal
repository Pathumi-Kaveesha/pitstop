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

# One matching document chunk found by search.
#
# + content - The matching chunk's text
# + title - The document it came from
# + page - Which page of the document it came from
# + similarityScore - How closely it matched the search query (0-1)
# + documentId - Id of the content this chunk came from
# + unitLabel - What one piece of this file type is called - Page, Slide, Section or Sheet
# + fileExtension - The original file's type (pdf/pptx/docx/xlsx)
# + source - "upload" or "drive"
# + driveLink - The link used to index this document, when source is "drive"
public type SmartSearchResult record {|
    string content;
    string title;
    int? page = ();
    float similarityScore;
    string documentId = "";
    string unitLabel = "Page";
    string fileExtension = "pdf";
    string 'source = "upload";
    string driveLink = "";
|};

# Full response from the Smart Search service.
#
# + answer - A generated answer, or () if nothing matched
# + sources - The document chunks the answer was based on
# + contents - The real Pitstop content records behind the matches
public type SmartSearchResponse record {|
    string? answer;
    SmartSearchResult[] sources;
    types:ContentResponse[] contents = [];
|};

# Body for the Python service's /ingest-drive-link.
#
# + driveLink - The content's own link
# + title - Shown as this document's title in search results
# + contentId - Reused as Smart Search's own documentId
public type DriveLinkIngestRequest record {|
    string driveLink;
    string? title = ();
    string? contentId = ();
|};

# Auth configurations, same shape the email module uses.
#
# + tokenUrl - The URL of the token endpoint
# + clientId - The client ID of the application
# + clientSecret - The client secret of the application
public type Oauth2Config record {|
    string tokenUrl;
    string clientId;
    string clientSecret;
|};

# Smart Search Service Configuration.
#
# + apiEndpoint - Smart Search service endpoint
# + oauthConfig - Auth Configurations, set once the service sits behind
#                 Choreo's gateway and absent when called directly
public type SmartSearchServiceConfig record {|
    string apiEndpoint;
    Oauth2Config oauthConfig?;
|};
