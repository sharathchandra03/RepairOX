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

/** Label/Value row — compact and aligned for thermal width */
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-1 text-[9px] leading-[1.4]">
      <span className="text-gray-600 shrink-0">{label}:</span>
      <span className={`text-right truncate ${bold ? "font-bold" : "font-medium"} text-gray-900`}>{value}</span>
    </div>
  );
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
        {/* Invoice Payment Status Badge */}
        {isInvoice && invoice && (
          <p
            className="mt-1 text-[10px] font-bold uppercase tracking-wider"
            style={
              invoice.status === "paid"
                ? { color: "#166534" }
                : invoice.status === "overdue"
                ? { color: "#991b1b" }
                : invoice.status === "partial"
                ? { color: "#92400e" }
                : { color: "#92400e" }
            }
          >
            {invoice.status === "paid" ? "● PAID" : invoice.status === "overdue" ? "● OVERDUE" : invoice.status === "partial" ? "● PARTIAL" : "● DUE"}
          </p>
        )}
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

      {/* ── TICKET: Unified Device Blocks ── */}
      {isTicket && ticket && (
        <>
          {ticket.devices && ticket.devices.length > 1 ? (
            /* Multi-device: each device gets one unified block */
            <div className="space-y-2">
              {ticket.devices.map((dev, idx) => (
                <div key={dev.id}>
                  {idx > 0 && <Divider />}
                  <p className="text-[9px] font-bold uppercase tracking-wide mb-1">
                    Device {idx + 1} of {ticket.devices!.length}
                  </p>
                  {/* Device identity */}
                  <div className="space-y-0.5 mb-1">
                    <Row label="Device" value={`${dev.brand} ${dev.model}`} bold />
                    {dev.serial && <Row label={dev.serialLabel || "IMEI/SN"} value={dev.serial} />}
                  </div>
                  {/* Job details */}
                  <div className="space-y-0.5 mb-1">
                    <Row label="Issue" value={dev.issue || "General service"} />
                    <Row label="Technician" value={dev.technician || "Unassigned"} />
                    <Row label="Priority" value={dev.priority || "Normal"} />
                    <Row label="Status" value={(dev.status || "Received").charAt(0).toUpperCase() + (dev.status || "received").slice(1)} />
                    <Row label="Estimate" value={formatPrintCurrency(dev.estimate)} bold />
                  </div>
                  {/* Parts assigned to this device */}
                  {dev.parts.length > 0 && (
                    <div className="mt-1">
                      <p className="text-[8px] font-bold uppercase tracking-wide text-gray-500 mb-0.5">Parts</p>
                      {dev.parts.map((part, pi) => (
                        <div key={pi} className="flex justify-between text-[9px] py-0.5">
                          <span className="flex-1 truncate pr-1">{part.name}</span>
                          <span className="w-[24px] text-center">{part.qty}</span>
                          <span className="w-[48px] text-right font-medium">{formatPrintCurrency(part.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Single device: one unified block */
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide mb-1">Device & Service</p>
              <div className="space-y-0.5 mb-1">
                <Row label="Device" value={`${ticket.device} ${ticket.model}`} bold />
                {ticket.serial && <Row label={ticket.serialLabel || "IMEI/SN"} value={ticket.serial} />}
              </div>
              <div className="space-y-0.5 mb-1">
                <Row label="Issue" value={ticket.issue} />
                {ticket.service && ticket.service !== ticket.issue && <Row label="Service" value={ticket.service} />}
                <Row label="Technician" value={ticket.technician || "Unassigned"} />
                <Row label="Priority" value={ticket.priority} />
                {ticket.warranty && <Row label="Warranty" value={ticket.warranty} />}
                <Row label="Status" value={ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)} bold />
                <Row label="Source" value={ticket.source || "Walk-In"} />
                {ticket.dueDate && <Row label="Due" value={formatPrintDateTime(ticket.dueDate)} />}
              </div>
              {/* Parts */}
              {ticket.parts && ticket.parts.length > 0 && (
                <div className="mt-1">
                  <p className="text-[8px] font-bold uppercase tracking-wide text-gray-500 mb-0.5">Parts</p>
                  <div className="flex justify-between font-bold text-[8px] border-b border-gray-300 pb-0.5 mb-0.5">
                    <span className="flex-1">Item</span>
                    <span className="w-[24px] text-center">Qty</span>
                    <span className="w-[48px] text-right">Amt</span>
                  </div>
                  {ticket.parts.map((part, i) => (
                    <div key={i} className="flex justify-between text-[9px] py-0.5">
                      <span className="flex-1 truncate pr-1">{part.name}</span>
                      <span className="w-[24px] text-center">{part.qty}</span>
                      <span className="w-[48px] text-right font-medium">{formatPrintCurrency(part.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DoubleDivider />

          {/* Ticket total */}
          <div className="flex justify-between font-bold text-[12px]">
            <span>TOTAL</span>
            <span>{formatPrintCurrency(ticket.amount)}</span>
          </div>
        </>
      )}

      {/* ── INVOICE: Unified structure ── */}
      {isInvoice && invoice && (
        <>
          {/* Invoice meta */}
          <div className="mb-1">
            <p className="text-[9px] font-bold uppercase tracking-wide mb-0.5">Invoice Details</p>
            <div className="space-y-0.5">
              {invoice.ticketId && <Row label="Ticket" value={invoice.linkedTicketNo || invoice.ticketId} />}
              <Row label="Type" value={invoice.serviceCategory === "accessories" ? "Accessories Invoice" : invoice.invoiceType === "business" ? "Tax Invoice" : "Retail Invoice"} />
              <Row label="Category" value={(invoice.serviceCategory || "service").charAt(0).toUpperCase() + (invoice.serviceCategory || "service").slice(1)} />
              <div className="flex justify-between gap-1 text-[9px] leading-[1.4]">
                <span className="text-gray-600 shrink-0">Status:</span>
                <span
                  className="text-right font-bold"
                  style={
                    invoice.status === "paid"
                      ? { color: "#166534" }
                      : invoice.status === "overdue"
                      ? { color: "#991b1b" }
                      : invoice.status === "partial"
                      ? { color: "#92400e" }
                      : { color: "#92400e" }
                  }
                >
                  {invoice.status === "paid" ? "Paid" : invoice.status === "overdue" ? "Overdue" : invoice.status === "partial" ? "Partial" : "Due"}
                </span>
              </div>
              <Row label="Due" value={formatPrintDate(invoice.dueDate)} />
              {invoice.paymentMode && <Row label="Payment" value={invoice.paymentMode.replace("_", " ")} />}
              {invoice.employee && <Row label="Employee" value={invoice.employee} />}
            </div>
          </div>

          <Divider />

          {/* Multi-device invoice: per-device blocks */}
          {invoice.devices && invoice.devices.length > 0 ? (
            <div className="space-y-2">
              {invoice.devices.map((dev, idx) => (
                <div key={dev.id}>
                  {idx > 0 && <Divider />}
                  <p className="text-[9px] font-bold uppercase tracking-wide mb-1">
                    Device {idx + 1} of {invoice.devices!.length}
                  </p>
                  <div className="space-y-0.5 mb-1">
                    <Row label="Device" value={`${dev.brand} ${dev.model}`} bold />
                    {dev.serial && <Row label={dev.serialLabel || "IMEI/SN"} value={dev.serial} />}
                  </div>
                  <div className="space-y-0.5 mb-1">
                    <Row label="Issue" value={dev.issue || "Service"} />
                    <Row label="Technician" value={dev.technician || "—"} />
                    {dev.priority && dev.priority !== "normal" && <Row label="Priority" value={dev.priority} />}
                    <Row label="Subtotal" value={formatPrintCurrency(dev.subtotal)} bold />
                  </div>
                  {dev.parts.length > 0 && (
                    <div className="mt-1">
                      <p className="text-[8px] font-bold uppercase tracking-wide text-gray-500 mb-0.5">Parts</p>
                      {dev.parts.map((part, pi) => (
                        <div key={pi} className="flex justify-between text-[9px] py-0.5">
                          <span className="flex-1 truncate pr-1">{part.name}</span>
                          <span className="w-[24px] text-center">{part.qty}</span>
                          <span className="w-[48px] text-right font-medium">{formatPrintCurrency(part.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Legacy flat items */
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide mb-1">Items / Services</p>
              <div className="flex justify-between font-bold text-[8px] border-b border-gray-300 pb-0.5 mb-0.5">
                <span className="flex-1">Item</span>
                <span className="w-[24px] text-center">Qty</span>
                <span className="w-[48px] text-right">Amt</span>
              </div>
              {invoice.items.map((item, i) => (
                <div key={i} className="py-0.5">
                  <div className="flex justify-between text-[9px]">
                    <span className="flex-1 truncate pr-1 font-medium">{item.name}</span>
                    <span className="w-[24px] text-center">{item.qty}</span>
                    <span className="w-[48px] text-right font-medium">{formatPrintCurrency(item.total)}</span>
                  </div>
                  {item.description && (
                    <p className="text-[8px] text-gray-500 pl-1 truncate">{item.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <DoubleDivider />

          {/* Invoice totals */}
          <div className="text-[10px] space-y-0.5">
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
            {invoice.sgst && invoice.sgst > 0 ? (
              <>
                <div className="flex justify-between">
                  <span>SGST ({invoice.sgstRate || 0}%)</span>
                  <span>{formatPrintCurrency(invoice.sgst)}</span>
                </div>
                {invoice.cgst !== undefined && invoice.cgst > 0 && (
                  <div className="flex justify-between">
                    <span>CGST ({invoice.cgstRate || 0}%)</span>
                    <span>{formatPrintCurrency(invoice.cgst)}</span>
                  </div>
                )}
              </>
            ) : invoice.tax > 0 ? (
              <div className="flex justify-between">
                <span>Tax (GST)</span>
                <span>{formatPrintCurrency(invoice.tax)}</span>
              </div>
            ) : null}
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
            {invoice.paidAmount >= invoice.total && invoice.paidAmount > 0 && (
              <div className="flex justify-between">
                <span>Change</span>
                <span>{formatPrintCurrency(invoice.paidAmount - invoice.total)}</span>
              </div>
            )}
          </div>
        </>
      )}

      <Divider />

      {/* ── Invoice Notes & Terms ── */}
      {isInvoice && invoice && invoice.notes && (
        <div className="mt-1">
          <p className="text-[8px] font-bold uppercase tracking-wide mb-0.5">Notes</p>
          <p className="text-[8px] text-gray-700 whitespace-pre-line leading-[1.3]">{invoice.notes}</p>
        </div>
      )}

      {isInvoice && invoice && invoice.terms && (
        <div className="mt-1">
          <p className="text-[8px] font-bold uppercase tracking-wide mb-0.5">Invoice Terms</p>
          <p className="text-[8px] text-gray-700 whitespace-pre-line leading-[1.3]">{invoice.terms}</p>
        </div>
      )}

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
      {(data.printFooter || (isInvoice && invoice?.footer)) && (
        <div className="mt-3 text-center">
          <Divider />
          <p className="text-[9px] font-semibold mt-1">{data.printFooter || invoice?.footer}</p>
        </div>
      )}

      {/* ── Cut line indicator ── */}
      <div className="mt-4 text-center text-[8px] text-gray-400">
        <p>- - - - - - - - - - - - - - - - -</p>
      </div>
    </div>
  );
}
