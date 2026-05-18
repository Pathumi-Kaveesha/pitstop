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

import { Theme } from "@mui/material";
import * as Yup from "yup";
import { NonIndexRouteObject } from "react-router-dom";
import { Role, CONTENT_SUBTYPE } from "@utils/types";

export const MAX_LABEL_LENGTH = 50;
export const MAX_TITLE_LENGTH = 50;
export interface PageDialogBoxProps {
  type: "add" | "update";
  open: boolean;
  handleClose: () => void;
  parentId: number;
  initialValues?: {
    routeId: number;
    label: string;
    title: string;
    routePath: string;
    description: string;
    thumbnail: string;
    customPageTheme: CustomTheme;
    isVisible: boolean;
  };
}

export interface SectionDialogBoxProps {
  type: "add" | "update";
  open: boolean;
  sectionId?: number;
  handleClose: () => void;
  initialValues?: {
    title: string;
    description?: string;
    sectionType: string;
    imageUrl?: string;
    redirectUrl?: string;
    customSectionTheme?: CustomTheme;
    tags?: string;
  };
}

export interface ContentDialogBoxProps {
  type: "add" | "update";
  isOpen: boolean;
  handleClose: () => void;
  sectionId?: number;
  initialValues?: {
    contentId?: number;
    sectionId?: number;
    contentType: string;
    contentSubtype?: CONTENT_SUBTYPE;
    contentLink: string;
    description: string;
    thumbnail?: string;
    note?: string;
    customContentTheme?: CustomTheme;
    verifyContent: boolean;
    tags?: string[];
    isReused?: boolean;
  };
}

export interface DeleteDialogBoxProps {
  type: "content" | "section" | "page" | "route_content" | "testimonial" | "quiz";
  routeId?: number;
  contentId?: number;
  sectionId?: number;
  testimonialId?: number;
  quizId?: number;
  open: boolean;
  handleClose: () => void;
  onConfirm?: () => void;
}

export interface CommentSideBarProps {
  open: boolean;
  handleDrawer?: () => void;
  contentId: number;
  description: string;
}

export interface CommentSectionProps {
  contentId: number;
  description: string;
}

export interface SidebarProps {
  open: boolean;
  theme: Theme;
  handleDrawer: () => void;
}

export interface ErrorHandlerProps {
  message: string | null;
}

export interface PreLoaderProps {
  message?: string | null;
  hideLogo?: boolean;
  isLoading?: boolean;
}

export interface ActionButtonProps {
  direction: "left" | "right" | "up" | "down";
}

export interface ListItemLinkProps {
  routeId: number;
  primary: string;
  to: string;
  label: string;
  isActive: boolean;
  theme: Theme;
  children?: RouteResponse[];
  level?: number;
  isRouteVisible?: number;
  handleCloseDrawer: () => void;
}

export interface CommentCardProps {
  commentResponse: CommentResponse;
}

export interface IframeViewerDialogBoxProps {
  link: string;
  originalUrl: string;
  open: boolean;
  handleClose: () => void;
  contentId: number;
  description: string;
  contentType?: string;
  contentSubtype?: string;
}

export const validationContentSchema = Yup.object({
  contentType: Yup.string().required("Component type is required*"),
  contentLink: Yup.string()
    // .matches(
    //   /^((ftp|http|https):\/\/)?(www.)?(?!.*(ftp|http|https|www.))[a-zA-Z0-9_-]+(\.[a-zA-Z]+)+((\/)[\w#]+)*(\/\w+\?[a-zA-Z0-9_]+=\w+(&[a-zA-Z0-9_]+=\w+)*)?$/gm,
    //   "Enter correct image url!"
    // )
    .required("Content link is required"),
  description: Yup.string()
    .min(4, "Too Short!")
    .max(300, "Too Long!")
    .required("Title is required*"),
});

export const validationPageSchema = Yup.object({
  label: Yup.string()
    .required("Menu item is required*")
    .min(2, "Too Short!")
    .max(MAX_LABEL_LENGTH, "Too Long!"),
  title: Yup.string().required("Title is required*").max(MAX_TITLE_LENGTH, "Too Long!"),
  thumbnail: Yup.string(),
  //--------TODO: Add validation for redirect url--------//
  // .matches(
  //   /^((ftp|http|https):\/\/)?(www.)?(?!.*(ftp|http|https|www.))[a-zA-Z0-9_-]+(\.[a-zA-Z]+)+((\/)[\w#]+)*(\/\w+\?[a-zA-Z0-9_]+=\w+(&[a-zA-Z0-9_]+=\w+)*)?$/gm,
  //   "Enter correct image url!"
  // ),
  description: Yup.string().min(4, "Too Short!"),
});

