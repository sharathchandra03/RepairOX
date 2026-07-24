"use client";

import type { PrintDocumentData } from "@/lib/print-utils";
import { formatPrintCurrency, formatPrintDate, formatPrintTime, formatPrintDateTime } from "@/lib/print-utils";

/* ─── Thermal Receipt Template ───────────────────────────────────────── */

function Divider() {
  return <div className="border-t border-dashed border-gray-400 my-2" />;
}

function DoubleDivider() {
  return <div className="border-t-2 border-gray-700 my-2" />;
}

export function ThermalTemplate({ data }: { data: PrintDocumentData }) {
  const { store, customer, ticket, invoice } = data;
  const isInvoice = !!invoice;
  const isTicket = !!ticket;

  const docNumber = isInvoice ? invoice!.invoiceId : ticket?.ticketId || "";
  const docDate = isInvoice ? formatPrintDate(invoice!.createdAt) : ticket ? formatPrintDate(ticket.createdAt) : data.printDate;
  const docTime = isInvoice ? formatPrintTime(invoice!.createdAt) : ticket ? formatPrintTime(ticket.createdAt) : data.printTime;

  return (
    <div className="thermal-page bg-white text-black font-mono text-[11px] leading-[1.4] shadow-lg" style={{ width: "80mm", minHeight: "200mm", padding: "4mm", margin: "0 auto" }}>
      {/* ── Header / Store Info ── */}
      <div className="text-center">
        {store.logo && (
          <img src={store.logo} alt="Logo" className="h-10 w-10 object-contain mx-auto mb-1" />
        )}
        <p className="text-[13px] font-bold leading-tight">{store.storeName}</p>
        {store.alternateName && (
          <p className="text-[9px] text-gray-600">{store.alternateName}</p>
        )}
        <p className="text-[9px] text-gray-700 mt-0.5">{store.fullAddress}</p>
        <div className="text-[9px] text-gray-600">
          {store.phone && <span>Ph: {store.phone}</span>}
        </div>
        {store.email && <p className="text-[9px] text-gray-600">{store.email}</p>}
        {store.registrationNumber && (
          <p className="text-[9px] font-semibold mt-0.5">GSTIN: {store.registrationNumber}</p>
        )}
      </div>

      <DoubleDivider />

      {/* ── Title ── */}
      <div className="text-center">
        <p className="text-[13px] font-bold tracking-wide uppercase">{data.printTitle}</p>
        <p className="text-[10px] font-semibold">#{docNumber}</p>
      </div>

      <Divider />

      {/* ── Date & Time ── */}
      <div className="flex justify-between text-[9px]">
        <span>Date: {docDate}</span>
        <span>Time: {docTime}</span>
      </div>

      <Divider />

      {/* ── Customer Info ── */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wide mb-0.5">Customer</p>
        <p className="text-[10px] font-semibold">{customer.name}</p>
        {customer.phone && <p className="text-[9px]">Ph: {customer.phone}</p>}
        {customer.email && <p className="text-[9px]">{customer.email}</p>}
        {customer.company && <p className="text-[9px]">{customer.company}</p>}
      </div>

      <Divider />

      {/* ── Device Info (Tickets) ── */}
      {isTicket && ticket && (
        <>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wide mb-0.5">Device Details</p>
            <div className="text-[9px] space-y-0.5">
              <p>{ticket.device} - {ticket.model}</p>
              {ticket.serial && <p>IMEI/SN: {ticket.serial}</p>}
              <p>Issue: {ticket.issue}</p>
              {ticket.service && <p>Service: {ticket.service}</p>}
              <p>Tech: {ticket.technician} | Priority: {ticket.priority}</p>
              {ticket.dueDate && <p>Due: {formatPrintDateTime(ticket.dueDate)}</p>}
            </div>
          </div>
          <Divider />
        </>
      )}

      {/* ── Items / Services ── */}
      <div>
        <p className="text-[9px] font-bold uppercase tracking-wide mb-1">Items / Services</p>
        <div className="text-[9px]">
          {/* Column headers */}
          <div className="flex justify-between font-bold border-b border-gray-300 pb-0.5 mb-1">
            <span className="flex-1">Item</span>
            <span className="w-[28px] text-center">Qty</span>
            <span className="w-[52px] text-right">Amt</span>
          </div>

          {/* Invoice items */}
          {isInvoice && invoice?.items.map((item, i) => (
            <div key={i} className="flex justify-between py-0.5">
              <span className="flex-1 truncate pr-1">{item.name}</span>
              <span className="w-[28px] text-center">{item.qty}</span>
              <span className="w-[52px] text-right">{formatPrintCurrency(item.total)}</span>
            </div>
          ))}

          {/* Ticket parts */}
          {isTicket && ticket?.parts && ticket.parts.length > 0 && ticket.parts.map((part, i) => (
            <div key={i} className="flex justify-between py-0.5">
              <span className="flex-1 truncate pr-1">{part.name}</span>
              <span className="w-[28px] text-center">{part.qty}</span>
              <span className="w-[52px] text-right">{formatPrintCurrency(part.total)}</span>
            </div>
          ))}

          {/* Fallback for tickets without parts */}
          {isTicket && (!ticket?.parts || ticket.parts.length === 0) && (
            <div className="flex justify-between py-0.5">
              <span className="flex-1 truncate pr-1">{ticket?.service || ticket?.issue || "Service"}</span>
              <span className="w-[28px] text-center">1</span>
              <span className="w-[52px] text-right">{formatPrintCurrency(ticket?.amount || 0)}</span>
            </div>
          )}
        </div>
      </div>

      <DoubleDivider />

      {/* ── Totals ── */}
      <div className="text-[10px]">
        {isInvoice && invoice && (
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatPrintCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-{formatPrintCurrency(invoice.discount)}</span>
              </div>
            )}
            {invoice.tax > 0 && (
              <div className="flex justify-between">
                <span>Tax (GST)</span>
                <span>{formatPrintCurrency(invoice.tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-[12px] border-t border-gray-700 pt-1 mt-1">
              <span>TOTAL</span>
              <span>{formatPrintCurrency(invoice.total)}</span>
            </div>
            <div className="flex justify-between mt-0.5">
              <span>Paid</span>
              <span>{formatPrintCurrency(invoice.paidAmount)}</span>
            </div>
            {invoice.balance > 0 && (
              <div className="flex justify-between font-bold">
                <span>Balance Due</span>
                <span>{formatPrintCurrency(invoice.balance)}</span>
              </div>
            )}
            {invoice.paidAmount >= invoice.total && (
              <div className="flex justify-between">
                <span>Change</span>
                <span>{formatPrintCurrency(invoice.paidAmount - invoice.total)}</span>
              </div>
            )}
          </div>
        )}

        {isTicket && ticket && (
          <div className="flex justify-between font-bold text-[12px]">
            <span>TOTAL</span>
            <span>{formatPrintCurrency(ticket.amount)}</span>
          </div>
        )}
      </div>

      <Divider />

      {/* ── Terms & Warranty ── */}
      {data.termsAndConditions && (
        <div className="mt-1">
          <p className="text-[8px] font-bold uppercase tracking-wide mb-0.5">Terms & Conditions</p>
          <p className="text-[8px] text-gray-700 whitespace-pre-line leading-[1.3]">{data.termsAndConditions}</p>
        </div>
      )}

      {data.warrantyText && (
        <div className="mt-2">
          <p className="text-[8px] font-bold uppercase tracking-wide mb-0.5">Warranty</p>
          <p className="text-[8px] text-gray-700 whitespace-pre-line leading-[1.3]">{data.warrantyText}</p>
        </div>
      )}

      <Divider />

      {/* ── Signature ── */}
      <div className="mt-3">
        <div className="border-b border-gray-400 mb-0.5 h-6"></div>
        <p className="text-[8px] text-gray-500 text-center">Customer Signature</p>
      </div>

      {/* ── Footer ── */}
      {data.printFooter && (
        <div className="mt-3 text-center">
          <Divider />
          <p className="text-[9px] font-semibold mt-1">{data.printFooter}</p>
        </div>
      )}

      {/* ── Cut line indicator ── */}
      <div className="mt-4 text-center text-[8px] text-gray-400">
        <p>- - - - - - - - - - - - - - - - -</p>
      </div>
    </div>
  );
}
