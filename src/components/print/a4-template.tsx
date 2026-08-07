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

      {/* ── Customer Info (shared, shown once) ── */}
      <section className="mb-5">
        <div className="border border-gray-200 rounded-lg p-3 mb-3">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-1">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Customer</p>
              <p className="font-semibold text-[11px] text-gray-900">{customer.name}</p>
              {customer.company && <p className="text-[9px] text-gray-600">{customer.company}</p>}
            </div>
            {customer.phone && <div><p className="text-[9px] text-gray-400">Phone</p><p className="text-[10px] font-medium text-gray-800">{customer.phone}</p></div>}
            {customer.email && <div><p className="text-[9px] text-gray-400">Email</p><p className="text-[10px] font-medium text-gray-800">{customer.email}</p></div>}
            {customer.address && <div><p className="text-[9px] text-gray-400">Address</p><p className="text-[10px] font-medium text-gray-800 max-w-[200px]">{customer.address}</p></div>}
          </div>
        </div>

        {/* ── TICKET: Unified Device Blocks ── */}
        {isTicket && ticket && (
          <>
            {ticket.devices && ticket.devices.length > 1 ? (
              /* Multi-device: each device is a single unified block with all its info */
              <div className="space-y-3">
                {ticket.devices.map((dev, idx) => (
                  <div key={dev.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="grid h-5 w-5 place-items-center rounded bg-gray-800 text-[9px] font-bold text-white">{idx + 1}</span>
                      <p className="text-[10px] font-bold text-gray-900">{dev.brand} {dev.model}</p>
                      {dev.serial && <span className="text-[9px] text-gray-500 ml-auto font-mono">{dev.serial}</span>}
                    </div>
                    {/* Device + Job details — grid layout */}
                    <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[10px] mb-2">
                      <div><span className="text-gray-500">Issue:</span> <span className="font-medium">{dev.issue || "—"}</span></div>
                      <div><span className="text-gray-500">Technician:</span> <span className="font-medium">{dev.technician || "Unassigned"}</span></div>
                      <div><span className="text-gray-500">Priority:</span> <span className="font-medium capitalize">{dev.priority || "Normal"}</span></div>
                      <div><span className="text-gray-500">Status:</span> <span className="font-medium capitalize">{dev.status || "In Progress"}</span></div>
                      <div><span className="text-gray-500">Estimate:</span> <span className="font-bold">{formatPrintCurrency(dev.estimate)}</span></div>
                    </div>
                    {/* Parts for this device */}
                    {dev.parts.length > 0 && (
                      <div className="border-t border-gray-100 pt-1.5 mt-1.5">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400 mb-1">Assigned Parts</p>
                        <table className="w-full text-[9px]">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-left font-semibold pb-0.5">Part</th>
                              <th className="text-center font-semibold pb-0.5 w-[40px]">Qty</th>
                              <th className="text-right font-semibold pb-0.5 w-[70px]">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dev.parts.map((part, pi) => (
                              <tr key={pi}>
                                <td className="py-0.5 font-medium text-gray-800">{part.name}</td>
                                <td className="py-0.5 text-center">{part.qty}</td>
                                <td className="py-0.5 text-right font-medium">{formatPrintCurrency(part.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Single device: unified block with device + job + parts */
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-2">Device & Service Details</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[10px]">
                  <div><span className="text-gray-500">Device:</span> <span className="font-semibold">{ticket.device}</span></div>
                  <div><span className="text-gray-500">Model:</span> <span className="font-semibold">{ticket.model}</span></div>
                  {ticket.serial && <div><span className="text-gray-500">IMEI/Serial:</span> <span className="font-medium font-mono">{ticket.serial}</span></div>}
                  <div><span className="text-gray-500">Issue:</span> <span className="font-medium">{ticket.issue}</span></div>
                  {ticket.service && ticket.service !== ticket.issue && <div><span className="text-gray-500">Service:</span> <span className="font-medium">{ticket.service}</span></div>}
                  <div><span className="text-gray-500">Technician:</span> <span className="font-medium">{ticket.technician}</span></div>
                  <div><span className="text-gray-500">Priority:</span> <span className="font-medium capitalize">{ticket.priority}</span></div>
                  <div><span className="text-gray-500">Status:</span> <span className="font-semibold capitalize">{ticket.status}</span></div>
                  <div><span className="text-gray-500">Source:</span> <span className="font-medium">{ticket.source}</span></div>
                  {ticket.dueDate && <div className="col-span-2"><span className="text-gray-500">Expected by:</span> <span className="font-medium">{formatPrintDateTime(ticket.dueDate)}</span></div>}
                </div>
                {/* Parts */}
                {ticket.parts && ticket.parts.length > 0 && (
                  <div className="border-t border-gray-100 pt-2 mt-2">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-gray-400 mb-1">Assigned Parts</p>
                    <table className="w-full text-[9px]">
                      <thead>
                        <tr className="text-gray-500 border-b border-gray-100">
                          <th className="text-left font-semibold pb-1">Part</th>
                          <th className="text-center font-semibold pb-1 w-[40px]">Qty</th>
                          <th className="text-right font-semibold pb-1 w-[70px]">Price</th>
                          <th className="text-right font-semibold pb-1 w-[70px]">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ticket.parts.map((part, i) => (
                          <tr key={i}>
                            <td className="py-0.5 font-medium text-gray-800">{part.name}</td>
                            <td className="py-0.5 text-center">{part.qty}</td>
                            <td className="py-0.5 text-right">{formatPrintCurrency(part.price)}</td>
                            <td className="py-0.5 text-right font-medium">{formatPrintCurrency(part.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── INVOICE: Details block ── */}
        {isInvoice && invoice && (
          <div className="border border-gray-200 rounded-lg p-3">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Invoice Details</p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[10px]">
              <div><span className="text-gray-500">Reference:</span> <span className="font-medium">{invoice.reference}</span></div>
              <div><span className="text-gray-500">Type:</span> <span className="font-medium capitalize">{invoice.serviceCategory === "accessories" ? "Accessories Invoice" : invoice.invoiceType === "business" ? "Tax Invoice" : "Retail Invoice"}</span></div>
              <div><span className="text-gray-500">Category:</span> <span className="font-medium capitalize">{invoice.serviceCategory || "service"}</span></div>
              <div><span className="text-gray-500">Status:</span> <span className="font-semibold capitalize">{invoice.status}</span></div>
              <div><span className="text-gray-500">Due Date:</span> <span className="font-medium">{formatPrintDate(invoice.dueDate)}</span></div>
              {invoice.employee && <div><span className="text-gray-500">Salesperson:</span> <span className="font-medium">{invoice.employee}</span></div>}
              {invoice.paymentMode && <div><span className="text-gray-500">Payment:</span> <span className="font-medium capitalize">{invoice.paymentMode.replace("_", " ")}</span></div>}
              {invoice.ticketId && <div><span className="text-gray-500">Ticket:</span> <span className="font-medium">{invoice.ticketId}</span></div>}
            </div>
          </div>
        )}
      </section>

      {/* ── Items Table (Invoice) / Summary Table (Ticket with multi-device) ── */}
      {isInvoice && invoice && (
        <section className="mb-5">
          {/* Multi-device: per-device blocks with parts */}
          {invoice.devices && invoice.devices.length > 0 ? (
            <div className="space-y-3">
              {invoice.devices.map((dev, idx) => (
                <div key={dev.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 bg-gray-50 px-3 py-2">
                    <span className="grid h-5 w-5 place-items-center rounded bg-gray-800 text-[9px] font-bold text-white">{idx + 1}</span>
                    <p className="text-[10px] font-bold text-gray-900">{dev.brand} {dev.model}</p>
                    {dev.serial && <span className="text-[9px] text-gray-500 ml-auto font-mono">{dev.serial}</span>}
                  </div>
                  {/* Device job details */}
                  <div className="px-3 py-1.5 border-b border-gray-100 grid grid-cols-3 gap-x-4 gap-y-0.5 text-[9px]">
                    {dev.issue && <div><span className="text-gray-500">Issue:</span> <span className="font-medium">{dev.issue}</span></div>}
                    {dev.technician && <div><span className="text-gray-500">Technician:</span> <span className="font-medium">{dev.technician}</span></div>}
                    {dev.priority && dev.priority !== "normal" && <div><span className="text-gray-500">Priority:</span> <span className="font-medium capitalize">{dev.priority}</span></div>}
                    {dev.warranty && <div><span className="text-gray-500">Warranty:</span> <span className="font-medium">{dev.warranty}</span></div>}
                  </div>
                  {/* Parts table */}
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr className="bg-gray-50/60">
                        <th className="text-left py-1.5 px-2.5 font-semibold text-gray-600 w-[5%]">#</th>
                        <th className="text-left py-1.5 px-2.5 font-semibold text-gray-600">Item / Part</th>
                        <th className="text-center py-1.5 px-2.5 font-semibold text-gray-600 w-[8%]">Qty</th>
                        <th className="text-right py-1.5 px-2.5 font-semibold text-gray-600 w-[14%]">Price</th>
                        <th className="text-right py-1.5 px-2.5 font-semibold text-gray-600 w-[14%]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dev.parts.map((part, pi) => (
                        <tr key={pi} className={pi % 2 === 1 ? "bg-gray-50/40" : ""}>
                          <td className="py-1 px-2.5 text-gray-500">{pi + 1}</td>
                          <td className="py-1 px-2.5 font-medium text-gray-800">{part.name}</td>
                          <td className="py-1 px-2.5 text-center">{part.qty}</td>
                          <td className="py-1 px-2.5 text-right">{formatPrintCurrency(part.price)}</td>
                          <td className="py-1 px-2.5 text-right font-medium">{formatPrintCurrency(part.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200">
                        <td colSpan={4} className="py-1.5 px-2.5 text-right text-[9px] font-semibold text-gray-600">Device Subtotal</td>
                        <td className="py-1.5 px-2.5 text-right font-bold">{formatPrintCurrency(dev.subtotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            /* Legacy flat items table */
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
                {invoice.items.map((item, i) => (
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
              </tbody>
            </table>
          )}
        </section>
      )}

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

      {/* ── Notes (Invoice) ── */}
      {isInvoice && invoice && invoice.notes && (
        <section className="mb-4">
          <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Notes</p>
            <p className="text-[10px] text-gray-700 whitespace-pre-line">{invoice.notes}</p>
          </div>
        </section>
      )}

      {/* ── Invoice Terms (from invoice form) ── */}
      {isInvoice && invoice && invoice.terms && (
        <section className="mb-4">
          <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Terms & Warranty</p>
            <p className="text-[10px] text-gray-700 whitespace-pre-line">{invoice.terms}</p>
          </div>
        </section>
      )}

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
      {(data.printFooter || (isInvoice && invoice?.footer)) && (
        <footer className="mt-6 pt-3 border-t border-gray-200 text-center">
          <p className="text-[10px] font-medium text-gray-600">{data.printFooter || invoice?.footer}</p>
        </footer>
      )}
    </div>
  );
}