export const validationSectionSchema = Yup.object({
  title: Yup.string()
    .test(
      'min-length',
      'Title should contain at least 4 letters',
      (value) => !value || value.length >= 4
    )
    .max(300, "Too Long!"),
  sectionType: Yup.string().required("Section type is required"),
  imageUrl: Yup.string()
    //--------TODO: Add validation for redirect url--------//
    // .matches(
    //   /^((ftp|http|https):\/\/)?(www.)?(?!.*(ftp|http|https|www.))[a-zA-Z0-9_-]+(\.[a-zA-Z]+)+((\/)[\w#]+)*(\/\w+\?[a-zA-Z0-9_]+=\w+(&[a-zA-Z0-9_]+=\w+)*)?$/gm,
    //   "Enter correct image url!"
    // )
    .when("sectionType", ([sectionType], schema) =>
      sectionType === "image" ? schema.required("Image url is required") : schema
    ),
  redirectUrl: Yup.string(),
  //--------TODO: Add validation for redirect url--------//
  // .matches(
  //   /^((ftp|http|https):\/\/)?(www.)?(?!.*(ftp|http|https|www.))[a-zA-Z0-9_-]+(\.[a-zA-Z]+)+((\/)[\w#]+)*(\/\w+\?[a-zA-Z0-9_]+=\w+(&[a-zA-Z0-9_]+=\w+)*)?$/gm,
  //   "Enter correct redirect url!"
  // ),
  tags: Yup.string().when("sectionType", ([sectionType], schema) =>
    sectionType === "vertical"
      ? schema
          .required("Tag is required for vertical sections")
          .min(0, "Tag should contain at least 1 character")
          .max(50, "Tag is too long!")
      : schema.notRequired()
  ),
});
//Payload interfac
export interface RoutePayload {
  parentId: number;
  title: string;
  thumbnail?: string;
  description?: string;
  label: string;
  customPageTheme?: CustomTheme;
  isVisible: boolean;
}

export interface SectionPayload {
  routeId: number;
  sectionType: string;
  imageUrl?: string;
  redirectUrl?: string;
  title: string;
  description?: string;
  customSectionTheme?: CustomTheme;
  tags?: string;
}

export interface ContentPayload {
  routeId?: number;
  sectionId?: number;
  contentLink: string;
  contentType: string;
  contentSubtype?: CONTENT_SUBTYPE;
  thumbnail?: string;
  note?: string;
  description: string;
  customContentTheme?: CustomTheme;
  isReused?: boolean;
}

export interface UpdateRoutePayload {
  title?: string;
  description?: string;
  thumbnail?: string;
  menuItem?: string;
  label?: string;
  routePath?: string; 
  customPageTheme?: CustomTheme;
  isVisible?: boolean;
  isRouteVisible?: boolean;
  parentId?: number | null;
  reorderRoutes?: ReorderRouteItem[];
}

export interface UpdateSectionPayload {
  title?: string;
  description?: string;
  sectionType?: string;
  imageUrl?: string;
  redirectUrl?: string;
  customSectionTheme?: CustomTheme;
  tags?: string;
  reorderSections?: ReorderSectionItem[];
}

export interface UpdateContentPayload {
  contentLink?: string;
  contentType?: string;
  contentSubtype?: CONTENT_SUBTYPE;
  thumbnail?: string;
  note?: string;
  description?: string;
  customContentTheme?: CustomTheme;
  verifyContent?: boolean;
  customButtons?: CustomButton[];
  isVisible?: boolean;
  isReused?: boolean;
  reorderContents: ReorderContentItem[];
  sectionId?: number;
  routeId?: number;
}

export interface TagPayload {
  tagName: string;
}

export interface RouteContentPayload {
  routeId: number;
  contentLink: string;
  description: string;
}

export interface UpdateCommentPayload {
  commentId: number;
  contentId: number;
  comment: string;
  mentionedEmails?: string[];
}

export interface EmployeeSuggestion {
  workEmail: string;
  firstName: string;
  lastName: string;
  employeeThumbnail?: string;
  department: string;
  team?: string;
}

export interface EmployeeSearchPayload {
  searchQuery: string;
}

export interface MentionedUser {
  name: string;
  email: string;
  thumbnail?: string;
}

export interface QuizAssignableEmployee extends EmployeeSuggestion {
  userId: number;
}

//For Creating New Nav Item

//Response Type
export interface Page {
  pageData: PageData;
  sectionData: Section[];
}

export interface PageData {
  customButtons: [];
  title: string;
  description: string;
  thumbnail: string;
  customPageTheme?: CustomTheme;
  isVisible: number;
  isRouteVisible: number;
  shouldRedirect?: boolean;
}

// Custom theme record.
export interface CustomTheme {
  title?: CustomStylingInfo;
  description?: CustomStylingInfo;
  note?: CustomStylingInfo;
  cropSizing?: CropSizingInfo;
}

