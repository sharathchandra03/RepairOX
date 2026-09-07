"use client";

import { Eye, ArrowRightLeft, MessageCircle, Mail, Printer, Pencil, MoreHorizontal, Trash2, AlertTriangle, Receipt, FileDown, Pin, PinOff } from "lucide-react";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { PushToInvoiceIcon } from "@/components/tickets/push-to-invoice-icon";
import type { Ticket } from "@/lib/mock-data";

export type TicketAction =
  | "view"
  | "print-preview"
  | "transfer"
  | "comment"
  | "checkout"
  | "whatsapp-receipt"
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
  /** True when this ticket already has a linked invoice (invoice.ticketId === ticket.id). */
  hasInvoice?: boolean;
}

export function TicketActionsMenu({ ticket, onAction, hasInvoice = false }: TicketActionsMenuProps) {
  const isPinned = !!ticket.pinnedAt;
  return (
    <div className="flex items-center justify-end gap-2">
      {/* 1. Push to Invoice — first quick action. Uses the existing "invoice"
             flow via onAction. Once an invoice exists it reflects that state
             (disabled + green check) so no duplicate invoice is created. */}
      {hasInvoice ? (
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 cursor-default"
          title="Invoice already generated"
          aria-label="Invoice already generated"
        >
          {/* Same Push to Invoice icon, tinted green to signal the invoice
              already exists. Black glyph keeps the ₹/arrow clearly visible. */}
          <PushToInvoiceIcon className="h-3.5 w-3.5 text-foreground" />
        </span>
      ) : (
        <button
          onClick={() => onAction("invoice", ticket)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
          title="Push to Invoice"
        >
          <PushToInvoiceIcon className="h-3.5 w-3.5" />
        </button>
      )}

      {/* 2. View — opens the ticket (print preview). */}
      <button
        onClick={() => onAction("print-preview", ticket)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
        title="Print Preview"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>

      {/* 3. Pin / Unpin — RepairOX violet accent (distinct from red/blue/green/amber) */}
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

      {/* 4. More options dropdown — Edit still lives here (unchanged). */}
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
            {/* Streamlined menu — View, View/Add Comment, Checkout and Pin to top
                were removed to keep this list short. */}
            {/* 1. Edit */}
            <MenuItem icon={Pencil} onClick={() => { onAction("edit", ticket); close(); }}>
              Edit
            </MenuItem>
            {/* 2. Push to Invoice — completed/disabled state preserved by caller;
                   no duplicate invoice action is created. */}
            <MenuItem icon={Receipt} onClick={() => { onAction("invoice", ticket); close(); }}>
              Push to Invoice
            </MenuItem>
            {/* 3. Change Priority */}
            <MenuItem icon={AlertTriangle} onClick={() => { onAction("priority", ticket); close(); }}>
              Change Priority
            </MenuItem>
            {/* 4. Print */}
            <MenuItem icon={Printer} onClick={() => { onAction("print", ticket); close(); }}>
              Print
            </MenuItem>
            {/* 5. WhatsApp Receipt */}
            <MenuItem icon={MessageCircle} onClick={() => { onAction("whatsapp-receipt", ticket); close(); }}>
              WhatsApp Receipt
            </MenuItem>
            {/* 6. Email Receipt */}
            <MenuItem icon={Mail} onClick={() => { onAction("email-receipt", ticket); close(); }}>
              Email Receipt
            </MenuItem>
            {/* 7. Transfer Ticket */}
            <MenuItem icon={ArrowRightLeft} onClick={() => { onAction("transfer", ticket); close(); }}>
              Transfer Ticket
            </MenuItem>
            {/* 8. Download PDF */}
            <MenuItem icon={FileDown} onClick={() => { onAction("download-pdf", ticket); close(); }}>
              Download PDF
            </MenuItem>
            <div className="my-1 border-t border-border" />
            {/* 9. Delete Ticket */}
            <MenuItem icon={Trash2} danger onClick={() => { onAction("delete", ticket); close(); }}>
              Delete Ticket
            </MenuItem>
          </>
        )}
      </Dropdown>
    </div>
  );
}
