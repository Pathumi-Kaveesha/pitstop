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
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import DescriptionIcon from "@mui/icons-material/Description";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { AppConfig } from "@config/config";
import { ApiService } from "@utils/apiService";
import { formatSmartSearchSnippet, groupSmartSearchSourcesByDocument } from "@utils/utils";
import ComponentCard from "@components/ui/content/Card";
import { ContentResponse, SmartSearchResponse, SmartSearchResult } from "@/types/types";

// Proof-of-concept page for the smart search feature - reachable directly
// at /smart-search-poc, not yet linked from the main navigation.

// Exact origin check, not a substring match
const isTrustedDriveOrigin = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === "drive.google.com" || parsed.hostname === "docs.google.com");
  } catch {
    return false;
  }
};

export default function SmartSearchPoc() {
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
    } catch {
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
    <Box sx={{ maxWidth: 1000, mx: "auto", px: 4, pt: 7, pb: 4 }}>
      <Typography variant="h4" fontWeight={600} sx={{ mb: 1 }}>
        Smart Search (POC)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Search Pitstop's content in plain language below. This page is a proof of concept only - content is added
        the normal way, on the Smart Search POC page, and is indexed here automatically.
      </Typography>

      <Card variant="outlined" sx={{ borderRadius: 3, boxShadow: 1 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Search
          </Typography>
          <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
            <TextField
              label="Ask something..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleSearch()}
              size="small"
              fullWidth
            />
            <Button variant="contained" onClick={handleSearch} disabled={searching || !query.trim()}>
              {searching ? <CircularProgress size={20} /> : "Search"}
            </Button>
          </Box>

          {searchError && <Alert severity="error" sx={{ mb: 2 }}>{searchError}</Alert>}

          {/* Search can succeed even when answer generation fails. */}
          {hasSearched && !searching && !answerLoading && !answer && sources.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Couldn't generate an AI summary right now - showing the matching documents below instead.
            </Alert>
          )}

          {answerLoading && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Writing an AI answer...
              </Typography>
            </Stack>
          )}

          {answer && (
            <Card variant="outlined" sx={{ mb: 2, bgcolor: "action.hover" }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <AutoAwesomeIcon fontSize="small" color="primary" />
                  <Typography variant="subtitle2" fontWeight={600} color="primary">
                    AI-generated answer
                  </Typography>
                </Stack>
                <Typography variant="body1">{answer}</Typography>
              </CardContent>
            </Card>
          )}

        </CardContent>
      </Card>

      {sources.length > 0 && (
        <Box sx={{ mt: 5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
            Sources
          </Typography>
          {/* Not wrapped in a Card - a content card overflows on hover, and MUI's Card clips that. */}
          <Stack spacing={5} divider={<Divider />}>
            {groupedSources.map((group) => {
              const canPreview = Boolean(group.documentId);
              const content = contentsById.get(group.documentId);
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

                  <Box sx={{ flexGrow: 1, minWidth: 0, width: "100%" }}>
                    {!content && (
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <DescriptionIcon fontSize="small" color="action" />
                        <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
                          {group.title}
                        </Typography>
                      </Stack>
                    )}

                    {content && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", mb: 1 }}
                      >
                        Matched passages
                      </Typography>
                    )}

                    {group.excerpts.map(({ source, originalIndex }, excerptPosition) => {
                      const location = source.page !== null ? `${source.unitLabel || "Page"} ${source.page}` : null;
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
                              <OpenInNewIcon sx={{ fontSize: 14 }} color="primary" />
                              <Typography variant="caption" color="primary">
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
                                borderRadius: 1,
                                mx: -0.5,
                                px: 0.5,
                                py: 0.5,
                                transition: "background-color 0.15s",
                                "&:hover": { bgcolor: "action.hover" },
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
                </Box>
              );
            })}
          </Stack>
        </Box>
      )}

      {hasSearched && !searching && !searchError && sources.length === 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 6 }}>
          <SearchOffIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
          <Typography variant="subtitle1" fontWeight={600}>
            No results found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            We couldn't find anything matching your search. Try different words, or add a document about this topic
            first.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
