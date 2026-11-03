"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead workspace PRIMARY views (Lead Workspace Standard).

   Assigned Leads · All Leads · Not Contacted · Follow-ups

   All four read the SAME canonical Lead records and render through the SAME
   Lead table — only the dataset / context filters differ. Membership is
   derived (never stored per view) so a Lead can legitimately sit in several
   views at once (e.g. Not Contacted AND Follow-ups).

   Visual: one connected pill (same family as SegmentedTabs). Active = brand
   blue; Not Contacted uses a restrained rose accent. Count badges are real
   derived counts. Colour is never the only signal (label + count + aria).
   ────────────────────────────────────────────────────────────────────────── */

import { CalendarClock, Inbox, Users } from "lucide-react";
import type { ReactNode } from "react";
import { InfoHint } from "@/components/ui/info-hint";
import type { LeadView } from "@/lib/leads-data";
import { cn } from "@/lib/utils";

interface TabDef {
  value: LeadView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "teal" | "rose" | "red";
}

const TABS: TabDef[] = [
  { value: "assigned", label: "Assigned Leads", icon: Inbox, tone: "teal" },
  { value: "all", label: "All Leads", icon: Users, tone: "blue" },
  { value: "followUps", label: "Follow-ups", icon: CalendarClock, tone: "red" },
];

export function LeadWorkspaceTabs({
  value, onChange, counts, hint,
}: {
  value: LeadView;
  onChange: (v: LeadView) => void;
  counts: { assigned: number; notContacted: number; followUps: number };
  /** Explanation of the current view, shown behind an (i) beside the tabs. */
  hint?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
    <div
      role="tablist"
      aria-label="Lead views"
      className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-muted p-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t) => {
        const active = (value === "notContacted" ? "assigned" : value) === t.value;
        const count =
          t.value === "assigned" ? counts.assigned
          : t.value === "followUps" ? counts.followUps
          : 0;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2",
              active
                ? t.tone === "rose"
                  ? "bg-[#E11D48] text-white shadow-[0_6px_16px_-8px_rgba(225,29,72,0.6)] focus-visible:ring-[#E11D48]/40"
                  : t.tone === "teal"
                  ? "bg-[#0F766E] text-white shadow-[0_6px_16px_-8px_rgba(15,118,110,0.6)] focus-visible:ring-[#0F766E]/40"
                  : "bg-[#4361EE] text-white shadow-[0_6px_16px_-8px_rgba(67,97,238,0.6)] focus-visible:ring-[#4361EE]/40"
                : t.tone === "rose"
                  ? "text-rose-700 hover:bg-rose-200/80 focus-visible:ring-[#E11D48]/30"
                  : t.tone === "teal"
                  ? "text-[#0F766E] hover:bg-[#C4E8E2] focus-visible:ring-[#0F766E]/30"
                  : t.tone === "red"
                  ? "text-zinc-600 hover:bg-[#FAD1D1] hover:text-[#B91C1C] focus-visible:ring-[#DC2626]/30"
                  : "text-zinc-600 hover:bg-[#D5DDFB] hover:text-[#3450D8] focus-visible:ring-[#4361EE]/30",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {t.label}
            {t.value !== "all" && count > 0 && (
              <span
                className={cn(
                  "grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold leading-none tabular-nums",
                  active
                    ? t.tone === "rose" ? "bg-white text-[#E11D48]" : t.tone === "teal" ? "bg-white text-[#0F766E]" : "bg-white text-[#4361EE]"
                    : t.tone === "rose" ? "bg-[#E11D48] text-white"
                    : t.tone === "teal" ? "bg-[#0F766E] text-white"
                    : t.tone === "red" ? "bg-[#DC2626] text-white"
                    : "bg-[#4361EE] text-white",
                )}
                aria-label={`${count} ${t.label}`}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
    {hint && <InfoHint label="About this view">{hint}</InfoHint>}
    </div>
  );
}

/* Assigned Leads sub-filter: All · New · No Response.
   "No Response" is the former Not Contacted queue (same logic, rose accent). */
export type AssignedSubValue = "all" | "new" | "noResponse";

export function AssignedSubTabs({
  value, onChange, counts,
}: {
  value: AssignedSubValue;
  onChange: (v: AssignedSubValue) => void;
  counts: { all: number; new: number; noResponse: number };
}) {
  const OPTIONS: { value: AssignedSubValue; label: string; rose?: boolean }[] = [
    { value: "all", label: "All" },
    { value: "new", label: "New" },
    { value: "noResponse", label: "No Response", rose: true },
  ];
  return (
    <div
      role="tablist"
      aria-label="Assigned leads filter"
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted p-1"
    >
      {OPTIONS.map((o) => {
        const active = value === o.value;
        const count = counts[o.value];
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2",
              active
                ? o.rose
                  ? "bg-[#E11D48] text-white focus-visible:ring-[#E11D48]/40"
                  : "bg-[#0F766E] text-white focus-visible:ring-[#0F766E]/40"
                : o.rose
                  ? "text-rose-700 hover:bg-rose-200/80 focus-visible:ring-[#E11D48]/30"
                  : "text-zinc-600 hover:bg-[#C4E8E2] hover:text-[#0F766E] focus-visible:ring-[#0F766E]/30",
            )}
          >
            {o.label}
            {count > 0 && (
              <span
                className={cn(
                  "grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold leading-none tabular-nums",
                  active ? (o.rose ? "bg-white text-[#E11D48]" : "bg-white text-[#0F766E]")
                    : o.rose ? "bg-[#E11D48] text-white" : "bg-[#0F766E] text-white",
                )}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
