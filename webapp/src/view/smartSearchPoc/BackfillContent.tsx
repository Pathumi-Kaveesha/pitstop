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

import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { alpha, useTheme } from "@mui/material/styles";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import SearchIcon from "@mui/icons-material/Search";
import UploadRoundedIcon from "@mui/icons-material/UploadRounded";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import TaskAltRoundedIcon from "@mui/icons-material/TaskAltRounded";
import SlideshowRoundedIcon from "@mui/icons-material/SlideshowRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import SmartDisplayRoundedIcon from "@mui/icons-material/SmartDisplayRounded";
import SchoolRoundedIcon from "@mui/icons-material/SchoolRounded";
import CloudRoundedIcon from "@mui/icons-material/CloudRounded";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import { AppConfig } from "@config/config";
import { ApiService } from "@utils/apiService";
import { SmartSearchBackfillCandidate, SmartSearchBackfillResult } from "@/types/types";
import { FILETYPE, CONTENT_SUBTYPE } from "@utils/types";

// Matches MAX_BACKFILL_BATCH_SIZE on the backend
const MAX_BATCH_SIZE = 20;

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

// Admin page that lists content never attempted by Smart Search, in admin-chosen batches
export default function BackfillContent() {
  const theme = useTheme();
  const [contentType, setContentType] = useState("");
  const [contentSubtype, setContentSubtype] = useState("");
  const [count, setCount] = useState(10);
  const [candidates, setCandidates] = useState<SmartSearchBackfillCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SmartSearchBackfillResult | null>(null);
  const [searched, setSearched] = useState(false);

  const handleFind = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await ApiService.getInstance().get<SmartSearchBackfillCandidate[]>(
        `${AppConfig.serviceUrls.smartSearch}/backfill-candidates`,
        {
          params: {
            contentType: contentType || undefined,
            contentSubtype: contentSubtype || undefined,
            count,
          },
        }
      );
      setCandidates(response.data ?? []);
    } catch {
      setError("Couldn't load content. Check the console/backend logs for details.");
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const handleIndex = async () => {
    setIndexing(true);
    setError(null);
    try {
      const response = await ApiService.getInstance().post<SmartSearchBackfillResult>(
        `${AppConfig.serviceUrls.smartSearch}/backfill-index`,
        { contentIds: candidates.map((candidate) => candidate.contentId) }
      );
      setResult(response.data);
      // Every item in this batch is now either submitted, deferred or recorded as a failure -
      // none of them will match the "not yet attempted" filter again, so the list is stale.
      setCandidates([]);
      setSearched(false);
    } catch {
      setError("Couldn't index this batch. Check the console/backend logs for details.");
    } finally {
      setIndexing(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 820, mx: "auto", px: 4, pt: 12, pb: 10 }}>
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
            Find content added before Smart Search, and index it in small batches. Already indexed
            and already-failed content never shows up here.
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
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-start" }} sx={{ p: 3 }}>
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
            sx={{ minWidth: 180 }}
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
              sx={{ minWidth: 180 }}
              size="small"
            >
              <MenuItem value="">All subtypes</MenuItem>
              <MenuItem value={CONTENT_SUBTYPE.Generic}>Generic link</MenuItem>
              <MenuItem value={CONTENT_SUBTYPE.GDoc}>Google Doc</MenuItem>
              <MenuItem value={CONTENT_SUBTYPE.Pdf}>PDF</MenuItem>
              <MenuItem value={CONTENT_SUBTYPE.Video}>Video / MP4</MenuItem>
            </TextField>
          )}
          <Box sx={{ width: 110 }}>
            <TextField
              label="How many"
              type="number"
              value={count}
              onChange={(e) => {
                const next = Number(e.target.value);
                setCount(Number.isNaN(next) ? 1 : Math.min(MAX_BATCH_SIZE, Math.max(1, next)));
              }}
              size="small"
              fullWidth
              slotProps={{ htmlInput: { min: 1, max: MAX_BATCH_SIZE } }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, ml: 0.5 }}>
              Maximum {MAX_BATCH_SIZE}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
            onClick={() => void handleFind()}
            disabled={loading}
            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, height: 40, px: 3 }}
          >
            Find content
          </Button>
        </Stack>
      </Card>

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {result && (
        <Alert severity="success" onClose={() => setResult(null)} sx={{ mb: 3, borderRadius: 2 }}>
          Sent {result.submitted} for indexing
          {result.deferred > 0 ? `, ${result.deferred} deferred (save limit reached - try again in a minute)` : ""}
          {result.notIndexable > 0
            ? `, ${result.notIndexable} couldn't be indexed - see Smart Search Unindexed Content for why`
            : ""}
          .
        </Alert>
      )}

      {searched && !loading && candidates.length === 0 && !error && (
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
            Nothing left to index
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: 380, textAlign: "center", fontSize: "0.9rem" }}
          >
            No content matching these filters is waiting to be indexed.
          </Typography>
        </Card>
      )}

      {candidates.length > 0 && (
        <>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5, px: 0.5 }}>
            <Typography variant="subtitle2" fontWeight={700} color="text.secondary">
              {candidates.length} found
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={indexing ? <CircularProgress size={18} color="inherit" /> : <UploadRoundedIcon />}
              disabled={indexing}
              onClick={() => void handleIndex()}
              sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600, px: 3 }}
            >
              {indexing ? "Indexing..." : `Index these ${candidates.length}`}
            </Button>
          </Stack>

          <Card variant="outlined" sx={{ borderRadius: 3, mb: 3, overflow: "hidden" }}>
            {candidates.map((candidate, index) => {
              const TypeIcon = TYPE_ICONS[candidate.contentType] ?? DescriptionRoundedIcon;
              return (
                <Box key={candidate.contentId}>
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
                        {candidate.description || "Untitled content"}
                      </Typography>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5, flexWrap: "wrap" }}>
                        <Chip
                          label={typeLabel(candidate.contentType)}
                          size="small"
                          sx={{ height: 20, fontSize: "0.7rem", bgcolor: "action.hover" }}
                        />
                        {candidate.contentSubtype && (
                          <Chip
                            label={candidate.contentSubtype}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: "0.7rem" }}
                          />
                        )}
                      </Stack>
                    </Box>

                    <Chip
                      component="a"
                      href={candidate.contentLink}
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
        </>
      )}
    </Box>
  );
}
