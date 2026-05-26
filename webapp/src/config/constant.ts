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

export const SnackMessage = {
  success: {
    userListRetrieval: "Successfully retrieve the user list",
  },
  error: {
    userListRetrieval: "Error while retrieving the user list",
  },
  warning: {
    requestForSpecialPromotion: "There is a duplicate request found for this user",
  },
};

export const CURRENT_YEAR = new Date().getFullYear();

export const UIMessages = {
  loading: {
    checkEmployeesInfo: "Loading employees information",
    checkEmployeeInfo: "Checking employee information",
  },
};

export const UIEditStyles = {
  borderStyle: "dashed",
  borderColor: "primary.main",
  borderRadius: 2,
  transition: "0.1s",
  transform: "scale(1.01)",
};

export const EMPLOYEE_PRIVILEGE_ID = 987;
export const SALES_ADMIN_PRIVILEGE_ID = 537;

export const SIDEBAR_WIDTH = 350;
export const SECTION_LIMIT = 15;

export const NA_VALUE = "N/A";

export const ADMIN_QUIZZES_PER_PAGE = 5;
export const CONTENTS_PER_SECTION = 3;
export const CONTENT_STATE_SUCCESS = "success";
export const CONTENT_STATE_IDLE = "idle";
export const CONTENT_STATE_FAILED = "failed";
export const CONTENT_STATE_LOADING = "loading";

export const PINNED_CONTENT_SECTION_ID = -2;
export const SUGGESTED_CONTENT_SECTION_ID = -3;
export const ESSENTIALS_SECTION_ID = -4;
export const ITEMS_PER_PAGE = 3;

export const PITSTOP_APP_THEME = "pitstop-app-theme"; 
export const GOOGLE_DRIVE_DOMAIN = "drive.google.com";
export const GOOGLE_DOCS_DOMAIN = "docs.google.com";

export const ROUTE_ID_HOME = 1;
export const ROUTE_ID_MY_BOARD = -5;
export const ROUTE_ID_MORE = -1;
export const ROUTE_ID_ADMIN_PANEL = -2;
export const ROUTE_ID_ADMIN_EDIT_MENU = -3;
export const ROUTE_ID_ADMIN_REPORT = -4;
export const ROUTE_ID_QUIZ_ADMIN = -6;
export const INVALID_ROUTE_ID = -1;
