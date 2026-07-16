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

import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import { Box, IconButton, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";

import { ContentResponse } from "@/types/types";
import { RootState, useAppSelector } from "@slices/store";

import ComponentCard from "./Card";

interface CarouselProps {
  contentData: ContentResponse[];
  isInPinnedSection?: boolean;
  autoScroll?: boolean;
  autoScrollInterval?: number;
}

const CARD_W = 399;
const CARD_H = 424;
const SIDE_OFFSET_X = 80;
const SIDE_SCALE = 0.85;
const CENTER_SCALE = 1.0;
const ARROW_SIZE = 38;
const ARROW_OUTSET_DESKTOP = -50;

const Carousel: React.FC<CarouselProps> = ({
  contentData,
  isInPinnedSection = false,
  autoScroll = true,
  autoScrollInterval = 5000,
}) => {
  const theme = useTheme();
  const count = contentData.length;

  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const arrowRefPrev = useRef<HTMLButtonElement>(null);
  const arrowRefNext = useRef<HTMLButtonElement>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const isNavigating = useAppSelector((state: RootState) => state.common.navigationLoading);

  const current = useMemo(() => (count ? index % count : 0), [index, count]);

  useEffect(() => setIndex(0), [count]);

  const setTransitionTimeout = useCallback((callback: () => void, delay: number) => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        callback();
      }
    }, delay);
  }, []);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      if (autoScrollTimerRef.current) {
        clearTimeout(autoScrollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!autoScroll || count <= 1 || hover || isNavigating) return;
    const id = setInterval(() => {
      setIsTransitioning(true);
      setIndex((i) => (i + 1) % count);
      setTransitionTimeout(() => setIsTransitioning(false), 600);
    }, autoScrollInterval);
    autoScrollTimerRef.current = id;
    return () => {
      clearInterval(id);
      autoScrollTimerRef.current = null;
    };
  }, [autoScroll, autoScrollInterval, count, hover, setTransitionTimeout, isNavigating]);

  const onPrev = () => {
    if (count > 1 && !isTransitioning) {
      setIsTransitioning(true);
      setIndex((i) => (i - 1 + count) % count);
      setTransitionTimeout(() => setIsTransitioning(false), 600);
    }
  };

  const onNext = () => {
    if (count > 1 && !isTransitioning) {
      setIsTransitioning(true);
      setIndex((i) => (i + 1) % count);
      setTransitionTimeout(() => setIsTransitioning(false), 600);
    }
  };

  const renderCard = (item: ContentResponse) => (
    <Box sx={{ width: CARD_W, height: CARD_H, borderRadius: 3, overflow: "visible" }}>
      <ComponentCard {...item} isInPinnedSection={isInPinnedSection} />
    </Box>
  );

  const getCardStyle = (offset: number) => {
    const absOffset = Math.abs(offset);

    if (offset === 0) {
      // Center card - optimized for clarity
      return {
        position: "absolute" as const,
        top: 0,
        left: "50%",
        zIndex: 10,
        transform: `translateX(-50%) scale(${CENTER_SCALE})`,
        transition: "all 700ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        filter: "none",
        opacity: 1,
        pointerEvents: "auto" as const,
        willChange: "transform, opacity",
        backfaceVisibility: "hidden" as const,
        WebkitFontSmoothing: "antialiased" as const,
      };
    } else if (absOffset === 1) {
      return {
        position: "absolute" as const,
        top: 0,
        left: "50%",
        zIndex: 5,
        transform: `translateX(calc(-50% + ${offset * SIDE_OFFSET_X}px)) translateY(10px) scale(${SIDE_SCALE})`,
        transition: "all 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        filter: "brightness(0.7) saturate(0.9)",
        opacity: 0.5,
        pointerEvents: "none" as const,
        willChange: "transform, opacity",
        backfaceVisibility: "hidden" as const,
        WebkitFontSmoothing: "antialiased" as const,
      };
    } else {
      // Hide all other cards
      return {
        position: "absolute" as const,
        top: 0,
        left: "50%",
        zIndex: 0,
        transform: `translateX(calc(-50% + ${offset > 0 ? 300 : -300}px)) scale(0.5)`,
        transition: "all 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        opacity: 0,
        pointerEvents: "none" as const,
        visibility: "hidden" as const,
        willChange: "transform, opacity",
        backfaceVisibility: "hidden" as const,
      };
    }
  };

  return (
    <Box
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onTouchStart={() => setHover(true)}
      onTouchEnd={() => setTimeout(() => setHover(false), 2000)}
      sx={{ position: "relative", width: CARD_W, overflow: "visible" }}
    >
      <Box
        sx={{
          position: "relative",
          width: CARD_W,
          height: CARD_H + 40,
          overflow: "visible",
        }}
      >
        {/* Render all cards in circular arrangement */}
        {count > 0 &&
          Array.from({ length: count }).map((_, i) => {
            const offset = i - current;
            const wrappedOffset =
              offset > count / 2 ? offset - count : offset < -count / 2 ? offset + count : offset;

            return (
              <Box key={`card-${i}`} sx={getCardStyle(wrappedOffset)}>
                {renderCard(contentData[i])}
              </Box>
            );
          })}
      </Box>

      {/* Navigation Arrows - Only visible on hover */}
      {count > 1 && (
        <>
          <IconButton
            ref={arrowRefPrev}
            aria-label="Previous"
            onClick={onPrev}
            disabled={isTransitioning}
            sx={{
              position: "absolute",
              top: {
                xs: `calc(${CARD_H / 2}px - 70px)`, 
                md: `calc(${CARD_H / 2}px)`
              },
              left: {
                xs: 6,
                md: ARROW_OUTSET_DESKTOP
              }, 
              transform: "translateY(-50%)",
              width: ARROW_SIZE,
              height: ARROW_SIZE,
              borderRadius: "99px",
              zIndex: 15,
              bgcolor: alpha(theme.palette.background.paper, 0.9),
              backdropFilter: "blur(6px)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              opacity: hover ? 1 : 0,
              visibility: hover ? "visible" : "hidden",
              "&:hover": {
                bgcolor: alpha(theme.palette.background.paper, 0.98),
                transform: "translateY(-50%) scale(1.1)",
              },
              "&:disabled": { 
                opacity: 0.5, 
              },
              transition: 
              "opacity 0.3s ease, visibility 0.3s ease, transform 0.2s ease, background-color 0.2s ease",
            }}
          >
            <ArrowBackIosIcon fontSize="small" sx={{ ml: 0.5 }} />
          </IconButton>

          <IconButton
            ref={arrowRefNext}
            aria-label="Next"
            onClick={onNext}
            disabled={isTransitioning}
            sx={{
              position: "absolute",
              top: {
                xs: `calc(${CARD_H / 2}px - 70px)`, 
                md: `calc(${CARD_H / 2}px)`
              },
              right: {
                xs: 6,
                md: ARROW_OUTSET_DESKTOP
              }, 
              transform: "translateY(-50%)",
              width: ARROW_SIZE,
              height: ARROW_SIZE,
              borderRadius: "99px",
              zIndex: 15,
              bgcolor: alpha(theme.palette.background.paper, 0.9),
              backdropFilter: "blur(6px)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              opacity: hover ? 1 : 0,
              visibility: hover ? "visible" : "hidden",
              "&:hover": {
                bgcolor: alpha(theme.palette.background.paper, 0.98),
                transform: "translateY(-50%) scale(1.1)",
              },
              "&:disabled": { 
                opacity: 0.5, 
              },
              transition: 
              "opacity 0.3s ease, visibility 0.3s ease, transform 0.2s ease, background-color 0.2s ease",
            }}
          >
            <ArrowForwardIosIcon fontSize="small" />
          </IconButton>
        </>
      )}

      {/* Dots */}
      {count > 1 && (
        <Box
          sx={{
            mt: 2,
            mb: 2,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 1,
            zIndex: 5,
            position: "relative",
          }}
        >
          {Array.from({ length: count }).map((_, i) => (
            <Box
              key={i}
              onClick={() => {
                if (!isTransitioning) {
                  setIsTransitioning(true);
                  setIndex(i);
                  setTransitionTimeout(() => setIsTransitioning(false), 600);
                }
              }}
              sx={{
                width: i === current ? 12 : 10,
                height: i === current ? 12 : 10,
                borderRadius: "50%",
                cursor: isTransitioning ? "not-allowed" : "pointer",
                bgcolor: 
                i === current 
                  ? theme.palette.primary.main 
                  : alpha(theme.palette.text.primary, 0.28),
                transition: "all 0.3s ease",
                "&:hover": {
                  bgcolor: 
                    i === current 
                    ? theme.palette.primary.main 
                    : alpha(theme.palette.text.primary, 0.45),
                  transform: "scale(1.15)",
                },
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default Carousel;
