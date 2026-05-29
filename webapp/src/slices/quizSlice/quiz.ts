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

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { AppConfig } from "@config/config";
import { enqueueSnackbarMessage } from "@slices/commonSlice/common";
import { ApiService } from "@utils/apiService";

import {
  QuizAdmin,
  QuizAnswerOption,
  QuizPayload,
  QuizQuestion,
  QuizResult,
  QuizWithStatus,
  SubmittedAnswer,
  UserAnswerPayload,
  UserQuizAnalytics,
} from "@/types/types";
import { EmployeeSearchPayload, EmployeeSuggestion } from "../../types/types";

interface QuizUserDetailsResponse {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  thumbnail?: string;
  department?: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

interface QuizState {
  quizzes: QuizWithStatus[];
  quizzesStatus: "idle" | "loading" | "success" | "failed";
  quizzesError?: string;

  questions: QuizQuestion[];
  questionsStatus: "idle" | "loading" | "success" | "failed";
  answerOptions: Record<number, QuizAnswerOption[]>;

  result: QuizResult | null;
  resultStatus: "idle" | "loading" | "success" | "failed";
  resultError?: string;

  submitStatus: "idle" | "loading" | "success" | "failed";
  submitError?: string;

  createStatus: "idle" | "loading" | "success" | "failed";
  createError?: string;

  adminQuizzes: QuizAdmin[];
  adminQuizzesStatus: "idle" | "loading" | "success" | "failed";

  analytics: UserQuizAnalytics[];
  analyticsStatus: "idle" | "loading" | "success" | "failed";

  drillDown: { answers: SubmittedAnswer[]; feedback: Record<string, unknown> } | null;
  drillDownStatus: "idle" | "loading" | "success" | "failed";

