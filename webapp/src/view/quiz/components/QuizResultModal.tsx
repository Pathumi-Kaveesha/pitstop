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

import CancelIcon from "@mui/icons-material/Cancel";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import EmojiEventsOutlinedIcon from "@mui/icons-material/EmojiEventsOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import { Box, Dialog, DialogContent, IconButton, Typography, alpha } from "@mui/material";
import { useTheme } from "@mui/material/styles";

import React from "react";

import { QuizResult, QuizWithStatus, SubmittedAnswer } from "@/types/types";
import { parseDateAsUtc } from "@utils/utils";

interface Props {
  quiz: QuizWithStatus;
  result: QuizResult;
  open: boolean;
  onClose: () => void;
}

const QuizResultModal: React.FC<Props> = ({ quiz, result, open, onClose }) => {
  const theme = useTheme();

  const grouped = result.answers.reduce(
    (acc, ans) => {
      if (!acc[ans.questionId]) {
        acc[ans.questionId] = {
          questionId: ans.questionId,
          questionNumber: ans.questionNumber,
          questionText: ans.questionText,
          questionType: ans.questionType,
          allCorrect: ans.isCorrect,
          answers: [ans],
        };
      } else {
        acc[ans.questionId].allCorrect = acc[ans.questionId].allCorrect && ans.isCorrect;
        acc[ans.questionId].answers.push(ans);
      }
      return acc;
    },
    {} as Record<
      number,
      {
        questionId: number;
        questionNumber: number;
        questionText: string;
        questionType: string;
        allCorrect: boolean;
        answers: SubmittedAnswer[];
      }
    >,
  );

  const uniqueQuestions = Object.values(grouped);

  const normalizeRefLinks = (refLinks: unknown) => {
    if (Array.isArray(refLinks)) {
      return refLinks.filter(
        (link): link is string => typeof link === "string" && Boolean(link.trim()),
      );
    }

    if (typeof refLinks === "string" && refLinks.trim()) {
      try {
        const parsed = JSON.parse(refLinks);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (link): link is string => typeof link === "string" && Boolean(link.trim()),
          );
        }
      } catch (error) {
        void error;
      }

      return [refLinks];
    }

    return [];
  };

  const getAnswerText = (ans: SubmittedAnswer) =>
    ans.selectedAnswerText || ans.selectedOptionText || "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          maxHeight: "92vh",
          backgroundColor: theme.palette.background.paper,
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Header */}
        <Box
          sx={{
            px: 3,
            pt: 3,
            pb: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={600}>
              {quiz.title}
            </Typography>
            {quiz.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {quiz.description}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
            <IconButton onClick={onClose} size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
            {quiz.dueDate && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Due{" "}
                {parseDateAsUtc(quiz.dueDate)?.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Score Banner */}
        <Box
          sx={{
            mx: 3,
            mb: 2,
            p: 2,
            borderRadius: 2,
            backgroundColor: result.passed
              ? theme.palette.mode === "dark"
                ? alpha(theme.palette.success.main, 0.16)
                : alpha(theme.palette.success.main, 0.12)
              : theme.palette.mode === "dark"
                ? alpha(theme.palette.warning.main, 0.16)
                : alpha(theme.palette.warning.main, 0.12),
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          {result.passed ? (
            <EmojiEventsOutlinedIcon
              sx={{
                color:
                  theme.palette.mode === "dark"
                    ? theme.palette.success.light
                    : theme.palette.success.dark,
                fontSize: 28,
              }}
            />
          ) : (
            <CancelIcon
              sx={{
                color:
                  theme.palette.mode === "dark"
                    ? theme.palette.warning.light
                    : theme.palette.warning.dark,
                fontSize: 28,
                opacity: 0.8,
              }}
            />
          )}
          <Box>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              sx={{
                color: result.passed
                  ? theme.palette.mode === "dark"
                    ? theme.palette.success.light
                    : theme.palette.success.dark
                  : theme.palette.mode === "dark"
                    ? theme.palette.warning.light
                    : theme.palette.warning.dark,
              }}
            >
              {result.passed
                ? `Already completed — ${result.scorePercentage}%`
                : `Scored ${result.scorePercentage}% (required ${quiz.passingScore}%)`}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: result.passed
                  ? theme.palette.mode === "dark"
                    ? theme.palette.success.light
                    : theme.palette.success.dark
                  : theme.palette.text.secondary,
              }}
            >
              {result.correctAnswers} of {result.totalQuestions} correct
            </Typography>
          </Box>
        </Box>

        {/* Answers Section */}
        <Box sx={{ px: 3, pb: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <MenuBookOutlinedIcon sx={{ color: theme.palette.primary.main }} />
            <Typography variant="subtitle1" fontWeight={600}>
              All answers
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              maxHeight: 400,
              overflowY: "auto",
              pr: 0.5,
            }}
          >
            {uniqueQuestions.map((q) => {
              const correctText =
                q.answers.find((ans) => ans.correctAnswerText)?.correctAnswerText ?? "";
              const refLinks = Array.from(
                new Set(
                  q.answers.flatMap((ans) => normalizeRefLinks(ans.refLinks)),
                ),
              );
              const yourAnswerTexts = q.answers.map((a) => getAnswerText(a)).filter(Boolean);
              const yourAnswerDisplay = yourAnswerTexts.join(", ");
              const isNeutralQuestion =
                q.questionType === "rating" || q.questionType === "feedback";
              const isWrongScoredQuestion = !isNeutralQuestion && !q.allCorrect;
              const cardBorder = isNeutralQuestion
                ? theme.palette.divider
                : q.allCorrect
                  ? theme.palette.mode === "dark"
                    ? alpha(theme.palette.success.light, 0.35)
                    : alpha(theme.palette.success.main, 0.25)
                  : theme.palette.mode === "dark"
                    ? alpha(theme.palette.error.light, 0.35)
                    : alpha(theme.palette.error.main, 0.25);
              const cardBackground = isNeutralQuestion
                ? theme.palette.background.paper
                : q.allCorrect
                  ? theme.palette.mode === "dark"
                    ? theme.palette.grey[900]
                    : theme.palette.grey[50]
                  : theme.palette.mode === "dark"
                    ? alpha(theme.palette.error.main, 0.12)
                    : alpha(theme.palette.error.main, 0.04);

              return (
                <Box
                  key={q.questionId}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: `1px solid ${cardBorder}`,
                    backgroundColor: cardBackground,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      mb: 1,
                    }}
                  >
                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
                      {q.questionNumber}. {q.questionText}
                    </Typography>
                    {!isNeutralQuestion &&
                      (q.allCorrect ? (
                        <CheckCircleIcon
                          sx={{
                            color:
                              theme.palette.mode === "dark"
                                ? theme.palette.success.light
                                : theme.palette.success.dark,
                            fontSize: 22,
                            flexShrink: 0,
                            ml: 1,
                          }}
                        />
                      ) : (
                        <CancelIcon
                          sx={{
                            color:
                              theme.palette.mode === "dark"
                                ? theme.palette.error.light
                                : theme.palette.error.dark,
                            fontSize: 22,
                            flexShrink: 0,
                            ml: 1,
                          }}
                        />
                      ))}
                  </Box>

                  <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, ml: 0.5 }}>
                    <Typography
                      variant="caption"
                      fontWeight={600}
                      color="text.secondary"
                      sx={{ flexShrink: 0 }}
                    >
                      {isNeutralQuestion ? "Response:" : "Your answer:"}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: isNeutralQuestion
                          ? theme.palette.text.primary
                          : q.allCorrect
                            ? theme.palette.mode === "dark"
                              ? theme.palette.success.light
                              : theme.palette.success.dark
                            : theme.palette.mode === "dark"
                              ? theme.palette.error.light
                              : theme.palette.error.dark,
                      }}
                    >
                      {yourAnswerDisplay}
                    </Typography>
                  </Box>

                  {isWrongScoredQuestion && correctText && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 0.75,
                        ml: 0.5,
                        mt: 0.5,
                      }}
                    >
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        sx={{ color: theme.palette.success.dark, flexShrink: 0 }}
                      >
                        Correct answer:
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          color:
                            theme.palette.mode === "dark"
                              ? theme.palette.success.light
                              : theme.palette.success.dark,
                        }}
                      >
                        {correctText}
                      </Typography>
                    </Box>
                  )}

                  {refLinks.length > 0 && (
                    <Box
                      sx={{
                        mt: 1,
                        ml: 0.5,
                        pt: 1,
                        borderTop: `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        sx={{ color: theme.palette.primary.main, display: "block", mb: 0.5 }}
                      >
                        Learn more:
                      </Typography>
                      {refLinks.map((link, i) => (
                        (() => {
                          try {
                            const url = new URL(link);

                            if (url.protocol === "http:" || url.protocol === "https:") {
                              return (
                                <a
                                  key={i}
                                  href={url.toString()}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    display: "block",
                                    color: theme.palette.primary.main,
                                    fontSize: "0.8rem",
                                    marginBottom: 4,
                                    wordBreak: "break-all",
                                  }}
                                >
                                  {link}
                                </a>
                              );
                            }
                          } catch (error) {
                            void error;
                          }

                          return (
                            <span
                              key={i}
                              style={{
                                display: "block",
                                color: theme.palette.text.secondary,
                                fontSize: "0.8rem",
                                marginBottom: 4,
                                wordBreak: "break-all",
                              }}
                            >
                              {link}
                            </span>
                          );
                        })()
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default QuizResultModal;
