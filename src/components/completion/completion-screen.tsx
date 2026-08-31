"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Printer, MessageCircle, Mail, Pencil, Plus, LayoutDashboard, ListChecks, Tag, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StoreLogo } from "@/components/ui/store-logo";
import { cn } from "@/lib/utils";
import {
  getTicketPrintUrl,
  getInvoicePrintUrl,
  buildTicketPrintData,
  buildInvoicePrintData,
  type PrintFormat,
  type PrintDocumentData,
} from "@/lib/print-utils";
import { useStore } from "@/lib/store";
import { useStoreSettings } from "@/lib/store-settings";
import { A4Template } from "@/components/print/a4-template";
import { ThermalTemplate } from "@/components/print/thermal-template";
import { LabelTemplate } from "@/components/print/label-template";

/* ─── Shared Completion Screen ───────────────────────────────────────── */
/*
 * Reusable completion page used by BOTH Ticket and Invoice creation flows.
 * The selected receipt format (A4 / Thermal) is the single source of truth
 * for Print, WhatsApp and Email actions. None of these actions navigate to
 * a list — they open the correct print preview in a new tab.
 */

type CompletionType = "ticket" | "invoice";

type CompletionScreenProps = {
  type: CompletionType;
  /** The created document id (e.g. "T-1234" or "INV001") */
  id: string;
  isEdit?: boolean;
  /** Navigate to the list — ONLY called when the Back link is clicked */
  onBack: () => void;
  /** Navigate to the document edit page — ONLY called on Edit */
  onEdit: () => void;
};

