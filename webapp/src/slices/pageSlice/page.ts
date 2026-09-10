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

import { enqueueSnackbarMessage } from "@slices/commonSlice/common";
import { ApiService } from "@utils/apiService";
import { AppConfig } from "@config/config";
import {
  ContentResponse,
  ContentPayload,
  PageState,
  CommentsResponse,
  UpdateContentPayload,
  Section,
  ContentReportResponse,
  TagResponse,
  UpdateCommentPayload,
  CustomTheme,
  LikeResponse,
  EmployeeSuggestion,
  EmployeeSearchPayload,
} from "@/types/types";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { 
  CONTENT_STATE_FAILED, 
  CONTENT_STATE_IDLE, 
  CONTENT_STATE_LOADING, 
  CONTENT_STATE_SUCCESS, 
  SECTION_LIMIT, 
  CONTENTS_PER_SECTION
} from "@config/constant";
import {MyBoardPanelTypes} from "@utils/types";

// Paddock shows 6 tiles per panel before "See more"; Pitstop keeps 3.
const MY_BOARD_ITEMS_PER_PAGE = window.config?.IS_PITSTOP_APP === false ? 6 : 3;
const MY_BOARD_ESSENTIALS_SECTION_ID = -4;

type MyBoardSectionState = {
  items: ContentResponse[];
  errorMessage: string | null;
  status: string;
  offset: number;
  hasMore: boolean;
  isLoadingMore: boolean;
};

type MyBoardState = {
  pinned: MyBoardSectionState;
  essential: MyBoardSectionState;
};

type PageStateWithMyBoard = PageState & {
  myBoard: MyBoardState;
};

const createInitialBoardSection = (): MyBoardSectionState => ({
  items: [],
  status: CONTENT_STATE_IDLE,
  errorMessage: null,
  offset: 0,
  hasMore: true,
  isLoadingMore: false,
});

const pageData: LocalPageData = {
  customButtons: [],
  title: "",
  description: "",
  thumbnail: "",
  isVisible: 0,
  isRouteVisible: 1, // Default to visible
};

const initialState: PageStateWithMyBoard = {
  state: CONTENT_STATE_IDLE,
  stateMessage: null,
  pageData: pageData,
  sectionData: [],
  verticalData: [],
  commentState: CONTENT_STATE_IDLE,
  searchState: CONTENT_STATE_IDLE,
  sectionState: CONTENT_STATE_IDLE,
  verticalState: CONTENT_STATE_IDLE,
  pageDataState: CONTENT_STATE_IDLE,
  swapContentsState: CONTENT_STATE_IDLE,
  swapSectionsState: CONTENT_STATE_IDLE,
  sectionOffset: 0,
  likeState: CONTENT_STATE_IDLE,
  likesState: CONTENT_STATE_IDLE,
  pinState: CONTENT_STATE_IDLE,
  contentReportState: CONTENT_STATE_LOADING,
  tagState: CONTENT_STATE_IDLE,
  blockedUrlsState: CONTENT_STATE_IDLE,
  comments: [],
  likes: {},
  contents: [],
  searchResults: [],
  contentReport: [],
  tagData: [],
  blockedIframeUrls: [],
  pinnedContentIds: [],
  trendingState: CONTENT_STATE_IDLE,
  trendingContents: [],
  myBoard: {
    pinned: createInitialBoardSection(),
    essential: createInitialBoardSection(),
  },
};

