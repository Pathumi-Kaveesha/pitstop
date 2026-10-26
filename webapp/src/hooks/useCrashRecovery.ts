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

import { useEffect } from "react";
import { useSelector } from "react-redux";

import { selectUserInfo } from "@slices/authSlice";
import { AnalyticsEventType } from "@utils/types";

import { useAnalytics } from "./useAnalytics";

// Sends the time spent that an earlier browser crash or close left unsent, for the signed-in user.
export const useCrashRecovery = () => {
  const { trackEvent } = useAnalytics();
  const userInfo = useSelector(selectUserInfo);

  useEffect(() => {
    if (typeof window === "undefined" || !userInfo?.email) return;

    const runCrashRecovery = async () => {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) keys.push(k);
      }

      for (const key of keys) {
        if (key.startsWith("pitstop_pending_time_")) {
          try {
            const rawData = localStorage.getItem(key);
            if (!rawData) continue;

            const data = JSON.parse(rawData);
            const isSameUser = Boolean(data?.userEmail && data.userEmail === userInfo.email);

            if (data && typeof data.durationSeconds === "number" && data.durationSeconds >= 1 && isSameUser) {
              localStorage.removeItem(key);

              const metadata = {
                durationSeconds: data.durationSeconds,
                isRunningTotal: data.isRunningTotal === true,
                pageRoute: data.pageRoute,
                eventId: data.eventId,
                trackingType: data.trackingType || "page_view_duration",
                recoveredFromCrash: true,
                timestamp: new Date().toISOString(),
              };

              const res = await trackEvent(
                AnalyticsEventType.SESSION_TIME,
                data.contentId ?? null,
                metadata,
                data.sessionId ?? null
              ).catch((err) => {
                console.warn("Failed to recover crashed analytics session, restoring backup:", err);
                return null;
              });

              if (!res) {
                // Re-store backup in localStorage if trackEvent resolved null or threw an error
                localStorage.setItem(key, rawData);
              }
            } else {
              localStorage.removeItem(key);
            }
          } catch {
            localStorage.removeItem(key);
          }
        }
      }
    };
    if ("locks" in navigator) {
      void navigator.locks.request("pitstop_analytics_crash_recovery_lock", runCrashRecovery);
    } else {
      void runCrashRecovery();
    }
  }, [trackEvent, userInfo?.email]);
};
