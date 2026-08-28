"use client";

import { Eye, ArrowRightLeft, MessageSquarePlus, CreditCard, Mail, Printer, Pencil, MoreHorizontal, Trash2, AlertTriangle, Receipt, FileDown, Pin, PinOff } from "lucide-react";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import type { Ticket } from "@/lib/mock-data";

export type TicketAction =
  | "view"
  | "print-preview"
  | "transfer"
  | "comment"
  | "checkout"
  | "email-receipt"
  | "print"
  | "download-pdf"
  | "edit"
  | "delete"
  | "priority"
  | "pin"
  | "invoice";

interface TicketActionsMenuProps {
  ticket: Ticket;
  onAction: (action: TicketAction, ticket: Ticket) => void;
}

export function TicketActionsMenu({ ticket, onAction }: TicketActionsMenuProps) {
  const isPinned = !!ticket.pinnedAt;
  return (
    <div className="flex items-center justify-end gap-1">
      {/* Pin / Unpin — RepairOX violet accent (distinct from red/blue/green/amber) */}
      <button
        onClick={() => onAction("pin", ticket)}
        className={
          isPinned
            ? "inline-flex h-7 w-7 items-center justify-center rounded-lg text-[#7C5CFC] bg-[#7C5CFC]/10 transition hover:bg-[#7C5CFC]/20"
            : "inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#7C5CFC]/10 hover:text-[#7C5CFC]"
        }
        title={isPinned ? "Unpin ticket" : "Pin ticket"}
      >
        {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>

      {/* Print Preview button (Eye icon — opens print preview) */}
      <button
        onClick={() => onAction("print-preview", ticket)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
        title="Print Preview"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>

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
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
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
            <MenuItem icon={Receipt} onClick={() => { onAction("invoice", ticket); close(); }}>
              Push to Invoice
            </MenuItem>
            <MenuItem icon={Printer} onClick={() => { onAction("print", ticket); close(); }}>
              Print
            </MenuItem>
            <MenuItem icon={FileDown} onClick={() => { onAction("download-pdf", ticket); close(); }}>
              Download PDF
            </MenuItem>
            <MenuItem icon={AlertTriangle} onClick={() => { onAction("priority", ticket); close(); }}>
              Change Priority
            </MenuItem>
            <MenuItem icon={ticket.pinnedAt ? PinOff : Pin} onClick={() => { onAction("pin", ticket); close(); }}>
              {ticket.pinnedAt ? "Unpin from top" : "Pin to top"}
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
