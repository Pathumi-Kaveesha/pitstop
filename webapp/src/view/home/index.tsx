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

import Contents from "@components/ui/section/Contents";
import { RootState, useAppDispatch, useAppSelector } from "@slices/store";
import PreLoader from "@components/common/PreLoader";
import ActionButton from "@components/ui/page/ActionButton";
import {
  Box,
  styled,
  Box as MuiBox,
  Typography,
  CardMedia,
  Grow,
  IconButton,
  TextField,
  InputAdornment,
  Fade,
} from "@mui/material";
import { useEffect, useState, useRef } from "react";
import {
  getAllTags,
  getPageData,
  resetPageData,
} from "@slices/pageSlice/page";
import { PINNED_CONTENT_SECTION_ID, SUGGESTED_CONTENT_SECTION_ID } from "@config/constant";
import SearchIcon from "@mui/icons-material/Search";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useNavigate, useLocation } from "react-router-dom";
import CustomerTestimonialSection from "@components/ui/section/CustomerTestimonialSection";
import { Role } from "@utils/types";
import { fetchCustomerTestimonials } from "@slices/customerTestimonialSlice/customerTestimonial";
import raceVideo from "@assets/images/race.mp4";

export declare let _paq: unknown[];

function Home() {
  const route = useAppSelector((state: RootState) => state.route);
  const page = useAppSelector((state: RootState) => state.page);
  const isNavigating = useAppSelector((state: RootState) => state.common.navigationLoading);
  const customerTestimonials = useAppSelector(
    (state: RootState) => state.customerTestimonials.items
  );
  const roles = useAppSelector((state: RootState) => state.auth.roles);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchQuery, setSearchQuery] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [heroReady, setHeroReady] = useState(false);
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const [activeSection, setActiveSection] = useState(0);

  const [hasRegularSections, setHasRegularSections] = useState(false);
  const [hasSuggestedSection, setHasSuggestedSection] = useState(false);
  const [hasTestimonialSection, setHasTestimonialSection] = useState(false);

  const [mediaSource, setMediaSource] = useState<{
    type: "img" | "video";
    src: string;
  } | null>(null);

  const heroRef = useRef<HTMLDivElement>(null);
  const section1Ref = useRef<HTMLDivElement>(null);
  const section2Ref = useRef<HTMLDivElement>(null);
  const section3Ref = useRef<HTMLDivElement>(null);

  const isPageReady = dataLoaded && heroReady;

  const pageTitle = page.pageData?.title ?? "";
  const pageDescription = page.pageData?.description ?? "";
  const customPageTheme = page.pageData?.customPageTheme;

  useEffect(() => {
    setDataLoaded(false);
    setHeroReady(false);
    setMediaSource(null);
  }, [location.pathname]);

  useEffect(() => {
    if (route.pageData?.shouldRedirect) {
      navigate("/");
    }
  }, [route.pageData?.shouldRedirect, navigate]);

  useEffect(() => {
    let isMounted = true;
    let imageLoader: HTMLImageElement | null = null;

    const fetchData = async () => {
      if (!isMounted) return;
      
      setDataLoaded(false);
      setHeroReady(false);
      
      try {
        dispatch(resetPageData());
        const pagePayload = await dispatch(getPageData(location.pathname)).unwrap();
        
        if (!isMounted) return; // Exit if component unmounted
        
        if (pagePayload.pageData.thumbnail) {
          imageLoader = new Image();
          imageLoader.onload = () => {
            if (isMounted) {
              setMediaSource({ type: 'img', src: pagePayload.pageData.thumbnail });
              setHeroReady(true);
            }
          };
          imageLoader.onerror = () => {
            if (isMounted) {
              setMediaSource({ type: 'img', src: pagePayload.pageData.thumbnail });
              setHeroReady(true);
            }
          };
          imageLoader.src = pagePayload.pageData.thumbnail;
        } else {
          if (isMounted) {
            setMediaSource({ type: 'video', src: raceVideo });
            setHeroReady(true);
          }
        }

      } catch (error) {
        if (isMounted) {
          console.error("Error fetching home page data:", error);
          setHeroReady(true);
        }
      } finally {
        if (isMounted) {
          setDataLoaded(true);
        }
      }
    };

    fetchData();

    // Cleanup function to cancel operations when navigating away
    return () => {
      isMounted = false;
      if (imageLoader) {
        imageLoader.onload = null;
        imageLoader.onerror = null;
      }
    };
  }, [location.pathname, dispatch]);

  // Fetch tags only once on mount
  useEffect(() => {
    dispatch(getAllTags());
    dispatch(fetchCustomerTestimonials());
  }, [dispatch]);

  // Track if sections have content
  useEffect(() => {
    const regularSections = page.sectionData.filter(
      (section) => section.sectionId !== PINNED_CONTENT_SECTION_ID && section.sectionId !== SUGGESTED_CONTENT_SECTION_ID
    );
    setHasRegularSections(regularSections.length > 0);

    const suggestedSection = page.sectionData.find(
      (section) => section.sectionId === SUGGESTED_CONTENT_SECTION_ID
    );
    setHasSuggestedSection(
      suggestedSection !== undefined && suggestedSection.contentData.length > 0
    );
  }, [page.sectionData]);

  useEffect(() => {
    const isPitstopApp = window.config?.IS_PITSTOP_APP ?? false;
    const isAdmin = roles.includes(Role.SALES_ADMIN);
    const shouldShowTestimonials = isAdmin || customerTestimonials.length >= 4;

    setHasTestimonialSection(isPitstopApp && shouldShowTestimonials);
  }, [customerTestimonials.length, roles]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      if (scrollY > 100) {
        setShowScrollIndicator(false);
      } else {
        setShowScrollIndicator(true);
      }

      // Build available sections dynamically
      const availableSections = [heroRef.current];
      if (hasRegularSections) {
        availableSections.push(section1Ref.current);
      }
      if (hasSuggestedSection) {
        availableSections.push(section2Ref.current);
      }
      if (hasTestimonialSection) {
        availableSections.push(section3Ref.current);
      }

      // Determine active section
      const heroHeight = heroRef.current?.offsetHeight || 0;
      const threshold = 200;
      const isAtBottom = scrollY + windowHeight >= documentHeight - 50;

      if (isAtBottom && availableSections.length > 1) {
        setActiveSection(availableSections.length - 1);
      } else if (scrollY < heroHeight - threshold) {
        setActiveSection(0);
      } else {
        // Find which section is active based on scroll position
        for (let i = 1; i < availableSections.length; i++) {
          const sectionTop = availableSections[i]?.offsetTop || 0;
          const nextSectionTop =
            availableSections[i + 1]?.offsetTop || Infinity;

          if (
            scrollY >= sectionTop - threshold &&
            scrollY < nextSectionTop - threshold
          ) {
            setActiveSection(i);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasRegularSections, hasSuggestedSection, hasTestimonialSection]);

  const scrollToSection = (sectionIndex: number) => {
    const availableSections = [heroRef.current];
    if (hasRegularSections) {
      availableSections.push(section1Ref.current);
    }
    if (hasSuggestedSection) {
      availableSections.push(section2Ref.current);
    }
    if (hasTestimonialSection) {
      availableSections.push(section3Ref.current);
    }

    const targetSection = availableSections[sectionIndex];

    if (targetSection) {
      const offset = sectionIndex === 0 ? 0 : 82;
      const targetPosition = targetSection.offsetTop - offset;

      window.scrollTo({
        top: targetPosition,
        behavior: "smooth",
      });
    }
  };

  const handleSearchPage = (query: string) => {
    if (!query.trim()) return;
    navigate(`/search?query=${encodeURIComponent(query)}`);
  };

  // Calculate how many dots to show
  const getSectionDots = () => {
    let sectionCount = 1;
    if (hasRegularSections) {
      sectionCount += 1;
    }
    if (hasSuggestedSection) {
      sectionCount += 1;
    }
    if (hasTestimonialSection) {
      sectionCount += 1;
    }
    return Array.from({ length: sectionCount }, (_ , index) => index);
  };

  const sectionDots = getSectionDots();

  return (
    <>
      <PreLoader isLoading={!isPageReady} />

      {isPageReady && !isNavigating && (
        <>
          <Grow in={true}>
            <HeroSection ref={heroRef}>
              <BackgroundLayer>
                {mediaSource && mediaSource.type === 'img' ? (
                  <CardMedia
                    component="img"
                    image={mediaSource.src}
                    alt="hero"
                    key="hero-img"
                    sx={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      zIndex: 0,
                      pointerEvents: "none",
                    }}
                  />
                ) : mediaSource && mediaSource.type === 'video' && !isNavigating ? (
                  <Box
                    component="video"
                    src={mediaSource.src}
                    key="hero-video"
                    autoPlay
                    loop
                    muted
                    sx={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      zIndex: 0,
                      pointerEvents: "none",
                      backfaceVisibility: "hidden",
                    }}
                  />
                ) : null}
              </BackgroundLayer>

              <ContentOverlay>
                <Typography
                  variant="subtitle1"
                  sx={{
                    textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
                    mb: 1,
                    letterSpacing: "0.1em",
                    ...customPageTheme?.title,
                  }}
                >
                  {pageTitle}
                </Typography>

                <Typography
                  variant="h2"
                  sx={{
                    textShadow: "3px 4px 7px #000",
                    fontWeight: 700,
                    mb: 3,
                    fontFamily: customPageTheme?.title?.fontFamily,
                  }}
                >
                    {window.config?.APP_DETAILS?.DESCRIPTION?.toUpperCase()}
                </Typography>

                <Typography
                  variant="h6"
                  sx={{
                    whiteSpace: "pre-line",
                    textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
                    mb: 5,
                    maxWidth: 800,
                    ...customPageTheme?.description,
                  }}
                >
                  {pageDescription}
                </Typography>

                <SearchContainer>
                  <TextField
                    sx={{
                      width: { xs: "90%", sm: 500, md: 600 },
                      background: "rgba(255,255,255,0.95)",
                      borderRadius: "50px",
                      "& .MuiOutlinedInput-root": {
                        borderRadius: "50px",
                        color: "#333",
                        "& input": {
                          color: "#333",
                        },
                        "& input::placeholder": {
                          color: "#666",
                          opacity: 1,
                        },
                      },
                    }}
                    size="medium"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon sx={{ color: "#666" }} />
                        </InputAdornment>
                      ),
                      endAdornment: searchQuery && (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => handleSearchPage(searchQuery)}
                            size="large"
                            sx={{ color: "#333" }}
                          >
                            <SearchIcon />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleSearchPage(searchQuery)
                    }
                  />
                </SearchContainer>
              </ContentOverlay>

              {/* Scroll Down Indicator */}
              <Fade in={showScrollIndicator}>
                <ScrollDownIndicator
                  onClick={() => scrollToSection(1)}
                  sx={{
                    animationPlayState: showScrollIndicator
                      ? "running"
                      : "paused",
                  }}
                >
                  <KeyboardArrowDownIcon sx={{ fontSize: 40 }} />
                  <Typography variant="caption" sx={{ mt: -1, fontSize: 14 }}>
                    Scroll Down
                  </Typography>
                </ScrollDownIndicator>
              </Fade>

              <ActionButton direction="left" />
            </HeroSection>
          </Grow>

          {/* Section Dots Navigation */}
          {sectionDots.length > 1 && (
            <Fade in={!showScrollIndicator}>
              <SectionDotsContainer>
                {sectionDots.map((index) => (
                  <SectionDot
                    key={index}
                    active={activeSection === index}
                    onClick={() => scrollToSection(index)}
                  />
                ))}
              </SectionDotsContainer>
            </Fade>
          )}

          <Box sx={{ mt: 0, mb: 0 }}>
            <Box ref={section1Ref}>
              <Contents
                afterSectionId={-1}
                AfterSectionComponent={<Box ref={section2Ref}></Box>}
              />
              {hasTestimonialSection && (
                <Box ref={section3Ref}>
                  <CustomerTestimonialSection />
                </Box>
              )}
            </Box>
          </Box>
        </>
      )}
    </>
  );
}

