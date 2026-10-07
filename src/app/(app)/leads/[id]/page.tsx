"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — View Lead (CANONICAL full-page Lead record).

   This is the complete, read-first record of a Lead — the canonical Lead detail
   experience, built to the `view-detail-pages` standard (the same document /
   detail-page philosophy as View Ticket and View Invoice). It REPLACES the old
   side drawer: a lead row opens THIS page, not a panel.

   It answers, top-to-bottom:
     WHO is this lead? · WHO owns it? · is the customer COLD/WARM/HOT? ·
     HOW did it progress (Journey)? · WHAT is happening now (Action/Result)? ·
     WHAT is next (Follow-up)? · was there a Deal / Quotation? · did it move to
     Walk-In / Pickup / On-Site? · is there a Ticket / Invoice? · how much
     revenue?  Every value is REAL (useLeads / useStore / useField / useDeals /
     useQuotations) — never mock data.

   Layout: header + summary cards, then `grid grid-cols-1 gap-6 lg:grid-cols-3`
   with a 2/3 LEFT detail column and a 1/3 <PinnedRail> utility column (Journey
   leads the rail). Full-width Fulfilment / Ticket+Invoice bands below.

   Separate concepts kept separate (never merged):
     • Lead Status  — current workflow state (lead.status)
     • Temperature  — Hot/Warm/Cold buying intent (lead.leadNature + history)
     • Action       — SYSTEM-DERIVED current action (read-only)
     • Result       — SYSTEM-DERIVED outcome (read-only)
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Phone, Mail, MessageSquare, User, Tag, Wrench, Flag,
  UserCheck, MapPin, BadgePercent, Pencil, Lock, Truck, Store, Route as RouteIcon,
  Ticket as TicketIcon, Receipt, ExternalLink, FileText, IndianRupee, Building2,
  CheckCircle2, GitBranch, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { PinnedRail } from "@/components/common/pinned-rail";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { cn, formatINR } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import { useDeals } from "@/lib/lead-deals-context";
import { useQuotations } from "@/lib/quotations-context";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import {
  deriveLeadWorkflow, deriveLeadStoreBranchId, type LeadWorkflowSources,
  leadActionTone, leadResultTone,
  resolveLeadTicket, resolveLeadFinalizedInvoice, resolveLeadFieldJob, resolveLeadWalkIn,
} from "@/lib/lead-workflow";
import { revenueWonForLead } from "@/lib/leads-data";
import { useStore } from "@/lib/store";
import { useField } from "@/lib/field-context";
import { statusTone } from "@/components/leads/lead-pills";
import {
  temperatureLevel, temperatureTone, temperatureGlyph,
} from "@/lib/lead-temperature";
import { FIELD_STATUS_LABEL, FIELD_STATUS_TONE, FULFILMENT_ROUTE_LABEL, normaliseRoute } from "@/lib/field-data";
import { DEAL_STATUS_LABEL, dealStatusTone, formatDealDiscount } from "@/lib/lead-deals";
import { QUOTATION_STATUS_LABEL, quotationStatusTone, formatQuotationMoney } from "@/lib/quotation-data";
import { LeadJourneyTimeline } from "@/components/leads/lead-journey-timeline";
import { LeadDealPanel } from "@/components/deals/lead-deal-panel";
import { LeadFollowUpHistory } from "@/components/leads/lead-followup-history";
import { LeadTemperatureSection } from "@/components/leads/lead-temperature-section";
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

