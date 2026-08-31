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

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import {
  X, Check, ChevronRight, ChevronLeft, UserPlus, Search,
  ClipboardList, CalendarClock, AlertCircle, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useLeads } from "@/lib/leads-context";
import { useSession } from "@/lib/use-session";
import { usePermissions } from "@/lib/permissions-context";
import {
  emptyLeadDraft, validateLead, needsFollowUp,
  type Lead, type LeadDraft, type LeadFieldKey,
} from "@/lib/leads-data";
import { cn } from "@/lib/utils";

/* ─── Configurable select (searchable, options from Settings) ─────────── */

function ConfigurableSelect({
  field, value, onChange, placeholder, extra = [], invalid,
}: {
  field: LeadFieldKey;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Extra values merged in (e.g. live staff for agent fields, or the lead's
   *  own saved-but-archived value so it still shows). */
  extra?: string[];
  invalid?: boolean;
}) {
  const { optionsFor } = useLeads();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const values = useMemo(() => {
    const configured = optionsFor(field).map((o) => o.value);
    const merged = Array.from(new Set([...extra, ...configured].filter(Boolean)));
    // Keep the currently-selected value visible even if archived.
    if (value && !merged.includes(value)) merged.unshift(value);
    return merged;
  }, [optionsFor, field, extra, value]);

  const filtered = query.trim()
    ? values.filter((v) => v.toLowerCase().includes(query.trim().toLowerCase()))
    : values;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-[38px] w-full items-center justify-between gap-2 rounded-xl border bg-card px-3 text-[13px] transition-all",
          open ? "border-[#4361EE] ring-2 ring-[#4361EE]/15" : invalid ? "border-rose-300" : "border-border hover:border-[#4361EE]/40",
        )}
      >
        <span className={cn("truncate text-left", !value && "text-muted-foreground")}>{value || placeholder || "Select…"}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[10000]" onClick={() => { setOpen(false); setQuery(""); }} />
          <div className="absolute left-0 top-full z-[10001] mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-xl">
            {values.length > 6 && (
              <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}
            <div className="max-h-56 overflow-y-auto p-1">
              {value && (
                <button type="button" onClick={() => { onChange(""); setOpen(false); setQuery(""); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-muted">
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
              {filtered.length === 0 && <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No options. Add them in Settings.</p>}
              {filtered.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { onChange(v); setOpen(false); setQuery(""); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                    v === value ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60",
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5 text-[#4361EE]", v === value ? "opacity-100" : "opacity-0")} />
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
    "h-[38px] w-full rounded-xl border bg-card px-3 text-[13px] outline-none transition-all placeholder:text-muted-foreground",
    invalid ? "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-200/40" : "border-border hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15",
  );

/* ─── Stage config ────────────────────────────────────────────────────── */

const STAGES = [
  { id: 1, label: "Quick Capture", hint: "Register the lead" },
  { id: 2, label: "Qualification", hint: "Device & estimate" },
  { id: 3, label: "Follow-Up", hint: "Contact & result" },
];

/* Subtle horizontal slide + fade for step transitions. `custom` is the
   direction (+1 forward / -1 back): the entering step comes from the side we're
   moving toward, the exiting step leaves the opposite way. No bounce/spring. */
const STEP_VARIANTS = {
  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 28 : -28 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -28 : 28 }),
};

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
  const { addLead, updateLead } = useLeads();
  const { name: currentUserName } = useSession();
  const { team } = usePermissions();
  const isEdit = !!editLead;

  const staffNames = useMemo(() => team.map((m) => m.name).filter(Boolean), [team]);

  const [stage, setStage] = useState(1);
  // Direction of the last step change: +1 = forward (Continue), -1 = back.
  // Drives the horizontal slide so Back returns content from the opposite side.
  const [dir, setDir] = useState(1);
  const goToStage = (next: number) => { setDir(next >= stage ? 1 : -1); setStage(next); };
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const [draft, setDraft] = useState<LeadDraft>(() => {
    if (editLead) {
      const { id, leadNo, date, time, month, createdAt, updatedAt, ...rest } = editLead;
      return rest;
    }
    return emptyLeadDraft(currentUserName || "");
  });

  const set = <K extends keyof LeadDraft>(key: K, val: LeadDraft[K]) => setDraft((d) => ({ ...d, [key]: val }));

  const validation = useMemo(() => validateLead(draft), [draft]);
  const showFollowUp = needsFollowUp({ result: draft.result ?? "", status: draft.status ?? "" }) || !!draft.followUpDate;

  const handleSave = async () => {
    setTouched(true);
    if (!validation.ok) {
      goToStage(1); // required fields all live in Stage 1
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editLead) {
        await updateLead(editLead.id, draft as Partial<Lead>);
        onSaved?.({ ...editLead, ...(draft as Partial<Lead>) } as Lead);
      } else {
        const created = await addLead(draft);
        if (created) onSaved?.(created);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <>
      {/* Full-screen blurred / dimmed backdrop — CRM stays visible behind it. */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9998] bg-foreground/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Centered container — panel is vertically + horizontally centered. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      >
        <div
          className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_32px_80px_-20px_rgba(20,30,80,0.35)]"
          role="dialog" aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/60"><UserPlus className="h-5 w-5" /></span>
            <div>
              <h2 className="font-display text-lg font-bold tracking-tight">{isEdit ? `Edit ${editLead?.leadNo}` : "New Lead"}</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{isEdit ? "Update lead details." : "Capture quickly — qualify later."}</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {/* Stage stepper */}
        <div className="flex items-center gap-1 border-b border-border px-5 py-3">
          {STAGES.map((s, i) => {
            const done = stage > s.id;
            const activeStep = stage === s.id;
            return (
              <button key={s.id} type="button" onClick={() => goToStage(s.id)} className="flex flex-1 items-center gap-2 text-left">
                <span className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition",
                  done ? "bg-emerald-500 text-white" : activeStep ? "bg-[#4361EE] text-white" : "bg-muted text-muted-foreground",
                )}>{done ? <Check className="h-3.5 w-3.5" /> : s.id}</span>
                <span className="hidden min-w-0 sm:block">
                  <span className={cn("block truncate text-[12px] font-semibold", activeStep ? "text-foreground" : "text-muted-foreground")}>{s.label}</span>
                </span>
                {i < STAGES.length - 1 && <span className="mx-1 hidden h-px flex-1 bg-border sm:block" />}
              </button>
            );
          })}
        </div>

        {/* Body — the panel stays fixed; only this inner step content transitions.
            overflow-hidden on the wrapper clips the horizontal slide so there's
            no layout shift while the next/previous step moves in. */}
        <div className="relative flex-1 overflow-y-auto overflow-x-hidden p-5">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={stage}
              custom={dir}
              variants={STEP_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            >
              {stage === 1 && (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contact & Source</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Name" required error={touched ? validation.errors.name : undefined}>
                      <input className={inputCls(touched && !!validation.errors.name)} value={draft.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Full name" />
                    </Field>
                    <Field label="Number" required error={touched ? validation.errors.number : undefined}>
                      <input className={inputCls(touched && !!validation.errors.number)} value={draft.number ?? ""} onChange={(e) => set("number", e.target.value)} placeholder="98765 43210" inputMode="tel" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Source" required error={touched ? validation.errors.source : undefined}>
                      <ConfigurableSelect field="source" value={draft.source ?? ""} onChange={(v) => set("source", v)} placeholder="How did they reach us?" invalid={touched && !!validation.errors.source} />
                    </Field>
                    <Field label="Agent" required error={touched ? validation.errors.agent : undefined}>
                      <ConfigurableSelect field="agent" value={draft.agent ?? ""} onChange={(v) => set("agent", v)} placeholder="Owner" extra={staffNames} invalid={touched && !!validation.errors.agent} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Region">
                      <ConfigurableSelect field="region" value={draft.region ?? ""} onChange={(v) => set("region", v)} placeholder="City / area" />
                    </Field>
                    <Field label="Email" error={touched ? validation.errors.email : undefined}>
                      <input className={inputCls(touched && !!validation.errors.email)} value={draft.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="name@email.com" inputMode="email" />
                    </Field>
                  </div>
                  <Field label="Location">
                    <input className={inputCls()} value={draft.location ?? ""} onChange={(e) => set("location", e.target.value)} placeholder="Address / landmark" />
                  </Field>
                </div>
              )}

              {stage === 2 && (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Qualification <span className="font-normal normal-case text-muted-foreground/70">— all optional</span></p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Device"><ConfigurableSelect field="device" value={draft.device ?? ""} onChange={(v) => set("device", v)} placeholder="Device" /></Field>
                    <Field label="Category"><ConfigurableSelect field="category" value={draft.category ?? ""} onChange={(v) => set("category", v)} placeholder="Category" /></Field>
                  </div>
                  <Field label="Issue">
                    <input className={inputCls()} value={draft.issue ?? ""} onChange={(e) => set("issue", e.target.value)} placeholder="What's the problem?" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Estimate" error={touched ? validation.errors.estimate : undefined}>
                      <div className="flex">
                        <span className="flex h-[38px] items-center rounded-l-xl border border-r-0 border-border bg-muted px-2.5 text-[12px] font-medium text-zinc-600">₹</span>
                        <input className={cn(inputCls(touched && !!validation.errors.estimate), "rounded-l-none")} value={draft.estimate ?? ""} onChange={(e) => set("estimate", e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="0" inputMode="decimal" />
                      </div>
                    </Field>
                    <Field label="Discount" error={touched ? validation.errors.discount : undefined}>
                      <div className="flex">
                        <span className="flex h-[38px] items-center rounded-l-xl border border-r-0 border-border bg-muted px-2.5 text-[12px] font-medium text-zinc-600">₹</span>
                        <input className={cn(inputCls(touched && !!validation.errors.discount), "rounded-l-none")} value={draft.discount ?? ""} onChange={(e) => set("discount", e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")))} placeholder="0" inputMode="decimal" />
                      </div>
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Lead Category"><ConfigurableSelect field="leadCategory" value={draft.leadCategory ?? ""} onChange={(v) => set("leadCategory", v)} placeholder="Type" /></Field>
                    <Field label="Lead Nature"><ConfigurableSelect field="leadNature" value={draft.leadNature ?? ""} onChange={(v) => set("leadNature", v)} placeholder="Nature" /></Field>
                    <Field label="Priority"><ConfigurableSelect field="priority" value={draft.priority ?? ""} onChange={(v) => set("priority", v)} placeholder="Priority" /></Field>
                  </div>
                  <Field label="Comments">
                    <Textarea value={draft.comments ?? ""} onChange={(e) => set("comments", e.target.value)} placeholder="Notes about this lead…" className="min-h-[70px] text-[13px]" />
                  </Field>
                </div>
              )}

              {stage === 3 && (
                <div className="space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contact & Result <span className="font-normal normal-case text-muted-foreground/70">— fill when known</span></p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Contact Status"><ConfigurableSelect field="contactStatus" value={draft.contactStatus ?? ""} onChange={(v) => set("contactStatus", v)} placeholder="Reached?" /></Field>
                    <Field label="Status"><ConfigurableSelect field="status" value={draft.status ?? ""} onChange={(v) => set("status", v)} placeholder="Lifecycle" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Result"><ConfigurableSelect field="result" value={draft.result ?? ""} onChange={(v) => set("result", v)} placeholder="Outcome" /></Field>
                    <Field label="Final Result"><ConfigurableSelect field="finalResult" value={draft.finalResult ?? ""} onChange={(v) => set("finalResult", v)} placeholder="Closed as" /></Field>
                  </div>

                  {/* Context-sensitive follow-up block */}
                  <div className={cn("rounded-2xl border p-4 transition", showFollowUp ? "border-[#B3BFF6] bg-[#EEF1FD]/50" : "border-dashed border-border bg-muted/30")}>
                    <div className="mb-3 flex items-center gap-2">
                      <CalendarClock className={cn("h-4 w-4", showFollowUp ? "text-[#4361EE]" : "text-muted-foreground")} />
                      <p className={cn("text-[12px] font-semibold", showFollowUp ? "text-[#4361EE]" : "text-muted-foreground")}>Follow-Up {showFollowUp ? "— needed" : "(optional)"}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Follow-Up Date" error={touched ? validation.errors.followUpDate : undefined}>
                        <input type="date" className={inputCls(touched && !!validation.errors.followUpDate)} value={draft.followUpDate ?? ""} onChange={(e) => set("followUpDate", e.target.value)} />
                      </Field>
                      <Field label="Follow-Up Agent"><ConfigurableSelect field="followUpAgent" value={draft.followUpAgent ?? ""} onChange={(v) => set("followUpAgent", v)} placeholder="Assign" extra={staffNames} /></Field>
                    </div>
                    <Field label="Follow-Up Comments" className="mt-3">
                      <Textarea value={draft.followUpComments ?? ""} onChange={(e) => set("followUpComments", e.target.value)} placeholder="What to do next…" className="min-h-[60px] text-[13px]" />
                    </Field>
                  </div>

                  <Field label="Final Remarks">
                    <Textarea value={draft.finalRemarks ?? ""} onChange={(e) => set("finalRemarks", e.target.value)} placeholder="Closing notes…" className="min-h-[60px] text-[13px]" />
                  </Field>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border p-4">
          <div>
            {stage > 1 && (
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => goToStage(stage - 1)}><ChevronLeft className="h-4 w-4" /> Back</Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            {stage < 3 ? (
              <>
                {!isEdit && (
                  <Button variant="soft" size="sm" loading={saving} onClick={handleSave}>Save now</Button>
                )}
                <Button size="sm" className="gap-1" onClick={() => goToStage(stage + 1)}>Continue <ChevronRight className="h-4 w-4" /></Button>
              </>
            ) : (
              <Button size="sm" className="gap-1.5" loading={saving} onClick={handleSave}>
                <Check className="h-4 w-4" /> {isEdit ? "Save changes" : "Create lead"}
              </Button>
            )}
          </div>
        </div>
        </div>
      </motion.div>
    </>
  );

  if (typeof document === "undefined") return null;
  return createPortal(<AnimatePresence>{content}</AnimatePresence>, document.body);
}