// Cropped sizing information record.
export interface CropSizingInfo {
  width: number;
  height: number;
  x: number;
  y: number;
}

// Styling information record.
export interface CustomStylingInfo {
  fontWeight?: string;
  fontStyle?: string;
  underline?: boolean;
  color?: string;
  background?: string;
  fontSize?: number;
  fontFamily?: string;
  richText?: boolean; 
  htmlContent?: string;
}

// Single section item to be reordered
export type ReorderSectionItem = {
  sectionId: number;
  sectionOrder: number;
};

// Single content item to be reordered
export type ReorderContentItem = {
  contentId: number;
  contentOrder: number;
};

// Single route item to be reordered
export interface ReorderRouteItem {
  routeId: number;
  routeOrder: number;
  isRouteVisible: number;
}

//Response interfaces

export interface CommentsResponse {
  commentId: number;
  comment: string;
  createdOn: string;
  userName: string;
  userEmail: string;
  userThumbnail: string;
}

export interface TagResponse {
  tagName: string;
  color: string;
}

export interface RouteResponse extends NonIndexRouteObject {
  state?: string;
  menuItem: string;
  path: string;
  routeId: number;
  routeOrder: number;
   isRouteVisible: boolean;
  element?: React.ReactNode | null;
  children?: RouteResponse[];
}

export interface ContentResponse {
  contentId: number;
  sectionId: number;
  routeId?: number;
  contentLink: string;
  contentType: string;
  description: string;
  likesCount: number;
  status?: boolean;
  thumbnail?: string;
  note?: string;
  commentCount: number;
  customContentTheme?: CustomTheme;
  contentOrder: number;
  createdOn: string;
  tags: string[];
  customButtons?: CustomButton[];
  isVisible?: boolean;
  isReused?: boolean;
  contentSubtype?: CONTENT_SUBTYPE;
}

export interface Section {
  sectionId: number;
  title: string;
  description?: string;
  sectionType: string;
  imageUrl?: string;
  redirectUrl?: string;
  contentState: RouteStatuses;
  sectionOrder: number;
  contentData: ContentResponse[];
  contentOffset: number;
  customSectionTheme?: CustomTheme;
  tags?: string;
  isVisible: number; 
  isRouteVisible?: number; 
}

export interface PageState {
  state: RouteStatuses;
  stateMessage: string | null;
  pageData: PageData;
  likeState: RouteStatuses;
  pinState: RouteStatuses;
  commentState: RouteStatuses;
  searchState: RouteStatuses;
  sectionState: RouteStatuses;
  verticalState: RouteStatuses;
  pageDataState: RouteStatuses;
  swapContentsState: RouteStatuses;
  swapSectionsState: RouteStatuses;
  contentReportState: RouteStatuses;
  tagState: RouteStatuses;
  blockedUrlsState: RouteStatuses;
  likesState: RouteStatuses;
  sectionData: Section[];
  verticalData: Section[];
  comments: CommentsResponse[];
  likes: { [contentId: number]: LikeResponse[] };
  sectionOffset: number;
  contents: ContentResponse[];
  searchResults: ContentResponse[];
  contentReport: ContentReportResponse[];
  tagData: TagResponse[];
  blockedIframeUrls: string[];
  pinnedContentIds: number[];
  trendingState: string;
  trendingContents: ContentResponse[];
}

export interface LikeResponse {
  userId: number;
  email: string;
  firstName?: string;
  lastName?: string;
  thumbnail?: string;
}

export interface CommentResponse {
  commentId: number;
  comment: string;
  userName: string;
  userEmail: string;
  userThumbnail: string;
}

export interface GetPageDataPayload {
  routePath: string;
}

export interface defaultStyleConfigs {
  fontWeight?: string;
  fontStyle?: string;
  underline?: boolean;
  color?: string;
  bgcolor?: string;
  fontSize?: number;
  fontFamily?: string;
}

export interface ImageSectionProps {
  imageUrl: string;
  title: string;
  sectionOrder: number;
  customSectionTheme?: CustomTheme;
  redirectUrl?: string;
  actions: Action[];
  authorizedRoles: Role[];
}

export interface Action {
  icon: React.ReactElement;
  name: string;
  action: () => void;
}

export interface ContentReportResponse {
  contentName: string;
  contentLink: string;
  pageName: string;
  sectionName: string;
  createdBy: string;
  createdDate: string;
  lastVerifiedBy: string;
  lastVerifiedDate: string;
}

export interface GridSortableItemProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
  dragHandlePosition?: 'top-left' | 'center-top';
}

