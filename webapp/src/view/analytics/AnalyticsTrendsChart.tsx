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

import React, { useState, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  Popover,
  FormGroup,
  FormControlLabel,
  Checkbox,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";

export interface TrendDataPoint {
  date: string;
  formattedDate?: string;
  totalViews: number;
  uniqueViews: number;
  timeSpentSeconds: number;
  totalEngagements: number;
  avgActionsPerVisit: number;
}

interface MetricConfig {
  id: keyof Omit<TrendDataPoint, "date" | "formattedDate">;
  label: string;
  color: string;
  yAxisId: "left" | "right";
  formatValue: (val: number) => string;
}

const METRIC_OPTIONS: MetricConfig[] = [
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

interface AnalyticsTrendsChartProps {
  trendData: TrendDataPoint[];
}

export const AnalyticsTrendsChart: React.FC<AnalyticsTrendsChartProps> = ({
  trendData = [],
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Selected metrics state (default: Total Views & Unique Visitors)
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    "totalViews",
    "uniqueViews",
  ]);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleOpenPopover = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClosePopover = () => {
    setAnchorEl(null);
  };

  const handleMetricToggle = (metricId: string) => {
    setSelectedMetrics((prev) => {
      if (prev.includes(metricId)) {
        if (prev.length === 1) return prev; // Prevent deselecting all
        return prev.filter((id) => id !== metricId);
      } else {
        return [...prev, metricId];
      }
    });
  };

  const open = Boolean(anchorEl);

  // Timezone-safe local date parser to avoid UTC day-of-week shift bugs
  const formattedChartData = useMemo(() => {
    const isWideRange = trendData.length > 14;

    return trendData.map((item) => {
      if (!item.date) return { ...item, displayDate: "N/A", formattedDate: "N/A" };

      const cleanDateStr = item.date.split("T")[0];
      const parts = cleanDateStr.split("-").map(Number);

      // Only parse YYYY-MM-DD daily date strings
      let parsedDate: Date | null = null;
      if (parts.length === 3 && !parts.some(isNaN)) {
        parsedDate = new Date(parts[0], parts[1] - 1, parts[2]);
      }

      if (parsedDate && !isNaN(parsedDate.getTime())) {
        return {
          ...item,
          displayDate: parsedDate.toLocaleDateString("en-US", {
            weekday: isWideRange || isMobile ? undefined : "short",
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
  }, [trendData, isMobile]);

  // Smart calculation for X-Axis tick label sampling based on total range size
  const xAxisInterval = useMemo(() => {
    const totalDays = formattedChartData.length;
    if (totalDays <= 14) return 0; // Show every single day
    if (totalDays <= 30) return 2; // Show every 3rd day
    if (totalDays <= 60) return 5; // Show roughly weekly
    return Math.floor(totalDays / 8); // Show ~8 evenly spaced tick labels
  }, [formattedChartData.length]);

  const isLargeRange = formattedChartData.length > 25;
  const isTimeSpentSelected = selectedMetrics.includes("timeSpentSeconds");

  // Custom Black Tooltip matching design specs
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0]?.payload;
      const displayDate = dataPoint?.formattedDate || label;

      return (
        <Box
          sx={{
            backgroundColor: "#000000",
            color: "#ffffff",
            p: 1.5,
            borderRadius: "8px",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
            minWidth: 170,
          }}
        >
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, mb: 1, fontSize: "0.85rem" }}
          >
            {displayDate}
          </Typography>

          {payload.map((entry: any) => {
            const config = METRIC_OPTIONS.find((m) => m.id === entry.dataKey);
            if (!config) return null;

            const formattedVal = config.formatValue(entry.value);

            return (
              <Box
                key={entry.dataKey}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  my: 0.5,
                }}
              >
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: config.color,
                  }}
                />
                <Typography variant="body2" sx={{ fontSize: "0.85rem" }}>
                  <strong style={{ fontWeight: 700 }}>{formattedVal}</strong>{" "}
                  {config.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      );
    }
    return null;
  };

  const activeMetricConfigs = useMemo(() => {
    return METRIC_OPTIONS.filter((m) => selectedMetrics.includes(m.id));
  }, [selectedMetrics]);

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 3 },
        borderRadius: 4,
        border: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
      }}
    >
      <Typography variant="h6" fontWeight={600} sx={{ mb: { xs: 2, sm: 3 } }}>
        Metrics Over Time
      </Typography>

      {formattedChartData && formattedChartData.length > 0 ? (
        <>
          {/* Dual Y-Axis Line Chart */}
          <Box sx={{ width: "100%", height: { xs: 280, sm: 340 } }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={formattedChartData}
                margin={{
                  top: 10,
                  right: isTimeSpentSelected ? (isMobile ? 35 : 50) : (isMobile ? 20 : 40),
                  left: isMobile ? -25 : -20,
                  bottom: 0,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={true}
                  horizontal={true}
                  stroke={theme.palette.divider}
                  opacity={0.4}
                />
                <XAxis
                  dataKey="displayDate"
                  interval={xAxisInterval}
                  minTickGap={isMobile ? 28 : 15} // Higher gap on mobile prevents tick label collisions
                  tickLine={false}
                  axisLine={{ stroke: theme.palette.divider }}
                  tick={{
                    fontSize: isMobile ? 10 : isLargeRange ? 11 : 12,
                    fill: theme.palette.text.secondary,
                  }}
                />

                {/* Left Y-Axis for Count & Average Metrics */}
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  domain={[0, (dataMax: number) => Math.max(dataMax, 4)]}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: isMobile ? 10 : 12, fill: theme.palette.text.secondary }}
                />

                {/* Right Y-Axis for Duration Metrics */}
                {isTimeSpentSelected && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(seconds) => {
                      const mins = Math.floor(seconds / 60);
                      return `${mins}m`;
                    }}
                    tick={{ fontSize: isMobile ? 10 : 12, fill: "#ed6c02" }}
                  />
                )}

                <RechartsTooltip content={<CustomTooltip />} />

                {activeMetricConfigs.map((config, idx) => {
                  const lineStrokeWidth = idx === 0 ? 3.0 : idx === 1 ? 2.0 : 1.5;
                  const dotRadius = idx === 0 ? 3.5 : 2.5;

                  return (
                    <Line
                      key={config.id}
                      yAxisId={config.yAxisId}
                      type="monotone"
                      dataKey={config.id}
                      name={config.label}
                      stroke={config.color}
                      strokeWidth={lineStrokeWidth}
                      strokeOpacity={0.88}
                      dot={
                        isLargeRange
                          ? false // Hide dots on large ranges so the line remains crisp & smooth
                          : {
                              r: dotRadius,
                              fill: config.color,
                              stroke: "#ffffff",
                              strokeWidth: 1,
                            }
                      }
                      activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2 }}
                      isAnimationActive={true}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </Box>

          {/* Controls & Legend Bar */}
          <Box
            sx={{
              display: "flex",
              alignItems: { xs: "flex-start", sm: "center" },
              flexDirection: { xs: "column", sm: "row" },
              gap: 2,
              mt: 2,
            }}
          >
            <Button
              variant="outlined"
              onClick={handleOpenPopover}
              endIcon={
                open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />
              }
              sx={{
                borderRadius: "10px",
                textTransform: "none",
                borderColor: theme.palette.divider,
                color: theme.palette.text.primary,
                fontWeight: 500,
                px: 2,
                py: 0.8,
                "&:hover": {
                  borderColor: theme.palette.text.secondary,
                  backgroundColor: "transparent",
                },
              }}
            >
              Choose metrics
            </Button>

            <Popover
              open={open}
              anchorEl={anchorEl}
              onClose={handleClosePopover}
              anchorOrigin={{ vertical: "top", horizontal: "left" }}
              transformOrigin={{ vertical: "bottom", horizontal: "left" }}
              PaperProps={{
                sx: {
                  p: 1.5,
                  width: 280,
                  borderRadius: "12px",
                  boxShadow: "0 6px 24px rgba(0, 0, 0, 0.12)",
                },
              }}
            >
              <FormGroup>
                {METRIC_OPTIONS.map((config) => {
                  const checked = selectedMetrics.includes(config.id);
                  return (
                    <FormControlLabel
                      key={config.id}
                      control={
                        <Checkbox
                          checked={checked}
                          onChange={() => handleMetricToggle(config.id)}
                          size="small"
                          sx={{
                            color: config.color,
                            "&.Mui-checked": {
                              color: config.color,
                            },
                          }}
                        />
                      }
                      label={
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: checked ? 600 : 400 }}
                        >
                          {config.label}
                        </Typography>
                      }
                      sx={{
                        my: 0.2,
                        mx: 0,
                        p: 0.5,
                        borderRadius: "6px",
                        "&:hover": {
                          backgroundColor: theme.palette.action.hover,
                        },
                      }}
                    />
                  );
                })}
              </FormGroup>
            </Popover>

            {/* Active Legend Indicators */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                flexWrap: "wrap",
              }}
            >
              {activeMetricConfigs.map((config) => (
                <Box
                  key={config.id}
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      backgroundColor: config.color,
                    }}
                  />
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    fontWeight={500}
                  >
                    {config.label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </>
      ) : (
        <Box
          sx={{
            py: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            No analytics trend data recorded for the selected filter.
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default AnalyticsTrendsChart;