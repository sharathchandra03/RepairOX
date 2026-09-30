"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Kanban CARD.

   ONE LEAD = ONE VISUAL CARD. Reads CANONICAL lead data only (from
   useLeads().leads) — never fabricated scores/values. The card communicates:
     • Customer name + lead no
     • Device + issue
     • Source + Lead Value (pipeline estimate — NOT revenue)
     • Priority (Hot/Warm/Cold) as a subtle badge (business priority, distinct
       from the column/board color which is personal organization)
     • Follow-up urgency (Today / Upcoming / Overdue) from the canonical
       lead_followup_history (openFollowUpsByLead)
     • Store context (multi-store views only)
   Quick actions (Open / Call / Email / WhatsApp) only use data that exists and
   are gated by permission. Clicking the card opens the canonical LeadDetail.
   ────────────────────────────────────────────────────────────────────────── */

import { Phone, Mail, MessageSquare, CalendarClock, Flame, MoreHorizontal, ExternalLink, Palette } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { StoreContextCell } from "@/components/common/store-context-cell";
import type { StoreBranch } from "@/lib/store-context";
import { cn, formatINR } from "@/lib/utils";
import { priorityTone } from "@/components/leads/lead-pills";
import { NoteColorPicker } from "./note-color-picker";
import { noteColor as resolveNoteColor, type NoteColor } from "@/lib/lead-kanban";
import {
  followUpTone, openFollowUpRowState, getLeadDevices,
  type Lead, type LeadFollowUp, type FollowUpState,
} from "@/lib/leads-data";

function priorityLabel(priority: string): "Hot" | "Warm" | "Cold" | null {
  const p = (priority || "").toLowerCase();
  if (/urgent|hot|high/.test(p)) return "Hot";
  if (/warm|normal|medium/.test(p)) return "Warm";
  if (/cold|low/.test(p)) return "Cold";
  return null;
}

function followUpLabel(state: FollowUpState): string {
  switch (state) {
    case "overdue": return "Overdue";
    case "today": return "Due today";
    case "upcoming": return "Upcoming";
    default: return "";
  }
}

