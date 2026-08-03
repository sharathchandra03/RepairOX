"use client";

/**
 * PDF Generator — renders the existing A4Template into a real PDF document.
 *
 * Strategy:
 *  1. Mount the A4Template React component into a properly styled container
 *  2. Use html2canvas to capture the rendered DOM as an image
 *  3. Embed the image into a jsPDF A4 page
 *  4. Return the PDF as a Blob or trigger download
 *
 * The key to proper text rendering is:
 *  - Container must be in the DOM and visible (not display:none)
 *  - Container width must be set in pixels (not mm) for html2canvas
 *  - All Tailwind classes must resolve normally (same stylesheet)
 *  - Grid/flex children need explicit gap to prevent whitespace collapse
 */

import { createRoot } from "react-dom/client";
import { createElement } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import type { PrintDocumentData } from "@/lib/print-utils";
import { A4Template } from "@/components/print/a4-template";

/* ─── Types ──────────────────────────────────────────────────────────── */

export type DocumentType = "ticket" | "invoice";

export interface PdfGenerationResult {
  blob: Blob;
  filename: string;
}

export interface BulkDownloadProgress {
  current: number;
  total: number;
  phase: "preparing" | "generating" | "compressing" | "complete" | "error";
  message: string;
  failures: { id: string; error: string }[];
  successes: PdfGenerationResult[];
}

export type BulkDownloadFormat = "individual" | "zip";

/* ─── PDF Filename Builders ──────────────────────────────────────────── */

/**
 * Generate the proper filename for an invoice PDF.
 * Convention: {Type}_INV_{number}.pdf
 */
export function getInvoicePdfFilename(invoiceId: string, invoiceType: string, serviceCategory?: string): string {
  const numericPart = invoiceId.replace(/[^0-9]/g, "").padStart(6, "0");

  let prefix: string;
  if (serviceCategory === "accessories") {
    prefix = "Accessories";
  } else if (invoiceType === "business") {
    prefix = "Tax";
  } else {
    prefix = "Retail";
  }

  return `${prefix}_INV_${numericPart}.pdf`;
}

/**
 * Generate the proper filename for a ticket PDF.
 * Convention: Ticket_{number}.pdf
 */
export function getTicketPdfFilename(ticketId: string): string {
  const numericPart = ticketId.replace(/[^0-9]/g, "").padStart(6, "0");
  return `Ticket_${numericPart}.pdf`;
}

/* ─── Core PDF Generation ────────────────────────────────────────────── */

/** A4 width in pixels at 96dpi */
const A4_WIDTH_PX = 794;

/**
 * CSS injected into the capture container to fix html2canvas text rendering.
 * html2canvas has a known issue where it collapses whitespace text nodes
 * between inline elements. These rules ensure proper spacing.
 */
const PDF_OVERRIDE_CSS = `
  .pdf-capture-root .a4-page {
    width: ${A4_WIDTH_PX}px !important;
    min-height: auto !important;
    padding: 56px !important;
    margin: 0 !important;
    box-shadow: none !important;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    -webkit-font-smoothing: antialiased !important;
  }
  /* Force grid children to use flex with explicit gap — prevents label:value merging */
  .pdf-capture-root .a4-page .grid > div {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: baseline !important;
    column-gap: 5px !important;
  }
  /* Make each span inside grid items an inline-block to prevent text collapsing */
  .pdf-capture-root .a4-page .grid > div > span {
    display: inline-block !important;
    flex-shrink: 0 !important;
  }
  /* Header document info: ensure spacing between label and value */
  .pdf-capture-root .a4-page .space-y-0\\.5 > p {
    display: flex !important;
    align-items: baseline !important;
    gap: 4px !important;
  }
  /* Customer info flex wrap spacing */
  .pdf-capture-root .a4-page .flex.flex-wrap {
    gap: 24px 32px !important;
  }
  /* Ensure table cells have proper padding and no text overlap */
  .pdf-capture-root .a4-page table th,
  .pdf-capture-root .a4-page table td {
    padding-left: 8px !important;
    padding-right: 8px !important;
  }
`;

/**
 * Renders a PrintDocumentData object into an A4 PDF blob.
 * Uses the exact same A4Template component used for printing.
 */
