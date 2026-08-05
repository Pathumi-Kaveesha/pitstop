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

import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { AppConfig } from "@config/config";
import { ApiService } from "@utils/apiService";
import type { AnalyticsEventType } from "@utils/types";

export interface AnalyticsEventPayload {
  userEmail: string;
  userName?: string;
  department?: string;
  region?: string;
  eventType: AnalyticsEventType | string;
  contentId?: number | null;
  sessionId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ContentPerformanceMetric {
  contentId: number;
  title: string;
  contentType: string;
  isEmbeddable?: boolean;
  previewClicks: number;
  outlinkClicks: number;
  totalViews: number;
  uniqueViews: number;
  fullCompletions: number;
}

export interface UserLeaderboardEntry {
  userEmail: string;
  userName: string;
  department: string;
  region: string;
  totalEngagements: number;
  timeSpentSeconds: number;
  activityScore: number;
}

export interface RegionalTimeMetric {
  region: string;
  totalTimeSpentSeconds: number;
  activeUsersCount: number;
}

export interface SearchMetric {
  searchTerm: string;
  searchCount: number;
  uniqueSearchCount: number;
}

export interface TrafficPeakMetric {
  peakHour: number;
  dayOfWeek: string;
  visitCount: number;
}

export interface AnalyticsSummary {
  totalViews: number;
  totalUniqueViews: number;
  totalTimeSpentSeconds: number;
  totalEngagements: number;
  topContent: ContentPerformanceMetric[];
  leaderboard: UserLeaderboardEntry[];
  regionalTimeSpent: RegionalTimeMetric[];
  topSearches: SearchMetric[];
  peakActivityTimes: TrafficPeakMetric[];
}

export interface AnalyticsFilterParams {
  startDate?: string;
  endDate?: string;
  region?: string;
  userEmail?: string;
  pageRoute?: string;
  sortBy?: "totalViews" | "uniqueViews";
  timezoneOffsetMinutes?: number;
}

interface AnalyticsState {
  logState: "idle" | "loading" | "success" | "failed";
  summaryStatus: "idle" | "loading" | "success" | "failed";
  summary: AnalyticsSummary | null;

  // Independent card states
  topContent: ContentPerformanceMetric[];
  topContentStatus: "idle" | "loading" | "success" | "failed";

  leaderboard: UserLeaderboardEntry[];
  leaderboardStatus: "idle" | "loading" | "success" | "failed";

  regionalTimeSpent: RegionalTimeMetric[];
  regionalStatus: "idle" | "loading" | "success" | "failed";

  peakActivityTimes: TrafficPeakMetric[];
  peakStatus: "idle" | "loading" | "success" | "failed";

  topSearches: SearchMetric[];
  searchesStatus: "idle" | "loading" | "success" | "failed";

  error: string | null;
}

const initialState: AnalyticsState = {
  logState: "idle",
  summaryStatus: "idle",
  summary: null,

  topContent: [],
  topContentStatus: "idle",

  leaderboard: [],
  leaderboardStatus: "idle",

  regionalTimeSpent: [],
  regionalStatus: "idle",

  peakActivityTimes: [],
  peakStatus: "idle",

  topSearches: [],
  searchesStatus: "idle",

  error: null,
};

const buildQueryString = (params: AnalyticsFilterParams) => {
  const queryParams = new URLSearchParams();
  if (params.startDate) queryParams.append("startDate", params.startDate);
  if (params.endDate) queryParams.append("endDate", params.endDate);
  if (params.region) queryParams.append("region", params.region);
  if (params.userEmail) queryParams.append("userEmail", params.userEmail);
  if (params.pageRoute) queryParams.append("pageRoute", params.pageRoute);
  if (params.sortBy) queryParams.append("sortBy", params.sortBy);

  // Standardize timezone offset: -new Date().getTimezoneOffset() converts browser offset to standard UTC offset (+330 for UTC+5:30)
  const tzOffset =
    params.timezoneOffsetMinutes ?? -new Date().getTimezoneOffset();
  queryParams.append("timezoneOffsetMinutes", tzOffset.toString());

  const q = queryParams.toString();
  return q ? `?${q}` : "";
};

export const logAnalyticsEvent = createAsyncThunk(
  "analytics/logEvent",
  async (payload: AnalyticsEventPayload, { rejectWithValue }) => {
    try {
      const response = await ApiService.getInstance().post(
        AppConfig.serviceUrls.logAnalyticsEvent(),
        payload
      );
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.message || "Failed to log event"
      );
    }
  }
);

export const fetchAnalyticsSummary = createAsyncThunk(
  "analytics/fetchSummary",
  async (params: AnalyticsFilterParams = {}, { rejectWithValue }) => {
    try {
      const url = `${AppConfig.serviceUrls.getAnalyticsSummary()}${buildQueryString(params)}`;
      const response = await ApiService.getInstance().get(url);
      return response.data as AnalyticsSummary;
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.message || "Failed to fetch analytics summary"
      );
    }
  }
);

