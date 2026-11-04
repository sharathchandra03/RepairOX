"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Customer Lead History — Lead Management's own view of a customer.

   Opened from Lead Intelligence Search. It is NOT the Customer Master page: it
   answers the repeat-caller question ("who is this, what did they ask before,
   who handled it, what's pending?") and sends the user straight back to where
   they came from. Read-only; built on lead_customer_history().
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Phone, Mail, MessageCircle, Copy, UserPlus, Loader2, AlertTriangle, Users, Layers, Activity,
  CalendarClock, Clock, Eye, ChevronRight, GitCommitHorizontal, Milestone, UserCog, Megaphone, ArrowRightLeft,
} from "lucide-react";
import { BackPill } from "@/components/common/back-pill";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/tabs";
import { PinnedRail } from "@/components/common/pinned-rail";
import { DetailHero, DetailSection, SummaryCard } from "@/components/common/detail-page";
import { toast } from "@/components/ui/toaster";
import { statusTone } from "@/components/leads/lead-pills";
import { ago, fmtDate, fmtDateTime } from "@/components/leads/search/lead-search-parts";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { normalizeCustomerPhone } from "@/lib/customer-data";
import { cn } from "@/lib/utils";
import {
  rpcCustomerHistory, newLeadForCustomerHref, type CustomerHistory, type CustomerHistoryLead, type TimelineEvent,
} from "@/lib/lead-search";

const TL_ICON = { lead_created: Milestone, assignment: UserCog, activity: Megaphone, followup: CalendarClock, status: ArrowRightLeft, conversion: GitCommitHorizontal } as const;

const TL_PREVIEW = 6;

