"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Search, Filter, Plus, User, LayoutGrid, List, Map, Flag, X, ChevronDown, CalendarClock, Pin,
  Phone, Mail, Smartphone,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { RoxFilterPanelHeader } from "@/components/ui/rox-filter";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { useStoreContext } from "@/lib/store-context";
import { Can } from "@/components/common/can";
import { CAP } from "@/lib/capabilities";
import { toast } from "@/components/ui/toaster";
import { cn, formatINR } from "@/lib/utils";
import { useLeads, LEAD_OPEN_EVENT } from "@/lib/leads-context";
import {
  followUpState, followUpTone, hasActiveLeadFilters, openFollowUpRowState, followUpLifecycle, getLeadDevices, type LeadFollowUp,
  type Lead, type LeadFieldKey, type LeadFilterField, type LeadDateRange,
} from "@/lib/leads-data";
import { LeadCaptureFlow } from "@/components/leads/lead-capture-flow";
import { LeadDetailDrawer } from "@/components/leads/lead-detail-drawer";
import { LeadActionsMenu, type LeadAction } from "@/components/leads/lead-actions-menu";
import { RouteLeadDialog } from "@/components/leads/route-lead-dialog";
import { FulfilmentRouteBadge } from "@/components/leads/fulfilment-route-badge";
import { statusTone, priorityTone } from "@/components/leads/lead-pills";
import { AssignMenu, AssignBadge, useCanAssignLeads } from "@/components/leads/lead-assign";
import { LeadDeviceDetailsOverlay } from "@/components/leads/lead-device-details-overlay";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/* ── Follow-up cell — mirrors the Ticket due-date reddish/pink treatment.
   Driven by the STRUCTURED open follow-up (lead_followup_history) so overdue is
   datetime-precise (a 6:00 PM follow-up reads Overdue at 6:01 PM), not a plain
   calendar-date compare. Falls back to the flat followUpDate if no record. ── */
function FollowUpCell({ lead, open }: { lead: Lead; open?: LeadFollowUp }) {
  const fu = open ? openFollowUpRowState(open) : followUpState(lead.followUpDate);
  if (fu === "none") return <span className="text-[12px] text-zinc-400">—</span>;
  const t = followUpTone(fu);
  const label = fu === "overdue" ? "Overdue" : fu === "today" ? "Due today"
    : open ? formatFollowUpDateTime(open.dueAt) : formatFollowUp(lead.followUpDate);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", t.chip)}>
      <CalendarClock className="h-3 w-3" />
      {label}
    </span>
  );
}

/** Compact date+time label for an open follow-up (e.g. "27 Sep, 6:00 PM"). */
function formatFollowUpDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatFollowUp(date: string): string {
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/* ─────────────────────────────────────────────────────────────────────────
   LEAD TABLE — 15-column grouped presentation (reference-driven).
   One lead = one row. Related fields are GROUPED inside compact cells
   (Contact Info, Device & Issue, Lead Value, Source, Date) rather than split
   into many columns. All values come from the real Lead record — no fakes.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * TBD column source (§Column 12). The reference "TBD" column shows a
 * device/business classification whose canonical meaning isn't yet confirmed.
 * The closest structured field in the current model is `leadNature`. This is
 * the SINGLE place the mapping lives, so the column can be re-pointed later
 * (e.g. to a dedicated classification field) WITHOUT rebuilding the table.
 */
const TBD_SOURCE_FIELD: keyof Lead = "leadNature";
const TBD_HEADER_LABEL = "TBD";

/* Column 2 — DATE: date primary line, time secondary. */
function DateCell({ lead }: { lead: Lead }) {
  const d = lead.date ? new Date(lead.date + "T00:00:00") : null;
  const dateLabel = d && !isNaN(d.getTime())
    ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    : (lead.date || "—");
  return (
    <div className="leading-snug">
      <p className="font-semibold text-zinc-800 tnum">{dateLabel}</p>
      {lead.time && <p className="mt-0.5 text-[12px] text-zinc-500 tnum">{lead.time}</p>}
    </div>
  );
}

/* Column 4 — SOURCE: acquisition source primary; capture channel secondary
   (kept structurally separate — never flattened into one text field). */
function SourceCell({ lead }: { lead: Lead }) {
  if (!lead.source && !lead.captureChannel) return <span className="text-zinc-400">—</span>;
  return (
    <div className="leading-snug">
      {lead.source && <p className="truncate font-medium text-zinc-700">{lead.source}</p>}
      {lead.captureChannel && <p className="mt-0.5 truncate text-[12px] text-zinc-500">{lead.captureChannel}</p>}
    </div>
  );
}

/* Column 6 — CONTACT STATUS (current structured state; kept separate from
   Lead Status / Result / Final Result). */
function ContactStatusCell({ lead }: { lead: Lead }) {
  if (!lead.contactStatus) return <span className="text-zinc-400">—</span>;
  const s = lead.contactStatus.toLowerCase();
  const tone = s.includes("not") ? "bg-zinc-100 text-zinc-600 ring-zinc-200"
    : s.includes("rnr") || s.includes("busy") || s.includes("switched") ? "bg-amber-50 text-amber-700 ring-amber-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", tone)}>{lead.contactStatus}</span>;
}

