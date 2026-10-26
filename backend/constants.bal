// Copyright (c) // Copyright (c) 2026 WSO2 LLC. (https://www.wso2.com).
//
// This software is the property of WSO2 LLC. and its suppliers, if any.
// Dissemination of any information or reproduction of any material contained
// herein in any form is strictly forbidden, unless permitted by WSO2 expressly.
// You may not alter or remove any copyright or other notice from copies of this content.

public const ROOT_PATH = "/";

const PINNED_CONTENT_SECTION_ID = -2;
const SUGGESTED_CONTENT_SECTION_ID = -3;
const RECENT_CONTENT_SECTION_ID = -1;

const MY_BOARD_TITLE = "My Board";
// Empty string to stop rendering the title from the backend
const SUGGESTED_FOR_YOU_TITLE = "";
const RECENT_CONTENTS_TITLE = "What's New";

const PINNED_CONTENT_ORDER = -1;
const SUGGESTED_CONTENT_ORDER = -2;
const RECENT_CONTENT_ORDER = 0;

const PINNED_CONTENT_SECTION_TYPE = "pinned_content";
const SUGGESTED_CONTENT_SECTION_TYPE = "suggested_content";
const RECENT_CONTENT_SECTION_TYPE = "recent_content";

const DEFAULT_CONTENTS_LIMIT = 50;
const DEFAULT_CONTENTS_OFFSET = 0;

// Analytics events sent by the browser
final string[] & readonly ANALYTICS_EVENT_TYPES = ["VIEW", "SEARCH", "COMPLETION", "SESSION_TIME", "ENGAGEMENT"];
const MAX_ANALYTICS_METADATA_LENGTH = 10000;
const MAX_ANALYTICS_SESSION_ID_LENGTH = 100;
const MAX_ANALYTICS_USER_NAME_LENGTH = 255;
const MAX_ANALYTICS_DEPARTMENT_LENGTH = 100;
const MAX_ANALYTICS_REGION_LENGTH = 100;
// A single page visit can never be longer than a day
const MAX_SESSION_TIME_SECONDS = 86400;
