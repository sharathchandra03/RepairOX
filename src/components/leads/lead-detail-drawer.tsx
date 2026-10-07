"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Detail drawer (view + inline edit).

   Default: a polished, scannable grouped detail view. Clicking "Edit" turns the
   editable fields into inputs / configurable dropdowns IN THE SAME DRAWER — no
   second edit page. Any change reveals "Save Changes" (validate → updateLead →
   back to read mode). Cancel discards and restores saved values.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import {
  Pencil, Trash2, Phone, Mail, MessageSquare, CalendarClock, Check, X,
  User, Tag, Wrench, ClipboardCheck, Flag, UserCheck, ChevronDown, Search, MapPin, Eye,
} from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { cn, formatINR } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import {
  followUpState, followUpTone, validateLead,
  type Lead, type LeadFieldKey,
} from "@/lib/leads-data";
import { priorityTone, statusTone } from "@/components/leads/lead-pills";
import { LeadFollowUpHistory } from "@/components/leads/lead-followup-history";
import { LeadJourneyTimeline } from "@/components/leads/lead-journey-timeline";
import { LeadDealPanel } from "@/components/deals/lead-deal-panel";
import { AssignMenu, AssignBadge, useCanAssignLeads } from "@/components/leads/lead-assign";
import { AgentPicker } from "@/components/leads/lead-form-fields";
import { LeadOperationsPanel } from "@/components/leads/lead-operations-panel";
import { IssueSelector } from "@/components/common/issue-selector";
import { parseIssueString } from "@/lib/issue-library";