/* Column 7 — CONTACT INFO (GROUPED: name + phone + email in one cell). */
function ContactInfoCell({ lead }: { lead: Lead }) {
  const phoneDigits = (lead.number || "").replace(/\D/g, "");
  return (
    <div className="min-w-0 leading-snug" onClick={(e) => e.stopPropagation()}>
      <p className="truncate font-semibold text-zinc-900">{lead.name || "—"}</p>
      {lead.number && (
        <a href={`tel:${phoneDigits}`} className="mt-1 flex items-center gap-1.5 text-[12.5px] text-zinc-600 hover:text-[#4361EE] tnum">
          <Phone className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{lead.number}</span>
        </a>
      )}
      {lead.email && (
        <a href={`mailto:${lead.email}`} title={lead.email} className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-zinc-500 hover:text-[#4361EE]">
          <Mail className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{lead.email}</span>
        </a>
      )}
    </div>
  );
}

/* Column 8 — DEVICE & ISSUE (GROUPED: device primary, issue secondary).
   Clicking the cell opens the shared Device & Issue details popup (mirrors the
   Ticket / Walk-In "Device N" overlay) — one consistent popup whether the lead
   has a single device or, in future, multiple. */
function DeviceIssueCell({ lead, onOpen }: { lead: Lead; onOpen: (lead: Lead) => void }) {
  const devices = getLeadDevices(lead);
  if (devices.length === 0) return <span className="text-zinc-400">—</span>;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen(lead); }}
      aria-label="View device and issue details"
      className="group/device flex w-full min-w-0 items-center gap-1.5 rounded-lg text-left transition hover:bg-indigo-50/50"
    >
      <div className="min-w-0 flex-1 leading-snug">
        <p className="flex items-center gap-1.5 truncate font-medium text-zinc-800">
          {lead.device && <Smartphone className="h-4 w-4 shrink-0 text-zinc-400" />}
          <span className="truncate">{lead.device || (lead.issue ? "Device" : "—")}</span>
        </p>
        {lead.issue && <p className="mt-0.5 truncate text-[12.5px] text-zinc-500" title={lead.issue}>{lead.issue}</p>}
      </div>
      <ChevronDown className="h-4 w-4 shrink-0 -rotate-90 text-zinc-400 opacity-70 transition group-hover/device:text-[#4361EE] group-hover/device:opacity-100" />
    </button>
  );
}

/* Column 9 — LEAD VALUE (pipeline/estimate; NEVER revenue). Shows the total
   with the discount as an optional secondary breakdown when present. */
