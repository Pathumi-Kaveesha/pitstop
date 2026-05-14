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

export const exportAnalyticsToCSV = (
  analytics: UserQuizAnalytics[],
  quizTitle: string,
  employeeInfos: { email: string; team: string; location: string }[] = [],
  answerSummaries: Record<number, string> = {},
  isQuizOverdue: boolean = false,
) => {
  const headers = [
    "Name",
    "Email",
    "Team",
    "Region",
    "Score (%)",
    "Status",
    "Submitted Date",
    "Answers",
  ];

  const rows = analytics.map((row, idx) => {
    const emp = employeeInfos[idx] || { team: "—", location: "—", email: "" };
    const attempted = !!row.submittedAt;
    const status = attempted
      ? row.passed
        ? "Passed"
        : "Failed"
      : isQuizOverdue
        ? "Overdue"
        : "N/A";
    return [
      row.userName || "—",
      row.userEmail || "—",
      emp.team,
      emp.location,
      attempted ? row.scorePercentage : "N/A",
      status,
      row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "—",
      attempted ? answerSummaries[row.userId] || "N/A" : "N/A",
    ];
  });

  const csvContent = [
    headers.map((h) => `"${h}"`).join(","),
    ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  const fileName = `${quizTitle}_analytics_${new Date().toISOString().split("T")[0]}.csv`;

  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