export default Home;

const HeroSection = styled("section")(() => ({
  position: "relative",
  width: "100%",
  minHeight: `calc(100dvh - 82px)`,
  overflow: "hidden",
  "&::after": {
    content: '""',
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(to bottom, rgba(17, 17, 17, 0.25), rgba(0,0,0,0.55))",
    zIndex: 0.5,
    pointerEvents: "none",
  },
}));

const BackgroundLayer = styled(Box)(() => ({
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: "100dvh",
  width: "100%",
  zIndex: 0,
  pointerEvents: "none",
  transform: "translateZ(0)",
  willChange: "transform",
}));

const ContentOverlay = styled(MuiBox)(() => ({
  position: "absolute",
  top: "45%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  color: "#fff",
  zIndex: 1,
  width: "100%",
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "0 20px",
  pointerEvents: "none",
}));

const SearchContainer = styled(MuiBox)(() => ({
  width: "100%",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  pointerEvents: "auto",
}));

const ScrollDownIndicator = styled(Box)(() => ({
  position: "absolute",
  bottom: 40,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  color: "#fff",
  cursor: "pointer",
  animation: "bounce 2s infinite",
  transition: "all 0.3s ease",
  "@keyframes bounce": {
    "0%, 20%, 50%, 80%, 100%": {
      transform: "translateX(-50%) translateY(0)",
    },
    "40%": {
      transform: "translateX(-50%) translateY(-10px)",
    },
    "60%": {
      transform: "translateX(-50%) translateY(-5px)",
    },
  },
  "&:hover": {
    opacity: 0.8,
  },
}));