function LeadValueCell({ lead }: { lead: Lead }) {
  if (lead.estimate == null) return <span className="text-zinc-400">—</span>;
  const hasDiscount = lead.discount != null && lead.discount > 0;
  const breakdown = hasDiscount
    ? lead.discountType === "percent"
      ? `−${lead.discount}%`
      : `less ${formatINR(lead.discount!)}`
    : null;
  return (
    <div className="leading-snug">
      <p className="font-semibold text-zinc-900 tnum">{formatINR(lead.estimate)}</p>
      {breakdown && <p className="mt-0.5 text-[12px] text-zinc-500 tnum">{breakdown}</p>}
    </div>
  );
}

/* Column 10 — COMMENT (readable preview; full text on hover via title). */
function CommentCell({ text }: { text: string }) {
  if (!text?.trim()) return <span className="text-zinc-400">—</span>;
  return (
    <p className="line-clamp-2 whitespace-pre-line text-[13px] leading-snug text-zinc-600" title={text}>{text}</p>
  );
}

/* ── Filter chip dropdown (values from Lead Settings + live data) ──
   Options are plain values, or { label, value } pairs for structured fields
   (e.g. Agent → the USER ID as value, the name as label). */
type FilterOption = string | { label: string; value: string };
const optValue = (o: FilterOption) => (typeof o === "string" ? o : o.value);
const optLabel = (o: FilterOption) => (typeof o === "string" ? o : o.label);

