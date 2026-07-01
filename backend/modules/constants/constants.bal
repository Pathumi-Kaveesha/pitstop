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

import ballerina/lang.regexp;

//Error messages
public const GET_ALL_ROOT_PATHS_ERROR = "Error while fetching root route paths.";
public const GET_ALL_CHILDREN_PATHS_ERROR = "Error while fetching all children route paths.";
public const CHECK_CHILDREN_PATHS_EXISTS_ERROR = "Error while checking whether route got children or not.";
public const CHECK_CONTENT_EXISTS_ERROR = "Error while checking the presence of content.";
public const CHECK_SECTION_EXISTS_ERROR = "Error while checking whether the given section exists.";
public const GET_CONTENTS_ERROR = "Error while fetching contents of given section.";
public const DELETE_CONTENT_ERROR = "Error while deleting the content.";
public const UPDATE_ROUTE_ERROR = "Error while updating route.";
public const GET_PAGE_DATA_ERROR = "Error while fetching page data.";
public const GET_ROUTE_ERROR = "Error while fetching route by ID.";
public const GET_CONTENT_ERROR = "Error while fetching content by ID.";
public const GET_SECTION_ERROR = "Error while fetching section by ID.";
public const UPDATE_CONTENT_ERROR = "Error while updating content.";
public const UPDATE_SECTION_ERROR = "Error while updating section.";
public const GET_ALL_SECTION_IDS_ERROR = "Error while fetching all section data of a given route path.";
public const GET_USER_ID_ERROR = "Error while fetching user ID.";
public const GET_COMMENTS_ERROR = "Error while fetching all comments of a given content.";
public const GET_CONTENTS_BY_TEXT_ERROR = "Error while fetching contents that contains given text.";
public const NO_CONTENT_EXISTS_ERROR = "No content exist for the given content ID.";
public const NO_SECTION_EXISTS_ERROR = "No section exist for the given section ID.";
public const NO_ROUTE_EXISTS_ERROR = "No routes exist for the given route ID.";
public const NO_ROUTE_WARN = "No route paths.";
public const MENU_ITEM_SPECIAL_CHARACTERS_ERROR = "Menu item contains special characters.";
public const CONTENT_ALREADY_EXISTS_ERROR = "Content already exists in this section.";
public const SECTION_ALREADY_EXISTS_ERROR = "Section already exists in this page.";
public const IMAGE_LINK_REQUIRED_ERROR = "Image link is required.";
public const EMPTY_FIELDS_ERROR = "Required attributes not found.";
public const UNAUTHORIZED_ACCESS_ERROR = "User is unauthorized to perform this action.";
public const INVALID_URL_ERROR = "Invalid URL.";
public const SWAP_CONTENTS_EXCEED_LIMIT_ERROR = "Exceeds the limit of swapping contents.";
public const SWAP_SECTIONS_EXCEED_LIMIT_ERROR = "Exceeds the limit of swapping sections.";
public const SWAP_ROUTES_EXCEED_LIMIT_ERROR = "Exceeds the limit of swapping routes.";
public const SEARCH_CONTENTS_ERROR = "Error while searching contents.";
public const GET_CONTENT_REPORT_ERROR = "Error while fetching content details for report.";
public const GET_TAGS_ERROR = "Error while fetching tag details.";
public const GET_CONTENTS_BY_TAGS_ERROR = "Error while fetching content by tags.";
public const ADD_TAG_ERROR = "Error while adding tag.";
public const DELETE_TAG_ERROR = "Error while deleting the tag.";
public const NO_TAG_EXISTS_ERROR = "No tag exists for the given tag name.";
public const GET_ROUTE_CONTENT_ERROR = "Error while fetching route content.";
public const ADD_ROUTE_CONTENT_ERROR = "Error while adding route content.";
public const UPDATE_ROUTE_CONTENT_ERROR = "Error while updating route content.";
public const DELETE_ROUTE_CONTENT_ERROR = "Error while deleting route content.";
public const GET_USER_ROLE_ERROR = "Error while fetching user roles.";
public const ADD_CUSTOM_BUTTON_ERROR = "Error while adding custom button.";
public const UPDATE_CUSTOM_BUTTON_ERROR = "Error while updating custom button.";
public const DELETE_CUSTOM_BUTTON_ERROR = "Error while deleting custom button.";
public const CHECK_CUSTOM_BUTTON_EXISTS_ERROR = "Error while checking custom button existence.";
public const GET_CUSTOM_BUTTONS_ERROR = "Error while fetching custom buttons.";
public const GET_RECENT_CONTENT_ERROR = "Error while fetching recent content.";
public const GET_PINNED_CONTENT_ERROR = "Error while fetching pinned content.";
public const USER_INFO_HEADER_NOT_FOUND = "User information header not found";
public const GET_TRENDING_CONTENT_ERROR = "Error while fetching trending contents";
public const GET_SUGGESTED_CONTENT_ERROR = "Error while getting suggested contents";
public const COMMENT_ID_MISMATCH_ERROR = "Comment ID mismatch between path and payload";
public const GET_USER_PROFILE_ERROR = "Failed to extract user claims from request context.";
public const USER_PROFILE_READ_ERROR = "Failed to load user profile information.";
public final regexp:RegExp URL = re `^(https?|ftp|smtp)://(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/\S*)?$`;
