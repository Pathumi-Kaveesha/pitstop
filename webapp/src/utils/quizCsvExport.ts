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

import { UserQuizAnalytics } from "@/types/types";
import { parseDateAsUtc } from "./utils";

const parseQuestionAnswers = (summary: string | undefined) => {
  const answers = new Map<number, string>();

  if (!summary || summary === "N/A") {
    return answers;
  }

  try {
    const parsed = JSON.parse(summary) as Array<Record<string, string>>;

    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        Object.entries(item).forEach(([questionKey, response]) => {
          const questionNumber = Number(questionKey.replace(/^Q/i, ""));

          if (!Number.isNaN(questionNumber)) {
            answers.set(questionNumber, response);
          }
        });
      });
    }
  } catch {
    answers.set(1, summary);
  }

  return answers;
};

export const exportAnalyticsToCSV = (
  analytics: UserQuizAnalytics[],
  quizTitle: string,
  employeeInfos: { email: string; team: string; subteam: string }[] = [],
  answerSummaries: Record<number, string> = {},
  totalQuestions: number = 0,
  isQuizOverdue: boolean = false,
  quizDueDate?: string,
) => {
  const questionHeaders = Array.from({ length: totalQuestions }, (_, index) => `Q${index + 1}`);
  const headers = [
    "Name",
    "Email",
    "Team",
    "Region",
    "Score (%)",
    "Status",
    "Submitted Date",
    ...questionHeaders,
  ];

  const parsedDueDate = quizDueDate ? parseDateAsUtc(quizDueDate) : null;

  const rows = analytics.map((row) => {
    const emp = employeeInfos.find((e) => e.email === row.userEmail) || {
      team: "—",
      subteam: "",
      email: "",
    };
    const region = emp.subteam && emp.subteam !== "—" ? emp.subteam : "N/A";
    const attempted = !!row.submittedAt;
    const isSubmissionLate =
      attempted &&
      !!parsedDueDate &&
      !!row.submittedAt &&
      new Date(row.submittedAt) > parsedDueDate;
    const questionAnswers = parseQuestionAnswers(answerSummaries[row.userId]);

    const status = attempted
      ? `${row.passed ? "Passed" : "Failed"}${isSubmissionLate ? " (Overdue)" : ""}`
      : isQuizOverdue
        ? "Overdue"
        : "N/A";
    return [
      row.userName || "—",
      row.userEmail || "—",
      emp.team || "N/A",
      region,
      attempted ? row.scorePercentage : "N/A",
      status,
      row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "N/A",
      ...questionHeaders.map((_, index) => {
        if (!attempted) {
          return "N/A";
        }

        const questionNumber = index + 1;
        const incorrectAnswer = questionAnswers.get(questionNumber);

        return incorrectAnswer ? `Incorrect: ${incorrectAnswer}` : "Correct";
      }),
    ];
  });

  const csvContent = [
    headers.map((h) => `"${h}"`).join(","),
    ...rows.map((r) =>
      r
        .map((cell) => {
          const cellStr = cell === null || cell === undefined ? "" : String(cell);
          const escaped = cellStr.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  const fileName = `${quizTitle}_analytics_${new Date().toISOString().split("T")[0]}.csv`;
  try {
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
  } finally {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};