function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function Cell({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  const empty = children === "" || children == null || children === "—";
  return (
    <div className={cn(wide && "col-span-2")}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-[13px] font-medium", empty ? "text-zinc-300" : "text-zinc-800")}>{empty ? "—" : children}</p>
    </div>
  );
}

/* Issue is stored as a comma-separated string; render each issue as a pill so
   the View surface matches the capture form (never a raw comma string). */
function IssueCell({ value }: { value: string }) {
  const issues = parseIssueString(value || "");
  return (
    <div className="col-span-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Issue</p>
      {issues.length === 0 ? (
        <p className="mt-0.5 text-[13px] font-medium text-zinc-300">—</p>
      ) : (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {issues.map((issue) => (
            <span
              key={issue}
              className="inline-flex items-center rounded-full bg-[#EEF1FD] px-2.5 py-0.5 text-[12px] font-medium text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/40"
            >
              {issue}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Inline edit primitives ── */

const editInput = (invalid?: boolean) =>
  cn(
    "h-9 w-full rounded-lg border bg-card px-2.5 text-[13px] outline-none transition",
    invalid ? "border-rose-300 focus:ring-2 focus:ring-rose-200/40" : "border-border focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15",
  );

function EditField({ label, wide, error, children }: { label: string; wide?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1", wide && "col-span-2")}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
      {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  );
}

/** Compact configurable dropdown for inline editing — reads Lead Settings
 *  options + merges the current value + optional extra staff names. */
function EditSelect({ field, value, onChange, extra = [] }: { field: LeadFieldKey; value: string; onChange: (v: string) => void; extra?: string[] }) {
  const { optionsFor } = useLeads();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const values = useMemo(() => {
    const merged = Array.from(new Set([...extra, ...optionsFor(field).map((o) => o.value)].filter(Boolean)));
    if (value && !merged.includes(value)) merged.unshift(value);
    return merged;
  }, [optionsFor, field, extra, value]);
  const filtered = q.trim() ? values.filter((v) => v.toLowerCase().includes(q.trim().toLowerCase())) : values;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={cn("flex h-9 w-full items-center justify-between gap-2 rounded-lg border bg-card px-2.5 text-[13px] transition", open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : "border-border")}>
        <span className={cn("truncate text-left", !value && "text-muted-foreground")}>{value || "Select…"}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[10000]" onClick={() => { setOpen(false); setQ(""); }} />
          <div className="absolute left-0 top-full z-[10001] mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            {values.length > 6 && (
              <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full bg-transparent text-[12px] outline-none" />
              </div>
            )}
            <div className="max-h-48 overflow-y-auto p-1">
              {value && <button onClick={() => { onChange(""); setOpen(false); setQ(""); }} className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[12px] text-muted-foreground hover:bg-muted"><X className="h-3 w-3" /> Clear</button>}
              {filtered.length === 0 && <p className="px-2 py-2 text-center text-[12px] text-muted-foreground">No options.</p>}
              {filtered.map((v) => (
                <button key={v} onClick={() => { onChange(v); setOpen(false); setQ(""); }} className={cn("flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[12px] transition", v === value ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60")}>
                  <Check className={cn("h-3 w-3 text-[#4361EE]", v === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{v}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── EditableSection ─────────────────────────────────────────────────────
   A self-contained detail section that can be edited IN PLACE. Header shows the
   title + a small "Edit" button (permission-gated). When editing, the section
   swaps its read-only cells for edit fields and shows its own Save / Cancel —
   it saves ONLY its own fields via updateLead. Every section works this way, so
   the whole record is editable section-by-section without a global edit mode. */
function EditableSection({
  icon: Icon, title, canEdit, lead, fields, renderView, renderEdit, validate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  canEdit: boolean;
  lead: Lead;
  /** The lead keys this section owns (only these are saved). */
  fields: (keyof Lead)[];
  renderView: () => React.ReactNode;
  renderEdit: (draft: Lead, set: <K extends keyof Lead>(k: K, v: Lead[K]) => void, errors: Partial<Record<keyof Lead, string>>) => React.ReactNode;
  /** Optional per-section validation gate. */
  validate?: (draft: Lead) => boolean;
}) {
  const { updateLead } = useLeads();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Lead>(lead);

  // Re-sync when the underlying lead changes and we're NOT editing.
  useEffect(() => { if (!editing) setDraft(lead); }, [lead, editing]);

  const set = <K extends keyof Lead>(k: K, v: Lead[K]) => setDraft((d) => ({ ...d, [k]: v }));
  // Section quick-edits never change ownership (that's the Assignment control),
  // so the owner requirement doesn't gate unrelated sections of legacy leads.
  const errors = validateLead(draft, { requireOwner: false }).errors;
  const okToSave = validate ? validate(draft) : true;
  const dirty = fields.some((k) => draft[k] !== lead[k]);

  const save = async () => {
    if (!okToSave) return;
    setSaving(true);
    try {
      const updates: Partial<Lead> = {};
      fields.forEach((k) => { if (draft[k] !== lead[k]) (updates as any)[k] = draft[k]; });
      if (Object.keys(updates).length > 0) await updateLead(lead.id, updates);
      setEditing(false);
    } finally { setSaving(false); }
  };
  const cancel = () => { setDraft(lead); setEditing(false); };

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Icon className="h-3.5 w-3.5" /></span>
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-600">{title}</h3>
        </div>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" onClick={cancel}>Cancel</Button>
            <Button size="sm" className="h-7 gap-1 px-2.5 text-[12px]" loading={saving} disabled={!dirty || !okToSave} onClick={save}>
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        ) : (
          canEdit && (
            <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {editing ? renderEdit(draft, set, errors) : renderView()}
      </div>
    </section>
  );
}

export function LeadDetailDrawer({
  lead, open, onClose, onEdit, onDelete, readOnly = false,
}: {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  /** Retained for the list's More-menu "Edit" which opens the full 3-stage flow. */
  onEdit: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
  /** OWNER "view as agent" read-only mode — every section is read-only, and
   *  the Delete / Open Full Form / reassign controls are hidden. */
  readOnly?: boolean;
}) {
  const canAssign = useCanAssignLeads() && !readOnly;
  const { can } = usePermissions();
  const canEdit = allow(can, CAP.lead.edit) && !readOnly;
  const canFollowUp = allow(can, CAP.lead.followup) && !readOnly;

  if (!lead) return null;

  const fu = followUpState(lead.followUpDate);
  const fuTone = followUpTone(fu).chip;
  const money = (n: number | null) => (n == null ? "—" : formatINR(n));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={lead.name || "Lead"}
      subtitle={`${lead.leadNo}${lead.number ? ` · ${lead.number}` : ""}`}
      icon={User}
      width="max-w-xl"
      footer={
        <div className="flex items-center justify-between">
          {!readOnly ? (
            <Can permission={CAP.lead.delete}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-rose-600 hover:bg-rose-50" onClick={() => onDelete(lead)}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </Can>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
              <Eye className="h-3.5 w-3.5" /> Read-only
            </span>
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            {!readOnly && (
              <Can permission={CAP.lead.edit}>
                <Button size="sm" className="gap-1.5" onClick={() => onEdit(lead)}><Pencil className="h-4 w-4" /> Open Full Form</Button>
              </Can>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Header summary */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={lead.name || lead.leadNo} size={44} />
            <div>
              <p className="font-display text-base font-bold">{lead.name || "—"}</p>
              <p className="text-[12px] text-muted-foreground">{lead.qualification || lead.source || "Lead"}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {lead.status && <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", statusTone(lead.status))}>{lead.status}</span>}
            {lead.priority && <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", priorityTone(lead.priority))}><Flag className="h-3 w-3" fill="currentColor" /> {lead.priority}</span>}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2">
          {lead.number && <a href={`tel:${lead.number}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2 text-[12px] font-medium text-zinc-700 transition hover:bg-emerald-50 hover:text-emerald-700"><Phone className="h-3.5 w-3.5" /> Call</a>}
          {lead.number && <a href={`https://wa.me/${lead.number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2 text-[12px] font-medium text-zinc-700 transition hover:bg-green-50 hover:text-green-700"><MessageSquare className="h-3.5 w-3.5" /> WhatsApp</a>}
          {lead.email && <a href={`mailto:${lead.email}`} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2 text-[12px] font-medium text-zinc-700 transition hover:bg-sky-50 hover:text-sky-700"><Mail className="h-3.5 w-3.5" /> Email</a>}
        </div>

        {/* Follow-up banner */}
        {lead.followUpDate && (
          <div className={cn("flex items-center justify-between rounded-2xl px-4 py-3 ring-1 ring-inset", fuTone)}>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              <div>
                <p className="text-[12px] font-semibold">{fu === "overdue" ? "Follow-up overdue" : fu === "today" ? "Follow-up today" : "Upcoming follow-up"}</p>
                <p className="text-[11px] opacity-80">{lead.followUpDate}{lead.followUpAgent ? ` · ${lead.followUpAgent}` : ""}</p>
              </div>
            </div>
          </div>
        )}

        {/* Fulfilment & operations — routing + store/field hand-off (own inline actions) */}
        <LeadOperationsPanel lead={lead} readOnly={readOnly} />

        {/* Assignment — reassign inline via the AssignMenu */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><UserCheck className="h-3.5 w-3.5" /></span>
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-600">Assignment</h3>
            </div>
            {canAssign && <AssignMenu lead={lead} />}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="col-span-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Assigned To</p>
              <div className="mt-1"><AssignBadge lead={lead} size={24} /></div>
            </div>
            <Cell label="Assigned By">{lead.assignedByName}</Cell>
            <Cell label="Assigned Date">{formatDateTime(lead.assignedAt)}</Cell>
          </div>
        </section>

        {/* ── Contact (inline editable) ── */}
        <EditableSection
          icon={User} title="Contact" canEdit={canEdit} lead={lead}
          fields={["name", "number", "email", "locationUnit", "location"]}
          validate={(d) => validateLead(d, { requireOwner: false }).ok}
          renderView={() => (
            <>
              <Cell label="Name">{lead.name}</Cell>
              <Cell label="Number">{lead.number}</Cell>
              <Cell label="Email">{lead.email}</Cell>
              {lead.locationUnit && <Cell label="Door / Flat No.">{lead.locationUnit}</Cell>}
              <Cell label="Location">{lead.location}</Cell>
              {lead.locationLat != null && lead.locationLng != null && (
                <Cell label="Map pin" wide>
                  <a
                    href={lead.locationMapsUrl || `https://www.google.com/maps?q=${lead.locationLat},${lead.locationLng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-[#4361EE] hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {lead.locationLat.toFixed(5)}, {lead.locationLng.toFixed(5)} · Open in Maps
                  </a>
                </Cell>
              )}
            </>
          )}
          renderEdit={(draft, set, errors) => (
            <>
              <EditField label="Name" error={errors.name}><input className={editInput(!!errors.name)} value={draft.name} onChange={(e) => set("name", e.target.value)} /></EditField>
              <EditField label="Number" error={errors.number}><input className={editInput(!!errors.number)} value={draft.number} onChange={(e) => set("number", e.target.value)} inputMode="tel" /></EditField>
              <EditField label="Email" error={errors.email}><input className={editInput(!!errors.email)} value={draft.email} onChange={(e) => set("email", e.target.value)} inputMode="email" /></EditField>
              <EditField label="Door / Flat No."><input className={editInput()} value={draft.locationUnit} onChange={(e) => set("locationUnit", e.target.value)} placeholder="Door / Flat / House no." /></EditField>
              <EditField label="Location"><input className={editInput()} value={draft.location} onChange={(e) => set("location", e.target.value)} /></EditField>
            </>
          )}
        />

        {/* ── Lead (inline editable; system fields stay read-only) ── */}
        <EditableSection
          icon={Tag} title="Lead" canEdit={canEdit} lead={lead}
          fields={["region", "source", "qualification", "leadNature", "priority"]}
          renderView={() => (
            <>
              <Cell label="Lead ID">{lead.leadNo}</Cell>
              <Cell label="Date">{lead.date}{lead.time ? ` · ${lead.time}` : ""}</Cell>
              <Cell label="Month">{lead.month}</Cell>
              <Cell label="Region">{lead.region}</Cell>
              <Cell label="Source">{lead.source}</Cell>
              {/* AGENTS = the owner (a Sales Agent user) — changed only via Assignment. */}
              <Cell label="Agent (owner)">{lead.assignedToName || lead.agent}</Cell>
              {/* LEAD CATEGORY = qualification (Qualified / Not Qualified). */}
              <Cell label="Lead Category">{lead.qualification}</Cell>
              <Cell label="Lead Nature">{lead.leadNature}</Cell>
              <Cell label="Priority">{lead.priority}</Cell>
            </>
          )}
          renderEdit={(draft, set) => (
            <>
              <Cell label="Lead ID">{lead.leadNo}</Cell>
              <Cell label="Date">{lead.date}{lead.time ? ` · ${lead.time}` : ""}</Cell>
              <EditField label="Region"><EditSelect field="region" value={draft.region} onChange={(v) => set("region", v)} /></EditField>
              <EditField label="Source"><EditSelect field="source" value={draft.source} onChange={(v) => set("source", v)} /></EditField>
              <Cell label="Agent (owner)">{lead.assignedToName || lead.agent}</Cell>
              <EditField label="Lead Category"><EditSelect field="qualification" value={draft.qualification} onChange={(v) => set("qualification", v)} /></EditField>
              <EditField label="Lead Nature"><EditSelect field="leadNature" value={draft.leadNature} onChange={(v) => set("leadNature", v)} /></EditField>
              <EditField label="Priority"><EditSelect field="priority" value={draft.priority} onChange={(v) => set("priority", v)} /></EditField>
            </>
          )}
        />

        {/* ── Repair / Sales (inline editable) ── */}
        <EditableSection
          icon={Wrench} title="Repair / Sales Details" canEdit={canEdit} lead={lead}
          fields={["device", "category", "issue", "estimate", "discount", "comments"]}
          validate={(d) => validateLead(d, { requireOwner: false }).ok}
          renderView={() => (
            <>
              <Cell label="Device">{lead.device}</Cell>
              <Cell label="Category">{lead.category}</Cell>
              <IssueCell value={lead.issue} />
              <Cell label="Estimate">{money(lead.estimate)}</Cell>
              <Cell label="Discount">{money(lead.discount)}</Cell>
              <Cell label="Comments" wide>{lead.comments}</Cell>
            </>
          )}
          renderEdit={(draft, set, errors) => (
            <>
              <EditField label="Device"><EditSelect field="device" value={draft.device} onChange={(v) => set("device", v)} /></EditField>
              <EditField label="Category"><EditSelect field="category" value={draft.category} onChange={(v) => set("category", v)} /></EditField>
              <EditField label="Issue" wide><IssueSelector value={draft.issue ?? ""} onChange={(v) => set("issue", v)} placeholder="Search or add issues…" pillClassName="py-0.5" /></EditField>
              <EditField label="Estimate" error={errors.estimate}><input className={editInput(!!errors.estimate)} value={draft.estimate ?? ""} onChange={(e) => set("estimate", e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")))} inputMode="decimal" /></EditField>
              <EditField label="Discount" error={errors.discount}><input className={editInput(!!errors.discount)} value={draft.discount ?? ""} onChange={(e) => set("discount", e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")))} inputMode="decimal" /></EditField>
              <EditField label="Comments" wide><textarea className={cn(editInput(), "h-auto min-h-[64px] py-2")} value={draft.comments} onChange={(e) => set("comments", e.target.value)} /></EditField>
            </>
          )}
        />

        {/* ── Contact & Follow-Up (inline editable) ── */}
        <EditableSection
          icon={ClipboardCheck} title="Contact & Follow-Up" canEdit={canEdit} lead={lead}
          fields={["contactStatus", "status", "followUpDate", "followUpAgentId", "followUpAgent", "followUpComments"]}
          validate={(d) => validateLead(d, { requireOwner: false }).ok}
          renderView={() => (
            <>
              <Cell label="Contact Status">{lead.contactStatus}</Cell>
              <Cell label="Status">{lead.status}</Cell>
              <Cell label="Follow-Up Date">{lead.followUpDate}</Cell>
              <Cell label="Follow-Up Agent">{lead.followUpAgent}</Cell>
              <Cell label="Follow-Up Comments" wide>{lead.followUpComments}</Cell>
            </>
          )}
          renderEdit={(draft, set, errors) => (
            <>
              <EditField label="Contact Status"><EditSelect field="contactStatus" value={draft.contactStatus} onChange={(v) => set("contactStatus", v)} /></EditField>
              <EditField label="Status"><EditSelect field="status" value={draft.status} onChange={(v) => set("status", v)} /></EditField>
              <EditField label="Follow-Up Date" error={errors.followUpDate}><input type="date" className={editInput(!!errors.followUpDate)} value={draft.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} /></EditField>
              <EditField label="Follow-Up Agent">
                {/* Follow-up responsibility is a Sales Agent USER ID (separate from the owner). */}
                <AgentPicker
                  valueId={draft.followUpAgentId}
                  storeId={lead.branchId || undefined}
                  fallbackName={lead.followUpAgent}
                  disabled={!canFollowUp}
                  placeholder="Sales Agent (may differ from owner)"
                  onChange={(uid, nm) => { set("followUpAgentId", uid); set("followUpAgent", nm); }}
                />
              </EditField>
              <EditField label="Follow-Up Comments" wide><textarea className={cn(editInput(), "h-auto min-h-[56px] py-2")} value={draft.followUpComments} onChange={(e) => set("followUpComments", e.target.value)} /></EditField>
            </>
          )}
        />

        {/* ── Deal / discount approval (only when a Deal exists) ── */}
        <LeadDealPanel lead={lead} />

        {/* ── Structured follow-up history + ownership history ── */}
        <LeadFollowUpHistory lead={lead} readOnly={readOnly} />

        {/* ── Full customer/sales journey ── */}
        <LeadJourneyTimeline lead={lead} />

        {/* ── Result (inline editable) ── */}
        <EditableSection
          icon={Flag} title="Result" canEdit={canEdit} lead={lead}
          fields={["result", "finalResult", "finalRemarks"]}
          renderView={() => (
            <>
              <Cell label="Result">{lead.result}</Cell>
              <Cell label="Final Result">{lead.finalResult}</Cell>
              <Cell label="Final Remarks" wide>{lead.finalRemarks}</Cell>
            </>
          )}
          renderEdit={(draft, set) => (
            <>
              <EditField label="Result"><EditSelect field="result" value={draft.result} onChange={(v) => set("result", v)} /></EditField>
              <EditField label="Final Result"><EditSelect field="finalResult" value={draft.finalResult} onChange={(v) => set("finalResult", v)} /></EditField>
              <EditField label="Final Remarks" wide><textarea className={cn(editInput(), "h-auto min-h-[56px] py-2")} value={draft.finalRemarks} onChange={(e) => set("finalRemarks", e.target.value)} /></EditField>
            </>
          )}
        />
      </div>
    </Drawer>
  );
}
