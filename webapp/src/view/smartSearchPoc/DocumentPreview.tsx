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

import { useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { AppConfig } from "@config/config";
import { ApiService } from "@utils/apiService";

// Renders an uploaded document inside the app, in its original format -
// no conversion step, no third-party viewer service.
//
// Only PDFs can be handed straight to the browser (it has a PDF viewer
// built in). PowerPoint, Word and Excel files are read and drawn by
// JavaScript running on this page, from the same file bytes already
// fetched for the preview.
//
// Doing it in the browser is a deliberate choice, not just a convenient
// one. The obvious shortcut - Microsoft's Office Online viewer, or Google's
// document viewer - requires the file to sit at a public URL so their
// servers can fetch it, which would mean sending internal company
// documents to a third party just to look at them. Rendering here means
// the file never leaves the machine it was opened on.
//
// Each renderer is imported only at the moment it is first needed, so
// opening a PDF never downloads the PowerPoint or Excel machinery (the
// slide renderer alone pulls in a charting library, which is large).

interface DocumentPreviewProps {
  // null while the file is still being downloaded - a large deck can be
  // tens of megabytes, so the dialog opens immediately and shows progress
  // rather than leaving the user on a frozen spinner until it arrives.
  file: Blob | null;
  extension: string;
  page: number | null;
  downloadProgress: number | null;
  documentId: string;
  // The chunk of text the search matched, used to scroll straight to it.
  matchedExcerpt?: string;
}

interface SheetData {
  name: string;
  rows: string[][];
}

// A spreadsheet can be tens of thousands of rows long. Drawing all of them
// would lock up the browser for a preview nobody scrolls to the end of.

// Word documents do not store where their pages break. Word and Google Docs
// work it out live, when they render, from the page size, margins and fonts
// in use - which is why a .docx exported from Google Docs contains no page
// information at all, and renders as one continuous run of text.
//
// docx-preview does stamp each section with the real page width and height
// taken from the document's own settings, so the page *size* is known even
// though the page *breaks* are not. This walks the rendered blocks and cuts
// them into page-sized pieces, the same way a word processor would.
//
// The breaks won't land exactly where Word puts them - that depends on the
// exact fonts installed - but the document reads as a paginated document
// rather than one endless page.
function paginateRenderedDocx(container: HTMLElement): void {
  const sections = Array.from(container.querySelectorAll("section.docx")) as HTMLElement[];
  let pageNumber = 0;

  for (const section of sections) {
    const article = section.querySelector("article") as HTMLElement | null;
    if (!article) {
      continue;
    }

    const style = getComputedStyle(section);
    const pageHeight = parseFloat(style.minHeight);
    const usableHeight = pageHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const blocks = Array.from(article.children) as HTMLElement[];
    if (!pageHeight || usableHeight <= 0 || blocks.length === 0) {
      continue;
    }

    let currentSection = section;
    let currentArticle = article;
    currentArticle.innerHTML = "";
    currentSection.dataset.pageNumber = String(++pageNumber);

    for (const block of blocks) {
      currentArticle.appendChild(block);

      // Once this block pushes the page past its usable height, move it to
      // a fresh page - unless it's the only thing on the page, in which case
      // it simply doesn't fit anywhere and stays put.
      if (currentArticle.scrollHeight > usableHeight && currentArticle.children.length > 1) {
        currentArticle.removeChild(block);

        const nextSection = section.cloneNode(false) as HTMLElement;
        const nextArticle = article.cloneNode(false) as HTMLElement;
        nextSection.appendChild(nextArticle);
        nextSection.dataset.pageNumber = String(++pageNumber);
        currentSection.after(nextSection);

        currentSection = nextSection;
        currentArticle = nextArticle;
        currentArticle.appendChild(block);
      }
    }
  }
}

const normalize = (text: string): string => text.replace(/\s+/g, " ").trim().toLowerCase();

// Scrolls to the passage the search actually matched, and highlights it.
// This looks for the text itself rather than jumping to a page number,
// which matters because our page breaks are computed here and may not line
// up with the ones Word would produce - the text, however, is exact.
//
// The matched passage almost never sits inside a single paragraph: a chunk
// usually begins at a heading and runs on into the paragraphs beneath it,
// so searching each element on its own finds nothing. Instead every block's
// text is stitched into one continuous string, remembering where each block
// starts, and the match is found in that - then mapped back to the block it
// began in.
function scrollToMatch(container: HTMLElement, excerpt: string): boolean {
  const blocks = Array.from(
    container.querySelectorAll("p, li, td, h1, h2, h3, h4, h5, h6")
  ) as HTMLElement[];
  if (blocks.length === 0) {
    return false;
  }

  const starts: number[] = [];
  let combined = "";
  for (const block of blocks) {
    starts.push(combined.length);
    combined += `${normalize(block.textContent || "")} `;
  }

  const needle = normalize(excerpt);
  // Longest first: a long run is unambiguous, but the rendered text can
  // differ slightly from the extracted text (a stray character, a bullet
  // rendered differently), so shorter probes are tried as a fallback.
  for (const length of [240, 120, 60, 30]) {
    const probe = needle.slice(0, length);
    if (probe.length < 20) {
      continue;
    }

    const at = combined.indexOf(probe);
    if (at === -1) {
      continue;
    }

    let index = 0;
    while (index + 1 < starts.length && starts[index + 1] <= at) {
      index++;
    }

    const target = blocks[index];
    target.style.backgroundColor = "#fff3b0";
    target.style.transition = "background-color 1.5s ease";
    target.scrollIntoView({ block: "center" });
    return true;
  }

  return false;
}

export default function DocumentPreview({ file, extension, page, downloadProgress, matchedExcerpt, documentId }: DocumentPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [maxSheetRows, setMaxSheetRows] = useState(0);

  useEffect(() => {
    // A preview can be swapped for another one (a different search result)
    // while its file is still being read. cancelled stops the older render
    // from writing its output over the newer one.
    let cancelled = false;
    let createdUrl: string | null = null;
    let slideViewer: { destroy: () => void } | null = null;

    if (!file) {
      return;
    }

    const render = async () => {
      setStatus("loading");
      setErrorMessage("");
      try {
        if (extension === "pdf") {
          createdUrl = URL.createObjectURL(file);
          if (cancelled) {
            return;
          }
          setPdfUrl(createdUrl);
        } else if (extension === "docx") {
          const { renderAsync } = await import("docx-preview");
          const container = containerRef.current;
          if (cancelled || !container) {
            return;
          }
          container.innerHTML = "";
          await renderAsync(file, container, undefined, {
            inWrapper: true,
            breakPages: true,
            renderHeaders: true,
            renderFooters: true,
          });
          if (cancelled) {
            return;
          }
          paginateRenderedDocx(container);
          if (matchedExcerpt) {
            scrollToMatch(container, matchedExcerpt);
          }
        } else if (extension === "pptx") {
          const { init } = await import("pptx-preview");
          const container = containerRef.current;
          if (cancelled || !container) {
            return;
          }
          container.innerHTML = "";
          const width = container.clientWidth || 900;
          const viewer = init(container, {
            width,
            height: Math.round((width * 9) / 16),
            mode: "slide",
          });
          slideViewer = viewer;
          const buffer = await file.arrayBuffer();
          if (cancelled) {
            return;
          }
          await viewer.preview(buffer);
          // Jump straight to the slide the search actually matched, the
          // same way #page=N does for a PDF. Failing here isn't worth
          // breaking the preview over - the deck is still readable from
          // slide one.
          if (page && page > 1) {
            try {
              viewer.renderSingleSlide(page - 1);
              // renderSingleSlide draws the slide but doesn't tell the
              // viewer which slide it is now on, so its own "n/total"
              // counter stays at 0 and the next/previous buttons would
              // step from the wrong place. Setting currentIndex and
              // refreshing the counter keeps all three in agreement.
              viewer.currentIndex = page - 1;
              viewer.updatePagination();
            } catch {
              /* leave it on the first slide */
            }
          }
        } else if (extension === "xlsx") {
          // Read on the server rather than here: this service already opens
          // the file to index it, so parsing it again in the browser would
          // have meant shipping a large spreadsheet library to every user
          // to redo work that has already happened.
          const response = await ApiService.getInstance().get<{ sheets: SheetData[]; maxRows: number }>(
            AppConfig.serviceUrls.smartSearchDocumentSheets(documentId)
          );
          if (cancelled) {
            return;
          }
          const parsed = response.data?.sheets ?? [];
          setSheets(parsed);
          setMaxSheetRows(response.data?.maxRows ?? 0);
          // The search result points at a sheet number, so open on that
          // sheet rather than always the first one.
          if (page && page >= 1 && page <= parsed.length) {
            setActiveSheet(page - 1);
          }
        } else {
          throw new Error(`No preview available for .${extension} files.`);
        }

        if (!cancelled) {
          setStatus("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(error instanceof Error ? error.message : "Unknown error");
          // eslint-disable-next-line no-console
          console.error(error);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
      slideViewer?.destroy();
    };
  }, [file, extension, page, matchedExcerpt, documentId]);

  if (status === "error") {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning">
          This file couldn&apos;t be displayed. Use &quot;Open in new tab&quot; above to download and open it
          directly.
          {errorMessage && (
            <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
              {errorMessage}
            </Typography>
          )}
        </Alert>
      </Box>
    );
  }

  return (
    // position:absolute + inset:0 rather than height:100%. The parent is a
    // flex child that gets its height from flex-grow, and a percentage
    // height against that is unreliable across browsers - it can resolve to
    // "auto", which makes this box grow with the document instead of
    // clipping it, and then there is nothing for overflow:auto to scroll.
    // Pinning to the parent's edges gives a definite height every time.
    <Box sx={{ position: "absolute", inset: 0, overflow: "auto", bgcolor: "grey.100" }}>
      {(status === "loading" || !file) && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "background.paper",
            zIndex: 2,
          }}
        >
          <CircularProgress
            variant={!file && downloadProgress !== null ? "determinate" : "indeterminate"}
            value={downloadProgress ?? 0}
          />
          <Typography variant="body2" color="text.secondary">
            {!file
              ? downloadProgress !== null
                ? `Downloading document… ${downloadProgress}%`
                : "Downloading document…"
              : "Preparing preview…"}
          </Typography>
        </Box>
      )}

      {extension === "pdf" && pdfUrl && (
        <iframe
          title="Document preview"
          src={`${pdfUrl}${page ? `#page=${page}` : ""}`}
          style={{ border: "none", width: "100%", height: "100%", display: "block" }}
        />
      )}

      {extension === "xlsx" && (
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "background.paper" }}>
          {sheets.length > 1 && (
            <Tabs
              value={activeSheet}
              onChange={(_, value) => setActiveSheet(value)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ borderBottom: 1, borderColor: "divider", minHeight: 40 }}
            >
              {sheets.map((sheet) => (
                <Tab key={sheet.name} label={sheet.name} sx={{ minHeight: 40, textTransform: "none" }} />
              ))}
            </Tabs>
          )}
          <Box sx={{ flexGrow: 1, overflow: "auto" }}>
            {sheets[activeSheet] && (
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {(sheets[activeSheet].rows[0] ?? []).map((heading, index) => (
                      <TableCell key={index} sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {heading}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sheets[activeSheet].rows.slice(1).map((row, rowIndex) => (
                    <TableRow key={rowIndex} hover>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex}>{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {maxSheetRows > 0 && sheets[activeSheet]?.rows.length >= maxSheetRows && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", p: 2 }}>
                Showing the first {maxSheetRows} rows of this sheet.
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {(extension === "docx" || extension === "pptx") && (
        <Box
          ref={containerRef}
          sx={{
            width: "100%",
            // Deliberately not a flex container and not height-constrained -
            // the rendered document needs to be free to run taller than the
            // dialog so the scrolling parent above has something to scroll.
            // docx-preview centres its own pages inside the wrapper it
            // creates, so no centering is needed here.
            "& .docx-wrapper": {
              background: "transparent",
              padding: 0,
            },
            "& .docx-wrapper > section.docx": {
              marginBottom: "16px",
              boxShadow: 3,
            },
            p: extension === "docx" ? 2 : 0,
          }}
        />
      )}
    </Box>
  );
}