export function CompletionScreen({ type, id, isEdit = false, onBack: _onBack, onEdit }: CompletionScreenProps) {
  const router = useRouter();
  const { tickets, invoices } = useStore();
  const { settings } = useStoreSettings();
  const [format, setFormat] = useState<PrintFormat>("a4");
  // Read-only preview overlay. Kept as local state so the success screen
  // (and all its actions) stay mounted underneath and are restored on close.
  const [showView, setShowView] = useState(false);

  const label = type === "ticket" ? "Ticket" : "Invoice";

  /*
   * Build the print data for the read-only View preview from the in-memory
   * store record. This reuses the exact same print-data builders and templates
   * as the Print flow (no duplicated logic), but reads the record that was just
   * created directly from the store — so it always resolves, unlike a fresh
   * page load that may not have re-hydrated the new record yet.
   */
  const viewData: PrintDocumentData | null = useMemo(() => {
    if (type === "ticket") {
      const ticket = tickets.find((t) => t.id === id || t.ticketNo === id);
      return ticket ? buildTicketPrintData(settings, ticket) : null;
    }
    const invoice = invoices.find((i) => i.id === id);
    if (!invoice) return null;
    const lt = invoice.ticketId ? tickets.find((t) => t.id === invoice.ticketId) : undefined;
    return buildInvoicePrintData(settings, invoice, lt?.ticketNo ?? invoice.ticketId);
  }, [type, id, tickets, invoices, settings]);

  // Invoices don't support the "label" format — fall back to A4 for the preview.
  const viewFormat: PrintFormat = type === "invoice" && format === "label" ? "a4" : format;
  const backLabel = type === "ticket" ? "tickets" : "invoices";
  const createPath = type === "ticket" ? "/tickets/new" : "/invoice/create";
  // Full-width primary action → the shop/billing dashboard (single dashboard
  // route serves both ticket and invoice flows in this workspace).
  const dashboardPath = "/dashboard";
  // Bottom-nav "Manage" → the relevant table/list for this record type.
  const managePath = type === "ticket" ? "/tickets" : "/invoice";

  /** Build the print-preview URL for the currently selected format */
  const previewUrl = (auto: boolean) => {
    const base = type === "ticket" ? getTicketPrintUrl(id, format) : getInvoicePrintUrl(id, format);
    return auto ? `${base}&auto=1` : base;
  };

  /** Open the print preview in a new tab — never redirects the current page */
  const openPreview = (auto: boolean) => {
    if (typeof window !== "undefined") {
      window.open(previewUrl(auto), "_blank", "noopener,noreferrer");
    }
  };

  const handlePrint = () => openPreview(false);
  const handleWhatsApp = () => openPreview(false);
  const handleEmail = () => openPreview(false);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-white via-indigo-50/30 to-white">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-25" />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center px-4 py-10 text-center sm:px-6">
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 18 }} className="flex items-center justify-center">
          <StoreLogo size="xl" />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="font-display mt-6 text-4xl font-extrabold tracking-tight md:text-5xl">
          {isEdit ? <><span className="brand-gradient-text">{label} updated!</span></> : <>Thank you! <span className="brand-gradient-text">{label} created.</span></>}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-2 max-w-md text-sm text-muted-foreground">
          {isEdit ? `Your changes have been saved. The ${backLabel} list will reflect the updates.` : "A confirmation has been queued for SMS, WhatsApp and email. Choose how you'd like to print or share the receipt."}
        </motion.p>

        {!isEdit && (
          <>
            <div className={cn("mt-8 grid w-full grid-cols-1 gap-3", type === "ticket" ? "max-w-md sm:grid-cols-3" : "max-w-md sm:grid-cols-2")}>
              {[
                { id: "a4", label: "A4 Receipt", desc: "Best for filing & email", icon: Printer },
                { id: "thermal", label: "Thermal Receipt", desc: "Quick counter print", icon: Printer },
                ...(type === "ticket" ? [{ id: "label", label: "Label Print", desc: "Compact sticker label", icon: Tag }] : []),
              ].map((p) => {
                const active = format === (p.id as PrintFormat);
                const Icon = p.icon;
                return (
                  <motion.button
                    key={p.id}
                    whileHover={{ y: -2 }}
                    onClick={() => setFormat(p.id as PrintFormat)}
                    className={cn(
                      "relative cursor-pointer rounded-2xl border bg-card text-left shadow-card transition-all duration-200",
                      // Invoice has only two format cards — give them a touch more
                      // breathing room so the pair reads as an intentional, balanced
                      // row rather than a layout that's missing a third card.
                      type === "invoice" ? "p-5" : "p-4",
                      active
                        ? "border-indigo-300 ring-2 ring-indigo-200/70 shadow-[0_0_16px_-4px_rgba(67,97,238,0.25)]"
                        : "border-border hover:border-[#4361EE]/50 hover:shadow-[0_0_12px_-4px_rgba(67,97,238,0.15)] hover:ring-1 hover:ring-[#4361EE]/20"
                    )}
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-brand-700 ring-1 ring-brand-200"><Icon className="h-4.5 w-4.5" /></span>
                    <p className="font-display mt-2.5 text-base font-bold">{p.label}</p>
                    <p className="text-[11px] text-muted-foreground">{p.desc}</p>
                  </motion.button>
                );
              })}
            </div>
            <div className="mt-6 flex w-full max-w-md flex-col gap-2 sm:flex-row">
              <Button variant="outline" size="lg" className="flex-1 basis-0 px-2" onClick={handleWhatsApp}><MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" /> WhatsApp</Button>
              <Button variant="outline" size="lg" className="flex-1 basis-0 px-2" onClick={handleEmail}><Mail className="h-4 w-4 shrink-0 text-indigo-600" /> Email</Button>
              <Button variant="outline" size="lg" className="flex-1 basis-0 px-2" onClick={handlePrint}><Printer className="h-4 w-4 shrink-0 text-brand-700" /> Print</Button>
            </div>
            <Button size="xl" className="mt-3 w-full max-w-md" onClick={() => router.push(dashboardPath)}><LayoutDashboard className="h-4 w-4" /> Dashboard</Button>
          </>
        )}

        {/* Bottom action navigation — Manage | View | Edit | Create */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <button onClick={() => router.push(managePath)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors duration-200 hover:text-brand-800">
            <ListChecks className="h-4 w-4" /> Manage
          </button>
          <button onClick={() => setShowView(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors duration-200 hover:text-brand-800">
            <Eye className="h-4 w-4" /> View {label}
          </button>
          <button onClick={() => { onEdit(); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors duration-200 hover:text-brand-800">
            <Pencil className="h-4 w-4" /> Edit {label}
          </button>
          <button onClick={() => { window.location.href = createPath; }} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 transition-colors duration-200 hover:text-brand-800">
            <Plus className="h-4 w-4" /> Create {label}
          </button>
        </div>
      </div>

      {/* ── Read-only View preview overlay ── */}
      <AnimatePresence>
        {showView && (
          <motion.div
            className="fixed inset-0 z-[120] flex flex-col bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Close button — returns to the success screen, preserving its state */}
            <button
              onClick={() => setShowView(false)}
              aria-label="Close preview"
              className="fixed right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white text-gray-700 shadow-lg ring-1 ring-black/5 transition hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Scrollable read-only preview — reuses the actual print template */}
            <motion.div
              key="view-preview"
              className="flex-1 overflow-auto py-10"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mx-auto w-fit">
                {viewData ? (
                  <>
                    {viewFormat === "a4" && <A4Template data={viewData} />}
                    {viewFormat === "thermal" && <ThermalTemplate data={viewData} />}
                    {viewFormat === "label" && <LabelTemplate data={viewData} />}
                  </>
                ) : (
                  <div className="rounded-2xl bg-white px-8 py-12 text-center text-sm text-gray-500 shadow-lg">
                    Preview is not available for this {label.toLowerCase()}.
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
