"use client";

/* ──────────────────────────────────────────────────────────────────────────
   LEAD FILTER PANEL — a structured, faceted CRM filter drawer.
   ────────────────────────────────────────────────────────────────────────
   Replaces the flat wall of identical dropdown pills with the pattern great
   CRMs use (Salesforce / HubSpot / Linear): a right-side slide-over with

     • LABELLED SECTIONS (Timeline · Ownership · Classification · Device) that
       group related facets instead of 14 anonymous pills,
     • per-facet SEARCH + LIVE COUNTS (how many leads match each value in the
       CURRENT working set) so you see impact before applying,
     • single-select facets with an obvious "Any" reset + a selected highlight,
     • a live "Show N leads" preview in the footer (dry-runs applyLeadFilters),
     • per-section active badges + a global Clear all.

   It edits a DRAFT copy of the filters and commits on "Apply", so the table
   never thrashes while the user is choosing (but individual applied chips on
   the page still remove instantly — that path calls setFilters directly).
   Purely presentational over the existing LeadFilters model — no new data
   contract. Design-system compliant (Drawer close ×, brand blue, tokens).
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, Check, ChevronDown, X, RotateCcw, CalendarClock, UserRound, Tag, Smartphone } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import {
  applyLeadFilters, hasActiveLeadFilters, LEAD_DATE_RANGES,
  type Lead, type LeadFilters, type LeadFilterField, type LeadFollowUp, type LeadDateRange,
} from "@/lib/leads-data";

/* A single selectable facet value with its live count. */
type FacetOption = { label: string; value: string; count: number };

/* Descriptor for one facet (single-select field) shown in the panel. */
export type FacetDef = {
  /** Filter key in LeadFilters.fields. */
  key: LeadFilterField;
  label: string;
  /** Resolve the option list (value + label). Counts are computed here. */
  options: { label: string; value: string }[];
};

/* Panel section grouping several facets under a heading. */
type SectionDef = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  facetKeys: LeadFilterField[];
};

const SECTIONS: SectionDef[] = [
  { id: "ownership", title: "Ownership & region", icon: UserRound, facetKeys: ["assignedToName", "followUpAgentId" as LeadFilterField, "region"] },
  { id: "classification", title: "Classification", icon: Tag, facetKeys: ["source", "contactStatus", "leadCategory", "leadNature", "priority", "status", "result", "finalResult" as LeadFilterField] },
  { id: "device", title: "Device", icon: Smartphone, facetKeys: ["device", "category"] },
];

// Reuse the shared 8-option date-range vocabulary (matches the page strip +
// Tickets / Dashboard) so the panel and the strip never disagree.
const DATE_RANGES = LEAD_DATE_RANGES;

const FOLLOWUP_FILTERS = [
  { value: "any", label: "Any" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "has", label: "Has follow-up" },
  { value: "none", label: "No follow-up" },
] as const;

