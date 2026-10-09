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
  // The quoted price this request is measured against.
  const quote = (deal?.leadValue ?? lead?.estimate) ?? null;

  /* The agent enters the PRICE THE CUSTOMER WANTS TO PAY (an absolute ₹). The
     stored model keeps a `requestedDiscount` (amount off the quote) so the DB,
     approval flow, revisions and existing deals are untouched — we convert at
     the boundary (price ⇄ discount). `price` is the agent-facing input. */
  const [price, setPrice] = React.useState<string>("");
  const [reason, setReason] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  /** Convert a stored discount (amount/percent) back to the customer's price. */
  const discountToPrice = React.useCallback(
    (discount: number | null, type: "amount" | "percent"): string => {
      if (quote == null || discount == null) return "";
      const off = type === "percent" ? (quote * discount) / 100 : discount;
      return String(Math.max(0, Math.round(quote - off)));
    },
    [quote],
  );

  React.useEffect(() => {
    if (!open) return;
    if (deal) {
      setPrice(discountToPrice(deal.requestedDiscount, deal.requestedDiscountType));
      setReason(deal.requestedReason || "");
    } else {
      // Prefill from the lead's own discount if one is set, else blank.
      setPrice(discountToPrice(lead?.discount ?? null, lead?.discountType === "amount" ? "amount" : "percent"));
      setReason("");
    }
    setTouched(false);
  }, [open, deal, lead, discountToPrice]);

  // Live derived values from the entered price vs the quote.
  const priceNum = price.trim() === "" ? null : Number(price.replace(/[^0-9.]/g, ""));
  const offAmount = quote != null && priceNum != null ? Math.round(quote - priceNum) : null;
  const offPct = quote != null && quote > 0 && offAmount != null ? Math.round((offAmount / quote) * 100) : null;
  const priceInvalid = priceNum != null && quote != null && (priceNum < 0 || priceNum > quote);

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
    if (reasonMissing || priceInvalid) return;
    setSaving(true);
    try {
      // Convert the customer's requested price → the stored discount (amount
      // off the quote). When the quote is unknown we can't derive a discount,
      // so the request carries no discount (price is still recorded as reason
      // context by the agent). Clamp so the discount is never negative.
      const requestedDiscount =
        quote != null && priceNum != null ? Math.max(0, Math.round(quote - priceNum)) : null;
      const draft = {
        requestedDiscount,
        requestedDiscountType: "amount" as const,
        requestedReason: reason.trim(),
        leadValue: quote,
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

                {/* Price quoted context */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3.5 py-2.5">
                  <span className="text-[12px] font-medium text-muted-foreground">Price Quoted</span>
                  <span className="text-[13px] font-semibold tabular-nums">{quote == null ? "—" : formatINR(quote)}</span>
                </div>

                {/* Price the customer requested (absolute ₹, not a discount) */}
                <div className="space-y-1.5">
                  <Label>Price Customer Requested</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-muted-foreground">₹</span>
                    <input
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                      inputMode="decimal"
                      placeholder={quote != null ? `e.g. ${Math.round(quote * 0.8)}` : "e.g. 8000"}
                      className={cn(
                        "h-9 w-full rounded-lg border border-input bg-card pl-7 pr-3 text-[13px] tabular-nums outline-none transition focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15",
                        touched && priceInvalid && "border-rose-400 focus:ring-rose-200/40",
                      )}
                    />
                  </div>
                  {/* Live gap vs the quote — this is the discount being requested. */}
                  {priceInvalid ? (
                    <p className="text-[11px] font-medium text-rose-600">
                      {priceNum != null && quote != null && priceNum > quote
                        ? "The customer's price can't be higher than the quote."
                        : "Enter a valid price."}
                    </p>
                  ) : offAmount != null && offAmount > 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      That&apos;s <span className="font-semibold text-rose-600 tabular-nums">−{formatINR(offAmount)}</span>
                      {offPct != null && <span className="text-rose-600"> · {offPct}% off</span>} the quoted price. The manager may approve a different amount.
                    </p>
                  ) : offAmount === 0 ? (
                    <p className="text-[11px] text-muted-foreground">At the quoted price — no discount requested.</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Enter the final price the customer wants to pay.</p>
                  )}
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
                <Button size="sm" className="gap-1.5" loading={saving} disabled={reasonMissing || priceInvalid} onClick={submit}>
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
