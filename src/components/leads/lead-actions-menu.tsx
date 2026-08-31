"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead row actions, mirroring the Ticket table's action pattern:
   quick Pin/Unpin + View (eye) icons, plus a "More" dropdown (View, Edit,
   Change Priority, Delete). The dropdown renders through a portal (shared
   <Dropdown>) so it floats above the table instead of being clipped.
   ────────────────────────────────────────────────────────────────────────── */

import { Eye, Pin, PinOff, MoreHorizontal, Pencil, Flag, Trash2, Phone, MessageSquare, Mail } from "lucide-react";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Can } from "@/components/common/can";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/leads-data";

export type LeadAction = "view" | "edit" | "pin" | "priority" | "delete";

export function LeadActionsMenu({
  lead, onAction,
}: {
  lead: Lead;
  onAction: (action: LeadAction, lead: Lead) => void;
}) {
  const isPinned = !!lead.pinnedAt;
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {/* Quick contact actions (kept from before, shown on row hover) */}
      <div className="hidden items-center gap-1 opacity-0 transition group-hover:opacity-100 lg:flex">
        {lead.number && <a href={`tel:${lead.number}`} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 transition" title="Call"><Phone className="h-3.5 w-3.5" /></a>}
        {lead.number && <a href={`https://wa.me/${lead.number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-green-50 hover:text-green-600 transition" title="WhatsApp"><MessageSquare className="h-3.5 w-3.5" /></a>}
        {lead.email && <a href={`mailto:${lead.email}`} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-sky-50 hover:text-sky-600 transition" title="Email"><Mail className="h-3.5 w-3.5" /></a>}
      </div>

      {/* View */}
      <button
        onClick={() => onAction("view", lead)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
        title="View lead"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>

      {/* Pin / Unpin — RepairOX violet accent (same as tickets) */}
      <button
        onClick={() => onAction("pin", lead)}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-lg transition",
          isPinned ? "text-[#7C5CFC] bg-[#7C5CFC]/10 hover:bg-[#7C5CFC]/20" : "text-muted-foreground hover:bg-[#7C5CFC]/10 hover:text-[#7C5CFC]",
        )}
        title={isPinned ? "Unpin lead" : "Pin lead"}
      >
        {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>

      {/* More */}
      <Dropdown
        align="right"
        width="w-44"
        trigger={({ toggle }) => (
          <button
            onClick={toggle}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
            title="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem icon={Eye} onClick={() => { onAction("view", lead); close(); }}>View</MenuItem>
            <Can permission="manage_sales">
              <MenuItem icon={Pencil} onClick={() => { onAction("edit", lead); close(); }}>Edit</MenuItem>
            </Can>
            <Can permission="manage_sales">
              <MenuItem icon={Flag} onClick={() => { onAction("priority", lead); close(); }}>Change Priority</MenuItem>
            </Can>
            <MenuItem icon={isPinned ? PinOff : Pin} onClick={() => { onAction("pin", lead); close(); }}>
              {isPinned ? "Unpin from top" : "Pin to top"}
            </MenuItem>
            <Can permission="manage_sales">
              <MenuItem icon={Trash2} danger onClick={() => { onAction("delete", lead); close(); }}>Delete</MenuItem>
            </Can>
          </>
        )}
      </Dropdown>
    </div>
  );
}