const SectionDotsContainer = styled(Box)(({ theme }) => ({
  position: "fixed",
  right: 30,
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: theme.zIndex.drawer + 1,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  padding: "16px 12px",
  backdropFilter: "blur(20px)",
  backgroundColor: theme.palette.mode === "dark" 
    ? "rgba(255,255,255,0.12)" 
    : "rgba(0,0,0,0.15)",
  border: theme.palette.mode === "dark"
    ? "1px solid rgba(255,255,255,0.25)"
    : "1px solid rgba(255,255,255,0.4)",
  borderRadius: "24px",
  boxShadow: theme.palette.mode === "dark"
    ? "0 4px 30px rgba(0,0,0,0.1)"
    : "0 4px 30px rgba(0,0,0,0.2)",
  [theme.breakpoints.down("sm")]: {
    right: 15,
  },
}));

const SectionDot = styled(Box)<{ active: boolean }>(({ theme, active }) => ({
  width: active ? 12 : 10,
  height: active ? 12 : 10,
  borderRadius: "50%",
  backgroundColor: active 
    ? theme.palette.primary.main 
    : theme.palette.mode === "dark" 
      ? "rgba(255, 255, 255, 0.4)" 
      : "rgba(0, 0, 0, 0.3)",
  border: active 
    ? `2px solid ${theme.palette.primary.main}` 
    : theme.palette.mode === "dark"
      ? "2px solid rgba(255, 255, 255, 0.4)"
      : "2px solid rgba(0, 0, 0, 0.3)",
  cursor: "pointer",
  transition: "all 0.3s ease",
  "&:hover": {
    transform: "scale(1.2)",
    backgroundColor: active 
      ? theme.palette.primary.main 
      : theme.palette.mode === "dark"
        ? "rgba(255, 255, 255, 0.7)"
        : "rgba(0, 0, 0, 0.6)",
  },
}));
