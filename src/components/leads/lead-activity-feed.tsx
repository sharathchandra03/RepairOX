
/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Activity Feed (live team ticker).

   A compact, rotating ticker under the Lead Dashboard header that shows ALL
   types of LEAD-RELATED updates happening across the team, in real time:

     • Lead added            (lead created)
     • Lead updated          (meaningful edit)
     • Lead (re)assigned     (lead_assignment_history)
     • Route chosen          ┐
     • Walk-In / Field Job   │
     • Ticket / Invoice      │ (lead_conversion_history)
     • Customer linked       │
     • Converted (Won) / Lost┘
     • Follow-up scheduled / completed (lead_followup_history)

   Two deliberate product rules (requested):

   1. THE ACTOR NAME IS SHOWN TO EVERYONE. Unlike a scoped "last activity" line,
      this team ticker always names WHO did it (the saved account name) for every
      viewer — owner and individual agent alike — so the whole floor sees each
      other's progress. (It stays bounded by the same lead visibility scope the
      page already enforces; it never widens access, only shows the name.)

   2. IT MOTIVATES THE TEAM. "Win" events (Converted / Won, Invoice created,
      Qualified) are celebrated with a warm accent, a 🎉 glyph, the realized
      value when known, and an encouraging line ("Way to go, <name>!") so other
      agents watching feel the momentum. Everything is derived from REAL records
      — never fabricated, never a stored counter.

   Presentation only. It reuses useLeads() streams; it changes no lead data,
   permission, or metric.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Sparkles, UserPlus, PencilLine, ArrowRightLeft, Route as RouteIcon,
  Store, Truck, Ticket as TicketIcon, ReceiptIndianRupee, UserCheck,
  Trophy, XCircle, CalendarClock, CheckCircle2, PartyPopper,
} from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import {
  LEAD_CONVERSION_EVENT_LABEL, type LeadConversionEventType,
} from "@/lib/leads-data";

/* ── One normalized feed entry (built only from real event streams) ── */
type FeedKind =
  | "created" | "updated" | "assigned"
  | LeadConversionEventType
  | "followup_scheduled" | "followup_completed";

interface FeedEntry {
  id: string;
  at: number;
  who: string;
  /** The sentence after the name, e.g. "assigned a lead to Ahmed". */
  what: string;
  kind: FeedKind;
  /** True for celebrate-worthy milestones (won / invoice / qualified-ish). */
  win: boolean;
  /** Realized/attributed value, shown on win events when known. */
  value?: number | null;
}

/* Per-kind icon + tone. Wins use warm/emerald/amber; routine use calm blue. */
const KIND_STYLE: Record<string, { icon: React.ComponentType<{ className?: string }>; dot: string; chip: string }> = {
  created:             { icon: UserPlus,          dot: "bg-[#4361EE]", chip: "text-[#4361EE] bg-[#EEF1FD]" },
  updated:             { icon: PencilLine,        dot: "bg-sky-400",   chip: "text-sky-700 bg-sky-50" },
  assigned:            { icon: ArrowRightLeft,    dot: "bg-violet-400",chip: "text-violet-700 bg-violet-50" },
  routed:              { icon: RouteIcon,         dot: "bg-violet-400",chip: "text-violet-700 bg-violet-50" },
  walk_in_created:     { icon: Store,             dot: "bg-sky-400",   chip: "text-sky-700 bg-sky-50" },
  field_job_created:   { icon: Truck,             dot: "bg-sky-400",   chip: "text-sky-700 bg-sky-50" },
  ticket_created:      { icon: TicketIcon,        dot: "bg-[#4361EE]", chip: "text-[#4361EE] bg-[#EEF1FD]" },
  invoice_created:     { icon: ReceiptIndianRupee,dot: "bg-emerald-500",chip: "text-emerald-700 bg-emerald-50" },
  customer_linked:     { icon: UserCheck,         dot: "bg-sky-400",   chip: "text-sky-700 bg-sky-50" },
  won:                 { icon: Trophy,            dot: "bg-emerald-500",chip: "text-emerald-700 bg-emerald-50" },
  lost:                { icon: XCircle,           dot: "bg-zinc-300",  chip: "text-zinc-500 bg-zinc-100" },
  followup_scheduled:  { icon: CalendarClock,     dot: "bg-amber-400", chip: "text-amber-700 bg-amber-50" },
  followup_completed:  { icon: CheckCircle2,      dot: "bg-emerald-500",chip: "text-emerald-700 bg-emerald-50" },
};

/* A rotating, encouraging cheer for a win (keeps the floor's energy up). */
function cheerFor(name: string, kind: FeedKind): string {
  const who = name || "Someone";
  if (kind === "won")             return `🎉 Way to go, ${who}!`;
  if (kind === "invoice_created") return `💪 Money in — nice work, ${who}!`;
  if (kind === "ticket_created")  return `🔥 ${who} is closing in!`;
  return `✨ Keep it up, ${who}!`;
}