export interface VerticalSortableItemProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export interface SideBarSortableItemProps {
  id: number;
  index: number;
  width: string;
  disabled: boolean;
  dragHandle?: React.ReactNode;
  children: React.ReactNode;
  isAnyItemDragging: boolean;
}

export interface SortableChildItemProps {
  id: number;
  width: string;
  dragHandle?: React.ReactNode;
  children: React.ReactNode;
}

export interface RouteContentItem {
  contentId: number;
  routeId: number;
  contentLink: string;
  description: string;
  contentType: string;
  contentOrder: number;
}

export interface reparentRoutesPayload {
  newParentId: number;
  routeIds: number[];
}

export interface CustomButton {
  id: number;
  contentId: string;
  label: string;
  description?: string;
  icon?: string | null;  
  color?: "blue" | "green" | "red" | "orange"; 
  action: "link" | "download";
  actionValue?: string; 
  isVisible: boolean;
  order: number;
}
export type CreateCustomButton = Omit<CustomButton, 'id'>;

export type RouteStatuses = "failed" | "success" | "loading" | "idle"

export interface CustomerTestimonial {
  id: number;
  logoUrl: string;
  name: string;
  subTitle?: string;
  websiteUrl: string;
  linkLabel: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  isShareable: boolean;
}

export interface CustomerTestimonialCreatePayload {
  logoUrl: string;
  name: string;
  subTitle?: string | null;
  websiteUrl: string;
  linkLabel: string;
  isShareable?: boolean;
}

export interface CustomerTestimonialUpdatePayload {
  logoUrl?: string;
  name?: string;
  subTitle?: string | null;
  websiteUrl?: string;
  linkLabel?: string;
  isShareable?: boolean;
}

export interface CustomerTestimonialDialogBoxProps {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initialData?: CustomerTestimonial;
}

export interface CustomerTestimonialCardProps {
  testimonial: CustomerTestimonial;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export interface Quiz {
  quizId: number;
  title: string;
  description?: string;
  thumbnail?: string;
  passingScore: number;
  dueDate?: string;
  assignedUserIds: number[];
  totalQuestions: number;
  status: "DRAFTED" | "PUBLISHED" | QuizStatus;
  createdAt: string;
}

export interface QuizQuestion {
  questionId: number;
  questionNumber: number;
  quizId: number;
  questionText: string;
  questionType: "mcq_single" | "mcq_multiple" | "rating" | "feedback";
  marks: number;
  answers?: Array<{
    text: string;
    isCorrect: boolean;
  }>;
  refLinks?: string[];
}

export interface QuizAnswerOption {
  answerId: number;
  questionId: number;
  answerText: string;
}

export interface UserAnswerPayload {
  questionId: number;
  questionType: string;
  selectedAnswerIds: number[];
  feedbackText?: string;
}

export interface SubmittedAnswer {
  questionId: number;
  questionNumber: number;
  questionText: string;
  questionType: string;
  marks: number;
  refLinks?: string[];
  selectedAnswerId: number;
  selectedAnswerText: string;
  selectedOptionText?: string;
  correctAnswerText?: string;
  isCorrect: boolean;
  submittedAt: string;
}

export interface QuizResult {
  totalQuestions: number;
  correctAnswers: number;
  scorePercentage: number;
  marksObtained: number;
  passed: boolean;
  completed: boolean;
  answers: SubmittedAnswer[];
  feedback?: {
    feedbackId: number;
    feedbackText: string;
    createdAt: string;
  };
}

export type QuizStatus = "not_started" | "passed" | "failed";

export interface QuizWithStatus extends Quiz {
  status: QuizStatus;
  scorePercentage?: number;
}

// Admin types
export interface QuizAdmin extends Quiz {
  totalQuestions: number;
}

export interface UserQuizAnalytics {
  userId: number;
  userEmail: string;
  userName: string;
  totalQuestions: number;
  answered: number;
  correctAnswers: number;
  scorePercentage: number;
  marksObtained: number;
  completed: number;
  passed: number;
  submittedAt?: string;
}

export interface QuizPayload {
  title: string;
  description?: string;
  thumbnail?: string;
  passingScore: number;
  dueDate?: string;
  assignedUserIds: number[];
  questions?: Array<{
    text: string;
    type: string;
    refLinks?: string[];
    answers: Array<{ text: string; isCorrect: boolean }>;
  }>;
}

// Quiz form types
export type QuestionType = "mcq_single" | "mcq_multiple" | "rating" | "feedback";

export interface AnswerOption {
  text: string;
  isCorrect: boolean;
}

export interface QuestionFormData {
  text: string;
  type: QuestionType;
  answers: AnswerOption[];
  refLinks: string[];
}

export interface AssignedQuizUser {
  userId: number;
  firstName: string;
  lastName: string;
  workEmail: string;
  employeeThumbnail?: string;
  department?: string;
}