export async function generatePdfFromData(data: PrintDocumentData): Promise<Blob> {
  // Inject global PDF override styles (once, reused across multiple calls)
  ensurePdfStyles();

  // Create a container that is rendered off-screen but VISIBLE to the browser.
  // We position it at top:0 left:0 with fixed positioning and clip it so the
  // user never sees it, but the browser computes layout and fonts properly.
  const container = document.createElement("div");
  container.className = "pdf-capture-root";
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: ${A4_WIDTH_PX}px;
    z-index: -99999;
    pointer-events: none;
    clip: rect(0, 0, 0, 0);
    clip-path: inset(50%);
    overflow: hidden;
    white-space: normal;
  `;
  document.body.appendChild(container);

  try {
    // Render the A4Template
    const root = createRoot(container);
    await new Promise<void>((resolve) => {
      root.render(createElement(A4Template, { data }));
      setTimeout(resolve, 100);
    });

    // Get the rendered .a4-page element
    const pageEl = container.querySelector(".a4-page") as HTMLElement;
    if (!pageEl) {
      throw new Error("A4Template did not render .a4-page element");
    }

    // CRITICAL: Temporarily make the container fully visible for html2canvas.
    // html2canvas needs the element to be painted and have computed dimensions.
    container.style.clip = "auto";
    container.style.clipPath = "none";
    container.style.overflow = "visible";

    // Force reflow so the browser recalculates layout with the element visible
    void pageEl.offsetHeight;
    void pageEl.getBoundingClientRect();

    // Wait for fonts and images to fully load and render
    await new Promise((r) => setTimeout(r, 500));

    // Capture with html2canvas
    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    // Re-hide immediately after capture
    container.style.clip = "rect(0, 0, 0, 0)";
    container.style.clipPath = "inset(50%)";
    container.style.overflow = "hidden";

    // Build the PDF
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pdfWidth = 210;
    const pdfHeight = 297;
    const canvasAspect = canvas.height / canvas.width;
    const imgHeight = pdfWidth * canvasAspect;

    if (imgHeight <= pdfHeight) {
      // Single page
      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.95),
        "JPEG",
        0,
        0,
        pdfWidth,
        imgHeight
      );
    } else {
      // Multi-page
      const pageCount = Math.ceil(imgHeight / pdfHeight);
      for (let i = 0; i < pageCount; i++) {
        if (i > 0) pdf.addPage();

        const sourceY = (i * pdfHeight / imgHeight) * canvas.height;
        const sourceHeight = (pdfHeight / imgHeight) * canvas.height;

        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = Math.min(sourceHeight, canvas.height - sourceY);
        const ctx = pageCanvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          ctx.drawImage(
            canvas,
            0, sourceY,
            canvas.width, pageCanvas.height,
            0, 0,
            pageCanvas.width, pageCanvas.height
          );
        }

        const sliceHeight = (pageCanvas.height / canvas.width) * pdfWidth;
        pdf.addImage(
          pageCanvas.toDataURL("image/jpeg", 0.95),
          "JPEG",
          0,
          0,
          pdfWidth,
          Math.min(sliceHeight, pdfHeight)
        );
      }
    }

    root.unmount();
    return pdf.output("blob");
  } finally {
    document.body.removeChild(container);
  }
}

/** Ensures the PDF override stylesheet is in the document (idempotent). */
function ensurePdfStyles(): void {
  if (document.getElementById("pdf-gen-styles")) return;
  const style = document.createElement("style");
  style.id = "pdf-gen-styles";
  style.textContent = PDF_OVERRIDE_CSS;
  document.head.appendChild(style);
}

/* ─── Single Download ────────────────────────────────────────────────── */

export async function downloadSinglePdf(
  data: PrintDocumentData,
  filename: string
): Promise<void> {
  const blob = await generatePdfFromData(data);
  triggerBlobDownload(blob, filename);
}

/* ─── Bulk Download ──────────────────────────────────────────────────── */

export async function downloadBulkPdfs(
  items: { data: PrintDocumentData; filename: string; id: string }[],
  format: BulkDownloadFormat,
  onProgress: (progress: BulkDownloadProgress) => void
): Promise<void> {
  const total = items.length;
  const failures: { id: string; error: string }[] = [];
  const successes: PdfGenerationResult[] = [];

  onProgress({
    current: 0,
    total,
    phase: "preparing",
    message: "Preparing PDFs...",
    failures,
    successes,
  });

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress({
      current: i + 1,
      total,
      phase: "generating",
      message: `Generating ${i + 1} of ${total}...`,
      failures,
      successes,
    });

    try {
      const blob = await generatePdfFromData(item.data);
      successes.push({ blob, filename: item.filename });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      failures.push({ id: item.id, error: errorMsg });
    }

    // Small delay between generations to prevent UI freeze
    await new Promise((r) => setTimeout(r, 50));
  }

  if (format === "individual") {
    for (const result of successes) {
      triggerBlobDownload(result.blob, result.filename);
      await new Promise((r) => setTimeout(r, 200));
    }
  } else {
    onProgress({
      current: total,
      total,
      phase: "compressing",
      message: "Compressing ZIP...",
      failures,
      successes,
    });

    const zip = new JSZip();
    for (const result of successes) {
      zip.file(result.filename, result.blob);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const zipFilename = successes.length > 0
      ? (successes[0].filename.startsWith("Ticket") ? "Tickets.zip" : "Invoices.zip")
      : "Documents.zip";

    triggerBlobDownload(zipBlob, zipFilename);
  }

  onProgress({
    current: total,
    total,
    phase: failures.length > 0 ? "error" : "complete",
    message: failures.length > 0
      ? `${successes.length} downloaded successfully, ${failures.length} failed`
      : "Download Ready",
    failures,
    successes,
  });
}

/* ─── Utility ────────────────────────────────────────────────────────── */

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
