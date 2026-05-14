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

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  LinearProgress,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import React, { useEffect, useState } from "react";

import { QuizQuestion, QuizWithStatus } from "@/types/types";
import {
  fetchAnswerOptions,
  fetchQuestionsForQuiz,
  fetchQuizResult,
  resetQuestions,
  resetSubmit,
  submitQuizAnswers,
} from "@slices/quizSlice/quiz";
import { useAppDispatch, useAppSelector } from "@slices/store";

interface Props {
  quiz: QuizWithStatus;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

const QuizTakeModal: React.FC<Props> = ({ quiz, open, onClose, onSubmitted }) => {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const questions = useAppSelector((s) => s.quiz.questions);
  const questionsStatus = useAppSelector((s) => s.quiz.questionsStatus);
  const answerOptions = useAppSelector((s) => s.quiz.answerOptions);
  const submitStatus = useAppSelector((s) => s.quiz.submitStatus);

  const [currentIndex, setCurrentIndex] = useState(0);

  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [feedbackText, setFeedbackText] = useState<Record<number, string>>({});

  useEffect(() => {
    if (open) {
      dispatch(resetQuestions());
      dispatch(fetchQuestionsForQuiz(quiz.quizId))
        .unwrap()
        .then((questions: QuizQuestion[]) => {
          if (questions) {
            questions.forEach((q: QuizQuestion) => {
              if (q.questionType !== "feedback") {
                dispatch(fetchAnswerOptions(q.questionId));
              }
            });
          }
        })
        .catch(() => {});
    }
  }, [open, quiz.quizId, dispatch]);

  useEffect(() => {
    if (submitStatus === "success") {
      dispatch(fetchQuizResult(quiz.quizId)).then(() => {
        dispatch(resetSubmit());
        onSubmitted();
      });
    }
  }, [submitStatus, dispatch, quiz.quizId, onSubmitted]);

  const currentQuestion = questions[currentIndex];
  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;
  const answeredCount = Object.keys(answers).length + Object.keys(feedbackText).length;

  const handleSelectAnswer = (questionId: number, answerId: number, type: string) => {
    if (type === "mcq_single" || type === "rating") {
      setAnswers((prev) => ({ ...prev, [questionId]: [answerId] }));
    } else if (type === "mcq_multiple") {
      setAnswers((prev) => {
        const current = prev[questionId] || [];
        const exists = current.includes(answerId);
        return {
          ...prev,
          [questionId]: exists ? current.filter((id) => id !== answerId) : [...current, answerId],
        };
      });
    }
  };

  const handleSubmit = () => {
    const payload = questions.map((q) => {
      if (q.questionType === "feedback") {
        return {
          questionId: q.questionId,
          questionType: "feedback",
          selectedAnswerIds: [],
          feedbackText: feedbackText[q.questionId] || "",
        };
      }
      return {
        questionId: q.questionId,
        questionType: q.questionType,
        selectedAnswerIds: answers[q.questionId] || [],
      };
    });
    dispatch(submitQuizAnswers({ quizId: quiz.quizId, answers: payload }));
  };

  const isLastQuestion = currentIndex === questions.length - 1;

  const renderOptions = () => {
    if (!currentQuestion) return null;
    const { questionId, questionType } = currentQuestion;
    const options = answerOptions[questionId] || [];

    if (questionType === "feedback") {
      return (
        <textarea
          value={feedbackText[questionId] || ""}
          onChange={(e) => setFeedbackText((prev) => ({ ...prev, [questionId]: e.target.value }))}
          placeholder="Share your feedback about this quiz..."
          rows={5}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "8px",
            border: `1px solid ${theme.palette.divider}`,
            fontSize: "14px",
            fontFamily: "inherit",
            resize: "vertical",
            background: theme.palette.background.paper,
            color: theme.palette.text.primary,
          }}
        />
      );
    }

