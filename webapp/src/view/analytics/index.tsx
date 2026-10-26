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

import React, { useEffect, useState, useMemo, useRef } from "react";
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
  Switch,
  FormControlLabel,
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
import DownloadIcon from "@mui/icons-material/Download";
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
import { Role } from "@utils/types";
import { UserEmailAutocomplete } from "../../component/common/UserEmailAutocomplete";
import AnalyticsTrendsChart, { TrendDataPoint } from "../analytics/AnalyticsTrendsChart";
import {
  CascadingPageRouteSelector,
  RouteOption,
} from "../analytics/CascadingPageRouteSelector";
import { UniqueVisitorsHover } from "./UniqueVisitorsHover";
import { ExportDetails, ExportHeader, ExportMarker } from "./ExportDetails";
import {
  ALL_METRIC_OPTIONS,
  ExportSection,
  describeFilters,
  formatTimezone,
  normalizeVisitors,
  sameFilters,
  toChartPoints,
} from "./analyticsHelpers";
import { exportDashboardPdf } from "./exportDashboard";

export type TrendGranularity = "daily" | "weekly" | "monthly" | "quarterly";

const AVAILABLE_REGIONS = [
  "NA",
  "ME",
  "APAC",
  "AFRICA",
  "LATAM",
  "LATAM region",
  "EU",
  "UK",
  "UK & EU",
  "Sales Development",
];

const AVAILABLE_TEAMS = ["SALES", "Sales Engineering"];

const uniqueVisitorsLabel = (count: number) => `${count} unique visitor${count === 1 ? "" : "s"}`;

const RANK_LABELS: Record<string, string> = {
  totalViews: "Total Views",
  uniqueViews: "Unique Views",
  actions: "Actions",
  visits: "Visits",
  avgTimeSpentSeconds: "Average Time Spent",
  totalVisits: "Total Visits",
  uniqueVisits: "Unique Visitors",
};

const TIME_METRICS_STORAGE_KEY = "pitstop_analytics_show_time_metrics";

// Explanation texts shown in the info tooltips and repeated in the PDF export.
const INFO_TEXT = {
  totalViews:
    "Total page view duration events recorded on the platform matching your selected filters.",
  uniqueVisitors:
    "Number of distinct team members who logged into and accessed the platform within the selected filters.",
  timeSpent:
    "Total cumulative active session time spent browsing, reading, or navigating the platform.",
  totalActions:
    "Total user interactions performed (including opening previews, clicking external outlinks, or searching). Opening a preview and then clicking its outlink counts as 2 actions.",
  avgActions:
    "Average number of actions per visit (Total Actions ÷ Total Visits). A visit ends after 30 minutes without any activity.",
  topContent:
    "Breaks down engagement per material. Preview Clicks requires successful embedding and 10s+ view time. Outlinks tracks direct external opens. Total Views counts modal openings once.",
  previewClicks:
    "Counted ONLY when content renders successfully in preview AND is viewed for at least 10 seconds. Broken or restricted links do NOT increment preview clicks.",
  outlinks:
    "Counted when opened in a new window/tab (including clicking 'Open in New Window' on restricted or broken preview screens).",
  contentTotalViews:
    "Total times this content modal was opened. Opening a preview counts as 1 view, even if an outlink is also clicked inside that modal.",
  contentUniqueViews:
    "Number of distinct team members who viewed or opened this content.",
  leaderboard:
    "Team members ranked by your selected metric (actions or visits).",
  regional:
    "Platform activity broken down by regional teams, comparing unique visitors, total visits, and total actions.",
  peak:
    "The busiest 1-hour time slot on the platform for each day of the week, based on how many content views happened in that hour.",
  searches:
    "Top search queries submitted in the global search bar, showing total search attempts vs unique users who searched.",
};

