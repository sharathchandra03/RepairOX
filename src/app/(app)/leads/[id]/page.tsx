"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — View Lead (full page).

   Follows the view-detail-pages standard: header + summary cards, then a
   `grid grid-cols-1 gap-6 lg:grid-cols-3` with a 2/3 detail column and a
   `<PinnedRail>` utility rail. Wired to the REAL lead record (useLeads) — never
   mock data. The rail leads with the complete LEAD JOURNEY (the spec's §32-43
   "understand the whole journey in seconds"), then the Deal/approval panel,
   follow-ups and quick actions.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Phone, Mail, MessageSquare, User, Tag, Wrench, Flag,
  ClipboardCheck, UserCheck, MapPin, BadgePercent, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { PinnedRail } from "@/components/common/pinned-rail";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { cn, formatINR } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useDeals } from "@/lib/lead-deals-context";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import {
  deriveLeadWorkflow, type LeadWorkflowSources, LEAD_ACTION_LABEL, leadActionTone,
} from "@/lib/lead-workflow";
import { currentDealForLead } from "@/lib/lead-deals";
import { useStore } from "@/lib/store";
import { useField } from "@/lib/field-context";
import { statusTone, priorityTone } from "@/components/leads/lead-pills";
import { LeadJourneyTimeline } from "@/components/leads/lead-journey-timeline";
import { LeadDealPanel } from "@/components/deals/lead-deal-panel";
import { LeadFollowUpHistory } from "@/components/leads/lead-followup-history";
import type { Lead } from "@/lib/leads-data";

/* ─── Standard view-detail sub-components (match the Ticket/Invoice markup) ── */