export const PageSlice = createSlice({
  name: "getFormInfo",
  initialState,
  reducers: {
    resetPageData(state) {
      state.pageData = {
        customButtons: [],
        title: "",
        description: "",
        thumbnail: "",
        isVisible: 0,
        isRouteVisible: 1,
      };
      state.sectionData = [];
      state.contents = [];
      state.state = CONTENT_STATE_LOADING;
      state.pageDataState = CONTENT_STATE_LOADING;
      state.sectionState = CONTENT_STATE_IDLE;
    },
    clearSearchResults(state) {
      state.searchResults = [];
      state.searchState = CONTENT_STATE_IDLE;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchMyBoardSection.pending, (state, action) => {
        const { PanelTypes, offset } = action.meta.arg;
        const section = state.myBoard[PanelTypes];
        section.errorMessage = null;

        if (offset === 0) {
          section.status = CONTENT_STATE_LOADING;
        } else {
          section.isLoadingMore = true;
        }
      })
      .addCase(fetchMyBoardSection.fulfilled, (state: PageStateWithMyBoard, action) => {
        const { PanelTypes, offset, items, hasMore } = action.payload as {
          PanelTypes: MyBoardPanelTypes;
          offset: number;
          items: ContentResponse[];
          hasMore: boolean;
        };

        const section = state.myBoard[PanelTypes];

        if (offset === 0) {
          section.items = items;
        } else {
          section.items = [...section.items, ...items];
        }

        section.offset = offset;
        section.hasMore = hasMore;
        section.status = CONTENT_STATE_SUCCESS;
        section.isLoadingMore = false;
        section.errorMessage = null;
      })
      .addCase(fetchMyBoardSection.rejected, (state, action) => {
        const { PanelTypes } = action.meta.arg;
        const section = state.myBoard[PanelTypes];

        section.status = CONTENT_STATE_FAILED;
        section.isLoadingMore = false;
        section.errorMessage = "Failed to load contents";
      })

      // Create New Content
      .addCase(createNewContent.pending, (state) => {
        state.stateMessage = " Saving the content";
        state.state = CONTENT_STATE_LOADING;
      })
      .addCase(createNewContent.fulfilled, (state) => {
        state.state = CONTENT_STATE_SUCCESS;
        state.stateMessage = "You have successfully created a new content";
      })
      .addCase(createNewContent.rejected, (state) => {
        state.stateMessage = "Something went wrong :(";
        state.state = CONTENT_STATE_FAILED;
      })

      // Update Content
      .addCase(updateContent.pending, (state) => {
        state.stateMessage = " Saving the content";
        state.state = CONTENT_STATE_LOADING;
      })
      .addCase(updateContent.fulfilled, (state) => {
        state.stateMessage = "You have successfully updated the content";
        state.state = CONTENT_STATE_SUCCESS;
      })
      .addCase(updateContent.rejected, (state) => {
        state.stateMessage = "Something went wrong :(";
        state.state = CONTENT_STATE_FAILED;
      })

      //Get Page data
      .addCase(getPageData.pending, (state) => {
        state.state = CONTENT_STATE_LOADING;
        state.pageDataState = CONTENT_STATE_LOADING;
        state.sectionData = [];
      })
      .addCase(getPageData.fulfilled, (state, action) => {
        state.pageDataState = CONTENT_STATE_SUCCESS;
        state.state = CONTENT_STATE_SUCCESS;
        state.pageData = action.payload.pageData;
        // Set route contents from the page response
        if (action.payload.routeContents && action.payload.routeContents.length > 0) {
          state.contents = action.payload.routeContents;
        } else {
          state.contents = [];
        }
      })
      .addCase(getPageData.rejected, (state) => {
        state.pageDataState = CONTENT_STATE_SUCCESS;
        state.state = CONTENT_STATE_FAILED;
        state.stateMessage = "Failed to load page data";
      })

      //Get section info
      .addCase(getSectionInfo.pending, (state) => {
        state.sectionState = CONTENT_STATE_LOADING;
      })
      .addCase(getSectionInfo.fulfilled, (state, action) => {
        const isInitial = action.meta.arg.isInitial;
        return {
          ...state,
          sectionData: isInitial
            ? action.payload.sectionInfo
            : [...state.sectionData, ...action.payload.sectionInfo],
          sectionState:
            action.payload.sectionInfo.length === 0
              ? CONTENT_STATE_IDLE
              : CONTENT_STATE_SUCCESS,
          state: CONTENT_STATE_SUCCESS,
          sectionOffset: action.meta.arg.offset,
        };
      })
      .addCase(getSectionInfo.rejected, (state) => {
        state.state = CONTENT_STATE_FAILED;
        state.stateMessage = "Failed to load page data";
      })

      //Get vertical sections info
      .addCase(getVerticalSectionInfo.pending, (state) => {
        state.verticalState = CONTENT_STATE_LOADING;
      })
      .addCase(getVerticalSectionInfo.fulfilled, (state, action) => {
        return {
          ...state,
          verticalData: action.payload.verticalSectionInfo,
          verticalState:
            action.payload.verticalSectionInfo.length === 0
              ? CONTENT_STATE_IDLE
              : CONTENT_STATE_SUCCESS,
          state: CONTENT_STATE_SUCCESS,
          sectionOffset: 0,
        };
      })
      .addCase(getVerticalSectionInfo.rejected, (state) => {
        state.verticalState = CONTENT_STATE_FAILED;
        state.stateMessage = "Failed to load vertical sections";
      })

      //Get content info
      .addCase(getContentsInfo.pending, (state, action) => {
        const sectionId = action.meta.arg.sectionId;
        const sectionIndex = state.sectionData.findIndex(
          (section) => section.sectionId === sectionId
        );

        const updatedSection: Section = {
          ...state.sectionData[sectionIndex],
          contentState: CONTENT_STATE_LOADING,
        };

        //Remove the existing section and add the updated section
        const updatedSectionData = [
          ...state.sectionData.slice(0, sectionIndex),
          updatedSection,
          ...state.sectionData.slice(sectionIndex + 1),
        ];

        state.sectionData = updatedSectionData;
      })
      .addCase(getContentsInfo.fulfilled, (state, action) => {
        const isInitial = action.meta.arg.isInitial;
        const loadAll = action.meta.arg.loadAll;
        const { sectionId, contentInfo } = action.payload.response;
        const sectionIndex = state.sectionData.findIndex(
          (section) => section.sectionId === sectionId
        );
        if (sectionId === -1) {
          if (sectionIndex !== -1) {
            const updatedSection: Section = {
              ...state.sectionData[sectionIndex],
              contentData: contentInfo.slice(0, 6),
              contentState: CONTENT_STATE_SUCCESS,
              contentOffset: 0,
            };

            state.sectionData = [
              ...state.sectionData.slice(0, sectionIndex),
              updatedSection,
              ...state.sectionData.slice(sectionIndex + 1),
            ];
          }
          state.state = CONTENT_STATE_SUCCESS;
          return;
        }
        if (sectionId === -3 && loadAll) {
          if (sectionIndex !== -1) {
            const updatedSection: Section = {
              ...state.sectionData[sectionIndex],
              contentData: contentInfo,
              contentState: CONTENT_STATE_IDLE,
              contentOffset: contentInfo.length,
            };

            state.sectionData = [
              ...state.sectionData.slice(0, sectionIndex),
              updatedSection,
              ...state.sectionData.slice(sectionIndex + 1),
            ];
            state.state = CONTENT_STATE_SUCCESS;
          }
          return;
        }

        if (loadAll) {
          const updatedSection: Section = {
            ...state.sectionData[sectionIndex],
            contentData: contentInfo,
            contentState: CONTENT_STATE_SUCCESS,
            contentOffset: action.meta.arg.offset,
          };

          state.sectionData = [
            ...state.sectionData.slice(0, sectionIndex),
            updatedSection,
            ...state.sectionData.slice(sectionIndex + 1),
          ];
          state.state = CONTENT_STATE_SUCCESS;

          return;
        }

        const hasMore = contentInfo.length > CONTENTS_PER_SECTION;
        const pageItems = hasMore
          ? contentInfo.slice(0, CONTENTS_PER_SECTION)
          : contentInfo;

        if (sectionIndex !== -1) {
          let updatedSection: Section = {
            ...state.sectionData[sectionIndex],
            contentData: [
              ...state.sectionData[sectionIndex].contentData,
              ...pageItems,
            ],
            contentState: hasMore ? CONTENT_STATE_SUCCESS : CONTENT_STATE_IDLE,
            contentOffset: action.meta.arg.offset,
          };

          //If it is the initial load, then replace the existing content data with the new content data
          if (isInitial) {
            updatedSection = {
              ...state.sectionData[sectionIndex],
              contentData: pageItems,
              contentState: hasMore
                ? CONTENT_STATE_SUCCESS
                : CONTENT_STATE_IDLE,
              contentOffset: action.meta.arg.offset,
            };
          }

          //Remove the existing section and add the updated section
          const updatedSectionData = [
            ...state.sectionData.slice(0, sectionIndex),
            updatedSection,
            ...state.sectionData.slice(sectionIndex + 1),
          ];

          state.sectionData = updatedSectionData;
          state.state = CONTENT_STATE_SUCCESS;
        } else {
          state.state = CONTENT_STATE_FAILED;
          state.stateMessage =
            "Something went wrong while fetching content data :(";
        }
      })
      .addCase(getContentsInfo.rejected, (state) => {
        state.state = CONTENT_STATE_FAILED;
        state.stateMessage = "Failed to load page data";
      })

      //Delete Content
      .addCase(deleteContent.pending, (state) => {
        state.state = CONTENT_STATE_LOADING;
      })
      .addCase(deleteContent.fulfilled, (state, action) => {
        state.stateMessage = "You have successfully deleted the content";
        const sectionIndex = state.sectionData.findIndex(
          (section) => section.sectionId === action.meta.arg.sectionId
        );

        if (sectionIndex !== -1) {
          const updatedSection = { ...state.sectionData[sectionIndex] };
          const contentIndex = updatedSection.contentData.findIndex(
            (content) => content.contentId === action.meta.arg.contentId
          );
          if (contentIndex !== -1) {
            updatedSection.contentData.splice(contentIndex, 1);
            state.sectionData[sectionIndex] = updatedSection;
            state.state = CONTENT_STATE_SUCCESS;
          } else {
            state.state = CONTENT_STATE_FAILED;
            state.stateMessage =
              "Something went wrong while deleting the content :(";
          }
        } else {
          state.state = CONTENT_STATE_FAILED;
          state.stateMessage =
            "Something went wrong while deleting the content :(";
        }
      })
      .addCase(deleteContent.rejected, (state) => {
        state.state = CONTENT_STATE_FAILED;
        state.stateMessage = "Failed to load page data";
      })

      //Like Content
      .addCase(likeContent.pending, (state) => {
        state.likeState = CONTENT_STATE_LOADING;
      })
      .addCase(likeContent.fulfilled, (state) => {
        state.likeState = CONTENT_STATE_SUCCESS;
      })
      .addCase(likeContent.rejected, (state) => {
        state.likeState = CONTENT_STATE_FAILED;
        state.stateMessage = "Something went wrong :(";
      })

      .addCase(pinContent.pending, (state) => {
        state.pinState = CONTENT_STATE_LOADING;
      })
      .addCase(pinContent.fulfilled, (state, action) => {
        state.pinState = CONTENT_STATE_SUCCESS;
        const contentId = action.meta.arg.contentId;
        if (!state.pinnedContentIds.includes(contentId)) {
          state.pinnedContentIds.push(contentId);
        }
      })
      .addCase(pinContent.rejected, (state) => {
        state.pinState = CONTENT_STATE_FAILED;
        state.stateMessage = "Something went wrong :(";
      })

      .addCase(unpinContent.pending, (state) => {
        state.pinState = CONTENT_STATE_LOADING;
      })
      .addCase(unpinContent.fulfilled, (state, action) => {
        state.pinState = CONTENT_STATE_SUCCESS;
        const contentId = action.meta.arg.contentId;
        state.pinnedContentIds = state.pinnedContentIds.filter(
          (id) => id !== contentId
        );

        state.myBoard.pinned.items = state.myBoard.pinned.items.filter(
          (c) => c.contentId !== contentId
        );
        state.myBoard.pinned.hasMore = true;
      })
      .addCase(unpinContent.rejected, (state) => {
        state.pinState = CONTENT_STATE_FAILED;
        state.stateMessage = "Something went wrong :(";
      })

      .addCase(getPinnedContentIds.fulfilled, (state, action) => {
        state.pinnedContentIds = action.payload.pinnedContentIds;
      })

      //Comment Content
      .addCase(addComment.pending, (state) => {
        state.commentState = CONTENT_STATE_LOADING;
      })
      .addCase(addComment.fulfilled, (state) => {
        state.commentState = CONTENT_STATE_SUCCESS;
      })
      .addCase(addComment.rejected, (state) => {
        state.commentState = CONTENT_STATE_FAILED;
        state.stateMessage = "Something went wrong :(";
      })

      //Get all comments
      .addCase(getAllComments.pending, (state) => {
        state.commentState = CONTENT_STATE_LOADING;
      })
      .addCase(getAllComments.fulfilled, (state, action) => {
        state.commentState = CONTENT_STATE_SUCCESS;
        state.comments = action.payload.commentInfo;
        
        // Update comment count across all content locations
        const contentId = action.meta.arg.contentId;
        const newCount = action.payload.commentInfo.length;

        state.sectionData.forEach((section) => {
          const content = section.contentData.find((c) => c.contentId === contentId);
          if (content) content.commentCount = newCount;
        });

        state.verticalData.forEach((section) => {
          const content = section.contentData.find((c) => c.contentId === contentId);
          if (content) content.commentCount = newCount;
        });

        const searchContent = state.contents.find((c) => c.contentId === contentId);
        if (searchContent) searchContent.commentCount = newCount;

        const trendingContent = state.trendingContents.find((c) => c.contentId === contentId);
        if (trendingContent) trendingContent.commentCount = newCount;


        const pinnedContent = state.myBoard.pinned.items.find((c) => c.contentId === contentId);
        if (pinnedContent) pinnedContent.commentCount = newCount;
        
        const essentialContent = state.myBoard.essential.items.find((c) => c.contentId === contentId);
        if (essentialContent) essentialContent.commentCount = newCount;
      })
      .addCase(getAllComments.rejected, (state) => {
        state.commentState = CONTENT_STATE_FAILED;
        state.stateMessage = "Something went wrong :(";
      })

      //Get all likes
      .addCase(getLikes.pending, (state) => {
        state.likesState = CONTENT_STATE_LOADING;
      })
      .addCase(getLikes.fulfilled, (state, action) => {
        state.likesState = CONTENT_STATE_SUCCESS;
        state.likes[action.payload.contentId] = action.payload.likes;
      })
      .addCase(getLikes.rejected, (state, action) => {
        state.likesState = CONTENT_STATE_FAILED;
        const contentId = action.meta.arg.contentId;
        state.likes[contentId] = [];
        state.stateMessage = "Failed to fetch likes";
      })

      //Get all tags
      .addCase(getAllTags.pending, (state) => {
        state.tagState = CONTENT_STATE_LOADING;
      })
      .addCase(getAllTags.fulfilled, (state, action) => {
        state.tagState = CONTENT_STATE_SUCCESS;
        state.tagData = action.payload.tagInfo;
      })
      .addCase(getAllTags.rejected, (state) => {
        state.tagState = CONTENT_STATE_FAILED;
        state.stateMessage = "Something went wrong :(";
      })

      //Get blocked iframe URLs
      .addCase(getBlockedIframeUrls.pending, (state) => {
        state.blockedUrlsState = CONTENT_STATE_LOADING;
      })
      .addCase(getBlockedIframeUrls.fulfilled, (state, action) => {
        state.blockedUrlsState = CONTENT_STATE_SUCCESS;
        state.blockedIframeUrls = action.payload.blockedUrls;
      })
      .addCase(getBlockedIframeUrls.rejected, (state) => {
        state.blockedUrlsState = CONTENT_STATE_FAILED;
      })

      //Search contents
      .addCase(searchContent.pending, (state) => {
        state.searchState = CONTENT_STATE_LOADING;
      })
      .addCase(searchContent.fulfilled, (state, action) => {
        state.searchResults = action.payload.searchInfo;
        state.searchState = CONTENT_STATE_SUCCESS;
      })
      .addCase(searchContent.rejected, (state) => {
        state.searchState = CONTENT_STATE_FAILED;
        state.stateMessage = "Something went wrong :(";
      })

      //Filter contents
      .addCase(filterContent.pending, (state) => {
        state.searchState = CONTENT_STATE_LOADING;
      })
      .addCase(filterContent.fulfilled, (state, action) => {
        state.searchResults = action.payload.filterInfo;
        state.searchState = CONTENT_STATE_SUCCESS;
      })
      .addCase(filterContent.rejected, (state) => {
        state.searchState = CONTENT_STATE_FAILED;
        state.stateMessage = "Something went wrong :(";
      })

      //Get content report details
      .addCase(getContentReport.pending, (state) => {
        state.contentReportState = CONTENT_STATE_LOADING;
      })
      .addCase(getContentReport.fulfilled, (state, action) => {
        state.contentReport = action.payload.reportInfo;
        state.contentReportState = CONTENT_STATE_SUCCESS;
      })
      .addCase(getContentReport.rejected, (state) => {
        state.contentReportState = CONTENT_STATE_FAILED;
      })

      // Create Tag
      .addCase(createTag.pending, (state) => {
        state.tagState = CONTENT_STATE_LOADING;
      })
      .addCase(createTag.fulfilled, (state) => {
        state.tagState = CONTENT_STATE_SUCCESS;
      })
      .addCase(createTag.rejected, (state) => {
        state.tagState = CONTENT_STATE_FAILED;
        state.stateMessage = "Failed to create tag";
      })

      // Delete Tag
      .addCase(deleteTag.pending, (state) => {
        state.tagState = CONTENT_STATE_LOADING;
      })
      .addCase(deleteTag.fulfilled, (state) => {
        state.tagState = CONTENT_STATE_SUCCESS;
      })
      .addCase(deleteTag.rejected, (state) => {
        state.tagState = CONTENT_STATE_FAILED;
        state.stateMessage = "Failed to delete tag";
      })
      .addCase(updateComment.pending, (state) => {
        state.commentState = CONTENT_STATE_LOADING;
      })
      .addCase(updateComment.fulfilled, (state) => {
        state.commentState = CONTENT_STATE_SUCCESS;
      })
      .addCase(updateComment.rejected, (state) => {
        state.commentState = CONTENT_STATE_FAILED;
        state.stateMessage =
          "Something went wrong while updating the comment :(";
      })

      // Delete Comment
      .addCase(deleteComment.pending, (state) => {
        state.commentState = CONTENT_STATE_LOADING;
      })
      .addCase(deleteComment.fulfilled, (state) => {
        state.commentState = CONTENT_STATE_SUCCESS;
      })
      .addCase(deleteComment.rejected, (state) => {
        state.commentState = CONTENT_STATE_FAILED;
        state.stateMessage =
          "Something went wrong while deleting the comment :(";
      })

      // Get Trending Contents
      .addCase(getTrendingContents.pending, (state) => {
        state.trendingState = CONTENT_STATE_LOADING;
      })
      .addCase(getTrendingContents.fulfilled, (state, action) => {
        state.trendingState = CONTENT_STATE_SUCCESS;
        state.trendingContents = action.payload.trendingContents;
      })
      .addCase(getTrendingContents.rejected, (state) => {
        state.trendingState = CONTENT_STATE_FAILED;
        state.stateMessage = "Failed to load trending contents";
      });
  },
});

