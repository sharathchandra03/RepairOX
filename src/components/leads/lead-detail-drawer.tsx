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
  User, Tag, Wrench, ClipboardCheck, Flag, UserCheck, ChevronDown, Search,
} from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Can } from "@/components/common/can";
import { cn, formatINR } from "@/lib/utils";
import { useLeads } from "@/lib/leads-context";
import {
  followUpState, followUpTone, validateLead,
  type Lead, type LeadFieldKey,
} from "@/lib/leads-data";
import { priorityTone, statusTone } from "@/components/leads/lead-pills";
import { AssignMenu, AssignBadge, useCanAssignLeads } from "@/components/leads/lead-assign";

function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Icon className="h-3.5 w-3.5" /></span>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-600">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </section>
  );
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

export function LeadDetailDrawer({
  lead, open, onClose, onEdit, onDelete,
}: {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  /** Retained for the list's More-menu "Edit" which opens the full 3-stage flow. */
  onEdit: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
}) {
  const canAssign = useCanAssignLeads();
  const { updateLead } = useLeads();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Lead | null>(lead);

  // Sync the draft whenever a different lead opens (or realtime updates it).
  useEffect(() => { setDraft(lead); setEditing(false); }, [lead?.id]);
  // While NOT editing, keep the draft mirrored to live lead updates.
  useEffect(() => { if (!editing) setDraft(lead); }, [lead, editing]);

  if (!lead || !draft) return null;

  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(lead);
  const validation = validateLead(draft);
  const set = <K extends keyof Lead>(k: K, v: Lead[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const fu = followUpState(lead.followUpDate);
  const fuTone = followUpTone(fu).chip;
  const money = (n: number | null) => (n == null ? "—" : formatINR(n));

  const handleSave = async () => {
    if (!validation.ok) return;
    setSaving(true);
    try {
      // Only send changed business fields.
      const updates: Partial<Lead> = {};
      (Object.keys(draft) as (keyof Lead)[]).forEach((k) => {
        if (draft[k] !== lead[k]) (updates as any)[k] = draft[k];
      });
      await updateLead(lead.id, updates);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };
  const handleCancel = () => { setDraft(lead); setEditing(false); };

  return (
    <Drawer
      open={open}
      onClose={editing ? handleCancel : onClose}
      title={lead.name || "Lead"}
      subtitle={`${lead.leadNo}${lead.number ? ` · ${lead.number}` : ""}`}
      icon={User}
      width="max-w-xl"
      footer={
        <div className="flex items-center justify-between">
          {editing ? (
            <>
              <span className="text-[12px] text-muted-foreground">{dirty ? "Unsaved changes" : "Editing"}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel}>Cancel</Button>
                <Button size="sm" className="gap-1.5" loading={saving} disabled={!dirty || !validation.ok} onClick={handleSave}>
                  <Check className="h-4 w-4" /> Save Changes
                </Button>
              </div>
            </>
          ) : (
            <>
              <Can permission="manage_sales">
                <Button variant="ghost" size="sm" className="gap-1.5 text-rose-600 hover:bg-rose-50" onClick={() => onDelete(lead)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </Can>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                <Can permission="manage_sales">
                  <Button size="sm" className="gap-1.5" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
                </Can>
              </div>
            </>
          )}
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
              <p className="text-[12px] text-muted-foreground">{lead.leadCategory || lead.source || "Lead"}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {lead.status && <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", statusTone(lead.status))}>{lead.status}</span>}
            {lead.priority && <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", priorityTone(lead.priority))}><Flag className="h-3 w-3" fill="currentColor" /> {lead.priority}</span>}
          </div>
        </div>

        {!editing && (
          <>
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
          </>
        )}

        {/* Assignment (view mode only — reassign uses the AssignMenu) */}
        {!editing && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
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
        )}

        {/* ── Contact ── */}
        <Section icon={User} title="Contact">
          {editing ? (
            <>
              <EditField label="Name" error={!validation.ok ? validation.errors.name : undefined}><input className={editInput(!!validation.errors.name)} value={draft.name} onChange={(e) => set("name", e.target.value)} /></EditField>
              <EditField label="Number" error={!validation.ok ? validation.errors.number : undefined}><input className={editInput(!!validation.errors.number)} value={draft.number} onChange={(e) => set("number", e.target.value)} inputMode="tel" /></EditField>
              <EditField label="Email" error={validation.errors.email}><input className={editInput(!!validation.errors.email)} value={draft.email} onChange={(e) => set("email", e.target.value)} inputMode="email" /></EditField>
              <EditField label="Location"><input className={editInput()} value={draft.location} onChange={(e) => set("location", e.target.value)} /></EditField>
            </>
          ) : (
            <>
              <Cell label="Name">{lead.name}</Cell>
              <Cell label="Number">{lead.number}</Cell>
              <Cell label="Email">{lead.email}</Cell>
              <Cell label="Location">{lead.location}</Cell>
            </>
          )}
        </Section>

        {/* ── Lead ── */}
        <Section icon={Tag} title="Lead">
          {editing ? (
            <>
              <Cell label="Lead ID">{lead.leadNo}</Cell>
              <Cell label="Date">{lead.date}{lead.time ? ` · ${lead.time}` : ""}</Cell>
              <EditField label="Region"><EditSelect field="region" value={draft.region} onChange={(v) => set("region", v)} /></EditField>
              <EditField label="Source"><EditSelect field="source" value={draft.source} onChange={(v) => set("source", v)} /></EditField>
              <EditField label="Agent"><EditSelect field="agent" value={draft.agent} onChange={(v) => set("agent", v)} /></EditField>
              <EditField label="Lead Category"><EditSelect field="leadCategory" value={draft.leadCategory} onChange={(v) => set("leadCategory", v)} /></EditField>
              <EditField label="Lead Nature"><EditSelect field="leadNature" value={draft.leadNature} onChange={(v) => set("leadNature", v)} /></EditField>
              <EditField label="Priority"><EditSelect field="priority" value={draft.priority} onChange={(v) => set("priority", v)} /></EditField>
            </>
          ) : (
            <>
              <Cell label="Lead ID">{lead.leadNo}</Cell>
              <Cell label="Date">{lead.date}{lead.time ? ` · ${lead.time}` : ""}</Cell>
              <Cell label="Month">{lead.month}</Cell>
              <Cell label="Region">{lead.region}</Cell>
              <Cell label="Source">{lead.source}</Cell>
              <Cell label="Agent">{lead.agent}</Cell>
              <Cell label="Lead Category">{lead.leadCategory}</Cell>
              <Cell label="Lead Nature">{lead.leadNature}</Cell>
              <Cell label="Priority">{lead.priority}</Cell>
            </>
          )}
        </Section>

        {/* ── Repair / Sales ── */}
        <Section icon={Wrench} title="Repair / Sales Details">
          {editing ? (
            <>
              <EditField label="Device"><EditSelect field="device" value={draft.device} onChange={(v) => set("device", v)} /></EditField>
              <EditField label="Category"><EditSelect field="category" value={draft.category} onChange={(v) => set("category", v)} /></EditField>
              <EditField label="Issue" wide><input className={editInput()} value={draft.issue} onChange={(e) => set("issue", e.target.value)} /></EditField>
              <EditField label="Estimate" error={validation.errors.estimate}><input className={editInput(!!validation.errors.estimate)} value={draft.estimate ?? ""} onChange={(e) => set("estimate", e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")))} inputMode="decimal" /></EditField>
              <EditField label="Discount" error={validation.errors.discount}><input className={editInput(!!validation.errors.discount)} value={draft.discount ?? ""} onChange={(e) => set("discount", e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")))} inputMode="decimal" /></EditField>
              <EditField label="Comments" wide><textarea className={cn(editInput(), "h-auto min-h-[64px] py-2")} value={draft.comments} onChange={(e) => set("comments", e.target.value)} /></EditField>
            </>
          ) : (
            <>
              <Cell label="Device">{lead.device}</Cell>
              <Cell label="Category">{lead.category}</Cell>
              <Cell label="Issue" wide>{lead.issue}</Cell>
              <Cell label="Estimate">{money(lead.estimate)}</Cell>
              <Cell label="Discount">{money(lead.discount)}</Cell>
              <Cell label="Comments" wide>{lead.comments}</Cell>
            </>
          )}
        </Section>

        {/* ── Contact & Follow-Up ── */}
        <Section icon={ClipboardCheck} title="Contact & Follow-Up">
          {editing ? (
            <>
              <EditField label="Contact Status"><EditSelect field="contactStatus" value={draft.contactStatus} onChange={(v) => set("contactStatus", v)} /></EditField>
              <EditField label="Status"><EditSelect field="status" value={draft.status} onChange={(v) => set("status", v)} /></EditField>
              <EditField label="Follow-Up Date" error={validation.errors.followUpDate}><input type="date" className={editInput(!!validation.errors.followUpDate)} value={draft.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} /></EditField>
              <EditField label="Follow-Up Agent"><EditSelect field="followUpAgent" value={draft.followUpAgent} onChange={(v) => set("followUpAgent", v)} /></EditField>
              <EditField label="Follow-Up Comments" wide><textarea className={cn(editInput(), "h-auto min-h-[56px] py-2")} value={draft.followUpComments} onChange={(e) => set("followUpComments", e.target.value)} /></EditField>
            </>
          ) : (
            <>
              <Cell label="Contact Status">{lead.contactStatus}</Cell>
              <Cell label="Status">{lead.status}</Cell>
              <Cell label="Follow-Up Date">{lead.followUpDate}</Cell>
              <Cell label="Follow-Up Agent">{lead.followUpAgent}</Cell>
              <Cell label="Follow-Up Comments" wide>{lead.followUpComments}</Cell>
            </>
          )}
        </Section>

        {/* ── Result ── */}
        <Section icon={Flag} title="Result">
          {editing ? (
            <>
              <EditField label="Result"><EditSelect field="result" value={draft.result} onChange={(v) => set("result", v)} /></EditField>
              <EditField label="Final Result"><EditSelect field="finalResult" value={draft.finalResult} onChange={(v) => set("finalResult", v)} /></EditField>
              <EditField label="Final Remarks" wide><textarea className={cn(editInput(), "h-auto min-h-[56px] py-2")} value={draft.finalRemarks} onChange={(e) => set("finalRemarks", e.target.value)} /></EditField>
            </>
          ) : (
            <>
              <Cell label="Result">{lead.result}</Cell>
              <Cell label="Final Result">{lead.finalResult}</Cell>
              <Cell label="Final Remarks" wide>{lead.finalRemarks}</Cell>
            </>
          )}
        </Section>
      </div>
    </Drawer>
  );
}
