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

import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import SchoolOutlinedIcon from "@mui/icons-material/SchoolOutlined";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Pagination,
  Stack,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useSelector } from "react-redux";
import { matchRoutes, useLocation } from "react-router-dom";
import { ContentResponse } from "src/types/types";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { QuizStatus } from "@/types/types";
import ErrorHandler from "@components/common/ErrorHandler";
import ContentDialogBox from "@components/dialogs/ContentDialogBox";
import ComponentCard from "@components/ui/content/Card";
import Header from "@layout/header";
import { selectUserInfo } from "@slices/authSlice";
import { fetchMyBoardSection, getPinnedContentIds } from "@slices/pageSlice/page";
import { fetchQuizzes } from "@slices/quizSlice/quiz";
import { RootState, useAppDispatch, useAppSelector } from "@slices/store";
import { Role } from "@utils/types";
import { MyBoardPanelTypes } from "@utils/types";
import QuizCard from "@view/quiz/components/QuizCard";

const PINNED_CONTENT_SECTION_ID = -2;
const ESSENTIALS_SECTION_ID = -4;
const ITEMS_PER_PAGE = 3;
const QUIZZES_PER_PAGE = 5;

type LoadState = string;

type BoardSectionState = {
  items: ContentResponse[];
  status: LoadState;
  errorMessage?: string;
  offset: number;
  hasMore: boolean;
  isLoadingMore: boolean;
};

const defaultBoardSectionState: BoardSectionState = {
  items: [],
  status: "idle",
  errorMessage: undefined,
  offset: 0,
  hasMore: true,
  isLoadingMore: false,
};

type MyBoardState = {
  myBoard?: Partial<Record<MyBoardPanelTypes, BoardSectionState>>;
};

const selectBoardSection = (
  state: RootState,
  MyBoardCategories: MyBoardPanelTypes,
): BoardSectionState => {
  const pageState = state.page as MyBoardState;
  const section = pageState?.myBoard?.[MyBoardCategories];
  return section ?? defaultBoardSectionState;
};