/** A compact clickable "linked record" card for the Operations / lineage bands. */
function RecordCard({
  label, value, tone, icon: Icon, href, muted,
}: {
  label: string; value: React.ReactNode; tone?: string;
  icon: React.ComponentType<{ className?: string }>; href?: string; muted?: boolean;
}) {
  const inner = (
    <div className={cn(
      "flex items-center gap-3 rounded-xl border px-4 py-3 transition",
      href ? "border-[#4361EE]/30 bg-[#EEF1FD] hover:bg-[#E0E6FC]" : muted ? "border-border bg-muted/30" : "border-border bg-card",
    )}>
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tone || "bg-[#EEF1FD] text-[#4361EE]")}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("truncate text-[13px] font-bold", muted ? "text-zinc-300" : "text-foreground")}>{value}</p>
      </div>
      {href && <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-[#4361EE]" />}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

/* The read-only Action/Result row (SYSTEM-DERIVED — carries a lock glyph; never
   an editable control). */
function DerivedBadge({ label, value, tone, lockHint }: { label: string; value: React.ReactNode; tone: string; lockHint: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-3" title={lockHint}>
      <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Lock className="h-2.5 w-2.5" /> {label}
      </p>
      <p className={cn("mt-0.5 text-sm font-bold", tone)}>{value}</p>
    </div>
  );
}

export default function ViewLeadPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = String(params?.id ?? "");

  /* Where "Back" should return. Arriving from the Deals queue (?from=deals)
     returns to Deals; otherwise the Leads list. The list preserves its own
     filters/scope in its URL/state, so a plain push back restores it. */
  const from = searchParams.get("from");
  const back = from === "deals"
    ? { href: "/leads/deals", label: "Back to Deals" }
    : { href: "/leads/list", label: "Back to Leads" };

  const { leads, hydrated, viewAsReadOnly } = useLeads();
  const { currentDeal } = useDeals();
  const { currentQuotationForLead } = useQuotations();
  const { getStore } = useStoreContext();
  const { can } = usePermissions();
  const { tickets, invoices, walkIns, customers } = useStore();
  const { jobs: fieldJobs } = useField();

  const lead = useMemo<Lead | undefined>(
    () => leads.find((l) => l.id === id || l.leadNo === id),
    [leads, id],
  );

  const workflowSources = useMemo<LeadWorkflowSources>(
    () => ({ tickets, invoices, walkIns, fieldJobs }),
    [tickets, invoices, walkIns, fieldJobs],
  );

  const deal = lead ? currentDeal(lead.id) : null;
  const quotation = lead ? currentQuotationForLead(lead.id) : null;

  const wf = useMemo(
    () => (lead ? deriveLeadWorkflow(lead, workflowSources, {
      deal: deal ?? null,
      quotation: quotation ? { status: quotation.status, sentAt: quotation.sentAt } : null,
    }) : null),
    [lead, workflowSources, deal, quotation],
  );

  if (!lead) {
    return (
      <div className="space-y-5">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.push(back.href)}><ArrowLeft className="h-4 w-4" /> {back.label}</Button>
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-card">
          <p className="font-semibold">{hydrated ? "Lead not found" : "Loading lead…"}</p>
          {hydrated && <p className="mt-1 text-sm text-muted-foreground">This lead may have been removed, or you don&rsquo;t have access to it.</p>}
        </div>
      </div>
    );
  }

  const money = (n: number | null | undefined) => (n == null ? "—" : formatINR(n));
  const canEdit = allow(can, CAP.lead.edit) && !viewAsReadOnly;
  const canViewTicket = allow(can, CAP.ticket.view);
  const canViewInvoice = allow(can, CAP.invoice.view);
  const canViewCustomer = allow(can, CAP.customer.view);

  /* ── Resolve the live operational graph (same resolvers the derivation uses). */
  const ticket = resolveLeadTicket(lead, tickets);
  const finalizedInvoice = resolveLeadFinalizedInvoice(lead, ticket, invoices);
  const fieldJob = resolveLeadFieldJob(lead, fieldJobs);
  const walkIn = resolveLeadWalkIn(lead, walkIns);
  const linkedCustomer = lead.customerId ? customers.find((c) => c.id === lead.customerId) : undefined;
  const revenue = revenueWonForLead(lead, tickets, invoices);
  const route = normaliseRoute(lead.fulfilmentRoute);

  /* Lead store (SALES origin) vs operational/transaction store — kept distinct. */
  const leadStore = lead.branchId ? getStore(lead.branchId) : null;
  const opStoreBranchId = deriveLeadStoreBranchId(lead, workflowSources);
  const opStore = opStoreBranchId ? getStore(opStoreBranchId) : null;

  const tLevel = temperatureLevel(lead.leadNature || "");
  const hasAnyFulfilment = !!(route || fieldJob || walkIn || ticket || finalizedInvoice || lead.linkedWalkInId || lead.linkedFieldJobId);
  const hasCommercial = !!(lead.estimate != null || quotation || finalizedInvoice || lead.discount != null);

  return (
    <div className="space-y-5">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="w-fit gap-1.5" onClick={() => router.push(back.href)}>
          <ArrowLeft className="h-4 w-4" /> {back.label}
        </Button>

        <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card to-[#EEF1FD]/30 p-5 shadow-card sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Avatar name={lead.name || lead.leadNo} size={52} />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]">Lead {lead.leadNo}</p>
                <h1 className="font-display text-2xl font-bold tracking-tight">{lead.name || "Unnamed lead"}</h1>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                  {lead.number && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.number}</span>}
                  {lead.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {lead.email}</span>}
                </p>
                {/* Pills: Temperature · Status · Sales Agent — all distinct. */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", temperatureTone(tLevel))}>
                    <span>{temperatureGlyph(tLevel)}</span> {lead.leadNature || "No temperature"}
                  </span>
                  {lead.status && <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", statusTone(lead.status))}>{lead.status}</span>}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                    <UserCheck className="h-3 w-3 text-[#4361EE]" /> {lead.assignedToName || lead.agent || "Unassigned"}
                  </span>
                  {leadStore && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                      <Building2 className="h-3 w-3 text-[#4361EE]" /> {leadStore.name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Header actions (permission-gated) */}
            <div className="flex flex-wrap items-center gap-2">
              {lead.number && <a href={`tel:${lead.number}`}><Button size="sm" variant="outline" className="gap-1.5"><Phone className="h-3.5 w-3.5" /> Call</Button></a>}
              {allow(can, CAP.quotation.view) && (
                <Link href={`/leads/list?lead=${lead.id}&action=quotation`}>
                  <Button size="sm" variant="outline" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Quotation</Button>
                </Link>
              )}
              {canEdit && (
                <Link href={`/leads/list?lead=${lead.id}&action=edit`}>
                  <Button size="sm" className="gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit Lead</Button>
                </Link>
              )}
            </div>
          </div>

          {/* Current-state summary cards (at-a-glance) */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard label="Lead Value" value={money(lead.estimate)} />
            <DerivedBadge label="Action" value={wf ? (wf.gated ? "N/A" : (wf.fieldStatusLabel || wf.actionLabel)) : "—"} tone={wf ? leadActionTone(wf.action).split(" ").find((c) => c.startsWith("text-")) || "text-[#4361EE]" : "text-[#4361EE]"} lockHint={wf?.reason || "System-derived — read-only"} />
            <DerivedBadge label="Result" value={wf ? wf.result.primary : "—"} tone={wf ? leadResultTone(wf.result.kind) : "text-foreground"} lockHint={wf?.reason || "System-derived — read-only"} />
            <SummaryCard label="Revenue Won" value={revenue > 0 ? formatINR(revenue) : "—"} tone={revenue > 0 ? "text-emerald-700" : undefined} />
            <SummaryCard label="Source" value={lead.source || "—"} />
            <SummaryCard label="Next Follow-up" value={lead.followUpDate || "—"} />
          </div>
        </div>
      </div>

      {/* ─── Main grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT — detail body */}
        <div className="space-y-6 lg:col-span-2">
          {/* Document lineage (when any downstream record exists) */}
          {(lead.linkedTicketId || lead.linkedInvoiceId || lead.linkedFieldJobId || lead.linkedWalkInId || deal || quotation || lead.customerId) && (
            <DetailSection icon={GitBranch} title="Linked Records">
              <div className="flex flex-wrap gap-2">
                {lead.customerId && (
                  <Link href={canViewCustomer ? `/customers/${lead.customerId}` : "#"} className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium", canViewCustomer ? "text-[#4361EE] hover:bg-muted" : "pointer-events-none text-zinc-400")}><User className="h-3.5 w-3.5" /> {linkedCustomer?.fullName || "Customer"}</Link>
                )}
                {deal && <Link href={`/leads/deals?deal=${deal.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] hover:bg-muted"><BadgePercent className="h-3.5 w-3.5" /> {deal.dealNo}</Link>}
                {quotation && <Link href={`/leads/quotations/${quotation.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] hover:bg-muted"><FileText className="h-3.5 w-3.5" /> {quotation.quotationNo}</Link>}
                {(fieldJob || lead.linkedFieldJobId) && <Link href={`/field?job=${fieldJob?.id || lead.linkedFieldJobId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] hover:bg-muted"><Truck className="h-3.5 w-3.5" /> {fieldJob?.jobNo || "Field Job"}</Link>}
                {(walkIn || lead.linkedWalkInId) && <Link href={`/walk-in?walkIn=${walkIn?.id || lead.linkedWalkInId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] hover:bg-muted"><Store className="h-3.5 w-3.5" /> {walkIn?.walkInNumber || "Walk-In"}</Link>}
                {lead.linkedTicketId && <Link href={canViewTicket ? `/tickets/${ticket?.id || lead.linkedTicketId}` : "#"} className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium", canViewTicket ? "text-[#4361EE] hover:bg-muted" : "pointer-events-none text-zinc-400")}><TicketIcon className="h-3.5 w-3.5" /> {ticket?.ticketNo || lead.linkedTicketId}</Link>}
                {finalizedInvoice && <Link href={canViewInvoice ? `/invoice/${finalizedInvoice.id}` : "#"} className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium", canViewInvoice ? "text-[#4361EE] hover:bg-muted" : "pointer-events-none text-zinc-400")}><Receipt className="h-3.5 w-3.5" /> {finalizedInvoice.id}</Link>}
              </div>
            </DetailSection>
          )}

          {/* Customer & Contact */}
          <DetailSection
            icon={User}
            title="Customer & Contact"
            action={lead.customerId && canViewCustomer
              ? <Link href={`/customers/${lead.customerId}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline"><ExternalLink className="h-3 w-3" /> View Customer</Link>
              : undefined}
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Name" value={lead.name} highlight />
              <DetailField label="Phone" value={lead.number} />
              <DetailField label="Email" value={lead.email} />
              <DetailField label="Alternate Number" value={lead.alternateNumber} />
              <DetailField label="Location" value={lead.location} />
              {lead.locationUnit && <DetailField label="Door / Flat" value={lead.locationUnit} />}
            </div>
            <div className="mt-4 border-t border-border/70 pt-3">
              {lead.customerId ? (
                <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Linked to Customer Master{linkedCustomer ? ` · ${linkedCustomer.fullName}` : ""}
                </p>
              ) : (
                <p className="text-[12px] text-muted-foreground">Not yet linked to the Customer Master.</p>
              )}
            </div>
          </DetailSection>

          {/* Device & Issue */}
          <DetailSection icon={Wrench} title="Device & Issue">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Device" value={lead.device} highlight />
              <DetailField label="Category" value={lead.category} />
              <DetailField label="Sub Category" value={lead.subCategory} />
              <DetailField label="Issue" value={lead.issue} />
            </div>
          </DetailSection>

          {/* Lead Information */}
          <DetailSection icon={Tag} title="Lead Information">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Lead ID" value={lead.leadNo} />
              <DetailField label="Created" value={`${lead.date || "—"}${lead.time ? ` · ${lead.time}` : ""}`} />
              <DetailField label="Region" value={lead.region} />
              <DetailField label="Source" value={lead.source} />
              <DetailField label="Capture Channel" value={lead.captureChannel} />
              <DetailField label="Mode of Contact" value={lead.modeOfContact} />
              <DetailField label="Sales Agent (owner)" value={lead.assignedToName || lead.agent} />
              <DetailField label="Contact Status" value={lead.contactStatus} />
              <DetailField label="Lead Category" value={lead.qualification} />
              <DetailField label="Lead Status" value={lead.status} />
              <DetailField label="Lead Value (estimate)" value={money(lead.estimate)} highlight />
              <DetailField label="Discount" value={money(lead.discount)} />
            </div>
          </DetailSection>

          {/* Temperature (buying intent) — stepped indicator + reversible history */}
          <LeadTemperatureSection lead={lead} readOnly={viewAsReadOnly} id="temperature" />

          {/* Deal / approval — only renders when a Deal exists (no empty band) */}
          {deal && (
            <DetailSection
              icon={BadgePercent}
              title="Deal / Approval"
              action={allow(can, CAP.deal.view) ? <Link href={`/leads/deals?deal=${deal.id}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline"><ExternalLink className="h-3 w-3" /> View Deal</Link> : undefined}
            >
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <DetailField label="Deal ID" value={deal.dealNo} />
                <DetailField label="Status" value={<span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", dealStatusTone(deal.status))}>{DEAL_STATUS_LABEL[deal.status]}</span>} />
                <DetailField label="Requested Discount" value={formatDealDiscount(deal.requestedDiscount, deal.requestedDiscountType)} />
                <DetailField label="Approved Discount" value={deal.approvedDiscount != null ? formatDealDiscount(deal.approvedDiscount, deal.approvedDiscountType) : "—"} />
                <DetailField label="Approver" value={deal.approverName} />
                <DetailField label="Reason" value={deal.requestedReason} />
              </div>
            </DetailSection>
          )}

          {/* Comments (historical comment survives; never overwritten) */}
          {lead.comments && (
            <DetailSection icon={FileText} title="Comments">
              <p className="whitespace-pre-wrap text-sm text-foreground">{lead.comments}</p>
            </DetailSection>
          )}
        </div>

        {/* RIGHT — pinned utility rail (Journey leads) */}
        <PinnedRail>
          {/* Quick Actions */}
          <RailCard title="Quick Actions">
            <div className="space-y-2">
              {lead.number && <a href={`tel:${lead.number}`} className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-[13px] font-medium text-zinc-700 transition hover:bg-emerald-50 hover:text-emerald-700"><Phone className="h-4 w-4" /> Call {lead.number}</a>}
              {lead.number && <a href={`https://wa.me/${lead.number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-[13px] font-medium text-zinc-700 transition hover:bg-green-50 hover:text-green-700"><MessageSquare className="h-4 w-4" /> WhatsApp</a>}
              {lead.email && <a href={`mailto:${lead.email}`} className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-[13px] font-medium text-zinc-700 transition hover:bg-sky-50 hover:text-sky-700"><Mail className="h-4 w-4" /> Email</a>}
              {canEdit && <Link href={`/leads/list?lead=${lead.id}&action=edit`} className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-[13px] font-medium text-zinc-700 transition hover:bg-muted"><Pencil className="h-4 w-4" /> Edit Lead</Link>}
            </div>
          </RailCard>

          {/* Journey — the heart of View Lead */}
          <LeadJourneyTimeline lead={lead} />

          {/* Follow-ups */}
          <LeadFollowUpHistory lead={lead} readOnly={viewAsReadOnly} />

          {/* Assignment */}
          <RailCard title="Assignment">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Avatar name={lead.assignedToName || lead.agent || "Unassigned"} size={32} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-foreground">{lead.assignedToName || lead.agent || "Unassigned"}</p>
                  <p className="text-[11px] text-muted-foreground">Sales Agent (owner)</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border/70 pt-3">
                <div><p className="text-[11px] text-muted-foreground">Assigned By</p><p className="text-[12.5px] font-medium">{lead.assignedByName || "—"}</p></div>
                <div><p className="text-[11px] text-muted-foreground">Assigned Date</p><p className="text-[12.5px] font-medium">{lead.assignedAt ? new Date(lead.assignedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</p></div>
              </div>
            </div>
          </RailCard>
        </PinnedRail>
      </div>

      {/* ─── Fulfilment & Operations (full width — route progression) ─────── */}
      {hasAnyFulfilment && (
        <DetailSection icon={RouteIcon} title="Fulfilment & Operations">
          <div className="flex flex-wrap items-center gap-2">
            {route && (
              <span className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ring-inset",
                route === "STORE_VISIT" ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-violet-50 text-violet-800 ring-violet-200",
              )}>
                {route === "STORE_VISIT" ? <Store className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />} {FULFILMENT_ROUTE_LABEL[route]}
              </span>
            )}
            {fieldJob && (
              <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[fieldJob.status])}>
                {FIELD_STATUS_LABEL[fieldJob.status]}
              </span>
            )}
            {opStore && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Building2 className="h-3 w-3" /> Operational store: <StoreContextCell store={opStore} mode="inline" />
              </span>
            )}
          </div>

          {/* The real operational records this route produced */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(fieldJob || lead.linkedFieldJobId) && (
              <RecordCard label="Field Job" value={fieldJob?.jobNo || "Field Job"} icon={Truck} tone="bg-violet-50 text-violet-600" href={`/field?job=${fieldJob?.id || lead.linkedFieldJobId}`} />
            )}
            {(walkIn || lead.linkedWalkInId) && (
              <RecordCard label="Walk-In" value={walkIn?.walkInNumber || "Walk-In"} icon={Store} tone="bg-amber-50 text-amber-600" href={`/walk-in?walkIn=${walkIn?.id || lead.linkedWalkInId}`} />
            )}
            <RecordCard
              label="Ticket" value={ticket?.ticketNo || lead.linkedTicketId || "Not created yet"} icon={TicketIcon}
              tone={lead.linkedTicketId ? "bg-indigo-50 text-indigo-600" : undefined}
              href={lead.linkedTicketId && canViewTicket ? `/tickets/${ticket?.id || lead.linkedTicketId}` : undefined}
              muted={!lead.linkedTicketId}
            />
            <RecordCard
              label="Invoice" value={finalizedInvoice?.id || "Not created yet"} icon={Receipt}
              tone={finalizedInvoice ? "bg-emerald-50 text-emerald-600" : undefined}
              href={finalizedInvoice && canViewInvoice ? `/invoice/${finalizedInvoice.id}` : undefined}
              muted={!finalizedInvoice}
            />
          </div>

          {/* Ninja / technician */}
          {fieldJob?.ninjaName && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <UserCheck className="h-3.5 w-3.5" /> Field agent: <span className="font-medium text-foreground">{fieldJob.ninjaName}</span>
            </p>
          )}
        </DetailSection>
      )}

      {/* ─── Commercial Summary (full width — Estimate ≠ Quotation ≠ Revenue) */}
      {hasCommercial && (
        <DetailSection icon={IndianRupee} title="Commercial Summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard label="Lead Value (estimate)" value={money(lead.estimate)} />
            <SummaryCard label="Quotation" value={quotation ? formatQuotationMoney(quotation.amount) : "—"} />
            <SummaryCard label="Discount" value={money(lead.discount)} />
            <SummaryCard label="Final Invoice" value={finalizedInvoice ? formatINR(Number(finalizedInvoice.total || 0)) : "—"} />
            <SummaryCard label="Revenue Won" value={revenue > 0 ? formatINR(revenue) : "—"} tone={revenue > 0 ? "text-emerald-700" : undefined} />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Lead Value is the internal pipeline estimate. Quotation is a customer-facing offer. Revenue Won is only a finalized invoice — these are never the same number.
          </p>
          {quotation && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-4 py-2.5">
              <span className="inline-flex items-center gap-2 text-[12.5px]">
                <FileText className="h-4 w-4 text-[#4361EE]" />
                <span className="font-medium">{quotation.quotationNo}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", quotationStatusTone(quotation.status))}>{QUOTATION_STATUS_LABEL[quotation.status]}</span>
              </span>
              {allow(can, CAP.quotation.view) && <Link href={`/leads/quotations/${quotation.id}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-[#4361EE] hover:underline">View Quotation <ExternalLink className="h-3 w-3" /></Link>}
            </div>
          )}
        </DetailSection>
      )}
    </div>
  );
}
