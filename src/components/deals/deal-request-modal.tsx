"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Discount Request / Deal modal.

   Opened when a Sales Agent marks a lead as a "Discounted Lead" (or edits an
   existing request after Changes Requested). It captures the MANDATORY reason
   and the requested discount, then creates/resubmits the real Deal approval
   record via useDeals(). It never saves a Discounted Lead without the request.
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, BadgePercent, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/tabs";
import { cn, formatINR } from "@/lib/utils";
import { useDeals } from "@/lib/lead-deals-context";
import { currentDealForLead, formatDealDiscount, type LeadDeal } from "@/lib/lead-deals";
import type { Lead } from "@/lib/leads-data";

export function DealRequestModal({
  open, onClose, lead, deal, onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** The lead the discount request is for. */
  lead: Lead | null;
  /** When resubmitting, the existing deal to revise. If omitted, a new request. */
  deal?: LeadDeal | null;
  onDone?: (deal: LeadDeal | null) => void;
}) {
  const { requestDeal, resubmitDeal, deals } = useDeals();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const resubmit = !!deal;
  // Prefill from the existing deal (resubmit) or the lead's own discount.
  const [type, setType] = React.useState<"amount" | "percent">("percent");
  const [value, setValue] = React.useState<string>("");
  const [reason, setReason] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (deal) {
      setType(deal.requestedDiscountType);
      setValue(deal.requestedDiscount == null ? "" : String(deal.requestedDiscount));
      setReason(deal.requestedReason || "");
    } else {
      setType(lead?.discountType === "amount" ? "amount" : "percent");
      setValue(lead?.discount == null ? "" : String(lead.discount));
      setReason("");
    }
    setTouched(false);
  }, [open, deal, lead]);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (!mounted || !lead) return null;

  const reasonMissing = !reason.trim();
  const existingOpen = !resubmit ? currentDealForLead(deals, lead.id) : null;
  const hasOpen = !!existingOpen && (existingOpen.status === "pending_approval" || existingOpen.status === "changes_requested");

  const submit = async () => {
    setTouched(true);
    if (reasonMissing) return;
    setSaving(true);
    try {
      const draft = {
        requestedDiscount: value.trim() === "" ? null : Number(value.replace(/[^0-9.]/g, "")),
        requestedDiscountType: type,
        requestedReason: reason.trim(),
        leadValue: lead.estimate ?? null,
      };
      if (resubmit && deal) {
        const ok = await resubmitDeal(deal.id, draft);
        onDone?.(ok ? deal : null);
      } else {
        const created = await requestDeal(lead, draft);
        onDone?.(created);
      }
      onClose();
    } finally { setSaving(false); }
  };

  const content = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} onClick={onClose}
            className="fixed inset-0 z-[9998] bg-foreground/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          >
            <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_32px_80px_-20px_rgba(20,30,80,0.3)]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]"><BadgePercent className="h-4.5 w-4.5" /></span>
                  <div>
                    <h2 className="font-display text-base font-bold tracking-tight">{resubmit ? "Revise Discount Request" : "Discount Request"}</h2>
                    <p className="text-[12px] text-muted-foreground">{lead.leadNo} · {lead.name || "Lead"}{resubmit ? ` · revision ${(deal?.revision ?? 1) + 1}` : ""}</p>
                  </div>
                </div>
                <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>

              {/* Body */}
              <div className="space-y-4 px-5 py-5">
                {hasOpen && (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-[12px] text-amber-800">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{existingOpen?.dealNo} is already awaiting approval for this lead. Submitting again will reuse it.</span>
                  </div>
                )}

                {/* Lead value context */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3.5 py-2.5">
                  <span className="text-[12px] font-medium text-muted-foreground">Lead Value</span>
                  <span className="text-[13px] font-semibold tabular-nums">{lead.estimate == null ? "—" : formatINR(lead.estimate)}</span>
                </div>

                {/* Requested discount */}
                <div className="space-y-1.5">
                  <Label>Requested Discount</Label>
                  <div className="flex items-stretch gap-2">
                    <SegmentedTabs
                      size="sm"
                      options={[{ label: "%", value: "percent" }, { label: "₹", value: "amount" }]}
                      value={type}
                      onChange={(v) => setType(v as "amount" | "percent")}
                    />
                    <input
                      value={value}
                      onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ""))}
                      inputMode="decimal"
                      placeholder={type === "percent" ? "e.g. 20" : "e.g. 2000"}
                      className="h-9 flex-1 rounded-lg border border-input bg-card px-3 text-[13px] outline-none transition focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">The manager may approve a different amount.</p>
                </div>

                {/* Mandatory reason */}
                <div className="space-y-1.5">
                  <Label>Reason for discount <span className="text-rose-500">*</span></Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Customer comparing with a competitor and requesting an additional discount."
                    className={cn("min-h-[88px] text-[13px]", touched && reasonMissing && "border-rose-400 focus:ring-rose-200/40")}
                    autoFocus
                  />
                  {touched && reasonMissing && <p className="text-[11px] font-medium text-rose-600">A reason is required to request a discount.</p>}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
                <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                <Button size="sm" className="gap-1.5" loading={saving} disabled={reasonMissing} onClick={submit}>
                  {resubmit ? "Resubmit for Approval" : "Submit for Approval"}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
