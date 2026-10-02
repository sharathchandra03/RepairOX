"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Journey Timeline

   The complete customer/sales journey for one lead, merged from the durable
   record trails (no manual data): Created → Assigned → Follow-ups → Route
   chosen → Field Job / Pickup / Store received → Ticket → Invoice → Revenue.

   Sources (all already persisted):
     • the lead itself (created / routed / terminal)
     • lead_assignment_history  (ownership)
     • lead_followup_history     (follow-ups)
     • lead_conversion_history   (routed / *_created / customer_linked / won/lost)

   This is what stops Sales from losing visibility after handoff: everything the
   operations side does to the lead's device shows up here, attributed to the
   originating agent, without any WhatsApp/Excel.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import {
  Sparkles, UserCheck, CalendarClock, Route as RouteIcon, Truck, Store,
  Ticket as TicketIcon, Receipt, CheckCircle2, XCircle, BadgePercent, RefreshCw, Send, Ban, FileText,
} from "lucide-react";
import { useLeads } from "@/lib/leads-context";
import { useDeals } from "@/lib/lead-deals-context";
import { useQuotations } from "@/lib/quotations-context";
import { formatQuotationMoney } from "@/lib/quotation-data";
import { cn } from "@/lib/utils";
import {
  LEAD_CONVERSION_EVENT_LABEL, followUpLifecycle,
  type Lead, type LeadConversionEventType,
} from "@/lib/leads-data";
import {
  DEAL_REVISION_ACTION_LABEL, formatDealDiscount, type DealRevisionAction,
} from "@/lib/lead-deals";

type Dot = { color: string; icon: React.ComponentType<{ className?: string }> };

const EVENT_DOT: Record<LeadConversionEventType, Dot> = {
  routed:            { color: "bg-[#EEF1FD] text-[#4361EE] ring-[#B3BFF6]", icon: RouteIcon },
  walk_in_created:   { color: "bg-amber-50 text-amber-600 ring-amber-200", icon: Store },
  field_job_created: { color: "bg-teal-50 text-teal-600 ring-teal-200", icon: Truck },
  ticket_created:    { color: "bg-indigo-50 text-indigo-600 ring-indigo-200", icon: TicketIcon },
  invoice_created:   { color: "bg-emerald-50 text-emerald-600 ring-emerald-200", icon: Receipt },
  customer_linked:   { color: "bg-sky-50 text-sky-600 ring-sky-200", icon: UserCheck },
  won:               { color: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 },
  lost:              { color: "bg-rose-50 text-rose-600 ring-rose-200", icon: XCircle },
};

interface Row {
  key: string;
  at: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  detail?: string;
}

function fmt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const DEAL_DOT: Record<DealRevisionAction, Dot> = {
  submitted:         { color: "bg-amber-50 text-amber-700 ring-amber-200", icon: Send },
  resubmitted:       { color: "bg-amber-50 text-amber-700 ring-amber-200", icon: RefreshCw },
  changes_requested: { color: "bg-indigo-50 text-indigo-700 ring-indigo-200", icon: RefreshCw },
  approved:          { color: "bg-emerald-50 text-emerald-700 ring-emerald-200", icon: CheckCircle2 },
  rejected:          { color: "bg-rose-50 text-rose-600 ring-rose-200", icon: XCircle },
  cancelled:         { color: "bg-zinc-100 text-zinc-500 ring-zinc-200", icon: Ban },
};