const PROD_LAUNCH_DATE = new Date(2026, 7, 21);
PROD_LAUNCH_DATE.setHours(0, 0, 0, 0);

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
  const [teams, setTeams] = useState<string[]>(
    globalFilters.team
      ? globalFilters.team.split(",").map((t) => t.trim()).filter(Boolean)
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
    setTeams(
      globalFilters.team
        ? globalFilters.team.split(",").map((t) => t.trim()).filter(Boolean)
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
      team: teams.join(","),
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
    setTeams(
      globalFilters.team
        ? globalFilters.team.split(",").map((t) => t.trim()).filter(Boolean)
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
              Region
            </InputLabel>
            <Select
              labelId="card-region-label"
              multiple
              displayEmpty
              value={regions}
              label="Region"
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

          <FormControl size="small" fullWidth disabled={userEmails.length > 0}>
            <InputLabel shrink id="card-team-label">
              Team
            </InputLabel>
            <Select
              labelId="card-team-label"
              multiple
              displayEmpty
              value={teams}
              label="Team"
              onChange={(e) => {
                const val = e.target.value;
                setTeams(typeof val === "string" ? val.split(",") : val);
              }}
              renderValue={(selected) =>
                selected.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                    All Teams
                  </Typography>
                ) : (
                  selected.join(", ")
                )
              }
              sx={{ height: 40 }}
            >
              {AVAILABLE_TEAMS.map((t) => (
                <MenuItem key={t} value={t}>
                  <Checkbox size="small" checked={teams.indexOf(t) > -1} />
                  <ListItemText primary={t} />
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
            disabled={regions.length > 0 || teams.length > 0}
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

// A sortable number: an orange ball when its column is the one being sorted, plain text otherwise.
const MetricValue = ({
  value,
  active,
  showPeopleIcon = false,
}: {
  value: React.ReactNode;
  active: boolean;
  showPeopleIcon?: boolean;
}) =>
  active ? (
    <Chip
      icon={showPeopleIcon ? <PeopleIcon sx={{ fontSize: "14px !important" }} /> : undefined}
      label={value}
      size="small"
      color="primary"
      sx={{ fontWeight: 700 }}
    />
  ) : (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
      {showPeopleIcon && <PeopleIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );

const AnalyticsAdminDashboard: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const timezoneOffsetMinutes = useMemo(() => -new Date().getTimezoneOffset(), []);

  const canToggleTimeMetrics = useAppSelector(
    (state) =>
      state.auth.roles?.some((role) => role === Role.SALES_ADMIN || role === Role.ANALYTICS_VIEWER) ?? false
  );
  const [adminShowTime, setAdminShowTime] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TIME_METRICS_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const showTimeMetrics = canToggleTimeMetrics && adminShowTime;
  const kpiCardColumns = showTimeMetrics ? 2.4 : 3;

  const [globalRegions, setGlobalRegions] = useState<string[]>([]);
  const [globalTeams, setGlobalTeams] = useState<string[]>([]);
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
  const [cardTopContentFilters, setCardTopContentFilters] = useState<AnalyticsFilterParams | null>(null);
  const [cardPeakFilters, setCardPeakFilters] = useState<AnalyticsFilterParams | null>(null);
  const [cardSearchesFilters, setCardSearchesFilters] = useState<AnalyticsFilterParams | null>(null);
  const [trendMetricIds, setTrendMetricIds] = useState<string[]>(["totalViews", "uniqueViews"]);
  // Everything the PDF needs is frozen at click time, so the user can keep using the page meanwhile.
  const [exportJob, setExportJob] = useState<{
    startedAt: Date;
    background: string;
    exportedAtLabel: string;
    filterLines: string[];
    sections: ExportSection[];
  } | null>(null);
  const isExporting = exportJob !== null;
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);

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
  const trendsStatus = useAppSelector((state) => state.analytics.trendsStatus);
  const topContentStatus = useAppSelector((state) => state.analytics.topContentStatus);
  const leaderboardStatus = useAppSelector((state) => state.analytics.leaderboardStatus);
  const regionalStatus = useAppSelector((state) => state.analytics.regionalStatus);
  const peakStatus = useAppSelector((state) => state.analytics.peakStatus);
  const searchesStatus = useAppSelector((state) => state.analytics.searchesStatus);
  const userInfo = useAppSelector((state) => state.auth.userInfo);
  const decodedIdToken = useAppSelector((state) => state.auth.decodedIdToken);

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
      team: globalTeams.join(","),
      userEmail: globalUserEmails.join(","),
      pageRoute: globalPageRoute,
      sortBy: topContentSortBy,
      timezoneOffsetMinutes: timezoneOffsetMinutes,
    };

    setAppliedFilters(newApplied);
    setTrendFilters(null);
    setCardLeaderboardFilters(null);
    setCardRegionalFilters(null);
    setCardTopContentFilters(null);
    setCardPeakFilters(null);
    setCardSearchesFilters(null);
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
    setGlobalTeams([]);
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
    setCardTopContentFilters(null);
    setCardPeakFilters(null);
    setCardSearchesFilters(null);
    dispatch(clearTrendsOverride());
    dispatch(fetchAnalyticsSummary(resetApplied));
  };

  const handleSortChange = (
    _event: React.MouseEvent<HTMLElement> | null,
    newSortBy: "totalViews" | "uniqueViews" | null
  ) => {
    if (newSortBy !== null) {
      setTopContentSortBy(newSortBy);
      dispatch(fetchTopContent({ ...(cardTopContentFilters || appliedFilters), sortBy: newSortBy }));
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

  const handleTimeMetricsToggle = (checked: boolean) => {
    setAdminShowTime(checked);
    try {
      localStorage.setItem(TIME_METRICS_STORAGE_KEY, String(checked));
    } catch {
      // storage unavailable, the choice just won't be remembered
    }
    if (!checked) {
      if (leaderboardSortBy === "avgTimeSpentSeconds") {
        handleLeaderboardSortChange(null, "actions");
      }
      if (regionalSortBy === "avgTimeSpentSeconds") {
        handleRegionalSortChange(null, "totalVisits");
      }
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
      start = minDate > defaultStart ? minDate : defaultStart;
      end = new Date(today);
    } else {
      start = defaultStart;
      end = new Date(today);
    }

    if (start < PROD_LAUNCH_DATE) {
      start = new Date(PROD_LAUNCH_DATE);
    }
    if (end < start) {
      end = new Date(start);
    }

    const dailyPoints: {
      dateKey: string;
      dateObj: Date;
      totalViews: number;
      uniqueViews: number;
      timeSpentSeconds: number;
      totalEngagements: number;
      avgActionsPerVisit: number;
      visitorEmails: string[];
      sessionIds: string[];
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
        visitorEmails: item?.visitorEmails || [],
        sessionIds: item?.sessionIds || [],
      });

      current.setDate(current.getDate() + 1);
    }

    if (granularity === "daily") {
      return dailyPoints.map((pt) => ({
        date: pt.dateKey,
        startDate: pt.dateKey,
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
        startDate: string;
        label: string;
        fullLabel: string;
        totalViews: number;
        timeSpentSeconds: number;
        totalEngagements: number;
        visitors: Set<string>;
        sessions: Set<string>;
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

      if (existing) {
        existing.totalViews += pt.totalViews;
        existing.timeSpentSeconds += pt.timeSpentSeconds;
        existing.totalEngagements += pt.totalEngagements;
        pt.visitorEmails.forEach((e) => existing.visitors.add(e));
        pt.sessionIds.forEach((s) => existing.sessions.add(s));
      } else {
        aggregatedMap.set(groupKey, {
          startDate: pt.dateKey,
          label,
          fullLabel,
          totalViews: pt.totalViews,
          timeSpentSeconds: pt.timeSpentSeconds,
          totalEngagements: pt.totalEngagements,
          visitors: new Set(pt.visitorEmails),
          sessions: new Set(pt.sessionIds),
        });
      }
    });

    return Array.from(aggregatedMap.values()).map((agg) => ({
      date: agg.label,
      startDate: agg.startDate,
      formattedDate: agg.fullLabel,
      totalViews: agg.totalViews,
      uniqueViews: agg.visitors.size,
      timeSpentSeconds: agg.timeSpentSeconds,
      totalEngagements: agg.totalEngagements,
      avgActionsPerVisit:
        agg.sessions.size > 0
          ? Number((agg.totalEngagements / agg.sessions.size).toFixed(2))
          : 0,
    }));
  }, [trends, trendsOverridden, summary, trendFilters, appliedFilters, granularity]);

  const markerIds = [
    "totalViews",
    "uniqueVisitors",
    ...(showTimeMetrics ? ["timeSpent"] : []),
    "totalActions",
    "avgActions",
    "trends",
    "topContent",
    "leaderboard",
    "regional",
    "peak",
    "searches",
  ];
  const markerOf = (id: string) => markerIds.indexOf(id) + 1;

  const exporterEmail = userInfo?.email || "";
  const tokenClaims = (decodedIdToken || {}) as Record<string, unknown>;
  const exporterName =
    [tokenClaims.given_name, tokenClaims.family_name]
      .filter((part): part is string => typeof part === "string" && part.trim() !== "")
      .join(" ") ||
    userInfo?.displayName ||
    userInfo?.username ||
    exporterEmail ||
    "Unknown user";

  const cardFilterLines = (cardFilters: AnalyticsFilterParams | null) =>
    cardFilters && !sameFilters(cardFilters, appliedFilters) ? describeFilters(cardFilters, mainRoutes) : undefined;

  const buildExportSections = (): ExportSection[] => {
    const totalVisitors = normalizeVisitors(summary?.totalUniqueVisitorDetails);
    const chartMetrics = ALL_METRIC_OPTIONS.filter(
      (m) => (showTimeMetrics || m.id !== "timeSpentSeconds") && trendMetricIds.includes(m.id)
    );
    const chartPoints = toChartPoints(realTrendData, false);

    const sections: ExportSection[] = [
      { marker: markerOf("totalViews"), title: "Total Views", lines: [INFO_TEXT.totalViews] },
      {
        marker: markerOf("uniqueVisitors"),
        title: "Unique Visitors",
        lines: [INFO_TEXT.uniqueVisitors],
        visitorGroups: [{ label: uniqueVisitorsLabel(totalVisitors.length), visitors: totalVisitors }],
      },
    ];
    if (showTimeMetrics) {
      sections.push({ marker: markerOf("timeSpent"), title: "Time Spent on Platform", lines: [INFO_TEXT.timeSpent] });
    }
    sections.push(
      { marker: markerOf("totalActions"), title: "Total Actions Taken", lines: [INFO_TEXT.totalActions] },
      { marker: markerOf("avgActions"), title: "Avg Actions Per Visit", lines: [INFO_TEXT.avgActions] },
      {
        marker: markerOf("trends"),
        title: "Metrics Over Time",
        lines: [
          `Grouped by: ${granularity.charAt(0).toUpperCase()}${granularity.slice(1)}`,
          `Metrics shown: ${chartMetrics.map((m) => m.label).join(", ")}`,
          chartPoints.length > 0
            ? "The exact values behind each point on the chart (what the hover box shows):"
            : "No analytics trend data recorded for the selected filter.",
        ],
        cardFilters: cardFilterLines(trendFilters),
        table:
          chartPoints.length > 0
            ? {
                columns: ["Date", ...chartMetrics.map((m) => m.label)],
                rows: chartPoints.map((pt) => [
                  pt.formattedDate || pt.date,
                  ...chartMetrics.map((m) => m.formatValue(Number(pt[m.id] ?? 0))),
                ]),
              }
            : undefined,
      },
      {
        marker: markerOf("topContent"),
        title: "Top Performing Content Breakdown",
        lines: [
          INFO_TEXT.topContent,
          `Preview Clicks: ${INFO_TEXT.previewClicks}`,
          `Outlinks: ${INFO_TEXT.outlinks}`,
          `Total Views: ${INFO_TEXT.contentTotalViews}`,
          `Unique Views: ${INFO_TEXT.contentUniqueViews}`,
          `Ranked by: ${RANK_LABELS[topContentSortBy]}`,
          (topContent || []).length > 0
            ? "Full content titles and the people who viewed each one:"
            : "No content analytics found for the selected route/filter.",
        ],
        cardFilters: cardFilterLines(cardTopContentFilters),
        visitorGroups: (topContent || []).map((c, idx) => {
          const visitors = normalizeVisitors(c.uniqueVisitorDetails);
          return { label: `${idx + 1}. ${c.title} – ${uniqueVisitorsLabel(visitors.length)}`, visitors };
        }),
      },
      {
        marker: markerOf("leaderboard"),
        title: "User Activity Leaderboard",
        lines: [
          INFO_TEXT.leaderboard,
          "Admins and members of the analytics viewer group are not counted in this list.",
          `Ranked by: ${RANK_LABELS[leaderboardSortBy]}`,
        ],
        cardFilters: cardFilterLines(cardLeaderboardFilters),
      },
      {
        marker: markerOf("regional"),
        title: "Global Team Performance",
        lines: [
          INFO_TEXT.regional,
          `Ranked by: ${RANK_LABELS[regionalSortBy]}`,
          (regionalTimeSpent || []).length > 0 ? "Unique visitors in each region / team:" : "No team metrics found.",
        ],
        cardFilters: cardFilterLines(cardRegionalFilters),
        visitorGroups: (regionalTimeSpent || []).map((r) => {
          const visitors = normalizeVisitors(r.uniqueVisitorDetails);
          return { label: `${r.region} – ${uniqueVisitorsLabel(visitors.length)}`, visitors };
        }),
      },
      {
        marker: markerOf("peak"),
        title: "Peak Activity Windows",
        lines: [INFO_TEXT.peak],
        cardFilters: cardFilterLines(cardPeakFilters),
      },
      {
        marker: markerOf("searches"),
        title: "Most Searched Terms",
        lines: [INFO_TEXT.searches],
        cardFilters: cardFilterLines(cardSearchesFilters),
      }
    );
    return sections;
  };

  const showExportProblem = (message: string) => {
    setSnackbar({ open: true, message, severity: "warning" });
  };

  const handleExport = () => {
    if (isExporting) return;

    const statuses = [status, trendsStatus, topContentStatus, leaderboardStatus, regionalStatus, peakStatus, searchesStatus];
    if (statuses.includes("loading")) {
      showExportProblem("Please wait until every card has finished loading, then export again.");
      return;
    }
    if (statuses.includes("failed")) {
      showExportProblem("Some cards could not be loaded. Reload the page and try again, so the file shows real numbers.");
      return;
    }

    const pendingFilters = {
      startDate: globalStartDate,
      endDate: globalEndDate,
      region: globalRegions.join(","),
      team: globalTeams.join(","),
      userEmail: globalUserEmails.join(","),
      pageRoute: globalPageRoute,
    };
    if (!sameFilters(pendingFilters, appliedFilters)) {
      showExportProblem(
        "You changed the global filters but did not apply them. Click Apply Filters (or Reset) first, so the file matches the numbers."
      );
      return;
    }

    const tables = Array.from(
      dashboardRef.current?.querySelectorAll<HTMLElement>(".MuiTableContainer-root") ?? []
    );
    if (tables.some((table) => table.scrollWidth > table.clientWidth + 1)) {
      showExportProblem(
        "Some tables are cut off because the window is too narrow. Make the window wider (or zoom out), then export again."
      );
      return;
    }

    const startedAt = new Date();
    setSnackbar((prev) => ({ ...prev, open: false }));
    setExportJob({
      startedAt,
      background: theme.palette.mode === "dark" ? theme.palette.background.default : theme.palette.common.white,
      exportedAtLabel: `${startedAt.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })} (${formatTimezone(timezoneOffsetMinutes)})`,
      filterLines: describeFilters(appliedFilters, mainRoutes),
      sections: buildExportSections(),
    });
  };

  useEffect(() => {
    if (!exportJob) return;
    let active = true;

    const run = async () => {
      try {
        const dashboard = dashboardRef.current;
        if (!dashboard) throw new Error("The dashboard is not on the page.");
        const at = exportJob.startedAt;
        const pad = (n: number) => String(n).padStart(2, "0");
        const fileName = `pitstop-analytics-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(
          at.getHours()
        )}${pad(at.getMinutes())}.pdf`;
        await exportDashboardPdf({
          dashboard,
          details: detailsRef.current,
          backgroundColor: exportJob.background,
          fileName,
        });
        if (active) setSnackbar({ open: true, message: "PDF downloaded.", severity: "success" });
      } catch (err) {
        console.error("Failed to export the analytics dashboard", err);
        if (active) {
          setSnackbar({ open: true, message: "Could not create the PDF. Please try again.", severity: "error" });
        }
      } finally {
        if (active) setExportJob(null);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [exportJob]);

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
      {/* flow-root keeps child margins inside, so the export measures the full height */}
      <Container maxWidth="xl" ref={dashboardRef} sx={{ display: "flow-root" }}>
        {exportJob && (
          <ExportHeader
            exporterName={exporterName}
            exporterEmail={exporterEmail}
            exportedAtLabel={exportJob.exportedAtLabel}
            filterLines={exportJob.filterLines}
          />
        )}

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
          <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 2 }}>
            {canToggleTimeMetrics && (
              <FormControlLabel
                control={
                  <Switch
                    checked={adminShowTime}
                    onChange={(e) => handleTimeMetricsToggle(e.target.checked)}
                  />
                }
                label="Show time metrics"
              />
            )}
            <Button
              variant="outlined"
              size="small"
              startIcon={isExporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
              onClick={handleExport}
              disabled={isExporting}
              data-export-hide="true"
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
            >
              {isExporting ? "Exporting…" : "Export PDF"}
            </Button>
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

            {/* Region Multi-Select Dropdown */}
            <FormControl
              size="small"
              sx={{
                flex: "1 1 0px",
                minWidth: 0,
              }}
              disabled={globalUserEmails.length > 0}
            >
              <InputLabel shrink id="global-region-select-label">
                Region
              </InputLabel>
              <Select
                labelId="global-region-select-label"
                multiple
                displayEmpty
                value={globalRegions}
                label="Region"
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

            {/* Team Multi-Select Dropdown */}
            <FormControl
              size="small"
              sx={{
                flex: "1 1 0px",
                minWidth: 0,
              }}
              disabled={globalUserEmails.length > 0}
            >
              <InputLabel shrink id="global-team-select-label">
                Team
              </InputLabel>
              <Select
                labelId="global-team-select-label"
                multiple
                displayEmpty
                value={globalTeams}
                label="Team"
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalTeams(typeof val === "string" ? val.split(",") : val);
                }}
                renderValue={(selected) => {
                  if (selected.length === 0) {
                    return (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontSize: "0.8125rem", fontStyle: "normal" }}
                      >
                        All Teams
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
                        {selected.join(", ")}
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
                {AVAILABLE_TEAMS.map((t) => (
                  <MenuItem key={t} value={t}>
                    <Checkbox size="small" checked={globalTeams.indexOf(t) > -1} />
                    <ListItemText primary={t} />
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
                disabled={globalRegions.length > 0 || globalTeams.length > 0}
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
              <Grid size={{ xs: 12, sm: 6, md: kpiCardColumns }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    position: "relative",
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
                    title={INFO_TEXT.totalViews}
                    arrow
                  >
                    <IconButton size="small" aria-label="Total Views info">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                  <ExportMarker n={markerOf("totalViews")} />
                </Paper>
              </Grid>

              {/* Card 2: Unique Visitors with Paginated Hover Popover */}
              <Grid size={{ xs: 12, sm: 6, md: kpiCardColumns }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    position: "relative",
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
                  <UniqueVisitorsHover
                    visitors={summary?.totalUniqueVisitorDetails || []}
                    sx={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}
                  >
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
                    <Box sx={{ display: "flex", flexDirection: "column" }}>
                      <Typography variant="caption" color="text.secondary">
                        Unique Visitors
                      </Typography>
                      <Typography variant="h5" fontWeight={700}>
                        {summary?.totalUniqueViews ?? 0}
                      </Typography>
                    </Box>
                  </UniqueVisitorsHover>

                  <Tooltip
                    title={INFO_TEXT.uniqueVisitors}
                    arrow
                  >
                    <IconButton size="small" aria-label="Unique Visitors info">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                  <ExportMarker n={markerOf("uniqueVisitors")} />
                </Paper>
              </Grid>

              {/* Card 3: Time Spent on Platform */}
              {showTimeMetrics && (
              <Grid size={{ xs: 12, sm: 6, md: kpiCardColumns }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    position: "relative",
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
                    title={INFO_TEXT.timeSpent}
                    arrow
                  >
                    <IconButton size="small" aria-label="Time Spent on Platform info">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                  <ExportMarker n={markerOf("timeSpent")} />
                </Paper>
              </Grid>
              )}

              {/* Card 4: Total Platform Engagements */}
              <Grid size={{ xs: 12, sm: 6, md: kpiCardColumns }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    position: "relative",
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
                    title={INFO_TEXT.totalActions}
                    arrow
                  >
                    <IconButton size="small" aria-label="Total Actions Taken info">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                  <ExportMarker n={markerOf("totalActions")} />
                </Paper>
              </Grid>

              {/* Card 5: Average Actions per Visit */}
              <Grid size={{ xs: 12, sm: 6, md: kpiCardColumns }}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    position: "relative",
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
                    title={INFO_TEXT.avgActions}
                    arrow
                  >
                    <IconButton size="small" aria-label="Average Actions Per Visit info">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                  <ExportMarker n={markerOf("avgActions")} />
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
              <AnalyticsTrendsChart
                trendData={realTrendData}
                showTimeMetrics={showTimeMetrics}
                onSelectedMetricsChange={setTrendMetricIds}
                animate={!isExporting}
              />
              <ExportMarker n={markerOf("trends")} />
            </Box>

            {/* Content Performance & Leaderboard Grid */}
            <Grid container spacing={3}>
              {/* Card 1: Top Performing Content Table */}
              <Grid size={{ xs: 12, md: 7 }}>
                <Box
                  sx={{
                    p: 3,
                    position: "relative",
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
                          title={INFO_TEXT.topContent}
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
                        onApply={(filters) => {
                          setCardTopContentFilters(filters);
                          dispatch(fetchTopContent({ ...filters, sortBy: topContentSortBy }));
                        }}
                        onReset={() => {
                          setCardTopContentFilters(null);
                          dispatch(fetchTopContent({ ...appliedFilters, sortBy: topContentSortBy }));
                        }}
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
                          <TableCell align="center">
                            <Tooltip
                              title={INFO_TEXT.previewClicks}
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
                              title={INFO_TEXT.outlinks}
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
                            tooltipTitle={INFO_TEXT.contentTotalViews}
                          />
                          <SortableHeaderCell
                            metric="uniqueViews"
                            activeMetric={topContentSortBy}
                            label="Unique Views"
                            onSort={(m) => handleSortChange(null, m)}
                            tooltipTitle={INFO_TEXT.contentUniqueViews}
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
                                <MetricValue value={c.totalViews} active={topContentSortBy === "totalViews"} />
                              </TableCell>

                              {/* Unique Views with Paginated Hover Popover */}
                              <TableCell align="center">
                                <UniqueVisitorsHover visitors={c.uniqueVisitorDetails || []}>
                                  <MetricValue value={c.uniqueViews} active={topContentSortBy === "uniqueViews"} showPeopleIcon />
                                </UniqueVisitorsHover>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                              <Typography variant="body2" color="text.secondary">
                                No content analytics found for the selected route/filter.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <ExportMarker n={markerOf("topContent")} />
                </Box>
              </Grid>

              {/* Card 2: Leaderboard Section */}
              <Grid size={{ xs: 12, md: 5 }}>
                <Box
                  sx={{
                    p: 3,
                    position: "relative",
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
                          title={INFO_TEXT.leaderboard}
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
                        {showTimeMetrics && (
                          <ToggleButton value="avgTimeSpentSeconds" sx={{ px: 1.2, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                            By Avg Time
                          </ToggleButton>
                        )}
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
                          {showTimeMetrics && (
                            <SortableHeaderCell
                              metric="avgTimeSpentSeconds"
                              activeMetric={leaderboardSortBy}
                              label="Avg Time Spent"
                              onSort={(m) => handleLeaderboardSortChange(null, m)}
                            />
                          )}
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
                                <MetricValue value={u.visits} active={leaderboardSortBy === "visits"} />
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
                              {showTimeMetrics && (
                                <TableCell align="center">
                                  <MetricValue value={formatTime(u.avgTimeSpentSeconds)} active={leaderboardSortBy === "avgTimeSpentSeconds"} />
                                </TableCell>
                              )}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={showTimeMetrics ? 4 : 3} align="center" sx={{ py: 3 }}>
                              <Typography variant="body2" color="text.secondary">
                                No user activity recorded for this route/filter.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <ExportMarker n={markerOf("leaderboard")} />
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
                    position: "relative",
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
                          title={INFO_TEXT.regional}
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
                        {showTimeMetrics && (
                          <ToggleButton value="avgTimeSpentSeconds" sx={{ px: 1.2, py: 0.5, fontSize: "0.75rem", fontWeight: 600 }}>
                            By Avg Time
                          </ToggleButton>
                        )}
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
                          {showTimeMetrics && (
                            <SortableHeaderCell
                              metric="avgTimeSpentSeconds"
                              activeMetric={regionalSortBy}
                              label="Avg Time Spent"
                              onSort={(m) => handleRegionalSortChange(null, m)}
                            />
                          )}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {regionalTimeSpent && regionalTimeSpent.length > 0 ? (
                          regionalTimeSpent.map((r) => (
                            <TableRow key={r.region} hover>
                              <TableCell>
                                <Chip label={r.region} size="small" variant="outlined" color="primary" />
                              </TableCell>

                              {/* Unique Visitors with Paginated Hover Popover */}
                              <TableCell align="center">
                                <UniqueVisitorsHover visitors={r.uniqueVisitorDetails || []}>
                                  <MetricValue value={r.uniqueVisits} active={regionalSortBy === "uniqueVisits"} />
                                </UniqueVisitorsHover>
                              </TableCell>

                              <TableCell align="center">
                                <MetricValue value={r.totalVisits} active={regionalSortBy === "totalVisits"} />
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
                              {showTimeMetrics && (
                                <TableCell align="center">
                                  <MetricValue value={formatTime(r.avgTimeSpentSeconds)} active={regionalSortBy === "avgTimeSpentSeconds"} />
                                </TableCell>
                              )}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={showTimeMetrics ? 5 : 4} align="center" sx={{ py: 3 }}>
                              <Typography variant="body2" color="text.secondary">
                                No team metrics found.
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <ExportMarker n={markerOf("regional")} />
                </Box>
              </Grid>

              {/* Card 4: Peak Activity Times Table */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Box
                  sx={{
                    p: 3,
                    position: "relative",
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
                        title={INFO_TEXT.peak}
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
                      onApply={(filters) => {
                        setCardPeakFilters(filters);
                        dispatch(fetchPeakActivityTimes(filters));
                      }}
                      onReset={() => {
                        setCardPeakFilters(null);
                        dispatch(fetchPeakActivityTimes(appliedFilters));
                      }}
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
                          <TableCell align="center">View Count</TableCell>
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
                                <Chip label={`${p.visitCount} views`} size="small" color="secondary" />
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
                  <ExportMarker n={markerOf("peak")} />
                </Box>
              </Grid>
            </Grid>

            {/* Card 5: Most Searched Terms */}
            <Box
              sx={{
                p: 3,
                position: "relative",
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
                    title={INFO_TEXT.searches}
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
                  onApply={(filters) => {
                    setCardSearchesFilters(filters);
                    dispatch(fetchTopSearches(filters));
                  }}
                  onReset={() => {
                    setCardSearchesFilters(null);
                    dispatch(fetchTopSearches(appliedFilters));
                  }}
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
              <ExportMarker n={markerOf("searches")} />
            </Box>
          </Box>
        )}
      </Container>

      {exportJob && (
        <Container maxWidth="xl" ref={detailsRef} data-export-only="block" sx={{ display: "none" }}>
          <ExportDetails sections={exportJob.sections} />
        </Container>
      )}

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
