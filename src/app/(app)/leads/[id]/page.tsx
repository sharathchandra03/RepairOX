"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — View Lead (CANONICAL full-page Lead record).

   This is the complete, read-first record of a Lead — the canonical Lead detail
   experience, built to the `view-detail-pages` standard (the same document /
   detail-page philosophy as View Ticket and View Invoice). It REPLACES the old
   side drawer: a lead row opens THIS page, not a panel.

   ── Premium visual layer (this file) ──────────────────────────────────────
   The information architecture is unchanged — every section, every value is the
   SAME real data (useLeads / useStore / useField / useDeals / useQuotations).
   What changed is the PRESENTATION so the page reads as ONE continuous customer
   story rather than a stack of plain white rectangles:
     • an elevated HERO (avatar halo, blue-tinted gradient, stronger pills) that
       anchors the page, with a compact sticky context bar once it scrolls away;
     • a restrained per-section COLOUR ACCENT system (left accent strip + tinted
       icon chip) that gives each module its own identity without flooding the
       card with colour;
     • subtle SCROLL-REVEAL entrance motion (<Reveal>) — opacity + 12px lift,
       once, honouring prefers-reduced-motion;
     • a vivid, action-rich Quick Actions hub (<LeadQuickActions>) with the real
       Lead shortcuts (Call / WhatsApp / Edit / Assign Agent / Route / Push to
       Deal / Follow-up / Quotation / View Customer).

   It answers, top-to-bottom:
     WHO is this lead? · WHO owns it? · is the customer COLD/WARM/HOT? ·
     HOW did it progress (Journey)? · WHAT is happening now (Action/Result)? ·
     WHAT is next (Follow-up)? · was there a Deal / Quotation? · did it move to
     Walk-In / Pickup / On-Site? · is there a Ticket / Invoice? · how much
     revenue?

   Separate concepts kept separate (never merged):
     • Lead Status  — current workflow state (lead.status)
     • Temperature  — Hot/Warm/Cold buying intent (lead.leadNature + history)
     • Action       — SYSTEM-DERIVED current action (read-only)
     • Result       — SYSTEM-DERIVED outcome (read-only)
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import {
  ArrowLeft, Phone, Mail, User, Tag, Wrench, UserCheck, BadgePercent, Pencil,
  Lock, Truck, Store, Route as RouteIcon, Ticket as TicketIcon, Receipt,
  ExternalLink, FileText, IndianRupee, Building2, CheckCircle2, GitBranch,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { PinnedRail } from "@/components/common/pinned-rail";
import { QuickEditDrawer, type QuickField } from "@/components/ui/quick-edit-drawer";
import { Reveal } from "@/components/common/reveal";
import { DetailSection, DetailField, SummaryCard, SectionEditButton, DetailHero } from "@/components/common/detail-page";
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
  leadActionTone, leadResultTone, isNotQualified,
  resolveLeadTicket, resolveLeadFinalizedInvoice, resolveLeadFieldJob, resolveLeadWalkIn,
} from "@/lib/lead-workflow";
import { revenueWonForLead, getLeadDevices, leadDevicesTotalEstimate } from "@/lib/leads-data";
import { parseIssueString } from "@/lib/issue-library";
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
import { LeadFollowUpHistory } from "@/components/leads/lead-followup-history";
import { LeadTemperatureSection } from "@/components/leads/lead-temperature-section";
import { LeadQuickActions } from "@/components/leads/lead-quick-actions";
import { LeadStickyContext } from "@/components/leads/lead-sticky-context";
import type { Lead } from "@/lib/leads-data";

/* A device's captured issues rendered as compact pills (same language as the
   capture form). Falls back to "—" when nothing is captured. */
function IssuePills({ value }: { value: string }) {
  const issues = parseIssueString(value || "");
  if (issues.length === 0) return <span className="text-[13px] text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {issues.map((iss, i) => (
        <span key={i} className="inline-flex items-center rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[11.5px] font-medium text-[#4361EE] ring-1 ring-inset ring-[#4361EE]/15">
          {iss}
        </span>
      ))}
    </div>
  );
}

