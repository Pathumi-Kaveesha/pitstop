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

// Browsers refuse canvases past roughly these sizes (Safari is the strictest).
const MAX_CANVAS_SIDE = 16000;
const MAX_CANVAS_AREA = 16_000_000;
const PX_TO_PT = 0.75;
const PDF_MAX_SIDE_PT = 14400;
const DETAIL_PAGE_RATIO = 1.414;
const PAGE_MARGIN_PT = 24;
const BLOCK_GAP_PT = 12;
const MIN_SLICE_CSS_PX = 40;
const SETTLE_DELAY_MS = 150;
const TRANSPARENT_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export interface DashboardPdfOptions {
  dashboard: HTMLElement;
  details: HTMLElement | null;
  backgroundColor: string;
  fileName: string;
}

interface Shot {
  canvas: HTMLCanvasElement;
  cssWidth: number;
  cssHeight: number;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// Copies a live section so the export never touches what the user sees.
const cloneForExport = (source: HTMLElement) => {
  const clone = source.cloneNode(true) as HTMLElement;

  // cloneNode does not carry typed-in values, so copy them across before anything is removed
  const sourceFields = source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  const cloneFields = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  sourceFields.forEach((field, idx) => {
    if (cloneFields[idx]) cloneFields[idx].value = field.value;
  });

  clone.querySelectorAll('[data-export-hide="true"]').forEach((el) => el.remove());
  // The live check already blocks real overflow, so scrollbars in the copy are only rounding noise
  clone.querySelectorAll<HTMLElement>(".MuiTableContainer-root").forEach((el) => {
    el.style.overflow = "visible";
  });
  const exportOnly = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("[data-export-only]"))];
  exportOnly.forEach((el) => {
    if (el.dataset.exportOnly) el.style.display = el.dataset.exportOnly;
  });
  return clone;
};

const pickPixelRatio = (width: number, height: number) =>
  Math.max(
    0.5,
    Math.min(
      2,
      MAX_CANVAS_SIDE / Math.max(width, height, 1),
      Math.sqrt(MAX_CANVAS_AREA / Math.max(width * height, 1))
    )
  );

const toHexColor = (color: string) => {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.fillStyle = color;
  const normalized = String(ctx.fillStyle);
  return normalized.startsWith("#") ? normalized : "#ffffff";
};

const capture = async (node: HTMLElement, backgroundColor: string): Promise<Shot> => {
  const { toCanvas } = await import("html-to-image");
  const cssWidth = node.offsetWidth;
  const cssHeight = node.offsetHeight;
  if (cssWidth === 0 || cssHeight === 0) {
    throw new Error("Nothing to capture: the element has no size.");
  }
  const canvas = await toCanvas(node, {
    backgroundColor,
    pixelRatio: pickPixelRatio(cssWidth, cssHeight),
    imagePlaceholder: TRANSPARENT_PIXEL,
    filter: (child) => !(child instanceof HTMLElement && child.dataset.exportHide === "true"),
  });
  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error("The captured image is empty.");
  }
  return { canvas, cssWidth, cssHeight };
};

const sliceCanvas = (source: HTMLCanvasElement, fromPx: number, toPx: number) => {
  const top = Math.max(0, Math.round(fromPx));
  const bottom = Math.min(source.height, Math.round(toPx));
  const slice = document.createElement("canvas");
  slice.width = source.width;
  slice.height = Math.max(1, bottom - top);
  const ctx = slice.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(source, 0, top, source.width, slice.height, 0, 0, source.width, slice.height);
  return slice;
};

// Safe cut points inside a block: the bottom edge of every row marked data-export-row.
const rowBottoms = (block: HTMLElement) => {
  const top = block.getBoundingClientRect().top;
  return Array.from(block.querySelectorAll<HTMLElement>("[data-export-row]"))
    .map((row) => row.getBoundingClientRect().bottom - top)
    .filter((y) => y > 0)
    .sort((a, b) => a - b);
};

export const exportDashboardPdf = async ({ dashboard, details, backgroundColor, fileName }: DashboardPdfOptions) => {
  if (document.fonts?.ready) await document.fonts.ready;
  await nextFrame();
  await nextFrame();

  // Off-screen copies at the same width keep the same layout without covering the real page.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    top: "0",
    left: "-100000px",
    width: `${dashboard.offsetWidth}px`,
    pointerEvents: "none",
  });
  const page = cloneForExport(dashboard);
  host.appendChild(page);
  const detailsCopy = details ? cloneForExport(details) : null;
  if (detailsCopy) host.appendChild(detailsCopy);
  document.body.appendChild(host);

  try {
    await nextFrame();
    await new Promise((resolve) => setTimeout(resolve, SETTLE_DELAY_MS));
    const detailBlocks = detailsCopy
      ? Array.from(detailsCopy.querySelectorAll<HTMLElement>("[data-export-block]"))
      : [];
    await buildPdf(page, detailBlocks, backgroundColor, fileName);
  } finally {
    host.remove();
  }
};