export function LeadFilterPanel({
  open,
  onClose,
  filters,
  onApply,
  onClearAll,
  leads,
  openFollowUpsByLead,
  facets,
}: {
  open: boolean;
  onClose: () => void;
  filters: LeadFilters;
  /** Commit the chosen draft to the page. */
  onApply: (next: LeadFilters) => void;
  onClearAll: () => void;
  /** Working set the counts + preview are computed from. */
  leads: Lead[];
  openFollowUpsByLead?: Map<string, LeadFollowUp>;
  /** Facet definitions with their option lists (value + human label). */
  facets: FacetDef[];
}) {
  // Draft copy — the table isn't touched until Apply.
  const [draft, setDraft] = useState<LeadFilters>(filters);
  // Reset the draft to the live filters whenever the panel (re)opens.
  useEffect(() => { if (open) setDraft(filters); }, [open, filters]);

  // Which facet groups are expanded. Sections with an active value auto-open.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [facetSearch, setFacetSearch] = useState<Record<string, string>>({});

  const setField = (key: LeadFilterField, value: string) =>
    setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value } }));

  /* Live per-value counts for a facet, computed against the CURRENT working
     set (leads already scoped by store + search + status tab upstream). Shows
     total availability per value so the user gauges impact. */
  const countsFor = (key: LeadFilterField): Map<string, number> => {
    const m = new Map<string, number>();
    for (const l of leads) {
      const v = String((l as any)[key] ?? "");
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  };

  // Live preview: how many leads the DRAFT would show.
  const previewCount = useMemo(
    () => applyLeadFilters(leads, draft, openFollowUpsByLead).length,
    [leads, draft, openFollowUpsByLead],
  );

  const facetByKey = useMemo(() => {
    const m = new Map<LeadFilterField, FacetDef>();
    for (const f of facets) m.set(f.key, f);
    return m;
  }, [facets]);

  const draftActive = hasActiveLeadFilters(draft);

  // Count active facets per section (for the section badge).
  const sectionActiveCount = (s: SectionDef) =>
    s.facetKeys.reduce((n, k) => n + (draft.fields[k] ? 1 : 0), 0);

  const timelineActive = (draft.dateRange !== "all" ? 1 : 0) + (draft.followUp !== "any" ? 1 : 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Filter leads"
      subtitle="Narrow the list — see how many match before you apply."
      icon={SlidersHorizontal}
      width="max-w-md"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { onClearAll(); onClose(); }}
            disabled={!draftActive}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold transition",
              draftActive ? "text-[#4361EE] hover:bg-[#EEF1FD]" : "cursor-not-allowed text-muted-foreground/40",
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Clear all
          </button>
          <button
            type="button"
            onClick={() => { onApply(draft); onClose(); }}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#4361EE] text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#3550d6]"
          >
            Show {previewCount} {previewCount === 1 ? "lead" : "leads"}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── TIMELINE (segmented, always visible — the most-used facets) ── */}
        <section>
          <SectionHeading icon={CalendarClock} title="Timeline" activeCount={timelineActive} />
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Created</p>
          <SegmentGrid
            options={DATE_RANGES}
            value={draft.dateRange}
            onChange={(v) => setDraft((d) => ({ ...d, dateRange: v as LeadDateRange }))}
          />
          <p className="mb-1.5 mt-3 text-[11px] font-medium text-muted-foreground">Follow-up</p>
          <SegmentGrid
            options={FOLLOWUP_FILTERS as unknown as { value: string; label: string }[]}
            value={draft.followUp}
            onChange={(v) => setDraft((d) => ({ ...d, followUp: v as LeadFilters["followUp"] }))}
          />
        </section>

        <div className="h-px bg-border" />

        {/* ── FACET SECTIONS (grouped, collapsible, searchable, counted) ── */}
        {SECTIONS.map((s) => {
          const active = sectionActiveCount(s);
          const isOpen = expanded[s.id] ?? active > 0;
          return (
            <section key={s.id}>
              <button
                type="button"
                onClick={() => setExpanded((e) => ({ ...e, [s.id]: !isOpen }))}
                className="flex w-full items-center gap-2 py-1"
              >
                <SectionHeading icon={s.icon} title={s.title} activeCount={active} asRow />
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="mt-1 space-y-3">
                  {s.facetKeys.map((key) => {
                    const def = facetByKey.get(key);
                    if (!def) return null;
                    return (
                      <Facet
                        key={key}
                        def={def}
                        selected={draft.fields[key] ?? ""}
                        counts={countsFor(key)}
                        search={facetSearch[key] ?? ""}
                        onSearch={(q) => setFacetSearch((fs) => ({ ...fs, [key]: q }))}
                        onSelect={(v) => setField(key, v)}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Drawer>
  );
}

/* ── Section heading with an active-count badge ── */
function SectionHeading({ icon: Icon, title, activeCount, asRow }: { icon: React.ComponentType<{ className?: string }>; title: string; activeCount: number; asRow?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", !asRow && "mb-2", asRow && "flex-1")}>
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h3 className="text-[13px] font-bold tracking-tight text-foreground">{title}</h3>
      {activeCount > 0 && (
        <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#4361EE] px-1 text-[10px] font-bold text-white">
          {activeCount}
        </span>
      )}
    </div>
  );
}

/* ── Segmented option grid (Timeline uses this — no dropdown needed) ── */
function SegmentGrid({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition",
              active
                ? "border-[#4361EE] bg-[#4361EE] text-white shadow-sm"
                : "border-border bg-card text-zinc-600 hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/50",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── A single searchable, counted, single-select facet ── */
function Facet({
  def, selected, counts, search, onSearch, onSelect,
}: {
  def: FacetDef;
  selected: string;
  counts: Map<string, number>;
  search: string;
  onSearch: (q: string) => void;
  onSelect: (value: string) => void;
}) {
  // Options with counts, sorted by count desc then label; selected floats up.
  const options: FacetOption[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return def.options
      .map((o) => ({ ...o, count: counts.get(o.value) ?? 0 }))
      .filter((o) => !q || o.label.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.value === selected) return -1;
        if (b.value === selected) return 1;
        if (b.count !== a.count) return b.count - a.count;
        return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
      });
  }, [def.options, counts, search, selected]);

  const showSearch = def.options.length > 6;

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-foreground">{def.label}</span>
        {selected && (
          <button
            type="button"
            onClick={() => onSelect("")}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#4361EE] transition hover:bg-[#EEF1FD]"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {showSearch && (
        <div className="relative mb-1.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={`Search ${def.label.toLowerCase()}…`}
            className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-2 text-[12px] outline-none transition focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15"
          />
        </div>
      )}

      <div className="max-h-52 space-y-0.5 overflow-y-auto rox-grid-scroll">
        {options.length === 0 && (
          <p className="px-2 py-2 text-[12px] text-muted-foreground">No matches</p>
        )}
        {options.map((o) => {
          const active = o.value === selected;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onSelect(active ? "" : o.value)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition",
                active ? "bg-[#EEF1FD] font-semibold text-[#4361EE]" : "text-zinc-700 hover:bg-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid h-[16px] w-[16px] shrink-0 place-items-center rounded-full border transition-colors",
                  active ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-border bg-card",
                )}
              >
                {active && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span className="flex-1 truncate">{o.label}</span>
              <span className={cn("tnum shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold", active ? "bg-[#4361EE]/15 text-[#4361EE]" : "bg-muted text-muted-foreground")}>
                {o.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
