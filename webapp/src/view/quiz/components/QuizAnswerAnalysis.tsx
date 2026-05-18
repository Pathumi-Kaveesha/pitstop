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
import { Box, Typography, useTheme } from "@mui/material";
import { alpha } from "@mui/material/styles";

import React from "react";

import type { QuizAnswerOption, SubmittedAnswer } from "@/types/types";
import { fetchAnswerOptions } from "@slices/quizSlice/quiz";
import type { AppDispatch } from "@slices/store";

interface QuizAnswerAnalysisProps {
  drillDown: { answers: SubmittedAnswer[]; feedback: Record<string, unknown> };
  dispatch: AppDispatch;
}

export const QuizAnswerAnalysis: React.FC<QuizAnswerAnalysisProps> = ({ drillDown, dispatch }) => {
  const theme = useTheme();

  const [correctMap, setCorrectMap] = React.useState<Record<number, string>>({});

  React.useEffect(() => {
    const wrongQuestionIds = [
      ...new Set(
        drillDown.answers
          .filter(
            (a) => !a.isCorrect && a.questionType !== "rating" && a.questionType !== "feedback",
          )
          .map((a) => a.questionId),
      ),
    ];
    if (wrongQuestionIds.length === 0) return;

    const fetchAll = async () => {
      const newMap: Record<number, string> = {};
      await Promise.all(
        wrongQuestionIds.map(async (qId) => {
          try {
            const res = await dispatch(fetchAnswerOptions(qId)).unwrap();
            const options: (QuizAnswerOption & { isCorrect?: boolean })[] =
              res.options ?? res ?? [];
            const correctOpts = options.filter(
              (o: QuizAnswerOption & { isCorrect?: boolean }) => o.isCorrect,
            );
            if (correctOpts.length > 0) {
              newMap[qId] = correctOpts
                .map((o: QuizAnswerOption & { isCorrect?: boolean }) => o.answerText ?? "")
                .join(", ");
            }
          } catch {
            // skip if error occurs, correct answer will not be shown
          }
        }),
      );
      setCorrectMap(newMap);
    };
    fetchAll();
  }, [drillDown.answers, dispatch]);

  const grouped = drillDown.answers.reduce(
    (acc, ans) => {
      if (!acc[ans.questionId]) {
        acc[ans.questionId] = { ...ans, allCorrect: ans.isCorrect, answers: [ans] };
      } else {
        acc[ans.questionId].allCorrect = acc[ans.questionId].allCorrect && ans.isCorrect;
        acc[ans.questionId].answers.push(ans);
      }
      return acc;
    },
    {} as Record<number, SubmittedAnswer & { allCorrect: boolean; answers: SubmittedAnswer[] }>,
  );

  const getAnswerText = (ans: SubmittedAnswer) =>
    ans.selectedAnswerText || ans.selectedOptionText || "";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {Object.values(grouped).map(
        (q: SubmittedAnswer & { allCorrect: boolean; answers: SubmittedAnswer[] }) => {
          const yourAnswerTexts = q.answers
            .map((a: SubmittedAnswer) => getAnswerText(a))
            .filter(Boolean);
          const yourAnswerDisplay = yourAnswerTexts.join(", ");
          const isNeutralQuestion = q.questionType === "rating" || q.questionType === "feedback";
          const isWrongScoredQuestion = !isNeutralQuestion && !q.allCorrect;
          const cardBorder = isNeutralQuestion
            ? theme.palette.divider
            : q.allCorrect
              ? theme.palette.mode === "dark"
                ? alpha(theme.palette.success.main, 0.35)
                : alpha(theme.palette.success.main, 0.2)
              : theme.palette.mode === "dark"
                ? alpha(theme.palette.error.main, 0.35)
                : alpha(theme.palette.error.main, 0.2);
          const cardBackground = isNeutralQuestion
            ? theme.palette.background.paper
            : q.allCorrect
              ? theme.palette.mode === "dark"
                ? theme.palette.grey[900]
                : theme.palette.grey[50]
              : theme.palette.mode === "dark"
                ? alpha(theme.palette.error.main, 0.12)
                : alpha(theme.palette.error.main, 0.08);

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
                  Q{q.questionNumber}. {q.questionText}
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
                  Your answer:
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
                  {yourAnswerDisplay || "N/A"}
                </Typography>
              </Box>

              {isWrongScoredQuestion && correctMap[q.questionId] && (
                <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, ml: 0.5, mt: 0.5 }}>
                  <Typography
                    variant="caption"
                    fontWeight={600}
                    sx={{
                      color:
                        theme.palette.mode === "dark"
                          ? theme.palette.success.light
                          : theme.palette.success.dark,
                      flexShrink: 0,
                    }}
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
                    {correctMap[q.questionId]}
                  </Typography>
                </Box>
              )}
            </Box>
          );
        },
      )}
      {drillDown.feedback && Object.keys(drillDown.feedback).length > 0 && (
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.background.paper,
            mt: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Feedback
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {typeof drillDown.feedback.feedbackText === "string"
              ? drillDown.feedback.feedbackText
              : ""}
          </Typography>
        </Box>
      )}
    </Box>
  );
};
