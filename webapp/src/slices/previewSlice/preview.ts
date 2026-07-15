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

import { ApiService } from "@utils/apiService";
import { AppConfig } from "@config/config";
import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { RouteStatuses } from "@root/src/types/types";

export interface PreviewInfoInterface {
  status: "SUCCESS" | "BROKEN" | "RESTRICTED";
  reason: string;
}

interface PreviewState {
  state: RouteStatuses;
  stateMessage: string | null;
  errorMessage: string | null;
  previewInfo: PreviewInfoInterface | null;
}

const initialState: PreviewState = {
  state: "idle",
  stateMessage: null,
  errorMessage: null,
  previewInfo: null,
};

export const verifyLinkPreview = createAsyncThunk(
  "preview/verifyLinkPreview",
  async (targetUrl: string, { dispatch }) => {
    return new Promise<{
      previewInfo: PreviewInfoInterface;
    }>((resolve, reject) => {
      dispatch(updateStateMessage("Verifying secure target link parameters..."));

      ApiService.getInstance()
        .get(AppConfig.serviceUrls.verifyLinkPreview(), {
          params: { url: targetUrl }
        })
        .then((resp) => {
          if (resp.status === 200) {
            resolve({
              previewInfo: resp.data,
            });
            return;
          }
          reject(new Error(`Unexpected response status: ${resp.status}`));
        })
        .catch((error: Error) => {
          reject(error);
        });
    });
  }
);

export const PreviewSlice = createSlice({
  name: "verifyLinkPreview",
  initialState,
  reducers: {
    updateStateMessage: (state, action: PayloadAction<string>) => {
      state.stateMessage = action.payload;
    },
    resetPreviewStatus: (state) => {
      state.state = "idle";
      state.stateMessage = null;
      state.errorMessage = null;
      state.previewInfo = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(verifyLinkPreview.pending, (state) => {
        state.state = "loading";
        state.stateMessage = "Verifying secure target link parameters...";
      })
      .addCase(verifyLinkPreview.fulfilled, (state, action) => {
        state.previewInfo = action.payload.previewInfo;
        state.state = "success";
        state.stateMessage = null;
      })
      .addCase(verifyLinkPreview.rejected, (state, action) => {
        state.state = "failed";
        state.stateMessage = null;
        state.errorMessage = action.error.message || "Network connection dropped";
        state.previewInfo = {
          status: "BROKEN",
          reason: action.error.message || "Failed to establish host connection",
        };
      });
  },
});

export const { updateStateMessage, resetPreviewStatus } = PreviewSlice.actions;
export default PreviewSlice.reducer;