    if (questionType === "rating") {
      return (
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 1.5,
            justifyContent: "center",
            py: 3,
            px: 1,
          }}
        >
          {options.map((opt) => {
            const selected = (answers[questionId] || []).includes(opt.answerId);
            return (
              <Box
                key={opt.answerId}
                onClick={() => handleSelectAnswer(questionId, opt.answerId, "rating")}
                sx={{
                  minWidth: 100,
                  px: 3,
                  py: 1.5,
                  borderRadius: "12px",
                  border: `2px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
                  backgroundColor: selected
                    ? `${theme.palette.primary.main}15`
                    : theme.palette.background.paper,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: selected ? theme.palette.primary.main : theme.palette.text.primary,
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  textAlign: "center",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  boxShadow: selected ? `0 4px 12px ${theme.palette.primary.main}30` : "none",
                  "&:hover": {
                    borderColor: theme.palette.primary.main,
                    transform: "translateY(-2px)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                  },
                }}
              >
                {opt.answerText}
              </Box>
            );
          })}
        </Box>
      );
    }

    const labels = ["A", "B", "C", "D", "E", "F", "G", "H"];
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {options.map((opt, i) => {
          const selected = (answers[questionId] || []).includes(opt.answerId);
          return (
            <Box
              key={opt.answerId}
              onClick={() => handleSelectAnswer(questionId, opt.answerId, questionType)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                p: 2,
                borderRadius: 2,
                border: `1.5px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
                backgroundColor: selected
                  ? `${theme.palette.primary.main}15`
                  : theme.palette.background.paper,
                cursor: "pointer",
                transition: "all 0.15s",
                "&:hover": {
                  borderColor: theme.palette.primary.main,
                  backgroundColor: `${theme.palette.primary.main}08`,
                },
              }}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: `1.5px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
                  backgroundColor: selected ? theme.palette.primary.main : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: selected ? "#fff" : theme.palette.text.secondary,
                  flexShrink: 0,
                }}
              >
                {labels[i]}
              </Box>
              <Typography variant="body1">{opt.answerText}</Typography>
            </Box>
          );
        })}
      </Box>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: "90vh" } }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Header */}
        <Box sx={{ px: 3, pt: 3, pb: 2 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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
                  {new Date(quiz.dueDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Typography>
              )}
            </Box>
            <Box
              sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}
            >
              <Chip
                label="1 attempt only"
                size="small"
                sx={{
                  backgroundColor: `${theme.palette.primary.main}20`,
                  color: theme.palette.primary.main,
                  fontWeight: 500,
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Pass: {quiz.passingScore}%
              </Typography>
              <IconButton onClick={onClose} size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </Box>

        {questionsStatus === "loading" ? (
          <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {/* Progress */}
            <Box sx={{ px: 3, pb: 1 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Question {currentIndex + 1} of {questions.length}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {answeredCount}/{questions.length} answered
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: `${theme.palette.primary.main}20`,
                  "& .MuiLinearProgress-bar": { backgroundColor: theme.palette.primary.main },
                }}
              />
            </Box>

            {/* Question */}
            <Box sx={{ px: 3, py: 2 }}>
              {currentQuestion && (
                <>
                  <Typography variant="h6" fontWeight={500} sx={{ mb: 3 }}>
                    {currentQuestion.questionText}
                  </Typography>
                  {renderOptions()}
                </>
              )}
            </Box>

            {/* Footer */}
            <Box sx={{ px: 3, pb: 3 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", textAlign: "center", mb: 2 }}
              >
                You only get one attempt. Correct answers will be revealed after you submit.
              </Typography>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Button
                  startIcon={<ArrowBackIcon />}
                  onClick={() => setCurrentIndex((i) => i - 1)}
                  disabled={currentIndex === 0}
                  sx={{ textTransform: "none", color: theme.palette.text.secondary }}
                >
                  Previous
                </Button>
                {isLastQuestion ? (
                  <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={submitStatus === "loading"}
                    sx={{
                      textTransform: "none",
                      borderRadius: 2,
                      px: 4,
                      backgroundColor: theme.palette.primary.main,
                    }}
                  >
                    {submitStatus === "loading" ? (
                      <CircularProgress size={20} color="inherit" />
                    ) : (
                      "Submit"
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    endIcon={<ArrowForwardIcon />}
                    onClick={() => setCurrentIndex((i) => i + 1)}
                    sx={{
                      textTransform: "none",
                      borderRadius: 2,
                      px: 3,
                      backgroundColor: theme.palette.primary.main,
                    }}
                  >
                    Next
                  </Button>
                )}
              </Box>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default QuizTakeModal;