function FilterChip({ label, value, options, onChange }: { label: string; value: string; options: FilterOption[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => optValue(o) === value);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition", value ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]" : "border-border bg-card text-zinc-600 hover:bg-muted")}>
        <span className="max-w-[140px] truncate">{value ? (selected ? optLabel(selected) : value) : label}</span>
        {value ? <X className="h-3 w-3" onClick={(e) => { e.stopPropagation(); onChange(""); }} /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 max-h-64 w-52 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
            {options.length === 0 && <p className="px-2.5 py-2 text-[12px] text-muted-foreground">No values</p>}
            {options.map((o) => (
              <button key={optValue(o)} onClick={() => { onChange(optValue(o)); setOpen(false); }} className={cn("flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[12px] transition hover:bg-muted", optValue(o) === value && "bg-[#EEF1FD] font-medium text-[#4361EE]")}>{optLabel(o)}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* Which lead fields get a filter chip, and how they read their options. */
const FILTER_FIELDS: { key: LeadFilterField; label: string; optionField?: LeadFieldKey }[] = [
  { key: "region",         label: "Region",          optionField: "region" },
  { key: "source",         label: "Source",          optionField: "source" },
  // People filters query the structured USER ID (owner / follow-up agent).
  { key: "assignedTo",     label: "Agent (owner)" },
  { key: "contactStatus",  label: "Contact Status",  optionField: "contactStatus" },
  { key: "leadCategory",   label: "Lead Category",   optionField: "leadCategory" },
  { key: "leadNature",     label: "Lead Nature",     optionField: "leadNature" },
  { key: "result",         label: "Result",          optionField: "result" },
  { key: "priority",       label: "Priority",        optionField: "priority" },
  { key: "device",         label: "Device",          optionField: "device" },
  { key: "category",       label: "Category",        optionField: "category" },
  { key: "followUpAgentId", label: "Follow-Up Agent" },
  { key: "finalResult",    label: "Final Result",    optionField: "finalResult" },
];

const DATE_RANGES: { value: LeadDateRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7days", label: "Last 7 days" },
  { value: "30days", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
];

const FOLLOWUP_FILTERS = [
  { value: "any", label: "Follow-up: Any" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "has", label: "Has follow-up" },
  { value: "none", label: "No follow-up" },
] as const;

export default function LeadsListPage() {
  const { leads, filteredLeads, hydrated, filters, setFilters, clearFilters, optionsFor, deleteLead, pinLead, salesAgents, openFollowUpsByLead } = useLeads();
  const canAssign = useCanAssignLeads();
  // Multi-store: show the shared Store Context column only in the consolidated
  // All-Shops view with >1 authorized store (Design System v2 multi-store rule).
  const { isAllShops, stores, getStore } = useStoreContext();
  const multiStore = isAllShops && stores.length > 1;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);
  const [routeLeadTarget, setRouteLeadTarget] = useState<Lead | null>(null);
  // Lead whose Device & Issue details popup is open (mirrors the Ticket /
  // Walk-In device-details overlay). One popup for single OR multiple devices.
  const [deviceDetailsLead, setDeviceDetailsLead] = useState<Lead | null>(null);

  /* Merge configured Settings options with values actually present in data. */
  const distinct = (key: keyof Lead) => Array.from(new Set(leads.map((l) => String(l[key] || "")).filter(Boolean)));
  const optionsForFilter = (f: { key: LeadFilterField; optionField?: LeadFieldKey }): FilterOption[] => {
    if (f.key === "assignedTo" || f.key === "followUpAgentId") {
      // Current Sales Agents + anyone already on a visible lead (historical
      // owners stay filterable). value = user id, label = name.
      const nameKey = f.key === "assignedTo" ? "assignedToName" : "followUpAgent";
      // (plain record — `Map` is the lucide icon in this file)
      const byId: Record<string, string> = {};
      for (const a of salesAgents) byId[a.id] = a.name;
      for (const l of leads) {
        const id = String(l[f.key] || "");
        if (id && !byId[id]) byId[id] = String(l[nameKey] || "Former agent");
      }
      return Object.entries(byId)
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    }
    const configured = f.optionField ? optionsFor(f.optionField).map((o) => o.value) : [];
    const fromData = distinct(f.key as keyof Lead);
    return Array.from(new Set([...configured, ...fromData])).sort();
  };

  /* Status tabs are derived from the data (configurable), plus "All". */
  const statusTabs = useMemo(() => {
    const set = Array.from(new Set(leads.map((l) => l.status).filter(Boolean)));
    return [{ label: "All", value: "" }, ...set.map((s) => ({ label: s, value: s }))];
  }, [leads]);

  /* Reset to page 1 whenever the filtered dataset changes. */
  useEffect(() => { setPage(1); }, [filters, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredLeads, currentPage, pageSize],
  );

  const openEdit = (lead: Lead) => { setDetailLead(null); setEditLead(lead); };
  const liveDetailLead = detailLead ? leads.find((l) => l.id === detailLead.id) ?? null : null;

  const handleAction = (action: LeadAction, lead: Lead) => {
    switch (action) {
      case "view": setDetailLead(lead); break;
      case "edit": openEdit(lead); break;
      case "priority": openEdit(lead); break; // priority lives in the edit flow
      case "pin": void pinLead(lead.id, !lead.pinnedAt); break;
      case "delete": setConfirmDelete(lead); break;
      case "route": setRouteLeadTarget(lead); break;
    }
  };

  /* Open the Lead Detail view when the assigned user clicks "View Lead" in the
     assignment notification. */
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      const lead = leads.find((l) => l.id === id);
      if (lead) setDetailLead(lead);
    };
    window.addEventListener(LEAD_OPEN_EVENT, handler);
    return () => window.removeEventListener(LEAD_OPEN_EVENT, handler);
  }, [leads]);

  /* Deep-link: /leads/list?lead=<id> opens that lead's detail (used by the
     assignment + follow-up-due notifications). Runs once the leads are loaded. */
  const searchParams = useSearchParams();
  const deepLinkLeadId = searchParams.get("lead");
  // A lead the user may not see (another agent's lead, another store) is simply
  // not returned by RLS — say so once instead of silently doing nothing.
  const [deepLinkChecked, setDeepLinkChecked] = useState<string | null>(null);
  useEffect(() => {
    if (!deepLinkLeadId) return;
    const lead = leads.find((l) => l.id === deepLinkLeadId);
    if (lead) { setDetailLead(lead); return; }
    if (hydrated && deepLinkChecked !== deepLinkLeadId) {
      setDeepLinkChecked(deepLinkLeadId);
      toast.error("Lead unavailable", { description: "This lead doesn't exist or isn't assigned to you." });
    }
  }, [deepLinkLeadId, leads, hydrated, deepLinkChecked]);

  const activeFilters = hasActiveLeadFilters(filters);

  // Applied-filter chips (appliedFilters) intentionally removed — see
  // docs/use-later.md. The filter panel (with its Clear all) remains.

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Leads"
        subtitle="Every enquiry in one place — capture fast, qualify when ready, follow up on time."
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-0.5 rounded-xl border border-border bg-card p-0.5 shadow-sm sm:flex">
              <Link href="/leads/list" className="grid h-8 w-8 place-items-center rounded-lg bg-[#4361EE] text-white" title="List View"><List className="h-3.5 w-3.5" /></Link>
              <Link href="/leads/kanban" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="Kanban View"><LayoutGrid className="h-3.5 w-3.5" /></Link>
              <Link href="/leads/map-view" className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-muted transition" title="Map View"><Map className="h-3.5 w-3.5" /></Link>
            </div>
            <Can permission={CAP.lead.create}>
              <Button size="sm" className="rounded-full gap-1.5" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Lead
              </Button>
            </Can>
          </div>
        }
      />

      {/* Status tabs + search + filter toggle */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-full overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            options={statusTabs}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-full lg:w-72">
            <Input
              value={filters.query}
              onChange={(e: any) => setFilters((f) => ({ ...f, query: e.target.value }))}
              placeholder="Search ID, name, number, email, device…"
              iconLeft={<Search className="h-4 w-4" />}
            />
          </div>
          <Button
            variant={showFilters || activeFilters ? "soft" : "outline"}
            size="sm"
            className="shrink-0 gap-1.5 rounded-full"
            onClick={() => setShowFilters((s) => !s)}
          >
            <Filter className="h-3.5 w-3.5" /> Filters
          </Button>
        </div>
      </div>

      {/* Full filter bar */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
          className="rounded-2xl border border-border bg-card p-4 shadow-card"
        >
          {/* Canonical panel header — mandatory close (×) + Reset (Design System v2 §3g). */}
          <RoxFilterPanelHeader
            title="Filters"
            onClose={() => setShowFilters(false)}
            onReset={clearFilters}
            resetLabel="Clear all"
            showReset={activeFilters}
          />
          <div className="flex flex-wrap items-center gap-2">
            {/* Date range */}
            <select
              value={filters.dateRange}
              onChange={(e) => setFilters((f) => ({ ...f, dateRange: e.target.value as LeadDateRange }))}
              className="h-8 rounded-full border border-border bg-card px-3 text-[12px] font-medium text-zinc-700 transition hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:outline-none"
            >
              {DATE_RANGES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {/* Follow-up */}
            <select
              value={filters.followUp}
              onChange={(e) => setFilters((f) => ({ ...f, followUp: e.target.value as any }))}
              className="h-8 rounded-full border border-border bg-card px-3 text-[12px] font-medium text-zinc-700 transition hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:outline-none"
            >
              {FOLLOWUP_FILTERS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            {/* Per-field chips */}
            {FILTER_FIELDS.map((f) => (
              <FilterChip
                key={f.key}
                label={f.label}
                value={filters.fields[f.key] ?? ""}
                options={optionsForFilter(f)}
                onChange={(v) => setFilters((prev) => ({ ...prev, fields: { ...prev.fields, [f.key]: v } }))}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* Applied-filter chips bar intentionally removed (see docs/use-later.md). */}

      {/* Desktop Table — 15-column grouped Lead Table.
          A single BOUNDED, DUAL-SCROLL container: the card scrolls BOTH axes
          internally (wide 15-col table needs real column widths; tall lists get
          internal vertical scroll per spec), and the <thead> is `sticky top-0`
          RELATIVE TO THIS CONTAINER — so the header stays frozen during BOTH
          vertical and horizontal scroll, with no white band and no cramping.
          Keeps the canonical sharp 2px frame + brand header from the design
          system; only the scroll strategy differs (justified: 15 columns). */}
      <div className="rox-table-card shadow-card hidden md:block">
        <div className="max-h-[calc(100vh-260px)] overflow-auto rounded-[inherit] [scrollbar-width:thin]">
        {/* Explicit per-column pixel widths (deterministic with table-fixed) so
            every grouped column gets a generous, non-clumsy width and content
            never truncates awkwardly. The min-width equals their sum; the
            container scrolls horizontally on narrower viewports. */}
        <table className="w-full min-w-[2140px] table-fixed text-[14px]">
          <colgroup>
            <col className="w-[84px]" />                   {/* ID */}
            {multiStore && <col className="w-[132px]" />}   {/* Store (multi-store only) */}
            <col className="w-[92px]" />                    {/* Date + time */}
            <col className="w-[120px]" />                   {/* Region */}
            <col className="w-[120px]" />                   {/* Source + capture channel */}
            <col className="w-[150px]" />                   {/* Agent (owner) */}
            <col className="w-[128px]" />                   {/* Contact Status */}
            <col className="w-[220px]" />                   {/* Contact Info (grouped) */}
            <col className="w-[200px]" />                   {/* Device & Issue (grouped) */}
            <col className="w-[120px]" />                   {/* Lead Value */}
            <col className="w-[200px]" />                   {/* Comment */}
            <col className="w-[120px]" />                   {/* Lead Category */}
            <col className="w-[110px]" />                   {/* TBD */}
            <col className="w-[104px]" />                   {/* Lead Type (priority) */}
            <col className="w-[140px]" />                   {/* Status (+ route) */}
            <col className="w-[128px]" />                   {/* Result */}
            <col className="w-[100px]" />                   {/* Actions (eye · pin · ⋯) */}
          </colgroup>
          <thead className="rox-table-head sticky top-0 z-[5]">
            <tr className="text-left text-[12px] font-bold uppercase tracking-wider">
              <th className="px-4 py-4 text-left">ID</th>
              {multiStore && <th className="px-3 py-4 text-left">Store</th>}
              <th className="px-3 py-4 text-left">Date</th>
              <th className="px-3 py-4 text-left">Region</th>
              <th className="px-3 py-4 text-left">Source</th>
              <th className="px-3 py-4 text-left">Agent</th>
              <th className="px-3 py-4 text-left">Contact Status</th>
              <th className="px-3 py-4 text-left">Contact Info</th>
              <th className="px-3 py-4 text-left">Device &amp; Issue</th>
              <th className="px-3 py-4 text-left">Lead Value</th>
              <th className="px-3 py-4 text-left">Comment</th>
              <th className="px-3 py-4 text-left">Lead Category</th>
              <th className="px-3 py-4 text-left">{TBD_HEADER_LABEL}</th>
              <th className="px-3 py-4 text-left">Lead Type</th>
              <th className="px-3 py-4 text-left">Status</th>
              <th className="px-3 py-4 text-left">Result</th>
              <th className="px-3 py-4 text-right"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((lead, i) => (
              <motion.tr
                key={lead.id}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.02 * i, 0.3) }}
                onClick={() => setDetailLead(lead)}
                className={cn(
                  "rox-table-row group h-[76px] cursor-pointer align-middle transition hover:bg-muted/40",
                  lead.pinnedAt && "bg-[#7C5CFC]/[0.04]",
                  // Whole-row urgency from the STRUCTURED open follow-up (overdue
                  // active follow-up → entire row reads red), mirroring the
                  // Ticket overdue row treatment. Datetime-precise.
                  followUpTone(openFollowUpRowState(openFollowUpsByLead.get(lead.id))).rowTint,
                )}
              >
                {/* 1 · ID (click opens the lead) */}
                <td className="px-4 py-4 align-middle">
                  <button onClick={(e) => { e.stopPropagation(); setDetailLead(lead); }} className="flex items-center gap-1 text-left font-semibold text-[#4361EE] hover:underline tnum">
                    {lead.pinnedAt && <Pin className="h-3.5 w-3.5 shrink-0 fill-[#7C5CFC] text-[#7C5CFC]" aria-label="Pinned" />}
                    {lead.leadNo || "—"}
                  </button>
                </td>
                {/* Store (multi-store only) */}
                {multiStore && (
                  <td className="px-3 py-4 align-middle"><StoreContextCell store={getStore(lead.branchId || null)} mode="stacked" /></td>
                )}
                {/* 2 · Date + time */}
                <td className="px-3 py-4 align-middle"><DateCell lead={lead} /></td>
                {/* 3 · Region */}
                <td className="px-3 py-4 align-middle"><span className="block truncate uppercase text-zinc-700">{lead.region || "—"}</span></td>
                {/* 4 · Source + capture channel */}
                <td className="px-3 py-4 align-middle"><SourceCell lead={lead} /></td>
                {/* 5 · Agent (owner — user id → name) */}
                <td className="px-3 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                  {canAssign ? <AssignMenu lead={lead} compact /> : <AssignBadge lead={lead} size={22} />}
                </td>
                {/* 6 · Contact Status */}
                <td className="px-3 py-4 align-middle"><ContactStatusCell lead={lead} /></td>
                {/* 7 · Contact Info (grouped) */}
                <td className="px-3 py-4 align-middle"><ContactInfoCell lead={lead} /></td>
                {/* 8 · Device & Issue (grouped) */}
                <td className="px-3 py-4 align-middle" onClick={(e) => e.stopPropagation()}><DeviceIssueCell lead={lead} onOpen={setDeviceDetailsLead} /></td>
                {/* 9 · Lead Value (pipeline) */}
                <td className="px-3 py-4 align-middle"><LeadValueCell lead={lead} /></td>
                {/* 10 · Comment */}
                <td className="px-3 py-4 align-middle"><CommentCell text={lead.comments || ""} /></td>
                {/* 11 · Lead Category */}
                <td className="px-3 py-4 align-middle"><span className="block truncate text-zinc-700">{lead.leadCategory || "—"}</span></td>
                {/* 12 · TBD (mapped via TBD_SOURCE_FIELD — re-pointable) */}
                <td className="px-3 py-4 align-middle"><span className="block truncate text-zinc-600">{String(lead[TBD_SOURCE_FIELD] || "") || "—"}</span></td>
                {/* 13 · Lead Type (= Priority: Hot/Warm/Cold) */}
                <td className="px-3 py-4 align-middle">{lead.priority ? <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold", priorityTone(lead.priority))}><Flag className="h-3.5 w-3.5" fill="currentColor" /> {lead.priority}</span> : <span className="text-zinc-400">—</span>}</td>
                {/* 14 · Status (+ fulfilment route) */}
                <td className="px-3 py-4 align-middle">
                  {lead.status ? <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", statusTone(lead.status))}>{lead.status}</span> : <span className="text-zinc-400">—</span>}
                  <div className="mt-1.5"><FulfilmentRouteBadge lead={lead} /></div>
                </td>
                {/* 15 · Result */}
                <td className="px-3 py-4 align-middle"><span className="block truncate font-medium text-zinc-700">{lead.result || "—"}</span></td>
                {/* Actions */}
                <td className="px-3 py-4 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                  <LeadActionsMenu lead={lead} onAction={handleAction} />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        </div>
        {hydrated && filteredLeads.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><User className="h-6 w-6" /></div>
            <p className="font-semibold">{leads.length === 0 ? "No leads yet" : "No leads match your filters"}</p>
            <p className="text-sm text-muted-foreground">{leads.length === 0 ? "Capture your first lead in seconds." : "Try a different status, filter, or search."}</p>
            {leads.length === 0 && <Can permission={CAP.lead.create}><Button size="sm" className="mt-2 gap-1.5" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" /> Add Lead</Button></Can>}
          </div>
        )}
        {!hydrated && <div className="p-12 text-center text-sm text-muted-foreground">Loading leads…</div>}
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {paged.map((lead) => (
          <div key={lead.id} onClick={() => setDetailLead(lead)} className={cn("cursor-pointer rounded-2xl border border-border bg-card p-4 shadow-card", lead.pinnedAt && "border-[#7C5CFC]/30", followUpTone(openFollowUpRowState(openFollowUpsByLead.get(lead.id))).rowTint)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Avatar name={lead.name || lead.leadNo} size={36} />
                <div>
                  <p className="flex items-center gap-1 font-semibold">
                    {lead.pinnedAt && <Pin className="h-3 w-3 fill-[#7C5CFC] text-[#7C5CFC]" />}
                    {lead.name || "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{lead.leadNo} · {lead.source || "—"}</p>
                </div>
              </div>
              {lead.status && <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", statusTone(lead.status))}>{lead.status}</span>}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[12px]">
              {getLeadDevices(lead).length > 0 ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); setDeviceDetailsLead(lead); }} className="inline-flex items-center gap-1 text-zinc-600 hover:text-[#4361EE]">
                  {lead.device || "Device"}
                  <ChevronDown className="h-3.5 w-3.5 -rotate-90 opacity-70" />
                </button>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
              {lead.priority && <span className={cn("flex items-center gap-1 font-semibold", priorityTone(lead.priority))}><Flag className="h-3 w-3" fill="currentColor" /> {lead.priority}</span>}
              <FollowUpCell lead={lead} open={openFollowUpsByLead.get(lead.id)} />
            </div>
            <div className="mt-2 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
              <AssignBadge lead={lead} size={20} />
              <LeadActionsMenu lead={lead} onAction={handleAction} />
            </div>
          </div>
        ))}
        {hydrated && filteredLeads.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {leads.length === 0 ? "No leads yet." : "No leads match your filters."}
          </div>
        )}
      </div>

      {/* Pagination — DETACHED footer (bare sibling below the table frame, per
          the Design System table standard). page size 10/20/50/100. */}
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filteredLeads.length}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        itemLabel="lead"
      />

      {/* Create / Edit flow */}
      <LeadCaptureFlow open={showCreate} onClose={() => setShowCreate(false)} />
      <LeadCaptureFlow open={!!editLead} onClose={() => setEditLead(null)} editLead={editLead} />

      {/* Detail drawer — always renders the LIVE lead (so inline saves, a
          reassignment or a follow-up change show immediately); if the lead
          leaves the user's scope (e.g. handed to another agent) it closes. */}
      <LeadDetailDrawer
        lead={liveDetailLead}
        open={!!liveDetailLead}
        onClose={() => setDetailLead(null)}
        onEdit={openEdit}
        onDelete={(l) => { setDetailLead(null); setConfirmDelete(l); }}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { if (confirmDelete) void deleteLead(confirmDelete.id); }}
        title="Delete lead?"
        description={confirmDelete ? `${confirmDelete.leadNo} · ${confirmDelete.name || "Unnamed"} will be removed. This can't be undone.` : ""}
        confirmLabel="Delete"
        danger
      />

      {/* Route / Assign fulfilment dialog */}
      <RouteLeadDialog
        lead={routeLeadTarget}
        open={!!routeLeadTarget}
        onClose={() => setRouteLeadTarget(null)}
      />

      {/* Device & Issue details popup — mirrors the Ticket / Walk-In device
          overlay. One consistent popup for a single OR multiple devices. */}
      <LeadDeviceDetailsOverlay
        lead={deviceDetailsLead}
        open={!!deviceDetailsLead}
        onClose={() => setDeviceDetailsLead(null)}
      />
    </div>
  );
}
