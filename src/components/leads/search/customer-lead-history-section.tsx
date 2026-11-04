"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Customer 360 — Lead History + Interaction Timeline.

   Phase 4 of the Lead Intelligence Search spec. Shown on the Customer Detail
   page (customers/[id]/page.tsx). Powered by lead_customer_history() (0088):
   the backend already limits rows to what the caller may see — ordinary
   visibility, or every lead for this customer when the caller holds
   leads_shared_reference / leads_customer_history ("full_history": true).

   Read-only: opening a lead from here never writes anything. A lead the
   viewer doesn't own opens the View Lead page in its read-only reference mode
   (Phase 5), never an edit form.
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  History, Loader2, AlertTriangle, Eye, UserPlus, CalendarClock, GitCommitHorizontal,
  UserCog, ArrowRightLeft, Megaphone, Milestone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/permissions-context";
import { allow } from "@/lib/capabilities";
import { rpcCustomerHistory, newLeadForCustomerHref, type CustomerHistory, type TimelineEvent } from "@/lib/lead-search";
import { statusTone } from "@/components/leads/lead-pills";
import { ago, fmtDate, fmtDateTime } from "@/components/leads/search/lead-search-parts";

const TIMELINE_ICON: Record<TimelineEvent["kind"], typeof History> = {
  lead_created: Milestone,
  assignment: UserCog,
  activity: Megaphone,
  followup: CalendarClock,
  status: ArrowRightLeft,
  conversion: GitCommitHorizontal,
};

export function CustomerLeadHistorySection({ customerId }: { customerId: string }) {
  const router = useRouter();
  const { can } = usePermissions();
  const canHistory = allow(can, ["view_customer_history", "manage_customers"]);
  const [data, setData] = useState<CustomerHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!customerId || !canHistory) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    rpcCustomerHistory(customerId)
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Failed to load lead history"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [customerId, canHistory]);

  const sortedTimeline = useMemo(() => [...(data?.timeline ?? [])].sort((a, b) => (b.at || "").localeCompare(a.at || "")), [data]);

  if (!canHistory) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-zinc-300 bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-border/70 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><History className="h-4 w-4" /></span>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Lead History</h2>
              {data?.full_history && (
                <p className="text-[11px] text-muted-foreground">Showing every permitted lead for this customer, across Sales Agents.</p>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => router.push(newLeadForCustomerHref(customerId))}>
            <UserPlus className="h-3.5 w-3.5" /> New Lead for this customer
          </Button>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading lead history…
          </div>
        )}
        {!loading && error && (
          <div className="flex items-center justify-center gap-2 py-8 text-rose-600">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}
        {!loading && !error && (data?.leads?.length ?? 0) === 0 && (
          <p className="py-6 text-center text-[12.5px] text-muted-foreground">No leads are linked to this customer yet.</p>
        )}
        {!loading && !error && (data?.leads?.length ?? 0) > 0 && (
          <div className="space-y-2">
            {data!.leads.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => router.push(`/leads/${l.id}`)}
                className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-border px-3.5 py-3 text-left transition hover:border-[#4361EE]/30 hover:bg-[#4361EE]/[0.03]"
              >
                <span className="rounded bg-[#EEF1FD] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#4361EE]">{l.lead_no}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                  {[l.device, l.issue].filter(Boolean).join(" · ") || "No device/issue recorded"}
                </span>
                {l.status && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset", statusTone(l.status))}>{l.status}</span>}
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset", l.closed ? "bg-zinc-100 text-zinc-600 ring-zinc-200" : "bg-teal-50 text-teal-700 ring-teal-200")}>
                  {l.closed ? "Closed" : "Active"}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
                  <Avatar name={l.assigned_to_name || "?"} size={16} />
                  {l.assigned_to_name || "Unassigned"}
                </span>
                {!l.ordinary && (
                  <span title="You are viewing this lead as a shared reference — read-only" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-300/60">
                    <Eye className="h-3 w-3" /> Read-only
                  </span>
                )}
                {l.open_followup && (
                  <span className={cn("shrink-0 text-[10.5px] font-medium", l.overdue_followup ? "text-[#B42318]" : "text-violet-700")}>
                    {l.overdue_followup ? "Follow-up overdue" : "Follow-up open"}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{fmtDate(l.created_at)} · last activity {ago(l.last_activity)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!loading && !error && sortedTimeline.length > 0 && (
        <div className="rounded-2xl border-2 border-zinc-300 bg-card p-5 shadow-card">
          <div className="mb-4 flex items-center gap-2.5 border-b border-border/70 pb-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-violet-50 text-violet-700"><GitCommitHorizontal className="h-4 w-4" /></span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Interaction Timeline</h2>
          </div>
          <div className="space-y-0">
            {sortedTimeline.slice(0, 40).map((e, i) => {
              const Icon = TIMELINE_ICON[e.kind] || Milestone;
              return (
                <div key={i} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < sortedTimeline.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-18px)] w-px bg-border" />}
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-600"><Icon className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[12.5px] font-semibold text-foreground">
                        {e.title} <span className="font-mono text-[10.5px] font-normal text-[#4361EE]">{e.lead_no}</span>
                      </p>
                      <span className="shrink-0 text-[10.5px] text-muted-foreground">{fmtDateTime(e.at)}</span>
                    </div>
                    {e.detail && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{e.detail}</p>}
                    {e.actor && <p className="mt-0.5 text-[10.5px] text-zinc-400">by {e.actor}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
