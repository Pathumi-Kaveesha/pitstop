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

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import DescriptionIcon from "@mui/icons-material/Description";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CloseIcon from "@mui/icons-material/Close";
import { AppConfig } from "@config/config";
import { ApiService } from "@utils/apiService";

// Proof-of-concept page for the smart search feature. Not linked from the
// main navigation yet - reachable directly at /smart-search-poc while this
// is being validated. Upload a PDF, then search it using plain language.
//
// Two tools run behind every search: Tool 1 finds the matching document
// chunks by embedding-score similarity alone (no AI reads anything at that
// step); Tool 2 takes only those already-matched chunks and asks an LLM to
// write one grounded answer from them, shown here as "answer" with the
// underlying chunks kept visible as "sources" for verification.

interface SmartSearchResult {
  content: string;
  title: string;
  page: number | null;
  similarityScore: number;
  documentId: string;
}

interface SmartSearchResponse {
  answer: string | null;
  sources: SmartSearchResult[];
}

// Chunk text comes straight from the PDF, whitespace and all - a table
// cell's worth of "Y Y Y Y" run together with surrounding paragraphs reads
// fine to a search algorithm but not to a person skimming results. This
// just tidies up how it's *displayed*: collapsing stray whitespace and
// cutting it off at a sentence-ish boundary. It never touches what's
// actually searched or stored - purely cosmetic.
const SNIPPET_MAX_LENGTH = 220;

