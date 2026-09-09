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
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SearchOffIcon from "@mui/icons-material/SearchOff";
import DescriptionIcon from "@mui/icons-material/Description";
import { AppConfig } from "@config/config";
import { ApiService } from "@utils/apiService";

// Proof-of-concept page for the smart search feature. Not linked from the
// main navigation yet - reachable directly at /smart-search-poc while this
// is being validated. Upload a PDF, then search it using plain language.

interface SmartSearchResult {
  content: string;
  title: string;
  page: number | null;
  similarityScore: number;
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

export default function SmartSearchPoc() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SmartSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

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
      const response = await ApiService.getInstance().get(
        `${AppConfig.serviceUrls.smartSearch}?userQuery=${encodeURIComponent(query.trim())}`
      );
      setResults(response.data ?? []);
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

          {results.length > 0 && (
            <Stack spacing={1.5}>
              {results.map((result, index) => (
                <Card key={index} variant="outlined">
                  <CardContent sx={{ "&:last-child": { pb: 2 } }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <DescriptionIcon fontSize="small" color="action" />
                      <Typography variant="subtitle1" fontWeight={600} sx={{ flexGrow: 1 }}>
                        {result.title}
                      </Typography>
                      <Chip
                        size="small"
                        label={`${(result.similarityScore * 100).toFixed(0)}% match`}
                        color={matchColor(result.similarityScore)}
                        variant="outlined"
                      />
                    </Stack>
                    {result.page !== null && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                        Page {result.page}
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      {formatSnippet(result.content)}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}

          {hasSearched && !searching && !searchError && results.length === 0 && (
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
    </Box>
  );
}
