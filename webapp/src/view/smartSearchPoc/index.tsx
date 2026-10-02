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

import { useMemo, useRef, useState } from "react";
import axios from "axios";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import IconButton from "@mui/material/IconButton";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import { alpha, useTheme } from "@mui/material/styles";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import OndemandVideoRoundedIcon from "@mui/icons-material/OndemandVideoRounded";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import TravelExploreRoundedIcon from "@mui/icons-material/TravelExploreRounded";
import { AppConfig } from "@config/config";
import { ApiService } from "@utils/apiService";
import { formatSmartSearchSnippet, groupSmartSearchSourcesByDocument } from "@utils/utils";
import ComponentCard from "@components/ui/content/Card";
import { ContentResponse, SmartSearchResponse, SmartSearchResult } from "@/types/types";
import { useAppDispatch } from "@slices/store";
import { enqueueSnackbarMessage } from "@slices/commonSlice/common";

// Shown as clickable suggestions before the first search
const EXAMPLE_PROMPTS = [
  "How do we handle a customer escalation?",
  "What's our refund policy?",
  "Onboarding steps for a new hire",
];

// A small icon per result type, so it reads at a glance
const resultTypeIcon = (source: SmartSearchResult): typeof DescriptionRoundedIcon => {
  if (source.unitLabel === "Moment") return OndemandVideoRoundedIcon;
  if (source.fileExtension === "pdf") return PictureAsPdfRoundedIcon;
  if (source.fileExtension === "webpage") return LanguageRoundedIcon;
  if (source.fileExtension === "reference") return LinkRoundedIcon;
  return DescriptionRoundedIcon;
};

// Exact origin check, not a substring match
const isTrustedDriveOrigin = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === "drive.google.com" || parsed.hostname === "docs.google.com");
  } catch {
    return false;
  }
};

