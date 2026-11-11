"use client";
/* RepairOX — Field table UI parts (moved verbatim from field/page.tsx so the
   page stays focused on layout). ViewPicker = queue dropdown with live counts;
   StatusPill = the guarded Service Status dropdown (only valid next states from
   the EXISTING transition map — no second status engine). */
import { useMemo, useRef, useState } from "react";
import { ModalPortal } from "@/components/ui/modal-portal";
import { ChevronDown, Check, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FIELD_STATUS_LABEL, FIELD_STATUS_TONE, normaliseLeadType, allowedFieldTransitions,
  type FieldQueue, type FieldJob, type FieldJobStatus,
} from "@/lib/field-data";

/* Status strip queues (order per the reference). */
export const STRIP: { value: FieldQueue; label: string }[] = [
  { value: "all",                label: "All Jobs" },
  { value: "today_pickup",       label: "Today's Pickup" },
  { value: "upcoming_pickup",    label: "Upcoming Pickup" },
  { value: "pending_assignment", label: "Pending Assignment" },
  { value: "in_transit",         label: "In Transit" },
  { value: "at_store",           label: "At Store" },
  { value: "ready_for_drop",     label: "Ready for Drop" },
  { value: "today_drop",         label: "Today's Drop" },
  { value: "delayed",            label: "Delayed" },
  { value: "completed",          label: "Completed" },
  { value: "today_visits",       label: "Today's Visits (pickups + drops)" },
  { value: "needs_action",       label: "Needs Action (unassigned + delayed)" },
  { value: "in_store",           label: "In Store (at store + ready for drop)" },
];

/* Compact "View" dropdown that replaces the long status pill strip. Shows the
   active view + its live count, and lists every queue with counts. Selecting a
   view drives the same `queue` state the KPI cards use (fully synchronised). */
export function ViewPicker({ queue, onChange, counts }: {
  queue: FieldQueue;
  onChange: (q: FieldQueue) => void;
  counts: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const active = STRIP.find((s) => s.value === queue) ?? STRIP[0];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-[34px] items-center gap-2 rounded-xl border px-3 text-[12px] font-semibold transition",
          queue !== "all" ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]" : "border-border bg-card text-zinc-700 hover:border-[#4361EE]/40",
        )}
      >
        <LayoutList className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap">{active.label}</span>
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", queue !== "all" ? "bg-[#4361EE] text-white" : "bg-muted text-zinc-500")}>
          {counts[active.value] ?? 0}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-40 mt-1 max-h-[340px] w-60 overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-xl">
            {STRIP.map((s) => {
              const isActive = s.value === queue;
              const count = counts[s.value] ?? 0;
              return (
                <button
                  key={s.value}
                  onClick={() => { onChange(s.value); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition",
                    isActive ? "bg-[#EEF1FD] font-semibold text-[#4361EE]" : "text-zinc-700 hover:bg-muted",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {isActive && <Check className="h-3.5 w-3.5" />}
                    <span className={cn(!isActive && "pl-[22px]")}>{s.label}</span>
                  </span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", count > 0 ? "bg-[#4361EE]/10 text-[#4361EE]" : "bg-muted text-zinc-400")}>{count}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* Service Status pill. Read-only chip by default; when the user can edit and
   the current status has valid next states, it becomes a dropdown exposing ONLY
   the guarded transitions of the EXISTING map (prevents e.g. Pending →
   Completed). The menu is PORTALLED + fixed-positioned (auto-flips up near the
   viewport bottom) so the data-grid's internal scroll container never clips it. */
export function StatusPill({ job, canEdit, onSelect }: {
  job: FieldJob;
  canEdit: boolean;
  onSelect: (next: FieldJobStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const nexts = useMemo(() => allowedFieldTransitions(job.status, normaliseLeadType(job.leadType)), [job.status, job.leadType]);
  const editable = canEdit && nexts.length > 0;

  const chip = (
    <span className={cn("flex h-7 w-full min-w-0 items-center justify-between gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", FIELD_STATUS_TONE[job.status])}>
      <span className="min-w-0 flex-1 truncate" title={FIELD_STATUS_LABEL[job.status]}>{FIELD_STATUS_LABEL[job.status]}</span>
      {editable && <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} />}
    </span>
  );
  if (!editable) return chip;

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const MENU_H = 56 + nexts.length * 36;
      const flipUp = r.bottom + MENU_H > window.innerHeight - 8 && r.top > MENU_H;
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 216)), ...(flipUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
    }
    setOpen(true);
  };

  return (
    <div className="w-full">
      <button ref={btnRef} onClick={toggle} title="Update service status" aria-haspopup="menu" aria-expanded={open}
        className="block w-full rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40">
        {chip}
      </button>
      {open && pos && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div role="menu" style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
            className="fixed z-[9999] w-52 rounded-xl border border-border bg-card p-1.5 shadow-xl">
            <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Update status</p>
            {nexts.map((s) => (
              <button key={s} role="menuitem" onClick={() => { onSelect(s); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] text-zinc-700 transition hover:bg-muted">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset", FIELD_STATUS_TONE[s])} />
                {FIELD_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
