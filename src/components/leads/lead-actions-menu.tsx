"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead row actions, mirroring the Ticket table's action pattern:
   quick Pin/Unpin + View (eye) icons, plus a "More" dropdown (View, Edit,
   Change Priority, Delete). The dropdown renders through a portal (shared
   <Dropdown>) so it floats above the table instead of being clipped.
   ────────────────────────────────────────────────────────────────────────── */

import { Eye, Pin, PinOff, MoreHorizontal, Pencil, Flag, Trash2, Route as RouteIcon, FileText, MessageSquare } from "lucide-react";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Can } from "@/components/common/can";
import { CAP } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/leads-data";

export type LeadAction = "view" | "edit" | "pin" | "priority" | "delete" | "route" | "quotation" | "comment";

/** Action handler. The `anchor` (3rd arg) is only passed for the "comment"
 *  action — it is the chat trigger element, so the list page can anchor the
 *  in-place conversation popover to it. */
export type LeadActionHandler = (action: LeadAction, lead: Lead, anchor?: HTMLElement) => void;

/** The deal-conversation shortcut button. Shown ONLY when the lead has a deal
 *  with an existing conversation; clicking it opens a compact in-place chat
 *  popover (handled by the list page via onAction("comment")) — it does NOT
 *  navigate to View Lead. An unread-COUNT badge (a small number pill) shows
 *  when there are unread messages for this user; count 0 → no badge.
 *  Presentational — the list page decides when it renders (hasDealConversation)
 *  and passes the live unread count. The button also forwards its own bounding
 *  rect so the popover can anchor to it. */
function DealConversationButton({
  lead, onAction, unreadCount = 0,
}: {
  lead: Lead;
  onAction: (action: LeadAction, lead: Lead, anchor?: HTMLElement) => void;
  unreadCount?: number;
}) {
  const hasUnread = unreadCount > 0;
  return (
    <button
      onClick={(e) => onAction("comment", lead, e.currentTarget)}
      className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
      title={hasUnread ? `Deal conversation · ${unreadCount} new message${unreadCount === 1 ? "" : "s"}` : "Deal conversation"}
      aria-label={hasUnread ? `Deal conversation, ${unreadCount} new messages` : "Deal conversation"}
    >
      <MessageSquare className="h-3.5 w-3.5" />
      {hasUnread && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white ring-1 ring-white"
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}

export function LeadActionsMenu({
  lead, onAction, readOnly = false, hasDealConversation = false, dealUnreadCount = 0,
}: {
  lead: Lead;
  onAction: LeadActionHandler;
  /** OWNER "view as agent" read-only mode — only View is offered; every
   *  mutating control (pin/edit/priority/delete/route/quotation) is hidden.
   *  The deal-conversation shortcut still shows (it only reads/opens the chat). */
  readOnly?: boolean;
  /** The lead has a deal with an existing conversation → show the chat icon. */
  hasDealConversation?: boolean;
  /** Number of unread deal-conversation messages for the current user. */
  dealUnreadCount?: number;
}) {
  const isPinned = !!lead.pinnedAt;

  // Read-only (owner viewing an agent's workspace): offer View only — plus the
  // deal-conversation shortcut, which only opens the (read-only) thread.
  if (readOnly) {
    return (
      <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        {hasDealConversation && <DealConversationButton lead={lead} onAction={onAction} unreadCount={dealUnreadCount} />}
        <button
          onClick={() => onAction("view", lead)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
          title="View lead"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {/* Quick call/WhatsApp/email actions live in the Contact Info cell
          (clickable phone + email). Removed from here so they never overflow
          into the neighbouring Result column on row hover. */}

      {/* Deal conversation shortcut — only when a deal conversation exists. */}
      {hasDealConversation && <DealConversationButton lead={lead} onAction={onAction} unreadCount={dealUnreadCount} />}

      {/* View */}
      <button
        onClick={() => onAction("view", lead)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
        title="View lead"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>

      {/* Pin / Unpin — RepairOX violet accent (same as tickets) */}
      <Can permission={CAP.lead.pin}>
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
      </Can>

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
            <Can permission={CAP.quotation.create}>
              <MenuItem icon={FileText} onClick={() => { onAction("quotation", lead); close(); }}>Send Quotation</MenuItem>
            </Can>
            <Can permission="route_leads">
              <MenuItem icon={RouteIcon} onClick={() => { onAction("route", lead); close(); }}>Route / Assign</MenuItem>
            </Can>
            <Can permission={CAP.lead.edit}>
              <MenuItem icon={Pencil} onClick={() => { onAction("edit", lead); close(); }}>Edit</MenuItem>
            </Can>
            <Can permission={CAP.lead.priorityChange}>
              <MenuItem icon={Flag} onClick={() => { onAction("priority", lead); close(); }}>Change Priority</MenuItem>
            </Can>
            <Can permission={CAP.lead.pin}>
              <MenuItem icon={isPinned ? PinOff : Pin} onClick={() => { onAction("pin", lead); close(); }}>
                {isPinned ? "Unpin from top" : "Pin to top"}
              </MenuItem>
            </Can>
            <Can permission={CAP.lead.delete}>
              <MenuItem icon={Trash2} danger onClick={() => { onAction("delete", lead); close(); }}>Delete</MenuItem>
            </Can>
          </>
        )}
      </Dropdown>
    </div>
  );
}
