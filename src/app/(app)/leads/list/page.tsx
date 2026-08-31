"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Search, Filter, Plus, User, LayoutGrid, List, Map, Flag, X, ChevronDown, CalendarClock, Pin,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";
import { useLeads, LEAD_OPEN_EVENT } from "@/lib/leads-context";
import {
  followUpState, followUpTone, hasActiveLeadFilters,
  type Lead, type LeadFieldKey, type LeadFilterField, type LeadDateRange,
} from "@/lib/leads-data";
import { LeadCaptureFlow } from "@/components/leads/lead-capture-flow";
import { LeadDetailDrawer } from "@/components/leads/lead-detail-drawer";
import { LeadActionsMenu, type LeadAction } from "@/components/leads/lead-actions-menu";
import { statusTone, priorityTone } from "@/components/leads/lead-pills";
import { AssignMenu, AssignBadge, useCanAssignLeads } from "@/components/leads/lead-assign";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/* ── Follow-up cell — mirrors the Ticket due-date reddish/pink treatment. ── */
function FollowUpCell({ lead }: { lead: Lead }) {
  const fu = followUpState(lead.followUpDate);
  if (fu === "none") return <span className="text-[12px] text-zinc-400">—</span>;
  const t = followUpTone(fu);
  const label = fu === "overdue" ? "Overdue" : fu === "today" ? "Today" : formatFollowUp(lead.followUpDate);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", t.chip)}>
      <CalendarClock className="h-3 w-3" />
      {label}
    </span>
  );
}