const buildPdf = async (
  dashboard: HTMLElement,
  detailBlocks: HTMLElement[],
  backgroundColor: string,
  fileName: string
) => {
  const { jsPDF } = await import("jspdf");
  const pageFill = toHexColor(backgroundColor);

  const dash = await capture(dashboard, backgroundColor);
  const pageWidthPt = dash.cssWidth * PX_TO_PT;
  const dashHeightPt = dash.cssHeight * PX_TO_PT;
  const dashPxPerPt = dash.canvas.height / dashHeightPt;
  const orientationFor = (heightPt: number) => (pageWidthPt > heightPt ? "landscape" : "portrait");

  // The dashboard goes on its own page at its real size, so it looks exactly like the screen.
  const firstHeightPt = Math.min(dashHeightPt, PDF_MAX_SIDE_PT);
  const pdf = new jsPDF({
    unit: "pt",
    format: [pageWidthPt, firstHeightPt],
    orientation: orientationFor(firstHeightPt),
    compress: true,
  });

  for (let offsetPt = 0; offsetPt < dashHeightPt; offsetPt += PDF_MAX_SIDE_PT) {
    const heightPt = Math.min(PDF_MAX_SIDE_PT, dashHeightPt - offsetPt);
    if (offsetPt > 0) pdf.addPage([pageWidthPt, heightPt], orientationFor(heightPt));
    const slice = sliceCanvas(dash.canvas, offsetPt * dashPxPerPt, (offsetPt + heightPt) * dashPxPerPt);
    pdf.addImage(slice, "PNG", 0, 0, pageWidthPt, heightPt, undefined, "FAST");
  }

  if (detailBlocks.length > 0) {
    const pageHeightPt = Math.round(pageWidthPt * DETAIL_PAGE_RATIO);
    const contentWidthPt = pageWidthPt - PAGE_MARGIN_PT * 2;
    const pageBottomPt = pageHeightPt - PAGE_MARGIN_PT;
    let cursorPt = PAGE_MARGIN_PT;

    const newPage = () => {
      pdf.addPage([pageWidthPt, pageHeightPt], orientationFor(pageHeightPt));
      pdf.setFillColor(pageFill);
      pdf.rect(0, 0, pageWidthPt, pageHeightPt, "F");
      cursorPt = PAGE_MARGIN_PT;
    };

    newPage();

    for (const block of detailBlocks) {
      const breaks = rowBottoms(block);
      const shot = await capture(block, backgroundColor);
      const ptPerCss = contentWidthPt / shot.cssWidth;
      const pxPerCss = shot.canvas.height / shot.cssHeight;
      const blockHeightPt = shot.cssHeight * ptPerCss;

      const draw = (fromCss: number, toCss: number) => {
        const slice = sliceCanvas(shot.canvas, fromCss * pxPerCss, toCss * pxPerCss);
        const heightPt = (toCss - fromCss) * ptPerCss;
        pdf.addImage(slice, "PNG", PAGE_MARGIN_PT, cursorPt, contentWidthPt, heightPt, undefined, "FAST");
        cursorPt += heightPt;
      };

      // Keep a block whole whenever it fits on one page.
      if (blockHeightPt <= pageBottomPt - PAGE_MARGIN_PT) {
        if (cursorPt + blockHeightPt > pageBottomPt) newPage();
        draw(0, shot.cssHeight);
        cursorPt += BLOCK_GAP_PT;
        continue;
      }

      // A block taller than a page is cut between rows, never through one.
      let startCss = 0;
      while (startCss < shot.cssHeight - 0.5) {
        let roomCss = (pageBottomPt - cursorPt) / ptPerCss;
        if (roomCss < MIN_SLICE_CSS_PX) {
          newPage();
          roomCss = (pageBottomPt - cursorPt) / ptPerCss;
        }
        const limitCss = startCss + roomCss;
        let endCss = shot.cssHeight;
        if (shot.cssHeight > limitCss) {
          const fitting = breaks.filter((y) => y > startCss + 0.5 && y <= limitCss);
          if (fitting.length > 0) {
            endCss = fitting[fitting.length - 1];
          } else if (cursorPt > PAGE_MARGIN_PT) {
            newPage();
            continue;
          } else {
            endCss = limitCss;
          }
        }
        draw(startCss, endCss);
        startCss = endCss;
        if (startCss < shot.cssHeight - 0.5) newPage();
      }
      cursorPt += BLOCK_GAP_PT;
    }
  }

  pdf.save(fileName);
};
