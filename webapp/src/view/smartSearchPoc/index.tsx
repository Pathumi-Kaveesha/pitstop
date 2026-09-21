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
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import DescriptionIcon from "@mui/icons-material/Description";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CloseIcon from "@mui/icons-material/Close";
import { AppConfig } from "@config/config";
import { ApiService } from "@utils/apiService";
import { formatSmartSearchSnippet, groupSmartSearchSourcesByDocument } from "@utils/utils";
import ComponentCard from "@components/ui/content/Card";
import { ContentResponse, SmartSearchResponse, SmartSearchResult } from "../../types/types";

// Proof-of-concept page for the smart search feature - reachable directly
// at /smart-search-poc, not yet linked from the main navigation.

interface PreviewDoc {
  title: string;
  link: string;
}

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

  const [previewDoc, setPreviewDoc] = useState<PreviewDoc | null>(null);

  // A PDF appends "#page=N" to jump to the matched page - Google's viewer
  // honours that fragment. No equivalent exists for Word/Slides/Sheets.
  const handleOpenDocument = (source: SmartSearchResult) => {
    if (!source.documentId || !isTrustedDriveOrigin(source.driveLink)) {
      return;
    }
    const pageFragment = source.fileExtension === "pdf" && source.page ? `#page=${source.page}` : "";
    setPreviewDoc({ title: source.title, link: `${source.driveLink}${pageFragment}` });
  };

  const handleClosePreview = () => {
    setPreviewDoc(null);
  };

  const handleOpenPreviewInNewTab = () => {
    if (!previewDoc) {
      return;
    }
    window.open(previewDoc.link, "_blank", "noopener,noreferrer");
  };

  const handleSearch = async () => {
    if (!query.trim() || searchingRef.current) {
      return;
    }

    searchingRef.current = true;
    setSearching(true);
    setSearchError(null);
    setAnswer(null);
    setSources([]);
    setContents([]);

    try {
      // Encoded manually - axios leaves commas unescaped, which Ballerina's
      // query-parameter parser reads as a list separator.
      const response = await ApiService.getInstance().get<SmartSearchResponse>(
        `${AppConfig.serviceUrls.smartSearch}?userQuery=${encodeURIComponent(query.trim())}`
      );
      setAnswer(response.data?.answer ?? null);
      setSources(response.data?.sources ?? []);
      setContents(response.data?.contents ?? []);
      setHasSearched(true);
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
          {hasSearched && !searching && !answer && sources.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Couldn't generate an AI summary right now - showing the matching documents below instead.
            </Alert>
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
                      // Only a PDF can jump to an exact location.
                      const canJumpToLocation = location !== null && source.fileExtension === "pdf";
                      return (
                        <Box key={originalIndex}>
                          {excerptPosition > 0 && <Divider sx={{ my: 1 }} />}
                          <Box
                            onClick={canPreview ? () => handleOpenDocument(source) : undefined}
                            sx={
                              canPreview
                                ? {
                                    cursor: "pointer",
                                    borderRadius: 1,
                                    mx: -0.5,
                                    px: 0.5,
                                    py: 0.5,
                                    transition: "background-color 0.15s",
                                    "&:hover": { bgcolor: "action.hover" },
                                  }
                                : undefined
                            }
                          >
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
                          </Box>
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

      <Dialog
        open={Boolean(previewDoc)}
        onClose={handleClosePreview}
        maxWidth={false}
        PaperProps={{ sx: { backgroundColor: "transparent", boxShadow: "none", overflow: "visible" } }}
      >
        <Box
          sx={{
            position: "relative",
            backgroundColor: "background.paper",
            borderRadius: "12px",
            width: "90vw",
            maxWidth: "1000px",
            height: "85vh",
            maxHeight: "900px",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 2,
              py: 1.5,
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: "grey.900",
            }}
          >
            <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ color: "grey.100", flexGrow: 1, mr: 2 }}>
              {previewDoc?.title}
            </Typography>
            <IconButton
              size="small"
              onClick={handleOpenPreviewInNewTab}
              sx={{ color: "grey.100" }}
              title="Open in new tab"
              aria-label="open in new tab"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" onClick={handleClosePreview} sx={{ color: "grey.100" }} aria-label="close">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          {/* minHeight: 0 - a flex child otherwise grows past the dialog edge. */}
          <Box sx={{ flexGrow: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
            {previewDoc && (
              <iframe
                title={previewDoc.title}
                src={previewDoc.link}
                style={{ border: "none", width: "100%", height: "100%" }}
                allow="autoplay"
              />
            )}
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