/* Commercial strip card — larger, with a semantic value tone. */
function MoneyCard({ label, value, tone, border }: { label: string; value: React.ReactNode; tone?: string; border?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3.5 transition", border || "border-border/70")}>
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[18px] font-extrabold tabular-nums", tone || "text-foreground")}>{value}</p>
    </div>
  );
}

/* The read-only Action/Result badge (SYSTEM-DERIVED — carries a lock glyph). */
function DerivedBadge({ label, value, tone, lockHint }: { label: string; value: React.ReactNode; tone: string; lockHint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm" title={lockHint}>
      <p className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Lock className="h-2.5 w-2.5" /> {label}
      </p>
      <p className={cn("mt-0.5 text-sm font-bold", tone)}>{value}</p>
    </div>
  );
}

/** A compact clickable "linked record" card for the Operations / lineage bands. */
function RecordCard({
  label, value, tone, icon: Icon, href, muted,
}: {
  label: string; value: React.ReactNode; tone?: string;
  icon: LucideIcon; href?: string; muted?: boolean;
}) {
  const inner = (
    <div className={cn(
      "group/record flex items-center gap-3 rounded-xl border px-4 py-3 transition",
      href ? "border-[#4361EE]/30 bg-[#EEF1FD] hover:-translate-y-0.5 hover:border-[#4361EE]/50 hover:shadow-[0_10px_24px_-16px_rgba(67,97,238,0.5)]" : muted ? "border-dashed border-border bg-muted/30" : "border-border bg-card",
    )}>
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", tone || "bg-[#EEF1FD] text-[#4361EE]")}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("truncate text-[13px] font-bold", muted ? "text-zinc-300" : "text-foreground")}>{value}</p>
      </div>
      {href && <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-[#4361EE] transition-transform group-hover/record:translate-x-0.5" />}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

/* Count-up for the hero Revenue metric (once, ≤700ms). Renders static when the
   user prefers reduced motion or the amount is 0. */
function RevenueValue({ amount }: { amount: number }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce || amount <= 0 ? amount : 0);
  const started = useRef(false);
  useEffect(() => {
    if (reduce || amount <= 0 || started.current) { setN(amount); return; }
    started.current = true;
    const start = performance.now();
    const dur = 650;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(amount * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amount, reduce]);
  return <>{amount > 0 ? formatINR(n) : "—"}</>;
}

export default function ViewLeadPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = String(params?.id ?? "");

  /* Where "Back" should return. Arriving from the Deals queue (?from=deals)
     returns to Deals; otherwise the Leads list. */
  const from = searchParams.get("from");
  const back = from === "deals"
    ? { href: "/leads/deals", label: "Back to Deals" }
    : { href: "/leads/list", label: "Back to Leads" };

  const { leads, hydrated, viewAsReadOnly, updateLead, optionsFor } = useLeads();
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

  /* Which section's QuickEditDrawer is open (null = none). Section quick-edits
     are a lightweight complement to the full capture flow (header "Edit Lead");
     each saves through the canonical updateLead. */
  const [editSection, setEditSection] = useState<null | "customer" | "device" | "info" | "remarks">(null);

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
  // Lead Value shown on the hero + commercial summary is the COMBINED estimate
  // across all captured devices (multi-device aware; equals the flat estimate
  // for a single-device lead).
  const leadEstimateTotal = leadDevicesTotalEstimate(lead);
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

  /* ── Per-section quick-edit (QuickEditDrawer) ─────────────────────────────
     A select's options come from the configurable lead_options; a blank "—"
     choice is always offered so a value can be cleared. */
  const opts = (field: Parameters<typeof optionsFor>[0], current?: string) => {
    const list = optionsFor(field).map((o) => ({ label: o.value, value: o.value }));
    if (current && !list.some((o) => o.value === current)) list.unshift({ label: current, value: current });
    return [{ label: "—", value: "" }, ...list];
  };

  const SECTION_FIELDS: Record<Exclude<typeof editSection, null>, { title: string; icon: LucideIcon; fields: QuickField[]; initial: Record<string, string> }> = {
    customer: {
      title: "Edit Customer & Contact", icon: User,
      fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "number", label: "Phone", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "alternateNumber", label: "Alternate Number", type: "text" },
        { key: "location", label: "Location", type: "text" },
      ],
      initial: {
        name: lead.name || "", number: lead.number || "", email: lead.email || "",
        alternateNumber: lead.alternateNumber || "", location: lead.location || "",
      },
    },
    device: {
      // Quick-edit covers the PRIMARY device (device #1). Full multi-device
      // editing routes to the capture wizard via the header "Edit Lead".
      title: "Edit Device & Issue", icon: Wrench,
      fields: [
        { key: "device", label: "Device", type: "text" },
        { key: "subCategory", label: "Repair Category", type: "select", options: opts("subCategory", lead.subCategory) },
        { key: "category", label: "Part Category", type: "select", options: opts("category", lead.category) },
        { key: "issue", label: "Issue", type: "textarea" },
      ],
      initial: {
        device: lead.device || "", category: lead.category || "",
        subCategory: lead.subCategory || "", issue: lead.issue || "",
      },
    },
    info: {
      title: "Edit Lead Information", icon: Tag,
      fields: [
        { key: "region", label: "Region", type: "select", options: opts("region", lead.region) },
        { key: "source", label: "Source", type: "select", options: opts("source", lead.source) },
        { key: "modeOfContact", label: "Mode of Contact", type: "select", options: opts("modeOfContact", lead.modeOfContact) },
        { key: "contactStatus", label: "Contact Status", type: "select", options: opts("contactStatus", lead.contactStatus) },
        { key: "qualification", label: "Lead Category", type: "select", options: opts("qualification", lead.qualification) },
        { key: "status", label: "Lead Status", type: "select", options: opts("status", lead.status) },
        { key: "estimate", label: "Lead Value (estimate)", type: "number" },
        { key: "discount", label: "Discount", type: "number" },
      ],
      initial: {
        region: lead.region || "", source: lead.source || "", modeOfContact: lead.modeOfContact || "",
        contactStatus: lead.contactStatus || "", qualification: lead.qualification || "", status: lead.status || "",
        estimate: lead.estimate == null ? "" : String(lead.estimate),
        discount: lead.discount == null ? "" : String(lead.discount),
      },
    },
    remarks: {
      title: "Edit Comments & Remarks", icon: FileText,
      fields: [
        { key: "comments", label: "Comment", type: "textarea", rows: 3 },
        { key: "finalRemarks", label: "Final Remarks", type: "textarea", rows: 3 },
      ],
      initial: { comments: lead.comments || "", finalRemarks: lead.finalRemarks || "" },
    },
  };

  const saveSection = (values: Record<string, string>) => {
    // Numeric fields → number | undefined; blank text → undefined (cleared).
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (k === "estimate" || k === "discount") patch[k] = v.trim() === "" ? null : Number(v.replace(/[^0-9.]/g, ""));
      else patch[k] = v;
    }
    // Device quick-edit touches the PRIMARY device — keep the structured
    // devices[0] in sync with the flat fields so a multi-device lead doesn't
    // drift (devices 2..n are untouched). getLeadDevices gives us the current
    // list (flat fallback when none stored yet).
    if (editSection === "device") {
      const current = getLeadDevices(lead);
      const first = current[0] ?? null;
      const nextFirst = {
        id: first?.id || `${lead.id}-dev-1`,
        label: (patch.device as string) ?? lead.device ?? "",
        categoryId: first?.categoryId ?? lead.deviceCategoryId ?? "",
        brandId: first?.brandId ?? lead.deviceBrandId ?? "",
        modelId: first?.modelId ?? lead.deviceModelId ?? "",
        issue: (patch.issue as string) ?? lead.issue ?? "",
        category: (patch.category as string) ?? lead.category ?? "",
        subCategory: (patch.subCategory as string) ?? lead.subCategory ?? "",
        estimate: first?.estimate ?? lead.estimate ?? null,
        discount: first?.discount ?? lead.discount ?? null,
        discountType: first?.discountType ?? lead.discountType ?? "amount",
      };
      patch.devices = [nextFirst, ...current.slice(1)];
    }
    void updateLead(lead.id, patch as Partial<Lead>);
    setEditSection(null);
  };

  const activeEdit = editSection ? SECTION_FIELDS[editSection] : null;

  return (
    <div className="space-y-5">
      {/* ─── Header + sticky context ─────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="w-fit gap-1.5" onClick={() => router.push(back.href)}>
          <ArrowLeft className="h-4 w-4" /> {back.label}
        </Button>

        {/* HERO — the visual anchor of the page (shared DetailHero shell) */}
        <DetailHero>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3.5">
                {/* Avatar with a soft brand halo. */}
                <span className="relative shrink-0">
                  <span aria-hidden className="absolute -inset-1 rounded-full bg-[#4361EE]/20 blur-md" />
                  <span className="relative block rounded-full ring-2 ring-white">
                    <Avatar name={lead.name || lead.leadNo} size={56} />
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]">Lead {lead.leadNo}</p>
                  <h1 className="font-display text-2xl font-bold tracking-tight">{lead.name || "Unnamed lead"}</h1>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                    {lead.number && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.number}</span>}
                    {lead.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {lead.email}</span>}
                  </p>
                  {/* Pills: Temperature · Status · Sales Agent · Store — all distinct. */}
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
            <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryCard label="Lead Value" value={money(leadEstimateTotal)} />
              <DerivedBadge label="Action" value={wf ? (wf.gated ? "N/A" : (wf.fieldStatusLabel || wf.actionLabel)) : "—"} tone={wf ? leadActionTone(wf.action).split(" ").find((c) => c.startsWith("text-")) || "text-[#4361EE]" : "text-[#4361EE]"} lockHint={wf?.reason || "System-derived — read-only"} />
              <DerivedBadge label="Result" value={wf ? wf.result.primary : "—"} tone={wf ? leadResultTone(wf.result.kind) : "text-foreground"} lockHint={wf?.reason || "System-derived — read-only"} />
              <SummaryCard label="Revenue Won" value={<RevenueValue amount={revenue} />} tone={revenue > 0 ? "text-emerald-700" : undefined} />
              <SummaryCard label="Source" value={lead.source || "—"} />
              <SummaryCard label="Next Follow-up" value={lead.followUpDate || "—"} />
            </div>
        </DetailHero>

        {/* Compact sticky context bar — appears once the hero scrolls away. */}
        <LeadStickyContext lead={lead} canEdit={canEdit} />
      </div>

      {/* ─── Main grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT — detail body */}
        <div className="space-y-6 lg:col-span-2">
          {/* Document lineage (when any downstream record exists) */}
          {(lead.linkedTicketId || lead.linkedInvoiceId || lead.linkedFieldJobId || lead.linkedWalkInId || deal || quotation || lead.customerId) && (
            <DetailSection icon={GitBranch} title="Linked Records" accent="blue">
              <div className="flex flex-wrap gap-2">
                {lead.customerId && (
                  <Link href={canViewCustomer ? `/customers/${lead.customerId}` : "#"} className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium transition", canViewCustomer ? "text-[#4361EE] hover:border-[#4361EE]/40 hover:bg-muted" : "pointer-events-none text-zinc-400")}><User className="h-3.5 w-3.5" /> {linkedCustomer?.fullName || "Customer"}</Link>
                )}
                {deal && <Link href={`/leads/deals?deal=${deal.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] transition hover:border-[#4361EE]/40 hover:bg-muted"><BadgePercent className="h-3.5 w-3.5" /> {deal.dealNo}</Link>}
                {quotation && <Link href={`/leads/quotations/${quotation.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] transition hover:border-[#4361EE]/40 hover:bg-muted"><FileText className="h-3.5 w-3.5" /> {quotation.quotationNo}</Link>}
                {(fieldJob || lead.linkedFieldJobId) && <Link href={`/field?job=${fieldJob?.id || lead.linkedFieldJobId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] transition hover:border-[#4361EE]/40 hover:bg-muted"><Truck className="h-3.5 w-3.5" /> {fieldJob?.jobNo || "Field Job"}</Link>}
                {(walkIn || lead.linkedWalkInId) && <Link href={`/walk-in?walkIn=${walkIn?.id || lead.linkedWalkInId}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-[#4361EE] transition hover:border-[#4361EE]/40 hover:bg-muted"><Store className="h-3.5 w-3.5" /> {walkIn?.walkInNumber || "Walk-In"}</Link>}
                {lead.linkedTicketId && <Link href={canViewTicket ? `/tickets/${ticket?.id || lead.linkedTicketId}` : "#"} className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium transition", canViewTicket ? "text-[#4361EE] hover:border-[#4361EE]/40 hover:bg-muted" : "pointer-events-none text-zinc-400")}><TicketIcon className="h-3.5 w-3.5" /> {ticket?.ticketNo || lead.linkedTicketId}</Link>}
                {finalizedInvoice && <Link href={canViewInvoice ? `/invoice/${finalizedInvoice.id}` : "#"} className={cn("inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium transition", canViewInvoice ? "text-[#4361EE] hover:border-[#4361EE]/40 hover:bg-muted" : "pointer-events-none text-zinc-400")}><Receipt className="h-3.5 w-3.5" /> {finalizedInvoice.id}</Link>}
              </div>
            </DetailSection>
          )}

          {/* Customer & Contact */}
          <DetailSection
            icon={User}
            title="Customer & Contact"
            accent="green"
            action={
              <div className="flex items-center gap-3">
                {lead.customerId && canViewCustomer && (
                  <Link href={`/customers/${lead.customerId}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline"><ExternalLink className="h-3 w-3" /> View Customer</Link>
                )}
                {canEdit && <SectionEditButton onClick={() => setEditSection("customer")} />}
              </div>
            }
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
                <p className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <CheckCircle2 className="h-4 w-4" /> Linked to Customer Master{linkedCustomer ? ` · ${linkedCustomer.fullName}` : ""}
                </p>
              ) : (
                <p className="text-[12px] text-muted-foreground">Not yet linked to the Customer Master.</p>
              )}
            </div>
          </DetailSection>

          {/* Device & Issue — one block per captured device (multi-device
              aware; a single device reads exactly like before). */}
          {(() => {
            const leadDevices = getLeadDevices(lead);
            const multi = leadDevices.length > 1;
            const devTotal = leadDevicesTotalEstimate(lead);
            return (
              <DetailSection
                icon={Wrench}
                title={multi ? `Device & Issue · ${leadDevices.length} devices` : "Device & Issue"}
                accent="indigo"
                action={canEdit ? <SectionEditButton onClick={() => setEditSection("device")} /> : undefined}
              >
                {leadDevices.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No device captured.</p>
                ) : multi ? (
                  <div className="space-y-3">
                    {leadDevices.map((d, i) => (
                      <div key={d.id || i} className="rounded-xl border border-border bg-muted/20 p-4">
                        <div className="mb-3 flex items-center gap-2 border-b border-border/70 pb-2.5">
                          <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-700">{i + 1}</span>
                          <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">{d.label || "Device"}</span>
                          {d.estimate != null && <span className="ml-auto text-[12.5px] font-semibold text-zinc-700 tnum">{money(d.estimate)}</span>}
                        </div>
                        <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                          <DetailField label="Repair Category" value={d.subCategory} />
                          <DetailField label="Part Category" value={d.category} />
                          <DetailField
                            label="Estimate"
                            value={d.estimate == null ? "" : money(d.estimate)}
                          />
                          <DetailField
                            label="Discount"
                            value={d.discount == null ? "" : d.discountType === "percent" ? `${d.discount}%` : money(d.discount)}
                          />
                        </div>
                        {/* Issues as pills, full-width under the grid. */}
                        <div className="mt-3 space-y-1.5">
                          <p className="text-[11px] font-medium text-muted-foreground">Issue</p>
                          <IssuePills value={d.issue} />
                        </div>
                      </div>
                    ))}
                    {devTotal != null && (
                      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2.5">
                        <span className="text-[12px] font-medium text-muted-foreground">Total estimate</span>
                        <span className="text-[14px] font-bold text-zinc-900 tnum">{money(devTotal)}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                      <DetailField label="Device" value={lead.device} highlight />
                      <DetailField label="Repair Category" value={lead.subCategory} />
                      <DetailField label="Part Category" value={lead.category} />
                      <DetailField label="Estimate" value={lead.estimate == null ? "" : money(lead.estimate)} />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground">Issue</p>
                      <IssuePills value={lead.issue} />
                    </div>
                  </div>
                )}
              </DetailSection>
            );
          })()}

          {/* Lead Information */}
          <DetailSection icon={Tag} title="Lead Information" accent="blue" action={canEdit ? <SectionEditButton onClick={() => setEditSection("info")} /> : undefined}>
            {/* Dense section → flat rows (no box-per-field, which looks cluttered). */}
            <div className="grid grid-cols-1 gap-x-10 gap-y-3.5 sm:grid-cols-2">
              <DetailField flat label="Lead ID" value={lead.leadNo} />
              <DetailField flat label="Created" value={`${lead.date || "—"}${lead.time ? ` · ${lead.time}` : ""}`} />
              <DetailField flat label="Region" value={lead.region} />
              <DetailField flat label="Source" value={lead.source} />
              <DetailField flat label="Capture Channel" value={lead.captureChannel} />
              <DetailField flat label="Mode of Contact" value={lead.modeOfContact} />
              <DetailField flat label="Sales Agent (owner)" value={lead.assignedToName || lead.agent} />
              <DetailField flat label="Contact Status" value={lead.contactStatus} />
              <DetailField flat label="Lead Category" value={lead.qualification} />
              <DetailField flat label="Lead Status" value={lead.status} />
              <DetailField flat label="Lead Value (estimate)" value={money(lead.estimate)} highlight />
              <DetailField flat label="Discount" value={money(lead.discount)} />
            </div>
          </DetailSection>

          {/* Temperature (buying intent) — stepped indicator + reversible history */}
          <Reveal>
            <LeadTemperatureSection lead={lead} readOnly={viewAsReadOnly} id="temperature" />
          </Reveal>

          {/* Deal / approval — only renders when a Deal exists (no empty band) */}
          {deal && (
            <DetailSection
              icon={BadgePercent}
              title="Deal / Approval"
              accent="amber"
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

          {/* Comments & Remarks (historical comment survives; never overwritten). */}
          {(lead.comments || lead.finalRemarks || canEdit) && (
            <DetailSection icon={FileText} title="Comments & Remarks" accent="neutral" action={canEdit ? <SectionEditButton onClick={() => setEditSection("remarks")} /> : undefined}>
              {!lead.comments && !lead.finalRemarks ? (
                <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-center text-[12px] text-muted-foreground">
                  No comments or remarks yet.{canEdit ? " Use Edit to add one." : ""}
                </p>
              ) : (
              <div className="space-y-3">
                {lead.comments && (
                  <div className="rounded-xl border border-border bg-muted/20 p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Comment</p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">&ldquo;{lead.comments}&rdquo;</p>
                    {(lead.assignedToName || lead.agent) && (
                      <p className="mt-2 text-[11px] text-muted-foreground">Added by {lead.assignedToName || lead.agent}</p>
                    )}
                  </div>
                )}
                {lead.finalRemarks && (
                  <div className={cn("rounded-xl border p-4", isNotQualified(lead.qualification || "") ? "border-rose-200 bg-rose-50/40" : "border-border bg-muted/20")}>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {isNotQualified(lead.qualification || "") ? "Why not qualified" : "Final Remarks"}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">&ldquo;{lead.finalRemarks}&rdquo;</p>
                  </div>
                )}
              </div>
              )}
            </DetailSection>
          )}
        </div>

        {/* RIGHT — pinned utility rail (Quick Actions → Journey → Follow-ups → Assignment) */}
        <PinnedRail>
          {/* Colorful Quick Actions hub (Call / WhatsApp / Edit / Assign /
              Route / Push to Deal / Follow-up / Quotation / View Customer). */}
          <Reveal delay={0.04}><LeadQuickActions lead={lead} readOnly={viewAsReadOnly} /></Reveal>

          {/* Journey — the heart of View Lead */}
          <Reveal delay={0.06}><LeadJourneyTimeline lead={lead} /></Reveal>

          {/* Follow-ups (Quick Actions "Schedule Follow-up" scrolls here). */}
          <Reveal delay={0.08}>
            <div id="followups" className="scroll-mt-28">
              <LeadFollowUpHistory lead={lead} readOnly={viewAsReadOnly} />
            </div>
          </Reveal>

          {/* Assignment */}
          <Reveal delay={0.1}>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignment</h3>
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
            </section>
          </Reveal>
        </PinnedRail>
      </div>

      {/* ─── Fulfilment & Operations (full width — route progression) ─────── */}
      {hasAnyFulfilment && (
        <DetailSection icon={RouteIcon} title="Fulfilment & Operations" accent="violet">
          <div className="flex flex-wrap items-center gap-2">
            {route && (
              <span className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ring-inset",
                route === "STORE_VISIT" ? "bg-sky-50 text-sky-800 ring-sky-200"
                  : route === "ON_SITE" ? "bg-teal-50 text-teal-800 ring-teal-200"
                  : "bg-violet-50 text-violet-800 ring-violet-200",
              )}>
                {route === "STORE_VISIT" ? <Store className="h-3.5 w-3.5" /> : route === "ON_SITE" ? <RouteIcon className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />} {FULFILMENT_ROUTE_LABEL[route]}
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

          {/* The real operational records this route produced (document lineage). */}
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
        <DetailSection icon={IndianRupee} title="Commercial Summary" accent="emerald">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <MoneyCard label="Lead Value (estimate)" value={money(leadEstimateTotal)} />
            <MoneyCard label="Quotation" value={quotation ? formatQuotationMoney(quotation.amount) : "—"} tone={quotation ? "text-[#4361EE]" : undefined} border={quotation ? "border-[#4361EE]/25" : undefined} />
            <MoneyCard label="Discount" value={money(lead.discount)} tone={lead.discount != null ? "text-amber-600" : undefined} border={lead.discount != null ? "border-amber-200" : undefined} />
            <MoneyCard label="Final Invoice" value={finalizedInvoice ? formatINR(Number(finalizedInvoice.total || 0)) : "—"} tone={finalizedInvoice ? "text-emerald-700" : undefined} border={finalizedInvoice ? "border-emerald-200" : undefined} />
            <MoneyCard label="Revenue Won" value={revenue > 0 ? formatINR(revenue) : "—"} tone={revenue > 0 ? "text-emerald-700" : undefined} border={revenue > 0 ? "border-emerald-300" : undefined} />
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

      {/* Per-section quick-edit drawer (lightweight; full edit = header Edit Lead). */}
      {activeEdit && (
        <QuickEditDrawer
          open
          onClose={() => setEditSection(null)}
          title={activeEdit.title}
          subtitle={`${lead.leadNo} · ${lead.name || "Lead"}`}
          icon={activeEdit.icon}
          fields={activeEdit.fields}
          initialValues={activeEdit.initial}
          onSave={saveSection}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
