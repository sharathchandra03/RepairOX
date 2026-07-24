"use client";

import type { PrintDocumentData } from "@/lib/print-utils";
import { formatPrintDate, formatPrintTime } from "@/lib/print-utils";

/* ─── Label Print Template (Tickets Only) ────────────────────────────── */

export function LabelTemplate({ data }: { data: PrintDocumentData }) {
  const { store, customer, ticket } = data;

  if (!ticket) {
    return (
      <div className="label-page bg-white text-black font-sans text-[8px] flex items-center justify-center" style={{ width: "62mm", height: "30mm", padding: "2mm", margin: "0 auto" }}>
        <p className="text-gray-500">Label print is only available for tickets.</p>
      </div>
    );
  }

  return (
    <div className="label-page bg-white text-black font-sans shadow-lg border border-gray-300" style={{ width: "62mm", minHeight: "30mm", padding: "2mm", margin: "0 auto" }}>
      {/* Row 1: Ticket ID + Store */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-[11px] font-bold leading-none">{ticket.ticketId}</p>
          <p className="text-[7px] text-gray-500 mt-0.5">{store.storeName}</p>
        </div>
        <div className="text-right">
          <p className="text-[7px] text-gray-600">{formatPrintDate(ticket.createdAt)}</p>
          <p className="text-[7px] text-gray-600">{formatPrintTime(ticket.createdAt)}</p>
        </div>
      </div>

      {/* Thin divider */}
      <div className="border-t border-gray-300 my-1" />

      {/* Row 2: Customer + Device */}
      <div className="grid grid-cols-2 gap-1 text-[8px]">
        <div>
          <p className="text-[6px] font-bold uppercase text-gray-400 leading-none">Customer</p>
          <p className="font-semibold leading-tight truncate">{customer.name}</p>
          {customer.phone && <p className="text-[7px] text-gray-600 truncate">{customer.phone}</p>}
        </div>
        <div>
          <p className="text-[6px] font-bold uppercase text-gray-400 leading-none">Device</p>
          <p className="font-semibold leading-tight truncate">{ticket.model}</p>
          {ticket.serial && <p className="text-[7px] text-gray-600 truncate">SN: {ticket.serial}</p>}
        </div>
      </div>

      {/* Row 3: Issue */}
      <div className="mt-1">
        <p className="text-[6px] font-bold uppercase text-gray-400 leading-none">Issue</p>
        <p className="text-[8px] font-medium leading-tight truncate">{ticket.issue}</p>
      </div>

      {/* Row 4: Barcode placeholder (ticket number as text-barcode) */}
      <div className="mt-1.5 text-center border-t border-gray-200 pt-1">
        <div className="inline-flex items-center gap-0.5">
          {/* Simple barcode-style visual using CSS */}
          {ticket.ticketId.split("").map((char, i) => (
            <span
              key={i}
              className="inline-block bg-black"
              style={{
                width: `${((char.charCodeAt(0) % 3) + 1)}px`,
                height: "14px",
                marginRight: "0.5px",
              }}
            />
          ))}
        </div>
        <p className="text-[7px] font-mono mt-0.5">{ticket.ticketId}</p>
      </div>
    </div>
  );
}
