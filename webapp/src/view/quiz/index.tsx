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
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import BarChartIcon from "@mui/icons-material/BarChart";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";

import React, { useCallback, useEffect, useState } from "react";

import DeleteDialogBox from "@components/dialogs/DeleteDialogBox";
import QuizDialogBox from "@components/dialogs/QuizDialogBox";
import {
  createQuiz,
  fetchAdminQuizzes,
  fetchAnswerOptions,
  fetchAssignedQuizUsers,
  fetchEmployeesByEmails,
  fetchQuestionsForQuiz,
  fetchQuizAnalytics,
  fetchUserDrillDown,
  resetAnalytics,
  resetDrillDown,
  updateQuiz,
} from "@slices/quizSlice/quiz";
import { useAppDispatch, useAppSelector } from "@slices/store";
import { RootState } from "@slices/store";

import PublishDialogBox from "@components/dialogs/PublishDialogBox";
import type {
  QuizAdmin,
  QuizAnswerOption,
  QuizQuestion,
  UserQuizAnalytics,
  QuestionType,
  AnswerOption,
  QuestionFormData,
  AssignedQuizUser,
} from "@/types/types";
import { ADMIN_QUIZZES_PER_PAGE } from "@config/constant";
import AssignQuizModal from "./AssignQuizModal";
import { exportAnalyticsToCSV } from "@utils/quizCsvExport";
import { emptyQuestion, toDateTimeLocalValue } from "@utils/utils";
import { QuizAnswerAnalysis } from "./components/QuizAnswerAnalysis";

