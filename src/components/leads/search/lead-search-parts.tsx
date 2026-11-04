"use client";
import { type ReactNode } from "react";
import {
  UserRound, Briefcase, Contact as ContactIcon, CalendarClock, Eye, Lock, Phone, Mail, Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { statusTone } from "@/components/leads/lead-pills";
import { formatClock } from "@/lib/time-format";
import {
  highlightSegments, type CustomerHit, type LeadHit, type ContactHit, type FollowUpHit,
} from "@/lib/lead-search";

/** Query-match highlighting that never breaks layout (plain <mark>). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const segs = highlightSegments(text, query);
  return (
    <>
      {segs.map((s, i) =>
        s.match ? (
          <mark key={i} className="rounded-sm bg-[#4361EE]/15 px-0.5 font-semibold text-[#2F47C9]">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${fmtDate(iso)}, ${formatClock(d)}`;
}

/** Compact "3d ago" style label. Calendar-agnostic, display only. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 45) return `${days}d ago`;
  return fmtDate(iso);
}

export function MatchChip({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-semibold text-[#4361EE] ring-1 ring-inset ring-[#4361EE]/20">
      {label}
    </span>
  );
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-[160px] shrink-0 items-center truncate rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset", className)}>
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Read-only chip for leads the viewer can see only as a shared reference. */
export function ReferenceBadge({ owner }: { owner?: string | null }) {
  return (
    <span
      title={owner ? `Owned by ${owner}. You can review this lead but not edit it.` : "Read-only reference"}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-300/60"
    >
      <Eye className="h-3 w-3" /> Read-only
    </span>
  );
}

export function EntityIcon({ kind }: { kind: "customer" | "lead" | "contact" | "followup" }) {
  const base = "grid h-8 w-8 shrink-0 place-items-center rounded-lg";
  if (kind === "customer") return <span className={cn(base, "bg-emerald-50 text-emerald-700")}><UserRound className="h-4 w-4" /></span>;
  if (kind === "lead") return <span className={cn(base, "bg-[#EEF1FD] text-[#4361EE]")}><Briefcase className="h-4 w-4" /></span>;
  if (kind === "contact") return <span className={cn(base, "bg-indigo-50 text-indigo-700")}><ContactIcon className="h-4 w-4" /></span>;
  return <span className={cn(base, "bg-violet-50 text-violet-700")}><CalendarClock className="h-4 w-4" /></span>;
}

export function CustomerHitBody({ item, query }: { item: CustomerHit; query: string }) {
  const agents = (item.agents ?? []).slice(0, 2);
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <EntityIcon kind="customer" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-zinc-900"><Highlight text={item.name} query={query} /></span>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"><Highlight text={item.id} query={query} /></span>
          <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-200">Existing customer</Pill>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-zinc-500">
          {item.mobile && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /><Highlight text={item.mobile} query={query} /></span>}
          {item.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" /><Highlight text={item.email} query={query} /></span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
          <span>{item.lead_count} lead{item.lead_count === 1 ? "" : "s"}</span>
          {item.active_count > 0 && <span className="font-medium text-[#0F766E]">{item.active_count} active</span>}
          {agents.length > 0 && <span className="truncate">· {agents.join(", ")}{(item.agents?.length ?? 0) > 2 ? "…" : ""}</span>}
          {item.last_activity && <span>· last activity {ago(item.last_activity)}</span>}
        </div>
      </div>
      <MatchChip label={item.match_field} />
    </div>
  );
}

export function LeadHitBody({ item, query, compact = false }: { item: LeadHit; query: string; compact?: boolean }) {
  const reference = !item.ordinary;
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <EntityIcon kind="lead" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-[#EEF1FD] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#4361EE]"><Highlight text={item.lead_no} query={query} /></span>
          <span className="truncate text-[13px] font-semibold text-zinc-900"><Highlight text={item.name || "Unnamed"} query={query} /></span>
          {item.status && <Pill className={statusTone(item.status)}>{item.status}</Pill>}
          <Pill className={item.closed ? "bg-zinc-100 text-zinc-600 ring-zinc-200" : "bg-teal-50 text-teal-700 ring-teal-200"}>{item.closed ? "Closed" : "Active"}</Pill>
          {reference && <ReferenceBadge owner={item.assigned_to_name} />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-zinc-500">
          {item.number && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /><Highlight text={item.number} query={query} /></span>}
          {(item.device || item.issue) && (
            <span className="inline-flex min-w-0 items-center gap-1 truncate">
              <Smartphone className="h-3 w-3 shrink-0" />
              <span className="truncate"><Highlight text={[item.device, item.issue].filter(Boolean).join(" · ")} query={query} /></span>
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
          <span className="font-medium text-zinc-700">{item.assigned_to_name ? `Agent: ${item.assigned_to_name}` : "Unassigned"}</span>
          {item.contact_status && <span>· {item.contact_status}</span>}
          {!compact && item.store_name && <span>· {item.store_name}</span>}
          {!compact && item.region && <span>· {item.region}</span>}
          {!compact && item.source && <span>· {item.source}</span>}
          {item.open_followup && <span className="inline-flex items-center gap-1 font-medium text-violet-700"><CalendarClock className="h-3 w-3" />Follow-up open</span>}
          <span>· {compact ? `last activity ${ago(item.last_activity)}` : `created ${fmtDate(item.created_at)} · last activity ${ago(item.last_activity)}`}</span>
        </div>
      </div>
      <MatchChip label={item.match_field} />
    </div>
  );
}

export function ContactHitBody({ item, query }: { item: ContactHit; query: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <EntityIcon kind="contact" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-zinc-900"><Highlight text={item.name} query={query} /></span>
          <Pill className="bg-indigo-50 text-indigo-700 ring-indigo-200">CRM contact</Pill>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11.5px] text-zinc-500">
          {item.mobile && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /><Highlight text={item.mobile} query={query} /></span>}
          {item.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" /><Highlight text={item.email} query={query} /></span>}
        </div>
      </div>
      <MatchChip label={item.match_field} />
    </div>
  );
}

/** Due-today / overdue / upcoming — derived from the stored schedule, never stored. */
export function followUpState(f: Pick<FollowUpHit, "status" | "scheduled_at" | "is_open">): { label: string; cls: string } {
  if (!f.is_open) {
    return f.status === "completed"
      ? { label: "Completed", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
      : { label: f.status === "cancelled" ? "Cancelled" : f.status, cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" };
  }
  if (!f.scheduled_at) return { label: "Scheduled", cls: "bg-violet-50 text-violet-700 ring-violet-200" };
  const due = new Date(f.scheduled_at);
  const now = new Date();
  if (due.getTime() < now.getTime()) return { label: "Overdue", cls: "bg-rose-50 text-[#B42318] ring-rose-200" };
  if (due.toDateString() === now.toDateString()) return { label: "Due today", cls: "bg-amber-50 text-amber-800 ring-amber-200" };
  return { label: "Upcoming", cls: "bg-violet-50 text-violet-700 ring-violet-200" };
}

export function FollowUpHitBody({ item, query }: { item: FollowUpHit; query: string }) {
  const st = followUpState(item);
  return (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <EntityIcon kind="followup" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-[#EEF1FD] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#4361EE]">{item.lead_no}</span>
          <span className="truncate text-[13px] font-semibold text-zinc-900">{item.customer_name || "Unnamed"}</span>
          <Pill className={st.cls}>{st.label}</Pill>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-zinc-500">
          <span>{fmtDateTime(item.scheduled_at)}</span>
          {item.agent_name && <span>· {item.agent_name}</span>}
        </div>
        {item.comments && <p className="mt-0.5 truncate text-[11.5px] text-zinc-500"><Highlight text={item.comments} query={query} /></p>}
      </div>
    </div>
  );
}

export function LockedNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
      <Lock className="h-3 w-3" /> {children}
    </p>
  );
}
