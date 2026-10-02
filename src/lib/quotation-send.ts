"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Quotation "Send on WhatsApp" helper.

   WhatsApp's click-to-chat (wa.me) URL can ONLY pre-fill TEXT — it cannot
   attach a file. So "send a short message + the PDF" is delivered as:

     1. Generate the quotation PDF (same A4 document as Print/Preview) and
        DOWNLOAD it so it's ready on the agent's device.
     2. Open WhatsApp addressed to the customer's number with a SHORT covering
        message (summary + "PDF attached" + optional view link).
     3. The agent attaches the just-downloaded PDF in the chat (one tap).

   This keeps a single rendering source (the A4 QuotationA4 doc) for
   Preview = Print = PDF = WhatsApp. A future WhatsApp Business Cloud API
   integration can replace step 1/3 with a true document-message send without
   changing callers — they just call sendQuotationOnWhatsApp().
   ────────────────────────────────────────────────────────────────────────── */

import type { StoreSettings } from "@/lib/store-settings";
import { buildStoreInfo, buildQuotationPrintData, getQuotationPrintUrl } from "@/lib/print-utils";
import { generatePdfFromData, downloadSinglePdf } from "@/lib/pdf-generator";
import {
  type Quotation, type QuotationPolicy, DEFAULT_QUOTATION_POLICY,
  buildQuotationMessage, buildQuotationWhatsAppUrl, warrantyLabel,
  getQuotationPdfFilename,
} from "@/lib/quotation-data";

/** Build the PrintDocumentData for a quotation (same source as the print page). */
export function quotationPrintData(q: Quotation, settings: StoreSettings, policy: QuotationPolicy = DEFAULT_QUOTATION_POLICY) {
  const store = buildStoreInfo(settings);
  const message = buildQuotationMessage(q, store, policy);
  return buildQuotationPrintData(
    settings,
    {
      quotationNo: q.quotationNo,
      source: q.source,
      leadNo: q.leadNo,
      createdAt: q.createdAt,
      validUntil: q.validUntil,
      status: q.status,
      customerName: q.customerName,
      phone: q.phone,
      email: q.email,
      location: q.location,
      salesAgentName: q.salesAgentName,
      device: q.device,
      issue: q.issue,
      warrantyLabel: warrantyLabel(q.warranty),
      items: q.items.map((it) => ({ name: it.name, description: it.description, qty: it.qty, unitPrice: it.unitPrice, total: it.total })),
      subtotal: q.subtotal,
      discount: q.discount,
      amount: q.amount,
      note: q.note,
    },
    message.paragraphs,
  );
}

export interface SendWhatsAppResult {
  /** True when a WhatsApp window was opened. */
  opened: boolean;
  /** True when the PDF was generated + downloaded. */
  pdfDownloaded: boolean;
  /** Set when the customer has no usable phone (WhatsApp not opened). */
  noPhone: boolean;
}

/**
 * Generate + download the quotation PDF, then open WhatsApp with a short
 * covering message. Returns what happened so the caller can toast accurately.
 *
 * The WhatsApp window is opened via a pre-created tab (opened synchronously by
 * the caller is ideal) — but since PDF generation is async, we open AFTER it.
 * We still pass a ready URL so the window navigates immediately.
 */
export async function sendQuotationOnWhatsApp(
  q: Quotation,
  settings: StoreSettings,
  opts?: { policy?: QuotationPolicy; downloadPdf?: boolean },
): Promise<SendWhatsAppResult> {
  const policy = opts?.policy ?? DEFAULT_QUOTATION_POLICY;
  const store = buildStoreInfo(settings);
  const documentUrl = typeof window !== "undefined" ? `${window.location.origin}${getQuotationPrintUrl(q.id)}` : undefined;
  const waUrl = buildQuotationWhatsAppUrl(q, store, policy, { documentUrl });

  if (!waUrl) {
    // No phone — still generate + download the PDF so the agent has it.
    const pdfDownloaded = await tryDownloadPdf(q, settings, policy, opts?.downloadPdf);
    return { opened: false, pdfDownloaded, noPhone: true };
  }

  // Open the WhatsApp tab SYNCHRONOUSLY (within the click gesture) and navigate
  // it immediately — this survives the pop-up blocker, which would otherwise
  // kill a window.open() fired after the async PDF generation. (We never read
  // the cross-origin wa.me location back; that would throw.)
  let openedSync = false;
  if (typeof window !== "undefined") {
    const waWindow = window.open(waUrl, "_blank");
    openedSync = !!waWindow;
  }

  // Generate + download the PDF so it's ready to attach in the chat.
  const pdfDownloaded = await tryDownloadPdf(q, settings, policy, opts?.downloadPdf);

  // If the synchronous open was blocked (returned null), try once more.
  if (typeof window !== "undefined" && !openedSync) {
    window.open(waUrl, "_blank");
  }

  return { opened: true, pdfDownloaded, noPhone: false };
}

async function tryDownloadPdf(
  q: Quotation,
  settings: StoreSettings,
  policy: QuotationPolicy,
  downloadPdf?: boolean,
): Promise<boolean> {
  if (downloadPdf === false) return false;
  try {
    const data = quotationPrintData(q, settings, policy);
    await downloadSinglePdf(data, getQuotationPdfFilename(q));
    return true;
  } catch (err) {
    console.error("[quotation] PDF generation failed:", err);
    return false;
  }
}

/** Just build the quotation PDF blob (for future API upload / preview). */
export async function quotationPdfBlob(q: Quotation, settings: StoreSettings, policy: QuotationPolicy = DEFAULT_QUOTATION_POLICY): Promise<Blob> {
  return generatePdfFromData(quotationPrintData(q, settings, policy));
}