function DetailSection({
  icon: Icon, title, action, children, id,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-2.5 border-b border-border/70 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Icon className="h-4 w-4" /></span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function DetailField({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  const empty = value === "" || value == null || value === "—";
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium", highlight ? "font-bold text-foreground" : "text-foreground", empty && "text-zinc-300")}>
        {empty ? "—" : value}
      </p>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function RailCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function ViewLeadPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const { leads, hydrated, viewAsReadOnly } = useLeads();
  const { currentDeal } = useDeals();
  const { getStore } = useStoreContext();
  const { can } = usePermissions();
  const { tickets, invoices, walkIns } = useStore();
  const { jobs: fieldJobs } = useField();

  const lead = useMemo<Lead | undefined>(() => leads.find((l) => l.id === id || l.leadNo === id), [leads, id]);

  const workflowSources = useMemo<LeadWorkflowSources>(() => ({ tickets, invoices, walkIns, fieldJobs }), [tickets, invoices, walkIns, fieldJobs]);
  const wf = useMemo(() => lead ? deriveLeadWorkflow(lead, workflowSources, { deal: currentDeal(lead.id) ?? null }) : null, [lead, workflowSources, currentDeal]);

  if (!lead) {
    return (
      <div className="space-y-5">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push("/leads/list")}><ArrowLeft className="h-4 w-4" /> Back to Leads</Button>
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-card">
          <p className="font-semibold">{hydrated ? "Lead not found" : "Loading lead…"}</p>
          {hydrated && <p className="mt-1 text-sm text-muted-foreground">This lead may have been removed, or you don't have access to it.</p>}
        </div>
      </div>
    );
  }

  const deal = currentDeal(lead.id);
  const money = (n: number | null | undefined) => (n == null ? "—" : formatINR(n));
  // Under the owner "view as agent" read-only lens, this detail page is view-only.
  const canEdit = allow(can, CAP.lead.edit) && !viewAsReadOnly;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="w-fit gap-1.5" onClick={() => router.push("/leads/list")}><ArrowLeft className="h-4 w-4" /> Back to Leads</Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={lead.name || lead.leadNo} size={48} />
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">{lead.name || "Unnamed lead"}</h1>
              <p className="text-[13px] text-muted-foreground">
                {lead.leadNo}{lead.assignedToName ? ` · Agent: ${lead.assignedToName}` : ""}{lead.number ? ` · ${lead.number}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {lead.status && <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", statusTone(lead.status))}>{lead.status}</span>}
            {lead.priority && <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold", priorityTone(lead.priority))}><Flag className="h-3 w-3" fill="currentColor" /> {lead.priority}</span>}
            {canEdit && <Link href={`/leads/list?lead=${lead.id}`}><Button size="sm" variant="outline" className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit</Button></Link>}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Lead Value" value={money(lead.estimate)} />
          <SummaryCard label="Action" value={wf ? (wf.gated ? "N/A" : wf.actionLabel) : "—"} tone="text-[#4361EE]" />
          <SummaryCard label="Result" value={wf ? wf.result.primary : "—"} />
          <SummaryCard label="Source" value={lead.source || "—"} />
          <SummaryCard label="Region" value={lead.region || "—"} />
          <SummaryCard label="Follow-up" value={lead.followUpDate || "—"} />
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column — detail sections */}
        <div className="space-y-6 lg:col-span-2">
          {/* Lineage */}
          {(lead.linkedWalkInId || lead.linkedFieldJobId || lead.linkedTicketId || lead.linkedInvoiceId || deal) && (
            <DetailSection icon={Tag} title="Linked Records">
              <div className="flex flex-wrap gap-2">
                {deal && <Link href={`/leads/deals?deal=${deal.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] hover:bg-muted"><BadgePercent className="h-3.5 w-3.5" /> {deal.dealNo}</Link>}
                {lead.linkedTicketId && <Link href={`/tickets/${lead.linkedTicketId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] hover:bg-muted">Ticket {lead.linkedTicketId}</Link>}
                {lead.linkedInvoiceId && <Link href={`/invoice/${lead.linkedInvoiceId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] hover:bg-muted">Invoice {lead.linkedInvoiceId}</Link>}
                {lead.customerId && <Link href={`/customers/${lead.customerId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] hover:bg-muted"><User className="h-3.5 w-3.5" /> Customer</Link>}
              </div>
            </DetailSection>
          )}

          <DetailSection icon={User} title="Contact Information">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Name" value={lead.name} />
              <DetailField label="Number" value={lead.number} />
              <DetailField label="Email" value={lead.email} />
              <DetailField label="Location" value={lead.location} />
              {lead.locationUnit && <DetailField label="Door / Flat" value={lead.locationUnit} />}
            </div>
          </DetailSection>

          <DetailSection icon={Tag} title="Lead Information">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Lead ID" value={lead.leadNo} />
              <DetailField label="Date" value={`${lead.date}${lead.time ? ` · ${lead.time}` : ""}`} />
              <DetailField label="Source" value={lead.source} />
              <DetailField label="Mode of Contact" value={lead.modeOfContact} />
              <DetailField label="Agent (owner)" value={lead.assignedToName || lead.agent} />
              <DetailField label="Lead Category" value={lead.leadCategory} />
              <DetailField label="Lead Nature" value={lead.leadNature} />
              <DetailField label="Priority" value={lead.priority} />
              <DetailField label="Qualification" value={lead.qualification} />
              <DetailField label="Contact Status" value={lead.contactStatus} />
            </div>
          </DetailSection>

          <DetailSection icon={Wrench} title="Device & Issue">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Device" value={lead.device} />
              <DetailField label="Category" value={lead.category} />
              <DetailField label="Issue" value={lead.issue} />
              <DetailField label="Lead Value (estimate)" value={money(lead.estimate)} highlight />
              <DetailField label="Discount" value={money(lead.discount)} />
              <DetailField label="Comments" value={lead.comments} />
            </div>
          </DetailSection>

          {/* Deal / approval — only when a Deal exists */}
          <LeadDealPanel lead={lead} />
        </div>

        {/* Right column — pinned utility rail (Journey leads) */}
        <PinnedRail>
          {/* Quick Actions */}
          <RailCard title="Quick Actions">
            <div className="space-y-2">
              {lead.number && <a href={`tel:${lead.number}`} className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-[13px] font-medium text-zinc-700 transition hover:bg-emerald-50 hover:text-emerald-700"><Phone className="h-4 w-4" /> Call {lead.number}</a>}
              {lead.number && <a href={`https://wa.me/${lead.number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-[13px] font-medium text-zinc-700 transition hover:bg-green-50 hover:text-green-700"><MessageSquare className="h-4 w-4" /> WhatsApp</a>}
              {lead.email && <a href={`mailto:${lead.email}`} className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-[13px] font-medium text-zinc-700 transition hover:bg-sky-50 hover:text-sky-700"><Mail className="h-4 w-4" /> Email</a>}
              {canEdit && <Link href={`/leads/list?lead=${lead.id}`} className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-[13px] font-medium text-zinc-700 transition hover:bg-muted"><Pencil className="h-4 w-4" /> Open full editor</Link>}
            </div>
          </RailCard>

          {/* Journey (the heart of View Lead) */}
          <LeadJourneyTimeline lead={lead} />

          {/* Follow-ups */}
          <LeadFollowUpHistory lead={lead} readOnly={viewAsReadOnly} />
        </PinnedRail>
      </div>
    </div>
  );
}
