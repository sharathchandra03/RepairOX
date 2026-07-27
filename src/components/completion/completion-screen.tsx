"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Printer, MessageCircle, Mail, ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getTicketPrintUrl, getInvoicePrintUrl, type PrintFormat } from "@/lib/print-utils";

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
  /** Navigate to the document details page — ONLY called on View */
  onView: () => void;
};

export function CompletionScreen({ type, id, isEdit = false, onBack, onView }: CompletionScreenProps) {
  const [format, setFormat] = useState<PrintFormat>("a4");

  const label = type === "ticket" ? "Ticket" : "Invoice";
  const backLabel = type === "ticket" ? "tickets" : "invoices";

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
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 18 }} className="grid h-20 w-20 place-items-center rounded-full brand-gradient text-white shadow-glow">
          <CheckCircle2 className="h-10 w-10" />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="font-display mt-6 text-4xl font-extrabold tracking-tight md:text-5xl">
          {isEdit ? <><span className="brand-gradient-text">{label} updated!</span></> : <>Thank you! <span className="brand-gradient-text">{label} created.</span></>}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-2 max-w-md text-sm text-muted-foreground">
          {isEdit ? `Your changes have been saved. The ${backLabel} list will reflect the updates.` : "A confirmation has been queued for SMS, WhatsApp and email. Choose how you'd like to print or share the receipt."}
        </motion.p>

        {!isEdit && (
          <>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { id: "a4", label: "A4 Receipt", desc: "Best for filing & email" },
                { id: "thermal", label: "Thermal Receipt", desc: "Quick counter print" },
              ].map((p) => {
                const active = format === (p.id as PrintFormat);
                return (
                  <motion.button key={p.id} whileHover={{ y: -2 }} onClick={() => setFormat(p.id as PrintFormat)} className={cn("rounded-2xl border bg-card p-5 text-left shadow-card transition", active ? "border-indigo-300 ring-2 ring-indigo-200/70" : "border-border")}>
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-brand-700 ring-1 ring-brand-200"><Printer className="h-5 w-5" /></span>
                    <p className="font-display mt-3 text-lg font-bold">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </motion.button>
                );
              })}
            </div>
            <div className="mt-6 flex w-full max-w-md flex-col gap-2 sm:flex-row">
              <Button variant="outline" size="lg" className="flex-1" onClick={handleWhatsApp}><MessageCircle className="h-4 w-4 text-emerald-600" /> Share on WhatsApp</Button>
              <Button variant="outline" size="lg" className="flex-1" onClick={handleEmail}><Mail className="h-4 w-4 text-indigo-600" /> Share on Email</Button>
            </div>
            <Button size="xl" className="mt-3 w-full max-w-md" onClick={handlePrint}><Printer className="h-4 w-4" /> Print {label}</Button>
          </>
        )}

        <div className="mt-6 flex items-center gap-5">
          <button onClick={onView} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">
            <Eye className="h-3.5 w-3.5" /> View {label}
          </button>
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to {backLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
