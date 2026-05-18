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
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import React, { useEffect, useRef, useState } from "react";

import { QuizResult, QuizWithStatus, SubmittedAnswer } from "@/types/types";
import { parseDateAsUtc } from "@utils/utils";
import { fetchAnswerOptions, fetchQuestionsForQuiz } from "@slices/quizSlice/quiz";
import { useAppDispatch } from "@slices/store";

interface Props {
  quiz: QuizWithStatus;
  result: QuizResult;
  open: boolean;
  onClose: () => void;
}

interface QuestionMeta {
  correctText: string;
  refLinks: string[];
}

const QuizResultModal: React.FC<Props> = ({ quiz, result, open, onClose }) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const isDarkMode = theme.palette.mode === "dark";
  const paperBg = theme.palette.background.paper;
  const surfaceBg = isDarkMode ? theme.palette.grey[900] : theme.palette.grey[50];
  const successBg = isDarkMode ? "rgba(46, 125, 50, 0.16)" : "#e8f5e9";
  const warningBg = isDarkMode ? "rgba(239, 108, 0, 0.16)" : "#fff3e0";
  const successText = isDarkMode ? theme.palette.success.light : "#2e7d32";
  const warningText = isDarkMode ? theme.palette.warning.light : "#e65100";
  const dangerText = isDarkMode ? theme.palette.error.light : "#c62828";
  const successBorder = isDarkMode ? "rgba(129, 199, 132, 0.35)" : "#c8e6c9";
  const dangerBorder = isDarkMode ? "rgba(239, 154, 154, 0.35)" : "#ffcdd2";
  const dividerColor = theme.palette.divider;

  const [questionMetaMap, setQuestionMetaMap] = useState<Record<number, QuestionMeta>>({});
  const [loadingCorrectAnswers, setLoadingCorrectAnswers] = useState(false);

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
  const missedQuestions = uniqueQuestions.filter(
    (q) => !q.allCorrect && q.questionType !== "rating" && q.questionType !== "feedback",
  );

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      fetchedRef.current = false;
      return;
    }
    if (missedQuestions.length === 0) return;
    if (fetchedRef.current) return;

    interface QuestionOption {
      isCorrect?: boolean;
      correct?: boolean;
      answerText?: string;
      text?: string;
      optionText?: string;
    }

    interface QuestionWithLinks {
      questionId: number;
      refLinks?: string[];
    }

    const fetchCorrectAnswers = async () => {
      setLoadingCorrectAnswers(true);
      const newMap: Record<number, QuestionMeta> = {};

      try {
        const qRes = await dispatch(fetchQuestionsForQuiz(quiz.quizId)).unwrap();
        const questions: QuestionWithLinks[] = Array.isArray(qRes)
          ? qRes
          : ((qRes as { questions?: QuestionWithLinks[] })?.questions ?? []);

        const questionLinks = new Map<number, string[]>();
        questions.forEach((qq) =>
          questionLinks.set(qq.questionId, Array.isArray(qq.refLinks) ? qq.refLinks : []),
        );

        await Promise.all(
          missedQuestions.map(async (q) => {
            try {
              const res = await dispatch(fetchAnswerOptions(q.questionId)).unwrap();
              const options = ((res as { options?: QuestionOption[] })?.options ??
                res ??
                []) as QuestionOption[];
              const correctOpts = options.filter((opt) => opt.isCorrect || opt.correct);
              const correctText =
                correctOpts.length > 0
                  ? correctOpts.map((o) => o.answerText ?? o.text ?? o.optionText ?? "").join(", ")
                  : "";

              const qLinks = questionLinks.get(q.questionId) ?? [];
              const answerLinks = q.answers.flatMap((ans) =>
                Array.isArray(ans.refLinks) ? ans.refLinks : [],
              );
              const merged = Array.from(new Set([...qLinks, ...answerLinks]));

              newMap[q.questionId] = { correctText, refLinks: merged };
            } catch {
              // skip this question
            }
          }),
        );
      } catch {
        // fetching questions failed — continue silently
      }

      setQuestionMetaMap(newMap);
      setLoadingCorrectAnswers(false);
    };

    fetchCorrectAnswers().finally(() => {
      fetchedRef.current = true;
    });
  }, [open, result.answers, missedQuestions, dispatch, quiz.quizId]);

  const getAnswerText = (ans: SubmittedAnswer) =>
    ans.selectedAnswerText || ans.selectedOptionText || "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: "90vh", backgroundColor: paperBg } }}
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
            {quiz.dueDate && (
              <Typography variant="body2" color="text.secondary">
                Due{" "}
                {parseDateAsUtc(quiz.dueDate)?.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Chip
              label="Attempt used"
              size="small"
              sx={{
                backgroundColor: `${theme.palette.primary.main}20`,
                color: theme.palette.primary.main,
                fontWeight: 500,
              }}
            />
            <IconButton onClick={onClose} size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* Score Banner */}
        <Box
          sx={{
            mx: 3,
            mb: 2,
            p: 2,
            borderRadius: 2,
            backgroundColor: result.passed ? successBg : warningBg,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          {result.passed ? (
            <EmojiEventsOutlinedIcon sx={{ color: successText, fontSize: 28 }} />
          ) : (
            <CancelIcon sx={{ color: warningText, fontSize: 28, opacity: 0.8 }} />
          )}
          <Box>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              sx={{ color: result.passed ? successText : warningText }}
            >
              {result.passed
                ? `Already completed — ${result.scorePercentage}%`
                : `Scored ${result.scorePercentage}% (need ${quiz.passingScore}%)`}
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: result.passed ? successText : theme.palette.text.secondary }}
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

          {loadingCorrectAnswers ? (
            <Box sx={{ py: 3, display: "flex", justifyContent: "center" }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
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
                const meta = questionMetaMap[q.questionId];
                const correctText = meta?.correctText ?? "";
                const refLinks = meta?.refLinks ?? [];
                const yourAnswerTexts = q.answers.map((a) => getAnswerText(a)).filter(Boolean);
                const yourAnswerDisplay = yourAnswerTexts.join(", ");
                const isNeutralQuestion =
                  q.questionType === "rating" || q.questionType === "feedback";
                const isWrongScoredQuestion = !isNeutralQuestion && !q.allCorrect;
                const cardBorder = isNeutralQuestion
                  ? dividerColor
                  : q.allCorrect
                    ? successBorder
                    : dangerBorder;
                const cardBackground = isNeutralQuestion
                  ? paperBg
                  : q.allCorrect
                    ? surfaceBg
                    : isDarkMode
                      ? "rgba(198, 40, 40, 0.12)"
                      : "#fff8f6";

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
                    {/* Question text + icon */}
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
                            sx={{ color: successText, fontSize: 22, flexShrink: 0, ml: 1 }}
                          />
                        ) : (
                          <CancelIcon
                            sx={{ color: dangerText, fontSize: 22, flexShrink: 0, ml: 1 }}
                          />
                        ))}
                    </Box>

                    {/* Your answer */}
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
                              ? successText
                              : dangerText,
                        }}
                      >
                        {yourAnswerDisplay}
                      </Typography>
                    </Box>

                    {/* Correct answer — only when wrong */}
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
                          sx={{ color: "#2e7d32", flexShrink: 0 }}
                        >
                          Correct answer:
                        </Typography>
                        <Typography variant="body2" sx={{ color: successText }}>
                          {correctText}
                        </Typography>
                      </Box>
                    )}

                    {/* Learn More */}
                    {isWrongScoredQuestion && refLinks.length > 0 && (
                      <Box sx={{ mt: 1, ml: 0.5, pt: 1, borderTop: `1px solid ${dividerColor}` }}>
                        <Typography
                          variant="caption"
                          fontWeight={600}
                          sx={{ color: theme.palette.primary.main, display: "block", mb: 0.5 }}
                        >
                          Learn more:
                        </Typography>
                        {refLinks.map((link, i) => (
                          <a
                            key={i}
                            href={link}
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
                        ))}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default QuizResultModal;