export function LeadJourneyTimeline({ lead }: { lead: Lead }) {
  const { conversionHistoryFor, assignmentHistoryFor, followUpsFor } = useLeads();
  const { dealsForLead, revisionsForDeal } = useDeals();
  const { quotationsForLead } = useQuotations();

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];

    // Lead created
    const createdAt = lead.createdAt || (lead.date ? `${lead.date}T${lead.time || "00:00"}:00` : "");
    out.push({ key: "created", at: createdAt, icon: Sparkles, color: "bg-[#EEF1FD] text-[#4361EE] ring-[#B3BFF6]", title: "Lead created", detail: `${lead.leadNo}${lead.source ? ` · ${lead.source}` : ""}` });

    // Assignment history (ownership)
    for (const a of assignmentHistoryFor(lead.id)) {
      out.push({
        key: `assign:${a.id}`, at: a.createdAt, icon: UserCheck,
        color: "bg-violet-50 text-violet-600 ring-violet-200",
        title: a.toUserName ? `Assigned to ${a.toUserName}` : "Unassigned",
        detail: a.assignedByName ? `by ${a.assignedByName}` : undefined,
      });
    }

    // Follow-ups
    for (const f of followUpsFor(lead.id)) {
      const state = followUpLifecycle(f);
      out.push({
        key: `fu:${f.id}`, at: f.createdAt, icon: CalendarClock,
        color: "bg-amber-50 text-amber-600 ring-amber-200",
        title: `Follow-up #${f.seq} ${f.status === "completed" ? "completed" : "scheduled"}`,
        detail: [f.followUpUserName, f.status === "completed" ? `outcome: ${f.outcome || "—"}` : `due ${fmt(f.dueAt)}`, state].filter(Boolean).join(" · "),
      });
    }

    // Conversion / handoff events (routed, *_created, won/lost, customer_linked)
    for (const e of conversionHistoryFor(lead.id)) {
      const dot = EVENT_DOT[e.eventType] ?? EVENT_DOT.routed;
      out.push({
        key: `conv:${e.id}`, at: e.occurredAt, icon: dot.icon, color: dot.color,
        title: LEAD_CONVERSION_EVENT_LABEL[e.eventType] ?? e.eventType,
        detail: [e.targetLabel || e.note, e.value != null ? `₹${Number(e.value).toLocaleString("en-IN")}` : undefined].filter(Boolean).join(" · ") || undefined,
      });
    }

    // Deal / discount-approval milestones (submitted → changes → resubmitted →
    // approved/rejected). Real append-only revision rows — never fabricated.
    for (const deal of dealsForLead(lead.id)) {
      for (const rev of revisionsForDeal(deal.id)) {
        const dot = DEAL_DOT[rev.action] ?? DEAL_DOT.submitted;
        const money = rev.action === "approved"
          ? formatDealDiscount(rev.approvedDiscount, rev.approvedDiscountType)
          : formatDealDiscount(rev.requestedDiscount, rev.requestedDiscountType);
        out.push({
          key: `deal:${rev.id}`, at: rev.createdAt, icon: dot.icon, color: dot.color,
          title: `${deal.dealNo} · ${DEAL_REVISION_ACTION_LABEL[rev.action]}`,
          detail: [money, rev.actorName, rev.comment ? `“${rev.comment}”` : undefined].filter(Boolean).join(" · ") || undefined,
        });
      }
    }

    // Quotation milestones (Created → Sent). Real quotation records only —
    // "Sent" appears only when the quotation was actually sent (sentAt set),
    // never when merely generated.
    for (const quote of quotationsForLead(lead.id)) {
      out.push({
        key: `quote-created:${quote.id}`, at: quote.createdAt, icon: FileText,
        color: "bg-indigo-50 text-indigo-600 ring-indigo-200",
        title: `Quotation ${quote.quotationNo} created`,
        detail: [quote.device || quote.issue, formatQuotationMoney(quote.amount)].filter(Boolean).join(" · ") || undefined,
      });
      if (quote.sentAt) {
        out.push({
          key: `quote-sent:${quote.id}`, at: quote.sentAt, icon: Send,
          color: "bg-blue-50 text-blue-600 ring-blue-200",
          title: `Quotation ${quote.quotationNo} sent`,
          detail: [quote.customerName, formatQuotationMoney(quote.amount)].filter(Boolean).join(" · ") || undefined,
        });
      }
    }

    // Terminal lost/won markers come through lead_conversion_history ("won" /
    // "lost") when recorded — no separate derived row needed here.

    // Sort chronologically; rows without a timestamp sink to the top (creation).
    return out
      .filter((r) => r.at)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [lead, conversionHistoryFor, assignmentHistoryFor, followUpsFor, dealsForLead, revisionsForDeal, quotationsForLead]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><RouteIcon className="h-3.5 w-3.5" /></span>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-600">Journey</h3>
      </div>

      <ol className="relative space-y-3 pl-1">
        {rows.map((r, i) => {
          const Icon = r.icon;
          const last = i === rows.length - 1;
          return (
            <li key={r.key} className="relative flex gap-3">
              <div className="flex flex-col items-center">
                <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset", r.color)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                {!last && <span className="mt-1 w-px flex-1 bg-border" />}
              </div>
              <div className="min-w-0 pb-1">
                <p className="text-[13px] font-medium text-foreground">{r.title}</p>
                {r.detail && <p className="truncate text-[11px] text-muted-foreground">{r.detail}</p>}
                <p className="text-[10px] text-muted-foreground/80">{fmt(r.at)}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