export default function CustomerLeadHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const { can } = usePermissions();
  const [data, setData] = useState<CustomerHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"all" | "active" | "history">("all");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    rpcCustomerHistory(id)
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  const leads = data?.leads ?? [];
  const stats = useMemo(() => {
    const active = leads.filter((l) => !l.closed);
    const overdue = leads.filter((l) => l.overdue_followup).length;
    const open = leads.filter((l) => l.open_followup).length;
    const next = active.map((l) => l.next_followup_at).filter(Boolean).sort()[0] as string | undefined;
    const agents = new Map<string, { name: string; total: number; active: number }>();
    for (const l of leads) {
      const k = l.assigned_user_id || "none";
      const a = agents.get(k) ?? { name: l.assigned_to_name || "Unassigned", total: 0, active: 0 };
      a.total++; if (!l.closed) a.active++;
      agents.set(k, a);
    }
    const last = leads.map((l) => l.last_activity).filter(Boolean).sort().reverse()[0] as string | undefined;
    return { active: active.length, overdue, open, next, agents: [...agents.values()], last };
  }, [leads]);

  const shown = leads.filter((l) => tab === "all" || (tab === "active" ? !l.closed : l.closed));
  const timeline = useMemo(() => [...(data?.timeline ?? [])].sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 30), [data]);
  const [tlExpanded, setTlExpanded] = useState(false);
  const timelineGroups = useMemo(() => {
    const visible = tlExpanded ? timeline : timeline.slice(0, TL_PREVIEW);
    const groups: { day: string; items: TimelineEvent[] }[] = [];
    for (const e of visible) {
      const day = e.at ? fmtDate(e.at) : "Unknown date";
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(e);
      else groups.push({ day, items: [e] });
    }
    return groups;
  }, [timeline, tlExpanded]);

  const copy = async (t: string, label: string) => {
    try { await navigator.clipboard.writeText(t); toast.success(`${label} copied`); } catch { toast.error("Couldn't copy"); }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <BackPill />
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-14 text-muted-foreground shadow-card">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading customer history…
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-5">
        <BackPill />
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-14 text-center shadow-card">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-semibold">{error ? "Couldn’t load this customer" : "Customer not found or not accessible"}</p>
          {error && <p className="text-[12.5px] text-muted-foreground">{error}</p>}
        </div>
      </div>
    );
  }

  const c = data.customer;
  const wa = normalizeCustomerPhone(c.mobile).length === 10 ? `https://wa.me/91${normalizeCustomerPhone(c.mobile)}` : `https://wa.me/${c.mobile.replace(/\D/g, "")}`;

  return (
    <div className="space-y-5">
      <BackPill />

      <DetailHero>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="relative shrink-0">
              <span aria-hidden className="absolute -inset-1 rounded-full bg-[#4361EE]/20 blur-md" />
              <span className="relative block rounded-full ring-2 ring-white"><Avatar name={c.name} size={60} /></span>
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]">Existing customer · {c.id}</p>
              <h1 className="font-display text-2xl font-bold tracking-tight">{c.name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                {c.mobile && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.mobile}</span>}
                {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                <span>Customer since {fmtDate(c.created_at)}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {c.mobile && <a href={`tel:${c.mobile}`}><Button size="sm" variant="outline" className="gap-1.5"><Phone className="h-3.5 w-3.5" />Call</Button></a>}
            {c.mobile && <a href={wa} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</Button></a>}
            {c.mobile && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copy(c.mobile, "Mobile number")}><Copy className="h-3.5 w-3.5" />Copy</Button>}
            {allow(can, CAP.lead.create) && (
              <Button size="sm" className="gap-1.5" onClick={() => router.push(newLeadForCustomerHref(c.id))}>
                <UserPlus className="h-3.5 w-3.5" /> New Lead for this customer
              </Button>
            )}
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Total Leads" value={leads.length} />
          <SummaryCard label="Active Enquiries" value={stats.active} tone={stats.active ? "text-teal-700" : undefined} />
          <SummaryCard label="Open Follow-ups" value={stats.open} />
          <SummaryCard label="Overdue" value={stats.overdue} tone={stats.overdue ? "text-[#B42318]" : undefined} />
          <SummaryCard label="Sales Agents" value={stats.agents.length} />
          <SummaryCard label="Last Activity" value={stats.last ? ago(stats.last) : "—"} />
        </div>
      </DetailHero>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection
            icon={Layers}
            title="Lead History"
            accent="blue"
            action={
              <SegmentedTabs size="sm" value={tab} onChange={(v) => setTab(v as typeof tab)}
                options={[{ label: `All (${leads.length})`, value: "all" }, { label: `Active (${stats.active})`, value: "active" }, { label: `History (${leads.length - stats.active})`, value: "history" }]} />
            }
          >
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#EEF1FD] text-[#4361EE]"><Layers className="h-5 w-5" /></span>
                <p className="text-[13px] font-semibold text-foreground">
                  {leads.length === 0 ? "No leads for this customer yet" : "No leads in this view"}
                </p>
                <p className="max-w-xs text-[11.5px] text-muted-foreground">
                  {leads.length === 0
                    ? "Leads created for this customer will appear here with their owner, status and follow-ups."
                    : "Try another tab to see the rest of this customer's leads."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">{shown.map((l) => <LeadCard key={l.id} l={l} onOpen={() => router.push(`/leads/${l.id}?from=search`)} />)}</div>
            )}
          </DetailSection>

          {timeline.length > 0 && (
            <DetailSection
              icon={Clock}
              title="Interaction Timeline"
              accent="neutral"
              action={<span className="text-[11px] text-muted-foreground">{timeline.length} event{timeline.length === 1 ? "" : "s"}</span>}
            >
              <div className="space-y-4">
                {timelineGroups.map((g) => (
                  <div key={g.day}>
                    <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{g.day}</p>
                    <div>{g.items.map((e, i) => <TimelineRow key={i} e={e} last={i === g.items.length - 1} />)}</div>
                  </div>
                ))}
              </div>
              {timeline.length > TL_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setTlExpanded((v) => !v)}
                  className="mt-4 w-full rounded-lg border border-border py-2 text-[12px] font-medium text-[#4361EE] transition hover:bg-[#EEF1FD]"
                >
                  {tlExpanded ? "Show less" : `Show all ${timeline.length} events`}
                </button>
              )}
            </DetailSection>
          )}
        </div>

        <PinnedRail>
          <DetailSection icon={Users} title="Sales Agents" accent="violet">
            <ul className="space-y-2.5">
              {stats.agents.map((a, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <Avatar name={a.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{a.name}</p>
                    <p className="text-[11px] text-muted-foreground">{a.total} lead{a.total === 1 ? "" : "s"}{a.active ? ` · ${a.active} active` : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-border/70 pt-2.5 text-[11px] text-muted-foreground">Attribution comes from each lead — not from the customer record.</p>
          </DetailSection>

          <DetailSection icon={Activity} title="Current Position" accent="teal">
            <dl className="space-y-2 text-[12.5px]">
              <Row k="Active enquiries" v={String(stats.active)} />
              <Row k="Next follow-up" v={stats.next ? fmtDateTime(stats.next) : "None scheduled"} />
              <Row k="Overdue follow-ups" v={String(stats.overdue)} bad={stats.overdue > 0} />
              <Row k="Most recent lead" v={leads[0] ? `${leads[0].lead_no} · ${leads[0].assigned_to_name || "Unassigned"}` : "—"} />
            </dl>
          </DetailSection>

        </PinnedRail>
      </div>
    </div>
  );
}

function Row({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn("text-right font-semibold", bad ? "text-[#B42318]" : "text-foreground")}>{v}</dd>
    </div>
  );
}

function LeadCard({ l, onOpen }: { l: CustomerHistoryLead; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-[#4361EE]/40 hover:shadow-md"
    >
      <span className={cn("w-1 shrink-0", l.closed ? "bg-zinc-300" : "bg-teal-500")} />
      <div className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-[#EEF1FD] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#4361EE]">{l.lead_no}</span>
          {l.status && <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset", statusTone(l.status))}>{l.status}</span>}
          <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset", l.closed ? "bg-zinc-100 text-zinc-600 ring-zinc-200" : "bg-teal-50 text-teal-700 ring-teal-200")}>{l.closed ? "Closed" : "Active"}</span>
          {!l.ordinary && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-300/60"><Eye className="h-3 w-3" />Read-only</span>}
          {l.open_followup && <span className={cn("inline-flex items-center gap-1 text-[11px] font-medium", l.overdue_followup ? "text-[#B42318]" : "text-violet-700")}><CalendarClock className="h-3 w-3" />{l.overdue_followup ? "Follow-up overdue" : `Follow-up ${l.next_followup_at ? fmtDate(l.next_followup_at) : "open"}`}</span>}
          <ChevronRight className="ml-auto h-4 w-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-[#4361EE]" />
        </div>
        <p className="mt-2 text-[14px] font-semibold text-foreground">{l.device || "Device not recorded"}</p>
        {l.issue && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">{l.issue}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/70 pt-2.5 text-[11.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700"><Avatar name={l.assigned_to_name || "?"} size={18} />{l.assigned_to_name || "Unassigned"}</span>
          {l.contact_status && <span>{l.contact_status}</span>}
          {l.source && <span>{l.source}</span>}
          {l.store_name && <span>{l.store_name}</span>}
          <span className="ml-auto">Created {fmtDate(l.created_at)} · last activity {ago(l.last_activity)}</span>
        </div>
      </div>
    </button>
  );
}

function TimelineRow({ e, last }: { e: TimelineEvent; last: boolean }) {
  const Icon = TL_ICON[e.kind] ?? Milestone;
  return (
    <div className="relative flex gap-3 pb-4 last:pb-0">
      {!last && <span className="absolute left-[13px] top-7 h-[calc(100%-14px)] w-px bg-border" />}
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-600"><Icon className="h-3.5 w-3.5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold">{e.title} <span className="font-mono text-[10.5px] font-normal text-[#4361EE]">{e.lead_no}</span></p>
        {e.detail && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">{e.detail}</p>}
        <p className="mt-0.5 text-[10.5px] text-zinc-400">{e.at ? new Date(e.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}{e.actor ? ` · ${e.actor}` : ""}</p>
      </div>
    </div>
  );
}
