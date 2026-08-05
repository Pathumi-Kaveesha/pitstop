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

import axios, { AxiosInstance, CancelTokenSource } from "axios";
import * as rax from "retry-axios";

export class ApiService {
  private static _instance: AxiosInstance;
  private static _idToken: string;
  private static _cancelTokenSource = axios.CancelToken.source();
  private static _cancelTokenMap: Map<string, CancelTokenSource> = new Map();
  private static callback: () => Promise<{ idToken: string }>;

  private static _isRefreshing = false;
  private static _refreshPromise: Promise<{ idToken: string }> | null = null;

  constructor(idToken: string, callback: () => Promise<{ idToken: string }>) {
    ApiService._instance = axios.create();
    rax.attach(ApiService._instance);

    ApiService._idToken = idToken;
    ApiService.updateRequestInterceptor();
    ApiService.callback = callback;
    (ApiService._instance.defaults as unknown as rax.RaxConfig).raxConfig = {
      retry: 3,
      instance: ApiService._instance,
      httpMethodsToRetry: ["GET", "HEAD", "OPTIONS", "DELETE", "POST", "PATCH"],
      statusCodesToRetry: [[401, 401]],
      retryDelay: 100,

      onRetryAttempt: async () => {
        if (!ApiService._isRefreshing) {
          ApiService._isRefreshing = true;
          ApiService._refreshPromise = ApiService.callback()
            .then((res) => {
              ApiService.updateTokens(res.idToken);
              ApiService._instance.interceptors.request.clear();
              ApiService.updateRequestInterceptor();
              return res;
            })
            .finally(() => {
              ApiService._isRefreshing = false;
              ApiService._refreshPromise = null;
            });
        }
        return ApiService._refreshPromise;
      },
    };
  }

  public static getInstance(): AxiosInstance {
    return ApiService._instance;
  }

  public static getIdToken(): string | null {
    return ApiService._idToken || null;
  }

  public static getCancelToken() {
    return ApiService._cancelTokenSource;
  }

  public static updateCancelToken(): CancelTokenSource {
    ApiService._cancelTokenSource = axios.CancelToken.source();
    return ApiService._cancelTokenSource;
  }

  private static updateTokens(idToken: string) {
    ApiService._idToken = idToken;
  }

  private static updateRequestInterceptor() {
    ApiService._instance.interceptors.request.use(
      (config) => {
        config.headers.set("Authorization", "Bearer " + ApiService._idToken);

        const endpoint = config.url || "";

        const newTokenSource = axios.CancelToken.source();
        ApiService._cancelTokenMap.set(endpoint, newTokenSource);
        config.cancelToken = newTokenSource.token;
        return config;
      },
      (error) => {
        Promise.reject(error);
      }
    );
  }
}