//Get Section data
export const getSectionInfo = createAsyncThunk(
  "pitstop/getSectionInfo",
  async (
    payload: { routePath: string; offset: number; isInitial: boolean },
    { dispatch }
  ) => {
    return new Promise<{
      sectionInfo: Section[];
    }>((resolve, reject) => {
      ApiService.getInstance()
        .get(
          AppConfig.serviceUrls.getContentInfo +
            "sections" +
            "?routePath=" +
            payload.routePath +
            "&limit=" +
            SECTION_LIMIT +
            "&offset=" +
            payload.offset
        )
        .then((resp) => {
          resolve({
            sectionInfo: resp.data,
          });
        })
        .catch((error: Error) => {
          dispatch(
            enqueueSnackbarMessage({
              message:
                "Something went wrong while fetching section information :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(error);
        });
    });
  }
);

//Get Vertical Section data
export const getVerticalSectionInfo = createAsyncThunk(
  "pitstop/getVerticalSectionInfo",
  async (_, { dispatch }) => {
    let verticalSectionInfo: Section[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await ApiService.getInstance().get(
          AppConfig.serviceUrls.getContentInfo +
            "sections" +
            "?limit=" +
            SECTION_LIMIT +
            "&offset=" +
            offset
        );

        const verticalSections = response.data.filter(
          (section: Section) => section.sectionType === "vertical"
        );

        verticalSectionInfo = verticalSectionInfo.concat(verticalSections);

        offset += SECTION_LIMIT;
        hasMore = response.data.length === SECTION_LIMIT;
      } catch (error) {
        dispatch(
          enqueueSnackbarMessage({
            message: "Something went wrong while fetching vertical sections :(",
            type: "error",
            anchorOrigin: {
              vertical: "bottom",
              horizontal: "right",
            },
          })
        );
        throw error;
      }
    }
    return { verticalSectionInfo };
  }
);

//Get Content data
export const getContentsInfo = createAsyncThunk(
  "pitstop/getContentsInfo",
  async (
    payload: { sectionId: number; offset: number; isInitial: boolean; loadAll?: boolean },
    { dispatch }
  ) => {
    return new Promise<{
      response: { contentInfo: ContentResponse[]; sectionId: number };
    }>((resolve, reject) => {
    const { sectionId, offset, loadAll } = payload;
      const limit = (sectionId === -3 && loadAll) ? 1000 : (CONTENTS_PER_SECTION + 1);
      const params = new URLSearchParams();
      params.append('sectionId', String(sectionId));
      params.append('limit', String(limit));
      params.append('offset', String(offset));
      const url = `${AppConfig.serviceUrls.getContents}?${params.toString()}`;
      
      ApiService.getInstance()
        .get(url)
        .then((resp) => {
          if (resp.data.length === 0 && offset !== 0) {
            dispatch(
              enqueueSnackbarMessage({
                message:
                  "There are no more contents available for this section.",
                type: "warning",
                anchorOrigin: {
                  vertical: "bottom",
                  horizontal: "center",
                },
              })
            );
          }
          resolve({
            response: { contentInfo: resp.data, sectionId: payload.sectionId },
          });
        })
        .catch((error: Error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while fetching contents :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(error);
        });
    });
  }
);

//Get Trending Contents 
export const getTrendingContents = createAsyncThunk(
  "pitstop/getTrendingContents",
  async (_, { dispatch }) => {
    return new Promise<{ trendingContents: ContentResponse[] }>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.getTrendingContents)
        .then((resp) => {
          resolve({ trendingContents: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while fetching trending contents :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Get Page data
export const getPageData = createAsyncThunk(
  "pitstop/getPageData",
  async (routePath: string, { dispatch }) => {
    const excludedRoutes = ["/search", "search", "/my-board", "my-board"];
    if (excludedRoutes.includes(routePath)) {
      return { pageData, routeContents: [] };
    }

    return new Promise<{
      pageData: LocalPageData;
      routeContents: ContentResponse[];
    }>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.getPageData + "?routePath=" + routePath)
        .then((resp) => {
          const pageResponse = resp.data;
          const routeContents = pageResponse.routeContents || [];
          dispatch(getSectionInfo({ routePath, offset: 0, isInitial: true }))
            .finally(() => {
              resolve({
                pageData: {
                  customButtons: [],
                  title: pageResponse.title,
                  description: pageResponse.description,
                  thumbnail: pageResponse.thumbnail,
                  customPageTheme: pageResponse.customPageTheme,
                  isVisible: pageResponse.isVisible,
                  isRouteVisible: 1,
                },
                routeContents: routeContents,
              });
            });
        })
        .catch((error: Error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while fetching page data :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(error);
        });
    });
  }
);

//Create a new Content to a particular section
export const createNewContent = createAsyncThunk(
  "pitstop/createNewContent",
  async (
    payload: { content: ContentPayload; routePath: string },
    { dispatch }
  ) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.createNewContent, payload.content)
        .then((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "You have successfully created a content",
              type: CONTENT_STATE_SUCCESS,
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          resolve({ requestResponse: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while creating a content :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        })
        .finally(() => {
          dispatch(getPageData(payload.routePath));
        });
    });
  }
);

export const updateContent = createAsyncThunk(
  "pitstop/updateContent",
  async (
    payload: {contentId: number; content: UpdateContentPayload; routePath: string },
    { dispatch }
  ) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .patch(AppConfig.serviceUrls.updateContent(payload.contentId), payload.content)
        .then((resp) => {
          dispatch(getPageData(payload.routePath));
          dispatch(
            enqueueSnackbarMessage({
              message: "You have successfully updated the content",
              type: CONTENT_STATE_SUCCESS,
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          resolve({ requestResponse: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while updating the content :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Delete a particular content
export const deleteContent = createAsyncThunk(
  "pitstop/deleteContent",
  async (
    payload: { routeId: number; contentId: number; sectionId: number },
    { dispatch }
  ) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .delete(AppConfig.serviceUrls.deleteContent + payload.contentId)
        .then((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "You have successfully deleted the content",
              type: CONTENT_STATE_SUCCESS,
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          resolve({ requestResponse: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while deleting the content :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Fetch the content for my board page
export const fetchMyBoardSection = createAsyncThunk(
  "pitstop/fetchMyBoardSection",
  async (
    payload: {PanelTypes: MyBoardPanelTypes; offset: number },
    { dispatch, rejectWithValue }
  ) => {
    const { PanelTypes, offset } = payload;

    const limit = MY_BOARD_ITEMS_PER_PAGE + 1;

    let url: string;
    if (PanelTypes === "pinned") {
      url = `${AppConfig.serviceUrls.createNewContent}/pinned?limit=${limit}&offset=${offset}`;
    } else {
      const params = new URLSearchParams();
      params.append('sectionId', String(MY_BOARD_ESSENTIALS_SECTION_ID));
      params.append('limit', String(limit));
      params.append('offset', String(offset));
      url = `${AppConfig.serviceUrls.getContents}?${params.toString()}`;
    }

    try {
      const resp = await ApiService.getInstance().get(url);
      const data = resp.data as ContentResponse[];

      const hasMore = data.length > MY_BOARD_ITEMS_PER_PAGE;
      const pageItems = hasMore ? data.slice(0, MY_BOARD_ITEMS_PER_PAGE) : data;

      return {
        PanelTypes,
        offset,
        items: pageItems,
        hasMore,
      };
    } catch (error: unknown) {
      dispatch(
        enqueueSnackbarMessage({
          message:
            PanelTypes === "pinned"
              ? "Something went wrong while fetching pinned contents :("
              : "Something went wrong while fetching essential contents :(",
          type: "error",
          anchorOrigin: { vertical: "bottom", horizontal: "right" },
        })
      );
      return rejectWithValue(error);
    }
  }
);

//Add a like to a content
export const likeContent = createAsyncThunk(
  "pitstop/likeContent",
  async (payload: { contentId: number }, { dispatch }) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.addLike + payload.contentId + "/likes")
        .then((resp) => {
          resolve({ requestResponse: resp.data });
        })
        .catch((resp) => {
          if (resp?.response?.status === 404) {
            resolve({
              contentId: payload.contentId,
              likes: []
            });
            return;
          }
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while adding like to content :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Pin a content
export const pinContent = createAsyncThunk(
  "pitstop/pinContent",
  async (payload: { contentId: number }, { dispatch}) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.pinContent, { contentId: payload.contentId })
        .then((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Content pinned successfully!",
              type: CONTENT_STATE_SUCCESS,
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          
          const currentPath = window.location.pathname;
          if (currentPath === "/" || currentPath === "/home") {
            dispatch(getSectionInfo({ routePath: currentPath, offset: 0, isInitial: true }));
          }
          
          resolve({ requestResponse: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while pinning content :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Unpin a content
export const unpinContent = createAsyncThunk(
  "pitstop/unpinContent",
  async (payload: { contentId: number }, { dispatch }) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .delete(AppConfig.serviceUrls.unpinContent + payload.contentId)
        .then((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Content unpinned successfully!",
              type: CONTENT_STATE_SUCCESS,
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );

          const currentPath = window.location.pathname;
          if (currentPath === "/" || currentPath === "/home") {
            dispatch(getSectionInfo({ routePath: currentPath, offset: 0, isInitial: true }));
          }
          
          resolve({ requestResponse: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while unpinning content :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Get pinned content IDs
export const getPinnedContentIds = createAsyncThunk(
  "pitstop/getPinnedContentIds",
  async () => {
    const pageSize = 1000;
    let offset = 0;
    let allPinnedContentIds: number[] = [];
    let hasMore = true;
    while (hasMore) {
      try {
        const resp = await ApiService.getInstance()
          .get(AppConfig.serviceUrls.createNewContent + `/pinned?limit=${pageSize}&offset=${offset}`);
        const ids = resp.data.map((content: unknown) => (content as { contentId: number }).contentId);
        allPinnedContentIds = allPinnedContentIds.concat(ids);
        if (ids.length < pageSize) {
          hasMore = false;
        } else {
          offset += pageSize;
        }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e) {
        return { pinnedContentIds: allPinnedContentIds };
      }
    }
    return { pinnedContentIds: allPinnedContentIds };
  }
);

//Add a comment to a content
export const addComment = createAsyncThunk(
  "pitstop/commentContent",
  async (payload: { contentId: number; comment: string; mentionedEmails?: string[] }, { dispatch }) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.createNewComment, payload)
        .then((resp) => {
          resolve({ requestResponse: resp.data });
          dispatch(getAllComments({ contentId: payload.contentId }));
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while adding a comment :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(error);
        });
    });
  }
);

// Fetch mention suggestions by name
export const fetchMentionSuggestions = createAsyncThunk(
  "pitstop/fetchMentionSuggestions",
  async (payload: EmployeeSearchPayload, { dispatch }) => {
    if (payload.searchQuery.length < 2) {
      return [];
    }
    return new Promise<EmployeeSuggestion[]>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.searchEmployees, payload)
        .then((resp) => {
          resolve(resp.data || []);
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Error fetching mention suggestions",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(error);
        });
    });
  }
);

//Get all comments of a particular content
export const getAllComments = createAsyncThunk(
  "pitstop/fetchComments",
  async (payload: { contentId: number }, { dispatch }) => {
    return new Promise<{ commentInfo: CommentsResponse[] }>(
      (resolve, reject) => {
        ApiService.getInstance()
          .get(
            AppConfig.serviceUrls.getAllComments +
              "?contentId=" +
              payload.contentId
          )
          .then((resp) => {
            resolve({
              commentInfo: resp.data,
            });
          })
          .catch((resp) => {
            dispatch(
              enqueueSnackbarMessage({
                message: "Something went wrong while adding like to content :(",
                type: "error",
                anchorOrigin: {
                  vertical: "bottom",
                  horizontal: "right",
                },
              })
            );
            reject(resp);
          });
      }
    );
  }
);

// Get all likes of a particular content
export const getLikes = createAsyncThunk(
  "pitstop/fetchlikes",
  async (payload: { contentId: number }, { dispatch }) => {
    return new Promise<{ contentId: number; likes: LikeResponse[] }>(
      (resolve, reject) => {
        ApiService.getInstance()
          .get(AppConfig.serviceUrls.getLikes(payload.contentId))
          .then((resp) => {
            resolve({
              contentId: payload.contentId,
              likes: resp.data,
            });
          })
          .catch((resp) => {
            dispatch(
              enqueueSnackbarMessage({
                message: "Failed to fetch likes",
                type: "error",
                anchorOrigin: {
                  vertical: "bottom",
                  horizontal: "right",
                },
              })
            );
            reject(resp);
          });
      }
    );
  }
);

//Search content by text
export const searchContent = createAsyncThunk(
  "pitstop/searchContent",
  async (payload: { userInput: string }, { dispatch }) => {
    return new Promise<{
      searchInfo: ContentResponse[];
    }>((resolve, reject) => {
      ApiService.getInstance()
        .post(
          AppConfig.serviceUrls.searchContent +
            "?userInput=" +
            payload.userInput
        )
        .then((resp) => {
          resolve({ searchInfo: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while searching content :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Filter content by tags
export const filterContent = createAsyncThunk(
  "pitstop/filterContent",
  async (payload: { inputTags: string[] }, { dispatch }) => {
    return new Promise<{
      filterInfo: ContentResponse[];
    }>((resolve, reject) => {
      ApiService.getInstance()
        .post(
          AppConfig.serviceUrls.filterContent +
            "?inputTags=" +
            payload.inputTags
        )
        .then((resp) => {
          resolve({ filterInfo: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message:
                "Something went wrong while filtering content by tags :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

// Update Comment
export const updateComment = createAsyncThunk(
  "pitstop/updateComment",
  async (payload: UpdateCommentPayload, { dispatch }) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .patch(
          `${AppConfig.serviceUrls.updateComment}/${payload.commentId}`,
          payload
        )
        .then((resp) => {
          dispatch(getAllComments({ contentId: payload.contentId }));
          resolve({ requestResponse: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while updating the comment :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Delete Comment
export const deleteComment = createAsyncThunk(
  "pitstop/deleteComment",
  async (payload: UpdateCommentPayload, { dispatch }) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .delete(`${AppConfig.serviceUrls.updateComment}/${payload.commentId}`, {
          data: payload,
        })
        .then((resp) => {
          dispatch(getAllComments({ contentId: payload.contentId }));
          resolve({ requestResponse: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message:
                resp?.response?.data?.message ||
                "Something went wrong while deleting the comment",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Get content details for report
export const getContentReport = createAsyncThunk(
  "pitstop/contentReport",
  async (_, { dispatch }) => {
    return new Promise<{
      reportInfo: ContentReportResponse[];
    }>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.searchContentBasic)
        .then((resp) => {
          resolve({ reportInfo: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message:
                "Something went wrong while fetching content for report :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Get all existing tags
export const getAllTags = createAsyncThunk(
  "pitstop/fetchTags",
  async (_, { dispatch }) => {
    return new Promise<{ tagInfo: TagResponse[] }>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.getAllTags)
        .then((resp) => {
          resolve({
            tagInfo: resp.data,
          });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while retreiving tags :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Get blocked iframe Urls
export const getBlockedIframeUrls = createAsyncThunk(
  "pitstop/fetchBlockedIframeUrls",
  async (_, { dispatch }) => {
    return new Promise<{ blockedUrls: string[] }>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.appInfo)
        .then((resp) => {
          resolve({
            blockedUrls: resp.data.blockedIframeUrls || [],
          });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while fetching blocked URLs :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Create a new tag
export const createTag = createAsyncThunk(
  "pitstop/createTag",
  async (payload: { tagName: string }, { dispatch }) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.createTag, payload)
        .then((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "You have successfully created a new tag",
              type: CONTENT_STATE_SUCCESS,
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          resolve({ requestResponse: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while creating a new tag :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

//Delete a tag
export const deleteTag = createAsyncThunk(
  "pitstop/deleteTag",
  async (payload: { tagName: string }, { dispatch }) => {
    return new Promise<unknown>((resolve, reject) => {
      ApiService.getInstance()
        .delete(AppConfig.serviceUrls.deleteTag + payload.tagName)
        .then((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "You have successfully deleted the tag",
              type: CONTENT_STATE_SUCCESS,
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          resolve({ requestResponse: resp.data });
        })
        .catch((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Something went wrong while deleting the tag :(",
              type: "error",
              anchorOrigin: {
                vertical: "bottom",
                horizontal: "right",
              },
            })
          );
          reject(resp);
        });
    });
  }
);

export const { resetPageData, clearSearchResults } = PageSlice.actions;
export default PageSlice.reducer;

export interface LocalPageData {
  customButtons: [];
  title: string;
  description: string;
  thumbnail: string;
  customPageTheme?: CustomTheme;
  isVisible: number;
  isRouteVisible: number;
}
