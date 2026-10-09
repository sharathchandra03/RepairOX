"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Detail "Deal / Approval" panel.

   Rendered inside the Lead detail (drawer + full page) ONLY when a Deal exists
   for the lead. It shows the current approval status compactly and, depending
   on the viewer's permissions:
     • an approver sees the full review panel (approve / request changes /
       reject + comments + history) inline;
     • a Sales Agent sees their request status + comments and can revise &
       resubmit after Changes Requested; and a "Open Deal page" link when they
       have Deal-view permission.
   It never exposes approval controls to a user who lacks the capability.
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import Link from "next/link";
import { BadgePercent, ArrowUpRight } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { useDeals } from "@/lib/lead-deals-context";
import { cn, formatINR } from "@/lib/utils";
import {
  DEAL_STATUS_LABEL, dealStatusTone, formatDealDiscount,
} from "@/lib/lead-deals";
import type { Lead } from "@/lib/leads-data";
import { DealReviewPanel } from "@/components/deals/deal-review-panel";
import { DealRequestModal } from "@/components/deals/deal-request-modal";

export function LeadDealPanel({ lead }: { lead: Lead }) {
  const { can } = usePermissions();
  const { currentDeal } = useDeals();
  const deal = currentDeal(lead.id);
  const [resubmitOpen, setResubmitOpen] = React.useState(false);

  // Only render when a Deal exists.
  if (!deal) return null;

  const canViewDeals = allow(can, CAP.deal.view);
  const canViewAll = allow(can, CAP.deal.viewAll);

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><BadgePercent className="h-3.5 w-3.5" /></span>
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-600">Deal / Approval</h3>
        </div>
        {canViewAll && (
          <Link href={`/leads/deals?deal=${deal.id}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
            Open Deal page <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {canViewDeals ? (
        <DealReviewPanel deal={deal} onResubmit={() => setResubmitOpen(true)} compact />
      ) : (
        /* No Deal-view permission → show only the compact status (never controls). */
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3.5 py-3">
          <div>
            <p className="text-[13px] font-semibold">{deal.dealNo}</p>
            {(() => {
              const q = deal.leadValue ?? null;
              const off = deal.requestedDiscount == null ? null : deal.requestedDiscountType === "percent" && q != null ? (q * deal.requestedDiscount) / 100 : deal.requestedDiscount;
              const reqPrice = q != null && off != null ? Math.max(0, Math.round(q - off)) : null;
              return (
                <p className="text-[11px] text-muted-foreground">
                  {reqPrice == null
                    ? `Requested ${formatDealDiscount(deal.requestedDiscount, deal.requestedDiscountType)} off`
                    : <>Customer price <span className="font-semibold text-zinc-700 tabular-nums">{formatINR(reqPrice)}</span>{deal.requestedDiscount && deal.requestedDiscount > 0 ? ` · −${formatDealDiscount(deal.requestedDiscount, deal.requestedDiscountType)}` : ""}</>}
                </p>
              );
            })()}
          </div>
          <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", dealStatusTone(deal.status))}>
            {DEAL_STATUS_LABEL[deal.status]}
          </span>
        </div>
      )}

      <DealRequestModal open={resubmitOpen} onClose={() => setResubmitOpen(false)} lead={lead} deal={deal} onDone={() => setResubmitOpen(false)} />
    </section>
  );
}