function relTime(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
}

const WIN_KINDS = new Set<FeedKind>(["won", "invoice_created", "ticket_created"]);

export function LeadActivityFeed() {
  const { leads, assignmentHistory, conversionHistory, followUps } = useLeads();
  const reduce = useReducedMotion();

  /* Build the unified, deduped, newest-first feed from REAL streams only. */
  const feed = useMemo<FeedEntry[]>(() => {
    const out: FeedEntry[] = [];
    const push = (e: Omit<FeedEntry, "id"> & { id?: string }) => {
      const t = e.at;
      if (!Number.isFinite(t) || Number.isNaN(t)) return;
      out.push({ ...e, id: e.id || `${e.kind}:${e.who}:${t}` });
    };

    for (const l of leads) {
      const owner = (l.assignedToName || l.agent || "").trim();
      const created = new Date(l.createdAt || l.date || "").getTime();
      const updated = new Date(l.updatedAt || "").getTime();
      const no = l.leadNo ? ` ${l.leadNo}` : "";
      if (Number.isFinite(created)) {
        push({ at: created, who: owner, what: `added lead${no}`.trim(), kind: "created", win: false });
      }
      if (Number.isFinite(updated) && Number.isFinite(created) && updated - created > 1000) {
        push({ at: updated, who: owner, what: `updated lead${no}`.trim(), kind: "updated", win: false });
      }
    }

    for (const h of assignmentHistory) {
      const who = (h.assignedByName || h.toUserName || "").trim();
      const to = h.toUserName ? ` to ${h.toUserName}` : "";
      push({ at: new Date(h.createdAt).getTime(), who, what: `assigned a lead${to}`, kind: "assigned", win: false, id: h.id });
    }

    for (const e of conversionHistory) {
      const label = (LEAD_CONVERSION_EVENT_LABEL[e.eventType] || "updated a lead").toLowerCase();
      push({
        at: new Date(e.occurredAt).getTime(),
        who: (e.actorName || "").trim(),
        what: label,
        kind: e.eventType,
        win: WIN_KINDS.has(e.eventType),
        value: e.value ?? null,
        id: e.id,
      });
    }

    for (const f of followUps) {
      if (f.status === "scheduled") {
        push({ at: new Date(f.createdAt || f.dueAt).getTime(), who: (f.createdByName || f.followUpUserName || "").trim(), what: "scheduled a follow-up", kind: "followup_scheduled", win: false, id: `fus:${f.id}` });
      }
      if (f.status === "completed" && f.completedAt) {
        push({ at: new Date(f.completedAt).getTime(), who: (f.followUpUserName || "").trim(), what: "completed a follow-up", kind: "followup_completed", win: false, id: `fuc:${f.id}` });
      }
    }

    // Dedupe by id, newest first, keep a bounded recent window.
    const seen = new Set<string>();
    return out
      .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
      .sort((a, b) => b.at - a.at)
      .slice(0, 12);
  }, [leads, assignmentHistory, conversionHistory, followUps]);

  /* Rotate through the recent feed so the whole floor's momentum is visible,
     not just the single newest line. Pauses on reduced-motion (shows newest). */
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [feed.length]);
  useEffect(() => {
    if (reduce || feed.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % feed.length), 4200);
    return () => clearInterval(t);
  }, [reduce, feed.length]);

  if (feed.length === 0) return null;
  const cur = feed[Math.min(idx, feed.length - 1)];
  const style = KIND_STYLE[cur.kind] || KIND_STYLE.updated;
  const Icon = style.icon;

  return (
    <div
      className={cn(
        "hidden min-w-0 max-w-[460px] items-center gap-2 rounded-full border px-2.5 py-1 md:inline-flex",
        cur.win
          ? "border-emerald-200 bg-gradient-to-r from-emerald-50 to-amber-50"
          : "border-border bg-muted/40",
      )}
      aria-live="polite"
      title="Live lead activity across your team"
    >
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", style.chip)}>
        {cur.win ? <PartyPopper className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
      </span>

      <AnimatePresence mode="wait">
        <motion.span
          key={cur.id}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -6 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium"
        >
          {/* Actor name — ALWAYS shown to every viewer. */}
          <span className="shrink-0 font-bold text-foreground">{cur.who || "Someone"}</span>
          <span className="truncate text-muted-foreground">{cur.what}</span>
          {cur.win && cur.value ? (
            <span className="shrink-0 font-bold text-emerald-700">· {formatINR(cur.value)}</span>
          ) : null}
          <span className="shrink-0 text-muted-foreground/70">· {relTime(cur.at)}</span>
          {cur.win && (
            <span className="ml-0.5 hidden shrink-0 items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-px text-[10px] font-bold text-emerald-700 lg:inline-flex">
              <Sparkles className="h-2.5 w-2.5" /> {cheerFor(cur.who, cur.kind)}
            </span>
          )}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
