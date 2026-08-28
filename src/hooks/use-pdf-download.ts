"use client";

/**
 * usePdfDownload — React hook for generating and downloading PDFs.
 *
 * Handles single and bulk downloads for tickets and invoices,
 * logs all actions to the audit trail, and respects permissions.
 */

import { useState, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useStoreSettings } from "@/lib/store-settings";
import { usePermissions } from "@/lib/permissions-context";
import { logActivity } from "@/lib/activity-log";
import {
  buildInvoicePrintData,
  buildTicketPrintData,
} from "@/lib/print-utils";
import {
  generatePdfFromData,
  downloadSinglePdf,
  downloadBulkPdfs,
  getInvoicePdfFilename,
  getTicketPdfFilename,
  type BulkDownloadFormat,
  type BulkDownloadProgress,
} from "@/lib/pdf-generator";
import type { Invoice, Ticket } from "@/lib/mock-data";

/* ─── Types ──────────────────────────────────────────────────────────── */

export interface UsePdfDownloadReturn {
  /** Download a single invoice as PDF */
  downloadInvoice: (invoice: Invoice) => Promise<void>;
  /** Download a single ticket as PDF */
  downloadTicket: (ticket: Ticket) => Promise<void>;
  /** Start bulk invoice download (opens dialog flow) */
  startBulkInvoiceDownload: (invoiceIds: string[]) => void;
  /** Start bulk ticket download (opens dialog flow) */
  startBulkTicketDownload: (ticketIds: string[]) => void;
  /** Execute the bulk download with chosen format */
  executeBulkDownload: (format: BulkDownloadFormat) => void;
  /** Retry failed items from last bulk download */
  retryFailed: () => void;
  /** Whether a single download is in progress */
  isDownloading: boolean;
  /** Bulk download dialog state */
  bulkDialog: {
    open: boolean;
    title: string;
    count: number;
    close: () => void;
  };
  /** Bulk download progress */
  bulkProgress: BulkDownloadProgress | null;
  /** Whether user has download permission */
  canDownload: boolean;
}

/* ─── Hook ───────────────────────────────────────────────────────────── */