  assignStatus: "idle" | "loading" | "success" | "failed";
  assignError?: string;
}

const initialState: QuizState = {
  quizzes: [],
  quizzesStatus: "idle",
  questions: [],
  questionsStatus: "idle",
  answerOptions: {},
  result: null,
  resultStatus: "idle",
  submitStatus: "idle",
  createStatus: "idle",
  adminQuizzes: [],
  adminQuizzesStatus: "idle",
  analytics: [],
  analyticsStatus: "idle",
  drillDown: null,
  drillDownStatus: "idle",
  assignStatus: "idle",
};

export const fetchQuizzes = createAsyncThunk("quiz/fetchQuizzes", async (_, { dispatch }) => {
  return new Promise<QuizWithStatus[]>((resolve, reject) => {
    ApiService.getInstance()
      .get(AppConfig.serviceUrls.quizzes)
      .then(async (resp) => {
        const quizzes = resp.data as QuizWithStatus[];

        const quizzesWithStatus = await Promise.all(
          quizzes.map(async (quiz) => {
            try {
              const resultResp = await ApiService.getInstance().get(
                AppConfig.serviceUrls.getQuizResult(quiz.quizId),
              );
              const result = resultResp.data as QuizResult;

              if (!result.completed) {
                return {
                  ...quiz,
                  status: "not_started" as const,
                };
              }

              return {
                ...quiz,
                status: result.passed ? ("passed" as const) : ("failed" as const),
                scorePercentage: Number(result.scorePercentage),
              };
            } catch {
              return {
                ...quiz,
                status: "not_started" as const,
              };
            }
          }),
        );

        resolve(quizzesWithStatus);
      })
      .catch((error) => {
        dispatch(
          enqueueSnackbarMessage({
            message: "Failed to load quizzes",
            type: "error",
            anchorOrigin: { vertical: "bottom", horizontal: "right" },
          }),
        );
        reject(error);
      });
  });
});

export const fetchAdminQuizzes = createAsyncThunk(
  "quiz/fetchAdminQuizzes",
  async (_, { dispatch }) => {
    return new Promise<QuizAdmin[]>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.adminQuizzes)
        .then((resp) => {
          resolve(resp.data);
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to load quizzes",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const fetchEmployeesByEmails = createAsyncThunk(
  "quiz/fetchEmployeesByEmails",
  async (emails: string[]) => {
    const responses = await Promise.all(
      emails.map(async (email) => {
        if (!email) return { email, team: "—", subteam: "—" };
        try {
          const resp = await ApiService.getInstance().get(
            AppConfig.serviceUrls.getEmployeeInfo + encodeURIComponent(email),
          );
          const data = resp?.data ?? {};
          return { email, team: data.team ?? "—", subteam: data.subTeam ?? "—" };
        } catch {
          return { email, team: "—", subteam: "—" };
        }
      }),
    );

    return responses;
  },
);

export const createQuiz = createAsyncThunk(
  "quiz/createQuiz",
  async (payload: QuizPayload, { dispatch }) => {
    return new Promise<QuizWithStatus>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.createQuiz, payload)
        .then((resp) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Quiz created successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve({
            ...resp.data,
            status: "not_started" as const,
          });
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to create quiz",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const updateQuiz = createAsyncThunk(
  "quiz/updateQuiz",
  async ({ quizId, payload }: { quizId: number; payload: Partial<QuizPayload> }, { dispatch }) => {
    return new Promise<void>((resolve, reject) => {
      ApiService.getInstance()
        .patch(AppConfig.serviceUrls.updateQuiz(quizId), payload)
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Quiz updated successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve();
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to update quiz",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const deleteQuiz = createAsyncThunk(
  "quiz/deleteQuiz",
  async (quizId: number, { dispatch }) => {
    return new Promise<number>((resolve, reject) => {
      ApiService.getInstance()
        .delete(AppConfig.serviceUrls.deleteQuiz(quizId))
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Quiz deleted successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve(quizId);
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to delete quiz",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const fetchAssignedQuizUsers = createAsyncThunk(
  "quiz/fetchAssignedQuizUsers",
  async (userIds: number[]) => {
    if (userIds.length === 0) {
      return [];
    }

    const responses = await Promise.all(
      userIds.map((userId) =>
        ApiService.getInstance()
          .get(AppConfig.serviceUrls.getUserInfo + userId)
          .catch(() => null),
      ),
    );

    return responses
      .filter((resp) => resp !== null)
      .map((resp) => {
        const userData = (resp as { data: QuizUserDetailsResponse }).data;
        return {
          userId: userData.userId,
          firstName: userData.firstName,
          lastName: userData.lastName,
          workEmail: userData.email,
          employeeThumbnail: userData.thumbnail,
          department: userData.department || "",
        };
      });
  },
);

export const fetchQuizEmployeeSuggestions = createAsyncThunk(
  "quiz/fetchQuizEmployeeSuggestions",
  async ({
    searchQuery,
    excludedEmails = [],
  }: EmployeeSearchPayload & { excludedEmails?: string[] }) => {
    if (searchQuery.length < 2) {
      return [];
    }

    const response = await ApiService.getInstance().post(AppConfig.serviceUrls.searchEmployees, {
      searchQuery,
    });

    return (response.data || []).filter(
      (employee: EmployeeSuggestion) => !excludedEmails.includes(employee.workEmail),
    );
  },
);

export const fetchQuizUserByEmail = createAsyncThunk(
  "quiz/fetchQuizUserByEmail",
  async (email: string) => {
    const response = await ApiService.getInstance().get(
      AppConfig.serviceUrls.getEmployeeInfo + encodeURIComponent(email),
    );

    if (response.data) {
      const userData = response.data;
      return {
        userId: userData.userId,
        firstName: userData.firstName,
        lastName: userData.lastName,
        workEmail: userData.workEmail || email,
        employeeThumbnail: userData.employeeThumbnail,
        department: userData.department || "",
      };
    }

    return null;
  },
);

export const assignUsersToQuiz = createAsyncThunk(
  "quiz/assignUsers",
  async (
    {
      quizId,
      userIds,
      timeLimitMinutes,
      notifyUserIds,
    }: { quizId: number; userIds: number[]; timeLimitMinutes?: number; notifyUserIds?: number[] },
    { dispatch },
  ) => {
    return new Promise<void>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.assignUsersToQuiz(quizId), { userIds, timeLimitMinutes, notifyUserIds })
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Users assigned successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve();
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to assign users",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const unassignUsersFromQuiz = createAsyncThunk(
  "quiz/unassignUsers",
  async ({ quizId, userIds }: { quizId: number; userIds: number[] }, { dispatch }) => {
    return new Promise<void>((resolve, reject) => {
      ApiService.getInstance()
        .delete(AppConfig.serviceUrls.unassignUsersFromQuiz(quizId), {
          data: { userIds },
        })
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Users unassigned successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve();
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to unassign users",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const publishQuiz = createAsyncThunk(
  "quiz/publish",
  async (quizId: number, { dispatch }) => {
    return new Promise<number>((resolve, reject) => {
      ApiService.getInstance()
        .patch(AppConfig.serviceUrls.updateQuiz(quizId), { status: "PUBLISHED" })
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Quiz published successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve(quizId);
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to publish quiz",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const fetchQuestionsForQuiz = createAsyncThunk(
  "quiz/fetchQuestions",
  async (quizId: number, { dispatch }) => {
    return new Promise<QuizQuestion[]>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.getQuestionsByQuiz(quizId))
        .then((resp) => {
          resolve(resp.data);
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to load questions",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const createQuestion = createAsyncThunk(
  "quiz/createQuestion",
  async (
    { quizId, payload }: { quizId: number; payload: Omit<QuizQuestion, "questionId" | "quizId"> },
    { dispatch },
  ) => {
    return new Promise<void>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.createQuestion(quizId), payload)
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Question created successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve();
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to create question",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const updateQuestion = createAsyncThunk(
  "quiz/updateQuestion",
  async (
    {
      quizId,
      questionId,
      payload,
    }: { quizId: number; questionId: number; payload: Partial<QuizQuestion> },
    { dispatch },
  ) => {
    return new Promise<void>((resolve, reject) => {
      ApiService.getInstance()
        .patch(AppConfig.serviceUrls.updateQuestion(quizId, questionId), payload)
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Question updated successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve();
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to update question",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const deleteQuestion = createAsyncThunk(
  "quiz/deleteQuestion",
  async ({ quizId, questionId }: { quizId: number; questionId: number }, { dispatch }) => {
    return new Promise<{ quizId: number; questionId: number }>((resolve, reject) => {
      ApiService.getInstance()
        .delete(AppConfig.serviceUrls.deleteQuestion(quizId, questionId))
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Question deleted successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve({ quizId, questionId });
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to delete question",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const fetchAnswerOptionsForQuiz = createAsyncThunk(
  "quiz/fetchAnswerOptionsForQuiz",
  async (quizId: number, { dispatch }) => {
    return new Promise<QuizAnswerOption[]>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.getPublicAnswersByQuiz(quizId))
        .then((resp) => {
          resolve(resp.data);
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to load quiz answer options",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const fetchAdminAnswerOptionsForQuiz = createAsyncThunk(
  "quiz/fetchAdminAnswerOptionsForQuiz",
  async (quizId: number, { dispatch }) => {
    return new Promise<QuizAnswerOption[]>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.getAdminAnswersByQuiz(quizId))
        .then((resp) => {
          resolve(resp.data);
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to load quiz answer options",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);


export const createAnswer = createAsyncThunk(
  "quiz/createAnswer",
  async (
    {
      questionId,
      payload,
    }: { questionId: number; payload: Omit<QuizAnswerOption, "answerId" | "questionId"> },
    { dispatch },
  ) => {
    return new Promise<void>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.createAnswer(questionId), payload)
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Answer option created successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve();
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to create answer option",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const updateAnswer = createAsyncThunk(
  "quiz/updateAnswer",
  async (
    {
      questionId,
      answerId,
      payload,
    }: { questionId: number; answerId: number; payload: Partial<QuizAnswerOption> },
    { dispatch },
  ) => {
    return new Promise<void>((resolve, reject) => {
      ApiService.getInstance()
        .patch(AppConfig.serviceUrls.updateAnswer(questionId, answerId), payload)
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Answer option updated successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve();
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to update answer option",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const deleteAnswer = createAsyncThunk(
  "quiz/deleteAnswer",
  async ({ questionId, answerId }: { questionId: number; answerId: number }, { dispatch }) => {
    return new Promise<{ questionId: number; answerId: number }>((resolve, reject) => {
      ApiService.getInstance()
        .delete(AppConfig.serviceUrls.deleteAnswer(questionId, answerId))
        .then(() => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Answer option deleted successfully",
              type: "success",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          resolve({ questionId, answerId });
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to delete answer option",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const submitQuizAnswers = createAsyncThunk(
  "quiz/submit",
  async ({ quizId, answers }: { quizId: number; answers: UserAnswerPayload[] }, { dispatch }) => {
    return new Promise<number>((resolve, reject) => {
      ApiService.getInstance()
        .post(AppConfig.serviceUrls.submitQuiz(quizId), answers)
        .then(() => {
          resolve(quizId);
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to submit quiz",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const fetchQuizResult = createAsyncThunk(
  "quiz/fetchResult",
  async (quizId: number, { dispatch }) => {
    return new Promise<QuizResult>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.getQuizResult(quizId))
        .then((resp) => {
          resolve(resp.data);
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to load quiz result",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const fetchQuizAnalytics = createAsyncThunk(
  "quiz/fetchAnalytics",
  async (quizId: number, { dispatch }) => {
    return new Promise<UserQuizAnalytics[]>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.getQuizAnalytics(quizId))
        .then((resp) => {
          resolve(resp.data);
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to load quiz analytics",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

export const fetchUserDrillDown = createAsyncThunk(
  "quiz/fetchDrillDown",
  async ({ quizId, userId }: { quizId: number; userId: number }, { dispatch }) => {
    return new Promise<{
      answers: SubmittedAnswer[];
      feedback: Record<string, unknown>;
    }>((resolve, reject) => {
      ApiService.getInstance()
        .get(AppConfig.serviceUrls.getUserDrillDown(quizId, userId))
        .then((resp) => {
          resolve(resp.data);
        })
        .catch((error) => {
          dispatch(
            enqueueSnackbarMessage({
              message: "Failed to load user answers",
              type: "error",
              anchorOrigin: { vertical: "bottom", horizontal: "right" },
            }),
          );
          reject(error);
        });
    });
  },
);

const quizSlice = createSlice({
  name: "quiz",
  initialState,
  reducers: {
    resetResult(state) {
      state.result = null;
      state.resultStatus = "idle";
    },
    resetSubmit(state) {
      state.submitStatus = "idle";
      state.submitError = undefined;
    },
    resetCreate(state) {
      state.createStatus = "idle";
      state.createError = undefined;
    },
    resetQuestions(state) {
      state.questions = [];
      state.questionsStatus = "idle";
      state.answerOptions = {};
    },
    resetDrillDown(state) {
      state.drillDown = null;
      state.drillDownStatus = "idle";
    },
    resetAnalytics(state) {
      state.analytics = [];
      state.analyticsStatus = "idle";
    },
    resetAssign(state) {
      state.assignStatus = "idle";
      state.assignError = undefined;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuizzes.pending, (state) => {
        state.quizzesStatus = "loading";
      })
      .addCase(fetchQuizzes.fulfilled, (state, action) => {
        state.quizzesStatus = "success";
        state.quizzes = action.payload;
      })
      .addCase(fetchQuizzes.rejected, (state) => {
        state.quizzesStatus = "failed";
      });

    builder
      .addCase(fetchAdminQuizzes.pending, (state) => {
        state.adminQuizzesStatus = "loading";
      })
      .addCase(fetchAdminQuizzes.fulfilled, (state, action) => {
        state.adminQuizzesStatus = "success";
        state.adminQuizzes = action.payload;
      })
      .addCase(fetchAdminQuizzes.rejected, (state) => {
        state.adminQuizzesStatus = "failed";
      });

    builder
      .addCase(createQuiz.pending, (state) => {
        state.createStatus = "loading";
      })
      .addCase(createQuiz.fulfilled, (state, action) => {
        state.createStatus = "success";
        state.quizzes.push(action.payload);
        state.adminQuizzes.push(action.payload);
      })
      .addCase(createQuiz.rejected, (state, action) => {
        state.createStatus = "failed";
        state.createError = action.error.message;
      });

    builder.addCase(publishQuiz.fulfilled, (state, action) => {
      const quizId = action.payload;
      const adminQuizIndex = state.adminQuizzes.findIndex((q) => q.quizId === quizId);
      if (adminQuizIndex !== -1) {
        state.adminQuizzes[adminQuizIndex].status = "PUBLISHED";
      }
    });

    builder.addCase(deleteQuiz.fulfilled, (state, action) => {
      state.adminQuizzes = state.adminQuizzes.filter((q) => q.quizId !== action.payload);
    });

    builder
      .addCase(fetchQuestionsForQuiz.pending, (state) => {
        state.questionsStatus = "loading";
        state.questions = [];
        state.answerOptions = {};
      })
      .addCase(fetchQuestionsForQuiz.fulfilled, (state, action) => {
        state.questionsStatus = "success";
        state.questions = action.payload;
      })
      .addCase(fetchQuestionsForQuiz.rejected, (state) => {
        state.questionsStatus = "failed";
      });

    builder.addCase(deleteQuestion.fulfilled, (state, action) => {
      state.questions = state.questions.filter((q) => q.questionId !== action.payload.questionId);
    });

    builder.addCase(fetchAnswerOptionsForQuiz.fulfilled, (state, action) => {
      const answersByQuestion: Record<number, QuizAnswerOption[]> = {};
      action.payload.forEach((ans) => {
        if (!answersByQuestion[ans.questionId]) {
          answersByQuestion[ans.questionId] = [];
        }
        answersByQuestion[ans.questionId].push(ans);
      });
      state.answerOptions = {
        ...state.answerOptions,
        ...answersByQuestion,
      };
    });

    builder.addCase(deleteAnswer.fulfilled, (state, action) => {
      const { questionId, answerId } = action.payload;
      if (state.answerOptions[questionId]) {
        state.answerOptions[questionId] = state.answerOptions[questionId].filter(
          (a) => a.answerId !== answerId,
        );
      }
    });

    builder
      .addCase(submitQuizAnswers.pending, (state) => {
        state.submitStatus = "loading";
      })
      .addCase(submitQuizAnswers.fulfilled, (state) => {
        state.submitStatus = "success";
      })
      .addCase(submitQuizAnswers.rejected, (state) => {
        state.submitStatus = "failed";
      });

    builder
      .addCase(fetchQuizResult.pending, (state) => {
        state.resultStatus = "loading";
      })
      .addCase(fetchQuizResult.fulfilled, (state, action) => {
        state.resultStatus = "success";
        state.result = action.payload;
        const quizId = action.meta.arg;
        const idx = state.quizzes.findIndex((q) => q.quizId === quizId);
        if (idx !== -1) {
          if (!action.payload.completed) {
            state.quizzes[idx].status = "not_started";
          } else {
            state.quizzes[idx].status = action.payload.passed ? "passed" : "failed";
          }
          state.quizzes[idx].scorePercentage = Number(action.payload.scorePercentage);
        }
      })
      .addCase(fetchQuizResult.rejected, (state) => {
        state.resultStatus = "failed";
      });

    builder
      .addCase(fetchQuizAnalytics.pending, (state) => {
        state.analyticsStatus = "loading";
        state.analytics = [];
      })
      .addCase(fetchQuizAnalytics.fulfilled, (state, action) => {
        state.analyticsStatus = "success";
        state.analytics = action.payload;
      })
      .addCase(fetchQuizAnalytics.rejected, (state) => {
        state.analyticsStatus = "failed";
      });

    builder
      .addCase(fetchUserDrillDown.pending, (state) => {
        state.drillDownStatus = "loading";
      })
      .addCase(fetchUserDrillDown.fulfilled, (state, action) => {
        state.drillDownStatus = "success";
        state.drillDown = action.payload;
      })
      .addCase(fetchUserDrillDown.rejected, (state) => {
        state.drillDownStatus = "failed";
      });

    builder
      .addCase(assignUsersToQuiz.pending, (state) => {
        state.assignStatus = "loading";
      })
      .addCase(assignUsersToQuiz.fulfilled, (state) => {
        state.assignStatus = "success";
      })
      .addCase(assignUsersToQuiz.rejected, (state, action) => {
        state.assignStatus = "failed";
        state.assignError = action.error.message;
      });
  },
});

export const {
  resetResult,
  resetSubmit,
  resetCreate,
  resetQuestions,
  resetDrillDown,
  resetAnalytics,
  resetAssign,
} = quizSlice.actions;

export default quizSlice.reducer;
