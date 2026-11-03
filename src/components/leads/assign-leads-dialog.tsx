"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Assign Leads (manual intake + assignment).

   For enquiries that arrive OFF-system (phone call, email, marketing form) and
   must be handed to a Sales Agent right away. ONE save creates the Lead AND its
   initial assignment in a single INSERT — the DB ownership guard (migration
   0086) stamps created_by / assigned_by / assigned_at (server `now()`), writes
   lead_assignment_history in the same transaction and rejects an ineligible
   agent, so a failure never leaves an unassigned orphan lead.

   Reuses (never forks): addLead (permission + eligibility + customer link),
   Customer Master (CustomerIdentityLookup + findOrCreateCustomer — no
   duplicates), Device Catalog (DeviceCatalogPicker), Lead options
   (optionsFor), the eligible Sales Agent directory (salesAgentsFor), Lead
   Store Mode (useLeadStoreMode) and the shared centered-form shell.

   Gated by CAP.lead.assignIntake (leads_assign_intake). The Pending Leads tab
   additionally needs CAP.lead.pendingAccess (leads_pending_access). Neither
   widens lead visibility or store scope.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Check, ClipboardList, Inbox, Search, Send, Smartphone, Store as StoreIcon, UserCheck, UserPlus, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { InfoHint } from "@/components/ui/info-hint";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { toast } from "@/components/ui/toaster";
import { CustomerIdentityLookup } from "@/components/common/customer-identity-lookup";
import { DeviceCatalogPicker, SalesAgentEmptyState, type DeviceSelection } from "@/components/leads/lead-form-fields";
import {
  PendingLeadsPanel, claimPendingLead, completePendingLead, releasePendingLead, usePendingLeads,
  type PendingLead,
} from "@/components/leads/pending-leads-panel";
import { useLeads } from "@/lib/leads-context";
import { useSession } from "@/lib/use-session";
import { usePermissions } from "@/lib/permissions-context";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { useLeadStoreMode } from "@/lib/lead-store-mode";
import { useSalesPresenceRoster } from "@/lib/use-sales-presence";
import { CAP, allow } from "@/lib/capabilities";
import { findOrCreateCustomer } from "@/lib/customer-service";
import type { Customer } from "@/lib/customer-data";
import { normalizeCustomerPhone } from "@/lib/customer-data";
import {
  contactStatusClass, emptyLeadDraft, isFreshAssignment, validateLead,
  type LeadDraft,
} from "@/lib/leads-data";
import { cn } from "@/lib/utils";

const CAPTURE_CHANNELS = ["Phone", "Email", "Manual", "Form", "WhatsApp", "Chat"];
const EMPTY_DEVICE: DeviceSelection = { categoryId: "", brandId: "", modelId: "", label: "" };

function Field({ label, required, error, hint, children, className }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="flex items-center gap-1 text-[12px] font-medium text-zinc-700">
        {label}{required && <span className="text-rose-500" aria-hidden>*</span>}
        {hint && <InfoHint label={`About ${label}`}>{hint}</InfoHint>}
      </label>
      {children}
      {error && <p role="alert" className="flex items-center gap-1 text-[11px] font-medium text-rose-600"><AlertCircle className="h-3 w-3" /> {error}</p>}
    </div>
  );
}

