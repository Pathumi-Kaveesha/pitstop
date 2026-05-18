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
import { Box, Button, Chip, LinearProgress, Skeleton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import React, { useState } from "react";

import { fetchQuizResult, resetResult } from "@slices/quizSlice/quiz";
import { useAppDispatch, useAppSelector } from "@slices/store";

import { QuizWithStatus } from "@/types/types";
import { parseDateAsUtc } from "@utils/utils";
import QuizResultModal from "./QuizResultModal";
import QuizTakeModal from "./QuizTakeModal";

interface Props {
  quiz: QuizWithStatus;
}

const QuizCard: React.FC<Props> = ({ quiz }) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const result = useAppSelector((s) => s.quiz.result);

  const [takingQuiz, setTakingQuiz] = useState(false);
  const [viewingResult, setViewingResult] = useState(false);

  const handleViewResult = () => {
    dispatch(resetResult());
    dispatch(fetchQuizResult(quiz.quizId)).then(() => {
      setViewingResult(true);
    });
  };

  const handleStartQuiz = () => {
    setTakingQuiz(true);
  };

  const handleSubmitted = () => {
    setTakingQuiz(false);
    setViewingResult(true);
    // Fetch results immediately after quiz submission
    dispatch(fetchQuizResult(quiz.quizId));
  };

  const statusColor = {
    not_started: theme.palette.text.secondary,
    passed: "#2e7d32",
    failed: "#c62828",
  }[quiz.status];

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
                    backgroundColor: `${theme.palette.warning.main}15`,
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
                  <EmojiEventsOutlinedIcon sx={{ fontSize: 14, color: statusColor }} />
                  <Typography variant="caption" sx={{ color: statusColor, fontWeight: 600 }}>
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
                        backgroundColor: "#e8f5e9",
                        color: "#2e7d32",
                        border: "1px solid #c8e6c9",
                        fontWeight: 500,
                      }}
                    />
                  </>
                )}
                {quiz.status === "failed" && (
                  <>
                    <Chip
                      icon={<LockOutlinedIcon sx={{ color: "#c62828" }} />}
                      label="Failed"
                      size="small"
                      sx={{
                        backgroundColor: "#ffebee",
                        color: "#c62828",
                        border: "1px solid #ffcdd2",
                        fontWeight: 500,
                        "& .MuiChip-icon": { color: "#c62828" },
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
                          backgroundColor: theme.palette.error.main + "15",
                          color: theme.palette.error.main,
                          fontWeight: 600,
                        }}
                      />
                    ) : (
                      <Chip
                        label="Pending"
                        size="small"
                        sx={{
                          backgroundColor: theme.palette.grey[100],
                          color: theme.palette.common.black,
                        }}
                      />
                    )}
                    <Button
                      size="medium"
                      variant="contained"
                      onClick={handleStartQuiz}
                      disabled={isOverdue}
                      sx={{
                        textTransform: "none",
                        borderRadius: 1.5,
                        fontSize: "0.8rem",
                        backgroundColor: theme.palette.primary.main,
                        color: "#fff",
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
                      backgroundColor: `${statusColor}20`,
                      "& .MuiLinearProgress-bar": { backgroundColor: statusColor },
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
                    fontSize: "0.8rem",
                    whiteSpace: "nowrap",
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
          onClose={() => setTakingQuiz(false)}
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
