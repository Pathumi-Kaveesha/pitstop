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

import React, { useEffect, useState } from "react";
import {
  Box,
  Container,
  Typography,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
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
  fetchTopContent,
  fetchLeaderboard,
  fetchRegionalTimeSpent,
  fetchPeakActivityTimes,
  fetchTopSearches,
  AnalyticsFilterParams,
} from "@slices/analyticsSlice/analytics";
import { ApiService } from "@utils/apiService";
import { AppConfig } from "@config/config";
import { UserEmailAutocomplete } from "../../component/common/UserEmailAutocomplete";

interface MainRouteOption {
  route_path: string;
  label: string;
}

interface RawRouteResponse {
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
  mainRoutes: MainRouteOption[];
}

const CardFilterPopover: React.FC<CardFilterPopoverProps> = ({
  onApply,
  onReset,
  globalFilters,
  mainRoutes,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [region, setRegion] = useState<string>(globalFilters.region || "");
  const [userEmail, setUserEmail] = useState<string>(globalFilters.userEmail || "");
  const [startDate, setStartDate] = useState<string>(globalFilters.startDate || "");
  const [endDate, setEndDate] = useState<string>(globalFilters.endDate || "");
  const [pageRoute, setPageRoute] = useState<string>(globalFilters.pageRoute || "");
  const [cardDateError, setCardDateError] = useState<string>("");

  useEffect(() => {
    setRegion(globalFilters.region || "");
    setUserEmail(globalFilters.userEmail || "");
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
    onApply({ startDate, endDate, region, userEmail, pageRoute });
    handleClose();
  };

  const handleResetCard = () => {
    setRegion(globalFilters.region || "");
    setUserEmail(globalFilters.userEmail || "");
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
      >
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5, width: 300 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            Card Specific Filter
          </Typography>

          {cardDateError && (
            <Alert severity="error" sx={{ py: 0.5, px: 1, borderRadius: 1, fontSize: "0.75rem" }}>
              {cardDateError}
            </Alert>
          )}

          <FormControl size="small" fullWidth>
            <InputLabel>Page Route</InputLabel>
            <Select
              value={pageRoute}
              label="Page Route"
              onChange={(e) => setPageRoute(e.target.value)}
            >
              <MenuItem value="">All Main Pages</MenuItem>
              {mainRoutes.map((r) => (
                <MenuItem key={r.route_path} value={r.route_path}>
                  {r.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

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

          <FormControl size="small" fullWidth disabled={Boolean(userEmail)}>
            <InputLabel>Region / Team</InputLabel>
            <Select
              value={region}
              label="Region / Team"
              onChange={(e) => setRegion(e.target.value)}
            >
              <MenuItem value="">All Regions</MenuItem>
              <MenuItem value="WSO2 Digital">WSO2 Digital</MenuItem>
              <MenuItem value="NA">NA</MenuItem>
              <MenuItem value="ME">ME</MenuItem>
              <MenuItem value="APAC">APAC</MenuItem>
              <MenuItem value="AFRICA">AFRICA</MenuItem>
              <MenuItem value="LATAM">LATAM</MenuItem>
              <MenuItem value="EU">EU</MenuItem>
              <MenuItem value="UK">UK</MenuItem>
            </Select>
          </FormControl>

          <UserEmailAutocomplete
            value={userEmail}
            onChange={(selectedEmail) => setUserEmail(selectedEmail)}
            label="User Email"
            size="small"
            disabled={Boolean(region)}
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

const AnalyticsAdminDashboard: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  // Global Filter States
  const [globalRegion, setGlobalRegion] = useState<string>("");
  const [globalUserEmail, setGlobalUserEmail] = useState<string>("");
  const [globalStartDate, setGlobalStartDate] = useState<string>("");
  const [globalEndDate, setGlobalEndDate] = useState<string>("");
  const [globalPageRoute, setGlobalPageRoute] = useState<string>("");
  const [dateError, setDateError] = useState<string>("");

  // Top Content Ranking Criterion State
  const [topContentSortBy, setTopContentSortBy] = useState<"totalViews" | "uniqueViews">("totalViews");

  // Main Routes State for Dropdown Filters
  const [mainRoutes, setMainRoutes] = useState<MainRouteOption[]>([]);

  // Snackbar Notification State
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
  const topContent = useAppSelector((state) => state.analytics.topContent);
  const leaderboard = useAppSelector((state) => state.analytics.leaderboard);
  const regionalTimeSpent = useAppSelector((state) => state.analytics.regionalTimeSpent);
  const peakActivityTimes = useAppSelector((state) => state.analytics.peakActivityTimes);
  const topSearches = useAppSelector((state) => state.analytics.topSearches);

  const globalFilterObj: AnalyticsFilterParams = {
    startDate: globalStartDate,
    endDate: globalEndDate,
    region: globalRegion,
    userEmail: globalUserEmail,
    pageRoute: globalPageRoute,
    sortBy: topContentSortBy,
  };

  const handleApplyGlobalFilters = () => {
    if (globalStartDate && globalEndDate && new Date(globalEndDate) < new Date(globalStartDate)) {
      setDateError("End Date must be equal to or later than Start Date.");
      return;
    }

    setDateError("");
    dispatch(fetchAnalyticsSummary(globalFilterObj));
  };

  const handleResetGlobalFilters = () => {
    setGlobalRegion("");
    setGlobalUserEmail("");
    setGlobalStartDate("");
    setGlobalEndDate("");
    setGlobalPageRoute("");
    setTopContentSortBy("totalViews");
    setDateError("");
    dispatch(fetchAnalyticsSummary({ sortBy: "totalViews" }));
  };

  const handleSortChange = (
    _event: React.MouseEvent<HTMLElement>,
    newSortBy: "totalViews" | "uniqueViews" | null
  ) => {
    if (newSortBy !== null) {
      setTopContentSortBy(newSortBy);
      dispatch(fetchTopContent({ ...globalFilterObj, sortBy: newSortBy }));
    }
  };

  useEffect(() => {
    dispatch(fetchAnalyticsSummary({ sortBy: "totalViews" }));

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
          const routes: MainRouteOption[] = rawData
            .map((r) => ({
              route_path: (r.routePath || r.route_path || r.path || "").trim(),
              label: (r.menuItem || r.menu_item || r.title || r.label || "Unnamed Page").trim(),
            }))
            .filter((r) => Boolean(r.route_path));
          setMainRoutes(routes);
        }
      } catch (err) {
        console.error("Failed to load main routes for analytics filters", err);
        setSnackbar({
          open: true,
          message: "Failed to load page routes for analytics filters.",
          severity: "error",
        });
      }
    };

    fetchMainRoutes();
  }, [dispatch]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  // Directly display backend-calculated Average Actions Per Visit
  const avgActionsPerVisit = summary?.avgActionsPerVisit != null
    ? Number(summary.avgActionsPerVisit).toFixed(1)
    : "0.0";

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
              borderRadius: 2,
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

        {/* Global Dynamic Filters Bar */}
        <Paper
          elevation={0}
          sx={{
            p: 2.5,
            mb: 4,
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.background.paper,
          }}
        >
          {dateError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {dateError}
            </Alert>
          )}

          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <FilterListIcon color="action" />

            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Global Page Route</InputLabel>
              <Select
                value={globalPageRoute}
                label="Global Page Route"
                onChange={(e) => setGlobalPageRoute(e.target.value)}
              >
                <MenuItem value="">All Main Pages</MenuItem>
                {mainRoutes.map((r) => (
                  <MenuItem key={r.route_path} value={r.route_path}>
                    {r.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Global Start Date"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: globalEndDate || undefined }}
              value={globalStartDate}
              onChange={(e) => {
                setGlobalStartDate(e.target.value);
                if (dateError) setDateError("");
              }}
            />

            <TextField
              label="Global End Date"
              type="date"
              size="small"
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: globalStartDate || undefined }}
              value={globalEndDate}
              onChange={(e) => {
                setGlobalEndDate(e.target.value);
                if (dateError) setDateError("");
              }}
            />

            <FormControl size="small" sx={{ minWidth: 160 }} disabled={Boolean(globalUserEmail)}>
              <InputLabel>Global Region / Team</InputLabel>
              <Select
                value={globalRegion}
                label="Global Region / Team"
                onChange={(e) => setGlobalRegion(e.target.value)}
              >
                <MenuItem value="">All Regions</MenuItem>
                <MenuItem value="WSO2 Digital">WSO2 Digital</MenuItem>
                <MenuItem value="NA">NA</MenuItem>
                <MenuItem value="ME">ME</MenuItem>
                <MenuItem value="APAC">APAC</MenuItem>
                <MenuItem value="AFRICA">AFRICA</MenuItem>
                <MenuItem value="LATAM">LATAM</MenuItem>
                <MenuItem value="EU">EU</MenuItem>
                <MenuItem value="UK">UK</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ minWidth: 240 }}>
              <UserEmailAutocomplete
                value={globalUserEmail}
                onChange={(selectedEmail) => setGlobalUserEmail(selectedEmail)}
                label="Global User Email"
                size="small"
                disabled={Boolean(globalRegion)}
              />
            </Box>

            <Button
              variant="contained"
              onClick={handleApplyGlobalFilters}
              sx={{ borderRadius: 2, textTransform: "none", px: 3 }}
            >
              Apply Global Filters
            </Button>

            <Button
              variant="text"
              color="primary"
              size="small"
              onClick={handleResetGlobalFilters}
              startIcon={<RefreshIcon />}
              sx={{ textTransform: "none" }}
            >
              Reset
            </Button>
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
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
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
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
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
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
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
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
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
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
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

            {/* Content Performance & Leaderboard Grid */}
            <Grid container spacing={3}>
              {/* Card 1: Top Performing Content Table */}
              <Grid size={{ xs: 12, md: 7 }}>
                <Box
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 1.5,
                      mb: 2.5,
                    }}
                  >
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

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
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

                      <CardFilterPopover
                        globalFilters={globalFilterObj}
                        mainRoutes={mainRoutes}
                        onApply={(filters) =>
                          dispatch(fetchTopContent({ ...filters, sortBy: topContentSortBy }))
                        }
                        onReset={() =>
                          dispatch(fetchTopContent({ ...globalFilterObj, sortBy: topContentSortBy }))
                        }
                      />
                    </Box>
                  </Box>

                  <Table size="small">
                    <TableHead>
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
                        <TableCell align="center">
                          <Tooltip
                            title="Total times this content modal was opened. Opening a preview counts as 1 view, even if an outlink is also clicked inside that modal."
                            arrow
                          >
                            <Typography
                              variant="caption"
                              fontWeight={topContentSortBy === "totalViews" ? 700 : 500}
                              color={topContentSortBy === "totalViews" ? "primary.main" : "text.secondary"}
                              sx={{ cursor: "help" }}
                            >
                              Total Views {topContentSortBy === "totalViews" ? "↓" : ""}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="Number of distinct team members who viewed or opened this content." arrow>
                            <Typography
                              variant="caption"
                              fontWeight={topContentSortBy === "uniqueViews" ? 700 : 500}
                              color={topContentSortBy === "uniqueViews" ? "primary.main" : "text.secondary"}
                              sx={{ cursor: "help" }}
                            >
                              Unique Views {topContentSortBy === "uniqueViews" ? "↓" : ""}
                            </Typography>
                          </Tooltip>
                        </TableCell>
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
                </Box>
              </Grid>

              {/* Card 2: Leaderboard Section */}
              <Grid size={{ xs: 12, md: 5 }}>
                <Box
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <EmojiEventsIcon sx={{ color: "#FFD700" }} />
                      <Typography variant="h6" fontWeight={600}>
                        User Activity Leaderboard
                      </Typography>
                      <Tooltip
                        title="Team members ranked by total active actions taken (slide previews, search queries, link opens), along with total visits and average time spent."
                        arrow
                      >
                        <IconButton size="small" aria-label="User Activity Leaderboard info">
                          <InfoOutlinedIcon fontSize="small" sx={{ color: "text.secondary", opacity: 0.7 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                    <CardFilterPopover
                      globalFilters={globalFilterObj}
                      mainRoutes={mainRoutes}
                      onApply={(filters) => dispatch(fetchLeaderboard(filters))}
                      onReset={() => dispatch(fetchLeaderboard(globalFilterObj))}
                    />
                  </Box>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>User</TableCell>
                        <TableCell align="center">Visits</TableCell>
                        <TableCell align="center">
                          <Typography variant="caption" fontWeight={700} color="primary.main">
                            Actions ↓
                          </Typography>
                        </TableCell>
                        <TableCell align="center">Avg Time Spent</TableCell>
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
                              <Typography variant="body2" fontWeight={600}>
                                {u.visits}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={u.actions}
                                size="small"
                                color="primary"
                                sx={{ fontWeight: 700 }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="body2" fontWeight={500}>
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
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
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
                    <CardFilterPopover
                      globalFilters={globalFilterObj}
                      mainRoutes={mainRoutes}
                      onApply={(filters) => dispatch(fetchRegionalTimeSpent(filters))}
                      onReset={() => dispatch(fetchRegionalTimeSpent(globalFilterObj))}
                    />
                  </Box>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Region / Team</TableCell>
                        <TableCell align="center">Unique Visitors</TableCell>
                        <TableCell align="center">Total Visits</TableCell>
                        <TableCell align="center">Actions</TableCell>
                        <TableCell align="center">Avg Time Spent</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {regionalTimeSpent && regionalTimeSpent.length > 0 ? (
                        regionalTimeSpent.map((r) => (
                          <TableRow key={r.region} hover>
                            <TableCell>
                              <Chip label={r.region} size="small" variant="outlined" color="primary" />
                            </TableCell>
                            <TableCell align="center">{r.uniqueVisits}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 600 }}>
                              {r.totalVisits}
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={r.actions}
                                size="small"
                                color="info"
                                sx={{ fontWeight: 700 }}
                              />
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: 500 }}>
                              {formatTime(r.avgTimeSpentSeconds)}
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
                </Box>
              </Grid>

              {/* Card 4: Peak Activity Times Table */}
              <Grid size={{ xs: 12, md: 6 }}>
                <Box
                  sx={{
                    p: 3,
                    borderRadius: 3,
                    border: `1px solid ${theme.palette.divider}`,
                    backgroundColor: theme.palette.background.paper,
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
                      globalFilters={globalFilterObj}
                      mainRoutes={mainRoutes}
                      onApply={(filters) => dispatch(fetchPeakActivityTimes(filters))}
                      onReset={() => dispatch(fetchPeakActivityTimes(globalFilterObj))}
                    />
                  </Box>
                  <Table size="small">
                    <TableHead>
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
                </Box>
              </Grid>
            </Grid>

            {/* Card 5: Most Searched Terms */}
            <Box
              sx={{
                p: 3,
                borderRadius: 3,
                border: `1px solid ${theme.palette.divider}`,
                backgroundColor: theme.palette.background.paper,
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
                  globalFilters={globalFilterObj}
                  mainRoutes={mainRoutes}
                  onApply={(filters) => dispatch(fetchTopSearches(filters))}
                  onReset={() => dispatch(fetchTopSearches(globalFilterObj))}
                />
              </Box>
              <Table size="small">
                <TableHead>
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