export const fetchTopContent = createAsyncThunk(
  "analytics/fetchTopContent",
  async (params: AnalyticsFilterParams = {}, { rejectWithValue }) => {
    try {
      const url = `${AppConfig.serviceUrls.getAnalyticsSummary()}/top-content${buildQueryString(params)}`;
      const response = await ApiService.getInstance().get(url);
      return response.data as ContentPerformanceMetric[];
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.message || "Failed to fetch top content"
      );
    }
  }
);

export const fetchLeaderboard = createAsyncThunk(
  "analytics/fetchLeaderboard",
  async (params: AnalyticsFilterParams = {}, { rejectWithValue }) => {
    try {
      const url = `${AppConfig.serviceUrls.getAnalyticsSummary()}/leaderboard${buildQueryString(params)}`;
      const response = await ApiService.getInstance().get(url);
      return response.data as UserLeaderboardEntry[];
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.message || "Failed to fetch leaderboard"
      );
    }
  }
);

export const fetchRegionalTimeSpent = createAsyncThunk(
  "analytics/fetchRegionalTimeSpent",
  async (params: AnalyticsFilterParams = {}, { rejectWithValue }) => {
    try {
      const url = `${AppConfig.serviceUrls.getAnalyticsSummary()}/regional-time${buildQueryString(params)}`;
      const response = await ApiService.getInstance().get(url);
      return response.data as RegionalTimeMetric[];
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.message || "Failed to fetch regional time"
      );
    }
  }
);

export const fetchPeakActivityTimes = createAsyncThunk(
  "analytics/fetchPeakActivityTimes",
  async (params: AnalyticsFilterParams = {}, { rejectWithValue }) => {
    try {
      const url = `${AppConfig.serviceUrls.getAnalyticsSummary()}/peak-activity${buildQueryString(params)}`;
      const response = await ApiService.getInstance().get(url);
      return response.data as TrafficPeakMetric[];
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.message || "Failed to fetch peak activity"
      );
    }
  }
);

export const fetchTopSearches = createAsyncThunk(
  "analytics/fetchTopSearches",
  async (params: AnalyticsFilterParams = {}, { rejectWithValue }) => {
    try {
      const url = `${AppConfig.serviceUrls.getAnalyticsSummary()}/top-searches${buildQueryString(params)}`;
      const response = await ApiService.getInstance().get(url);
      return response.data as SearchMetric[];
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.message || "Failed to fetch top searches"
      );
    }
  }
);

export const analyticsSlice = createSlice({
  name: "analytics",
  initialState,
  reducers: {
    resetAnalyticsState: (state) => {
      state.logState = "idle";
      state.summaryStatus = "idle";
      state.summary = null;
      state.topContent = [];
      state.leaderboard = [];
      state.regionalTimeSpent = [];
      state.peakActivityTimes = [];
      state.topSearches = [];
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Summary Reducers
      .addCase(fetchAnalyticsSummary.pending, (state) => {
        state.summaryStatus = "loading";
      })
      .addCase(
        fetchAnalyticsSummary.fulfilled,
        (state, action: PayloadAction<AnalyticsSummary>) => {
          state.summaryStatus = "success";
          state.summary = action.payload;
          state.topContent = action.payload?.topContent || [];
          state.leaderboard = action.payload?.leaderboard || [];
          state.regionalTimeSpent = action.payload?.regionalTimeSpent || [];
          state.peakActivityTimes = action.payload?.peakActivityTimes || [];
          state.topSearches = action.payload?.topSearches || [];
        }
      )
      .addCase(fetchAnalyticsSummary.rejected, (state, action) => {
        state.summaryStatus = "failed";
        state.summary = null;
        state.topContent = [];
        state.leaderboard = [];
        state.regionalTimeSpent = [];
        state.peakActivityTimes = [];
        state.topSearches = [];
        state.error = action.payload as string;
      })

      // Section-specific reducers
      .addCase(fetchTopContent.fulfilled, (state, action) => {
        state.topContent = action.payload || [];
        state.topContentStatus = "success";
      })
      .addCase(fetchLeaderboard.fulfilled, (state, action) => {
        state.leaderboard = action.payload || [];
        state.leaderboardStatus = "success";
      })
      .addCase(fetchRegionalTimeSpent.fulfilled, (state, action) => {
        state.regionalTimeSpent = action.payload || [];
        state.regionalStatus = "success";
      })
      .addCase(fetchPeakActivityTimes.fulfilled, (state, action) => {
        state.peakActivityTimes = action.payload || [];
        state.peakStatus = "success";
      })
      .addCase(fetchTopSearches.fulfilled, (state, action) => {
        state.topSearches = action.payload || [];
        state.searchesStatus = "success";
      });
  },
});

export const { resetAnalyticsState } = analyticsSlice.actions;
export default analyticsSlice.reducer;