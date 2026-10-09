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

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { alpha, useTheme } from "@mui/material/styles";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import UploadRoundedIcon from "@mui/icons-material/UploadRounded";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import FirstPageRoundedIcon from "@mui/icons-material/FirstPageRounded";
import LastPageRoundedIcon from "@mui/icons-material/LastPageRounded";
import SlideshowRoundedIcon from "@mui/icons-material/SlideshowRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import SmartDisplayRoundedIcon from "@mui/icons-material/SmartDisplayRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import CloudRoundedIcon from "@mui/icons-material/CloudRounded";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import { AppConfig } from "@config/config";
import { ApiService } from "@utils/apiService";
import {
  SmartSearchBackfillStatus,
  SmartSearchBackfillStatusItem,
  SmartSearchBackfillStatusResponse,
  SmartSearchBulkIndexStartResponse,
} from "@/types/types";
import { FILETYPE, CONTENT_SUBTYPE } from "@utils/types";

const PAGE_SIZE = 20;

// One recognizable icon per content type, so a scanned list reads at a glance
const TYPE_ICONS: Record<string, typeof SlideshowRoundedIcon> = {
  [FILETYPE.Slide]: SlideshowRoundedIcon,
  [FILETYPE.External_Link]: LinkRoundedIcon,
  [FILETYPE.Youtube]: SmartDisplayRoundedIcon,
  [FILETYPE.Lms]: SchoolRoundedIcon,
  [FILETYPE.Salesforce]: CloudRoundedIcon,
  [FILETYPE.GSheet]: TableChartRoundedIcon,
};

const typeLabel = (type: string): string => {
  const entry = Object.entries(FILETYPE).find(([, value]) => value === type);
  return entry ? entry[0].replace(/_/g, " ") : type;
};

const STATUS_META: Record<
  SmartSearchBackfillStatus,
  { label: string; color: "default" | "info" | "success" | "error" }
> = {
  not_started: { label: "Not started", color: "default" },
  in_progress: { label: "In progress", color: "info" },
  indexed: { label: "Indexed", color: "success" },
  failed: { label: "Failed", color: "error" },
};

