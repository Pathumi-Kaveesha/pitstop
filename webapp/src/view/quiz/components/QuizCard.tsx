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

import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { Box, Button, Chip, LinearProgress, Skeleton, Typography, alpha } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useLocation, useNavigate } from "react-router-dom";

import React, { useCallback, useEffect, useState } from "react";

import { QuizWithStatus } from "@/types/types";
import { fetchQuizResult, resetResult } from "@slices/quizSlice/quiz";
import { useAppDispatch, useAppSelector } from "@slices/store";
import { parseDateAsUtc } from "@utils/utils";

import QuizResultModal from "./QuizResultModal";
import QuizTakeModal from "./QuizTakeModal";

interface Props {
  quiz: QuizWithStatus;
}

const QuizCard: React.FC<Props> = ({ quiz }) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();

  const result = useAppSelector((s) => s.quiz.result);

  const [takingQuiz, setTakingQuiz] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const syncQuizIdInUrl = useCallback(
    (quizId?: number) => {
      const searchParams = new URLSearchParams(location.search);

      if (quizId == null) {
        searchParams.delete("quizId");
      } else {
        searchParams.set("quizId", quizId.toString());
      }

      const search = searchParams.toString();
      navigate(
        {
          pathname: location.pathname,
          search: search ? `?${search}` : "",
        },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  useEffect(() => {
    const urlQuizId = new URLSearchParams(location.search).get("quizId");
    const parsedQuizId = urlQuizId ? Number.parseInt(urlQuizId, 10) : null;
    const shouldOpenQuiz = parsedQuizId === quiz.quizId;

    if (!shouldOpenQuiz) {
      setTakingQuiz(false);
      setBlockedMessage(null);
      return;
    }

    if (quiz.status === "not_started") {
      setBlockedMessage(null);
      setTakingQuiz(true);
      return;
    }

    setBlockedMessage("You have already completed this quiz.");
    setTakingQuiz(true);
  }, [location.search, quiz.quizId, quiz.status]);

  const handleViewResult = () => {
    dispatch(resetResult());
    dispatch(fetchQuizResult(quiz.quizId)).then(() => {
      setViewingResult(true);
    });
  };

  const handleStartQuiz = () => {
    setViewingResult(false);
    setBlockedMessage(null);
    syncQuizIdInUrl(quiz.quizId);
    setTakingQuiz(true);
  };

  const handleSubmitted = () => {
    setTakingQuiz(false);
    setViewingResult(true);
    // Fetch results immediately after quiz submission
    dispatch(fetchQuizResult(quiz.quizId));
  };

  const progressValue = quiz.scorePercentage ?? 0;

  const parsedDueDate = parseDateAsUtc(quiz.dueDate);
  const isOverdue = !!parsedDueDate && parsedDueDate < new Date();
  const isPendingQuiz = quiz.status === "not_started";

  const isLoadingResults = viewingResult && !result;

  return (
    <>
      <Box
        sx={{
          p: 2.5,
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
          backgroundColor: theme.palette.background.paper,
          position: "relative",
        }}
      >
        {/* Top row */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{
                mb: 0.3,
                color: theme.palette.text.primary,
                "&:hover": { color: theme.palette.primary.main },
                transition: "color 0.2s",
              }}
            >
              {quiz.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {quiz.totalQuestions} questions
            </Typography>
            {quiz.description && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  mt: 0.5,
                  mb: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {quiz.description}
              </Typography>
            )}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", mt: 0.5 }}>
              {quiz.dueDate && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    px: 1,
                    py: 0.25,
                    borderRadius: 1,
                    backgroundColor: alpha(theme.palette.warning.main, 0.08),
                  }}
                >
                  <CalendarTodayOutlinedIcon
                    sx={{ fontSize: 14, color: theme.palette.warning.dark }}
                  />
                  <Typography
                    variant="caption"
                    sx={{ color: theme.palette.warning.dark, fontWeight: 600 }}
                  >
                    Due{" "}
                    {parsedDueDate?.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Typography>
                </Box>
              )}
              {quiz.status !== "not_started" && quiz.scorePercentage !== undefined && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <EmojiEventsOutlinedIcon
                    sx={{
                      fontSize: 14,
                      color:
                        quiz.status === "passed"
                          ? theme.palette.mode === "dark"
                            ? theme.palette.success.light
                            : theme.palette.success.dark
                          : theme.palette.mode === "dark"
                            ? theme.palette.error.light
                            : theme.palette.error.dark,
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color:
                        quiz.status === "passed"
                          ? theme.palette.mode === "dark"
                            ? theme.palette.success.light
                            : theme.palette.success.dark
                          : theme.palette.mode === "dark"
                            ? theme.palette.error.light
                            : theme.palette.error.dark,
                      fontWeight: 600,
                    }}
                  >
                    {quiz.scorePercentage}%
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>

          {/* Status */}
          <Box
            sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, ml: 2 }}
          >
            {isLoadingResults ? (
              <>
                <Skeleton variant="rectangular" width={100} height={32} sx={{ borderRadius: 1 }} />
                <Skeleton variant="rectangular" width={100} height={36} sx={{ borderRadius: 1 }} />
              </>
            ) : (
              <>
                {quiz.status === "passed" && (
                  <>
                    <Chip
                      icon={<EmojiEventsOutlinedIcon />}
                      label="Passed"
                      size="small"
                      sx={{
                        backgroundColor:
                          theme.palette.mode === "dark"
                            ? alpha(theme.palette.success.main, 0.16)
                            : alpha(theme.palette.success.main, 0.12),
                        color:
                          theme.palette.mode === "dark"
                            ? theme.palette.success.light
                            : theme.palette.success.dark,
                        border: `1px solid ${theme.palette.mode === "dark" ? alpha(theme.palette.success.light, 0.35) : alpha(theme.palette.success.main, 0.25)}`,
                        fontWeight: 500,
                      }}
                    />
                  </>
                )}
                {quiz.status === "failed" && (
                  <>
                    <Chip
                      icon={
                        <LockOutlinedIcon
                          sx={{
                            color:
                              theme.palette.mode === "dark"
                                ? theme.palette.error.light
                                : theme.palette.error.dark,
                          }}
                        />
                      }
                      label="Failed"
                      size="small"
                      sx={{
                        backgroundColor:
                          theme.palette.mode === "dark"
                            ? alpha(theme.palette.error.main, 0.12)
                            : alpha(theme.palette.error.main, 0.04),
                        color:
                          theme.palette.mode === "dark"
                            ? theme.palette.error.light
                            : theme.palette.error.dark,
                        border: `1px solid ${theme.palette.mode === "dark" ? alpha(theme.palette.error.light, 0.35) : alpha(theme.palette.error.main, 0.25)}`,
                        fontWeight: 500,
                        "& .MuiChip-icon": {
                          color:
                            theme.palette.mode === "dark"
                              ? theme.palette.error.light
                              : theme.palette.error.dark,
                        },
                      }}
                    />
                  </>
                )}
                {isPendingQuiz && (
                  <>
                    {isOverdue ? (
                      <Chip
                        label="Overdue"
                        size="small"
                        sx={{
                          backgroundColor: alpha(theme.palette.error.main, 0.08),
                          color: theme.palette.error.main,
                          fontWeight: 600,
                        }}
                      />
                    ) : (
                      <Chip
                        label="Pending"
                        size="small"
                        sx={{
                          backgroundColor:
                            theme.palette.mode === "dark"
                              ? alpha(theme.palette.common.white, 0.08)
                              : theme.palette.grey[100],
                          color: theme.palette.text.secondary,
                        }}
                      />
                    )}
                    <Button
                      size="medium"
                      variant="contained"
                      onClick={handleStartQuiz}
                      sx={{
                        textTransform: "none",
                        borderRadius: 1.5,
                        fontSize: "0.9rem",
                        whiteSpace: "nowrap",
                        minWidth: 120,
                        px: 2,
                        py: 0.75,
                        backgroundColor: theme.palette.primary.main,
                        color: theme.palette.common.white,
                      }}
                    >
                      Start
                    </Button>
                  </>
                )}
              </>
            )}
          </Box>
        </Box>

        {/* Progress bar */}
        {isLoadingResults ? (
          <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2 }}>
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="rounded" height={3} />
            </Box>
            <Skeleton variant="rectangular" width={100} height={36} sx={{ borderRadius: 1 }} />
          </Box>
        ) : (
          <>
            {!isPendingQuiz && (
              <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={progressValue}
                    sx={{
                      height: 3,
                      borderRadius: 3,
                      backgroundColor: alpha(
                        quiz.status === "passed"
                          ? theme.palette.mode === "dark"
                            ? theme.palette.success.light
                            : theme.palette.success.dark
                          : theme.palette.mode === "dark"
                            ? theme.palette.error.light
                            : theme.palette.error.dark,
                        0.12,
                      ),
                      "& .MuiLinearProgress-bar": {
                        backgroundColor:
                          quiz.status === "passed"
                            ? theme.palette.mode === "dark"
                              ? theme.palette.success.light
                              : theme.palette.success.dark
                            : theme.palette.mode === "dark"
                              ? theme.palette.error.light
                              : theme.palette.error.dark,
                      },
                    }}
                  />
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleViewResult}
                  sx={{
                    textTransform: "none",
                    borderRadius: 1.5,
                    fontSize: "0.9rem",
                    whiteSpace: "nowrap",
                    minWidth: 120,
                    px: 2,
                    py: 0.75,
                    borderColor: theme.palette.divider,
                    color: theme.palette.text.primary,
                  }}
                >
                  {quiz.status === "passed" ? "Review answers" : "View answers"}
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Take Quiz Modal */}
      {takingQuiz && (
        <QuizTakeModal
          quiz={quiz}
          open={takingQuiz}
          blockedMessage={blockedMessage}
          onClose={() => {
            setViewingResult(false);
            setBlockedMessage(null);
            setTakingQuiz(false);
            syncQuizIdInUrl();
          }}
          onSubmitted={handleSubmitted}
        />
      )}

      {/* Result Modal */}
      {viewingResult && result && (
        <QuizResultModal
          quiz={quiz}
          result={result}
          open={viewingResult}
          onClose={() => {
            setViewingResult(false);
            dispatch(resetResult());
          }}
        />
      )}
    </>
  );
};

export default QuizCard;
