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

import axios from "axios";

export const RATE_LIMIT_MESSAGE = "You're searching too fast. Please wait a minute and try again.";
const SEARCH_FAILED_MESSAGE = "Something went wrong with that search. Please try again.";
const SEARCH_SLOW_MESSAGE = "Search is taking too long to answer. Please try again in a moment.";

// Says in plain words why a search failed, never a status code or a browser message.
export const describeSearchFailure = (error: unknown): string => {
  if (!axios.isAxiosError(error)) return SEARCH_FAILED_MESSAGE;
  const status = error.response?.status;
  if (status === 429) return RATE_LIMIT_MESSAGE;
  if (!error.response) {
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return SEARCH_SLOW_MESSAGE;
    return navigator.onLine === false
      ? "You seem to be offline. Check your connection, then try again."
      : "We couldn't reach the server. Check your connection, then try again in a moment.";
  }
  if (status === 408 || status === 504) return SEARCH_SLOW_MESSAGE;
  if (status === 502 || status === 503) return "Search isn't responding right now. Please try again in a few minutes.";
  if (status === 401) return "Your sign-in has ended. Reload the page to sign in again.";
  return SEARCH_FAILED_MESSAGE;
};
