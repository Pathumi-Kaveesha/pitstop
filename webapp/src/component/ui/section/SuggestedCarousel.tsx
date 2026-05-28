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

import React, { useEffect, useMemo, useRef } from "react";
import { Box, useTheme, Typography } from "@mui/material";
import ComponentCard from "@components/ui/content/Card";
import { ContentResponse } from "@/types/types";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectCoverflow } from "swiper/modules";
import type { Swiper as SwiperClass } from "swiper";
import "swiper/css";
import "swiper/css/effect-coverflow";
import { useInViewport } from "@utils/utils";
import { RootState, useAppSelector } from "@slices/store";
import suggestedSection from "@assets/images/suggestedSection.jpg";
import seWikiSuggestedSection from "@assets/images/suggestedSection_blue.png";

const isPitstopApp = window.config?.IS_PITSTOP_APP ?? true;

const backgroundImage = isPitstopApp ? suggestedSection : seWikiSuggestedSection;

interface SuggestedCarouselProps {
  items: ContentResponse[];
}

const SuggestedCarousel: React.FC<SuggestedCarouselProps> = ({ items }) => {
  const { ref, isInViewport } = useInViewport<HTMLDivElement>();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const swiperRef = useRef<SwiperClass | null>(null);
  const isNavigating = useAppSelector((state: RootState) => state.common.navigationLoading);

  useEffect(() => {
    if (!swiperRef.current) return;
    if (isInViewport && !isNavigating) {
      swiperRef.current.autoplay?.start();
    } else {
      swiperRef.current.autoplay?.stop();
    }
  }, [isInViewport, isNavigating]);

  const infiniteItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    const multiplier = Math.max(3, Math.ceil(20 / items.length));

    return Array(multiplier)
      .fill(null)
      .flatMap((_, mIndex) =>
        items.map((item, i) => ({
          ...item,
          uniqueKey: `${item.contentId}-${mIndex}-${i}`,
        }))
      );
  }, [items]);

  if (infiniteItems.length === 0) return null;

  const initial = Math.floor(infiniteItems.length / 2);

  return (
    <Box
      sx={{
        width: "100vw",
        marginLeft: "calc(-50vw + 50%)",
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          transform: "scaleY(-1)",
          filter: isDark
            ? "brightness(0.95) saturate(1.05)"
            : "brightness(0.95)",
          zIndex: 0,
        },
      }}
    >
      {/* Content */}
      <Box sx={{ position: "relative", zIndex: 1 }}>
        {/* Title */}
        <Box
          sx={{
            textAlign: "center",
            mb: 5,
            px: 1,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Box
            sx={{
              backdropFilter: "blur(20px)",
              backgroundColor: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              borderRadius: 6,
              px: 4,
              boxShadow: "0 4px 30px rgba(0,0,0,0.1)",
              mt: 4,
            }}
          >
            <Typography
              sx={{
                fontFamily: '"Inter", sans-serif',
                fontWeight: 400,
                fontSize: { xs: "1rem", md: "2.5rem" },
                background: theme.palette.primary.dark,
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-0.04em",
              }}
            >
              Suggested For You
            </Typography>
          </Box>
        </Box>

        {/* Swiper Carousel */}
        <Box
          ref={ref}
          onMouseEnter={() => swiperRef.current?.autoplay?.stop()}
          onMouseLeave={() => swiperRef.current?.autoplay?.start()}
          sx={{
            px: { xs: 1, md: 4 },
            overflow: "visible",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Swiper
            modules={[Autoplay, EffectCoverflow]}
            onSwiper={(inst: SwiperClass) => {
              swiperRef.current = inst;
              if (!isInViewport || isNavigating) {
                inst.autoplay?.stop();
              }
            }}
            loop={true}
            centeredSlides
            initialSlide={initial}
            slidesPerView={"auto"}
            spaceBetween={0}
            autoplay={{
              delay: 0,
              disableOnInteraction: false,
              pauseOnMouseEnter: false,
              reverseDirection: false,
            }}
            speed={4000}
            watchSlidesProgress
            allowTouchMove
            grabCursor
            effect="coverflow"
            coverflowEffect={{
              rotate: 8,
              stretch: -15,
              depth: 120,
              modifier: 1,
              slideShadows: false,
            }}
            style={{
              willChange: "transform",
              perspective: "1000px",
              overflow: "visible",
              paddingTop: "20px",
              paddingBottom: "40px",
            }}
          >
            {infiniteItems.map((content) => (
              <SwiperSlide
                key={content.uniqueKey}
                style={{
                  width: "420px",
                  height: "auto",
                  transform: "translateZ(0)",
                  overflow: "visible",
                }}
              >
                <Box
                  id={`content-card-${content.contentId}`}
                  sx={{
                    width: "100%",
                    maxWidth: "400px",
                    mx: "auto",
                    transition: "all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                    willChange: "transform",
                    position: "relative",
                    zIndex: 1,
                    "&:hover": {
                      transform: "translateY(-12px) scale(1.05)",
                      zIndex: 10,
                      filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.2))",
                    },
                    "& > *": {
                      width: "100%",
                      height: "auto",
                    },
                  }}
                >
                  <ComponentCard {...content} isInPinnedSection={false} />
                </Box>
              </SwiperSlide>
            ))}
          </Swiper>
        </Box>
      </Box>
    </Box>
  );
};

export default SuggestedCarousel;
