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
import { UIMessages } from "@config/constant";
import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { RouteStatuses } from "@root/src/types/types";

const initialState: EmployeeState = {
  state: "idle",
  stateMessage: null,
  errorMessage: null,
  employeeInfo: null,
  backgroundProcess: false,
  backgroundProcessMessage: null,
};

interface EmployeeState {
  state: RouteStatuses;
  stateMessage: string | null;
  errorMessage: string | null;
  employeeInfo: EmployeeInfoInterface | null;
  backgroundProcess: boolean;
  backgroundProcessMessage: string | null;
}

interface EmployeeInfoInterface {
  employeeId: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  department: string | null;
  team: string | null;
  location: string;
  employeeThumbnail: string;
}

export const getEmployeeInfo = createAsyncThunk(
  "employee/getEmployeeInfo",
  async (employeeEmail: string, { dispatch }) => {
    return new Promise<{
      employeeInfo: EmployeeInfoInterface;
    }>((resolve, reject) => {
      dispatch(updateStateMessage(UIMessages.loading.checkEmployeeInfo));

      ApiService.getInstance()
        .get(AppConfig.serviceUrls.getEmployeeInfo + employeeEmail)
        .then((resp) => {
          if (resp.status == 200) {
            const data = resp.data;
            resolve({
              employeeInfo: {
                ...data,
                department: data.department || "—",
                team: data.team || "—",
              },
            });
          }
        })
        .catch((error: Error) => {
          reject(error);
        });
    });
  }
);

export const EmployeeSlice = createSlice({
  name: "getEmployeeInfo",
  initialState,
  reducers: {
    updateStateMessage: (state, action: PayloadAction<string>) => {
      state.stateMessage = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(getEmployeeInfo.pending, (state) => {
        state.state = "loading";
        state.stateMessage = "Checking Employee Info";
      })
      .addCase(getEmployeeInfo.fulfilled, (state, action) => {
        state.employeeInfo = action.payload.employeeInfo;
        state.state = "success";
        state.stateMessage = null;
      })
      .addCase(getEmployeeInfo.rejected, (state) => {
        state.state = "failed";
        state.stateMessage = null;
      });
  },
});

export const { updateStateMessage } = EmployeeSlice.actions;
export default EmployeeSlice.reducer;