// Admin page that indexes everything matching the filters in the background, in automatic batches.
export default function BackfillContent() {
  const theme = useTheme();
  const [contentType, setContentType] = useState("");
  const [contentSubtype, setContentSubtype] = useState("");
  const [statusFilter, setStatusFilter] = useState<SmartSearchBackfillStatus | "">("");
  // How many rows the list shows at once - blank means the default page size.
  const [listPageSize, setListPageSize] = useState("");
  // Caps one "Index everything" run - blank means unlimited, work through the whole backlog.
  const [indexLimit, setIndexLimit] = useState("");

  const [items, setItems] = useState<SmartSearchBackfillStatusItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [countIsApproximate, setCountIsApproximate] = useState(false);
  const [running, setRunning] = useState(false);
  // What's typed into the "go to page" box - kept separate so typing doesn't jump pages mid-edit.
  const [pageInput, setPageInput] = useState("1");

  const [loadingList, setLoadingList] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startMessage, setStartMessage] = useState<string | null>(null);

  // Previewing what "Index everything" would submit forces the status to "not started" - that's
  // the only thing it would actually act on - and caps the list at the chosen limit.
  const previewMode = indexLimit !== "";

  const fetchPage = async (targetPage: number) => {
    setLoadingList(true);
    setError(null);
    try {
      const pageSize = listPageSize ? Number(listPageSize) : PAGE_SIZE;
      const response = await ApiService.getInstance().get<SmartSearchBackfillStatusResponse>(
        `${AppConfig.serviceUrls.smartSearch}/backfill-status`,
        {
          params: {
            contentType: contentType || undefined,
            contentSubtype: contentSubtype || undefined,
            status: previewMode ? "not_started" : statusFilter || undefined,
            page: targetPage,
            count: pageSize,
          },
        }
      );
      const data = response.data;
      let pageItems = data?.items ?? [];
      let effectivePage = data?.page ?? 1;
      let effectiveTotalPages = data?.totalPages ?? 1;
      let effectiveTotalCount = data?.totalCount ?? 0;

      if (previewMode) {
        const limit = Number(indexLimit);
        effectiveTotalCount = Math.min(effectiveTotalCount, limit);
        effectiveTotalPages = Math.max(1, Math.ceil(effectiveTotalCount / pageSize));
        effectivePage = Math.min(effectivePage, effectiveTotalPages);
        // The raw page can include items beyond the chosen limit - trim those off.
        const remainingOnThisPage = effectiveTotalCount - (effectivePage - 1) * pageSize;
        pageItems = pageItems.slice(0, Math.max(0, remainingOnThisPage));
      }

      setItems(pageItems);
      setPage(effectivePage);
      setPageInput(String(effectivePage));
      setTotalPages(effectiveTotalPages);
      setTotalCount(effectiveTotalCount);
      setCountIsApproximate(data?.countIsApproximate ?? false);
      setRunning(data?.running ?? false);
    } catch {
      setError("Couldn't load the list right now. Please try again in a moment.");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void fetchPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType, contentSubtype, statusFilter, listPageSize, indexLimit]);

  const handleIndexEverything = async () => {
    setStarting(true);
    setError(null);
    setStartMessage(null);
    try {
      const response = await ApiService.getInstance().post<SmartSearchBulkIndexStartResponse>(
        `${AppConfig.serviceUrls.smartSearch}/backfill-index-all`,
        {},
        {
          params: {
            contentType: contentType || undefined,
            contentSubtype: contentSubtype || undefined,
            maxCount: indexLimit ? Number(indexLimit) : undefined,
          },
        }
      );
      const target = indexLimit ? `up to ${indexLimit} items` : "everything";
      setStartMessage(
        response.data?.started
          ? `Started! We'll index ${target} matching these filters. This keeps going on its own - click Refresh anytime to check progress.`
          : "This is already in progress from before - it hasn't finished yet. Click Refresh to check how it's going."
      );
      // Switch from previewing what's about to be indexed to watching what's actually happening -
      // otherwise the list stays locked to "not started" and the items just submitted disappear from it.
      setIndexLimit("");
      setStatusFilter("in_progress");
    } catch {
      setError("Couldn't start indexing right now. Please try again in a moment.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 900, mx: "auto", px: 4, pt: 12, pb: 10 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 4 }}>
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: alpha(theme.palette.primary.main, 0.12),
            flexShrink: 0,
          }}
        >
          <UploadRoundedIcon sx={{ color: theme.palette.primary.main, fontSize: 26 }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Index existing content
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: "0.9rem" }}>
            Index everything matching these filters at once - it runs in small batches in the
            background, so there's nothing to click repeatedly.
          </Typography>
        </Box>
      </Stack>

      <Card variant="outlined" sx={{ borderRadius: 3, mb: 3, overflow: "hidden" }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{
            px: 3,
            py: 1.5,
            backgroundColor: alpha(theme.palette.primary.main, 0.04),
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <TuneRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
          <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
            Filters
          </Typography>
        </Stack>
        <Stack
          direction="row"
          useFlexGap
          flexWrap="wrap"
          spacing={2}
          alignItems="center"
          sx={{ p: 3 }}
        >
          <TextField
            select
            label="Content type"
            value={contentType}
            onChange={(e) => {
              setContentType(e.target.value);
              // Subtype only means anything for External Link - matches the content form itself
              if (e.target.value !== FILETYPE.External_Link) {
                setContentSubtype("");
              }
            }}
            sx={{ minWidth: 180, flexShrink: 0 }}
            size="small"
          >
            <MenuItem value="">All types</MenuItem>
            {Object.values(FILETYPE)
              // Youtube content is never indexable - requiresTranscript() doesn't cover it, and
              // its own link never matches isIndexableLink(), so it would never find anything.
              .filter((type) => type !== FILETYPE.Youtube)
              .map((type) => (
                <MenuItem key={type} value={type}>
                  {typeLabel(type)}
                </MenuItem>
              ))}
          </TextField>
          {contentType === FILETYPE.External_Link && (
            <TextField
              select
              label="Content subtype"
              value={contentSubtype}
              onChange={(e) => setContentSubtype(e.target.value)}
              sx={{ minWidth: 180, flexShrink: 0 }}
              size="small"
            >
              <MenuItem value="">All subtypes</MenuItem>
              <MenuItem value={CONTENT_SUBTYPE.Generic}>Generic link</MenuItem>
              <MenuItem value={CONTENT_SUBTYPE.GDoc}>Google Doc</MenuItem>
              <MenuItem value={CONTENT_SUBTYPE.Pdf}>PDF</MenuItem>
              <MenuItem value={CONTENT_SUBTYPE.Video}>Video / MP4</MenuItem>
            </TextField>
          )}
          <TextField
            select
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SmartSearchBackfillStatus | "")}
            disabled={previewMode}
            sx={{ minWidth: 160, flexShrink: 0 }}
            size="small"
          >
            <MenuItem value="">All statuses</MenuItem>
            {(Object.keys(STATUS_META) as SmartSearchBackfillStatus[]).map((status) => (
              <MenuItem key={status} value={status}>
                {STATUS_META[status].label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Items per page"
            type="number"
            placeholder={String(PAGE_SIZE)}
            value={listPageSize}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              setListPageSize(e.target.value === "" || Number.isNaN(parsed) ? "" : String(Math.max(1, parsed)));
            }}
            size="small"
            sx={{ width: 140, flexShrink: 0 }}
            slotProps={{ htmlInput: { min: 1 } }}
          />
          <TextField
            label="Max to index (optional)"
            type="number"
            placeholder="All"
            value={indexLimit}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              setIndexLimit(e.target.value === "" || Number.isNaN(parsed) ? "" : String(Math.max(1, parsed)));
            }}
            size="small"
            sx={{ width: 170, flexShrink: 0 }}
            slotProps={{ htmlInput: { min: 1 } }}
          />

          <Box sx={{ flexGrow: 1, minWidth: 0 }} />

          <Button
            variant="outlined"
            startIcon={loadingList ? <CircularProgress size={16} color="inherit" /> : <RefreshRoundedIcon />}
            onClick={() => void fetchPage(page)}
            disabled={loadingList}
            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, height: 40, flexShrink: 0, whiteSpace: "nowrap" }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={starting ? <CircularProgress size={16} color="inherit" /> : <UploadRoundedIcon />}
            onClick={() => void handleIndexEverything()}
            disabled={starting || running}
            sx={{
              borderRadius: 2,
              textTransform: "none",
              fontWeight: 600,
              height: 40,
              px: 3,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {running ? "Indexing..." : "Index everything"}
          </Button>
        </Stack>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {startMessage && (
        <Alert severity="info" onClose={() => setStartMessage(null)} sx={{ mb: 3, borderRadius: 2 }}>
          {startMessage}
        </Alert>
      )}

      {running && (
        <Alert severity="info" icon={<CircularProgress size={18} />} sx={{ mb: 3, borderRadius: 2 }}>
          Still indexing - click Refresh to check progress.
        </Alert>
      )}

      {previewMode && (
        <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
          Showing the next {indexLimit} items that haven't been indexed yet - this is what "Index everything" will
          index if you click it now.
        </Alert>
      )}

      {loadingList && items.length === 0 && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {!loadingList && items.length === 0 && !error && (
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
            Nothing matches these filters
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: 380, textAlign: "center", fontSize: "0.9rem" }}
          >
            No content matches this combination of filters.
          </Typography>
        </Card>
      )}

      {items.length > 0 && (
        <>
          <Typography variant="subtitle2" fontWeight={700} color="text.secondary" sx={{ mb: 1.5, px: 0.5 }}>
            {previewMode ? (
              <>
                {totalCount}
                {countIsApproximate ? "+" : ""} in this batch
              </>
            ) : (
              <>
                {totalCount}
                {countIsApproximate ? "+" : ""} total
              </>
            )}
          </Typography>

          <Card variant="outlined" sx={{ borderRadius: 3, mb: 3, overflow: "hidden" }}>
            {items.map((item, index) => {
              const TypeIcon = TYPE_ICONS[item.contentType] ?? DescriptionRoundedIcon;
              const statusMeta = STATUS_META[item.status];
              return (
                <Box key={item.contentId}>
                  {index > 0 && <Divider />}
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                    alignItems={{ sm: "center" }}
                    sx={{
                      px: 2.5,
                      py: 2,
                      transition: "background-color 0.15s ease",
                      "&:hover": { backgroundColor: alpha(theme.palette.primary.main, 0.03) },
                    }}
                  >
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        borderRadius: 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: alpha(theme.palette.primary.main, 0.1),
                      }}
                    >
                      <TypeIcon sx={{ color: theme.palette.primary.main, fontSize: 21 }} />
                    </Box>

                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography
                        variant="subtitle1"
                        fontWeight={600}
                        sx={{ fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {item.description || "Untitled content"}
                      </Typography>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, flexWrap: "wrap" }}>
                        <Chip
                          label={typeLabel(item.contentType)}
                          size="small"
                          sx={{ height: 20, fontSize: "0.7rem", bgcolor: "action.hover" }}
                        />
                        {item.contentSubtype && (
                          <Chip
                            label={item.contentSubtype}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: "0.7rem" }}
                          />
                        )}
                        {item.status === "failed" && item.failureReason && (
                          <Typography variant="caption" color="error.main" sx={{ fontSize: "0.7rem" }}>
                            {item.failureReason}
                          </Typography>
                        )}
                      </Stack>
                    </Box>

                    <Chip label={statusMeta.label} size="small" color={statusMeta.color} sx={{ flexShrink: 0 }} />

                    <Chip
                      component="a"
                      href={item.contentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      clickable
                      icon={<OpenInNewIcon sx={{ fontSize: "0.85rem !important" }} />}
                      label="Open"
                      size="small"
                      sx={{ height: 24, fontSize: "0.75rem", bgcolor: "action.hover", flexShrink: 0 }}
                    />
                  </Stack>
                </Box>
              );
            })}
          </Card>

          <Stack direction="row" justifyContent="center" alignItems="center" spacing={0.5} sx={{ mb: 3 }}>
            <Tooltip title="First page">
              <span>
                <IconButton onClick={() => void fetchPage(1)} disabled={loadingList || page <= 1} size="small">
                  <FirstPageRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Previous page">
              <span>
                <IconButton onClick={() => void fetchPage(page - 1)} disabled={loadingList || page <= 1} size="small">
                  <ChevronLeftRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>

            <Typography variant="body2" color="text.secondary" sx={{ px: 0.5 }}>
              Page
            </Typography>
            <TextField
              size="small"
              type="number"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void fetchPage(Number(pageInput) || 1);
                }
              }}
              onBlur={() => void fetchPage(Number(pageInput) || 1)}
              disabled={loadingList}
              sx={{ width: 70 }}
              slotProps={{ htmlInput: { min: 1, max: totalPages, style: { textAlign: "center" } } }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ px: 0.5 }}>
              of {totalPages}
              {countIsApproximate ? "+" : ""}
            </Typography>

            <Tooltip title="Next page">
              <span>
                <IconButton
                  onClick={() => void fetchPage(page + 1)}
                  disabled={loadingList || page >= totalPages}
                  size="small"
                >
                  <ChevronRightRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Last page">
              <span>
                <IconButton
                  onClick={() => void fetchPage(totalPages)}
                  disabled={loadingList || page >= totalPages}
                  size="small"
                >
                  <LastPageRoundedIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </>
      )}
    </Box>
  );
}
