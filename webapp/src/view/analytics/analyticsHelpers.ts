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

import type { VisitorUser } from "@slices/analyticsSlice/analytics";


export interface TrendDataPoint {
  date: string;
  startDate?: string;
  formattedDate?: string;
  totalViews: number;
  uniqueViews: number;
  timeSpentSeconds: number;
  totalEngagements: number;
  avgActionsPerVisit: number;
}

export interface MetricConfig {
  id: keyof Omit<TrendDataPoint, "date" | "startDate" | "formattedDate">;
  label: string;
  color: string;
  yAxisId: "left" | "right";
  formatValue: (val: number) => string;
}

export const ALL_METRIC_OPTIONS: MetricConfig[] = [
  {
    id: "totalViews",
    label: "Total Views",
    color: "#0288d1", // Bright Sky Blue
    yAxisId: "left",
    formatValue: (v) => `${v}`,
  },
  {
    id: "uniqueViews",
    label: "Unique Visitors",
    color: "#e91e63", // High-Contrast Magenta Pink
    yAxisId: "left",
    formatValue: (v) => `${v}`,
  },
  {
    id: "timeSpentSeconds",
    label: "Time Spent on Platform",
    color: "#ed6c02", // Deep Orange
    yAxisId: "right", // Mapped to Right Y-Axis
    formatValue: (seconds) => {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    },
  },
  {
    id: "totalEngagements",
    label: "Total Actions Taken",
    color: "#2e7d32", // Forest Green
    yAxisId: "left",
    formatValue: (v) => `${v}`,
  },
  {
    id: "avgActionsPerVisit",
    label: "Avg Actions Per Visit",
    color: "#9c27b0", // Deep Purple
    yAxisId: "left",
    formatValue: (v) => Number(v || 0).toFixed(1),
  },
];

// Prod launch date threshold (Aug 21, 2026)
const PROD_LAUNCH_STR = "2026-08-21";

/**
 * Validates that a string is strictly formatted as YYYY-MM-DD and represents a real calendar date.
 * Rejects out-of-range dates (e.g. 2026-08-32, 2026-02-29) before Date constructor normalization.
 */
const isValidCalendarDate = (dateStr: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dateObj = new Date(year, month - 1, day);
  return (
    dateObj.getFullYear() === year &&
    dateObj.getMonth() === month - 1 &&
    dateObj.getDate() === day
  );
};

// Timezone-safe local date parser with strict Prod Launch Cutoff (Aug 21, 2026)
export const toChartPoints = (trendData: TrendDataPoint[], compactLabels: boolean) => {
  const filteredTrendData = trendData.filter((item) => {
    if (!item.date || typeof item.date !== "string" || item.date.trim() === "") {
      return false;
    }
    const checkDate = (item.startDate || item.date).trim().split("T")[0];

    if (isValidCalendarDate(checkDate)) {
      return checkDate >= PROD_LAUNCH_STR;
    }
    return false;
  });

  const isWideRange = filteredTrendData.length > 14;

  return filteredTrendData.map((item) => {
    if (!item.date) return { ...item, displayDate: "N/A", formattedDate: "N/A" };

    const cleanDateStr = (item.startDate || item.date).split("T")[0];
    const parts = cleanDateStr.split("-").map(Number);

    // Only parse YYYY-MM-DD daily date strings
    let parsedDate: Date | null = null;
    if (parts.length === 3 && !parts.some(isNaN) && isValidCalendarDate(cleanDateStr)) {
      parsedDate = new Date(parts[0], parts[1] - 1, parts[2]);
    }

    if (parsedDate && !isNaN(parsedDate.getTime()) && isValidCalendarDate(cleanDateStr)) {
      return {
        ...item,
        displayDate: parsedDate.toLocaleDateString("en-US", {
          weekday: isWideRange || compactLabels ? undefined : "short",
          month: "short",
          day: "numeric",
        }),
        formattedDate:
          item.formattedDate ||
          parsedDate.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
      };
    }

    // Pre-formatted aggregation strings (weekly, monthly, quarterly)
    return {
      ...item,
      displayDate: item.date,
      formattedDate: item.formattedDate || item.date,
    };
  });
};

