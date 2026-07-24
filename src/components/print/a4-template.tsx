"use client";

import type { PrintDocumentData } from "@/lib/print-utils";
import { formatPrintCurrency, formatPrintDate, formatPrintTime, formatPrintDateTime } from "@/lib/print-utils";

/* ─── A4 Print Template ──────────────────────────────────────────────── */

export function A4Template({ data }: { data: PrintDocumentData }) {
  const { store, customer, ticket, invoice, printTitle, printDate, printTime } = data;
  const isInvoice = !!invoice;
  const isTicket = !!ticket;

  const docNumber = isInvoice ? invoice!.invoiceId : ticket?.ticketId || "";
  const docDate = isInvoice ? formatPrintDate(invoice!.createdAt) : ticket ? formatPrintDate(ticket.createdAt) : printDate;
  const docTime = isInvoice ? formatPrintTime(invoice!.createdAt) : ticket ? formatPrintTime(ticket.createdAt) : printTime;

  return (
    <div className="a4-page bg-white text-black font-sans text-[11px] leading-relaxed shadow-lg" style={{ width: "210mm", minHeight: "297mm", padding: "15mm", margin: "0 auto" }}>
      {/* ── Header ── */}
      <header className="flex items-start justify-between border-b-2 border-gray-800 pb-4 mb-5">
        <div className="flex items-start gap-4">
          {store.logo && (
            <img src={store.logo} alt="Logo" className="h-14 w-14 object-contain rounded" />
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900 leading-tight">{store.storeName}</h1>
            {store.alternateName && (
              <p className="text-[10px] text-gray-500 font-medium">{store.alternateName}</p>
            )}
            <p className="text-[10px] text-gray-600 mt-1 max-w-[280px]">{store.fullAddress}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-[10px] text-gray-600">
              {store.phone && <span>Ph: {store.phone}</span>}
              {store.mobile && store.mobile !== store.phone && <span>Mob: {store.mobile}</span>}
              {store.email && <span>{store.email}</span>}
            </div>
            {store.website && <p className="text-[10px] text-gray-500">{store.website}</p>}
            {store.registrationNumber && (
              <p className="text-[10px] font-semibold text-gray-700 mt-0.5">GSTIN: {store.registrationNumber}</p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <h2 className="text-lg font-bold text-gray-800 uppercase tracking-wide">{printTitle}</h2>
          <div className="mt-2 text-[10px] text-gray-600 space-y-0.5">
            <p><span className="font-semibold text-gray-700">No:</span> {docNumber}</p>
            <p><span className="font-semibold text-gray-700">Date:</span> {docDate}</p>
            <p><span className="font-semibold text-gray-700">Time:</span> {docTime}</p>
          </div>
        </div>
      </header>

      {/* ── Customer & Ticket/Invoice Meta ── */}
      <section className="grid grid-cols-2 gap-6 mb-5">
        {/* Customer */}
        <div className="border border-gray-200 rounded-lg p-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Bill To / Customer</p>
          <p className="font-semibold text-sm text-gray-900">{customer.name}</p>
          {customer.company && <p className="text-[10px] text-gray-600">{customer.company}</p>}
          <div className="mt-1 space-y-0.5 text-[10px] text-gray-600">
            {customer.phone && <p>Phone: {customer.phone}</p>}
            {customer.email && <p>Email: {customer.email}</p>}
            {customer.address && <p>Address: {customer.address}</p>}
          </div>
        </div>

        {/* Ticket/Device Info or Invoice Meta */}
        {isTicket && ticket && (
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Device Information</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <div><span className="text-gray-500">Device:</span> <span className="font-medium">{ticket.device}</span></div>
              <div><span className="text-gray-500">Model:</span> <span className="font-medium">{ticket.model}</span></div>
              {ticket.serial && <div><span className="text-gray-500">IMEI/Serial:</span> <span className="font-medium">{ticket.serial}</span></div>}
              <div><span className="text-gray-500">Issue:</span> <span className="font-medium">{ticket.issue}</span></div>
              {ticket.service && <div><span className="text-gray-500">Service:</span> <span className="font-medium">{ticket.service}</span></div>}
              <div><span className="text-gray-500">Priority:</span> <span className="font-medium capitalize">{ticket.priority}</span></div>
              <div><span className="text-gray-500">Technician:</span> <span className="font-medium">{ticket.technician}</span></div>
              <div><span className="text-gray-500">Source:</span> <span className="font-medium">{ticket.source}</span></div>
              {ticket.dueDate && <div className="col-span-2"><span className="text-gray-500">Expected by:</span> <span className="font-medium">{formatPrintDateTime(ticket.dueDate)}</span></div>}
            </div>
          </div>
        )}

        {isInvoice && invoice && (
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Invoice Details</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
              <div><span className="text-gray-500">Reference:</span> <span className="font-medium">{invoice.reference}</span></div>
              <div><span className="text-gray-500">Type:</span> <span className="font-medium capitalize">{invoice.invoiceType}</span></div>
              <div><span className="text-gray-500">Status:</span> <span className="font-medium capitalize">{invoice.status}</span></div>
              <div><span className="text-gray-500">Due Date:</span> <span className="font-medium">{formatPrintDate(invoice.dueDate)}</span></div>
              {invoice.employee && <div><span className="text-gray-500">Salesperson:</span> <span className="font-medium">{invoice.employee}</span></div>}
              {invoice.ticketId && <div><span className="text-gray-500">Ticket:</span> <span className="font-medium">{invoice.ticketId}</span></div>}
            </div>
          </div>
        )}
      </section>

      {/* ── Items Table ── */}
      <section className="mb-5">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left py-2 px-2.5 font-semibold text-gray-700 border border-gray-200 w-[5%]">#</th>
              <th className="text-left py-2 px-2.5 font-semibold text-gray-700 border border-gray-200">Item / Service</th>
              <th className="text-center py-2 px-2.5 font-semibold text-gray-700 border border-gray-200 w-[8%]">Qty</th>
              <th className="text-right py-2 px-2.5 font-semibold text-gray-700 border border-gray-200 w-[14%]">Price</th>
              <th className="text-right py-2 px-2.5 font-semibold text-gray-700 border border-gray-200 w-[12%]">Discount</th>
              <th className="text-right py-2 px-2.5 font-semibold text-gray-700 border border-gray-200 w-[14%]">Total</th>
            </tr>
          </thead>
          <tbody>
            {isInvoice && invoice?.items.map((item, i) => (
              <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                <td className="py-1.5 px-2.5 border border-gray-200 text-gray-600">{i + 1}</td>
                <td className="py-1.5 px-2.5 border border-gray-200">
                  <span className="font-medium text-gray-800">{item.name}</span>
                  {item.description && <span className="block text-[9px] text-gray-500">{item.description}</span>}
                </td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-center">{item.qty}</td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-right">{formatPrintCurrency(item.price)}</td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-right">{item.discount > 0 ? formatPrintCurrency(item.discount) : "—"}</td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-right font-medium">{formatPrintCurrency(item.total)}</td>
              </tr>
            ))}

            {isTicket && ticket?.parts && ticket.parts.length > 0 && ticket.parts.map((part, i) => (
              <tr key={i} className={i % 2 === 1 ? "bg-gray-50" : ""}>
                <td className="py-1.5 px-2.5 border border-gray-200 text-gray-600">{i + 1}</td>
                <td className="py-1.5 px-2.5 border border-gray-200 font-medium text-gray-800">{part.name}</td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-center">{part.qty}</td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-right">{formatPrintCurrency(part.price)}</td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-right">{part.discount > 0 ? formatPrintCurrency(part.discount) : "—"}</td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-right font-medium">{formatPrintCurrency(part.total)}</td>
              </tr>
            ))}

            {isTicket && (!ticket?.parts || ticket.parts.length === 0) && (
              <tr>
                <td className="py-1.5 px-2.5 border border-gray-200 text-gray-600">1</td>
                <td className="py-1.5 px-2.5 border border-gray-200 font-medium text-gray-800">{ticket?.service || ticket?.issue || "Repair Service"}</td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-center">1</td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-right">{formatPrintCurrency(ticket?.amount || 0)}</td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-right">—</td>
                <td className="py-1.5 px-2.5 border border-gray-200 text-right font-medium">{formatPrintCurrency(ticket?.amount || 0)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ── Totals ── */}
      <section className="flex justify-end mb-6">
        <div className="w-[240px] text-[10px]">
          {isInvoice && invoice && (
            <div className="space-y-1">
              <div className="flex justify-between py-0.5">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatPrintCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between py-0.5">
                  <span className="text-gray-600">Discount</span>
                  <span className="font-medium text-green-700">-{formatPrintCurrency(invoice.discount)}</span>
                </div>
              )}
              {invoice.tax > 0 && (
                <div className="flex justify-between py-0.5">
                  <span className="text-gray-600">Tax (GST)</span>
                  <span className="font-medium">{formatPrintCurrency(invoice.tax)}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-t-2 border-gray-800 font-bold text-sm">
                <span>Total</span>
                <span>{formatPrintCurrency(invoice.total)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-gray-600">Paid</span>
                <span className="font-medium text-green-700">{formatPrintCurrency(invoice.paidAmount)}</span>
              </div>
              {invoice.balance > 0 && (
                <div className="flex justify-between py-1 border-t border-gray-300 font-semibold text-rose-700">
                  <span>Balance Due</span>
                  <span>{formatPrintCurrency(invoice.balance)}</span>
                </div>
              )}
            </div>
          )}

          {isTicket && ticket && (
            <div className="space-y-1">
              <div className="flex justify-between py-1.5 border-t-2 border-gray-800 font-bold text-sm">
                <span>Total Amount</span>
                <span>{formatPrintCurrency(ticket.amount)}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Terms & Warranty ── */}
      <section className="border-t border-gray-200 pt-4 mb-5">
        <div className="grid grid-cols-1 gap-4">
          {data.termsAndConditions && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Terms & Conditions</p>
              <p className="text-[9px] text-gray-600 whitespace-pre-line leading-relaxed">{data.termsAndConditions}</p>
            </div>
          )}
          {data.warrantyText && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Warranty Information</p>
              <p className="text-[9px] text-gray-600 whitespace-pre-line leading-relaxed">{data.warrantyText}</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Signature Area ── */}
      <section className="grid grid-cols-2 gap-8 mt-8 pt-4">
        <div>
          <div className="border-b border-gray-400 mb-1 h-10"></div>
          <p className="text-[9px] text-gray-500">Customer Signature</p>
        </div>
        <div>
          <div className="border-b border-gray-400 mb-1 h-10"></div>
          <p className="text-[9px] text-gray-500">
            Authorized Signatory
            {isInvoice && invoice?.employee && ` (${invoice.employee})`}
            {isTicket && ticket?.technician && ` (${ticket.technician})`}
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      {data.printFooter && (
        <footer className="mt-6 pt-3 border-t border-gray-200 text-center">
          <p className="text-[10px] font-medium text-gray-600">{data.printFooter}</p>
        </footer>
      )}
    </div>
  );
}
