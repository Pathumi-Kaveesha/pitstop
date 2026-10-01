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

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Pagination from "@mui/material/Pagination";
import Tooltip from "@mui/material/Tooltip";
import { alpha, useTheme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import ReplayIcon from "@mui/icons-material/Replay";
import ReportProblemRoundedIcon from "@mui/icons-material/ReportProblemRounded";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { AppConfig } from "@config/config";
import { ApiService } from "@utils/apiService";
import { parseDateAsUtc } from "@utils/utils";
import { SmartSearchIndexFailure } from "@/types/types";

// Admin page listing content that failed Smart Search indexing
const FAILURES_PER_PAGE = 10;

// Backend timestamps carry no timezone, so parse as UTC and show in the viewer's local time
const formatRelativeTime = (value: string): { relative: string; exact: string } => {
  const date = parseDateAsUtc(value);
  if (!date) {
    return { relative: "Unknown", exact: "Unknown" };
  }
  const exact = date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  const steps: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
  ];
  let amount = seconds;
  let unit = "second";
  for (const [size, label] of steps) {
    if (amount < size) {
      unit = label;
      break;
    }
    amount = Math.floor(amount / size);
    unit = label;
  }
  const relative = amount <= 1 && unit === "second" ? "Just now" : `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
  return { relative, exact };
};

export default function UnindexedContent() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<SmartSearchIndexFailure[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retryingIds, setRetryingIds] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(1);

  const loadEntries = async (): Promise<SmartSearchIndexFailure[] | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await ApiService.getInstance().get<SmartSearchIndexFailure[]>(
        `${AppConfig.serviceUrls.smartSearch}/unindexed`
      );
      const fresh = response.data ?? [];
      setEntries(fresh);
      return fresh;
    } catch {
      setError("Couldn't load the list. Check the console/backend logs for details.");
      return null;
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  // Retry-outcome checks scheduled below - cleared on unmount so they never set state on a gone page
  const pendingRetryChecks = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => {
      // Timeouts are pushed onto this ref after mount, so it's read live on purpose, not stale
      // eslint-disable-next-line react-hooks/exhaustive-deps
      pendingRetryChecks.current.forEach(clearTimeout);
    };
  }, []);

  const handleRefresh = () => {
    setNotice(null);
    void loadEntries();
  };

  const stopRetrying = (contentId: number) => {
    setRetryingIds((prev) => {
      const next = new Set(prev);
      next.delete(contentId);
      return next;
    });
  };

  // A stale failure record can still be in the list right after retrying - only its timestamp moving means a fresh answer
  const describeRetryOutcome = (
    fresh: SmartSearchIndexFailure[],
    contentId: number,
    beforeRetryUpdatedOn: string | undefined
  ): { message: string; resolved: boolean } => {
    const stillFailing = fresh.find((e) => e.contentId === contentId);
    if (!stillFailing) {
      return { message: "Retry succeeded - this content is now indexed.", resolved: true };
    }
    if (stillFailing.updatedOn !== beforeRetryUpdatedOn) {
      return { message: `This still failed to index: ${stillFailing.errorMessage}`, resolved: true };
    }
    return { message: "", resolved: false };
  };

  const scheduleRetryOutcomeCheck = (contentId: number, beforeRetryUpdatedOn: string | undefined) => {
    const timeoutId = setTimeout(() => {
      void (async () => {
        const fresh = await loadEntries();
        if (fresh !== null) {
          const outcome = describeRetryOutcome(fresh, contentId, beforeRetryUpdatedOn);
          setNotice(
            outcome.resolved
              ? outcome.message
              : "Still checking - this is taking longer than usual. Refresh in a bit to see the result."
          );
        }
        stopRetrying(contentId);
      })();
    }, 65_000);
    pendingRetryChecks.current.push(timeoutId);
  };

  const handleRetry = async (contentId: number) => {
    const beforeRetryUpdatedOn = entries.find((e) => e.contentId === contentId)?.updatedOn;
    setRetryingIds((prev) => new Set(prev).add(contentId));
    setNotice(null);
    try {
      await ApiService.getInstance().post(
        `${AppConfig.serviceUrls.smartSearch}/documents/${contentId}/retry-index`
      );
      const fresh = await loadEntries();
      const outcome = fresh !== null ? describeRetryOutcome(fresh, contentId, beforeRetryUpdatedOn) : null;
      if (outcome?.resolved) {
        // Already have the answer - a failure this fast means retrying again won't help either
        setNotice(outcome.message);
        stopRetrying(contentId);
      } else {
        scheduleRetryOutcomeCheck(contentId, beforeRetryUpdatedOn);
      }
    } catch (retryError) {
      setError(
        axios.isAxiosError(retryError) && retryError.response?.status === 429
          ? "Too many retries. Please try again in a minute."
          : "Couldn't retry this content. Check the console/backend logs for details."
      );
      stopRetrying(contentId);
    }
  };

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.updatedOn.localeCompare(a.updatedOn)),
    [entries]
  );
  const pageCount = Math.max(1, Math.ceil(sortedEntries.length / FAILURES_PER_PAGE));
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const pagedEntries = sortedEntries.slice((page - 1) * FAILURES_PER_PAGE, page * FAILURES_PER_PAGE);

  return (
    <Box sx={{ maxWidth: 920, mx: "auto", px: 4, pt: 12, pb: 6 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 4 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: alpha(theme.palette.primary.main, 0.12),
            }}
          >
            <ReportProblemRoundedIcon sx={{ color: theme.palette.primary.main, fontSize: 26 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>
              Unindexed content
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: "0.9rem" }}>
              Content Smart Search has confirmed it failed to index. Indexed content, and content still
              indexing normally, never shows up here.
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading}
          sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, flexShrink: 0 }}
        >
          Refresh
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {notice && (
        <Alert severity="info" onClose={() => setNotice(null)} sx={{ mb: 3, borderRadius: 2 }}>
          {notice}
        </Alert>
      )}

      {loaded && !loading && sortedEntries.length === 0 && !error && (
        <Card
          variant="outlined"
          sx={{
            borderRadius: 4,
            py: 7,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: alpha(theme.palette.success.main, 0.12),
            }}
          >
            <TaskAltRoundedIcon sx={{ color: theme.palette.success.main, fontSize: 30 }} />
          </Box>
          <Typography variant="h6" fontWeight={600}>
            All caught up
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, textAlign: "center", fontSize: "0.9rem" }}>
            Everything Smart Search has been asked to index is either indexed or still working on it.
          </Typography>
        </Card>
      )}

      <Stack spacing={2}>
        {pagedEntries.map((entry) => {
          const isRetrying = retryingIds.has(entry.contentId);
          const { relative, exact } = formatRelativeTime(entry.updatedOn);
          return (
            <Card
              key={entry.contentId}
              variant="outlined"
              sx={{
                borderRadius: 3,
                p: 2.5,
                borderColor: alpha(theme.palette.error.main, 0.3),
                transition: "box-shadow 0.15s ease, border-color 0.15s ease",
                "&:hover": {
                  boxShadow: `0 8px 24px ${alpha(theme.palette.error.main, 0.1)}`,
                  borderColor: alpha(theme.palette.error.main, 0.5),
                },
              }}
            >
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ sm: "center" }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: alpha(theme.palette.error.main, 0.1),
                  }}
                >
                  <ReportProblemRoundedIcon sx={{ color: theme.palette.error.main, fontSize: 22 }} />
                </Box>

                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 0.75, flexWrap: "wrap" }}>
                    <Typography variant="subtitle1" fontWeight={600} sx={{ fontSize: "1rem" }}>
                      {entry.description}
                    </Typography>
                    <Chip
                      component="a"
                      href={entry.contentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      clickable
                      icon={<OpenInNewIcon sx={{ fontSize: "0.85rem !important" }} />}
                      label="Open content"
                      size="small"
                      sx={{ height: 21, fontSize: "0.72rem", bgcolor: "action.hover" }}
                    />
                    {entry.routePath && (
                      <Chip
                        clickable
                        onClick={() => navigate(entry.routePath)}
                        icon={<ArrowForwardIcon sx={{ fontSize: "0.85rem !important" }} />}
                        label="Go to page"
                        size="small"
                        sx={{ height: 21, fontSize: "0.72rem", bgcolor: "action.hover" }}
                      />
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: "0.9rem" }}>
                    {entry.errorMessage}
                  </Typography>
                  <Tooltip title={exact}>
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ width: "fit-content" }}>
                      <AccessTimeRoundedIcon sx={{ fontSize: 15, color: "text.disabled" }} />
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.78rem" }}>
                        Last checked {relative}
                      </Typography>
                    </Stack>
                  </Tooltip>
                </Box>

                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={isRetrying ? <CircularProgress size={16} /> : <ReplayIcon sx={{ fontSize: 20 }} />}
                  disabled={isRetrying}
                  onClick={() => void handleRetry(entry.contentId)}
                  sx={{
                    borderRadius: 2,
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                    flexShrink: 0,
                    alignSelf: { xs: "flex-start", sm: "center" },
                  }}
                >
                  {isRetrying ? "Retrying..." : "Retry"}
                </Button>
              </Stack>
            </Card>
          );
        })}
      </Stack>

      {pageCount > 1 && (
        <Stack alignItems="center" sx={{ mt: 4 }}>
          <Pagination count={pageCount} page={page} onChange={(_, value) => setPage(value)} color="primary" />
        </Stack>
      )}
    </Box>
  );
}
