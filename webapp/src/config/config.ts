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


import { BaseURLAuthClientConfig } from "@asgardeo/auth-react";

declare global {
  interface Window {
    config: {
      APP_DETAILS: {
        NAME: string;
        DESCRIPTION: string;
      }; 
      REDIRECT_APP_NAME: string;
      APP_SUB_LINE: string;
      ASGARDEO_BASE_URL: string;
      ASGARDEO_CLIENT_ID: string;
      ASGARDEO_CUSTOM_SCOPE: string;
      AUTH_SIGN_IN_REDIRECT_URL: string;
      AUTH_SIGN_OUT_REDIRECT_URL: string;
      CHOREO_BACKEND_BASE_URL: string;
      IS_MATOMO_ENABLED: boolean;
      MATOMO_URL: string;
      MATOMO_SITE_ID: string;
      IS_PITSTOP_APP: boolean;
      SALES_PITSTOP_URL: string;
      SE_WIKI_URL: string;
      CARD_CONTENT_ORDER: string[];
    };
  }
}

//TODO : need to dynamically load from .env reading references and will handle.
export const AsgardioConfig: BaseURLAuthClientConfig = {
  signInRedirectURL: window.config?.AUTH_SIGN_IN_REDIRECT_URL ?? "",
  signOutRedirectURL: window.config?.AUTH_SIGN_OUT_REDIRECT_URL ?? "",
  clientID: window.config?.ASGARDEO_CLIENT_ID ?? "",
  baseUrl: window.config?.ASGARDEO_BASE_URL ?? "",
  scope: ["openid", "email", "groups"],
};

export const ServiceBaseUrl = window.config?.CHOREO_BACKEND_BASE_URL ?? "";

export const AppConfig = {
  serviceUrls: {
    getEmployeeInfo: ServiceBaseUrl + "/employees/",
    getUserInfo: ServiceBaseUrl + "/users/",
    getUsersInfo: ServiceBaseUrl + "/users",
    getEmployeesInfo: ServiceBaseUrl + "/employees",
    getManagerInfo: ServiceBaseUrl + "/employees/",
    getSubordinatesInfo: ServiceBaseUrl + "/employees",
    employeePrivilege: ServiceBaseUrl + "/employee-privileges",
    createRouterPath: ServiceBaseUrl + "/routes",
    getContentInfo: ServiceBaseUrl + "/routes/",
    createNewContent: ServiceBaseUrl + "/contents",
    deleteRouterPath: ServiceBaseUrl + "/routes/",
    updateContent: (contentId: number) => ServiceBaseUrl + "/contents/" + contentId,
    deleteContent: ServiceBaseUrl + "/contents/",
    updateRouterPath: (routeId: string) => ServiceBaseUrl + "/routes/" + routeId,
    createNewComment: ServiceBaseUrl + "/comments",
    getAllComments: ServiceBaseUrl + "/comments",
    createNewSection: ServiceBaseUrl + "/sections",
    deleteSection: ServiceBaseUrl + "/sections/",
    updateSection: (sectionId: string) => ServiceBaseUrl + "/sections/" + sectionId,
    addLike: ServiceBaseUrl + "/contents/",
    searchContent: ServiceBaseUrl + "/search-content",
    searchContentBasic: ServiceBaseUrl + "/search-content/basic",
    getPageData: ServiceBaseUrl + "/routes",
    getAllTags: ServiceBaseUrl + "/tags",
    createTag: ServiceBaseUrl + "/tags",
    deleteTag: ServiceBaseUrl + "/tags/",
    filterContent: ServiceBaseUrl + "/filter-content",
    reparentRoutes: ServiceBaseUrl + "/routes/reparent",
    updateComment: ServiceBaseUrl + "/comments",
    pinContent: ServiceBaseUrl + "/users/me/pinned-contents",
    unpinContent: ServiceBaseUrl + "/users/me/pinned-contents/",
    getContents: ServiceBaseUrl + "/contents",
    customButtons: ServiceBaseUrl + "/custom-buttons",
    getCustomButtons: (contentId: string) => ServiceBaseUrl + "/contents/" + contentId + "/custom-buttons",
    updateCustomButton: (contentId: number) => ServiceBaseUrl + "/contents/" + contentId + "/custom-buttons",
    deleteCustomButton: (buttonId: number) => ServiceBaseUrl + "/custom-buttons/" + buttonId,
    getTrendingContents: ServiceBaseUrl + "/trending-contents",
    getLikes: (contentId: number) => ServiceBaseUrl + "/contents/" + contentId + "/likes",
    testimonials: ServiceBaseUrl + "/testimonials",
    createTestimonial: ServiceBaseUrl + "/testimonials",
    updateTestimonial: (testimonialId: number) => ServiceBaseUrl + "/testimonials/" + testimonialId,
    deleteTestimonial: (testimonialId: number) => ServiceBaseUrl + "/testimonials/" + testimonialId,
    appInfo: ServiceBaseUrl + "/app-info",
    searchEmployees: ServiceBaseUrl + "/employees/search",
    quizzes: ServiceBaseUrl + "/quizzes",
    adminQuizzes: ServiceBaseUrl + "/quizzes/admin",
    createQuiz: ServiceBaseUrl + "/quizzes",
    updateQuiz: (quizId: number) => ServiceBaseUrl + "/quizzes/" + quizId,
    deleteQuiz: (quizId: number) => ServiceBaseUrl + "/quizzes/" + quizId,
    getQuestionsByQuiz: (quizId: number) => ServiceBaseUrl + "/quizzes/" + quizId + "/questions",
    getAnswersByQuiz: (quizId: number) => ServiceBaseUrl + "/quizzes/" + quizId + "/answers",
    createQuestion: (quizId: number) => ServiceBaseUrl + "/quizzes/" + quizId + "/questions",
    updateQuestion: (quizId: number, questionId: number) => ServiceBaseUrl + "/quizzes/" + quizId + "/questions/" + questionId,
    deleteQuestion: (quizId: number, questionId: number) => ServiceBaseUrl + "/quizzes/" + quizId + "/questions/" + questionId,
    getAnswersByQuestion: (questionId: number) => ServiceBaseUrl + "/questions/" + questionId + "/answers",
    createAnswer: (questionId: number) => ServiceBaseUrl + "/questions/" + questionId + "/answers",
    updateAnswer: (questionId: number, answerId: number) => ServiceBaseUrl + "/questions/" + questionId + "/answers/" + answerId,
    deleteAnswer: (questionId: number, answerId: number) => ServiceBaseUrl + "/questions/" + questionId + "/answers/" + answerId,
    submitQuiz: (quizId: number) => ServiceBaseUrl + "/quizzes/" + quizId + "/submit",
    getQuizResult: (quizId: number) => ServiceBaseUrl + "/quizzes/" + quizId + "/results-me",
    getQuizAnalytics: (quizId: number) => ServiceBaseUrl + "/quizzes/" + quizId + "/analytics",
    getUserDrillDown: (quizId: number, userId: number) => ServiceBaseUrl + "/quizzes/" + quizId + "/analytics/" + userId,
    assignUsersToQuiz: (quizId: number) => ServiceBaseUrl + "/quizzes/" + quizId + "/assign",
    publishQuiz: (quizId: number) => ServiceBaseUrl + "/quizzes/" + quizId + "/publish",
    
  },
};