export function LeadKanbanCard({
  lead,
  openFollowUp,
  store,
  showStore,
  dragging,
  note = "default",
  onChangeNote,
  onOpen,
  onCall,
  onEmail,
  onWhatsApp,
}: {
  lead: Lead;
  openFollowUp?: LeadFollowUp;
  store?: StoreBranch | null;
  showStore?: boolean;
  dragging?: boolean;
  /** Personal sticky-note color for this lead on the active board. */
  note?: NoteColor;
  /** Change the personal note color (undefined = feature unavailable). */
  onChangeNote?: (color: NoteColor) => void;
  onOpen: () => void;
  onCall?: () => void;
  onEmail?: () => void;
  onWhatsApp?: () => void;
}) {
  const devices = getLeadDevices(lead);
  const device = devices[0];
  const fu = openFollowUpRowState(openFollowUp);
  const fuT = followUpTone(fu);
  const priority = priorityLabel(lead.priority);
  const value = lead.estimate;

  // Personal note tint. Overdue urgency ALWAYS overrides the note surface/border
  // so the red warning stays obvious (visual hierarchy: system urgency > note).
  const noteTone = resolveNoteColor(note);
  const overdue = fu === "overdue" && !dragging;
  const hasNote = note !== "default";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className={cn(
        "group relative cursor-pointer select-none overflow-hidden rounded-xl border p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition",
        // Base surface: note tint (soft) or plain white.
        hasNote && noteTone.surface ? noteTone.surface : "bg-white",
        // Border: overdue red > note border > neutral. Drag = brand blue.
        dragging
          ? "border-[#4361EE] shadow-lg"
          : overdue
            ? "border-red-300"
            // Light black border so cards stand out against the tinted column
            // (kept for noted cards too — the note tint is on the surface).
            : "border-zinc-900/25 hover:-translate-y-0.5 hover:border-zinc-900/40 hover:shadow-card",
        // Overdue surface wash sits ON TOP of any note tint.
        overdue && "bg-red-50/60",
      )}
    >
      {/* Sticky-note top accent bar (tactile note edge). Overdue shows red. */}
      {(hasNote || overdue) && (
        <span
          aria-hidden
          className={cn("absolute inset-x-0 top-0 h-1", overdue ? "bg-red-400" : noteTone.bar)}
        />
      )}

      {/* Header — name + lead no + priority + menu */}
      <div className={cn("flex items-start gap-2.5", (hasNote || overdue) && "pt-0.5")}>
        <Avatar name={lead.name || "Lead"} size={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-zinc-900">{lead.name || "Unnamed lead"}</p>
          <p className="truncate text-[11px] text-zinc-500 tnum">{lead.leadNo || "—"}</p>
        </div>
        {priority && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
              priority === "Hot" ? "bg-rose-50 ring-1 ring-inset ring-rose-200" : "bg-transparent",
              priorityTone(lead.priority),
            )}
            title={`Priority: ${priority}`}
          >
            {priority === "Hot" && <Flame className="h-3 w-3" />}
            {priority}
          </span>
        )}
        {onChangeNote && (
          <div onClick={(e) => e.stopPropagation()}>
            <Dropdown
              width="w-52"
              trigger={({ toggle }) => (
                <button
                  type="button"
                  title="Card options"
                  aria-label="Card options"
                  onClick={toggle}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-zinc-400 opacity-0 transition hover:bg-zinc-100 hover:text-zinc-700 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              )}
            >
              {(close) => (
                <div>
                  <MenuItem icon={ExternalLink} onClick={() => { onOpen(); close(); }}>Open Lead</MenuItem>
                  <div className="my-1 border-t border-border" />
                  <MenuLabel>
                    <span className="inline-flex items-center gap-1.5"><Palette className="h-3 w-3" /> Note color</span>
                  </MenuLabel>
                  <div className="px-2 pb-1.5 pt-0.5">
                    <NoteColorPicker
                      value={note}
                      onChange={(c) => { onChangeNote(c); /* keep open for quick multi-tries */ }}
                    />
                  </div>
                </div>
              )}
            </Dropdown>
          </div>
        )}
      </div>

      {/* Device + issue */}
      {(device?.label || device?.issue) && (
        <div className="mt-2.5 min-w-0">
          {device?.label && <p className="truncate text-[12px] font-medium text-zinc-800">{device.label}</p>}
          {device?.issue && <p className="truncate text-[11px] text-zinc-500">{device.issue}</p>}
        </div>
      )}

      {/* Source + Lead Value (pipeline — never revenue) */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {lead.source ? (
          <span className="truncate rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">{lead.source}</span>
        ) : <span />}
        {value != null && (
          <span className="shrink-0 text-[12px] font-semibold tnum text-zinc-800" title="Lead value (pipeline estimate)">
            {formatINR(value)}
          </span>
        )}
      </div>

      {/* Multi-store context */}
      {showStore && store && (
        <div className="mt-2">
          <StoreContextCell store={store} mode="inline" />
        </div>
      )}

      {/* Footer — follow-up state + quick actions */}
      <div className="mt-2.5 flex items-center justify-between border-t border-zinc-100 pt-2.5">
        {fu !== "none" ? (
          <span
            className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", fuT.chip)}
            title="Follow-up"
          >
            <CalendarClock className="h-3 w-3" />
            {followUpLabel(fu)}
          </span>
        ) : (
          <span className="text-[10px] text-zinc-400">No follow-up</span>
        )}
        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          {onCall && lead.number && (
            <button
              type="button"
              title="Call"
              onClick={(e) => { e.stopPropagation(); onCall(); }}
              className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600"
            >
              <Phone className="h-3 w-3" />
            </button>
          )}
          {onEmail && lead.email && (
            <button
              type="button"
              title="Email"
              onClick={(e) => { e.stopPropagation(); onEmail(); }}
              className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-sky-50 hover:text-sky-600"
            >
              <Mail className="h-3 w-3" />
            </button>
          )}
          {onWhatsApp && lead.number && (
            <button
              type="button"
              title="WhatsApp"
              onClick={(e) => { e.stopPropagation(); onWhatsApp(); }}
              className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-green-50 hover:text-green-600"
            >
              <MessageSquare className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
