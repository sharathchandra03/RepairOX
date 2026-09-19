"use client";

import { Eye, ArrowRightLeft, MessageCircle, Mail, Printer, Pencil, MoreHorizontal, Trash2, AlertTriangle, Receipt, FileDown, Pin, PinOff, TicketCheck } from "lucide-react";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { PushToInvoiceIcon } from "@/components/tickets/push-to-invoice-icon";
import { isEstimate, type Ticket } from "@/lib/mock-data";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";

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
  | "invoice"
  /** Estimate-only: convert this Estimate into a new Ticket (opens the
   *  confirmation popup → prefilled Ticket flow). Never shown for Tickets. */
  | "push-to-ticket"
  /** Estimate-only: create a Proforma quote from this Estimate. */
  | "push-to-proforma";

interface TicketActionsMenuProps {
  ticket: Ticket;
  onAction: (action: TicketAction, ticket: Ticket) => void;
  /** True when this ticket already has a linked invoice (invoice.ticketId === ticket.id). */
  hasInvoice?: boolean;
  /** True when the current user may create Tickets — gates the estimate-only
   *  "Push to Ticket" action (UI half of the permission check; the store/backend
   *  enforces it too). */
  canPushToTicket?: boolean;
}

export function TicketActionsMenu({ ticket, onAction, hasInvoice = false, canPushToTicket = true }: TicketActionsMenuProps) {
  const { can } = usePermissions();
  // Per-action capability gates (granular key OR backward-compatible coarse key).
  const canEdit = allow(can, CAP.ticket.edit);
  const canPriority = allow(can, CAP.ticket.changePriority);
  const canPin = allow(can, CAP.ticket.pin);
  const canPushInvoice = allow(can, CAP.ticket.pushToInvoice);
  const canPrint = allow(can, CAP.ticket.print);
  const canComms = allow(can, CAP.ticket.sendComms);
  const canTransfer = allow(can, CAP.ticket.transfer);
  const canDownload = allow(can, CAP.ticket.downloadPdf);
  const canDelete = allow(can, CAP.ticket.delete);
  const isPinned = !!ticket.pinnedAt;
  // Estimate records get a DIFFERENT quick-action set: they are quotes, not
  // repair jobs, so "Push to Invoice" is replaced by "Push to Ticket" and the
  // invoice/coverage affordances are hidden.
  const estimate = isEstimate(ticket);
  return (
    <div className="flex items-center justify-end gap-2">
      {/* 1. Primary quick action.
             • Estimate → "Push to Ticket" (convert). Shown only when the user
               can create tickets. Once converted it reflects that state
               (disabled + green check) so no duplicate Ticket is created.
             • Ticket → "Push to Invoice" (existing behaviour). */}
      {estimate ? (
        // Estimate primary quick action → "Push to Proforma" (send the quote).
        // Uses the invoice/receipt icon (NOT the ticket icon) since the natural
        // next step for a quote is the proforma; "Push to Ticket" also lives in
        // the dropdown. Once converted to a ticket, show the converted state.
        ticket.estimateStatus === "converted" ? (
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 cursor-default"
            title="Already converted to a Ticket"
            aria-label="Already converted to a Ticket"
          >
            <TicketCheck className="h-3.5 w-3.5" />
          </span>
        ) : (
          <button
            onClick={() => onAction("push-to-proforma", ticket)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
            title="Push to Proforma"
          >
            <PushToInvoiceIcon className="h-3.5 w-3.5" />
          </button>
        )
      ) : hasInvoice ? (
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 cursor-default"
          title="Invoice already generated"
          aria-label="Invoice already generated"
        >
          {/* Same Push to Invoice icon, tinted green to signal the invoice
              already exists. Black glyph keeps the ₹/arrow clearly visible. */}
          <PushToInvoiceIcon className="h-3.5 w-3.5 text-foreground" />
        </span>
      ) : canPushInvoice ? (
        <button
          onClick={() => onAction("invoice", ticket)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
          title="Push to Invoice"
        >
          <PushToInvoiceIcon className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {/* 2. View — opens the ticket (print preview). */}
      <button
        onClick={() => onAction("print-preview", ticket)}
        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
        title="Print Preview"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>

      {/* 3. Pin / Unpin — RepairOX violet accent (distinct from red/blue/green/amber) */}
      {canPin && (
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
      )}

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
            {canEdit && (
            <MenuItem icon={Pencil} onClick={() => { onAction("edit", ticket); close(); }}>
              Edit
            </MenuItem>
            )}
            {/* 2. Push to Ticket (Estimate) / Push to Invoice (Ticket).
                   Estimate → shows "Push to Ticket" only when allowed and not
                   yet converted; Tickets keep "Push to Invoice". */}
            {estimate ? (
              // Estimate flows: send a quote (Push to Proforma) OR skip straight
              // to a repair job (Push to Ticket). Both supported per the two
              // lifecycles: Estimate→Ticket→Invoice and Estimate→Proforma→Ticket→Invoice.
              <>
                {/* Push to Proforma — create the proforma quote from this estimate. */}
                <MenuItem icon={Receipt} onClick={() => { onAction("push-to-proforma", ticket); close(); }}>
                  Push to Proforma
                </MenuItem>
                {/* Push to Ticket — convert the estimate into a repair ticket. */}
                {ticket.estimateStatus === "converted" ? (
                  <MenuItem icon={TicketCheck} onClick={() => { onAction("push-to-ticket", ticket); close(); }}>
                    View Converted Ticket
                  </MenuItem>
                ) : canPushToTicket ? (
                  <MenuItem icon={TicketCheck} onClick={() => { onAction("push-to-ticket", ticket); close(); }}>
                    Push to Ticket
                  </MenuItem>
                ) : null}
              </>
            ) : canPushInvoice ? (
              <MenuItem icon={Receipt} onClick={() => { onAction("invoice", ticket); close(); }}>
                Push to Invoice
              </MenuItem>
            ) : null}
            {/* 3. Change Priority */}
            {canPriority && (
            <MenuItem icon={AlertTriangle} onClick={() => { onAction("priority", ticket); close(); }}>
              Change Priority
            </MenuItem>
            )}
            {/* 4. Print */}
            {canPrint && (
            <MenuItem icon={Printer} onClick={() => { onAction("print", ticket); close(); }}>
              Print
            </MenuItem>
            )}
            {/* 5. WhatsApp Receipt */}
            {canComms && (
            <MenuItem icon={MessageCircle} onClick={() => { onAction("whatsapp-receipt", ticket); close(); }}>
              WhatsApp Receipt
            </MenuItem>
            )}
            {/* 6. Email Receipt */}
            {canComms && (
            <MenuItem icon={Mail} onClick={() => { onAction("email-receipt", ticket); close(); }}>
              Email Receipt
            </MenuItem>
            )}
            {/* 7. Transfer Ticket */}
            {canTransfer && (
            <MenuItem icon={ArrowRightLeft} onClick={() => { onAction("transfer", ticket); close(); }}>
              Transfer Ticket
            </MenuItem>
            )}
            {/* 8. Download PDF */}
            {canDownload && (
            <MenuItem icon={FileDown} onClick={() => { onAction("download-pdf", ticket); close(); }}>
              Download PDF
            </MenuItem>
            )}
            {/* 9. Delete Ticket */}
            {canDelete && (
            <>
            <div className="my-1 border-t border-border" />
            <MenuItem icon={Trash2} danger onClick={() => { onAction("delete", ticket); close(); }}>
              Delete Ticket
            </MenuItem>
            </>
            )}
          </>
        )}
      </Dropdown>
    </div>
  );
}