function Section({ icon: Icon, title, hint, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <header className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]"><Icon className="h-4.5 w-4.5" /></span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-1 text-[13px] font-bold uppercase tracking-wider text-foreground">
            {title}
            {hint && <InfoHint label={`About ${title}`}>{hint}</InfoHint>}
          </h3>
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function AssignLeadsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    leads, followUps, addLead, optionsFor, salesAgentsFor, salesAgentsReady, currentUserIsSalesAgent, canSeeAllLeads,
  } = useLeads();
  const { id: currentUserId } = useSession();
  const { can } = usePermissions();
  const { addCustomer, customers } = useStore();
  const customersRef = useRef(customers);
  customersRef.current = customers;
  const { getStore } = useStoreContext();
  const leadMode = useLeadStoreMode();
  const { onlineIds } = useSalesPresenceRoster();

  const canPending = allow(can, CAP.lead.pendingAccess);
  const canCreateCustomer = allow(can, CAP.customer.create);

  const [tab, setTab] = useState<"new" | "pending">("new");
  const pending = usePendingLeads(open && canPending);
  const [pendingSrc, setPendingSrc] = useState<PendingLead | null>(null);

  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [email, setEmail] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [device, setDevice] = useState<DeviceSelection>(EMPTY_DEVICE);
  const [issue, setIssue] = useState("");
  const [source, setSource] = useState("");
  const [captureChannel, setCaptureChannel] = useState("");
  const [region, setRegion] = useState("");
  const [contactStatus, setContactStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [storeId, setStoreId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [agentQuery, setAgentQuery] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const contactOptions = useMemo(() => optionsFor("contactStatus").map((o) => o.value).filter(Boolean), [optionsFor]);
  const sourceOptions = useMemo(() => optionsFor("source").map((o) => o.value).filter(Boolean), [optionsFor]);
  const regionOptions = useMemo(() => optionsFor("region").map((o) => o.value).filter(Boolean), [optionsFor]);

  /** Reset the form each time the dialog opens (never carry a stale draft). */
  useEffect(() => {
    if (!open) return;
    setTab("new"); setPendingSrc(null);
    setName(""); setNumber(""); setEmail(""); setCustomerId("");
    setDevice(EMPTY_DEVICE); setIssue(""); setSource(""); setCaptureChannel("");
    setRegion(""); setNotes(""); setAgentId(""); setAgentQuery("");
    setTouched(false);
    savingRef.current = false; setSaving(false);
  }, [open]);

  // Default Contact Status = an existing "Not Contacted" value (no verified
  // interaction has happened yet) — resolved from the configured vocabulary.
  useEffect(() => {
    if (!open) return;
    const nc = contactOptions.find((v) => contactStatusClass(v) === "not_contacted");
    setContactStatus(nc ?? "Not Contacted");
  }, [open, contactOptions]);

  // Lead Store Mode: Single → the configured default; Multi → authorised pick.
  useEffect(() => {
    if (!open || !leadMode.ready) return;
    setStoreId((cur) => (leadMode.isSingle ? leadMode.leadStoreForNewLead : (cur || leadMode.leadStoreForNewLead)));
  }, [open, leadMode.ready, leadMode.isSingle, leadMode.leadStoreForNewLead]);

  const agents = useMemo(() => salesAgentsFor(storeId || null), [salesAgentsFor, storeId]);
  // Drop a chosen agent who is not eligible for a newly chosen store.
  useEffect(() => {
    if (agentId && !agents.some((a) => a.id === agentId)) setAgentId("");
  }, [agents, agentId]);

  const followUpAgentLoad = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of followUps) if (f.status === "scheduled" && f.followUpUserId) m.set(f.followUpUserId, (m.get(f.followUpUserId) ?? 0) + 1);
    return m;
  }, [followUps]);
  const leadsWithFollowUp = useMemo(() => new Set(followUps.map((f) => f.leadId)), [followUps]);
  const unworkedLoad = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) {
      if (l.assignedTo && isFreshAssignment(l, leadsWithFollowUp.has(l.id))) m.set(l.assignedTo, (m.get(l.assignedTo) ?? 0) + 1);
    }
    return m;
  }, [leads, leadsWithFollowUp]);

  const visibleAgents = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    return agents
      .filter((a) => !q || a.name.toLowerCase().includes(q) || a.roleLabel.toLowerCase().includes(q))
      .sort((a, b) => Number(onlineIds.has(b.id)) - Number(onlineIds.has(a.id)) || a.name.localeCompare(b.name));
  }, [agents, agentQuery, onlineIds]);

  const selfIsAgent = !!currentUserId && currentUserIsSalesAgent(storeId || null);
  const chosenAgent = agents.find((a) => a.id === agentId);

  const draft: LeadDraft = useMemo(() => ({
    ...emptyLeadDraft(chosenAgent?.name ?? ""),
    name: name.trim(), number: number.trim(), email: email.trim(), customerId,
    device: device.label || pendingSrc?.device || "",
    deviceCategoryId: device.categoryId, deviceBrandId: device.brandId, deviceModelId: device.modelId,
    issue: issue.trim(), source, captureChannel, region, contactStatus,
    comments: notes.trim(),
    status: optionsFor("status").map((o) => o.value).find(Boolean) ?? "",
    assignedTo: agentId, assignedToName: chosenAgent?.name ?? "", agent: chosenAgent?.name ?? "",
    branchId: storeId,
  }), [chosenAgent, name, number, email, customerId, device, pendingSrc, issue, source, captureChannel, region, contactStatus, notes, optionsFor, agentId, storeId]);

  const errors = useMemo(() => {
    const e: Record<string, string> = { ...validateLead(draft, { requireOwner: true }).errors as Record<string, string> };
    if (!e.number && normalizeCustomerPhone(draft.number ?? "").length < 10) e.number = "Enter a valid mobile number.";
    if (leadMode.ready && leadMode.isSingle && !storeId) e.branchId = leadMode.singleStoreInactive
      ? "The configured Lead Store is inactive. An administrator must select an active store."
      : "No Default Lead Store is configured. An administrator must set one in Settings → Store.";
    if (leadMode.ready && leadMode.isMulti && !storeId) e.branchId = "Select the store this lead belongs to.";
    // A Contacted state means a real two-way conversation already happened —
    // it must be recorded, never assumed.
    if (contactStatusClass(contactStatus) === "contacted" && !notes.trim()) {
      e.notes = "Describe the conversation you already had with the customer.";
    }
    return e;
  }, [draft, leadMode.ready, leadMode.isSingle, leadMode.isMulti, leadMode.singleStoreInactive, storeId, contactStatus, notes]);
  const valid = Object.keys(errors).length === 0;

  const useExistingCustomer = (c: Customer) => {
    setCustomerId(c.id);
    setName(c.fullName || name);
    setNumber(c.mobile || number);
    setEmail(c.email || email);
  };

  const pickPending = (row: PendingLead) => {
    setPendingSrc(row);
    setName(row.name); setNumber(row.number); setEmail(row.email);
    setIssue(row.issue); setSource(row.source); setCaptureChannel(row.captureChannel); setRegion(row.region);
    setDevice(EMPTY_DEVICE); setCustomerId("");
    if (row.branchId && !leadMode.isSingle) setStoreId(row.branchId);
    setTouched(false);
    setTab("new");
  };

  /** Identity only: link the Customer Master record for this phone/email, or
   *  create ONE (deduped) — never touches Sales attribution. */
  const ensureCustomer = async (): Promise<string> => {
    if (customerId) return customerId;
    if (!canCreateCustomer) return "";
    const parts = name.trim().split(/\s+/);
    const first = parts.shift() ?? "";
    const result = findOrCreateCustomer(
      {
        firstName: first, lastName: parts.join(" "), mobile: number, email: email || undefined,
        type: "personal", city: region || undefined, captureSource: "lead", source: "sales",
      },
      // The store's live customer list is read inside addCustomer's dedupe too.
      customersRef.current,
    );
    if (!result.created) return result.customer.id;
    const saved = await addCustomer(result.customer);
    return saved ? saved.id : "";
  };
  const submit = async () => {
    if (savingRef.current) return;               // double-submit guard
    setTouched(true);
    if (!valid) return;
    savingRef.current = true;
    setSaving(true);
    let claimed = false;
    try {
      if (pendingSrc) {
        claimed = await claimPendingLead(pendingSrc.id);
        if (!claimed) {
          toast.error("Already being handled", { description: "Another user has taken this pending lead." });
          void pending.refresh();
          setPendingSrc(null);
          return;
        }
      }
      const resolvedCustomer = await ensureCustomer();
      const lead = await addLead(
        resolvedCustomer ? { ...draft, customerId: resolvedCustomer } : draft,
        { assignmentReason: "Manual assignment (Assign Leads)" },
      );
      if (!lead) {                               // addLead already surfaced the reason
        if (claimed && pendingSrc) await releasePendingLead(pendingSrc.id);
        return;
      }
      if (claimed && pendingSrc) {
        const ok = await completePendingLead(pendingSrc.id, lead.id, agentId);
        if (!ok) toast.info("Lead created", { description: "The pending record could not be marked assigned. Refresh the queue." });
      }
      toast.success(`${lead.leadNo} assigned`, { description: `${lead.name || "Lead"} → ${chosenAgent?.name ?? "agent"}. It is now in their Assigned Leads inbox.` });
      onClose();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const storeLabel = getStore(storeId)?.name || leadMode.defaultStore?.name || "";
  const missing = [
    !name.trim() && "name", !number.trim() && "mobile", !source && "source", !agentId && "agent",
  ].filter(Boolean) as string[];

  const footer = tab === "new" ? (
    <div className="flex w-full items-center justify-between gap-3">
      <p className="hidden min-w-0 truncate text-[11.5px] text-muted-foreground sm:block">
        {missing.length > 0 ? <>Still needed: <span className="font-semibold text-foreground">{missing.join(", ")}</span></> : "Ready — the lead is created and assigned in one step. Time is recorded by the server."}
      </p>
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="outline" className="rounded-full" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="button" className="gap-1.5 rounded-full px-5" onClick={() => void submit()} disabled={saving} aria-busy={saving}>
          <Send className="h-3.5 w-3.5" /> {saving ? "Assigning…" : chosenAgent ? `Assign to ${chosenAgent.name.split(" ")[0]}` : "Save & Assign"}
        </Button>
      </div>
    </div>
  ) : (
    <div className="ml-auto"><Button type="button" variant="outline" className="rounded-full" onClick={onClose}>Close</Button></div>
  );

  return (
    <RoxCenteredForm
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title="Assign Leads"
      subtitle="Capture an incoming enquiry and hand it to a Sales Agent."
      icon={UserPlus}
      width="max-w-5xl"
      closeOnBackdrop={false}
      footer={footer}
    >
      <div className="space-y-5">
        {canPending && (
          <div role="tablist" aria-label="Lead assignment" className="inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1">
            {([
              { v: "new", label: "New Assignment", icon: UserPlus },
              { v: "pending", label: `Pending Leads${pending.rows.length ? ` (${pending.rows.length})` : ""}`, icon: Inbox },
            ] as const).map((t) => (
              <button
                key={t.v} type="button" role="tab" aria-selected={tab === t.v}
                onClick={() => setTab(t.v)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
                  tab === t.v ? "bg-[#4361EE] text-white" : "text-zinc-600 hover:bg-card",
                )}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === "pending" && canPending ? (
          <PendingLeadsPanel
            rows={pending.rows} loading={pending.loading} error={pending.error}
            onRefresh={() => void pending.refresh()} onPick={pickPending}
            storeName={(id) => getStore(id)?.name ?? ""}
          />
        ) : (
          <div className="space-y-4">
            {pendingSrc && (
              <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
                <Inbox className="h-4 w-4 shrink-0" />
                Assigning a pending inbound lead received {pendingSrc.receivedAt ? new Date(pendingSrc.receivedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""}.
                {pendingSrc.device && <> Enquiry device: <span className="font-semibold">{pendingSrc.device}</span>.</>}
              </p>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
              {/* ── LEFT: what came in ── */}
              <div className="space-y-5">
                <Section icon={UserRound} title="Customer" hint="Who is enquiring. Existing customers are matched automatically.">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Lead name" required error={touched ? errors.name : undefined} className="sm:col-span-2">
                      <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setName(e.target.value); setCustomerId(""); }} placeholder="Customer name" invalid={touched && !!errors.name} autoComplete="off" />
                    </Field>
                    <Field label="Mobile number" required error={touched ? errors.number : undefined}>
                      <Input value={number} inputMode="tel" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setNumber(e.target.value); setCustomerId(""); }} placeholder="10-digit mobile" invalid={touched && !!errors.number} autoComplete="off" />
                    </Field>
                    <Field label="Email" error={touched ? errors.email : undefined}>
                      <Input type="email" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); setCustomerId(""); }} placeholder="name@example.com" invalid={touched && !!errors.email} autoComplete="off" />
                    </Field>
                  </div>
                  <CustomerIdentityLookup
                    phone={number}
                    email={email}
                    linkedCustomerId={customerId}
                    onUseExisting={useExistingCustomer}
                    onClearLink={() => setCustomerId("")}
                  />
                </Section>

                <Section icon={Smartphone} title="Enquiry" hint="Device, problem and where the lead came from.">
                  <Field label="Device">
                    <DeviceCatalogPicker value={device} onChange={setDevice} />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Issue / problem" className="sm:col-span-2">
                      <Input value={issue} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIssue(e.target.value)} placeholder="e.g. Screen cracked, battery draining" />
                    </Field>
                    <Field label="Source" required error={touched ? errors.source : undefined} hint="Where the enquiry came from — Google, Meta, Reference…">
                      <Select className="h-[38px]" value={source} placeholder="Select source…" options={sourceOptions.map((v) => ({ label: v, value: v }))} onChange={(e) => setSource(e.target.value)} />
                    </Field>
                    <Field label="Capture channel" hint="How it reached you — Phone, Email, Form… (separate from Source).">
                      <Select className="h-[38px]" value={captureChannel} placeholder="Select channel…" options={CAPTURE_CHANNELS.map((v) => ({ label: v, value: v }))} onChange={(e) => setCaptureChannel(e.target.value)} />
                    </Field>
                    <Field label="Region">
                      <Select className="h-[38px]" value={region} placeholder="Select region…" options={regionOptions.map((v) => ({ label: v, value: v }))} onChange={(e) => setRegion(e.target.value)} />
                    </Field>
                    <Field label="Contact status" hint="Keep “Not Contacted” unless you have genuinely spoken to the customer.">
                      <Select className="h-[38px]" value={contactStatus} placeholder="Select status…" options={contactOptions.map((v) => ({ label: v, value: v }))} onChange={(e) => setContactStatus(e.target.value)} />
                    </Field>
                    <Field label={contactStatusClass(contactStatus) === "contacted" ? "Conversation notes" : "Note for the agent (optional)"} required={contactStatusClass(contactStatus) === "contacted"} error={touched ? errors.notes : undefined} className="sm:col-span-2">
                      <Textarea value={notes} rows={2} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the agent should know before calling…" className="w-full rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
                    </Field>
                  </div>
                </Section>
              </div>

              {/* ── RIGHT: who gets it (sticky) ── */}
              <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                <section className="rounded-2xl border border-[#4361EE]/20 bg-gradient-to-b from-[#F5F7FF] to-card p-4 shadow-sm sm:p-5">
                  <header className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#4361EE] text-white"><UserCheck className="h-4.5 w-4.5" /></span>
                      <div>
                        <h3 className="flex items-center gap-1 text-[13px] font-bold uppercase tracking-wider text-foreground">
                          Assign to
                          <InfoHint label="About agent availability">Online/Offline is shown for context only — an agent does not need to be online to receive an assignment.</InfoHint>
                        </h3>
                        <p className="text-[11.5px] text-muted-foreground">Pick the Sales Agent who owns this lead.</p>
                      </div>
                    </div>
                    {selfIsAgent && (
                      <Button type="button" variant={agentId === currentUserId ? "soft" : "outline"} size="sm" className="shrink-0 gap-1 rounded-full" onClick={() => setAgentId(currentUserId!)}>
                        <UserCheck className="h-3.5 w-3.5" /> Me
                      </Button>
                    )}
                  </header>

                  {leadMode.ready && leadMode.isMulti ? (
                    <Field label="Store" required error={touched ? errors.branchId : undefined} className="mb-3">
                      <Select className="h-[38px]" value={storeId} placeholder="Select a store…" options={leadMode.selectableStores.map((s) => ({ label: s.name, value: s.id }))} onChange={(e) => setStoreId(e.target.value)} />
                    </Field>
                  ) : (
                    <div className={cn("mb-3 flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-[12.5px]", errors.branchId ? "border-rose-300 text-rose-700" : "border-border text-foreground")}>
                      <StoreIcon className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" />
                      <span className="font-semibold">{storeLabel || "No store"}</span>
                      <span className="text-muted-foreground">· lead store</span>
                    </div>
                  )}
                  {touched && errors.branchId && leadMode.isSingle && <p role="alert" className="mb-2 text-[11px] font-medium text-rose-600">{errors.branchId}</p>}

                  <div className="mb-2">
                    <Input value={agentQuery} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAgentQuery(e.target.value)} placeholder="Search sales agents…" iconLeft={<Search className="h-3.5 w-3.5" />} />
                  </div>

                  {!salesAgentsReady ? (
                    <p className="py-6 text-center text-[12.5px] text-muted-foreground">Loading Sales Agents…</p>
                  ) : agents.length === 0 ? (
                    <SalesAgentEmptyState storeScoped />
                  ) : (
                    <ul role="listbox" aria-label="Sales Agents" className="max-h-[300px] space-y-1.5 overflow-y-auto pr-0.5">
                      {visibleAgents.map((a) => {
                        const online = onlineIds.has(a.id);
                        const selected = a.id === agentId;
                        const unworked = unworkedLoad.get(a.id) ?? 0;
                        const fu = followUpAgentLoad.get(a.id) ?? 0;
                        return (
                          <li key={a.id}>
                            <button
                              type="button" role="option" aria-selected={selected}
                              onClick={() => setAgentId(a.id)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
                                selected ? "border-[#4361EE] bg-[#EEF1FD] shadow-sm" : "border-border bg-card hover:border-[#4361EE]/40",
                              )}
                            >
                              <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#4361EE]/10 text-[13px] font-bold text-[#4361EE]">
                                {a.name.slice(0, 1).toUpperCase()}
                                <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", online ? "bg-emerald-500" : "bg-zinc-300")} aria-hidden />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-[13px] font-semibold text-foreground">{a.name}</span>
                                  <span className={cn("shrink-0 text-[10px] font-semibold", online ? "text-emerald-700" : "text-zinc-500")}>{online ? "Online" : "Offline"}</span>
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">{a.roleLabel}</span>
                              </span>
                              {canSeeAllLeads && (
                                <span className="flex shrink-0 flex-col items-end gap-0.5 text-[10px] font-semibold tabular-nums">
                                  <span className={cn("rounded-full px-1.5 py-px", unworked > 0 ? "bg-amber-50 text-amber-700" : "bg-zinc-100 text-zinc-500")}>{unworked} new</span>
                                  <span className="rounded-full bg-zinc-100 px-1.5 py-px text-zinc-500">{fu} f/u</span>
                                </span>
                              )}
                              {selected && <Check className="h-4 w-4 shrink-0 text-[#4361EE]" aria-hidden />}
                            </button>
                          </li>
                        );
                      })}
                      {visibleAgents.length === 0 && <li className="py-4 text-center text-[12.5px] text-muted-foreground">No sales agent matches “{agentQuery}”.</li>}
                    </ul>
                  )}
                  {touched && errors.assignedTo && <p role="alert" className="mt-2 text-[11px] font-medium text-rose-600">{errors.assignedTo}</p>}
                </section>

                {/* Live summary: exactly what Save & Assign will do. */}
                <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-live="polite">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><ClipboardList className="h-3.5 w-3.5" /> Summary</p>
                  <dl className="space-y-1.5 text-[12.5px]">
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Lead</dt><dd className="truncate text-right font-semibold">{name.trim() || "—"}{number.trim() ? ` · ${number.trim()}` : ""}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Device</dt><dd className="truncate text-right font-medium">{device.label || pendingSrc?.device || "—"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Source</dt><dd className="truncate text-right font-medium">{[source, captureChannel].filter(Boolean).join(" · ") || "—"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Customer</dt><dd className="text-right font-medium">{customerId ? "Existing — linked" : "New — saved with the lead"}</dd></div>
                  </dl>
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#EEF1FD] px-3 py-2 text-[12px] font-semibold text-[#2B3FB8]">
                    <span className="truncate">{currentUserId ? "You" : "Coordinator"}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{chosenAgent ? `${chosenAgent.name}’s Assigned Leads inbox` : "Select an agent"}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">The assignment is recorded in the lead’s Journey with your name and the exact time.</p>
                </section>
              </aside>
            </div>
          </div>
        )}
      </div>
    </RoxCenteredForm>
  );
}
