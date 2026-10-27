"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Workspace collapse control (shared, canonical) ─────────────────────────
   The ONE Expand/Collapse pill for a list workspace's control area (the
   filters/toolbar/header above a table). Collapsed = work mode (controls hidden,
   the table maximizes its viewport); Expanded = management mode (controls
   visible).

   This is the SINGLE source of truth for the control's look across the whole
   CRM. Its appearance is repository-defined (see the sidebar-collapse /
   lead-table-workspace steering): a BLUE-ACCENT pill with WHITE text — never a
   neutral/outline pill. Every workspace collapse toggle (Tickets, Leads, Agent
   Performance, and every future one) MUST use this component so they stay
   uniform. Do not re-style it per page or hand-roll a second collapse pill.

   It is presentation only — it never touches filter values, data, columns,
   freeze selection, or search. Keyboard + a11y: a native <button>
   (Enter/Space) with an explicit aria-label + tooltip. */
export function WorkspaceCollapseBar({
  collapsed,
  onToggle,
  /** Label shown while collapsed (the "expand" affordance). */
  labelCollapsed = "Show Filters",
  /** Label shown while expanded (the "collapse" affordance). */
  labelExpanded = "Collapse Filters",
  /** Noun used in the a11y aria-label/title when none is supplied. */
  noun = "filters",
  /** Optional explicit aria-labels (fall back to the noun-based defaults). */
  ariaLabelCollapsed,
  ariaLabelExpanded,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  labelCollapsed?: string;
  labelExpanded?: string;
  noun?: string;
  ariaLabelCollapsed?: string;
  ariaLabelExpanded?: string;
  className?: string;
}) {
  const aria = collapsed
    ? ariaLabelCollapsed ?? `Show ${noun} and expand controls`
    : ariaLabelExpanded ?? `Collapse ${noun} and maximize the table`;
  const title = collapsed ? labelCollapsed : labelExpanded;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={aria}
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#4361EE] bg-[#4361EE] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#3450D8] hover:border-[#3450D8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
        className,
      )}
    >
      {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      {title}
    </button>
  );
}