const MyBoard: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const routes = useAppSelector((state: RootState) => state.route.routes);
  const userInfo = useSelector(selectUserInfo);
  const location = useLocation();
  const matches = matchRoutes(routes, location.pathname);

  const [expandedAccordion, setExpandedAccordion] = useState<string | false>(false);
  const [openAddEssentialDialog, setOpenAddEssentialDialog] = useState(false);
  const [quizzesPage, setQuizzesPage] = useState(1);
  const quizzes = useAppSelector((s: RootState) => s.quiz.quizzes);
  const quizzesStatus = useAppSelector((s: RootState) => s.quiz.quizzesStatus);
  const [quizFilter, setQuizFilter] = useState<"all" | QuizStatus>("all");

  const authorizedRoles: Role[] = useAppSelector(
    (state: RootState) => (state.auth as { roles: Role[] }).roles,
  );
  const isAdmin = authorizedRoles.includes(Role.SALES_ADMIN);

  const pinned = useAppSelector((s: RootState) => selectBoardSection(s, MyBoardPanelTypes.PINNED));
  const essential = useAppSelector((s: RootState) =>
    selectBoardSection(s, MyBoardPanelTypes.ESSENTIAL),
  );

  const pageMutationState = useAppSelector((state: RootState) => state.page.state);
  const routeMutationState = useAppSelector((state: RootState) => state.route.state);

  const getAppBarTitle = (): string => {
    let title = "";
    matches?.forEach((obj) => {
      if (location.pathname === obj.pathname) {
        title = (obj.route as unknown as { menuItem: string }).menuItem;
      }
    });
    return title || "My Board";
  };

  const refreshSection = useCallback(
    (PanelTypes: MyBoardPanelTypes) => {
      dispatch(fetchMyBoardSection({ PanelTypes, offset: 0 }));
    },
    [dispatch],
  );

  const refreshQuizzes = useCallback(() => {
    dispatch(fetchQuizzes());
  }, [dispatch]);

  const seeMoreSection = (PanelTypes: MyBoardPanelTypes, currentOffset: number) => {
    dispatch(
      fetchMyBoardSection({
        PanelTypes,
        offset: currentOffset + ITEMS_PER_PAGE,
      }),
    );
  };

  const handleAccordionChange =
    (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
      const next = isExpanded ? panel : false;
      setExpandedAccordion(next);

      if (!isExpanded) return;

      if (panel === MyBoardPanelTypes.PINNED) refreshSection(MyBoardPanelTypes.PINNED);
      if (panel === MyBoardPanelTypes.ESSENTIAL) refreshSection(MyBoardPanelTypes.ESSENTIAL);
      if (panel === "quizzes") refreshQuizzes();
    };

  useEffect(() => {
    dispatch(getPinnedContentIds());
  }, [dispatch]);

  useEffect(() => {
    if (expandedAccordion === MyBoardPanelTypes.PINNED && pinned.status === "idle") {
      refreshSection(MyBoardPanelTypes.PINNED);
    }
    if (expandedAccordion === MyBoardPanelTypes.ESSENTIAL && essential.status === "idle") {
      refreshSection(MyBoardPanelTypes.ESSENTIAL);
    }
  }, [expandedAccordion, pinned.status, essential.status, refreshSection]);

  useEffect(() => {
    if (expandedAccordion === "quizzes" && quizzesStatus === "idle") {
      refreshQuizzes();
    }
  }, [expandedAccordion, quizzesStatus, refreshQuizzes]);

  const refetchDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!expandedAccordion) return;

    const isSuccess = pageMutationState === "success" || routeMutationState === "success";
    if (!isSuccess) return;

    if (refetchDebounceRef.current) {
      window.clearTimeout(refetchDebounceRef.current);
    }

    refetchDebounceRef.current = window.setTimeout(() => {
      if (expandedAccordion === MyBoardPanelTypes.PINNED) refreshSection(MyBoardPanelTypes.PINNED);
      if (expandedAccordion === MyBoardPanelTypes.ESSENTIAL)
        refreshSection(MyBoardPanelTypes.ESSENTIAL);
    }, 250);

    return () => {
      if (refetchDebounceRef.current) {
        window.clearTimeout(refetchDebounceRef.current);
        refetchDebounceRef.current = null;
      }
    };
  }, [expandedAccordion, pageMutationState, refreshSection, routeMutationState]);

  const renderLoadingScreen = (label: string) => (
    <Box
      sx={{
        py: { xs: 8, sm: 10 },
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <CircularProgress />
      <Typography variant="h6" color="text.secondary" sx={{ mt: 2, maxWidth: 380 }}>
        Loading {label}...
      </Typography>
    </Box>
  );

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const contentIdParam = searchParams.get("contentId");

    if (!contentIdParam) {
      return;
    }

    const contentId = Number.parseInt(contentIdParam, 10);

    if (Number.isNaN(contentId)) {
      return;
    }

    const pinnedMatch = pinned.items.find((item) => item.contentId === contentId);
    const essentialMatch = essential.items.find((item) => item.contentId === contentId);

    if (pinnedMatch) {
      setExpandedAccordion(MyBoardPanelTypes.PINNED);
      return;
    }

    if (essentialMatch) {
      setExpandedAccordion(MyBoardPanelTypes.ESSENTIAL);
      return;
    }

    if (pinned.status !== "idle" && !pinned.isLoadingMore && pinned.hasMore) {
      setExpandedAccordion(MyBoardPanelTypes.PINNED);
      dispatch(
        fetchMyBoardSection({
          PanelTypes: MyBoardPanelTypes.PINNED,
          offset: pinned.offset + ITEMS_PER_PAGE,
        }),
      );
    }

    if (essential.status !== "idle" && !essential.isLoadingMore && essential.hasMore) {
      setExpandedAccordion(MyBoardPanelTypes.ESSENTIAL);
      dispatch(
        fetchMyBoardSection({
          PanelTypes: MyBoardPanelTypes.ESSENTIAL,
          offset: essential.offset + ITEMS_PER_PAGE,
        }),
      );
    }
  }, [dispatch, essential, location.search, pinned]);

  useEffect(() => {
    const quizIdParam = new URLSearchParams(location.search).get("quizId");
    if (!quizIdParam) {
      return;
    }

    const quizId = Number.parseInt(quizIdParam, 10);
    if (Number.isNaN(quizId)) {
      return;
    }

    setExpandedAccordion("quizzes");

    if (quizzesStatus === "idle") {
      refreshQuizzes();
      return;
    }

    if (quizzesStatus !== "success" || quizzes.length === 0) {
      return;
    }

    const targetQuiz = quizzes.find((quiz) => quiz.quizId === quizId);
    if (!targetQuiz) {
      return;
    }

    const targetIndex = quizzes.findIndex((quiz) => quiz.quizId === quizId);
    if (targetIndex === -1) {
      return;
    }

    setExpandedAccordion("quizzes");
    setQuizzesPage(Math.floor(targetIndex / QUIZZES_PER_PAGE) + 1);
  }, [location.search, quizzes, quizzesStatus, refreshQuizzes]);

  const renderContentGrid = (
    section: BoardSectionState,
    emptyIcon: React.ReactNode,
    emptyTitle: string,
    emptyDescription: string,
    sectionTypes: MyBoardPanelTypes,
  ) => {
    if (section.status === "loading") {
      return renderLoadingScreen(
        sectionTypes === MyBoardPanelTypes.PINNED ? "pinned contents" : "essential contents",
      );
    }

    if (section.status === "failed") {
      return (
        <Box sx={{ my: 4 }}>
          <ErrorHandler message={section.errorMessage || "Failed to load contents"} />
        </Box>
      );
    }

    if (section.status === "success") {
      if (section.items.length > 0) {
        const fallbackSectionId =
          sectionTypes === MyBoardPanelTypes.PINNED
            ? PINNED_CONTENT_SECTION_ID
            : ESSENTIALS_SECTION_ID;

        return (
          <>
            <Stack
              direction="row"
              flexWrap="wrap"
              spacing={0}
              sx={{
                gap: { xs: 3, sm: 4, md: 5 },
                "& > *": {
                  flexBasis: {
                    xs: "100%",
                    sm: "calc(50% - 16px)",
                    md: "calc(33.333% - 26.667px)",
                  },
                  minWidth: {
                    xs: "100%",
                    sm: "min(calc(50% - 16px), 350px)",
                    md: "min(calc(33.333% - 26.667px), 320px)",
                  },
                },
              }}
            >
              {section.items.map((content) => (
                <Box key={content.contentId}>
                  <ComponentCard
                    contentLink={content.contentLink}
                    contentType={content.contentType}
                    description={content.description}
                    thumbnail={content.thumbnail}
                    note={content.note}
                    likesCount={content.likesCount}
                    contentId={content.contentId}
                    sectionId={content.sectionId ?? fallbackSectionId}
                    status={content.status}
                    contentOrder={content.contentOrder}
                    commentCount={content.commentCount}
                    createdOn={content.createdOn}
                    tags={content.tags}
                    isVisible={content.isVisible}
                    customButtons={content.customButtons}
                    isInPinnedSection={sectionTypes === MyBoardPanelTypes.PINNED}
                    onContentUnpinned={() => {
                      if (expandedAccordion === MyBoardPanelTypes.PINNED) {
                        window.setTimeout(() => refreshSection(MyBoardPanelTypes.PINNED), 250);
                      }
                    }}
                  />
                </Box>
              ))}
            </Stack>

            {section.isLoadingMore && (
              <Box
                sx={{
                  mt: 5,
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 1.5,
                }}
              >
                <CircularProgress size={24} />
                <Typography variant="body1" color="text.secondary">
                  Loading more...
                </Typography>
              </Box>
            )}
          </>
        );
      }

      return (
        <Box sx={{ py: { xs: 6, sm: 8 }, textAlign: "center" }}>
          <Box sx={{ display: "inline-block", mb: 2 }}>{emptyIcon}</Box>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1, fontWeight: 500 }}>
            {emptyTitle}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 350, mx: "auto" }}>
            {emptyDescription}
          </Typography>
        </Box>
      );
    }

    return null;
  };

  return (
    <Box
      sx={{
        pt: 9,
        pb: 8,
        px: 3,
        backgroundColor:
          theme.palette.mode === "dark"
            ? theme.palette.background.default
            : theme.palette.common.white,
        minHeight: "100vh",
      }}
    >
      <Header
        theme={theme}
        title={getAppBarTitle()}
        currentPath={location.pathname}
        email={userInfo?.email}
      />

      <Container maxWidth="xl" sx={{ px: { xs: 2, sm: 3, md: 4 } }}>
        {/* Header Section */}
        <Box
          sx={{
            mb: 5,
            mt: 2,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Typography
            variant="h2"
            sx={{
              fontWeight: 600,
              color: theme.palette.primary.main,
            }}
          >
            My Board
          </Typography>
        </Box>

        <Box sx={{ mb: 6 }}>
          {/* Essentials Accordion */}
          <Accordion
            expanded={expandedAccordion === MyBoardPanelTypes.ESSENTIAL}
            onChange={handleAccordionChange(MyBoardPanelTypes.ESSENTIAL)}
            elevation={0}
            sx={{
              mb: 3,
              border: `1px solid ${
                theme.palette.mode === "dark" ? "rgba(255, 107, 0, 0.3)" : "rgba(255, 107, 0, 0.2)"
              }`,
              borderRadius: "12px !important",
              overflow: "hidden",
              "&:before": { display: "none" },
              backgroundColor:
                theme.palette.mode === "dark"
                  ? theme.palette.background.paper
                  : theme.palette.common.white,
            }}
          >
            <AccordionSummary
              expandIcon={
                <ExpandMoreIcon
                  sx={{
                    color: theme.palette.primary.main,
                    fontSize: 28,
                  }}
                />
              }
              sx={{
                px: 3,
                py: 1.5,
                minHeight: "72px",
                "&.Mui-expanded": {
                  minHeight: "72px",
                  borderBottom: `1px solid ${
                    theme.palette.mode === "dark"
                      ? "rgba(255, 107, 0, 0.2)"
                      : "rgba(255, 107, 0, 0.1)"
                  }`,
                },
                "& .MuiAccordionSummary-content": {
                  my: 1.5,
                },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <StarOutlineIcon
                  sx={{
                    fontSize: 26,
                    color: theme.palette.primary.main,
                  }}
                />
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 400,
                    fontSize: "1.5rem",
                    color: theme.palette.text.primary,
                  }}
                >
                  Essentials
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 3, py: 3, backgroundColor: "transparent" }}>
              {isAdmin && (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "flex-end",
                    mb: 4,
                  }}
                >
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setOpenAddEssentialDialog(true)}
                    sx={{
                      borderRadius: 2,
                      px: 3,
                      py: 1,
                      backgroundColor: theme.palette.primary.main,
                      color: theme.palette.common.white,
                      textTransform: "none",
                      fontWeight: 500,
                      "&:hover": {
                        backgroundColor: theme.palette.primary.dark,
                      },
                    }}
                  >
                    Add Content
                  </Button>
                </Box>
              )}

              {renderContentGrid(
                essential,
                <StarOutlineIcon
                  sx={{
                    fontSize: 48,
                    color: theme.palette.primary.main,
                    opacity: 0.5,
                  }}
                />,
                "No essential contents yet",
                "Essential content will appear here!",
                MyBoardPanelTypes.ESSENTIAL,
              )}

              {essential.hasMore && !essential.isLoadingMore && essential.items.length > 0 && (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
                  <Button
                    variant="outlined"
                    endIcon={<KeyboardArrowDownIcon />}
                    onClick={() => seeMoreSection(MyBoardPanelTypes.ESSENTIAL, essential.offset)}
                    disabled={essential.isLoadingMore}
                    sx={{
                      borderRadius: 8,
                      backgroundColor: theme.palette.primary.main,
                      px: 4,
                      py: 0.5,
                      fontWeight: 400,
                      letterSpacing: 0.2,
                      color: theme.palette.common.white,
                      "&:hover": {
                        backgroundColor: theme.palette.primary.dark,
                      },
                      "&.Mui-disabled": {
                        opacity: 0.7,
                        color: theme.palette.common.white,
                      },
                    }}
                  >
                    See More
                  </Button>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>

          {/* Pinned Contents Accordion */}
          <Accordion
            expanded={expandedAccordion === MyBoardPanelTypes.PINNED}
            onChange={handleAccordionChange(MyBoardPanelTypes.PINNED)}
            elevation={0}
            sx={{
              border: `1px solid ${
                theme.palette.mode === "dark" ? "rgba(255, 107, 0, 0.3)" : "rgba(255, 107, 0, 0.2)"
              }`,
              borderRadius: "12px !important",
              overflow: "hidden",
              "&:before": { display: "none" },
              backgroundColor:
                theme.palette.mode === "dark"
                  ? theme.palette.background.paper
                  : theme.palette.common.white,
            }}
          >
            <AccordionSummary
              expandIcon={
                <ExpandMoreIcon
                  sx={{
                    color: theme.palette.primary.main,
                    fontSize: 28,
                  }}
                />
              }
              sx={{
                px: 3,
                py: 1.5,
                minHeight: "72px",
                "&.Mui-expanded": {
                  minHeight: "72px",
                  borderBottom: `1px solid ${
                    theme.palette.mode === "dark"
                      ? "rgba(255, 107, 0, 0.2)"
                      : "rgba(255, 107, 0, 0.1)"
                  }`,
                },
                "& .MuiAccordionSummary-content": {
                  my: 1.5,
                },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <PushPinOutlinedIcon
                  sx={{
                    fontSize: 26,
                    color: theme.palette.primary.main,
                  }}
                />
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 400,
                    fontSize: "1.5rem",
                    color: theme.palette.text.primary,
                  }}
                >
                  Pinned Contents
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 3, py: 3, backgroundColor: "transparent" }}>
              {renderContentGrid(
                pinned,
                <PushPinOutlinedIcon
                  sx={{
                    fontSize: 48,
                    color: theme.palette.primary.main,
                    opacity: 0.5,
                  }}
                />,
                "No pinned contents yet",
                "Start pinning your favorite content from other pages!",
                MyBoardPanelTypes.PINNED,
              )}

              {pinned.hasMore && !pinned.isLoadingMore && pinned.items.length > 0 && (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
                  <Button
                    variant="outlined"
                    endIcon={<KeyboardArrowDownIcon />}
                    onClick={() => seeMoreSection(MyBoardPanelTypes.PINNED, pinned.offset)}
                    disabled={pinned.isLoadingMore}
                    sx={{
                      borderRadius: 8,
                      backgroundColor: theme.palette.primary.main,
                      px: 4,
                      py: 0.5,
                      fontWeight: 400,
                      letterSpacing: 0.2,
                      color: theme.palette.common.white,
                      "&:hover": {
                        backgroundColor: theme.palette.primary.dark,
                      },
                      "&.Mui-disabled": {
                        opacity: 0.7,
                        color: theme.palette.common.white,
                      },
                    }}
                  >
                    See More
                  </Button>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>

          {/* Quizzes Accordion */}
          <Accordion
            expanded={expandedAccordion === "quizzes"}
            onChange={handleAccordionChange("quizzes")}
            elevation={0}
            sx={{
              mt: 3,
              border: `1px solid ${
                theme.palette.mode === "dark" ? "rgba(255, 107, 0, 0.3)" : "rgba(255, 107, 0, 0.2)"
              }`,
              borderRadius: "12px !important",
              overflow: "hidden",
              "&:before": { display: "none" },
              backgroundColor:
                theme.palette.mode === "dark"
                  ? theme.palette.background.paper
                  : theme.palette.common.white,
            }}
          >
            <AccordionSummary
              expandIcon={
                <ExpandMoreIcon
                  sx={{
                    color: theme.palette.primary.main,
                    fontSize: 28,
                  }}
                />
              }
              sx={{
                px: 3,
                py: 1.5,
                minHeight: "72px",
                "&.Mui-expanded": {
                  minHeight: "72px",
                  borderBottom: `1px solid ${
                    theme.palette.mode === "dark"
                      ? "rgba(255, 107, 0, 0.2)"
                      : "rgba(255, 107, 0, 0.1)"
                  }`,
                },
                "& .MuiAccordionSummary-content": {
                  my: 1.5,
                },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <SchoolOutlinedIcon
                  sx={{
                    fontSize: 26,
                    color: theme.palette.primary.main,
                  }}
                />
                <Typography
                  variant="h5"
                  sx={{
                    fontWeight: 400,
                    fontSize: "1.5rem",
                    color: theme.palette.text.primary,
                  }}
                >
                  Quizzes
                </Typography>
                {quizzes.length > 0 && (
                  <Chip
                    label={quizzes.length}
                    size="small"
                    sx={{
                      backgroundColor: theme.palette.primary.main,
                      color: theme.palette.common.white,
                      fontWeight: 600,
                      height: 24,
                      minWidth: 24,
                    }}
                  />
                )}
              </Box>
            </AccordionSummary>

            <AccordionDetails sx={{ px: 3, py: 3 }}>
              {quizzesStatus === "loading" ? (
                <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
                  <CircularProgress />
                </Box>
              ) : quizzes.length === 0 ? (
                <Box sx={{ py: 6, textAlign: "center" }}>
                  <SchoolOutlinedIcon
                    sx={{
                      fontSize: 48,
                      color: theme.palette.primary.main,
                      opacity: 0.4,
                    }}
                  />
                  <Typography variant="h6" color="text.secondary" sx={{ mt: 1 }}>
                    No quizzes assigned yet
                  </Typography>
                </Box>
              ) : (
                <>
                  {/* Filter chips */}
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      mb: 3,
                      flexWrap: "wrap",
                    }}
                  >
                    {(["all", "not_started", "passed", "failed"] as const).map((f) => {
                      const count =
                        f === "all" ? quizzes.length : quizzes.filter((q) => q.status === f).length;
                      const label = {
                        all: "All",
                        not_started: "Pending",
                        passed: "Passed",
                        failed: "Failed",
                      }[f];
                      return (
                        <Chip
                          key={f}
                          label={`${label} ${count}`}
                          onClick={() => {
                            setQuizFilter(f);
                            setQuizzesPage(1);
                          }}
                          sx={{
                            cursor: "pointer",
                            backgroundColor:
                              quizFilter === f ? theme.palette.primary.main : "transparent",
                            color:
                              quizFilter === f
                                ? theme.palette.common.white
                                : theme.palette.text.primary,
                            border: `1px solid ${
                              quizFilter === f ? theme.palette.primary.main : theme.palette.divider
                            }`,
                            fontWeight: quizFilter === f ? 600 : 400,
                            "&:hover":
                              quizFilter === f
                                ? {
                                    backgroundColor: theme.palette.primary.main,
                                  }
                                : {
                                    backgroundColor: theme.palette.action.hover,
                                  },
                          }}
                        />
                      );
                    })}
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {(() => {
                      const filteredQuizzes = quizzes.filter(
                        (q) => quizFilter === "all" || q.status === quizFilter,
                      );
                      const totalPages = Math.ceil(filteredQuizzes.length / QUIZZES_PER_PAGE);
                      const startIdx = (quizzesPage - 1) * QUIZZES_PER_PAGE;
                      const paginatedQuizzes = filteredQuizzes.slice(
                        startIdx,
                        startIdx + QUIZZES_PER_PAGE,
                      );

                      return (
                        <>
                          {paginatedQuizzes.map((quiz) => (
                            <QuizCard key={quiz.quizId} quiz={quiz} />
                          ))}
                          {totalPages > 1 && (
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "center",
                                mt: 2,
                              }}
                            >
                              <Pagination
                                count={totalPages}
                                page={quizzesPage}
                                onChange={(_, page) => {
                                  setQuizzesPage(page);
                                }}
                                color="primary"
                              />
                            </Box>
                          )}
                        </>
                      );
                    })()}
                  </Box>
                </>
              )}
            </AccordionDetails>
          </Accordion>
        </Box>
      </Container>

      {/* Content Dialog for Essentials */}
      <ContentDialogBox
        type="add"
        isOpen={openAddEssentialDialog}
        sectionId={ESSENTIALS_SECTION_ID}
        handleClose={() => {
          setOpenAddEssentialDialog(false);
          window.setTimeout(() => refreshSection(MyBoardPanelTypes.ESSENTIAL), 300);
        }}
      />
    </Box>
  );
};

export default MyBoard;
