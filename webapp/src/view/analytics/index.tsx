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

import React, { useEffect, useState, useMemo } from "react";
import {
  Box,
  Container,
  Typography,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  TextField,
  Button,
  Alert,
  Tooltip,
  IconButton,
  Popover,
  ToggleButton,
  ToggleButtonGroup,
  Snackbar,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import BarChartIcon from "@mui/icons-material/BarChart";
import VisibilityIcon from "@mui/icons-material/Visibility";
import TimerIcon from "@mui/icons-material/Timer";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import FilterListIcon from "@mui/icons-material/FilterList";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PublicIcon from "@mui/icons-material/Public";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import PreviewIcon from "@mui/icons-material/Preview";
import PeopleIcon from "@mui/icons-material/People";
import RefreshIcon from "@mui/icons-material/Refresh";
import TouchAppIcon from "@mui/icons-material/TouchApp";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { purple } from "@mui/material/colors";
import { useAppDispatch, useAppSelector } from "@slices/store";
import {
  fetchAnalyticsSummary,
  fetchAnalyticsTrends,
  fetchTopContent,
  fetchLeaderboard,
  fetchRegionalTimeSpent,
  fetchPeakActivityTimes,
  fetchTopSearches,
  clearTrendsOverride,
  AnalyticsFilterParams,
  DailyTrendMetric,
} from "@slices/analyticsSlice/analytics";
import { ApiService } from "@utils/apiService";
import { AppConfig } from "@config/config";
import { UserEmailAutocomplete } from "../../component/common/UserEmailAutocomplete";
import AnalyticsTrendsChart, { TrendDataPoint } from "../analytics/AnalyticsTrendsChart";
import {
  CascadingPageRouteSelector,
  RouteOption,
} from "../analytics/CascadingPageRouteSelector";

export type TrendGranularity = "daily" | "weekly" | "monthly" | "quarterly";

const AVAILABLE_REGIONS = [
  "WSO2 Digital",
  "NA",
  "ME",
  "APAC",
  "AFRICA",
  "LATAM",
  "EU",
  "UK",
];

interface RawRouteResponse {
  route_id?: number;
  routeId?: number;
  id?: number;
  parent_id?: number | null;
  parentId?: number | null;
  routePath?: string;
  route_path?: string;
  path?: string;
  menuItem?: string;
  menu_item?: string;
  title?: string;
  label?: string;
}

interface CardFilterPopoverProps {
  onApply: (filters: AnalyticsFilterParams) => void;
  onReset: () => void;
  globalFilters: AnalyticsFilterParams;
  mainRoutes: RouteOption[];
}

const CardFilterPopover: React.FC<CardFilterPopoverProps> = ({
  onApply,
  onReset,
  globalFilters,
  mainRoutes,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [regions, setRegions] = useState<string[]>(
    globalFilters.region
      ? globalFilters.region.split(",").map((r) => r.trim()).filter(Boolean)
      : []
  );
  const [userEmails, setUserEmails] = useState<string[]>(
    globalFilters.userEmail
      ? globalFilters.userEmail.split(",").map((e) => e.trim()).filter(Boolean)
      : []
  );
  const [startDate, setStartDate] = useState<string>(globalFilters.startDate || "");
  const [endDate, setEndDate] = useState<string>(globalFilters.endDate || "");
  const [pageRoute, setPageRoute] = useState<string>(globalFilters.pageRoute || "");
  const [cardDateError, setCardDateError] = useState<string>("");

  useEffect(() => {
    setRegions(
      globalFilters.region
        ? globalFilters.region.split(",").map((r) => r.trim()).filter(Boolean)
        : []
    );
    setUserEmails(
      globalFilters.userEmail
        ? globalFilters.userEmail.split(",").map((e) => e.trim()).filter(Boolean)
        : []
    );
    setStartDate(globalFilters.startDate || "");
    setEndDate(globalFilters.endDate || "");
    setPageRoute(globalFilters.pageRoute || "");
    setCardDateError("");
  }, [globalFilters]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleApply = () => {
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      setCardDateError("End Date must be equal to or later than Start Date.");
      return;
    }

    setCardDateError("");
    onApply({
      startDate,
      endDate,
      region: regions.join(","),
      userEmail: userEmails.join(","),
      pageRoute,
      timezoneOffsetMinutes: globalFilters.timezoneOffsetMinutes,
    });
    handleClose();
  };

  const handleResetCard = () => {
    setRegions(
      globalFilters.region
        ? globalFilters.region.split(",").map((r) => r.trim()).filter(Boolean)
        : []
    );
    setUserEmails(
      globalFilters.userEmail
        ? globalFilters.userEmail.split(",").map((e) => e.trim()).filter(Boolean)
        : []
    );
    setStartDate(globalFilters.startDate || "");
    setEndDate(globalFilters.endDate || "");
    setPageRoute(globalFilters.pageRoute || "");
    setCardDateError("");
    onReset();
    handleClose();
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <Tooltip title="Filter this card separately" arrow>
        <IconButton size="small" onClick={handleClick} aria-label="Filter this card separately">
          <FilterListIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              borderRadius: 3,
              boxShadow: "0 16px 40px rgba(15,23,42,0.16)",
            },
          },
        }}
      >
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5, width: 360 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Card Specific Filter
          </Typography>

          {cardDateError && (
            <Alert severity="error" sx={{ py: 0.5, px: 1, borderRadius: 1, fontSize: "0.75rem" }}>
              {cardDateError}
            </Alert>
          )}

          <CascadingPageRouteSelector
            routes={mainRoutes}
            value={pageRoute}
            onChange={(selectedPath) => setPageRoute(selectedPath)}
            size="small"
            layout="vertical"
          />

          <TextField
            label="Start Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: endDate || undefined }}
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (cardDateError) setCardDateError("");
            }}
          />
          <TextField
            label="End Date"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: startDate || undefined }}
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              if (cardDateError) setCardDateError("");
            }}
          />

          <FormControl size="small" fullWidth disabled={userEmails.length > 0}>
            <InputLabel shrink id="card-region-label">
              Region / Team
            </InputLabel>
            <Select
              labelId="card-region-label"
              multiple
              displayEmpty
              value={regions}
              label="Region / Team"
              onChange={(e) => {
                const val = e.target.value;
                setRegions(typeof val === "string" ? val.split(",") : val);
              }}
              renderValue={(selected) =>
                selected.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                    All Regions
                  </Typography>
                ) : (
                  selected.join(", ")
                )
              }
              sx={{ height: 40 }}
            >
              {AVAILABLE_REGIONS.map((r) => (
                <MenuItem key={r} value={r}>
                  <Checkbox size="small" checked={regions.indexOf(r) > -1} />
                  <ListItemText primary={r} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <UserEmailAutocomplete
            value={userEmails}
            onChange={(emails) => {
              if (Array.isArray(emails)) {
                setUserEmails(emails);
              } else if (typeof emails === "string") {
                setUserEmails(emails ? [emails] : []);
              } else {
                setUserEmails([]);
              }
            }}
            label="User Email(s)"
            placeholder={userEmails.length === 0 ? "All Users" : "Type a name..."}
            size="small"
            disabled={regions.length > 0}
            multiple
          />

          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
            <Button size="small" onClick={handleResetCard} startIcon={<RefreshIcon />}>
              Reset
            </Button>
            <Button size="small" variant="contained" onClick={handleApply}>
              Apply
            </Button>
          </Box>
        </Box>
      </Popover>
    </>
  );
};

const getOrdinalSuffix = (num: number): string => {
  if (num === 1) return "1st";
  if (num === 2) return "2nd";
  if (num === 3) return "3rd";
  return `${num}th`;
};

interface SortableHeaderCellProps<T extends string> {
  metric: T;
  activeMetric: T;
  label: string;
  onSort: (metric: T) => void;
  tooltipTitle?: string;
}

const SortableHeaderCell = <T extends string>({
  metric,
  activeMetric,
  label,
  onSort,
  tooltipTitle,
}: SortableHeaderCellProps<T>) => {
  const active = activeMetric === metric;

  const content = (
    <TableSortLabel
      active={active}
      direction="desc"
      onClick={() => onSort(metric)}
    >
      <Typography
        variant="caption"
        fontWeight={active ? 700 : 500}
        color={active ? "primary.main" : "text.secondary"}
      >
        {label}
      </Typography>
    </TableSortLabel>
  );

  return (
    <TableCell align="center" sortDirection={active ? "desc" : false}>
      {tooltipTitle ? (
        <Tooltip title={tooltipTitle} arrow>
          <Box component="span" sx={{ display: "inline-flex", cursor: "pointer" }}>
            {content}
          </Box>
        </Tooltip>
      ) : (
        content
      )}
    </TableCell>
  );
};

const AnalyticsAdminDashboard: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const timezoneOffsetMinutes = useMemo(() => -new Date().getTimezoneOffset(), []);

  const [globalRegions, setGlobalRegions] = useState<string[]>([]);
  const [globalUserEmails, setGlobalUserEmails] = useState<string[]>([]);
  const [globalStartDate, setGlobalStartDate] = useState<string>("");
  const [globalEndDate, setGlobalEndDate] = useState<string>("");
  const [globalPageRoute, setGlobalPageRoute] = useState<string>("");
  const [dateError, setDateError] = useState<string>("");

  const [appliedFilters, setAppliedFilters] = useState<AnalyticsFilterParams>({
    sortBy: "totalViews",
    timezoneOffsetMinutes: timezoneOffsetMinutes,
  });

  const [trendFilters, setTrendFilters] = useState<AnalyticsFilterParams | null>(null);
  const [cardLeaderboardFilters, setCardLeaderboardFilters] = useState<AnalyticsFilterParams | null>(null);
  const [cardRegionalFilters, setCardRegionalFilters] = useState<AnalyticsFilterParams | null>(null);
  
  const [granularity, setGranularity] = useState<TrendGranularity>("daily");
  const [isGranularityManuallySet, setIsGranularityManuallySet] = useState<boolean>(false);

  const [topContentSortBy, setTopContentSortBy] = useState<"totalViews" | "uniqueViews">("totalViews");
  const [leaderboardSortBy, setLeaderboardSortBy] = useState<"actions" | "visits" | "avgTimeSpentSeconds">("actions");
  const [regionalSortBy, setRegionalSortBy] = useState<"totalVisits" | "uniqueVisits" | "actions" | "avgTimeSpentSeconds">("totalVisits");
  const [mainRoutes, setMainRoutes] = useState<RouteOption[]>([]);

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "error" | "warning" | "info" | "success";
  }>({
    open: false,
    message: "",
    severity: "error",
  });

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const summary = useAppSelector((state) => state.analytics.summary);
  const status = useAppSelector((state) => state.analytics.summaryStatus);
  const trends = useAppSelector((state) => state.analytics.trends);
  const trendsOverridden = useAppSelector((state) => state.analytics.trendsOverridden);
  const topContent = useAppSelector((state) => state.analytics.topContent);
  const leaderboard = useAppSelector((state) => state.analytics.leaderboard);
  const regionalTimeSpent = useAppSelector((state) => state.analytics.regionalTimeSpent);
  const peakActivityTimes = useAppSelector((state) => state.analytics.peakActivityTimes);
  const topSearches = useAppSelector((state) => state.analytics.topSearches);

  const handleApplyGlobalFilters = () => {
    if (globalStartDate && globalEndDate && new Date(globalEndDate) < new Date(globalStartDate)) {
      setDateError("End Date must be equal to or later than Start Date.");
      return;
    }

    setDateError("");
    const newApplied: AnalyticsFilterParams = {
      startDate: globalStartDate,
      endDate: globalEndDate,
      region: globalRegions.join(","),
      userEmail: globalUserEmails.join(","),
      pageRoute: globalPageRoute,
      sortBy: topContentSortBy,
      timezoneOffsetMinutes: timezoneOffsetMinutes,
    };

    setAppliedFilters(newApplied);
    setTrendFilters(null);
    setCardLeaderboardFilters(null);
    setCardRegionalFilters(null);
    setIsGranularityManuallySet(false);
    dispatch(clearTrendsOverride());
    dispatch(fetchAnalyticsSummary(newApplied)).then(() => {
      if (leaderboardSortBy !== "actions") {
        dispatch(fetchLeaderboard({ ...newApplied, sortBy: leaderboardSortBy }));
      }
      if (regionalSortBy !== "totalVisits") {
        dispatch(fetchRegionalTimeSpent({ ...newApplied, sortBy: regionalSortBy }));
      }
    });
  };

  const handleResetGlobalFilters = () => {
    setGlobalRegions([]);
    setGlobalUserEmails([]);
    setGlobalStartDate("");
    setGlobalEndDate("");
    setGlobalPageRoute("");
    setTopContentSortBy("totalViews");
    setLeaderboardSortBy("actions");
    setRegionalSortBy("totalVisits");
    setIsGranularityManuallySet(false);
    setGranularity("daily");
    setDateError("");

    const resetApplied: AnalyticsFilterParams = {
      sortBy: "totalViews",
      timezoneOffsetMinutes: timezoneOffsetMinutes,
    };

    setAppliedFilters(resetApplied);
    setTrendFilters(null);
    setCardLeaderboardFilters(null);
    setCardRegionalFilters(null);
    dispatch(clearTrendsOverride());
    dispatch(fetchAnalyticsSummary(resetApplied));
  };

  const handleSortChange = (
    _event: React.MouseEvent<HTMLElement> | null,
    newSortBy: "totalViews" | "uniqueViews" | null
  ) => {
    if (newSortBy !== null) {
      setTopContentSortBy(newSortBy);
      dispatch(fetchTopContent({ ...appliedFilters, sortBy: newSortBy }));
    }
  };

  const handleLeaderboardSortChange = (
    _event: React.MouseEvent<HTMLElement> | null,
    newSortBy: "actions" | "visits" | "avgTimeSpentSeconds" | null
  ) => {
    if (newSortBy !== null) {
      setLeaderboardSortBy(newSortBy);
      const activeFilters = cardLeaderboardFilters || appliedFilters;
      dispatch(fetchLeaderboard({ ...activeFilters, sortBy: newSortBy }));
    }
  };

  const handleRegionalSortChange = (
    _event: React.MouseEvent<HTMLElement> | null,
    newSortBy: "totalVisits" | "uniqueVisits" | "actions" | "avgTimeSpentSeconds" | null
  ) => {
    if (newSortBy !== null) {
      setRegionalSortBy(newSortBy);
      const activeFilters = cardRegionalFilters || appliedFilters;
      dispatch(fetchRegionalTimeSpent({ ...activeFilters, sortBy: newSortBy }));
    }
  };

  useEffect(() => {
    const initialFilters: AnalyticsFilterParams = {
      sortBy: "totalViews",
      timezoneOffsetMinutes: timezoneOffsetMinutes,
    };
    dispatch(fetchAnalyticsSummary(initialFilters));

    const fetchMainRoutes = async () => {
      try {
        const response = await ApiService.getInstance().get(
          AppConfig.serviceUrls.getMainRoutes()
        );

        const rawData: RawRouteResponse[] = Array.isArray(response.data)
          ? response.data
          : response.data?.body && Array.isArray(response.data.body)
          ? response.data.body
          : [];

        if (rawData.length > 0) {
          const routes: RouteOption[] = rawData
            .map((r) => ({
              route_id: Number(r.route_id || r.routeId || r.id || 0),
              parent_id: r.parent_id ?? r.parentId ?? null,
              route_path: (r.routePath || r.route_path || r.path || "").trim(),
              label: (r.menuItem || r.menu_item || r.title || r.label || "Unnamed Page").trim(),
            }))
            .filter((r) => Boolean(r.route_path));
          setMainRoutes(routes);
        }
      } catch (err) {
        console.error("Failed to load routes for analytics filters", err);
        setSnackbar({
          open: true,
          message: "Failed to load page routes for analytics filters.",
          severity: "error",
        });
      }
    };

    fetchMainRoutes();
  }, [dispatch, timezoneOffsetMinutes]);

  // Auto-switch granularity when date ranges are selected, unless manually overridden by the user
  useEffect(() => {
    if (isGranularityManuallySet) return;

    const activeFilter = trendFilters || appliedFilters;
    let sDate: Date | null = null;
    let eDate: Date | null = null;

    if (activeFilter.startDate) {
      const parts = activeFilter.startDate.split("-").map(Number);
      sDate = new Date(parts[0], parts[1] - 1, parts[2]);
    }
    if (activeFilter.endDate) {
      const parts = activeFilter.endDate.split("-").map(Number);
      eDate = new Date(parts[0], parts[1] - 1, parts[2]);
    } else if (sDate) {
      eDate = new Date();
    }

    if (sDate && eDate) {
      const diffDays = Math.round((eDate.getTime() - sDate.getTime()) / 86400000) + 1;
      if (diffDays > 60) {
        setGranularity("monthly");
      } else if (diffDays > 14) {
        setGranularity("weekly");
      } else {
        setGranularity("daily");
      }
    } else {
      setGranularity("daily");
    }
  }, [trendFilters, appliedFilters, isGranularityManuallySet]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const avgActionsPerVisit =
    summary?.avgActionsPerVisit != null
      ? Number(summary.avgActionsPerVisit).toFixed(1)
      : "0.0";

  const realTrendData: TrendDataPoint[] = useMemo(() => {
    const rawTrends = trendsOverridden ? trends : summary?.trends || [];

    const trendMap = new Map<string, DailyTrendMetric>();
    rawTrends.forEach((item) => {
      if (item.date) {
        const cleanDate = item.date.split("T")[0];
        trendMap.set(cleanDate, item);
      }
    });

    const dates = Array.from(trendMap.keys()).sort();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start: Date;
    let end: Date;

    const activeFilter = trendFilters || appliedFilters;
    const activeStart = activeFilter.startDate;
    const activeEnd = activeFilter.endDate;

    let defaultDays = 6;
    if (granularity === "weekly") defaultDays = 55;
    else if (granularity === "monthly") defaultDays = 364;
    else if (granularity === "quarterly") defaultDays = 729;

    const defaultStart = new Date(today);
    defaultStart.setDate(today.getDate() - defaultDays);

    if (activeStart && activeEnd) {
      const sParts = activeStart.split("-").map(Number);
      start = new Date(sParts[0], sParts[1] - 1, sParts[2]);
      const eParts = activeEnd.split("-").map(Number);
      end = new Date(eParts[0], eParts[1] - 1, eParts[2]);
    } else if (activeStart) {
      const sParts = activeStart.split("-").map(Number);
      start = new Date(sParts[0], sParts[1] - 1, sParts[2]);
      end = new Date(today);
    } else if (activeEnd) {
      const eParts = activeEnd.split("-").map(Number);
      end = new Date(eParts[0], eParts[1] - 1, eParts[2]);
      start = new Date(end);
      start.setDate(end.getDate() - defaultDays);
    } else if (dates.length > 0) {
      const minParts = dates[0].split("-").map(Number);
      const minDate = new Date(minParts[0], minParts[1] - 1, minParts[2]);
      start = minDate < defaultStart ? minDate : defaultStart;
      end = new Date(today);
    } else {
      start = defaultStart;
      end = new Date(today);
    }

    const dailyPoints: {
      dateKey: string;
      dateObj: Date;
      totalViews: number;
      uniqueViews: number;
      timeSpentSeconds: number;
      totalEngagements: number;
      avgActionsPerVisit: number;
    }[] = [];

    const current = new Date(start);

    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, "0");
      const day = String(current.getDate()).padStart(2, "0");
      const dateKey = `${year}-${month}-${day}`;

      const item = trendMap.get(dateKey);

      dailyPoints.push({
        dateKey,
        dateObj: new Date(current),
        totalViews: Number(item?.totalViews || 0),
        uniqueViews: Number(item?.uniqueViews || 0),
        timeSpentSeconds: Number(item?.timeSpentSeconds || 0),
        totalEngagements: Number(item?.totalEngagements || 0),
        avgActionsPerVisit: Number(item?.avgActionsPerVisit || 0),
      });

      current.setDate(current.getDate() + 1);
    }

    if (granularity === "daily") {
      return dailyPoints.map((pt) => ({
        date: pt.dateKey, 
        formattedDate: pt.dateObj.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        totalViews: pt.totalViews,
        uniqueViews: pt.uniqueViews,
        timeSpentSeconds: pt.timeSpentSeconds,
        totalEngagements: pt.totalEngagements,
        avgActionsPerVisit: pt.avgActionsPerVisit,
      }));
    }

    const aggregatedMap = new Map<
      string,
      {
        label: string;
        fullLabel: string;
        totalViews: number;
        uniqueViews: number;
        timeSpentSeconds: number;
        totalEngagements: number;
        avgActionsSum: number;
        count: number;
      }
    >();

    dailyPoints.forEach((pt) => {
      const d = pt.dateObj;
      let groupKey = "";
      let label = "";
      let fullLabel = "";

      if (granularity === "weekly") {
        const monthShort = d.toLocaleDateString("en-US", { month: "short" });
        const monthLong = d.toLocaleDateString("en-US", { month: "long" });
        const year = d.getFullYear();
        const weekNum = Math.min(4, Math.floor((d.getDate() - 1) / 7) + 1);
        const ordinal = getOrdinalSuffix(weekNum);

        groupKey = `${year}-${d.getMonth() + 1}-W${weekNum}`;
        label = `${monthShort} ${ordinal} week`;
        fullLabel = `${monthLong} ${year} - ${ordinal} Week`;
      } else if (granularity === "monthly") {
        const year = d.getFullYear();
        const yearTwoDigits = String(year).slice(-2);
        const monthShort = d.toLocaleDateString("en-US", { month: "short" });
        const monthLong = d.toLocaleDateString("en-US", { month: "long" });

        groupKey = `${year}-${d.getMonth() + 1}`;
        label = `${monthShort} '${yearTwoDigits}`;
        fullLabel = `${monthLong} ${year}`;
      } else if (granularity === "quarterly") {
        const year = d.getFullYear();
        const yearTwoDigits = String(year).slice(-2);
        const q = Math.floor(d.getMonth() / 3) + 1;

        groupKey = `${year}-Q${q}`;
        label = `Q${q} '${yearTwoDigits}`;
        fullLabel = `Q${q} ${year}`;
      }

      const existing = aggregatedMap.get(groupKey);
      const hasActivity = pt.avgActionsPerVisit > 0 || pt.totalEngagements > 0;

      if (existing) {
        existing.totalViews += pt.totalViews;
        existing.uniqueViews += pt.uniqueViews;
        existing.timeSpentSeconds += pt.timeSpentSeconds;
        existing.totalEngagements += pt.totalEngagements;
        if (hasActivity) {
          existing.avgActionsSum += pt.avgActionsPerVisit;
          existing.count += 1;
        }
      } else {
        aggregatedMap.set(groupKey, {
          label,
          fullLabel,
          totalViews: pt.totalViews,
          uniqueViews: pt.uniqueViews,
          timeSpentSeconds: pt.timeSpentSeconds,
          totalEngagements: pt.totalEngagements,
          avgActionsSum: hasActivity ? pt.avgActionsPerVisit : 0,
          count: hasActivity ? 1 : 0,
        });
      }
    });

    return Array.from(aggregatedMap.values()).map((agg) => ({
      date: agg.label,
      formattedDate: agg.fullLabel,
      totalViews: agg.totalViews,
      uniqueViews: agg.uniqueViews,
      timeSpentSeconds: agg.timeSpentSeconds,
      totalEngagements: agg.totalEngagements,
      avgActionsPerVisit:
        agg.count > 0 ? Number((agg.avgActionsSum / agg.count).toFixed(2)) : 0,
    }));
  }, [trends, trendsOverridden, summary, trendFilters, appliedFilters, granularity]);

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
      <Container maxWidth="xl">
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 4, mt: 6 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 3,
              backgroundColor: `${theme.palette.primary.main}15`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BarChartIcon sx={{ fontSize: 32, color: theme.palette.primary.main }} />
          </Box>
          <Box>
            <Typography variant="h4" fontWeight={700} color="text.primary">
              Platform Inbuilt Analytics
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Deep content performance, regional metrics, and user engagement leaderboards
            </Typography>
          </Box>
        </Box>

        {/* Global Dynamic Filters Panel */}
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            mb: 4,
            borderRadius: 4,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.background.paper,
            boxShadow:
              theme.palette.mode === "dark"
                ? "0 4px 20px 0 rgba(0,0,0,0.25)"
                : "0 4px 20px 0 rgba(15,23,42,0.04)",
          }}
        >
          {dateError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {dateError}
            </Alert>
          )}

          {/* Panel Header Bar */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 2,
              pb: 1.5,
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FilterListIcon color="primary" fontSize="small" />
              <Typography variant="subtitle1" fontWeight={700}>
                Global Filters
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button
                variant="text"
                color="inherit"
                size="small"
                onClick={handleResetGlobalFilters}
                startIcon={<RefreshIcon />}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                Reset
              </Button>
              <Button
                variant="contained"
                disableElevation
                size="small"
                onClick={handleApplyGlobalFilters}
                sx={{ borderRadius: 2, textTransform: "none", px: 2.5, fontWeight: 600 }}
              >
                Apply Filters
              </Button>
            </Box>
          </Box>

          {/* Symmetrical Controls Row with Baseline Alignment */}
          <Box
            sx={{
              display: "flex",
              alignItems: { xs: "stretch", sm: "flex-end" },
              flexDirection: { xs: "column", sm: "row" },
              gap: 1.5,
              width: "100%",
            }}
          >
            {/* Cascading Page Route Dropdowns */}
            <CascadingPageRouteSelector
              routes={mainRoutes}
              value={globalPageRoute}
              onChange={(selectedPath) => setGlobalPageRoute(selectedPath)}
              size="small"
              layout="horizontal"
            />

            {/* Start Date */}
            <TextField
              label="Global Start Date"
              type="date"
              size="small"
              sx={{
                flex: "1 1 0px",
                minWidth: 0,
                "& .MuiOutlinedInput-root": { height: 40 },
              }}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: globalEndDate || undefined }}
              value={globalStartDate}
              onChange={(e) => {
                setGlobalStartDate(e.target.value);
                if (dateError) setDateError("");
              }}
            />

            {/* End Date */}
            <TextField
              label="Global End Date"
              type="date"
              size="small"
              sx={{
                flex: "1 1 0px",
                minWidth: 0,
                "& .MuiOutlinedInput-root": { height: 40 },
              }}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: globalStartDate || undefined }}
              value={globalEndDate}
              onChange={(e) => {
                setGlobalEndDate(e.target.value);
                if (dateError) setDateError("");
              }}
            />

            {/* Region / Team Multi-Select Dropdown */}
            <FormControl
              size="small"
              sx={{
                flex: "1 1 0px",
                minWidth: 0,
              }}
              disabled={globalUserEmails.length > 0}
            >
              <InputLabel shrink id="global-region-select-label">
                Region / Team
              </InputLabel>
              <Select
                labelId="global-region-select-label"
                multiple
                displayEmpty
                value={globalRegions}
                label="Region / Team"
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalRegions(typeof val === "string" ? val.split(",") : val);
                }}
                renderValue={(selected) => {
                  if (selected.length === 0) {
                    return (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontSize: "0.8125rem", fontStyle: "normal" }}
                      >
                        All Regions
                      </Typography>
                    );
                  }
                  return (
                    <Tooltip title={selected.join(", ")} arrow placement="top">
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: "0.8125rem",
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {selected.length === 1 ? selected[0] : `${selected.length} Regions Selected (${selected.join(", ")})`}
                      </Typography>
                    </Tooltip>
                  );
                }}
                sx={{
                  height: 40,
                  "& .MuiSelect-select": {
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden !important",
                    textOverflow: "ellipsis !important",
                    whiteSpace: "nowrap !important",
                    paddingRight: "32px !important",
                  },
                }}
              >
                {AVAILABLE_REGIONS.map((r) => (
                  <MenuItem key={r} value={r}>
                    <Checkbox size="small" checked={globalRegions.indexOf(r) > -1} />
                    <ListItemText primary={r} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* User Email Multi-Select Autocomplete */}
            <Box sx={{ flex: "1 1 0px", minWidth: 0 }}>
              <UserEmailAutocomplete
                value={globalUserEmails}
                onChange={(emails) => {
                  if (Array.isArray(emails)) {
                    setGlobalUserEmails(emails);
                  } else if (typeof emails === "string") {
                    setGlobalUserEmails(emails ? [emails] : []);
                  } else {
                    setGlobalUserEmails([]);
                  }
                }}
                label="Global User Email(s)"
                placeholder={globalUserEmails.length === 0 ? "All Users" : "Type a name..."}
                size="small"
                disabled={globalRegions.length > 0}
                multiple
              />
            </Box>
          </Box>
        </Paper>

        {status === "loading" ? (
          <Box sx={{ py: 8, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {/* Overall KPI Cards */}
            <Grid container spacing={2}>
              {/* Card 1: Total Views */}
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: "100%",
                    transition: "box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
                    "&:hover": {
                      boxShadow:
                        theme.palette.mode === "dark"
                          ? "0 10px 30px rgba(0,0,0,0.45)"
                          : "0 10px 30px rgba(15,23,42,0.08)",
                      borderColor: alpha(theme.palette.primary.main, 0.35),
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.info.main, 0.1),
                        color: theme.palette.info.main,
                      }}
                    >
                      <VisibilityIcon />
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Total Views
                      </Typography>
                      <Typography variant="h5" fontWeight={700}>
                        {summary?.totalViews ?? 0}
                      </Typography>
                    </Box>
                  </Box>
                  <Tooltip
                    title="Total page view duration events recorded on the platform matching your selected filters."
                    arrow
                  >
                    <IconButton size="small" aria-label="Total Views info">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                </Paper>
              </Grid>

              {/* Card 2: Unique Visitors */}
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: "100%",
                    transition: "box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
                    "&:hover": {
                      boxShadow:
                        theme.palette.mode === "dark"
                          ? "0 10px 30px rgba(0,0,0,0.45)"
                          : "0 10px 30px rgba(15,23,42,0.08)",
                      borderColor: alpha(theme.palette.primary.main, 0.35),
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.primary.main, 0.1),
                        color: theme.palette.primary.main,
                      }}
                    >
                      <PeopleIcon />
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Unique Visitors
                      </Typography>
                      <Typography variant="h5" fontWeight={700}>
                        {summary?.totalUniqueViews ?? 0}
                      </Typography>
                    </Box>
                  </Box>
                  <Tooltip
                    title="Number of distinct team members who logged into and accessed the platform within the selected filters."
                    arrow
                  >
                    <IconButton size="small" aria-label="Unique Visitors info">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                </Paper>
              </Grid>

              {/* Card 3: Time Spent on Platform */}
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: "100%",
                    transition: "box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
                    "&:hover": {
                      boxShadow:
                        theme.palette.mode === "dark"
                          ? "0 10px 30px rgba(0,0,0,0.45)"
                          : "0 10px 30px rgba(15,23,42,0.08)",
                      borderColor: alpha(theme.palette.primary.main, 0.35),
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.warning.main, 0.1),
                        color: theme.palette.warning.main,
                      }}
                    >
                      <TimerIcon />
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Time Spent on Platform
                      </Typography>
                      <Typography variant="h5" fontWeight={700}>
                        {formatTime(summary?.totalTimeSpentSeconds ?? 0)}
                      </Typography>
                    </Box>
                  </Box>
                  <Tooltip
                    title="Total cumulative active session time spent browsing, reading, or navigating the platform."
                    arrow
                  >
                    <IconButton size="small" aria-label="Time Spent on Platform info">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                </Paper>
              </Grid>

              {/* Card 4: Total Platform Engagements */}
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: "100%",
                    transition: "box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
                    "&:hover": {
                      boxShadow:
                        theme.palette.mode === "dark"
                          ? "0 10px 30px rgba(0,0,0,0.45)"
                          : "0 10px 30px rgba(15,23,42,0.08)",
                      borderColor: alpha(theme.palette.primary.main, 0.35),
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.success.main, 0.1),
                        color: theme.palette.success.main,
                      }}
                    >
                      <BarChartIcon />
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Total Actions Taken
                      </Typography>
                      <Typography variant="h5" fontWeight={700}>
                        {summary?.totalEngagements ?? 0}
                      </Typography>
                    </Box>
                  </Box>
                  <Tooltip
                    title="Total user interactions performed (including opening previews, clicking external outlinks, or searching). Opening a preview and then clicking its outlink counts as 2 actions."
                    arrow
                  >
                    <IconButton size="small" aria-label="Total Actions Taken info">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                </Paper>
              </Grid>

              {/* Card 5: Average Actions per Visit */}
              <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    borderRadius: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    height: "100%",
                    transition: "box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease",
                    "&:hover": {
                      boxShadow:
                        theme.palette.mode === "dark"
                          ? "0 10px 30px rgba(0,0,0,0.45)"
                          : "0 10px 30px rgba(15,23,42,0.08)",
                      borderColor: alpha(theme.palette.primary.main, 0.35),
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        backgroundColor: alpha(purple[500], 0.15),
                        color: purple[500],
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <TouchAppIcon sx={{ color: purple[500], fontSize: 24 }} />
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">
                        Avg Actions Per Visit
                      </Typography>
                      <Typography variant="h5" fontWeight={700}>
                        {avgActionsPerVisit}
                      </Typography>
                    </Box>
                  </Box>
                  <Tooltip
                    title="Average number of active interactions (Total Actions ÷ Total Unique Sessions)."
                    arrow
                  >
                    <IconButton size="small" aria-label="Average Actions Per Visit info">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                </Paper>
              </Grid>
            </Grid>

            {/* Metrics Over Time Chart Card */}
            <Box sx={{ position: "relative" }}>
              <Box
                sx={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  zIndex: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                }}
              >
                {/* Granularity Selector */}
                <ToggleButtonGroup
                  value={granularity}
                  exclusive
                  onChange={(_e, val) => {
                    if (val !== null) {
                      setGranularity(val as TrendGranularity);
                      setIsGranularityManuallySet(true);
                    }
                  }}
                  size="small"
                  aria-label="trend aggregation level"
                  sx={{ backgroundColor: theme.palette.background.paper }}
                >
                  <ToggleButton value="daily" sx={{ px: 1.5, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                    Daily
                  </ToggleButton>
                  <ToggleButton value="weekly" sx={{ px: 1.5, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                    Weekly
                  </ToggleButton>
                  <ToggleButton value="monthly" sx={{ px: 1.5, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                    Monthly
                  </ToggleButton>
                  <ToggleButton value="quarterly" sx={{ px: 1.5, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                    Quarterly
                  </ToggleButton>
                </ToggleButtonGroup>

                <CardFilterPopover
                  globalFilters={trendFilters || appliedFilters}
                  mainRoutes={mainRoutes}
                  onApply={(filters) => {
                    setTrendFilters(filters);
                    dispatch(fetchAnalyticsTrends(filters));
                  }}
                  onReset={() => {
                    setTrendFilters(null);
                    setIsGranularityManuallySet(false);
                    dispatch(clearTrendsOverride());
                  }}
                />
              </Box>
              <AnalyticsTrendsChart trendData={realTrendData} />
            </Box>

            {/* Content Performance & Leaderboard Grid */}
            <Grid container spacing={3}>
              {/* Card 1: Top Performing Content Table */}
              <Grid size={{ xs: 12, md: 7 }}>
                <Box
                  sx={{
                    p: 3,
                    borderRadius: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    height: "100%",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                    "&:hover": {
                      boxShadow:
                        theme.palette.mode === "dark"
                          ? "0 10px 30px rgba(0,0,0,0.45)"
                          : "0 10px 30px rgba(15,23,42,0.06)",
                      borderColor: alpha(theme.palette.primary.main, 0.25),
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 1.5,
                      mb: 2.5,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", flex: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="h6" fontWeight={600}>
                          Top Performing Content Breakdown
                        </Typography>
                        <Tooltip
                          title="Breaks down engagement per material. Preview Clicks requires successful embedding and 10s+ view time. Outlinks tracks direct external opens. Total Views counts modal openings once."
                          arrow
                        >
                          <IconButton size="small" aria-label="Top Performing Content info">
                            <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>

                      <ToggleButtonGroup
                        value={topContentSortBy}
                        exclusive
                        onChange={handleSortChange}
                        size="small"
                        aria-label="top content ranking criteria"
                      >
                        <ToggleButton value="totalViews" sx={{ px: 1.5, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                          By Total Views
                        </ToggleButton>
                        <ToggleButton value="uniqueViews" sx={{ px: 1.5, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                          By Unique Views
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Box>

                    <Box sx={{ flexShrink: 0 }}>
                      <CardFilterPopover
                        globalFilters={appliedFilters}
                        mainRoutes={mainRoutes}
                        onApply={(filters) =>
                          dispatch(fetchTopContent({ ...filters, sortBy: topContentSortBy }))
                        }
                        onReset={() =>
                          dispatch(fetchTopContent({ ...appliedFilters, sortBy: topContentSortBy }))
                        }
                      />
                    </Box>
                  </Box>

                  <TableContainer sx={{ overflowX: "auto", flexGrow: 1, width: "100%" }}>
                    <Table size="small" sx={{ minWidth: 600 }}>
                      <TableHead
                        sx={{
                          "& .MuiTableCell-root": {
                            fontWeight: 700,
                            color: theme.palette.text.secondary,
                            borderBottom: `2px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.primary.main, 0.03),
                            whiteSpace: "nowrap",
                          },
                        }}
                      >
                        <TableRow>
                          <TableCell>Content Title</TableCell>
                          <TableCell align="center">Type</TableCell>
                          <TableCell align="center">
                            <Tooltip
                              title="Counted ONLY when content renders successfully in preview AND is viewed for at least 10 seconds. Broken or restricted links do NOT increment preview clicks."
                              arrow
                            >
                              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, cursor: "help" }}>
                                <PreviewIcon fontSize="small" color="action" />
                                <span>Preview Clicks</span>
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip
                              title="Counted when opened in a new window/tab (including clicking 'Open in New Window' on restricted or broken preview screens)."
                              arrow
                            >
                              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, cursor: "help" }}>
                                <OpenInNewIcon fontSize="small" color="action" />
                                <span>Outlinks</span>
                              </Box>
                            </Tooltip>
                          </TableCell>
                          <SortableHeaderCell
                            metric="totalViews"
                            activeMetric={topContentSortBy}
                            label="Total Views"
                            onSort={(m) => handleSortChange(null, m)}
                            tooltipTitle="Total times this content modal was opened. Opening a preview counts as 1 view, even if an outlink is also clicked inside that modal."
                          />
                          <SortableHeaderCell
                            metric="uniqueViews"
                            activeMetric={topContentSortBy}
                            label="Unique Views"
                            onSort={(m) => handleSortChange(null, m)}
                            tooltipTitle="Number of distinct team members who viewed or opened this content."
                          />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {topContent && topContent.length > 0 ? (
                          topContent.map((c) => (
                            <TableRow key={c.contentId} hover>
                              <TableCell sx={{ maxWidth: 220 }}>
                                <Typography variant="body2" fontWeight={600} noWrap>
                                  {c.title}
                                </Typography>
                              </TableCell>

                              <TableCell align="center">
                                <Chip label={c.contentType} size="small" variant="outlined" />
                              </TableCell>

                              <TableCell align="center">
                                <Chip
                                  icon={<PreviewIcon sx={{ fontSize: "14px !important" }} />}
                                  label={c.previewClicks ?? 0}
                                  size="small"
                                  color="info"
                                  variant="outlined"
                                  sx={{ fontWeight: 600 }}
                                />
                              </TableCell>

                              <TableCell align="center">
                                <Chip
                                  icon={<OpenInNewIcon sx={{ fontSize: "14px !important" }} />}
                                  label={c.outlinkClicks ?? 0}
                                  size="small"
                                  color="warning"
                                  variant="outlined"
                                  sx={{ fontWeight: 600 }}
                                />
                              </TableCell>

                              <TableCell align="center">
                                <Typography
                                  variant="body2"
                                  fontWeight={topContentSortBy === "totalViews" ? 800 : 600}
                                  color={topContentSortBy === "totalViews" ? "primary.main" : "text.primary"}
                                >
                                  {c.totalViews}
                                </Typography>
                              </TableCell>

                              <TableCell align="center">
                                <Box
                                  sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 0.5,
                                  }}
                                >
                                  <PeopleIcon
                                    sx={{
                                      fontSize: 16,
                                      color: topContentSortBy === "uniqueViews" ? "primary.main" : "text.secondary",
                                    }}
                                  />
                                  <Typography
                                    variant="body2"
                                    fontWeight={topContentSortBy === "uniqueViews" ? 800 : 600}
                                    color={topContentSortBy === "uniqueViews" ? "primary.main" : "text.primary"}
                                  >
                                    {c.uniqueViews}
                                  </Typography>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                              <Typography variant="body2" color="text.secondary">
                                No content analytics found for the selected route/filter.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Grid>

              {/* Card 2: Leaderboard Section */}
              <Grid size={{ xs: 12, md: 5 }}>
                <Box
                  sx={{
                    p: 3,
                    borderRadius: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    height: "100%",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                    "&:hover": {
                      boxShadow:
                        theme.palette.mode === "dark"
                          ? "0 10px 30px rgba(0,0,0,0.45)"
                          : "0 10px 30px rgba(15,23,42,0.06)",
                      borderColor: alpha(theme.palette.primary.main, 0.25),
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 1.5,
                      mb: 2,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", flex: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <EmojiEventsIcon sx={{ color: "#FFD700" }} />
                        <Typography variant="h6" fontWeight={600}>
                          User Activity Leaderboard
                        </Typography>
                        <Tooltip
                          title="Team members ranked by your selected metric (actions, visits, or average time spent)."
                          arrow
                        >
                          <IconButton size="small" aria-label="User Activity Leaderboard info">
                            <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>

                      <ToggleButtonGroup
                        value={leaderboardSortBy}
                        exclusive
                        onChange={handleLeaderboardSortChange}
                        size="small"
                        aria-label="leaderboard ranking criteria"
                      >
                        <ToggleButton value="actions" sx={{ px: 1.2, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                          By Actions
                        </ToggleButton>
                        <ToggleButton value="visits" sx={{ px: 1.2, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                          By Visits
                        </ToggleButton>
                        <ToggleButton value="avgTimeSpentSeconds" sx={{ px: 1.2, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                          By Avg Time
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Box>

                    <Box sx={{ flexShrink: 0 }}>
                      <CardFilterPopover
                        globalFilters={appliedFilters}
                        mainRoutes={mainRoutes}
                        onApply={(filters) => {
                          setCardLeaderboardFilters(filters);
                          dispatch(fetchLeaderboard({ ...filters, sortBy: leaderboardSortBy }));
                        }}
                        onReset={() => {
                          setCardLeaderboardFilters(null);
                          dispatch(fetchLeaderboard({ ...appliedFilters, sortBy: leaderboardSortBy }));
                        }}
                      />
                    </Box>
                  </Box>

                  <TableContainer sx={{ overflowX: "auto", flexGrow: 1, width: "100%" }}>
                    <Table size="small" sx={{ minWidth: 380 }}>
                      <TableHead
                        sx={{
                          "& .MuiTableCell-root": {
                            fontWeight: 700,
                            color: theme.palette.text.secondary,
                            borderBottom: `2px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.primary.main, 0.03),
                            whiteSpace: "nowrap",
                          },
                        }}
                      >
                        <TableRow>
                          <TableCell>User</TableCell>
                          <SortableHeaderCell
                            metric="visits"
                            activeMetric={leaderboardSortBy}
                            label="Visits"
                            onSort={(m) => handleLeaderboardSortChange(null, m)}
                          />
                          <SortableHeaderCell
                            metric="actions"
                            activeMetric={leaderboardSortBy}
                            label="Actions"
                            onSort={(m) => handleLeaderboardSortChange(null, m)}
                          />
                          <SortableHeaderCell
                            metric="avgTimeSpentSeconds"
                            activeMetric={leaderboardSortBy}
                            label="Avg Time Spent"
                            onSort={(m) => handleLeaderboardSortChange(null, m)}
                          />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {leaderboard && leaderboard.length > 0 ? (
                          leaderboard.map((u, idx) => (
                            <TableRow key={u.userEmail} hover>
                              <TableCell>
                                <Typography variant="body2" fontWeight={600}>
                                  #{idx + 1} {u.userName}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {u.userEmail} {u.region ? `• ${u.region}` : ""}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Typography
                                  variant="body2"
                                  fontWeight={leaderboardSortBy === "visits" ? 800 : 600}
                                  color={leaderboardSortBy === "visits" ? "primary.main" : "text.primary"}
                                >
                                  {u.visits}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Chip
                                  label={u.actions}
                                  size="small"
                                  color={leaderboardSortBy === "actions" ? "primary" : "default"}
                                  variant={leaderboardSortBy === "actions" ? "filled" : "outlined"}
                                  sx={{ fontWeight: 700 }}
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Typography
                                  variant="body2"
                                  fontWeight={leaderboardSortBy === "avgTimeSpentSeconds" ? 800 : 500}
                                  color={leaderboardSortBy === "avgTimeSpentSeconds" ? "primary.main" : "text.primary"}
                                >
                                  {formatTime(u.avgTimeSpentSeconds)}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                              <Typography variant="body2" color="text.secondary">
                                No user activity recorded for this route/filter.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Grid>
            </Grid>

            {/* Regional Time Spent & Peak Activity Grid */}
            <Grid container spacing={3}>
              {/* Card 3: Global Team Performance */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Box
                  sx={{
                    p: 3,
                    borderRadius: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    height: "100%",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                    "&:hover": {
                      boxShadow:
                        theme.palette.mode === "dark"
                          ? "0 10px 30px rgba(0,0,0,0.45)"
                          : "0 10px 30px rgba(15,23,42,0.06)",
                      borderColor: alpha(theme.palette.primary.main, 0.25),
                    },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 1.5,
                      mb: 2,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", flex: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <PublicIcon color="primary" />
                        <Typography variant="h6" fontWeight={600}>
                          Global Team Performance
                        </Typography>
                        <Tooltip
                          title="Platform activity broken down by regional teams, comparing unique visitors, total visits, total actions, and average time spent per visit."
                          arrow
                        >
                          <IconButton size="small" aria-label="Global Team Performance info">
                            <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>

                      <ToggleButtonGroup
                        value={regionalSortBy}
                        exclusive
                        onChange={handleRegionalSortChange}
                        size="small"
                        aria-label="regional ranking criteria"
                      >
                        <ToggleButton value="totalVisits" sx={{ px: 1.2, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                          By Visits
                        </ToggleButton>
                        <ToggleButton value="uniqueVisits" sx={{ px: 1.2, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                          By Unique
                        </ToggleButton>
                        <ToggleButton value="actions" sx={{ px: 1.2, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                          By Actions
                        </ToggleButton>
                        <ToggleButton value="avgTimeSpentSeconds" sx={{ px: 1.2, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                          By Avg Time
                        </ToggleButton>
                      </ToggleButtonGroup>
                    </Box>

                    <Box sx={{ flexShrink: 0 }}>
                      <CardFilterPopover
                        globalFilters={appliedFilters}
                        mainRoutes={mainRoutes}
                        onApply={(filters) => {
                          setCardRegionalFilters(filters);
                          dispatch(fetchRegionalTimeSpent({ ...filters, sortBy: regionalSortBy }));
                        }}
                        onReset={() => {
                          setCardRegionalFilters(null);
                          dispatch(fetchRegionalTimeSpent({ ...appliedFilters, sortBy: regionalSortBy }));
                        }}
                      />
                    </Box>
                  </Box>
                  <TableContainer sx={{ overflowX: "auto", flexGrow: 1, width: "100%" }}>
                    <Table size="small" sx={{ minWidth: 450 }}>
                      <TableHead
                        sx={{
                          "& .MuiTableCell-root": {
                            fontWeight: 700,
                            color: theme.palette.text.secondary,
                            borderBottom: `2px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.primary.main, 0.03),
                            whiteSpace: "nowrap",
                          },
                        }}
                      >
                        <TableRow>
                          <TableCell>Region / Team</TableCell>
                          <SortableHeaderCell
                            metric="uniqueVisits"
                            activeMetric={regionalSortBy}
                            label="Unique Visitors"
                            onSort={(m) => handleRegionalSortChange(null, m)}
                          />
                          <SortableHeaderCell
                            metric="totalVisits"
                            activeMetric={regionalSortBy}
                            label="Total Visits"
                            onSort={(m) => handleRegionalSortChange(null, m)}
                          />
                          <SortableHeaderCell
                            metric="actions"
                            activeMetric={regionalSortBy}
                            label="Actions"
                            onSort={(m) => handleRegionalSortChange(null, m)}
                          />
                          <SortableHeaderCell
                            metric="avgTimeSpentSeconds"
                            activeMetric={regionalSortBy}
                            label="Avg Time Spent"
                            onSort={(m) => handleRegionalSortChange(null, m)}
                          />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {regionalTimeSpent && regionalTimeSpent.length > 0 ? (
                          regionalTimeSpent.map((r) => (
                            <TableRow key={r.region} hover>
                              <TableCell>
                                <Chip label={r.region} size="small" variant="outlined" color="primary" />
                              </TableCell>
                              <TableCell align="center">
                                <Typography
                                  variant="body2"
                                  fontWeight={regionalSortBy === "uniqueVisits" ? 800 : 500}
                                  color={regionalSortBy === "uniqueVisits" ? "primary.main" : "text.primary"}
                                >
                                  {r.uniqueVisits}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Typography
                                  variant="body2"
                                  fontWeight={regionalSortBy === "totalVisits" ? 800 : 600}
                                  color={regionalSortBy === "totalVisits" ? "primary.main" : "text.primary"}
                                >
                                  {r.totalVisits}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Chip
                                  label={r.actions}
                                  size="small"
                                  color={regionalSortBy === "actions" ? "primary" : "info"}
                                  variant={regionalSortBy === "actions" ? "filled" : "outlined"}
                                  sx={{ fontWeight: 700 }}
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Typography
                                  variant="body2"
                                  fontWeight={regionalSortBy === "avgTimeSpentSeconds" ? 800 : 500}
                                  color={regionalSortBy === "avgTimeSpentSeconds" ? "primary.main" : "text.primary"}
                                >
                                  {formatTime(r.avgTimeSpentSeconds)}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                              <Typography variant="body2" color="text.secondary">
                                No team metrics found.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Grid>

              {/* Card 4: Peak Activity Times Table */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Box
                  sx={{
                    p: 3,
                    borderRadius: 4,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                    height: "100%",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                    "&:hover": {
                      boxShadow:
                        theme.palette.mode === "dark"
                          ? "0 10px 30px rgba(0,0,0,0.45)"
                          : "0 10px 30px rgba(15,23,42,0.06)",
                      borderColor: alpha(theme.palette.primary.main, 0.25),
                    },
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <AccessTimeIcon color="primary" />
                      <Typography variant="h6" fontWeight={600}>
                        Peak Activity Windows
                      </Typography>
                      <Tooltip
                        title="The busiest 1-hour time slot on the platform for each day of the week, based on visit counts."
                        arrow
                      >
                        <IconButton size="small" aria-label="Peak Activity Windows info">
                          <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <CardFilterPopover
                      globalFilters={appliedFilters}
                      mainRoutes={mainRoutes}
                      onApply={(filters) => dispatch(fetchPeakActivityTimes(filters))}
                      onReset={() => dispatch(fetchPeakActivityTimes(appliedFilters))}
                    />
                  </Box>
                  <TableContainer sx={{ overflowX: "auto", flexGrow: 1, width: "100%" }}>
                    <Table size="small" sx={{ minWidth: 350 }}>
                      <TableHead
                        sx={{
                          "& .MuiTableCell-root": {
                            fontWeight: 700,
                            color: theme.palette.text.secondary,
                            borderBottom: `2px solid ${theme.palette.divider}`,
                            backgroundColor: alpha(theme.palette.primary.main, 0.03),
                            whiteSpace: "nowrap",
                          },
                        }}
                      >
                        <TableRow>
                          <TableCell>Day of Week</TableCell>
                          <TableCell align="center">Peak Hour Window</TableCell>
                          <TableCell align="center">Visit Count</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {peakActivityTimes && peakActivityTimes.length > 0 ? (
                          peakActivityTimes.slice(0, 7).map((p, idx) => (
                            <TableRow key={`${p.dayOfWeek}-${p.peakHour}-${idx}`} hover>
                              <TableCell>{p.dayOfWeek}</TableCell>
                              <TableCell align="center" sx={{ fontWeight: 600 }}>
                                {String(p.peakHour).padStart(2, "0")}:00 -{" "}
                                {String((p.peakHour + 1) % 24).padStart(2, "0")}:00
                              </TableCell>
                              <TableCell align="center">
                                <Chip label={`${p.visitCount} visits`} size="small" color="secondary" />
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                              <Typography variant="body2" color="text.secondary">
                                No traffic peak metrics found.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              </Grid>
            </Grid>

            {/* Card 5: Most Searched Terms */}
            <Box
              sx={{
                p: 3,
                borderRadius: 4,
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: theme.palette.background.paper,
                overflow: "hidden",
                transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                "&:hover": {
                  boxShadow:
                    theme.palette.mode === "dark"
                      ? "0 10px 30px rgba(0,0,0,0.45)"
                      : "0 10px 30px rgba(15,23,42,0.06)",
                  borderColor: alpha(theme.palette.primary.main, 0.25),
                },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="h6" fontWeight={600}>
                    Most Searched Terms
                  </Typography>
                  <Tooltip
                    title="Top search queries submitted in the global search bar, showing total search attempts vs unique users who searched."
                    arrow
                  >
                    <IconButton size="small" aria-label="Most Searched Terms info">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <CardFilterPopover
                  globalFilters={appliedFilters}
                  mainRoutes={mainRoutes}
                  onApply={(filters) => dispatch(fetchTopSearches(filters))}
                  onReset={() => dispatch(fetchTopSearches(appliedFilters))}
                />
              </Box>
              <TableContainer sx={{ overflowX: "auto", width: "100%" }}>
                <Table size="small" sx={{ minWidth: 400 }}>
                  <TableHead
                    sx={{
                      "& .MuiTableCell-root": {
                        fontWeight: 700,
                        color: theme.palette.text.secondary,
                        borderBottom: `2px solid ${theme.palette.divider}`,
                        backgroundColor: alpha(theme.palette.primary.main, 0.03),
                        whiteSpace: "nowrap",
                      },
                    }}
                  >
                    <TableRow>
                      <TableCell>Search Query / Term</TableCell>
                      <TableCell align="center">Total Searches</TableCell>
                      <TableCell align="center">Unique Searches</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topSearches && topSearches.length > 0 ? (
                      topSearches.map((s) => (
                        <TableRow key={s.searchTerm} hover>
                          <TableCell>
                            <Chip
                              label={s.searchTerm}
                              color="info"
                              variant="outlined"
                              size="small"
                              sx={{ fontWeight: 600 }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2" fontWeight={600}>
                              {s.searchCount}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2" fontWeight={600}>
                              {s.uniqueSearchCount ?? 0}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} align="center" sx={{ py: 3 }}>
                          <Typography variant="body2" color="text.secondary">
                            No search metrics found for this filter.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Box>
        )}
      </Container>

      {/* Snackbar for error feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AnalyticsAdminDashboard;