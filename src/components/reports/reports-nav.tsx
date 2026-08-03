"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Primary navigation
   ──────────────────────────────────────────────────────────────────────────
   Replaces the pill-style SegmentedTabs with a modern underline nav in the
   language of Power BI / Looker Studio workspace tabs — flat, understated,
   a single moving indicator. Presentation only; the tab ids map 1:1 to the
   same view-switching logic already in the cockpit.
   ────────────────────────────────────────────────────────────────────────── */

import { motion } from "framer-motion";
import {
  LayoutGrid, FolderKanban, GitCompareArrows, Wand2, BookMarked, Clock, CalendarClock, Pin,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ReportsTabId = "overview" | "reports" | "comparison" | "builder" | "saved" | "recent" | "scheduled" | "pinned";

const TABS: { id: ReportsTabId; label: string; icon: any }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "reports", label: "Reports", icon: FolderKanban },
  { id: "comparison", label: "Comparison", icon: GitCompareArrows },
  { id: "builder", label: "Builder", icon: Wand2 },
  { id: "saved", label: "Saved", icon: BookMarked },
  { id: "recent", label: "Recent", icon: Clock },
  { id: "scheduled", label: "Scheduled", icon: CalendarClock },
  { id: "pinned", label: "Pinned", icon: Pin },
];

export function ReportsNav({ value, onChange }: { value: ReportsTabId; onChange: (v: ReportsTabId) => void }) {
  return (
    <div className="scrollbar-none overflow-x-auto border-b border-border">
      <div className="flex min-w-max items-center gap-1">
        {TABS.map((t) => {
          const active = value === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={cn(
                "relative flex items-center gap-1.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors",
                active ? "text-[#3347D6]" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-[15px] w-[15px]" />
              {t.label}
              {active && (
                <motion.span
                  layoutId="reports-nav-underline"
                  className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-[#4361EE]"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