// A "reference" result's driveLink isn't necessarily a Drive origin, so it needs its own, looser check
const isHttpsUrl = (url: string): boolean => {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The timestamp is already in the link's query string or hash (?t=90 or #t=90s) - this just reads it back out
const parseVideoTimestampSeconds = (nativeLink: string): number | null => {
  try {
    const url = new URL(nativeLink);
    const seconds = parseInt(url.searchParams.get("t") ?? url.hash.match(/t=(\d+)/)?.[1] ?? "", 10);
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
};

const formatVideoTimestamp = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
};

// Common words a question is full of but that say nothing about which line actually matters
const STOP_WORDS = new Set([
  "this", "that", "with", "from", "have", "does", "what", "when", "where", "which", "about",
  "there", "would", "could", "should", "while", "these", "those", "into", "over", "then", "than",
]);

const withTextFragment = (url: string, matchedText: string, query: string): string => {
  const lines = matchedText.split("\n").map((line) => line.trim()).filter(Boolean);
  const queryWords = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (word) => word.length > 3 && !STOP_WORDS.has(word)
  );
  const scoreLine = (line: string): number => {
    const lower = line.toLowerCase();
    return queryWords.filter((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`).test(lower)).length;
  };
  const relevantLine = lines.reduce(
    (best, line) => (scoreLine(line) > scoreLine(best) ? line : best),
    lines[0] ?? ""
  );
  const normalized = relevantLine.replace(/\s+/g, " ");
  const truncated = normalized.slice(0, 120);
  const wordBreak = truncated.lastIndexOf(" ");
  const snippet = truncated.length < normalized.length && wordBreak > 0 ? truncated.slice(0, wordBreak) : truncated;
  if (!snippet) {
    return url;
  }
  // A bare hyphen breaks the match, and encodeURIComponent doesn't escape it
  const encoded = encodeURIComponent(snippet).replace(/-/g, "%2D");
  const parsed = new URL(url);
  const existingHash = parsed.hash.replace(/^#/, "").replace(/:~:text=.*/, "");
  parsed.hash = existingHash ? `${existingHash}:~:text=${encoded}` : `:~:text=${encoded}`;
  return parsed.toString();
};

export default function SmartSearchPoc() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const searchingRef = useRef(false);
  const latestSearchRef = useRef(0);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<SmartSearchResult[]>([]);
  const [contents, setContents] = useState<ContentResponse[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const groupedSources = useMemo(() => groupSmartSearchSourcesByDocument(sources), [sources]);

  const contentsById = useMemo(
    () => new Map(contents.map((content) => [content.contentId.toString(), content])),
    [contents]
  );

  // Drive's PDF viewer ignores "#page=N", so the PDF is fetched from our backend instead.
  const openPdfAtPage = async (source: SmartSearchResult) => {
    const fragment = source.page ? `#page=${source.page}` : "";
    // Opened before the fetch so the popup blocker allows it.
    const tab = window.open("about:blank", "_blank");
    if (tab) {
      tab.opener = null;
    }
    try {
      const response = await ApiService.getInstance().get<Blob>(
        `${AppConfig.serviceUrls.smartSearch}/documents/${source.documentId}/file`,
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      if (tab) {
        tab.location.href = `${url}${fragment}`;
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 413) {
        dispatch(
          enqueueSnackbarMessage({
            message: "This PDF is too large to open at a page - opening the original file instead.",
            type: "warning",
            anchorOrigin: { vertical: "bottom", horizontal: "right" },
          })
        );
      }
      if (tab && isTrustedDriveOrigin(source.driveLink)) {
        tab.location.href = `${source.driveLink}${fragment}`;
      } else {
        tab?.close();
      }
    }
  };

  // Always a new tab - Google pages don't load inside an iframe.
  const handleOpenDocument = (source: SmartSearchResult) => {
    if (!source.documentId) {
      return;
    }
    if (source.nativeLink && isTrustedDriveOrigin(source.nativeLink)) {
      window.open(source.nativeLink, "_blank", "noopener,noreferrer");
      return;
    }
    if (source.fileExtension === "pdf") {
      void openPdfAtPage(source);
      return;
    }
    // Indexed via a stand-in document - opens its own link, never the stand-in
    if (source.fileExtension === "reference") {
      if (isHttpsUrl(source.driveLink)) {
        window.open(source.driveLink, "_blank", "noopener,noreferrer");
      }
      return;
    }
    // An ordinary webpage - jumps to and highlights the matched text, not just the page
    if (source.fileExtension === "webpage") {
      if (isHttpsUrl(source.driveLink)) {
        window.open(withTextFragment(source.driveLink, source.content, query), "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (!isTrustedDriveOrigin(source.driveLink)) {
      return;
    }
    window.open(source.driveLink, "_blank", "noopener,noreferrer");
  };

  // Encoded manually - axios leaves commas unescaped, which Ballerina's
  // query-parameter parser reads as a list separator.
  const searchUrl = (searchedQuery: string, includeAnswer: boolean) =>
    `${AppConfig.serviceUrls.smartSearch}?userQuery=${encodeURIComponent(searchedQuery)}&includeAnswer=${includeAnswer}`;

  // The matching documents show first; the AI answer is fetched after and fills in when ready.
  const fetchAnswer = async (searchId: number, searchedQuery: string, displayedDocumentIds: Set<string>) => {
    setAnswerLoading(true);
    try {
      const response = await ApiService.getInstance().get<SmartSearchResponse>(searchUrl(searchedQuery, true));
      // Only show an answer written from the same documents as the ones on screen.
      const answerDocumentIds = new Set((response.data?.sources ?? []).map((source) => source.documentId));
      const sameDocuments =
        answerDocumentIds.size === displayedDocumentIds.size &&
        [...answerDocumentIds].every((id) => displayedDocumentIds.has(id));
      if (latestSearchRef.current === searchId) {
        setAnswer(sameDocuments ? (response.data?.answer ?? null) : null);
      }
    } catch {
      // No answer is fine - the sources are already shown, with a note.
    } finally {
      if (latestSearchRef.current === searchId) {
        setAnswerLoading(false);
      }
    }
  };

  const handleSearch = async () => {
    if (!query.trim() || searchingRef.current) {
      return;
    }

    searchingRef.current = true;
    const searchedQuery = query.trim();
    const searchId = ++latestSearchRef.current;
    setSearching(true);
    setAnswerLoading(false);
    setSearchError(null);
    setAnswer(null);
    setSources([]);
    setContents([]);

    try {
      const response = await ApiService.getInstance().get<SmartSearchResponse>(searchUrl(searchedQuery, false));
      const foundSources = response.data?.sources ?? [];
      setSources(foundSources);
      setContents(response.data?.contents ?? []);
      setHasSearched(true);
      if (foundSources.length > 0) {
        void fetchAnswer(searchId, searchedQuery, new Set(foundSources.map((source) => source.documentId)));
      }
    } catch (error) {
      setSearchError("Search failed. Check the console/backend logs for details.");
      setHasSearched(false);
      // eslint-disable-next-line no-console
      console.error(error);
    } finally {
      searchingRef.current = false;
      setSearching(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: "auto", px: { xs: 2.5, sm: 4 }, pt: 7, pb: 6 }}>
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
          <TravelExploreRoundedIcon sx={{ color: theme.palette.primary.main, fontSize: 26 }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Smart Search
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: "0.9rem" }}>
            Ask a question in plain language - Pitstop finds the exact page, slide, moment or passage that answers it.
          </Typography>
        </Box>
      </Stack>

      <TextField
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && handleSearch()}
        placeholder={`Try: "${EXAMPLE_PROMPTS[0]}"`}
        fullWidth
        autoFocus
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon color="action" />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={handleSearch}
                  disabled={searching || !query.trim()}
                  color="primary"
                  aria-label="Search"
                  sx={{
                    bgcolor: query.trim() ? alpha(theme.palette.primary.main, 0.1) : "transparent",
                    "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.18) },
                  }}
                >
                  {searching ? <CircularProgress size={20} /> : <SearchRoundedIcon />}
                </IconButton>
              </InputAdornment>
            ),
            sx: {
              borderRadius: 5,
              py: 0.5,
              pr: 0.75,
              fontSize: "1.05rem",
              bgcolor: "background.paper",
              boxShadow: `0 2px 14px ${alpha(theme.palette.common.black, 0.07)}`,
            },
          },
        }}
      />

      {!hasSearched && !searching && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2, rowGap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center", mr: 0.5 }}>
            Try asking:
          </Typography>
          {EXAMPLE_PROMPTS.map((prompt) => (
            <ButtonBase
              key={prompt}
              onClick={() => setQuery(prompt)}
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: 4,
                fontSize: "0.8rem",
                color: "text.secondary",
                bgcolor: alpha(theme.palette.text.primary, 0.05),
                transition: "background-color 0.15s",
                "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.1), color: "primary.main" },
              }}
            >
              {prompt}
            </ButtonBase>
          ))}
        </Stack>
      )}

      {searchError && (
        <Alert severity="error" sx={{ mt: 3, borderRadius: 2 }}>
          {searchError}
        </Alert>
      )}

      {/* Search can succeed even when answer generation fails. */}
      {hasSearched && !searching && !answerLoading && !answer && sources.length > 0 && (
        <Alert severity="info" sx={{ mt: 3, borderRadius: 2 }}>
          Couldn't generate an AI summary right now - showing the matching documents below instead.
        </Alert>
      )}

      {answerLoading && (
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mt: 3 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            Writing an AI answer...
          </Typography>
        </Stack>
      )}

      {answer && (
        <Card
          variant="outlined"
          sx={{
            mt: 3,
            p: 2.5,
            borderRadius: 3,
            borderColor: alpha(theme.palette.primary.main, 0.25),
            bgcolor: alpha(theme.palette.primary.main, 0.045),
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <AutoAwesomeRoundedIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight={700} color="primary">
              AI-generated answer
            </Typography>
          </Stack>
          <Typography variant="body1" sx={{ lineHeight: 1.65 }}>
            {answer}
          </Typography>
        </Card>
      )}

      {sources.length > 0 && (
        <Box sx={{ mt: 5 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: "block", mb: 2, letterSpacing: 1.2, fontWeight: 600 }}
          >
            Sources
          </Typography>
          {/* Not wrapped in a Card - a content card overflows on hover, and MUI's Card clips that. */}
          <Stack spacing={5} divider={<Divider />}>
            {groupedSources.map((group) => {
              const canPreview = Boolean(group.documentId);
              const content = contentsById.get(group.documentId);
              // A reference result's matched text is hidden - unless there's a timestamp to jump to
              const hasJumpableLocation = group.excerpts.some(({ source }) => Boolean(source.nativeLink));
              const isReferenceOnly = group.excerpts[0]?.source.fileExtension === "reference" && !hasJumpableLocation;
              const isVideo = group.excerpts[0]?.source.unitLabel === "Moment";
              const TypeIcon = resultTypeIcon(group.excerpts[0]?.source);
              return (
                <Box
                  key={group.documentId || group.title}
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", md: "row" },
                    gap: 3,
                    alignItems: "flex-start",
                  }}
                >
                  {content && (
                    <Box sx={{ width: 399, height: 424, flexShrink: 0 }}>
                      <ComponentCard {...content} />
                    </Box>
                  )}

                  {!(isReferenceOnly && content) && (
                  <Box sx={{ flexGrow: 1, minWidth: 0, width: "100%" }}>
                    {!content && (
                      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}>
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            flexShrink: 0,
                            borderRadius: 2,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: alpha(theme.palette.primary.main, 0.1),
                          }}
                        >
                          <TypeIcon sx={{ fontSize: 18, color: "primary.main" }} />
                        </Box>
                        <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
                          {group.title}
                        </Typography>
                      </Stack>
                    )}

                    {content && !isReferenceOnly && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", mb: 1 }}
                      >
                        {isVideo ? "Relevant moments" : "Matched passages"}
                      </Typography>
                    )}

                    {!isReferenceOnly && group.excerpts.map(({ source, originalIndex }, excerptPosition) => {
                      const videoTimestampSeconds = isVideo ? parseVideoTimestampSeconds(source.nativeLink) : null;
                      const location = videoTimestampSeconds !== null
                        ? formatVideoTimestamp(videoTimestampSeconds)
                        : source.page !== null ? `${source.unitLabel || "Page"} ${source.page}` : null;
                      const canJumpToLocation =
                        location !== null && (Boolean(source.nativeLink) || source.fileExtension === "pdf");
                      const excerptContent = (
                        <>
                          {location && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                              {location}
                            </Typography>
                          )}
                          <Typography variant="body2" color="text.secondary">
                            {formatSmartSearchSnippet(source.content)}
                          </Typography>
                          {canPreview && (
                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
                              <OpenInNewRoundedIcon sx={{ fontSize: 14 }} color="primary" />
                              <Typography variant="caption" color="primary" fontWeight={600}>
                                {canJumpToLocation ? `Open at ${location}` : "Open this document"}
                              </Typography>
                            </Stack>
                          )}
                        </>
                      );
                      return (
                        <Box key={originalIndex}>
                          {excerptPosition > 0 && <Divider sx={{ my: 1 }} />}
                          {canPreview ? (
                            <ButtonBase
                              onClick={() => handleOpenDocument(source)}
                              sx={{
                                display: "block",
                                width: "100%",
                                textAlign: "left",
                                borderRadius: 2,
                                mx: -1,
                                px: 1,
                                py: 0.75,
                                transition: "background-color 0.15s",
                                "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.06) },
                              }}
                            >
                              {excerptContent}
                            </ButtonBase>
                          ) : (
                            <Box>{excerptContent}</Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}

      {hasSearched && !searching && !searchError && sources.length === 0 && (
        <Card
          variant="outlined"
          sx={{
            mt: 5,
            py: 7,
            borderRadius: 4,
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
              bgcolor: alpha(theme.palette.text.secondary, 0.1),
            }}
          >
            <SearchOffRoundedIcon sx={{ color: "text.secondary", fontSize: 30 }} />
          </Box>
          <Typography variant="h6" fontWeight={600}>
            No results found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, textAlign: "center", fontSize: "0.9rem" }}>
            We couldn't find anything matching your search. Try different words, or add a document about this topic
            first.
          </Typography>
        </Card>
      )}
    </Box>
  );
}
