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

  const triggerVerifiedView = useCallback(() => {
    if (!contentId || viewLoggedRef.current) return;

    viewLoggedRef.current = true;
    trackEvent(AnalyticsEventType.VIEW, contentId, {
      title,
      contentType,
      contentSubtype,
      activeDwellSeconds: activeSecondsRef.current,
      verifiedView: true,
      source,
    });
  }, [contentId, contentType, contentSubtype, title, source, trackEvent]);

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
      triggerVerifiedView();
    }
  }, [contentId, triggerVerifiedView]);

  const startTimer = useCallback(() => {
    if (timerIdRef.current || !isOpen || document.visibilityState === "hidden") return;

    timerIdRef.current = setInterval(() => {
      const now = Date.now();
      const idleTime = now - lastActivityTimestampRef.current;
      const isActive = idleTime < 120000 || isIframeFocusedRef.current;

      if (isActive) {
        activeSecondsRef.current += 1;
        evaluateProgress();
      }
    }, 1000);
  }, [isOpen, evaluateProgress]);

  useEffect(() => {
    if (!isOpen) return;

    const handleUserInteraction = () => resetActivityTimer();

    const handleWindowBlur = () => {
      if (isMouseOverContainerRef.current) {
        isIframeFocusedRef.current = true;
        resetActivityTimer();
      }
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

  useEffect(() => {
    if (isOpen) {
      activeSecondsRef.current = 0;
      viewLoggedRef.current = false;
      lastActivityTimestampRef.current = Date.now();
      startTimer();
    } else {
      stopTimer();
    }

    return () => {
      stopTimer();
      // If modal closes before 10s and without outlink, log unverified misclick
      if (isOpen && !viewLoggedRef.current) {
        logUnverifiedViewOnClose();
      }
    };
  }, [isOpen, startTimer, stopTimer, logUnverifiedViewOnClose]);

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