function formatSnippet(content: string): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  if (collapsed.length <= SNIPPET_MAX_LENGTH) {
    return collapsed;
  }
  const truncated = collapsed.slice(0, SNIPPET_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : SNIPPET_MAX_LENGTH)}…`;
}

function matchColor(score: number): "success" | "warning" {
  return score >= 0.8 ? "success" : "warning";
}

// One excerpt, plus its position in the original flat `sources` list - kept
// around so each excerpt can be opened/previewed individually, even after
// grouping several of them under one card below.
interface SourceExcerpt {
  source: SmartSearchResult;
  originalIndex: number;
}

interface GroupedSource {
  documentId: string;
  title: string;
  topScore: number;
  excerpts: SourceExcerpt[];
}

// A single document can contribute more than one matching excerpt (see
// MAX_CHUNKS_PER_DOCUMENT in the Python service) - shown here as one card
// per document with all of its excerpts listed underneath, rather than one
// card per excerpt. Two excerpts from the same document would otherwise
// look like the same result repeated, when they're actually two different
// passages that both happened to match.
function groupSourcesByDocument(sources: SmartSearchResult[]): GroupedSource[] {
  const groups: GroupedSource[] = [];
  const groupsByKey = new Map<string, GroupedSource>();

  sources.forEach((source, originalIndex) => {
    // Falls back to title when documentId is missing (e.g. a document
    // indexed before this feature existed) so those still group sensibly
    // instead of every excerpt landing in its own group.
    const key = source.documentId || `title:${source.title}`;
    let group = groupsByKey.get(key);
    if (!group) {
      group = { documentId: source.documentId, title: source.title, topScore: source.similarityScore, excerpts: [] };
      groupsByKey.set(key, group);
      groups.push(group);
    }
    group.topScore = Math.max(group.topScore, source.similarityScore);
    group.excerpts.push({ source, originalIndex });
  });

  return groups;
}

export default function SmartSearchPoc() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<SmartSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Grouped once here rather than inside the render loop below, so it's
  // only recomputed when the actual search results change.
  const groupedSources = useMemo(() => groupSourcesByDocument(sources), [sources]);

  // Which source card (by its position in the list) is currently fetching
  // its PDF, so only that one card shows a spinner rather than the whole
  // page. null means nothing is being opened right now.
  const [openingIndex, setOpeningIndex] = useState<number | null>(null);

  // The document currently shown in the preview dialog below, if any.
  // title is the human-readable title the user gave it at upload time
  // (never the raw documentId/filename) - blobUrl is the fetched PDF's
  // in-browser address, and page is which page to jump straight to.
  const [previewDoc, setPreviewDoc] = useState<{ title: string; blobUrl: string; page: number | null } | null>(
    null
  );

  // Upload success/error messages are transient - clear them on their own
  // after a few seconds instead of sitting there until the next upload.
  useEffect(() => {
    if (!uploadMessage) {
      return;
    }
    const timer = setTimeout(() => setUploadMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [uploadMessage]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file && !title) {
      setTitle(file.name.replace(/\.pdf$/i, ""));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !title.trim()) {
      setUploadMessage({ type: "error", text: "Pick a PDF file and give it a title first." });
      return;
    }

    setUploading(true);
    setUploadMessage(null);

    try {
      const fileBytes = await selectedFile.arrayBuffer();
      await ApiService.getInstance().post(AppConfig.serviceUrls.smartSearchUpload, fileBytes, {
        params: { title: title.trim() },
        headers: { "Content-Type": "application/pdf" },
      });
      setUploadMessage({ type: "success", text: `"${title}" was indexed successfully.` });
      setSelectedFile(null);
      setTitle("");
    } catch (error) {
      setUploadMessage({ type: "error", text: "Upload failed. Check the console/backend logs for details." });
      // eslint-disable-next-line no-console
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  // Fetches the original PDF a search result came from, and opens it in
  // the in-page preview dialog below so the match can be checked against
  // the real document without leaving this page. Fetched as an
  // authenticated "blob" (raw file bytes) through ApiService rather than
  // a plain link - a plain <a href> wouldn't carry the login token the
  // backend requires. #page=N is a standard PDF-viewer fragment that
  // jumps straight to that page, when one is known.
  const handleOpenDocument = async (source: SmartSearchResult, index: number) => {
    if (!source.documentId) {
      return;
    }

    setOpeningIndex(index);
    try {
      const response = await ApiService.getInstance().get(AppConfig.serviceUrls.smartSearchDocument(source.documentId), {
        responseType: "blob",
      });
      const blobUrl = URL.createObjectURL(response.data);
      setPreviewDoc((current) => {
        // Switching to a different excerpt while the dialog is already
        // open would otherwise leak the previous blob URL - it's never
        // needed again once replaced.
        if (current) {
          URL.revokeObjectURL(current.blobUrl);
        }
        return { title: source.title, blobUrl, page: source.page };
      });
    } catch (error) {
      setSearchError("Couldn't open that document. Check the console/backend logs for details.");
      // eslint-disable-next-line no-console
      console.error(error);
    } finally {
      setOpeningIndex(null);
    }
  };

  const handleClosePreview = () => {
    setPreviewDoc((current) => {
      if (current) {
        URL.revokeObjectURL(current.blobUrl);
      }
      return null;
    });
  };

  const handleOpenPreviewInNewTab = () => {
    if (!previewDoc) {
      return;
    }
    const pageFragment = previewDoc.page ? `#page=${previewDoc.page}` : "";
    window.open(`${previewDoc.blobUrl}${pageFragment}`, "_blank", "noopener,noreferrer");
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      // Built manually with encodeURIComponent rather than passed through axios's
      // `params` option - axios leaves characters like commas unescaped by default
      // (they're technically legal, unescaped, in a URL query per spec), but
      // Ballerina's query-parameter parser treats an unescaped comma as a list
      // separator and silently truncates the value there. Encoding everything
      // ourselves avoids that mismatch entirely.
      const response = await ApiService.getInstance().get<SmartSearchResponse>(
        `${AppConfig.serviceUrls.smartSearch}?userQuery=${encodeURIComponent(query.trim())}`
      );
      setAnswer(response.data?.answer ?? null);
      setSources(response.data?.sources ?? []);
      setHasSearched(true);
    } catch (error) {
      setSearchError("Search failed. Check the console/backend logs for details.");
      setHasSearched(false);
      // eslint-disable-next-line no-console
      console.error(error);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", p: 4 }}>
      <Typography variant="h4" fontWeight={600} sx={{ mb: 1 }}>
        Smart Search (POC)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Upload a PDF, then search it in plain language below. This page is a proof of concept only.
      </Typography>

      <Card variant="outlined" sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            1. Upload a document
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} sx={{ alignSelf: "flex-start" }}>
              {selectedFile ? selectedFile.name : "Choose PDF file"}
              <input type="file" accept="application/pdf" hidden onChange={handleFileChange} />
            </Button>
            <TextField
              label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              size="small"
              fullWidth
            />
            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={uploading || !selectedFile}
              sx={{ alignSelf: "flex-start" }}
            >
              {uploading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
              Upload &amp; index
            </Button>
            {uploadMessage && <Alert severity={uploadMessage.type}>{uploadMessage.text}</Alert>}
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            2. Search
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

          {/* Tool 1 (the search itself) can succeed even when Tool 2 (the AI
              summary) fails - e.g. a transient outage on the model's side.
              The real matches are still useful on their own, so this just
              explains why there's no summary this time rather than hiding
              it silently. */}
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

          {sources.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                Sources
              </Typography>
              <Stack spacing={1.5}>
                {groupedSources.map((group) => {
                  const canPreview = Boolean(group.documentId);
                  const multipleExcerpts = group.excerpts.length > 1;
                  return (
                    <Card key={group.documentId || group.title} variant="outlined">
                      <CardContent sx={{ "&:last-child": { pb: 2 } }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <DescriptionIcon fontSize="small" color="action" />
                          <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
                            {group.title}
                          </Typography>
                          <Chip
                            size="small"
                            label={`${(group.topScore * 100).toFixed(0)}% match`}
                            color={matchColor(group.topScore)}
                            variant="outlined"
                          />
                        </Stack>

                        {group.excerpts.map(({ source, originalIndex }, excerptPosition) => {
                          const isOpening = openingIndex === originalIndex;
                          return (
                            <Box key={originalIndex}>
                              {excerptPosition > 0 && <Divider sx={{ my: 1 }} />}
                              <Box
                                onClick={canPreview ? () => handleOpenDocument(source, originalIndex) : undefined}
                                sx={
                                  canPreview
                                    ? {
                                        cursor: "pointer",
                                        borderRadius: 1,
                                        mx: -0.5,
                                        px: 0.5,
                                        transition: "background-color 0.15s",
                                        "&:hover": { bgcolor: "action.hover" },
                                      }
                                    : undefined
                                }
                              >
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                  {source.page !== null && (
                                    <Typography variant="caption" color="text.secondary">
                                      Page {source.page}
                                    </Typography>
                                  )}
                                  {/* Only shown once there's more than one excerpt - with just
                                      one, it would just repeat the "top match" chip above. */}
                                  {multipleExcerpts && (
                                    <Typography variant="caption" color="text.secondary">
                                      {(source.similarityScore * 100).toFixed(0)}% match
                                    </Typography>
                                  )}
                                  <Box sx={{ flexGrow: 1 }} />
                                  {canPreview &&
                                    (isOpening ? (
                                      <CircularProgress size={14} />
                                    ) : (
                                      <OpenInNewIcon sx={{ fontSize: 14 }} color="action" />
                                    ))}
                                </Stack>
                                <Typography variant="body2" color="text.secondary">
                                  {formatSnippet(source.content)}
                                </Typography>
                              </Box>
                            </Box>
                          );
                        })}

                        {canPreview && (
                          <Typography variant="caption" color="primary" sx={{ display: "block", mt: 1 }}>
                            {multipleExcerpts ? "Click an excerpt to open that page" : "Click to preview the PDF"}
                          </Typography>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </>
          )}

          {hasSearched && !searching && !searchError && sources.length === 0 && (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 4 }}>
              <SearchOffIcon sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
              <Typography variant="subtitle1" fontWeight={600}>
                No results found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                We couldn't find anything matching your search. Try different words, or upload a document about this
                topic first.
              </Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* In-page PDF preview - shows the title the user gave the document
          at upload time, never the raw documentId/filename it's stored
          under on disk. */}
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
              {previewDoc?.page ? ` — Page ${previewDoc.page}` : ""}
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
          <Box sx={{ flexGrow: 1, position: "relative" }}>
            {previewDoc && (
              <iframe
                title={previewDoc.title}
                src={`${previewDoc.blobUrl}${previewDoc.page ? `#page=${previewDoc.page}` : ""}`}
                style={{ border: "none", width: "100%", height: "100%" }}
              />
            )}
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
