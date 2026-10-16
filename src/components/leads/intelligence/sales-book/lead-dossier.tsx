"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight, BadgeIndianRupee, CalendarClock, CheckCircle2, ExternalLink,
  FileText, History, MapPin, Receipt, Route, UserRound, X,
} from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { allow, CAP } from "@/lib/capabilities";
import type { PermissionKey } from "@/lib/permissions";
import {
  followUpLifecycle, followUpStateTone, LEAD_CONVERSION_EVENT_LABEL,
  type LeadAssignmentEvent, type LeadConversionEvent, type LeadFollowUp,
} from "@/lib/leads-data";
import type { LeadLedgerRow } from "@/lib/lead-sales-book";

type Can = (k: PermissionKey) => boolean;

interface TimelineItem {
  at: number;
  title: string;
  detail?: string;
  actor?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}

export function LeadDossier({
  row,
  followUps,
  assignmentEvents,
  conversionEvents,
  storeName,
  can,
  onClose,
}: {
  row: LeadLedgerRow | null;
  followUps: LeadFollowUp[];
  assignmentEvents: LeadAssignmentEvent[];
  conversionEvents: LeadConversionEvent[];
  storeName: string;
  can: Can;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (row) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!row) return [];
    const lead = row.lead;
    const items: TimelineItem[] = [];
    const ms = (v?: string) => (v ? new Date(v).getTime() : NaN);
    const push = (at: number, item: Omit<TimelineItem, "at">) => { if (Number.isFinite(at) && at > 0) items.push({ at, ...item }); };

    push(ms(row.createdAt), { title: "Lead created", detail: lead.source ? `Source: ${lead.source}` : undefined, actor: lead.createdBy, icon: UserRound, tone: "bg-[#EEF1FD] text-[#4361EE]" });
    for (const a of assignmentEvents) {
      push(ms(a.createdAt), {
        title: a.fromUserName ? "Reassigned" : "Assigned",
        detail: `${a.fromUserName ? `${a.fromUserName} → ` : ""}${a.toUserName || "—"}${a.reason ? ` · ${a.reason}` : ""}`,
        actor: a.assignedByName || a.assignedBy, icon: UserRound, tone: "bg-indigo-50 text-indigo-600",
      });
    }
    push(ms(lead.firstContactedAt), { title: "First contacted", icon: CheckCircle2, tone: "bg-sky-50 text-sky-600" });
    push(ms(lead.qualifiedAt), { title: "Qualified", icon: CheckCircle2, tone: "bg-violet-50 text-violet-600" });
    for (const f of followUps) {
      if (f.status === "completed") push(ms(f.completedAt), { title: `Follow-up #${f.seq} completed`, detail: f.outcome ? String(f.outcome) : undefined, actor: f.followUpUserName, icon: CalendarClock, tone: "bg-emerald-50 text-emerald-600" });
      else push(ms(f.createdAt), { title: `Follow-up #${f.seq} scheduled`, detail: f.dueAt ? `Due ${new Date(f.dueAt).toLocaleString()}` : undefined, actor: f.createdByName, icon: CalendarClock, tone: "bg-amber-50 text-amber-600" });
    }
    for (const c of conversionEvents) {
      push(ms(c.occurredAt), { title: LEAD_CONVERSION_EVENT_LABEL[c.eventType] || c.eventType, detail: [c.targetLabel, c.value ? formatINR(c.value) : "", c.note].filter(Boolean).join(" · ") || undefined, actor: c.actorName, icon: Route, tone: "bg-teal-50 text-teal-600" });
    }
    push(ms(lead.convertedAt), { title: "Converted (Won)", icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-700" });
    push(ms(lead.lostAt), { title: "Lost", detail: lead.lostReason || undefined, icon: X, tone: "bg-rose-50 text-rose-600" });

    return items.sort((a, b) => a.at - b.at);
  }, [row, followUps, assignmentEvents, conversionEvents]);

  const openFollowUps = useMemo(() => (row ? followUps.filter((f) => f.status === "scheduled" || f.status === "missed") : []), [row, followUps]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {row && (
        <>
          <motion.div
            className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-[1px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed inset-y-0 right-0 z-[71] flex w-full max-w-[520px] flex-col overflow-hidden bg-card shadow-2xl"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            role="dialog" aria-modal="true" aria-label={`Lead ${row.leadNo}`}
          >
            {/* Header */}
            <div className="relative shrink-0 border-b border-border bg-gradient-to-br from-white via-[#F3F6FF] to-[#E8EDFF] px-5 py-4">
              <button onClick={onClose} className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-white/70 hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#4361EE]">{row.leadNo}</p>
              <h2 className="mt-0.5 truncate pr-10 text-[18px] font-extrabold text-foreground">{row.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Pill tone="bg-[#4361EE]/10 text-[#3A4DBB]">{row.lead.status || "—"}</Pill>
                {row.won && <Pill tone="bg-emerald-50 text-emerald-700">Won</Pill>}
                {row.lost && <Pill tone="bg-rose-50 text-rose-700">Lost</Pill>}
                {row.followUpState === "Overdue" && <Pill tone="bg-rose-100 text-[#B42318]">Follow-up overdue</Pill>}
                <Pill tone="bg-zinc-100 text-zinc-600">{row.mode === "" ? "Not routed" : row.mode === "STORE_VISIT" ? "Walk-In" : row.mode === "PICKUP_DROP" ? "Pickup & Drop" : "On-Site"}</Pill>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {/* Outcome + commercial */}
              <div className="grid grid-cols-2 gap-2.5">
                <Metric label="Expected value" value={formatINR(row.expectedValue)} icon={BadgeIndianRupee} />
                <Metric label="Revenue (net)" value={formatINR(row.revenueNet)} icon={BadgeIndianRupee} tone="text-emerald-700" />
                {row.refundAmount > 0 && <Metric label="Refunded" value={formatINR(row.refundAmount)} icon={Receipt} tone="text-amber-700" />}
                <Metric label="Result" value={row.resultLabel} icon={CheckCircle2} />
              </div>

              {/* Attribution — distinguish owner vs actors */}
              <Section title="Ownership & attribution" icon={UserRound}>
                <Row label="Sales Agent (owner)" value={row.agentName || "Unassigned"} />
                <Row label="Assigned by" value={row.lead.assignedByName || "—"} />
                <Row label="Store" value={storeName || "—"} />
                <Row label="Region" value={row.region || "—"} />
                <p className="mt-2 text-[10.5px] text-muted-foreground">Credit for each historical action is shown by its own actor below — not attributed to the current owner.</p>
              </Section>

              {/* Linked records with gated deep links */}
              <Section title="Connected records" icon={FileText}>
                <LinkRow label="Ticket" value={row.ticketNo || row.ticketId} href={row.ticketId && allow(can, CAP.ticket.view) ? `/tickets/${row.ticketId}` : undefined} empty="Not created yet" />
                <LinkRow label="Invoice" value={row.invoiceNo || row.invoiceId} href={row.invoiceId && allow(can, CAP.invoice.view) ? `/invoice/${row.invoiceId}` : undefined} empty="Not created yet" />
                <LinkRow label="Walk-In" value={row.walkInId} empty="—" />
                <LinkRow label="Field Job" value={row.fieldJobId} empty="—" />
                <LinkRow label="Lead record" value="Open full Lead" href={`/leads/${row.leadId}`} />
              </Section>

              {/* Follow-ups */}
              <Section title="Follow-ups" icon={CalendarClock}>
                {openFollowUps.length === 0 && followUps.length === 0 ? (
                  <Empty>No follow-ups recorded.</Empty>
                ) : (
                  <div className="space-y-1.5">
                    {openFollowUps.map((f) => {
                      const state = followUpLifecycle(f);
                      return (
                        <div key={f.id} className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2">
                          <span className="text-[12px] text-foreground">#{f.seq} · {f.dueAt ? new Date(f.dueAt).toLocaleString() : "—"}</span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset", followUpStateTone(state))}>{state}</span>
                        </div>
                      );
                    })}
                    {openFollowUps.length === 0 && <p className="text-[11.5px] text-muted-foreground">No open follow-up — see the timeline for completed ones.</p>}
                  </div>
                )}
              </Section>

              {/* Activity timeline */}
              <Section title="Activity timeline" icon={History}>
                {timeline.length === 0 ? (
                  <Empty>No recorded activity for this lead yet.</Empty>
                ) : (
                  <ol className="relative space-y-3">
                    {timeline.map((item, i) => {
                      const Icon = item.icon;
                      return (
                        <li key={i} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", item.tone)}><Icon className="h-3.5 w-3.5" /></span>
                            {i < timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                          </div>
                          <div className="min-w-0 pb-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-[12.5px] font-semibold text-foreground">{item.title}</p>
                              <p className="shrink-0 text-[10px] text-muted-foreground">{new Date(item.at).toLocaleDateString()}</p>
                            </div>
                            {item.detail && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{item.detail}</p>}
                            {item.actor && <p className="mt-0.5 text-[10.5px] text-muted-foreground/80">by {item.actor}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {!row.hasRecordedActivity && (
                  <p className="mt-2 rounded-lg bg-amber-50/60 px-2.5 py-1.5 text-[10.5px] text-amber-800">No in-system outreach is recorded — this does not prove the customer was never contacted outside RepairOX.</p>
                )}
              </Section>
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-border bg-muted/20 px-5 py-3">
              <Link href={`/leads/${row.leadId}`} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#4361EE] px-4 py-2.5 text-[12.5px] font-semibold text-white transition hover:bg-[#3A4DBB]">
                Open full Lead <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", tone)}>{children}</span>;
}
function Section({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-card p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-[#4361EE]" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">{title}</h3>
      </div>
      {children}
    </section>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
function LinkRow({ label, value, href, empty = "—" }: { label: string; value?: string; href?: string; empty?: string }) {
  const has = !!value;
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      {has && href ? (
        <Link href={href} className="inline-flex items-center gap-1 font-semibold text-[#4361EE] hover:underline">{value}<ExternalLink className="h-3 w-3" /></Link>
      ) : (
        <span className={cn("truncate text-right font-medium", has ? "text-foreground" : "text-zinc-400")}>{has ? value : empty}</span>
      )}
    </div>
  );
}
function Metric({ label, value, icon: Icon, tone }: { label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string }>; tone?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" /><span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span></div>
      <p className={cn("mt-1 text-[15px] font-extrabold tabular-nums text-foreground", tone)}>{value}</p>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-300 bg-muted/20 px-3 py-2.5 text-center text-[11.5px] text-muted-foreground">{children}</p>;
}