// Visitor lists can arrive as a JSON string, plain emails or {email, name} objects.
export const normalizeVisitors = (visitors: unknown): VisitorUser[] => {
  let parsedVisitors: unknown = visitors;
  if (typeof parsedVisitors === "string") {
    try {
      parsedVisitors = JSON.parse(parsedVisitors);
    } catch {
      parsedVisitors = [];
    }
  }

  if (!Array.isArray(parsedVisitors)) return [];

  return parsedVisitors
    .map((v: unknown) => {
      if (typeof v === "string") {
        return { email: v, name: v.split("@")[0] };
      }
      const visitor = (v ?? {}) as Partial<VisitorUser>;
      return { email: visitor.email || "", name: visitor.name || visitor.email?.split("@")[0] || "" };
    })
    .filter((v) => Boolean(v.email));
};

export interface ExportVisitorGroup {
  label: string;
  visitors: VisitorUser[];
}

export interface ExportSection {
  marker: number;
  title: string;
  lines?: string[];
  cardFilters?: string[];
  visitorGroups?: ExportVisitorGroup[];
  table?: { columns: string[]; rows: string[][] };
}

export interface FilterRoute {
  route_id: number;
  parent_id: number | null;
  route_path: string;
  label: string;
}

interface FilterFields {
  startDate?: string;
  endDate?: string;
  region?: string;
  team?: string;
  userEmail?: string;
  pageRoute?: string;
}

const splitList = (value?: string) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const formatFilterDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

const describeRoute = (path: string, routes: FilterRoute[]) => {
  const route = routes.find((r) => r.route_path === path);
  if (!route) return path;
  const labels = [route.label];
  let parentId = route.parent_id;
  const seen = new Set<number>([route.route_id]);
  while (parentId != null && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = routes.find((r) => r.route_id === parentId);
    if (!parent) break;
    labels.unshift(parent.label);
    parentId = parent.parent_id;
  }
  return `${labels.join(" > ")} (${path})`;
};

export const describeFilters = (filters: FilterFields, routes: FilterRoute[]): string[] => {
  const regions = splitList(filters.region);
  const teams = splitList(filters.team);
  const users = splitList(filters.userEmail);
  const start = filters.startDate?.trim();
  const end = filters.endDate?.trim();

  let dates = "All dates";
  if (start && end) dates = `${formatFilterDate(start)} – ${formatFilterDate(end)}`;
  else if (start) dates = `From ${formatFilterDate(start)}`;
  else if (end) dates = `Until ${formatFilterDate(end)}`;

  return [
    `Page: ${filters.pageRoute?.trim() ? describeRoute(filters.pageRoute.trim(), routes) : "All pages"}`,
    `Dates: ${dates}`,
    `Regions: ${regions.length > 0 ? regions.join(", ") : "All regions"}`,
    `Teams: ${teams.length > 0 ? teams.join(", ") : "All teams"}`,
    `Users: ${users.length > 0 ? users.join(", ") : "All users"}`,
  ];
};

const normalizeFilterFields = (filters: FilterFields) => ({
  startDate: filters.startDate?.trim() || "",
  endDate: filters.endDate?.trim() || "",
  region: splitList(filters.region).join(","),
  team: splitList(filters.team).join(","),
  userEmail: splitList(filters.userEmail).join(","),
  pageRoute: filters.pageRoute?.trim() || "",
});

export const sameFilters = (a: FilterFields, b: FilterFields) =>
  JSON.stringify(normalizeFilterFields(a)) === JSON.stringify(normalizeFilterFields(b));

export const formatTimezone = (offsetMinutes: number) => {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `GMT${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
};
