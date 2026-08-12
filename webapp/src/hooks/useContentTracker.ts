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

import { useEffect, useRef, useCallback } from "react";
import { useAnalytics } from "./useAnalytics";
import { AnalyticsEventType } from "@utils/types";

interface UseContentTrackerProps {
  contentId: number | null;
  contentType: string;
  contentSubtype?: string;
  title?: string;
  isOpen: boolean;
  source?: string;
}

export const useContentTracker = ({
  contentId,
  contentType,
  contentSubtype,
  title,
  isOpen,
  source = "card_preview_button",
}: UseContentTrackerProps) => {
  const { trackEvent } = useAnalytics();

  const activeSecondsRef = useRef<number>(0);
  const viewLoggedRef = useRef<boolean>(false);

  const timerIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iframeFocusCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityTimestampRef = useRef<number>(Date.now());
  const isIframeFocusedRef = useRef<boolean>(false);
  const isMouseOverContainerRef = useRef<boolean>(false);

  const resetActivityTimer = useCallback(() => {
    lastActivityTimestampRef.current = Date.now();
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIdRef.current) {
      clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, []);

  const triggerVerifiedView = useCallback(
    (isOutlink: boolean = false) => {
      if (!contentId) return;

      const wasLogged = viewLoggedRef.current;
      viewLoggedRef.current = true;

      if (!wasLogged) {
        // Log a single combined event if verified via outlink click before 10s dwell
        const eventSource = isOutlink
          ? "card_preview_button_open_in_new_tab"
          : source;

        trackEvent(AnalyticsEventType.VIEW, contentId, {
          title,
          contentType,
          contentSubtype,
          activeDwellSeconds: activeSecondsRef.current,
          verifiedView: true,
          source: eventSource,
        });
      } else if (isOutlink) {
        // Preview was already logged at 10s dwell; record separate outlink event
        trackEvent(AnalyticsEventType.VIEW, contentId, {
          title,
          contentType,
          contentSubtype,
          activeDwellSeconds: activeSecondsRef.current,
          verifiedView: true,
          source: "modal_open_in_new_tab",
        });
      }
    },
    [contentId, contentType, contentSubtype, title, source, trackEvent]
  );

  const logUnverifiedViewOnClose = useCallback(() => {
    if (!contentId || viewLoggedRef.current) return;

    viewLoggedRef.current = true;
    trackEvent(AnalyticsEventType.VIEW, contentId, {
      title,
      contentType,
      contentSubtype,
      activeDwellSeconds: activeSecondsRef.current,
      verifiedView: false,
      source,
    });
  }, [contentId, contentType, contentSubtype, title, source, trackEvent]);

  const evaluateProgress = useCallback(() => {
    if (!contentId) return;

    const currentSeconds = activeSecondsRef.current;

    // Send Verified VIEW Event after 10 seconds of verified active viewing
    if (currentSeconds >= 10 && !viewLoggedRef.current) {
      triggerVerifiedView(false);
    }
  }, [contentId, triggerVerifiedView]);

  const startTimer = useCallback(() => {
    if (timerIdRef.current || !isOpen || document.visibilityState === "hidden") return;

    timerIdRef.current = setInterval(() => {
      const now = Date.now();
      const idleTime = now - lastActivityTimestampRef.current;

      const hasWindowFocus = typeof document !== "undefined" && document.hasFocus();
      const isIframeActive = isIframeFocusedRef.current && hasWindowFocus;
      const isActive = idleTime < 120000 || isIframeActive;

      if (isActive) {
        activeSecondsRef.current += 1;
        evaluateProgress();
      } else {
        isIframeFocusedRef.current = false;
      }
    }, 1000);
  }, [isOpen, evaluateProgress]);

  useEffect(() => {
    if (!isOpen) return;

    const handleUserInteraction = () => resetActivityTimer();

    const handleWindowBlur = () => {
      if (iframeFocusCheckTimeoutRef.current) {
        clearTimeout(iframeFocusCheckTimeoutRef.current);
      }

      // Allow browser 100ms to settle activeElement focus updates before determining iframe focus
      iframeFocusCheckTimeoutRef.current = setTimeout(() => {
        if (
          isMouseOverContainerRef.current &&
          typeof document !== "undefined" &&
          document.activeElement?.tagName === "IFRAME" &&
          document.hasFocus()
        ) {
          isIframeFocusedRef.current = true;
          resetActivityTimer();
        } else {
          isIframeFocusedRef.current = false;
        }
      }, 100);
    };

    const handleWindowFocus = () => {
      isIframeFocusedRef.current = false;
      resetActivityTimer();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopTimer();
      } else if (isOpen) {
        resetActivityTimer();
        startTimer();
      }
    };

    window.addEventListener("mousemove", handleUserInteraction);
    window.addEventListener("keydown", handleUserInteraction);
    window.addEventListener("click", handleUserInteraction);
    window.addEventListener("scroll", handleUserInteraction);
    window.addEventListener("touchstart", handleUserInteraction);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (iframeFocusCheckTimeoutRef.current) {
        clearTimeout(iframeFocusCheckTimeoutRef.current);
        iframeFocusCheckTimeoutRef.current = null;
      }

      window.removeEventListener("mousemove", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
      window.removeEventListener("click", handleUserInteraction);
      window.removeEventListener("scroll", handleUserInteraction);
      window.removeEventListener("touchstart", handleUserInteraction);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isOpen, resetActivityTimer, startTimer, stopTimer]);

  const startTimerRef = useRef(startTimer);
  const stopTimerRef = useRef(stopTimer);
  const logUnverifiedViewOnCloseRef = useRef(logUnverifiedViewOnClose);

  useEffect(() => {
    startTimerRef.current = startTimer;
    stopTimerRef.current = stopTimer;
    logUnverifiedViewOnCloseRef.current = logUnverifiedViewOnClose;
  }, [startTimer, stopTimer, logUnverifiedViewOnClose]);

  useEffect(() => {
    if (isOpen) {
      isIframeFocusedRef.current = false;
      isMouseOverContainerRef.current = false;
      activeSecondsRef.current = 0;
      viewLoggedRef.current = false;
      lastActivityTimestampRef.current = Date.now();
      startTimerRef.current();
    } else {
      stopTimerRef.current();
    }

    return () => {
      isIframeFocusedRef.current = false;
      isMouseOverContainerRef.current = false;
      stopTimerRef.current();
      // If modal closes before 10s and without outlink, log unverified misclick
      if (isOpen && !viewLoggedRef.current) {
        logUnverifiedViewOnCloseRef.current();
      }
    };
  }, [isOpen]);

  const onContainerMouseEnter = useCallback(() => {
    isMouseOverContainerRef.current = true;
    resetActivityTimer();
  }, [resetActivityTimer]);

  const onContainerMouseLeave = useCallback(() => {
    isMouseOverContainerRef.current = false;
  }, []);

  return {
    onContainerMouseEnter,
    onContainerMouseLeave,
    triggerVerifiedView,
  };
};