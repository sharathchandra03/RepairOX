"use client";

import { cn } from "@/lib/utils";
import type { StatusRailSegment } from "@/lib/lead-sales-book";

/* Portfolio status rail — a prominent segmented control near the top of the
   Sales Book. The five lifecycle stages are mutually exclusive; "All Leads" and
   "Needs Attention" are overlapping views (shown slightly apart so the user
   reads them as separate lenses, not part of the exclusive distribution). */

const TONE: Record<string, { active: string; idle: string; dot: string }> = {
  all:         { active: "border-[#4361EE] bg-[#4361EE] text-white",       idle: "border-border bg-card text-foreground hover:border-[#B3BFF6]", dot: "bg-white/70" },
  new:         { active: "border-sky-500 bg-sky-500 text-white",           idle: "border-border bg-card text-foreground hover:border-sky-300", dot: "bg-sky-500" },
  in_progress: { active: "border-indigo-500 bg-indigo-500 text-white",     idle: "border-border bg-card text-foreground hover:border-indigo-300", dot: "bg-indigo-500" },
  qualified:   { active: "border-violet-500 bg-violet-500 text-white",     idle: "border-border bg-card text-foreground hover:border-violet-300", dot: "bg-violet-500" },
  won:         { active: "border-emerald-600 bg-emerald-600 text-white",   idle: "border-border bg-card text-foreground hover:border-emerald-300", dot: "bg-emerald-600" },
  lost:        { active: "border-zinc-400 bg-zinc-500 text-white",         idle: "border-border bg-card text-foreground hover:border-zinc-300", dot: "bg-zinc-400" },
  attention:   { active: "border-[#C4506B] bg-[#C4506B] text-white",       idle: "border-rose-200 bg-rose-50/60 text-[#B42318] hover:border-rose-300", dot: "bg-[#C4506B]" },
};

export function StatusRail({
  segments,
  active,
  onSelect,
}: {
  segments: StatusRailSegment[];
  active: string;
  onSelect: (key: string) => void;
}) {
  // Keep the rail as ONE evenly-gapped flex row so the first ("All Leads") pill
  // sits flush with the rest — no special fixed-width wrapper that creates an
  // uneven gap after it. "Needs Attention" gets a left divider instead.
  const ordered = [
    segments.find((s) => s.key === "all"),
    ...segments.filter((s) => s.exclusive),
    segments.find((s) => s.key === "attention"),
  ].filter(Boolean) as StatusRailSegment[];

  const chip = (seg: StatusRailSegment) => {
    const tone = TONE[seg.key] ?? TONE.all;
    const isActive = active === seg.key;
    return (
      <button
        key={seg.key}
        type="button"
        onClick={() => onSelect(isActive && seg.key !== "all" ? "all" : seg.key)}
        aria-pressed={isActive}
        className={cn(
          "group flex min-w-[118px] flex-1 items-center justify-between gap-3 rounded-xl border-[1.5px] px-3.5 py-2.5 text-left transition",
          isActive ? tone.active : tone.idle,
          // A subtle divider before the overlapping "Needs Attention" lens so it
          // reads as a separate view without breaking the even spacing.
          seg.key === "attention" && "lg:ml-1 lg:border-l-2 lg:border-l-rose-200",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", isActive ? "bg-white/80" : tone.dot)} />
          <span className="truncate text-[12px] font-semibold">{seg.label}</span>
        </span>
        <span className={cn("text-[17px] font-extrabold tabular-nums", isActive ? "text-white" : "text-foreground")}>{seg.count}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-wrap gap-2 lg:flex-nowrap">
      {ordered.map(chip)}
    </div>
  );
}