function formatFollowUp(date: string): string {
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/* ── Filter chip dropdown (values from Lead Settings + live data) ── */
function FilterChip({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition", value ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]" : "border-border bg-card text-zinc-600 hover:bg-muted")}>
        <span className="max-w-[140px] truncate">{value || label}</span>
        {value ? <X className="h-3 w-3" onClick={(e) => { e.stopPropagation(); onChange(""); }} /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 max-h-64 w-52 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
            {options.length === 0 && <p className="px-2.5 py-2 text-[12px] text-muted-foreground">No values</p>}
            {options.map((o) => (
              <button key={o} onClick={() => { onChange(o); setOpen(false); }} className={cn("flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[12px] transition hover:bg-muted", o === value && "bg-[#EEF1FD] font-medium text-[#4361EE]")}>{o}</button>
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
  { key: "agent",          label: "Agent",           optionField: "agent" },
  { key: "assignedToName", label: "Assigned To" },
  { key: "contactStatus",  label: "Contact Status",  optionField: "contactStatus" },
  { key: "leadCategory",   label: "Lead Category",   optionField: "leadCategory" },
  { key: "leadNature",     label: "Lead Nature",     optionField: "leadNature" },
  { key: "result",         label: "Result",          optionField: "result" },
  { key: "priority",       label: "Priority",        optionField: "priority" },
  { key: "device",         label: "Device",          optionField: "device" },
  { key: "category",       label: "Category",        optionField: "category" },
  { key: "followUpAgent",  label: "Follow-Up Agent", optionField: "followUpAgent" },
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
  const { leads, filteredLeads, hydrated, filters, setFilters, clearFilters, optionsFor, deleteLead, pinLead } = useLeads();
  const canAssign = useCanAssignLeads();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [detailLead, setDetailLead] = useState<Lead | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);

  /* Merge configured Settings options with values actually present in data. */
  const distinct = (key: keyof Lead) => Array.from(new Set(leads.map((l) => String(l[key] || "")).filter(Boolean)));
  const optionsForFilter = (f: { key: LeadFilterField; optionField?: LeadFieldKey }): string[] => {
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

  const handleAction = (action: LeadAction, lead: Lead) => {
    switch (action) {
      case "view": setDetailLead(lead); break;
      case "edit": openEdit(lead); break;
      case "priority": openEdit(lead); break; // priority lives in the edit flow
      case "pin": void pinLead(lead.id, !lead.pinnedAt); break;
      case "delete": setConfirmDelete(lead); break;
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

  const activeFilters = hasActiveLeadFilters(filters);

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
            <Can permission="manage_sales">
              <Button size="sm" className="rounded-full gap-1.5" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" /> Add Lead
              </Button>
            </Can>
          </div>
        }
      />

      {/* Status tabs + search + filter toggle */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SegmentedTabs
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={statusTabs}
          size="sm"
          className="max-w-full overflow-x-auto"
        />
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
            {activeFilters && (
              <button onClick={clearFilters} className="text-[12px] font-medium text-[#4361EE] hover:underline">Clear all</button>
            )}
          </div>
        </motion.div>
      )}

      {/* Desktop Table */}
      <div className="hidden rounded-2xl border border-border bg-card shadow-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-[#EEF1FD]">
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/70">
              <th className="px-4 py-3">Lead</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Source</th>
              <th className="px-3 py-3">Owner</th>
              <th className="px-3 py-3">Device</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Priority</th>
              <th className="px-3 py-3">Follow-up</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((lead, i) => (
              <motion.tr
                key={lead.id}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.02 * i, 0.3) }}
                onClick={() => setDetailLead(lead)}
                className={cn(
                  "group cursor-pointer border-t border-border transition hover:bg-muted/30",
                  lead.pinnedAt && "bg-[#7C5CFC]/[0.04]",
                  followUpTone(followUpState(lead.followUpDate)).rowTint,
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={lead.name || lead.leadNo} size={32} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 truncate font-semibold text-zinc-900">
                        {lead.pinnedAt && <Pin className="h-3 w-3 shrink-0 fill-[#7C5CFC] text-[#7C5CFC]" aria-label="Pinned" />}
                        {lead.name || "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{lead.leadNo} · {lead.number || "no number"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3"><span className="text-[12px] text-zinc-600">{lead.date || "—"}</span></td>
                <td className="px-3 py-3"><span className="text-zinc-700">{lead.source || "—"}</span></td>
                <td className="px-3 py-3">
                  {canAssign ? <AssignMenu lead={lead} /> : <AssignBadge lead={lead} />}
                </td>
                <td className="px-3 py-3"><span className="text-zinc-700">{lead.device || "—"}</span></td>
                <td className="px-3 py-3"><span className="text-zinc-600">{lead.leadCategory || "—"}</span></td>
                <td className="px-3 py-3">{lead.status ? <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", statusTone(lead.status))}>{lead.status}</span> : <span className="text-zinc-400">—</span>}</td>
                <td className="px-3 py-3">{lead.priority ? <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", priorityTone(lead.priority))}><Flag className="h-3 w-3" fill="currentColor" /> {lead.priority}</span> : <span className="text-zinc-400">—</span>}</td>
                <td className="px-3 py-3"><FollowUpCell lead={lead} /></td>
                <td className="px-4 py-3">
                  <LeadActionsMenu lead={lead} onAction={handleAction} />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        {hydrated && filteredLeads.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><User className="h-6 w-6" /></div>
            <p className="font-semibold">{leads.length === 0 ? "No leads yet" : "No leads match your filters"}</p>
            <p className="text-sm text-muted-foreground">{leads.length === 0 ? "Capture your first lead in seconds." : "Try a different status, filter, or search."}</p>
            {leads.length === 0 && <Can permission="manage_sales"><Button size="sm" className="mt-2 gap-1.5" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" /> Add Lead</Button></Can>}
          </div>
        )}
        {!hydrated && <div className="p-12 text-center text-sm text-muted-foreground">Loading leads…</div>}
      </div>

      {/* Mobile Cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {paged.map((lead) => (
          <div key={lead.id} onClick={() => setDetailLead(lead)} className={cn("cursor-pointer rounded-2xl border border-border bg-card p-4 shadow-card", lead.pinnedAt && "border-[#7C5CFC]/30", followUpTone(followUpState(lead.followUpDate)).rowTint)}>
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
              <span className="text-zinc-600">{lead.device || "—"}</span>
              {lead.priority && <span className={cn("flex items-center gap-1 font-semibold", priorityTone(lead.priority))}><Flag className="h-3 w-3" fill="currentColor" /> {lead.priority}</span>}
              <FollowUpCell lead={lead} />
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

      {/* Pagination — page size 10/20/50/100, "Showing X–Y of Z", pinned first. */}
      <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
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
      </div>

      {/* Create / Edit flow */}
      <LeadCaptureFlow open={showCreate} onClose={() => setShowCreate(false)} />
      <LeadCaptureFlow open={!!editLead} onClose={() => setEditLead(null)} editLead={editLead} />

      {/* Detail drawer */}
      <LeadDetailDrawer
        lead={detailLead}
        open={!!detailLead}
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
    </div>
  );
}
