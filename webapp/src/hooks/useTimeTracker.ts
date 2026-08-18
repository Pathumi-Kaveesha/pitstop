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

import { useEffect, useRef } from "react";
import { useAnalytics, getOrCreateSessionId } from "./useAnalytics";
import { AnalyticsEventType } from "@utils/types";

const ACTIVE_TAB_KEY = "pitstop_primary_active_tab";
const ACTIVE_TAB_HEARTBEAT_KEY = "pitstop_primary_tab_heartbeat";

const MAX_IDLE_SECONDS = 300;
const MAX_ALLOWED_GAP_SECONDS = 300;
const HEARTBEAT_TIMEOUT_MS = 15000;
const PERIODIC_FLUSH_SECONDS = 180;

interface TimeTrackerOptions {
  pageRoute?: string | null;
  contentId?: number | null;
  trackingType?: "page_view_duration" | "content_view_duration";
}

export const useActiveTimer = (options: TimeTrackerOptions = {}) => {
  const { pageRoute = null, contentId = null, trackingType = "page_view_duration" } = options;
  const { trackEvent, flushBeaconEvent } = useAnalytics();

  const lastTickTimeRef = useRef<number>(performance.now());
  const activeDurationRef = useRef<number>(0);
  const lastUserActivityRef = useRef<number>(performance.now());

  const windowHasFocusRef = useRef<boolean>(
    typeof document !== "undefined" ? document.hasFocus() : true
  );

  // Maintain eventId across flushes for the duration of this route visit session
  const activeEventIdRef = useRef<string>(
    `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  );
  const tabIdRef = useRef<string>(
    `tab_${Math.random().toString(36).substring(2, 9)}`
  );

  const resolvePageRoute = (): string | null => {
    if (pageRoute) return pageRoute;
    if (typeof window !== "undefined" && window.location.pathname) {
      return window.location.pathname;
    }
    return null;
  };

  useEffect(() => {
    // Generate ONE event ID per route visit session mount
    activeEventIdRef.current = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    lastTickTimeRef.current = performance.now();
    activeDurationRef.current = 0;

    const routeKeyPart = pageRoute ?? "content";
    const tabKey = `${ACTIVE_TAB_KEY}_${trackingType}_${routeKeyPart}`;
    const heartbeatKey = `${ACTIVE_TAB_HEARTBEAT_KEY}_${trackingType}_${routeKeyPart}`;

    const claimPrimaryTab = () => {
      if (!document.hidden) {
        localStorage.setItem(tabKey, tabIdRef.current);
        localStorage.setItem(heartbeatKey, Date.now().toString());
      }
    };

    claimPrimaryTab();

    const isPrimaryTab = (): boolean => {
      if (contentId !== null) return true;
      const currentPrimary = localStorage.getItem(tabKey);
      const lastHeartbeat = parseInt(
        localStorage.getItem(heartbeatKey) || "0",
        10
      );
      const isHeartbeatStale = Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS;

      if (!currentPrimary || isHeartbeatStale) {
        claimPrimaryTab();
        return localStorage.getItem(tabKey) === tabIdRef.current;
      }
      return currentPrimary === tabIdRef.current;
    };

    const registerUserActivity = () => {
      lastUserActivityRef.current = performance.now();
    };

    const activityEvents = ["mousemove", "keydown", "scroll", "click", "touchstart"];
    activityEvents.forEach((evt) =>
      window.addEventListener(evt, registerUserActivity, { passive: true })
    );

    const flushTimeSpent = async (isLeavingPage: boolean = false) => {
      if (!isPrimaryTab()) return;

      const now = performance.now();
      const elapsedSeconds = Math.floor((now - lastTickTimeRef.current) / 1000);
      const idleSeconds = Math.floor((now - lastUserActivityRef.current) / 1000);
      const validElapsed = elapsedSeconds > MAX_ALLOWED_GAP_SECONDS ? 0 : elapsedSeconds;

      const isUserIdle = contentId === null && idleSeconds > MAX_IDLE_SECONDS;
      const finalSecondsToReport = activeDurationRef.current + (isUserIdle ? 0 : validElapsed);

      const secondsToSend = finalSecondsToReport;
      const eventIdToSend = activeEventIdRef.current; // Always reuses the same event ID for this route visit!
      const routeToSend = resolvePageRoute();
      const currentSessionId = getOrCreateSessionId();
      const storageKey = `pitstop_pending_time_${eventIdToSend}`;

      // Zero-out active duration baseline without re-generating a new eventId
      activeDurationRef.current = 0;
      lastTickTimeRef.current = performance.now();

      if (secondsToSend < 1) {
        localStorage.removeItem(storageKey);
        return;
      }

      const metadata = {
        durationSeconds: secondsToSend,
        pageRoute: routeToSend,
        eventId: eventIdToSend,
        trackingType,
        timestamp: new Date().toISOString(),
      };

      if (isLeavingPage) {
        localStorage.removeItem(storageKey);
        flushBeaconEvent(
          AnalyticsEventType.SESSION_TIME,
          contentId,
          metadata,
          currentSessionId
        );
      } else if (navigator.onLine) {
        try {
          const res = await trackEvent(
            AnalyticsEventType.SESSION_TIME,
            contentId,
            metadata,
            currentSessionId
          );
          if (res) {
            localStorage.removeItem(storageKey);
          } else {
            activeDurationRef.current += secondsToSend;
          }
        } catch (e) {
          console.warn("Failed to flush time tracking event:", e);
          activeDurationRef.current += secondsToSend;
        }
      } else {
        activeDurationRef.current += secondsToSend;
      }
    };

    const intervalId = setInterval(() => {
      // If focus moved into an embedded iframe AND the browser window has OS focus, keep state active
      if (
        typeof document !== "undefined" &&
        document.activeElement?.tagName === "IFRAME" &&
        document.hasFocus()
      ) {
        windowHasFocusRef.current = true;
        lastUserActivityRef.current = performance.now();
      }

      if (document.hidden || !windowHasFocusRef.current || !isPrimaryTab()) {
        lastTickTimeRef.current = performance.now();
        return;
      }

      localStorage.setItem(heartbeatKey, Date.now().toString());

      const now = performance.now();
      const currentTickSeconds = Math.floor((now - lastTickTimeRef.current) / 1000);
      const idleSeconds = Math.floor((now - lastUserActivityRef.current) / 1000);

      if (currentTickSeconds > MAX_ALLOWED_GAP_SECONDS) {
        lastTickTimeRef.current = performance.now();
        activeDurationRef.current = 0;
        return;
      }

      if (contentId !== null || idleSeconds <= MAX_IDLE_SECONDS) {
        activeDurationRef.current += currentTickSeconds;

        // Backup un-flushed accumulated seconds to localStorage for crash resilience
        const eventIdToSend = activeEventIdRef.current;
        const storageKey = `pitstop_pending_time_${eventIdToSend}`;
        const pendingData = {
          durationSeconds: activeDurationRef.current,
          pageRoute: resolvePageRoute(),
          eventId: eventIdToSend,
          trackingType,
          contentId,
          sessionId: getOrCreateSessionId(),
          timestamp: new Date().toISOString(),
        };
        localStorage.setItem(storageKey, JSON.stringify(pendingData));
      }
      lastTickTimeRef.current = now;

      if (activeDurationRef.current >= PERIODIC_FLUSH_SECONDS) {
        void flushTimeSpent(false);
      }
    }, 5000);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        void flushTimeSpent(true);
      } else {
        claimPrimaryTab();
        lastTickTimeRef.current = performance.now();
        lastUserActivityRef.current = performance.now();
      }
    };

    const handleFocus = () => {
      windowHasFocusRef.current = true;
      claimPrimaryTab();
      lastTickTimeRef.current = performance.now();
      lastUserActivityRef.current = performance.now();
    };

    const handleBlur = () => {
      // Allow browser to settle activeElement update before treating blur as page leave
      setTimeout(() => {
        if (
          typeof document !== "undefined" &&
          document.activeElement?.tagName === "IFRAME" &&
          document.hasFocus()
        ) {
          windowHasFocusRef.current = true;
          lastUserActivityRef.current = performance.now();
          return;
        }
        windowHasFocusRef.current = false;
        void flushTimeSpent(true);
      }, 100);
    };

    const handlePageHide = () => {
      void flushTimeSpent(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      clearInterval(intervalId);
      activityEvents.forEach((evt) =>
        window.removeEventListener(evt, registerUserActivity)
      );
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pagehide", handlePageHide);

      void flushTimeSpent(true);
    };
  }, [pageRoute, contentId, trackingType, trackEvent, flushBeaconEvent]);
};

export const usePageTimeTracker = (pageRoute: string) => {
  useActiveTimer({
    pageRoute,
    trackingType: "page_view_duration",
  });
};

export const useContentTimeTracker = (contentId: number) => {
  useActiveTimer({
    contentId,
    trackingType: "content_view_duration",
  });
};