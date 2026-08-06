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

import { useCallback } from "react";
import { useAppDispatch, useAppSelector, RootState } from "@slices/store";
import { logAnalyticsEvent } from "@slices/analyticsSlice/analytics";
import { AppConfig } from "@config/config";
import { AnalyticsEventType } from "@utils/types";
import { ApiService } from "@utils/apiService";

export const getOrCreateSessionId = (): string => {
  if (typeof window === "undefined") return "";

  let tabUniqueKey = window.name;
  if (!tabUniqueKey) {
    tabUniqueKey = "tab_" + Math.random().toString(36).substring(2, 9);
    window.name = tabUniqueKey;
  }

  const storageKey = `pitstop_analytics_session_${tabUniqueKey}`;
  let sessionId = sessionStorage.getItem(storageKey);

  if (!sessionId) {
    sessionId =
      "sess_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
    sessionStorage.setItem(storageKey, sessionId);
  }
  return sessionId;
};

export const useAnalytics = () => {
  const dispatch = useAppDispatch();

  // Select only the userEmail string to keep hook state identity stable
  const userEmail = useAppSelector((state: RootState) => {
    const auth = (state as any).auth;
    return auth?.user?.email || auth?.userInfo?.email || auth?.email || "";
  });

  const trackEvent = useCallback(
    async (
      eventType: AnalyticsEventType | string,
      contentId: number | null = null,
      metadata: Record<string, unknown> = {},
      explicitSessionId?: string | null
    ) => {
      if (!userEmail) return null;

      const sessionId = explicitSessionId || getOrCreateSessionId();

      return await dispatch(
        logAnalyticsEvent({
          userEmail,
          eventType,
          contentId,
          sessionId,
          metadata: {
            timestamp: new Date().toISOString(),
            ...metadata,
          },
        })
      )
        .unwrap()
        .catch((err) => {
          console.warn("Analytics event dispatch failed:", err);
          return null;
        });
    },
    [dispatch, userEmail]
  );

  const flushBeaconEvent = useCallback(
    (
      eventType: AnalyticsEventType | string,
      contentId: number | null = null,
      metadata: Record<string, unknown> = {},
      explicitSessionId?: string | null
    ) => {
      if (!userEmail) return;

      const sessionId = explicitSessionId || getOrCreateSessionId();
      const url = AppConfig.serviceUrls.logAnalyticsEvent();

      const payload = {
        userEmail,
        eventType,
        contentId,
        sessionId,
        metadata: {
          timestamp: new Date().toISOString(),
          ...metadata,
        },
      };

      const extraHeaders: Record<string, string> = {
        "X-User-Email": userEmail,
      };

      // Route through ApiService instance so retry-axios intercepted 401s automatically refresh tokens
      ApiService.getInstance()
        .post(url, payload, { headers: extraHeaders })
        .catch((err) => {
          console.warn("Analytics flush failed:", err);
        });
    },
    [userEmail]
  );

  return { trackEvent, flushBeaconEvent };
};