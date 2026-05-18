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

import { BasicUserInfo, DecodedIDTokenPayload } from "@asgardeo/auth-spa";
import { RouteStatuses } from "@/types/types";

export enum Role {
  SALES_ADMIN = "SALES_ADMIN",
  EMPLOYEE = "EMPLOYEE",
  SALES_MASTER = "SALES_MASTER",
}

export interface EmployeeInfo {
  employeeThumbnail: string;
  reportingLead: string;
  reportingLeadThumbnail: string;
  workEmail: string;
  startDate: string;
  joinedBusinessUnit: string;
  joinedDepartment: string;
  joinedTeam: string;
  joinedLocation: string;
  lastPromotedDate: string | null;
}

export type AuthFlowState =
  | "start"
  | "l_choreo_tokens"
  | "e_choreo_tokens"
  | "l_user_privileges"
  | "e_user_privileges"
  | "end";

export interface AuthState {
  status: RouteStatuses;
  mode: "active" | "maintenance";
  statusMessage: string | null;
  isAuthenticated: boolean;
  userInfo: BasicUserInfo | null;
  idToken: string | null;
  isIdTokenExpired: boolean | null;
  decodedIdToken: DecodedIDTokenPayload | null;
  roles: Role[];
  userPrivileges: string[] | null;
  errorMessage: string | null;
  authFlowState: AuthFlowState;
}

export interface AuthData {
  userInfo: BasicUserInfo;
  idToken: string;
  decodedIdToken: DecodedIDTokenPayload;
}

export interface Employee {
  workEmail: string;
  firstName: string;
  lastName: string;
  jobBand: number;
  employeeThumbnail: string;
}

export interface Header {
  title: string;
  size: number;
  align: "left" | "right" | "center";
}

export enum FILETYPE {
  Slide = "slides",
  External_Link = "external",
  Youtube = "youtube",
  Lms = "lms",
  Salesforce = "salesforce",
  GSheet = "gsheet",
}

export enum CONTENT_SUBTYPE {
  Generic = "generic",
  Pdf = "pdf",
  Video = "video",
  GDoc = "gdoc",
}

export enum SectionType {
  Image = "image",
  Section = "section",
}

export enum ThemeMode {
  Light = "light",
  Dark = "dark",
}

export enum MyBoardPanelTypes {
  PINNED = "pinned",
  ESSENTIAL = "essential",
}
