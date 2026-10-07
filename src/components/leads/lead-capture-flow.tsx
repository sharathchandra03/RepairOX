"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Quick Lead Capture flow (create + edit).

   A compact, three-stage guided flow optimised for Sales — much faster than
   the Excel sheet, and shorter than Create Ticket / Create Invoice:

     Stage 1  Quick Capture      — register the lead in seconds
     Stage 2  Qualification      — device / issue / estimate (all optional)
     Stage 3  Contact & Result   — follow-up + outcome (context-sensitive)

   Categorical fields use DB-backed configurable dropdowns (from Settings);
   descriptive fields stay free-text / numeric. The same component powers both
   "Add Lead" and "Edit Lead" — one structured form, no duplicate systems.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import {
  X, Check, ChevronRight, ChevronLeft, UserPlus, Search,
  ClipboardList, CalendarClock, AlertCircle, ChevronDown, MapPin, Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { DateTimeField } from "@/components/ui/date-time-picker";
import { useLeads } from "@/lib/leads-context";
import { useSession } from "@/lib/use-session";
import { usePermissions } from "@/lib/permissions-context";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { useLeadStoreMode } from "@/lib/lead-store-mode";
import { CAP, allow } from "@/lib/capabilities";
import {
  emptyLeadDraft, validateLead, needsFollowUp, monthFromDate,
  isNotContactedStatus,
  type Lead, type LeadDraft, type LeadFieldKey,
} from "@/lib/leads-data";
import { isNotQualified } from "@/lib/lead-workflow";
import { AgentPicker, DeviceCatalogPicker, type DeviceSelection } from "@/components/leads/lead-form-fields";
import { CustomerPicker } from "@/components/common/customer-picker";
import { CustomerIdentityLookup } from "@/components/common/customer-identity-lookup";
import { AddCustomerModal } from "@/components/common/add-customer-modal";
import type { Customer } from "@/lib/customer-data";
import { normalizeCustomerPhone, normalizeCustomerEmail } from "@/lib/customer-data";
import { IssueSelector } from "@/components/common/issue-selector";
import { LocationPicker } from "@/components/leads/location-picker";
import { cn } from "@/lib/utils";

/* ─── Configurable select (searchable, options from Settings) ─────────── */

function ConfigurableSelect({
  field, value, onChange, placeholder, extra = [], invalid, options, labelFor,
}: {
  /** Lead-options field; omit when passing an explicit `options` list. */
  field?: LeadFieldKey;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Extra values merged in (e.g. live staff for agent fields, or the lead's
   *  own saved-but-archived value so it still shows). */
  extra?: string[];
  invalid?: boolean;
  /** Explicit option values (bypasses lead options) — e.g. a DB store list. */
  options?: string[];
  /** Map an option value to a display label (e.g. store id → store name). */
  labelFor?: (value: string) => string;
}) {
  const { optionsFor } = useLeads();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const label = (v: string) => (labelFor ? labelFor(v) : v);

  const values = useMemo(() => {
    const base = options ?? (field ? optionsFor(field).map((o) => o.value) : []);
    const merged = Array.from(new Set([...extra, ...base].filter(Boolean)));
    // Keep the currently-selected value visible even if archived.
    if (value && !merged.includes(value)) merged.unshift(value);
    return merged;
  }, [options, optionsFor, field, extra, value]);

  const filtered = query.trim()
    ? values.filter((v) => label(v).toLowerCase().includes(query.trim().toLowerCase()))
    : values;

  // Position the portal panel from the trigger's rect; flip up when there's not
  // enough room below so long lists never get clipped by the modal edge.
  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 280 && r.top > spaceBelow;
    setPos(openUp
      ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 }
      : { left: r.left, width: r.width, top: r.bottom + 4 });
  };

  const toggle = () => {
    if (!open) { place(); scrollTriggerIntoView(triggerRef.current); }
    setOpen((o) => !o);
  };
  const close = () => { setOpen(false); setQuery(""); };

  // Keep the panel glued to the trigger while the modal body scrolls/resizes.
  useEffect(() => {
    if (!open) return;
    const onReflow = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      place();
    };
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={cn(
          "flex h-[38px] w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 text-[13px] transition-all",
          open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : invalid ? "border-rose-300" : "border-input hover:border-[#4361EE]/40",
        )}
      >
        <span className={cn("truncate text-left", !value && "text-muted-foreground")}>{value ? label(value) : (placeholder || "Select…")}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {mounted && open && createPortal(
        <>
          <div className="fixed inset-0 z-[10040]" onClick={close} />
          <div
            ref={panelRef}
            data-lead-popover-open="true"
            style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
            className="fixed z-[10041] overflow-hidden rounded-xl border border-border bg-card shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]"
          >
            {values.length > 6 && (
              <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full bg-transparent text-[13px] outline-none !shadow-none focus-visible:!shadow-none placeholder:text-muted-foreground"
                />
              </div>
            )}
            <div className="max-h-56 overflow-y-auto p-1">
              {value && (
                <button type="button" onClick={() => { onChange(""); close(); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted">
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
              {filtered.length === 0 && <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">{options ? "No matches." : "No options. Add them in Settings."}</p>}
              {filtered.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { onChange(v); close(); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                    v === value ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60",
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5 text-[#4361EE]", v === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{label(v)}</span>
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/** Gently scroll the modal body so the just-focused control is comfortably in
 *  view (used when a dropdown near the bottom is opened). */
function scrollTriggerIntoView(el: HTMLElement | null) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

/* ─── Field primitives ────────────────────────────────────────────────── */

function Field({ label, required, error, children, className }: { label: string; required?: boolean; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="flex items-center gap-1 text-[12px] font-medium text-zinc-700">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="flex items-center gap-1 text-[11px] font-medium text-rose-600"><AlertCircle className="h-3 w-3" /> {error}</p>}
    </div>
  );
}

const inputCls = (invalid?: boolean) =>
  cn(
    // RepairOX Design System v2 canonical field border: `border-input` idle
    // (a touch darker than --border — colour, not thickness), brand-blue focus.
    "h-[38px] w-full rounded-xl border bg-card px-3 text-[13px] outline-none transition-all placeholder:text-muted-foreground",
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-200/40" : "border-input hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15",
  );

/* ─── Stage config ────────────────────────────────────────────────────── */

const STAGES = [
  { id: 1, label: "Customer",      hint: "Who + how to reach" },
  { id: 2, label: "Lead Details",  hint: "Source, mode, agent" },
  { id: 3, label: "Device & Issue", hint: "Device, estimate" },
  { id: 4, label: "Status & Assignment", hint: "Status, priority, store" },
  { id: 5, label: "Review",        hint: "Confirm & save" },
];

/* Subtle horizontal slide + fade for step transitions. `custom` is the
   direction (+1 forward / -1 back): the entering step comes from the side we're
   moving toward, the exiting step leaves the opposite way. No bounce/spring. */
const STEP_TRANSITION = { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const };

/* ─── Main flow ───────────────────────────────────────────────────────── */

export function LeadCaptureFlow({
  open, onClose, editLead, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** When provided, the flow edits this lead instead of creating a new one. */
  editLead?: Lead | null;
  onSaved?: (lead: Lead) => void;
}) {
  if (!open) return null;
  return <FlowInner onClose={onClose} editLead={editLead} onSaved={onSaved} />;
}


function FlowInner({ onClose, editLead, onSaved }: { onClose: () => void; editLead?: Lead | null; onSaved?: (lead: Lead) => void }) {
  const { addLead, updateLead, currentUserIsSalesAgent, isEligibleSalesAgent, salesAgentsReady, salesAgentsFor, canChangeLeadOwner, scheduleFollowUp, openFollowUpsByLead } = useLeads();
  const { id: currentUserId, name: currentUserName } = useSession();
  const { team, can, currentUser } = usePermissions();
  const { customers } = useStore();
  const { activeStoreId, stores, getStore } = useStoreContext();
  // Lead Management Store Mode governs how the lead's store is chosen:
  //   • SINGLE — forced to the org's Default Lead Store; the picker is hidden.
  //   • MULTI  — the user selects from their authorized stores.
  const leadMode = useLeadStoreMode();
  const isEdit = !!editLead;
  const canSaveLead = isEdit ? allow(can, CAP.lead.edit) : allow(can, CAP.lead.create);
  // Who may pick the OWNER: first assignment needs CAP.lead.assign; changing an
  // existing owner needs CAP.lead.reassign. Without it the owner is locked
  // (a Sales Agent creating a lead owns it). The DB guard enforces the same.
  const canPickOwner = isEdit && editLead
    ? canChangeLeadOwner(editLead)
    : allow(can, CAP.lead.assign);
  const canPickFollowUpAgent = allow(can, CAP.lead.followup);

  const [stage, setStage] = useState(1);
  const [dir, setDir] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  /* Location unit field — its placeholder cycles one word per second so the
     user sees each accepted format (Building name → House no → Street name). */
  const UNIT_PLACEHOLDERS = ["Building name", "House no", "Street name"];
  const [unitPlaceholderIdx, setUnitPlaceholderIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setUnitPlaceholderIdx((i) => (i + 1) % UNIT_PLACEHOLDERS.length), 1000);
    return () => clearInterval(t);
  }, []);

  /* Follow-Up due instant (date + EXACT time) as an ISO string. This precise
     instant is what drives the datetime-accurate follow-up notification: on
     save we call scheduleFollowUp({ dueAt }) with it. Seeded on edit from the
     lead's open follow-up (its scheduled_at), else from the flat followUpDate. */
  const [followUpDueAt, setFollowUpDueAt] = useState<string>(() => {
    if (editLead) {
      const open = openFollowUpsByLead.get(editLead.id);
      if (open?.dueAt) return open.dueAt;
      if (editLead.followUpDate) { const d = new Date(`${editLead.followUpDate}T09:00:00`); if (!isNaN(d.getTime())) return d.toISOString(); }
    }
    return "";
  });

  /* ── Single coherent draft state (survives all step changes) ── */
  const [draft, setDraft] = useState<LeadDraft>(() => {
    if (editLead) {
      const { id, leadNo, date, time, month, createdAt, updatedAt, ...rest } = editLead;
      return rest;
    }
    // New lead: the logged-in user becomes the default OWNER only when they are
    // an eligible Sales Agent for this store (IVR / phone capture — no need to
    // search for yourself). Owners/managers who aren't Sales Agents pick one.
    // The lead's STORE comes from the Lead Store Mode:
    //   • SINGLE — the configured Default Lead Store (never the active store);
    //   • MULTI  — the active store, else the creator's home store.
    // leadStoreForNewLead already encodes this (the DB guard enforces the same).
    const storeId = leadMode.leadStoreForNewLead || activeStoreId || currentUser?.branchId || "";
    const selfIsAgent = !!currentUserId && currentUserIsSalesAgent(storeId || null);
    return {
      ...emptyLeadDraft(selfIsAgent ? currentUserName || "" : ""),
      assignedTo: selfIsAgent ? currentUserId || "" : "",
      assignedToName: selfIsAgent ? currentUserName || "" : "",
      branchId: storeId,
    };
  });

  // Lead Store Mode may resolve AFTER the form opens (org settings load async).
  // For a NEW lead in SINGLE mode, keep the draft's store locked to the
  // configured Default Lead Store — the agent never picks it, and it must be
  // correct before Save (the owner is validated against it). Never touches an
  // existing lead's historical store on edit.
  useEffect(() => {
    if (isEdit || !leadMode.ready || !leadMode.isSingle) return;
    const forced = leadMode.leadStoreForNewLead;
    if (forced && draft.branchId !== forced) {
      setDraft((d) => ({ ...d, branchId: forced }));
    }
  }, [isEdit, leadMode.ready, leadMode.isSingle, leadMode.leadStoreForNewLead, draft.branchId]);

  // The Sales Agent directory may finish loading after the form opens — apply
  // the self-default once, only if nobody has been picked yet.
  const selfDefaultApplied = useRef(false);
  useEffect(() => {
    if (isEdit || selfDefaultApplied.current || !salesAgentsReady) return;
    selfDefaultApplied.current = true;
    if (!draft.assignedTo && currentUserId && currentUserIsSalesAgent(draft.branchId || null)) {
      setDraft((d) => ({ ...d, assignedTo: currentUserId, assignedToName: currentUserName || "", agent: currentUserName || "" }));
    }
  }, [isEdit, salesAgentsReady, currentUserId, currentUserName, currentUserIsSalesAgent, draft.assignedTo, draft.branchId]);

  const set = <K extends keyof LeadDraft>(key: K, val: LeadDraft[K]) => setDraft((d) => ({ ...d, [key]: val }));
  const hasPin = draft.locationLat != null && draft.locationLng != null;

  // The owner is REQUIRED whenever one can actually be chosen: the user can pick
  // an owner and the store has Sales Agents, or the user is a Sales Agent
  // themselves. Otherwise the lead may be saved unassigned (a manager assigns
  // it later) — never blocked, and never given to a non-Sales-Agent.
  const storeAgentCount = salesAgentsFor(draft.branchId || null).length;
  const ownerRequired = !salesAgentsReady
    || (canPickOwner ? storeAgentCount > 0 : !!currentUserId && currentUserIsSalesAgent(draft.branchId || null));
  const baseValidation = useMemo(() => validateLead(draft, { requireOwner: ownerRequired }), [draft, ownerRequired]);
  // Owner / follow-up agent must be ELIGIBLE Sales Agents for the lead's store
  // (only checked when they're being set now — historical values are kept).
  const validation = useMemo(() => {
    const errors = { ...baseValidation.errors };
    const store = draft.branchId || null;
    const ownerChanged = !isEdit || (draft.assignedTo || "") !== (editLead?.assignedTo || "");
    if (salesAgentsReady && draft.assignedTo && ownerChanged && !isEligibleSalesAgent(draft.assignedTo, store)) {
      errors.assignedTo = "The owner must be an active Sales Agent who can work this store.";
    }
    const fuChanged = !isEdit || (draft.followUpAgentId || "") !== (editLead?.followUpAgentId || "");
    if (salesAgentsReady && draft.followUpAgentId && fuChanged && !isEligibleSalesAgent(draft.followUpAgentId, store)) {
      errors.followUpAgentId = "The follow-up agent must be an active Sales Agent who can work this store.";
    }
    // ── Lead Store Mode gate (new leads only; never blocks an existing lead) ──
    if (!isEdit && leadMode.ready) {
      if (leadMode.isSingle && leadMode.singleStoreMisconfigured) {
        errors.branchId = "No Default Lead Store is configured. An administrator must set one in Lead Settings before leads can be created.";
      } else if (leadMode.isSingle && leadMode.singleStoreInactive) {
        errors.branchId = "The configured Lead Store is inactive. An administrator must select an active store in Lead Settings.";
      } else if (leadMode.isMulti && !draft.branchId) {
        errors.branchId = "Select the store this lead belongs to.";
      }
    }
    return { ok: Object.keys(errors).length === 0, errors };
  }, [baseValidation, draft.assignedTo, draft.followUpAgentId, draft.branchId, isEdit, editLead?.assignedTo, editLead?.followUpAgentId, salesAgentsReady, isEligibleSalesAgent, leadMode.ready, leadMode.isSingle, leadMode.isMulti, leadMode.singleStoreMisconfigured, leadMode.singleStoreInactive]);
  const showFollowUp = needsFollowUp({ result: draft.result ?? "", status: draft.status ?? "" }) || !!draft.followUpDate;

  /* ── Contact / qualification GATE (progressive data capture) ──
     • Not-Contacted  → downstream qualification/workflow sections are locked
       (the lead is still at initial capture).
     • Not-Qualified  → a MANDATORY reason is required, and downstream sections
       are locked/closed (the lead never entered the operational workflow).
     The Not-Qualified reason is stored in `finalRemarks` (an existing canonical
     field) so it survives to Lead Detail / the Comment column, and is never
     masked to N/A. */
  const notQualified = isNotQualified(draft.qualification ?? "");
  const notContacted = isNotContactedStatus(draft.contactStatus ?? "");
  // Downstream (qualification-dependent) form sections are disabled until the
  // lead is contacted AND not explicitly disqualified.
  const downstreamLocked = notContacted || notQualified;
  // A Not-Qualified lead MUST carry a reason before it can be saved.
  const needsQualificationReason = notQualified;
  const qualificationReasonMissing = needsQualificationReason && !(draft.finalRemarks ?? "").trim();

  /* ── Non-linear navigation ──
     Any step is reachable directly (click the stepper) or via Prev/Next. No
     step is a gate — required-field validation is enforced only at SAVE, so a
     salesperson can fill the form in whatever order the customer talks. */
  const goToStage = (next: number) => {
    const clamped = Math.max(1, Math.min(STAGES.length, next));
    if (clamped === stage) return;
    setDir(clamped >= stage ? 1 : -1);
    setStage(clamped);
  };
  useLayoutEffect(() => { if (bodyRef.current) bodyRef.current.scrollTo({ top: 0 }); }, [stage]);

  /* ── Left/Right arrow-key step navigation ──
     ONLY when the user is NOT actively editing a field. We ignore the keys when
     focus is in an input/textarea/select/contenteditable, or any dropdown/date
     popover is open — so arrows keep their normal text/cursor/list meaning and
     navigation can never mutate a value. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      // A portalled dropdown/date popover open anywhere → let it handle arrows.
      if (document.querySelector('[data-lead-popover-open="true"]')) return;
      // Only when the focus is within the form container (not elsewhere on page).
      if (el && !el.closest('[data-lead-form="true"]') && el !== document.body) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); goToStage(stage - 1); }
      else { e.preventDefault(); goToStage(stage + 1); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stage]);

  /* ── Device selection bridge (draft ⇄ DeviceCatalogPicker) ── */
  const deviceSelection: DeviceSelection = {
    categoryId: draft.deviceCategoryId ?? "",
    brandId: draft.deviceBrandId ?? "",
    modelId: draft.deviceModelId ?? "",
    label: draft.device ?? "",
  };
  const onDeviceChange = (next: DeviceSelection) => {
    setDraft((d) => ({
      ...d,
      deviceCategoryId: next.categoryId,
      deviceBrandId: next.brandId,
      deviceModelId: next.modelId,
      device: next.label || d.device || "",
    }));
  };

  /* ── Customer identity bridge (Customer Master, no duplicates) ──
     Linking a customer to a lead sets ONLY the customer identity (customerId +
     cached name/phone/email/address). It NEVER touches the lead's Sales Agent:
     an existing customer's historical agent is irrelevant to who owns THIS
     lead (RepairOX Customer Identity Standard §6/§85). The owner stays whatever
     the AgentPicker / self-default decided. */
  const linkCustomer = (c: Customer) => {
    setDraft((d) => ({
      ...d,
      customerId: c.id,
      // Explicitly choosing "Use Existing Customer" ADOPTS that customer's
      // identity — so the canonical name/phone/email/address overwrite whatever
      // was typed (the typed name may have been a different spelling / wrong
      // person). Only sales attribution is left untouched (the lead owner).
      name: c.fullName || d.name || "",
      number: c.mobile || d.number || "",
      alternateNumber: c.altMobile || d.alternateNumber || "",
      email: c.email || d.email || "",
      location: c.address || d.location || "",
    }));
  };
  const onCustomerPicked = (cid: string) => {
    if (!cid) { set("customerId", ""); return; }
    const c = customers.find((x) => x.id === cid);
    if (!c) { set("customerId", cid); return; }
    linkCustomer(c);
  };

  /* ── Inline "Create New Customer" from the Lead Form (spec §8/§80/§81) ──
     Opens the CANONICAL Add Customer modal (never a mini lead-only form),
     prefilled with what the salesperson already typed. On create we link the
     new customer_id straight back onto the draft and keep the current owner. */
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const onCustomerCreated = (c: Customer) => {
    setShowCreateCustomer(false);
    linkCustomer(c);
  };

  /* ── Contact-field edit that stays DYNAMIC ──
     Editing Name / Number / Email after a customer was linked means the user is
     now describing a (potentially) DIFFERENT person. If the edited phone/email
     no longer matches the linked customer, auto-UNLINK (clear customerId) so the
     inline lookup re-searches live from what's actually typed — the "Customer
     Found" card can never show a stale, no-longer-matching customer. */
  const setContactField = (key: "name" | "number" | "email", val: string) => {
    setDraft((d) => {
      const next = { ...d, [key]: val };
      if (!d.customerId) return next;
      const linked = customers.find((x) => x.id === d.customerId);
      if (!linked) return next;
      const typedPhone = normalizeCustomerPhone(next.number ?? "");
      const linkedPhone = normalizeCustomerPhone(linked.mobile);
      const linkedAlt = normalizeCustomerPhone(linked.altMobile || "");
      const typedEmail = normalizeCustomerEmail(next.email ?? "");
      const linkedEmail = normalizeCustomerEmail(linked.email);
      // Still the same person if the typed phone (10+ digits) still matches, or
      // (no complete phone yet) the email still matches.
      const phoneMatches = typedPhone.length >= 10 && (typedPhone === linkedPhone || (!!linkedAlt && typedPhone === linkedAlt));
      const emailMatches = !!typedEmail && typedEmail === linkedEmail;
      const stillSame = phoneMatches || (typedPhone.length < 10 && emailMatches);
      if (!stillSame) next.customerId = "";
      return next;
    });
  };

  /* ── Save (create or edit) — the ONLY place validation gates ── */
  const handleSave = async () => {
    setTouched(true);
    // NOT-QUALIFIED gate: a reason is mandatory before saving. Jump to Lead
    // Details (step 2) where the reason field lives.
    if (qualificationReasonMissing) {
      goToStage(2);
      return;
    }
    if (!validation.ok) {
      // Jump to the step holding the first problem (the stepper stays free-form).
      const e = validation.errors;
      goToStage(e.name || e.number || e.email ? 1 : e.source || e.assignedTo ? 2 : e.estimate || e.discount ? 3 : 4);
      return;
    }
    if (!canSaveLead || saving) return;              // permission + double-submit guard
    setSaving(true);
    try {
      // Close ONLY when the save fully landed — a rejected owner / follow-up
      // agent change keeps the form open with the user's input intact.
      let savedLead: Lead | null = null;
      if (isEdit && editLead) {
        const ok = await updateLead(editLead.id, draft as Partial<Lead>);
        if (!ok) return;
        savedLead = { ...editLead, ...(draft as Partial<Lead>) } as Lead;
      } else {
        savedLead = await addLead(draft);
        if (!savedLead) return;
      }

      // Precise follow-up scheduling: when a date+time is set, create/refresh a
      // lead_followup_history record with that EXACT dueAt so the datetime-
      // accurate notification (LeadFollowUpWatcher) fires at that instant. Skip
      // if an open follow-up already carries the same instant (no duplicate).
      if (followUpDueAt) {
        const existingOpen = openFollowUpsByLead.get(savedLead.id);
        const sameInstant = existingOpen && new Date(existingOpen.dueAt).getTime() === new Date(followUpDueAt).getTime();
        if (!sameInstant) {
          await scheduleFollowUp(savedLead.id, {
            dueAt: followUpDueAt,
            followUpUserId: draft.followUpAgentId || undefined,
            followUpUserName: draft.followUpAgent || undefined,
            comments: draft.followUpComments || undefined,
          });
        }
      }

      onSaved?.(savedLead);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  /* ── Derived display bits for Review ── */
  const money = (n: number | null | undefined) => (n == null || n === undefined ? "—" : `₹${Number(n).toLocaleString("en-IN")}`);
  const derivedMonth = monthFromDate(editLead?.date || new Date().toISOString().slice(0, 10));

  const content = (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9998] bg-foreground/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      >
        <div
          data-lead-form="true"
          className="rox-form-panel relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden ring-1 ring-black/10 shadow-[0_32px_80px_-20px_rgba(20,30,80,0.35)]"
          role="dialog" aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/60"><UserPlus className="h-5 w-5" /></span>
              <div>
                <h2 className="font-display text-lg font-bold tracking-tight">{isEdit ? `Edit ${editLead?.leadNo}` : "New Lead"}</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{isEdit ? "Update lead details — Lead ID, date & time stay fixed." : "Capture in any order — jump between steps freely."}</p>
              </div>
            </div>
            <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>

          {/* Clickable stepper (free navigation) */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-5 py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {STAGES.map((s, i) => {
              const done = stage > s.id;
              const activeStep = stage === s.id;
              return (
                <button key={s.id} type="button" onClick={() => goToStage(s.id)} className="flex flex-1 items-center gap-2 text-left" title={s.hint}>
                  <span className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition",
                    done ? "bg-emerald-500 text-white" : activeStep ? "bg-[#4361EE] text-white" : "bg-muted text-muted-foreground",
                  )}>{done ? <Check className="h-3.5 w-3.5" /> : s.id}</span>
                  <span className="hidden min-w-0 md:block">
                    <span className={cn("block truncate text-[12px] font-semibold", activeStep ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                  </span>
                  {i < STAGES.length - 1 && <span className="mx-1 hidden h-px flex-1 bg-border md:block" />}
                </button>
              );
            })}
          </div>

          {/* Body */}
          <div
            ref={bodyRef}
            onFocus={(e) => { const t = e.target as HTMLElement; if (t.matches("input, textarea, select")) scrollTriggerIntoView(t); }}
            className="relative flex-1 overflow-y-auto overflow-x-hidden p-5"
          >
            <motion.div key={stage} initial={{ opacity: 0, x: dir >= 0 ? 20 : -20 }} animate={{ opacity: 1, x: 0 }} transition={STEP_TRANSITION}>

              {/* ── STEP 1 · Customer ── */}
              {stage === 1 && (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
                  {/* Customer lookup + Name share one row at equal (half) width. */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Find existing customer">
                      <CustomerPicker
                        customers={customers}
                        value={draft.customerId || ""}
                        onChange={onCustomerPicked}
                        placeholder="Search name / phone / email…"
                      />
                    </Field>
                    <Field label="Name" required error={touched ? validation.errors.name : undefined}>
                      <input className={inputCls(touched && !!validation.errors.name)} value={draft.name ?? ""} onChange={(e) => setContactField("name", e.target.value)} placeholder="Full name" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Number" required error={touched ? validation.errors.number : undefined}>
                      <input className={inputCls(touched && !!validation.errors.number)} value={draft.number ?? ""} onChange={(e) => setContactField("number", e.target.value)} placeholder="98765 43210" inputMode="tel" />
                    </Field>
                    <Field label="Alternate Number">
                      <input className={inputCls()} value={draft.alternateNumber ?? ""} onChange={(e) => set("alternateNumber", e.target.value)} placeholder="Secondary / office no." inputMode="tel" />
                    </Field>
                  </div>
                  {/* Inline Customer Master identity lookup — searches as the
                      salesperson types the phone/email. Shows "Customer Found"
                      (Use Existing) or "No customer found" (Create New). IDENTITY
                      ONLY — never surfaces or assigns a historical sales agent. */}
                  <CustomerIdentityLookup
                    phone={draft.number ?? ""}
                    email={draft.email ?? ""}
                    linkedCustomerId={draft.customerId || ""}
                    onUseExisting={linkCustomer}
                    onClearLink={() => set("customerId", "")}
                    onCreateNew={() => setShowCreateCustomer(true)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Email" error={touched ? validation.errors.email : undefined}>
                      <input className={inputCls(touched && !!validation.errors.email)} value={draft.email ?? ""} onChange={(e) => setContactField("email", e.target.value)} placeholder="name@email.com" inputMode="email" />
                    </Field>
                    <Field label="Region">
                      <ConfigurableSelect field="region" value={draft.region ?? ""} onChange={(v) => set("region", v)} placeholder="City / area" />
                    </Field>
                  </div>
                  <Field label="Location">
                    <div className="flex items-center gap-2">
                      <input
                        className={cn(inputCls(), "w-36 shrink-0 grow-0")}
                        value={draft.locationUnit ?? ""}
                        onChange={(e) => set("locationUnit", e.target.value)}
                        placeholder={UNIT_PLACEHOLDERS[unitPlaceholderIdx]}
                        aria-label="Building name / House no / Street name"
                      />
                      <input className={cn(inputCls(), "min-w-0 flex-1")} value={draft.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="Address / landmark" />
                      <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setMapOpen(true)}>
                        <MapPin className="h-4 w-4" /> {hasPin ? "Edit pin" : "Map"}
                      </Button>
                    </div>
                    {hasPin && (
                      <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-2.5 py-1.5">
                        <a
                          href={draft.locationMapsUrl || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-medium text-[#4361EE] hover:underline"
                        >
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{draft.locationLat!.toFixed(5)}, {draft.locationLng!.toFixed(5)} · Open in Maps</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setDraft((d) => ({ ...d, locationLat: null, locationLng: null, locationMapsUrl: "" }))}
                          className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-rose-600"
                        >
                          Remove pin
                        </button>
                      </div>
                    )}
                  </Field>
                  <Field label="Contact Status">
                    <ConfigurableSelect field="contactStatus" value={draft.contactStatus ?? ""} onChange={(v) => set("contactStatus", v)} placeholder="Contacted / Not Contacted" />
                  </Field>
                </div>
              )}

              {/* ── STEP 2 · Lead Details ── */}
              {stage === 2 && (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lead Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Source" required error={touched ? validation.errors.source : undefined}>
                      <ConfigurableSelect field="source" value={draft.source ?? ""} onChange={(v) => set("source", v)} placeholder="How did they reach us?" invalid={touched && !!validation.errors.source} />
                    </Field>
                    <Field label="Mode of Contact">
                      <ConfigurableSelect field="modeOfContact" value={draft.modeOfContact ?? ""} onChange={(v) => set("modeOfContact", v)} placeholder="Call / WhatsApp / Email / …" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Agent (owner)" required error={touched ? validation.errors.assignedTo : undefined}>
                      <AgentPicker
                        valueId={draft.assignedTo || ""}
                        storeId={draft.branchId || undefined}
                        onChange={(uid, nm) => setDraft((d) => ({ ...d, assignedTo: uid, assignedToName: nm, agent: nm }))}
                        placeholder={canPickOwner ? "Select the Sales Agent" : "Only an assigner can pick the owner"}
                        invalid={touched && !!validation.errors.assignedTo}
                        disabled={!canPickOwner}
                        fallbackName={editLead?.assignedToName}
                        allowClear={canPickOwner}
                      />
                      {!canPickOwner && !isEdit && !!draft.assignedTo && draft.assignedTo === currentUserId && (
                        <p className="mt-1 text-[10.5px] text-muted-foreground">You own the leads you create.</p>
                      )}
                      {!ownerRequired && !draft.assignedTo && (
                        <p className="mt-1 text-[10.5px] text-muted-foreground">
                          {canPickOwner
                            ? "No Sales Agent is available for this store yet — the lead will be saved unassigned."
                            : "The lead will be saved unassigned — a manager will assign its Sales Agent."}
                        </p>
                      )}
                    </Field>
                    <Field label="Lead Category">
                      <ConfigurableSelect field="qualification" value={draft.qualification ?? ""} onChange={(v) => set("qualification", v)} placeholder="Qualified Lead / Not Qualified Lead" />
                    </Field>
                  </div>
                  {/* NOT-QUALIFIED → mandatory reason. Selecting Not Qualified
                      requires a reason before the lead can be saved; the reason
                      is preserved in Final Remarks (readable in Lead Detail +
                      the Comment column) — never a throwaway UI-only value. */}
                  {notQualified && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-3">
                      <Field label="Why is this lead not qualified?" required error={touched && qualificationReasonMissing ? "A reason is required to mark a lead Not Qualified." : undefined}>
                        <Textarea
                          value={draft.finalRemarks ?? ""}
                          onChange={(e) => set("finalRemarks", e.target.value)}
                          placeholder="e.g. Customer is not looking for a repair…"
                          className={cn("min-h-[64px] text-[13px]", touched && qualificationReasonMissing && "border-rose-400")}
                          autoFocus
                        />
                      </Field>
                      <p className="mt-1.5 text-[11px] text-amber-700">
                        Downstream sales fields (device, value, status, follow-up) stay closed for a Not-Qualified lead. Requalify the lead to reopen the workflow.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Category"><ConfigurableSelect field="category" value={draft.category ?? ""} onChange={(v) => set("category", v)} placeholder="Screen / Battery / …" /></Field>
                    <Field label="Subcategory"><ConfigurableSelect field="subCategory" value={draft.subCategory ?? ""} onChange={(v) => set("subCategory", v)} placeholder="Display / Glass / Battery / …" /></Field>
                  </div>
                  <Field label="Comments">
                    <Textarea value={draft.comments ?? ""} onChange={(e) => set("comments", e.target.value)} placeholder="Notes about this lead…" className="min-h-[70px] text-[13px]" />
                  </Field>
                </div>
              )}

              {/* ── STEP 3 · Device & Issue ── */}
              {stage === 3 && (
                <fieldset disabled={downstreamLocked} className={cn("space-y-4", downstreamLocked && "opacity-60")}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Device &amp; Issue</p>
                  {downstreamLocked && (
                    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5 text-[12px] text-amber-800">
                      {notQualified
                        ? "This lead is Not Qualified — the operational workflow is closed. Requalify to reopen these fields."
                        : "Complete contact to continue lead qualification. Set Contact Status to Contacted first."}
                    </div>
                  )}
                  <Field label="Device">
                    <DeviceCatalogPicker value={deviceSelection} onChange={onDeviceChange} />
                  </Field>
                  <Field label="Issue">
                    <IssueSelector
                      value={draft.issue ?? ""}
                      onChange={(v) => set("issue", v)}
                      placeholder="Search or add issues…"
                      pillClassName="py-0.5"
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Estimate (pipeline value)" error={touched ? validation.errors.estimate : undefined}>
                      <div className="flex">
                        <span className="flex h-[38px] items-center rounded-l-xl border border-r-0 border-input bg-muted px-2.5 text-[12px] font-medium text-zinc-600">₹</span>
                        <input className={cn(inputCls(touched && !!validation.errors.estimate), "rounded-l-none")} value={draft.estimate ?? ""} onChange={(e) => set("estimate", e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="0" inputMode="decimal" />
                      </div>
                    </Field>
                    <Field label="Discount" error={touched ? validation.errors.discount : undefined}>
                      <div className="flex">
                        <input className={cn(inputCls(touched && !!validation.errors.discount), "rounded-r-none")} value={draft.discount ?? ""} onChange={(e) => set("discount", e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="0" inputMode="decimal" />
                        <button type="button"
                          onClick={() => set("discountType", (draft.discountType === "percent" ? "amount" : "percent"))}
                          className="flex h-[38px] min-w-[46px] items-center justify-center rounded-r-xl border border-l-0 border-input bg-muted px-2.5 text-[12px] font-semibold text-zinc-700 transition hover:bg-muted/70"
                          title="Toggle ₹ / %">
                          {draft.discountType === "percent" ? "%" : "₹"}
                        </button>
                      </div>
                    </Field>
                  </div>
                </fieldset>
              )}

              {/* ── STEP 4 · Status & Assignment ── */}
              {stage === 4 && (
                <fieldset disabled={downstreamLocked} className={cn("space-y-4", downstreamLocked && "opacity-60")}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status &amp; Assignment</p>
                  {downstreamLocked && (
                    <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5 text-[12px] text-amber-800">
                      {notQualified
                        ? "This lead is Not Qualified — status, follow-up and workflow are closed. Requalify to reopen them."
                        : "Complete contact to unlock status, follow-up and workflow. Set Contact Status to Contacted first."}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Lead Nature"><ConfigurableSelect field="leadNature" value={draft.leadNature ?? ""} onChange={(v) => set("leadNature", v)} placeholder="Hot / Warm / Cold" /></Field>
                    <Field label="Lead Priority"><ConfigurableSelect field="priority" value={draft.priority ?? ""} onChange={(v) => set("priority", v)} placeholder="Normal / High / Urgent" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Lead Status"><ConfigurableSelect field="status" value={draft.status ?? ""} onChange={(v) => set("status", v)} placeholder="Lifecycle stage" /></Field>
                    {/* ── Store · Lead Store Mode aware ──
                        SINGLE mode: a NON-editable context indicator (the store
                        is set in Lead Settings; the agent never picks it).
                        MULTI mode: a selector limited to the user's authorized
                        stores. On EDIT, the store stays shown read-only so the
                        historical lead store is never silently changed. */}
                    {leadMode.isSingle || isEdit ? (
                      <Field label={isEdit ? "Store" : "Lead Store"}>
                        <div className="flex h-[38px] items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 text-[13px] font-medium text-foreground">
                          <Store className="h-3.5 w-3.5 text-[#4361EE]" />
                          <span className="truncate">
                            {getStore(draft.branchId)?.name
                              || leadMode.defaultStore?.name
                              || (leadMode.singleStoreMisconfigured ? "No Lead Store set" : "—")}
                          </span>
                        </div>
                      </Field>
                    ) : (
                      <Field label="Store" error={touched ? validation.errors.branchId : undefined}>
                        <ConfigurableSelect
                          options={leadMode.selectableStores.map((s) => s.id)}
                          labelFor={(id) => getStore(id)?.name || id}
                          value={draft.branchId ?? ""}
                          onChange={(v) => set("branchId", v)}
                          placeholder="Select a store…"
                        />
                      </Field>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Result"><ConfigurableSelect field="result" value={draft.result ?? ""} onChange={(v) => set("result", v)} placeholder="Latest outcome" /></Field>
                    <Field label="Final Result"><ConfigurableSelect field="finalResult" value={draft.finalResult ?? ""} onChange={(v) => set("finalResult", v)} placeholder="Terminal outcome (only when closed)" /></Field>
                  </div>

                  <div className={cn("rounded-2xl border p-4 transition", showFollowUp ? "border-[#B3BFF6] bg-[#EEF1FD]/50" : "border-dashed border-border bg-muted/30")}>
                    <div className="mb-3 flex items-center gap-2">
                      <CalendarClock className={cn("h-4 w-4", showFollowUp ? "text-[#4361EE]" : "text-muted-foreground")} />
                      <p className={cn("text-[12px] font-semibold", showFollowUp ? "text-[#4361EE]" : "text-muted-foreground")}>Follow-Up</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Follow-Up Date &amp; Time" error={touched ? validation.errors.followUpDate : undefined}>
                        <DateTimeField
                          value={followUpDueAt}
                          onChange={(iso) => { setFollowUpDueAt(iso); set("followUpDate", iso ? iso.slice(0, 10) : ""); }}
                          title="Follow-Up Date & Time"
                          placeholder="Pick date & time"
                          invalid={touched && !!validation.errors.followUpDate}
                        />
                      </Field>
                      <Field label="Follow-Up Agent" error={touched ? validation.errors.followUpAgentId : undefined}>
                        <AgentPicker
                          valueId={draft.followUpAgentId || ""}
                          storeId={draft.branchId || undefined}
                          onChange={(uid, nm) => setDraft((d) => ({ ...d, followUpAgentId: uid, followUpAgent: nm }))}
                          placeholder="Sales Agent (may differ from owner)"
                          invalid={touched && !!validation.errors.followUpAgentId}
                          disabled={!canPickFollowUpAgent}
                          fallbackName={editLead?.followUpAgent}
                        />
                      </Field>
                    </div>
                    <Field label="Follow-Up Comments" className="mt-3">
                      <Textarea value={draft.followUpComments ?? ""} onChange={(e) => set("followUpComments", e.target.value)} placeholder="What to do next…" className="min-h-[60px] text-[13px]" />
                    </Field>
                  </div>

                  <Field label="Final Remarks">
                    <Textarea value={draft.finalRemarks ?? ""} onChange={(e) => set("finalRemarks", e.target.value)} placeholder="Closing notes…" className="min-h-[60px] text-[13px]" />
                  </Field>
                </fieldset>
              )}

              {/* ── STEP 5 · Review ── (reflects the form state; no duplicate inputs) */}
              {stage === 5 && (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Review &amp; Save</p>
                  {!validation.ok && (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Some required fields need attention: {Object.values(validation.errors).filter(Boolean).join(" ")} <button type="button" className="font-semibold underline" onClick={() => goToStage(1)}>Fix</button></span>
                    </div>
                  )}
                  <ReviewGroup title="Customer" onEdit={() => goToStage(1)} rows={[
                    ["Name", draft.name], ["Number", draft.number], ["Alternate Number", draft.alternateNumber],
                    ["Email", draft.email], ["Region", draft.region],
                    ["Location", [draft.locationUnit, draft.location].filter(Boolean).join(", ")],
                    ["Map pin", hasPin ? `${draft.locationLat!.toFixed(5)}, ${draft.locationLng!.toFixed(5)}` : ""],
                    ["Contact Status", draft.contactStatus],
                    ["Customer Master", draft.customerId ? "Linked" : "New / unlinked"],
                  ]} />
                  <ReviewGroup title="Lead Details" onEdit={() => goToStage(2)} rows={[
                    ["Source", draft.source], ["Mode of Contact", draft.modeOfContact],
                    ["Agent (owner)", draft.assignedToName], ["Lead Category", draft.qualification],
                    ["Category", draft.category], ["Subcategory", draft.subCategory],
                    ["Comments", draft.comments],
                  ]} />
                  <ReviewGroup title="Device & Issue" onEdit={() => goToStage(3)} rows={[
                    ["Device", draft.device], ["Issue", draft.issue],
                    ["Estimate", money(draft.estimate)],
                    ["Discount", draft.discount == null ? "—" : draft.discountType === "percent" ? `${draft.discount}%` : money(draft.discount)],
                  ]} />
                  <ReviewGroup title="Status & Assignment" onEdit={() => goToStage(4)} rows={[
                    ["Lead Nature", draft.leadNature], ["Lead Priority", draft.priority],
                    ["Lead Status", draft.status], ["Store", getStore(draft.branchId)?.name || ""],
                    ["Result", draft.result], ["Final Result", draft.finalResult],
                    ["Follow-Up Date & Time", followUpDueAt ? new Date(followUpDueAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : ""], ["Follow-Up Agent", draft.followUpAgent],
                    ["Follow-Up Comments", draft.followUpComments], ["Final Remarks", draft.finalRemarks],
                  ]} />
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-zinc-600">System-generated:</span> Lead ID, Date &amp; Time on create · Month ({isEdit ? editLead?.month : derivedMonth}) is derived from the date — never typed.
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-border p-4">
            <div>
              {stage > 1 && (
                <Button variant="ghost" size="sm" className="gap-1" onClick={() => goToStage(stage - 1)}><ChevronLeft className="h-4 w-4" /> Previous</Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              {stage < STAGES.length ? (
                <>
                  {!isEdit && (
                    <Button variant="soft" size="sm" loading={saving} disabled={saving} onClick={handleSave}>Save now</Button>
                  )}
                  <Button size="sm" className="gap-1" onClick={() => goToStage(stage + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
                </>
              ) : (
                <Button size="sm" className="gap-1.5" loading={saving} disabled={saving || !canSaveLead || qualificationReasonMissing} onClick={handleSave}>
                  <Check className="h-4 w-4" /> {isEdit ? "Save changes" : "Create lead"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <LocationPicker
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        initial={hasPin ? { lat: draft.locationLat!, lng: draft.locationLng!, address: draft.location } : null}
        onPick={(loc) => setDraft((d) => ({
          ...d,
          locationLat: loc.lat,
          locationLng: loc.lng,
          locationMapsUrl: loc.mapsUrl,
          // Always use the newly picked address when the user explicitly confirms
          // a pin (first time or re-pin). Fall back to the existing text only if
          // the picker returned no address (e.g. reverse-geocode failed).
          location: loc.address?.trim() ? loc.address : d.location ?? "",
        }))}
      />

      {/* Create a NEW Customer Master record from the Lead Form (canonical
          modal, prefilled with the typed identity). On create we link the new
          customer_id to the draft; the lead's Sales Agent is unchanged. */}
      <AddCustomerModal
        isOpen={showCreateCustomer}
        onClose={() => setShowCreateCustomer(false)}
        onCustomerCreated={onCustomerCreated}
        title="New Customer"
        description="Create the customer, then continue the lead."
        defaultData={{
          firstName: (draft.name ?? "").split(" ")[0] || "",
          lastName: (draft.name ?? "").split(" ").slice(1).join(" "),
          mobile: draft.number ?? "",
          altMobile: draft.alternateNumber ?? "",
          email: draft.email ?? "",
          // A customer created from the Lead Form originated in Sales.
          captureSource: "lead",
          source: "sales",
        }}
      />
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(<AnimatePresence>{content}</AnimatePresence>, document.body);
}

/* ─── Review group (read-only reflection of the draft; edit jumps to step) ── */
function ReviewGroup({ title, rows, onEdit }: { title: string; rows: [string, string | null | undefined][]; onEdit: () => void }) {
  const filled = rows.filter(([, v]) => v != null && String(v).trim() !== "" && v !== "—");
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h4>
        <button type="button" onClick={onEdit} className="text-[11px] font-medium text-[#4361EE] hover:underline">Edit</button>
      </div>
      {filled.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">Nothing entered.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {filled.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="truncate text-[13px] text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