const QuizAdminDashboard: React.FC = () => {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const adminQuizzes = useAppSelector((s: RootState) => s.quiz.adminQuizzes);
  const adminQuizzesStatus = useAppSelector((s: RootState) => s.quiz.adminQuizzesStatus);
  const analytics = useAppSelector((s: RootState) => s.quiz.analytics);
  const analyticsStatus = useAppSelector((s: RootState) => s.quiz.analyticsStatus);
  const drillDown = useAppSelector((s: RootState) => s.quiz.drillDown);
  const drillDownStatus = useAppSelector((s: RootState) => s.quiz.drillDownStatus);
  const [analyticsQuizId, setAnalyticsQuizId] = useState<number | null>(null);
  const [analyticsQuizTitle, setAnalyticsQuizTitle] = useState("");
  const [assignedUsers, setAssignedUsers] = useState<AssignedQuizUser[]>([]);
  const [drillDownUser, setDrillDownUser] = useState<{ userId: number; name: string } | null>(null);
  const [assignQuiz, setAssignQuiz] = useState<QuizAdmin | null>(null);
  const [quizDialogOpen, setQuizDialogOpen] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState<QuizAdmin | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDueDate, setFormDueDate] = useState("");
  const [formPassingScore, setFormPassingScore] = useState<number | "">("");
  const [formQuestions, setFormQuestions] = useState<QuestionFormData[]>([emptyQuestion()]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [deleteQuizDialogOpen, setDeleteQuizDialogOpen] = useState(false);
  const [publishQuizDialogOpen, setPublishQuizDialogOpen] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState<{ quizId: number; title: string } | null>(null);
  const [adminQuizzesPage, setAdminQuizzesPage] = useState(1);
  const [adminQuizzesFilter, setAdminQuizzesFilter] = useState<"all" | "PUBLISHED" | "DRAFT">(
    "all",
  );

  const selectedAnalyticsQuiz = adminQuizzes.find((q) => q.quizId === analyticsQuizId);
  const isAnalyticsQuizOverdue =
    !!selectedAnalyticsQuiz?.dueDate && new Date(selectedAnalyticsQuiz.dueDate) < new Date();

  useEffect(() => {
    dispatch(fetchAdminQuizzes());
  }, [dispatch]);

  useEffect(() => {
    setAdminQuizzesPage(1);
  }, [adminQuizzesFilter]);

  const handleOpenAnalytics = (quizId: number, title: string) => {
    setAnalyticsQuizId(quizId);
    setAnalyticsQuizTitle(title);
    dispatch(fetchQuizAnalytics(quizId));
    const quiz = adminQuizzes.find((q) => q.quizId === quizId);
    const userIds: number[] = (quiz?.assignedUserIds ?? []).slice();
    if (userIds.length > 0) {
      dispatch(fetchAssignedQuizUsers(userIds))
        .unwrap()
        .then((users) => setAssignedUsers(users))
        .catch(() => setAssignedUsers([]));
    } else {
      setAssignedUsers([]);
    }
  };

  const handleExportCSV = async () => {
    try {
      const merged = buildMergedAnalytics();
      const emails = merged.map((a) => a.userEmail || "");
      const employeeInfos = await dispatch(fetchEmployeesByEmails(emails)).unwrap();

      const answerSummaryEntries = await Promise.all(
        merged.map(async (row) => {
          if (!row.submittedAt) {
            return [row.userId, "N/A"] as const;
          }

          try {
            const drillDownResult = await dispatch(
              fetchUserDrillDown({ quizId: analyticsQuizId!, userId: row.userId }),
            ).unwrap();
            const answers = drillDownResult.answers ?? [];
            const groupedAnswers = new Map<number, string[]>();

            answers.forEach((answer) => {
              const response = answer.selectedAnswerText || answer.selectedOptionText || "N/A";
              const current = groupedAnswers.get(answer.questionNumber) || [];

              if (!current.includes(response)) {
                current.push(response);
              }

              groupedAnswers.set(answer.questionNumber, current);
            });

            const summary = Array.from(groupedAnswers.entries())
              .sort(
                ([firstQuestionNumber], [secondQuestionNumber]) =>
                  firstQuestionNumber - secondQuestionNumber,
              )
              .map(([questionNumber, responses]) => `Q${questionNumber}: ${responses.join(", ")}`)
              .join(" | ");

            return [row.userId, summary || "N/A"] as const;
          } catch {
            return [row.userId, "N/A"] as const;
          }
        }),
      );

      const answerSummaries = Object.fromEntries(answerSummaryEntries);
      exportAnalyticsToCSV(
        merged,
        analyticsQuizTitle,
        employeeInfos,
        answerSummaries,
        isAnalyticsQuizOverdue,
      );
    } catch (e) {
      console.error("Failed to fetch employee info for CSV export", e);
      const merged = buildMergedAnalytics();
      exportAnalyticsToCSV(merged, analyticsQuizTitle, [], {}, isAnalyticsQuizOverdue);
    }
  };

  const buildMergedAnalytics = useCallback(() => {
    const map = new Map<number, UserQuizAnalytics>();
    analytics.forEach((a) => map.set(a.userId, a));

    const quiz = adminQuizzes.find((q) => q.quizId === analyticsQuizId);
    const totalQuestions = quiz?.totalQuestions;

    const merged: UserQuizAnalytics[] = [];
    assignedUsers.forEach((u) => {
      const existing = map.get(u.userId);
      if (existing) {
        merged.push(existing);
        map.delete(u.userId);
      } else {
        merged.push({
          userId: u.userId,
          userEmail: u.workEmail || "",
          userName: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.workEmail || "",
          totalQuestions: totalQuestions ?? 0,
          answered: 0,
          correctAnswers: 0,
          scorePercentage: 0,
          totalMarks: 0,
          marksObtained: 0,
          completed: 0,
          passed: false,
        } as unknown as UserQuizAnalytics);
      }
    });
    map.forEach((v) => merged.push(v));

    return merged;
  }, [analytics, assignedUsers, adminQuizzes, analyticsQuizId]);

  const handleCloseAnalytics = () => {
    setAnalyticsQuizId(null);
    dispatch(resetAnalytics());
  };

  const handleOpenDrillDown = (userId: number, name: string) => {
    if (!analyticsQuizId) return;
    setDrillDownUser({ userId, name });
    dispatch(fetchUserDrillDown({ quizId: analyticsQuizId, userId }));
  };

  const handleCloseDrillDown = () => {
    setDrillDownUser(null);
    dispatch(resetDrillDown());
  };

  const handleDelete = (quizId: number) => {
    const quiz = adminQuizzes.find((item) => item.quizId === quizId);
    setSelectedQuiz({ quizId, title: quiz?.title ?? "" });
    setDeleteQuizDialogOpen(true);
  };

  const handlePublish = (quizId: number) => {
    const quiz = adminQuizzes.find((item) => item.quizId === quizId);
    setSelectedQuiz({ quizId, title: quiz?.title ?? "" });
    setPublishQuizDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingQuiz(null);
    setFormTitle("");
    setFormDescription("");
    setFormDueDate("");
    setFormPassingScore("");
    setFormQuestions([]);
    setQuizDialogOpen(true);
  };

  const openEditDialog = async (quiz: QuizAdmin) => {
    setEditingQuiz(quiz);
    setFormTitle(quiz.title);
    setFormDescription(quiz.description || "");
    setFormDueDate(quiz.dueDate ? toDateTimeLocalValue(quiz.dueDate) : "");
    setFormPassingScore(quiz.passingScore ?? "");
    setIsLoadingQuestions(true);
    setFormQuestions([]); 
    setQuizDialogOpen(true);
    try {
      const result = await dispatch(fetchQuestionsForQuiz(quiz.quizId)).unwrap();
      const fetched: QuizQuestion[] = Array.isArray(result)
        ? result
        : ((result as { questions?: QuizQuestion[] })?.questions ?? []);
      const answerResults = await Promise.all(
        fetched.map((q: QuizQuestion) =>
          q.questionType === "feedback"
            ? Promise.resolve([])
            : dispatch(fetchAnswerOptions(q.questionId))
                .unwrap()
                .then(
                  (res: { questionId: number; options: QuizAnswerOption[] }) => res.options ?? [],
                )
                .catch(() => []),
        ),
      );

      const mapped: QuestionFormData[] = fetched.map((q: QuizQuestion, idx: number) => {
        const options = answerResults[idx] || [];
        return {
          text: q.questionText,
          type: q.questionType,
          answers:
            options.length > 0
              ? options.map((a: QuizAnswerOption & { isCorrect?: boolean }) => ({
                  text: a.answerText,
                  isCorrect: a.isCorrect ?? false,
                }))
              : [],
          refLinks: Array.isArray(q.refLinks) ? q.refLinks : [],
        };
      });
      setFormQuestions(mapped);
    } catch (err) {
      console.error("Failed to load questions", err);
      setFormQuestions([]);
    } finally {
      setIsLoadingQuestions(false);
    }
  };

  const handleCloseQuizDialog = () => {
    setQuizDialogOpen(false);
    setEditingQuiz(null);
  };

  const handleSaveQuiz = async () => {
    if (
      !formTitle.trim() ||
      !formDueDate ||
      formPassingScore === "" ||
      Number.isNaN(Number(formPassingScore))
    ) {
      return;
    }
    setFormSaving(true);
    try {
      const passingScore = Number(formPassingScore);
      if (editingQuiz) {
        await dispatch(
          updateQuiz({
            quizId: editingQuiz.quizId,
            payload: {
              title: formTitle,
              description: formDescription,
              dueDate: formDueDate ? new Date(formDueDate).toISOString() : undefined,
              passingScore,
              questions: formQuestions,
            },
          }),
        );
      } else {
        await dispatch(
          createQuiz({
            title: formTitle,
            description: formDescription,
            dueDate: formDueDate ? new Date(formDueDate).toISOString() : undefined,
            passingScore,
            assignedUserIds: [],
            questions: formQuestions,
          }),
        );
      }
      await dispatch(fetchAdminQuizzes());
      handleCloseQuizDialog();
    } catch (err) {
      console.error("Failed to save quiz", err);
    } finally {
      setFormSaving(false);
    }
  };

  const updateQuestion = useCallback((idx: number, patch: Partial<QuestionFormData>) => {
    setFormQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  }, []);

  const updateAnswer = useCallback((qIdx: number, aIdx: number, patch: Partial<AnswerOption>) => {
    setFormQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        return { ...q, answers: q.answers.map((a, j) => (j === aIdx ? { ...a, ...patch } : a)) };
      }),
    );
  }, []);

  const setSingleCorrect = useCallback((qIdx: number, aIdx: number) => {
    setFormQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        return { ...q, answers: q.answers.map((a, j) => ({ ...a, isCorrect: j === aIdx })) };
      }),
    );
  }, []);

  const addAnswer = useCallback((qIdx: number) => {
    setFormQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx ? { ...q, answers: [...q.answers, { text: "", isCorrect: false }] } : q,
      ),
    );
  }, []);

  const addRefLink = useCallback((qIdx: number) => {
    setFormQuestions((prev) =>
      prev.map((q, i) => (i === qIdx ? { ...q, refLinks: [...(q.refLinks ?? []), ""] } : q)),
    );
  }, []);

  const updateRefLink = useCallback((qIdx: number, linkIdx: number, value: string) => {
    setFormQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const refLinks = [...(q.refLinks ?? [])];
        refLinks[linkIdx] = value;
        return { ...q, refLinks };
      }),
    );
  }, []);

  const removeRefLink = useCallback((qIdx: number, linkIdx: number) => {
    setFormQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx ? { ...q, refLinks: (q.refLinks ?? []).filter((_, i2) => i2 !== linkIdx) } : q,
      ),
    );
  }, []);

  const removeAnswer = useCallback((qIdx: number, aIdx: number) => {
    setFormQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx ? { ...q, answers: q.answers.filter((_, j) => j !== aIdx) } : q,
      ),
    );
  }, []);

  const addQuestion = () => setFormQuestions((prev) => [...prev, emptyQuestion()]);
  const removeQuestion = (idx: number) =>
    setFormQuestions((prev) => prev.filter((_, i) => i !== idx));

  const changeQuestionType = (idx: number, type: QuestionType) => {
    const needsAnswers = type === "mcq_single" || type === "mcq_multiple" || type === "rating";
    updateQuestion(idx, {
      type,
      answers: needsAnswers
        ? [
            { text: "", isCorrect: type !== "rating" },
            { text: "", isCorrect: false },
          ]
        : [],
    });
  };

  return (
    <Box
      sx={{
        pt: 4,
        pb: 8,
        px: 3,
        minHeight: "100vh",
        backgroundColor:
          theme.palette.mode === "dark"
            ? theme.palette.background.default
            : theme.palette.common.white,
      }}
    >
      <Container maxWidth="lg">
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate("/my-board")}
          sx={{ textTransform: "none", color: theme.palette.text.secondary, mb: 3 }}
        >
          Back to My Board
        </Button>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 4 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 2,
              backgroundColor: `${theme.palette.primary.main}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography fontSize={28}>🎓</Typography>
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={700} color="text.primary">
              Quiz Admin Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {adminQuizzes.length} quizzes
            </Typography>
          </Box>
        </Box>
        <Box
          sx={{
            p: 3,
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.background.paper,
          }}
        >
          <Box
            sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}
          >
            <Typography variant="h6" fontWeight={600} sx={{ color: theme.palette.text.primary }}>
              All quizzes
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={openCreateDialog}
              sx={{ textTransform: "none", color: "white", borderRadius: 8, px: 3 }}
            >
              New quiz
            </Button>
          </Box>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              mb: 3,
              flexWrap: "wrap",
            }}
          >
            {(["all", "PUBLISHED", "DRAFT"] as const).map((f) => {
              const count =
                f === "all"
                  ? adminQuizzes.length
                  : f === "PUBLISHED"
                    ? adminQuizzes.filter((q) => q.status === "PUBLISHED").length
                    : adminQuizzes.filter((q) => q.status !== "PUBLISHED").length;
              const label = {
                all: "All",
                PUBLISHED: "Published",
                DRAFT: "Draft",
              }[f];
              return (
                <Chip
                  key={f}
                  label={`${label} ${count}`}
                  onClick={() => setAdminQuizzesFilter(f)}
                  sx={{
                    cursor: "pointer",
                    backgroundColor:
                      adminQuizzesFilter === f ? theme.palette.primary.main : "transparent",
                    color: adminQuizzesFilter === f ? "#fff" : theme.palette.text.primary,
                    border: `1px solid ${
                      adminQuizzesFilter === f ? theme.palette.primary.main : theme.palette.divider
                    }`,
                    fontWeight: adminQuizzesFilter === f ? 600 : 400,
                  }}
                />
              );
            })}
          </Box>

          {adminQuizzesStatus === "loading" ? (
            <Box sx={{ py: 6, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {(() => {
                const filteredQuizzes = adminQuizzes.filter((q) => {
                  if (adminQuizzesFilter === "all") return true;
                  if (adminQuizzesFilter === "PUBLISHED") return q.status === "PUBLISHED";
                  if (adminQuizzesFilter === "DRAFT") return q.status !== "PUBLISHED";
                  return false;
                });
                const totalPages = Math.ceil(filteredQuizzes.length / ADMIN_QUIZZES_PER_PAGE);
                const startIdx = (adminQuizzesPage - 1) * ADMIN_QUIZZES_PER_PAGE;
                const paginatedQuizzes = filteredQuizzes.slice(
                  startIdx,
                  startIdx + ADMIN_QUIZZES_PER_PAGE,
                );

                return (
                  <>
                    {paginatedQuizzes.map((quiz) => (
                      <Box
                        key={quiz.quizId}
                        sx={{
                          p: 2.5,
                          borderRadius: 2,
                          border: `1px solid ${theme.palette.divider}`,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            {quiz.totalQuestions} questions
                            {quiz.dueDate &&
                              ` · Due ${new Date(quiz.dueDate).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}`}
                          </Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                            <Typography variant="subtitle1" fontWeight={600} color="text.primary">
                              {quiz.title}
                            </Typography>
                            <Chip
                              label={quiz.status === "PUBLISHED" ? "Published" : "Draft"}
                              size="small"
                              sx={{
                                backgroundColor:
                                  quiz.status === "PUBLISHED" ? "#e8f5e9" : "#fff3e0",
                                color: quiz.status === "PUBLISHED" ? "#2e7d32" : "#e65100",
                                fontWeight: 600,
                                fontSize: "0.7rem",
                                height: 20,
                              }}
                            />
                            {!!quiz.dueDate && new Date(quiz.dueDate) < new Date() && (
                              <Chip
                                label="Overdue"
                                size="small"
                                sx={{
                                  backgroundColor: alpha(theme.palette.error.main, 0.12),
                                  color: theme.palette.error.main,
                                  fontWeight: 600,
                                  fontSize: "0.7rem",
                                  height: 20,
                                }}
                              />
                            )}
                          </Box>
                          {quiz.description && (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                maxWidth: 500,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {quiz.description}
                            </Typography>
                          )}
                          {quiz.assignedUserIds && quiz.assignedUserIds.length > 0 && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", mt: 0.5 }}
                            >
                              {quiz.assignedUserIds.length} assigned
                            </Typography>
                          )}
                        </Box>
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0 }}
                        >
                          {quiz.status == "PUBLISHED" && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<PersonAddIcon />}
                              onClick={() => setAssignQuiz(quiz)}
                              sx={{
                                textTransform: "none",
                                borderRadius: 8,
                                borderColor: theme.palette.divider,
                                color: theme.palette.text.primary,
                              }}
                            >
                              Assign
                            </Button>
                          )}
                          {quiz.status == "PUBLISHED" && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<BarChartIcon />}
                              onClick={() => handleOpenAnalytics(quiz.quizId, quiz.title)}
                              sx={{
                                textTransform: "none",
                                borderRadius: 8,
                                borderColor: theme.palette.divider,
                                color: theme.palette.text.primary,
                              }}
                            >
                              Analytics
                            </Button>
                          )}
                          {quiz.status !== "PUBLISHED" && (
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => handlePublish(quiz.quizId)}
                              sx={{
                                textTransform: "none",
                                borderRadius: 8,
                                backgroundColor: theme.palette.primary.main,
                                color: "#fff",
                                "&:hover": {
                                  backgroundColor: theme.palette.primary.dark,
                                },
                              }}
                            >
                              Publish
                            </Button>
                          )}
                          {quiz.status !== "PUBLISHED" && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<EditIcon />}
                              onClick={() => openEditDialog(quiz)}
                              sx={{
                                textTransform: "none",
                                borderRadius: 8,
                                borderColor: theme.palette.divider,
                                color: theme.palette.text.primary,
                              }}
                            >
                              Edit
                            </Button>
                          )}
                          <Button
                            size="small"
                            startIcon={<DeleteOutlineIcon />}
                            onClick={() => handleDelete(quiz.quizId)}
                            sx={{ textTransform: "none", borderRadius: 8, color: "#c62828" }}
                          >
                            Delete
                          </Button>
                        </Box>
                      </Box>
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
                          page={adminQuizzesPage}
                          onChange={(_, page) => {
                            setAdminQuizzesPage(page);
                          }}
                          color="primary"
                        />
                      </Box>
                    )}
                  </>
                );
              })()}
            </Box>
          )}
        </Box>
      </Container>

      <QuizDialogBox
        open={quizDialogOpen}
        editingQuiz={editingQuiz}
        formTitle={formTitle}
        setFormTitle={setFormTitle}
        formDescription={formDescription}
        setFormDescription={setFormDescription}
        formDueDate={formDueDate}
        setFormDueDate={setFormDueDate}
        formPassingScore={formPassingScore}
        setFormPassingScore={setFormPassingScore}
        formQuestions={formQuestions}
        isLoadingQuestions={isLoadingQuestions}
        formSaving={formSaving}
        onClose={handleCloseQuizDialog}
        onSave={handleSaveQuiz}
        onAddQuestion={addQuestion}
        onRemoveQuestion={removeQuestion}
        onChangeQuestionType={changeQuestionType}
        onUpdateQuestion={updateQuestion}
        onUpdateAnswer={updateAnswer}
        onSetSingleCorrect={setSingleCorrect}
        onAddAnswer={addAnswer}
        onRemoveAnswer={removeAnswer}
        onAddRefLink={addRefLink}
        onUpdateRefLink={updateRefLink}
        onRemoveRefLink={removeRefLink}
      />

      <DeleteDialogBox
        type="quiz"
        open={deleteQuizDialogOpen}
        handleClose={() => {
          setDeleteQuizDialogOpen(false);
          setSelectedQuiz(null);
        }}
        quizId={selectedQuiz?.quizId}
      />

      <PublishDialogBox
        open={publishQuizDialogOpen}
        handleClose={() => {
          setPublishQuizDialogOpen(false);
          setSelectedQuiz(null);
        }}
        quizId={selectedQuiz?.quizId}
        quizTitle={selectedQuiz?.title}
      />

      <Dialog
        open={!!analyticsQuizId}
        onClose={handleCloseAnalytics}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            backgroundColor: isDarkMode ? theme.palette.grey[900] : theme.palette.background.paper,
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `1px solid ${theme.palette.divider}`,
            pb: 1.5,
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            {analyticsQuizTitle} — Analytics
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {(analytics.length > 0 || assignedUsers.length > 0) && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={handleExportCSV}
                sx={{
                  textTransform: "none",
                  borderRadius: 1,
                  borderColor: theme.palette.divider,
                  color: theme.palette.text.primary,
                }}
              >
                Export CSV
              </Button>
            )}
            <IconButton onClick={handleCloseAnalytics}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {analyticsStatus === "loading" ? (
            <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            (() => {
              const merged = buildMergedAnalytics();
              if (merged.length === 0) {
                return (
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                    No submissions or assigned users.
                  </Typography>
                );
              }

              return (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell align="center">Score</TableCell>
                      <TableCell align="center">Status</TableCell>
                      <TableCell align="center">Submitted</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {merged.map((row) => (
                      <TableRow
                        key={row.userId}
                        hover
                        sx={{ cursor: row.submittedAt ? "pointer" : "default" }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {row.userName || "—"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.userEmail || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" fontWeight={600}>
                            {row.submittedAt
                              ? row.scorePercentage !== undefined && row.scorePercentage !== null
                                ? `${row.scorePercentage}%`
                                : "N/A"
                              : "N/A"}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          {row.submittedAt ? (
                            <Chip
                              label={row.passed ? "Passed" : "Failed"}
                              size="small"
                              sx={{
                                backgroundColor: row.passed
                                  ? isDarkMode
                                    ? alpha(theme.palette.success.main, 0.18)
                                    : "#e8f5e9"
                                  : isDarkMode
                                    ? alpha(theme.palette.error.main, 0.18)
                                    : "#ffebee",
                                color: row.passed
                                  ? theme.palette.success.main
                                  : theme.palette.error.main,
                                fontWeight: 500,
                              }}
                            />
                          ) : isAnalyticsQuizOverdue ? (
                            <Chip
                              label="Overdue"
                              size="small"
                              sx={{
                                backgroundColor: isDarkMode
                                  ? alpha(theme.palette.error.main, 0.18)
                                  : "#ffebee",
                                color: theme.palette.error.main,
                                fontWeight: 600,
                              }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              N/A
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="caption" color="text.secondary">
                            {row.submittedAt
                              ? new Date(row.submittedAt).toLocaleDateString()
                              : "N/A"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() =>
                              row.submittedAt && handleOpenDrillDown(row.userId, row.userName)
                            }
                            disabled={!row.submittedAt}
                            sx={{
                              textTransform: "none",
                              color: theme.palette.primary.main,
                              fontSize: "0.75rem",
                            }}
                          >
                            View answers
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              );
            })()
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!drillDownUser}
        onClose={handleCloseDrillDown}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            backgroundColor: isDarkMode ? theme.palette.grey[900] : theme.palette.background.paper,
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: `1px solid ${theme.palette.divider}`,
            pb: 1.5,
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            {drillDownUser?.name}'s Answers
          </Typography>
          <IconButton onClick={handleCloseDrillDown}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {drillDownStatus === "loading" ? (
            <Box sx={{ py: 4, display: "flex", justifyContent: "center" }}>
              <CircularProgress />
            </Box>
          ) : drillDown ? (
            <QuizAnswerAnalysis drillDown={drillDown} dispatch={dispatch} />
          ) : null}
        </DialogContent>
      </Dialog>
      <AssignQuizModal open={!!assignQuiz} quiz={assignQuiz} onClose={() => setAssignQuiz(null)} />
    </Box>
  );
};

export default QuizAdminDashboard;
