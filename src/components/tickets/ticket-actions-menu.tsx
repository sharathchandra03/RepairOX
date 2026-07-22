"use client";

import { Eye, ArrowRightLeft, MessageSquarePlus, CreditCard, Mail, Printer, Pencil, MoreHorizontal, Trash2, AlertTriangle } from "lucide-react";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import type { Ticket } from "@/lib/mock-data";

export type TicketAction =
  | "view"
  | "transfer"
  | "comment"
  | "checkout"
  | "email-receipt"
  | "print"
  | "edit"
  | "delete"
  | "priority";

interface TicketActionsMenuProps {
  ticket: Ticket;
  onAction: (action: TicketAction, ticket: Ticket) => void;
}

export function TicketActionsMenu({ ticket, onAction }: TicketActionsMenuProps) {
  return (
    <div className="flex items-center justify-end gap-1">
      {/* Direct edit button */}
      <button
        onClick={() => onAction("edit", ticket)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-50"
        title="Edit ticket"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {/* More options dropdown */}
      <Dropdown
        align="right"
        width="w-48"
        trigger={({ toggle }) => (
          <button
            onClick={toggle}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            title="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem icon={Eye} onClick={() => { onAction("view", ticket); close(); }}>
              View
            </MenuItem>
            <MenuItem icon={ArrowRightLeft} onClick={() => { onAction("transfer", ticket); close(); }}>
              Transfer Ticket
            </MenuItem>
            <MenuItem icon={MessageSquarePlus} onClick={() => { onAction("comment", ticket); close(); }}>
              View / Add Comment
            </MenuItem>
            <MenuItem icon={CreditCard} onClick={() => { onAction("checkout", ticket); close(); }}>
              Checkout
            </MenuItem>
            <MenuItem icon={Mail} onClick={() => { onAction("email-receipt", ticket); close(); }}>
              Email Receipt
            </MenuItem>
            <MenuItem icon={Printer} onClick={() => { onAction("print", ticket); close(); }}>
              Print
            </MenuItem>
            <MenuItem icon={AlertTriangle} onClick={() => { onAction("priority", ticket); close(); }}>
              Change Priority
            </MenuItem>
            <div className="my-1 border-t border-border" />
            <MenuItem icon={Trash2} danger onClick={() => { onAction("delete", ticket); close(); }}>
              Delete Ticket
            </MenuItem>
          </>
        )}
      </Dropdown>
    </div>
  );
}