export function usePdfDownload(): UsePdfDownloadReturn {
  const { invoices, tickets } = useStore();
  const { settings } = useStoreSettings();
  const { can } = usePermissions();

  const [isDownloading, setIsDownloading] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkTitle, setBulkTitle] = useState("");
  const [bulkCount, setBulkCount] = useState(0);
  const [bulkProgress, setBulkProgress] = useState<BulkDownloadProgress | null>(null);
  const [pendingBulkItems, setPendingBulkItems] = useState<{ data: any; filename: string; id: string }[]>([]);
  const [failedItems, setFailedItems] = useState<{ data: any; filename: string; id: string }[]>([]);

  // Permission check: print_documents OR print_invoice covers download
  const canDownload = can("print_documents") || can("print_invoice") || can("view_invoice") || can("view_ticket");

  /* ─── Single Invoice Download ─── */
  const downloadInvoice = useCallback(async (invoice: Invoice) => {
    if (!canDownload) return;
    setIsDownloading(true);
    try {
      const printData = buildInvoicePrintData(settings, invoice);
      const filename = getInvoicePdfFilename(invoice.id, invoice.invoiceType, invoice.serviceCategory);
      await downloadSinglePdf(printData, filename);

      // Audit log
      logActivity({
        module: "Invoice",
        action: "Downloaded PDF",
        severity: "info",
        entity: "Invoice",
        reference: invoice.id,
        description: `Downloaded ${filename}`,
        meta: { format: "pdf", type: "single" },
      });
    } catch (err) {
      console.error("[PDF Download] Invoice failed:", err);
    } finally {
      setIsDownloading(false);
    }
  }, [settings, canDownload]);

  /* ─── Single Ticket Download ─── */
  const downloadTicket = useCallback(async (ticket: Ticket) => {
    if (!canDownload) return;
    setIsDownloading(true);
    try {
      const printData = buildTicketPrintData(settings, ticket);
      const filename = getTicketPdfFilename(ticket.ticketNo ?? ticket.id);
      await downloadSinglePdf(printData, filename);

      // Audit log
      logActivity({
        module: "Ticket",
        action: "Downloaded PDF",
        severity: "info",
        entity: "Ticket",
        reference: ticket.id,
        description: `Downloaded ${filename}`,
        meta: { format: "pdf", type: "single" },
      });
    } catch (err) {
      console.error("[PDF Download] Ticket failed:", err);
    } finally {
      setIsDownloading(false);
    }
  }, [settings, canDownload]);

  /* ─── Bulk Invoice Download (open dialog) ─── */
  const startBulkInvoiceDownload = useCallback((invoiceIds: string[]) => {
    if (!canDownload) return;
    const selectedInvoices = invoices.filter((inv) => invoiceIds.includes(inv.id));
    if (selectedInvoices.length === 0) return;

    const items = selectedInvoices.map((inv) => ({
      data: buildInvoicePrintData(settings, inv),
      filename: getInvoicePdfFilename(inv.id, inv.invoiceType, inv.serviceCategory),
      id: inv.id,
    }));

    setPendingBulkItems(items);
    setBulkTitle("Download Selected Invoices");
    setBulkCount(items.length);
    setBulkProgress(null);
    setBulkDialogOpen(true);
  }, [invoices, settings, canDownload]);

  /* ─── Bulk Ticket Download (open dialog) ─── */
  const startBulkTicketDownload = useCallback((ticketIds: string[]) => {
    if (!canDownload) return;
    const selectedTickets = tickets.filter((t) => ticketIds.includes(t.id));
    if (selectedTickets.length === 0) return;

    const items = selectedTickets.map((t) => ({
      data: buildTicketPrintData(settings, t),
      filename: getTicketPdfFilename(t.ticketNo ?? t.id),
      id: t.id,
    }));

    setPendingBulkItems(items);
    setBulkTitle("Download Selected Tickets");
    setBulkCount(items.length);
    setBulkProgress(null);
    setBulkDialogOpen(true);
  }, [tickets, settings, canDownload]);

  /* ─── Execute Bulk Download ─── */
  const executeBulkDownload = useCallback((format: BulkDownloadFormat) => {
    downloadBulkPdfs(pendingBulkItems, format, (progress) => {
      setBulkProgress(progress);

      if (progress.phase === "complete" || progress.phase === "error") {
        // Track failed items for retry
        if (progress.failures.length > 0) {
          const failedIds = new Set(progress.failures.map((f) => f.id));
          setFailedItems(pendingBulkItems.filter((item) => failedIds.has(item.id)));
        }

        // Audit log
        const docType = bulkTitle.includes("Invoice") ? "Invoice" : "Ticket";
        logActivity({
          module: docType as any,
          action: "Bulk Downloaded PDFs",
          severity: progress.failures.length > 0 ? "warning" : "success",
          entity: docType,
          description: `Downloaded ${progress.successes.length} ${docType.toLowerCase()}${progress.successes.length !== 1 ? "s" : ""}${progress.failures.length > 0 ? `, ${progress.failures.length} failed` : ""}`,
          meta: {
            format: format === "zip" ? "zip" : "individual",
            type: "bulk",
            fileCount: String(progress.successes.length),
            failedCount: String(progress.failures.length),
          },
        });
      }
    });
  }, [pendingBulkItems, bulkTitle]);

  /* ─── Retry Failed ─── */
  const retryFailed = useCallback(() => {
    if (failedItems.length === 0) return;
    setPendingBulkItems(failedItems);
    setBulkCount(failedItems.length);
    setBulkProgress(null);
  }, [failedItems]);

  /* ─── Close Dialog ─── */
  const closeBulkDialog = useCallback(() => {
    setBulkDialogOpen(false);
    setBulkProgress(null);
    setPendingBulkItems([]);
    setFailedItems([]);
  }, []);

  return {
    downloadInvoice,
    downloadTicket,
    startBulkInvoiceDownload,
    startBulkTicketDownload,
    executeBulkDownload,
    retryFailed,
    isDownloading,
    bulkDialog: {
      open: bulkDialogOpen,
      title: bulkTitle,
      count: bulkCount,
      close: closeBulkDialog,
    },
    bulkProgress,
    canDownload,
  };
}
