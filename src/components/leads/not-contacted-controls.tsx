"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Not Contacted view controls.

   Active / History sub-navigation (same interaction pattern as the Follow-ups
   Active/History tabs) + the Active sub-categories:
     • Awaiting First Attempt — assigned, no recorded outreach yet
     • Attempted – No Response — an outreach attempt was recorded (RNR / Busy /
       Switched Off …) but there was no two-way contact

   Also the History evidence hook: previous contact status, when and by whom the
   lead moved out of "uncontacted". Read from existing lead_activity_history
   rows (written by the DB trigger in migration 0086) — no Lead is ever
   duplicated or deleted to build History.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { contactStatusClass, type NotContactedSub } from "@/lib/leads-data";
import { cn } from "@/lib/utils";

function RosePills<T extends string>({
  value, onChange, options, label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex items-center gap-1 rounded-full border border-[#4361EE]/60 bg-rose-50/60 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48]/40",
              active ? "bg-[#E11D48] text-white" : "text-rose-700 hover:bg-white",
            )}
          >
            {o.label}
            {typeof o.count === "number" && (
              <span className={cn("tabular-nums text-[11px] font-bold", active ? "text-white/90" : "text-rose-500")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function NotContactedControls({
  sub, onSub, counts,
}: {
  sub: NotContactedSub;
  onSub: (v: NotContactedSub) => void;
  counts: { active: number; history: number };
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <RosePills
        label="No Response sub-views"
        value={sub}
        onChange={onSub}
        options={[
          { value: "active", label: "Active", count: counts.active },
          { value: "history", label: "History", count: counts.history },
        ]}
      />
    </div>
  );
}

/** Explanation for the Not Contacted view — rendered behind an (i), not a banner. */
export function notContactedHint(sub: NotContactedSub): string {
  return sub === "active"
    ? "Leads without a successful two-way conversation yet. A lead leaves this list only when a real contact result is recorded — opening the dialer is not an attempt. After 48 hours at Not Contacted a lead is locked for its agent and a manager must reassign it."
    : "Leads that were uncontacted and have since been reached. Each row keeps the previous contact status, when it changed and who recorded it.";
}

/* ─── History evidence ─────────────────────────────────────────────────── */

export interface ContactTransition {
  from: string;
  to: string;
  at: string;
  actorId: string;
}

/** Latest "→ contacted" transition per lead, read from lead_activity_history.
 *  Only runs while History is on screen. RLS-scoped (a lead's history rows are
 *  visible only if the lead is). Local/demo mode has no activity table, so the
 *  map stays empty and the UI falls back to `firstContactedAt`. */
export function useContactTransitions(leadIds: string[], enabled: boolean): Record<string, ContactTransition> {
  const [map, setMap] = useState<Record<string, ContactTransition>>({});
  const key = useMemo(() => (enabled ? leadIds.join(",") : ""), [enabled, leadIds]);

  useEffect(() => {
    if (!enabled || !leadIds.length || !isSupabaseConfigured || !supabase) { setMap({}); return; }
    let cancelled = false;
    (async () => {
      const next: Record<string, ContactTransition> = {};
      for (let i = 0; i < leadIds.length; i += 150) {
        const chunk = leadIds.slice(i, i + 150);
        const { data, error } = await supabase!
          .from("lead_activity_history")
          .select("lead_id, contact_status, previous_contact_status, occurred_at, actor_staff_id")
          .in("lead_id", chunk)
          .not("previous_contact_status", "is", null)
          .order("occurred_at", { ascending: true });
        if (error || !data) continue;
        for (const r of data as any[]) {
          if (contactStatusClass(r.contact_status ?? "") !== "contacted") continue;
          if (contactStatusClass(r.previous_contact_status ?? "") === "contacted") continue;
          next[r.lead_id] = {
            from: r.previous_contact_status ?? "",
            to: r.contact_status ?? "",
            at: r.occurred_at ?? "",
            actorId: r.actor_staff_id ?? "",
          };
        }
      }
      if (!cancelled) setMap(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}
