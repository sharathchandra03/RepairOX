"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, Pencil, MoreHorizontal, Printer, Trash2, FileDown, Mail,
  Receipt, User, Phone, CreditCard, Calendar, Tag, Building2,
  CheckCircle2, StickyNote, Ticket as TicketIcon, Check, Copy,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Drawer } from "@/components/ui/drawer";
import { Textarea, Select, NumericInput } from "@/components/ui/input";
import { QuickEditDrawer } from "@/components/ui/quick-edit-drawer";
import { useStore } from "@/lib/store";
import { formatINR, cn } from "@/lib/utils";
import {
  INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, INVOICE_TYPE_LABEL,
  type Invoice, type InvoiceStatus,
} from "@/lib/mock-data";

/* ─── Helpers ────────────────────────────────────────────────────────── */

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

/* ─── Activity History (derived) ─────────────────────────────────────── */

function generateActivity(invoice: Invoice) {
  const events: { id: number; title: string; description: string; time: string; icon: any; color: string }[] = [];
  let idx = 0;

  events.push({
    id: idx++,
    title: "Invoice Created",
    description: `${INVOICE_TYPE_LABEL[invoice.invoiceType]} created for ${invoice.customer}`,
    time: invoice.createdAt,
    icon: Receipt,
    color: "text-emerald-600 bg-emerald-50 ring-emerald-200",
  });

  if (invoice.ticketId) {
    events.push({
      id: idx++,
      title: "Linked to Ticket",
      description: `Connected to repair ticket ${invoice.ticketId}`,
      time: new Date(new Date(invoice.createdAt).getTime() + 2 * 60_000).toISOString(),
      icon: TicketIcon,
      color: "text-indigo-600 bg-indigo-50 ring-indigo-200",
    });
  }

  if (invoice.status !== "draft") {
    events.push({
      id: idx++,
      title: "Status Updated",
      description: `Marked as ${INVOICE_STATUS_LABEL[invoice.status]}`,
      time: new Date(new Date(invoice.createdAt).getTime() + 10 * 60_000).toISOString(),
      icon: CheckCircle2,
      color: "text-blue-600 bg-blue-50 ring-blue-200",
    });
  }

  if (invoice.paidAmount > 0) {
    events.push({
      id: idx++,
      title: "Payment Recorded",
      description: `${formatINR(invoice.paidAmount)} received`,
      time: new Date(new Date(invoice.createdAt).getTime() + 20 * 60_000).toISOString(),
      icon: CreditCard,
      color: "text-emerald-600 bg-emerald-50 ring-emerald-200",
    });
  }

  return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

function getElapsedLabel(createdAt: string): string {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

/* ─── Page Component ─────────────────────────────────────────────────── */

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { invoices, tickets, deleteInvoice, updateInvoice } = useStore();
  const invoiceId = params.id as string;

  const invoice = useMemo(() => invoices.find((i) => i.id === invoiceId), [invoices, invoiceId]);
  const linkedTicket = useMemo(() => tickets.find((t) => t.id === invoice?.ticketId), [tickets, invoice]);
  const activity = useMemo(() => (invoice ? generateActivity(invoice) : []), [invoice]);

  const [showDelete, setShowDelete] = useState(false);
  const [showStatusDrawer, setShowStatusDrawer] = useState(false);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [showItemsDrawer, setShowItemsDrawer] = useState(false);
  const [statusDraft, setStatusDraft] = useState<InvoiceStatus>("draft");
  const [paidDraft, setPaidDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [termsDraft, setTermsDraft] = useState("");
  const [activeEditor, setActiveEditor] = useState<"customer" | "billing" | "tax" | null>(null);
  const [itemsDraft, setItemsDraft] = useState<{ id: string; name: string; qty: number; price: number }[]>([]);

  const handleDelete = useCallback(() => {
    if (invoice) {
      deleteInvoice(invoice.id);
      router.push("/invoice");
    }
  }, [invoice, deleteInvoice, router]);

  const openStatusDrawer = useCallback(() => {
    if (!invoice) return;
    setStatusDraft(invoice.status);
    setPaidDraft(String(invoice.paidAmount));
    setShowStatusDrawer(true);
  }, [invoice]);

  const saveStatus = useCallback(() => {
    if (!invoice) return;
    updateInvoice(invoice.id, { status: statusDraft, paidAmount: Number(paidDraft) || 0 });
    setShowStatusDrawer(false);
  }, [invoice, statusDraft, paidDraft, updateInvoice]);

  const [footerDraft, setFooterDraft] = useState("");

  const openNotesDrawer = useCallback(() => {
    if (!invoice) return;
    setNotesDraft(invoice.notes || "");
    setTermsDraft(invoice.terms || "");
    setFooterDraft(invoice.footer || "");
    setShowNotesDrawer(true);
  }, [invoice]);

  const saveNotes = useCallback(() => {
    if (!invoice) return;
    updateInvoice(invoice.id, { notes: notesDraft || undefined, terms: termsDraft || undefined, footer: footerDraft || undefined });
    setShowNotesDrawer(false);
  }, [invoice, notesDraft, termsDraft, footerDraft, updateInvoice]);

  const openItemsDrawer = useCallback(() => {
    if (!invoice) return;
    setItemsDraft(invoice.items.map((it) => ({ id: it.id, name: it.name, qty: it.qty, price: it.price })));
    setShowItemsDrawer(true);
  }, [invoice]);

  const saveItems = useCallback(() => {
    if (!invoice) return;
    const updatedItems = invoice.items.map((it) => {
      const draft = itemsDraft.find((d) => d.id === it.id);
      if (!draft) return it;
      const total = draft.qty * draft.price - it.discount;
      return { ...it, name: draft.name, qty: draft.qty, price: draft.price, total };
    });
    const subtotal = updatedItems.reduce((s, it) => s + it.total, 0);
    const taxable = subtotal - invoice.discount;
    const tax = Math.round(taxable * (invoice.subtotal > 0 ? invoice.tax / invoice.subtotal : 0.18));
    updateInvoice(invoice.id, { items: updatedItems, subtotal, tax, total: taxable + tax });
    setShowItemsDrawer(false);
  }, [invoice, itemsDraft, updateInvoice]);

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Receipt className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-bold">Invoice Not Found</h2>
        <p className="text-sm text-muted-foreground">The invoice "{invoiceId}" does not exist or has been deleted.</p>
        <Link href="/invoice">
          <Button variant="outline" size="md"><ArrowLeft className="h-4 w-4" /> Back to Invoices</Button>
        </Link>
      </div>
    );
  }

  const balanceDue = invoice.total - invoice.paidAmount;

  return (
    <div className="space-y-7 pb-10">
      {/* ─── Header ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card to-[#EEF1FD]/30 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_-4px_rgba(67,97,238,0.08)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Link href="/invoice">
              <button className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-zinc-600 shadow-card transition hover:bg-muted" aria-label="Back to invoices">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-[26px] font-extrabold tracking-tight">{invoice.id}</h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${INVOICE_STATUS_TONE[invoice.status]}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {INVOICE_STATUS_LABEL[invoice.status]}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
                  {INVOICE_TYPE_LABEL[invoice.invoiceType]}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{invoice.customer}</span> &middot; {invoice.reference} &middot; Created {getElapsedLabel(invoice.createdAt)}
              </p>
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => router.push(`/invoice/create?edit=${invoice.id}`)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Dropdown
              align="right"
              width="w-52"
              trigger={({ toggle }) => (
                <Button variant="outline" size="sm" className="rounded-full" onClick={toggle}>
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem icon={FileDown} onClick={() => { router.push(`/print/invoice/${invoice.id}?format=a4`); close(); }}>A4 Print</MenuItem>
                  <MenuItem icon={Receipt} onClick={() => { router.push(`/print/invoice/${invoice.id}?format=thermal`); close(); }}>Thermal Print</MenuItem>
                </>
              )}
            </Dropdown>
            <Dropdown
              align="right"
              width="w-52"
              trigger={({ toggle }) => (
                <button onClick={toggle} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-card transition hover:bg-[#EEF1FD] hover:text-[#4361EE]">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem icon={FileDown} onClick={close}>Download PDF</MenuItem>
                  <MenuItem icon={Mail} onClick={close}>Send to Customer</MenuItem>
                  <MenuItem icon={Copy} onClick={close}>Duplicate</MenuItem>
                  <div className="my-1 border-t border-border" />
                  <MenuItem icon={Trash2} danger onClick={() => { setShowDelete(true); close(); }}>Delete Invoice</MenuItem>
                </>
              )}
            </Dropdown>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Customer" value={invoice.customer} icon={User} />
          <SummaryCard label="Phone" value={invoice.phone} icon={Phone} />
          <SummaryCard label="Total" value={formatINR(invoice.total)} icon={CreditCard} />
          <SummaryCard label="Paid" value={formatINR(invoice.paidAmount)} icon={CheckCircle2} />
          <SummaryCard label="Due Date" value={fmtDateShort(invoice.dueDate)} icon={Calendar} />
          <SummaryCard label="Created" value={fmtDateShort(invoice.createdAt)} icon={Tag} />
        </div>
      </div>

      {/* ─── Main Content Grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column — 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Information */}
          <DetailSection
            title="Customer Information"
            icon={User}
            action={
              <button onClick={() => setActiveEditor("customer")} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
                <Pencil className="h-3 w-3" /> Edit
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Name" value={invoice.customer} />
              <DetailField label="Phone" value={invoice.phone} />
              <DetailField label="Email" value={invoice.email || "—"} />
              <DetailField label="Company" value={invoice.company || "—"} />
            </div>
          </DetailSection>

          {/* Billing Details */}
          <DetailSection
            title="Billing Details"
            icon={Tag}
            action={
              <button onClick={() => setActiveEditor("billing")} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
                <Pencil className="h-3 w-3" /> Edit
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Reference / PO" value={invoice.reference} />
              <DetailField label="Invoice Type" value={INVOICE_TYPE_LABEL[invoice.invoiceType]} />
              <DetailField label="Employee" value={invoice.employee || "—"} />
              <DetailField label="Created" value={fmtDate(invoice.createdAt)} />
              <DetailField label="Due Date" value={fmtDate(invoice.dueDate)} />
              <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Status</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${INVOICE_STATUS_TONE[invoice.status]}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {INVOICE_STATUS_LABEL[invoice.status]}
                </span>
              </div>
            </div>
          </DetailSection>

          {/* Invoice Items */}
          <DetailSection
            title="Invoice Items"
            icon={Receipt}
            action={
              <button onClick={openItemsDrawer} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
                <Pencil className="h-3 w-3" /> Edit
              </button>
            }
          >
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 text-left">Item</th>
                    <th className="py-2 text-center w-16">Qty</th>
                    <th className="py-2 text-right w-24">Price</th>
                    <th className="py-2 text-right w-24 pr-4">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{item.name}</p>
                        {(item.description || item.sku) && (
                          <p className="text-[11px] text-muted-foreground">
                            {item.sku && <span className="font-mono">{item.sku}</span>}
                            {item.sku && item.description && " · "}
                            {item.description}
                          </p>
                        )}
                      </td>
                      <td className="py-2.5 text-center tabular-nums">{item.qty}</td>
                      <td className="py-2.5 text-right tabular-nums">{formatINR(item.price)}</td>
                      <td className="py-2.5 text-right tabular-nums font-medium pr-4">{formatINR(item.total)}</td>
                    </tr>
                  ))}
                  {invoice.items.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No line items</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </DetailSection>

          {/* Tax & Discounts */}
          <DetailSection
            title="Tax & Discounts"
            icon={CreditCard}
            action={
              <button onClick={() => setActiveEditor("tax")} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
                <Pencil className="h-3 w-3" /> Edit
              </button>
            }
          >
            <div className="rounded-xl border border-border bg-gradient-to-b from-[#EEF1FD]/40 to-white p-5">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums font-medium">{formatINR(invoice.subtotal)}</span></div>
                {invoice.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums text-emerald-600">-{formatINR(invoice.discount)}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Tax (GST)</span><span className="tabular-nums">{formatINR(invoice.tax)}</span></div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>Total</span><span className="tabular-nums text-[#4361EE]">{formatINR(invoice.total)}</span></div>
              </div>
            </div>
          </DetailSection>

          {/* Payment Information */}
          <DetailSection
            title="Payment Information"
            icon={CheckCircle2}
            action={
              <button onClick={openStatusDrawer} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
                <Pencil className="h-3 w-3" /> Update
              </button>
            }
          >
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Total Amount" value={formatINR(invoice.total)} />
              <DetailField label="Paid Amount" value={formatINR(invoice.paidAmount)} />
              <DetailField label="Balance Due" value={formatINR(Math.max(balanceDue, 0))} highlight={balanceDue > 0} />
              <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Payment Status</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${INVOICE_STATUS_TONE[invoice.status]}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {INVOICE_STATUS_LABEL[invoice.status]}
                </span>
              </div>
            </div>
          </DetailSection>

          {/* Terms & Footer */}
          <DetailSection
            title="Terms & Footer"
            icon={StickyNote}
            action={
              <button onClick={openNotesDrawer} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
                <Pencil className="h-3 w-3" /> Edit
              </button>
            }
          >
            {invoice.notes || invoice.terms ? (
              <div className="space-y-3">
                {invoice.notes && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground whitespace-pre-line">{invoice.notes}</p>
                  </div>
                )}
                {invoice.terms && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">Terms & Conditions</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{invoice.terms}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
                <p className="text-sm text-muted-foreground italic">No notes or terms added yet.</p>
              </div>
            )}
            {invoice.footer && (
              <p className="mt-4 text-center text-xs font-semibold text-muted-foreground tracking-wide border-t border-border/70 pt-3">{invoice.footer}</p>
            )}
          </DetailSection>

          {/* Related Ticket */}
          {invoice.ticketId && (
            <DetailSection title="Related Ticket" icon={TicketIcon}>
              {linkedTicket ? (
                <Link
                  href={`/tickets/${linkedTicket.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border p-4 transition hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/30"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-indigo-100 text-[#4361EE]">
                    <TicketIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{linkedTicket.id} &middot; {linkedTicket.model}</p>
                    <p className="text-[11px] text-muted-foreground">{linkedTicket.issue}</p>
                  </div>
                  <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">Linked ticket {invoice.ticketId} (not found)</p>
              )}
            </DetailSection>
          )}
        </div>

        {/* Right Column — 1/3 width */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => router.push(`/invoice/create?edit=${invoice.id}`)}
                className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:border-[#B3BFF6]/50 hover:bg-[#EEF1FD]/40"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Pencil className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Edit Invoice</p>
                  <p className="text-[11px] text-muted-foreground">Modify full invoice details</p>
                </div>
              </button>
              <button
                onClick={openStatusDrawer}
                className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:border-[#B3BFF6]/50 hover:bg-[#EEF1FD]/40"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-100 text-[#4361EE]">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Update Payment</p>
                  <p className="text-[11px] text-muted-foreground">Change status or record payment</p>
                </div>
              </button>
              <button
                onClick={() => router.push(`/print/invoice/${invoice.id}?format=a4`)}
                className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:border-[#B3BFF6]/50 hover:bg-[#EEF1FD]/40"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-100 text-zinc-600">
                  <Printer className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Print Invoice</p>
                  <p className="text-[11px] text-muted-foreground">A4 / Thermal formats</p>
                </div>
              </button>
            </div>
          </div>

          {/* Activity History */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-5">Activity History</h3>
            <div className="space-y-0">
              {activity.map((event, idx) => {
                const Icon = event.icon;
                const isLast = idx === activity.length - 1;
                return (
                  <div key={event.id} className="flex gap-3.5">
                    <div className="relative flex flex-col items-center">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ring-inset ${event.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
                    </div>
                    <div className={cn("min-w-0 flex-1", !isLast && "pb-5")}>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold leading-tight">{event.title}</p>
                        <p className="shrink-0 text-[10px] font-medium text-muted-foreground/70">{getElapsedLabel(event.time)}</p>
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{event.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Payment / Status Drawer ──────────────────────────────────── */}
      <Drawer
        open={showStatusDrawer}
        onClose={() => setShowStatusDrawer(false)}
        title="Update Payment"
        subtitle={`Invoice ${invoice.id}`}
        icon={CreditCard}
        width="max-w-sm"
        footer={
          <div className="flex justify-start gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowStatusDrawer(false)}>Cancel</Button>
            <Button size="sm" onClick={saveStatus}><Check className="h-3.5 w-3.5" /> Save</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select
              value={statusDraft}
              onChange={(e: any) => setStatusDraft(e.target.value)}
              options={[
                { label: "Draft", value: "draft" }, { label: "Sent", value: "sent" }, { label: "Paid", value: "paid" },
                { label: "Partial", value: "partial" }, { label: "Overdue", value: "overdue" }, { label: "Cancelled", value: "cancelled" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Paid Amount (₹)</label>
            <input
              type="number"
              value={paidDraft}
              onChange={(e) => setPaidDraft(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-border bg-card px-3.5 text-sm transition-all duration-150 hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 focus:outline-none"
            />
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Invoice Total</span><span className="font-medium tabular-nums">{formatINR(invoice.total)}</span></div>
            <div className="flex justify-between mt-1"><span className="text-muted-foreground">Balance After</span><span className="font-medium tabular-nums">{formatINR(Math.max(invoice.total - (Number(paidDraft) || 0), 0))}</span></div>
          </div>
        </div>
      </Drawer>

      {/* ─── Notes & Terms Drawer ─────────────────────────────────────── */}
      <Drawer
        open={showNotesDrawer}
        onClose={() => setShowNotesDrawer(false)}
        title="Terms & Notes"
        subtitle={`Invoice ${invoice.id}`}
        icon={StickyNote}
        width="max-w-md"
        footer={
          <div className="flex justify-start gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowNotesDrawer(false)}>Cancel</Button>
            <Button size="sm" onClick={saveNotes}><Check className="h-3.5 w-3.5" /> Save</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes (visible to customer)</label>
            <Textarea value={notesDraft} onChange={(e: any) => setNotesDraft(e.target.value)} rows={3} placeholder="Any additional notes…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Terms & Conditions</label>
            <Textarea value={termsDraft} onChange={(e: any) => setTermsDraft(e.target.value)} rows={4} placeholder="Warranty terms, conditions…" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Footer</label>
            <Textarea value={footerDraft} onChange={(e: any) => setFooterDraft(e.target.value)} rows={2} placeholder="THANK YOU FOR CHOOSING…" />
          </div>
        </div>
      </Drawer>

      {/* ─── Customer / Billing / Tax Quick-Edit Drawers ───────────────── */}
      <QuickEditDrawer
        open={activeEditor === "customer"}
        onClose={() => setActiveEditor(null)}
        title="Edit Customer Information"
        subtitle={`Invoice ${invoice.id}`}
        icon={User}
        width="max-w-md"
        initialValues={{ customer: invoice.customer, phone: invoice.phone, email: invoice.email || "", company: invoice.company || "" }}
        fields={[
          { key: "customer", label: "Customer Name", type: "text" },
          { key: "phone", label: "Phone Number", type: "text" },
          { key: "email", label: "Email Address", type: "text" },
          { key: "company", label: "Company / Organization", type: "text" },
        ]}
        onSave={(v) => {
          updateInvoice(invoice.id, { customer: v.customer, phone: v.phone, email: v.email || undefined, company: v.company || undefined });
          setActiveEditor(null);
        }}
      />

      <QuickEditDrawer
        open={activeEditor === "billing"}
        onClose={() => setActiveEditor(null)}
        title="Edit Billing Details"
        subtitle={`Invoice ${invoice.id}`}
        icon={Tag}
        width="max-w-md"
        initialValues={{
          reference: invoice.reference, employee: invoice.employee || "",
          dueDate: invoice.dueDate?.slice(0, 10) || "",
          invoiceType: invoice.invoiceType,
          status: invoice.status,
        }}
        fields={[
          { key: "reference", label: "Reference / PO Number", type: "text" },
          { key: "invoiceType", label: "Invoice Type", type: "select", options: [
            { label: "Retail Invoice", value: "retail" }, { label: "Business Invoice", value: "business" },
          ]},
          { key: "employee", label: "Employee", type: "text" },
          { key: "dueDate", label: "Due Date", type: "text", placeholder: "YYYY-MM-DD" },
          { key: "status", label: "Status", type: "select", options: [
            { label: "Draft", value: "draft" }, { label: "Sent", value: "sent" }, { label: "Paid", value: "paid" },
            { label: "Partial", value: "partial" }, { label: "Overdue", value: "overdue" }, { label: "Cancelled", value: "cancelled" },
          ]},
        ]}
        onSave={(v) => {
          updateInvoice(invoice.id, {
            reference: v.reference,
            invoiceType: v.invoiceType as any,
            employee: v.employee || undefined,
            dueDate: v.dueDate ? new Date(v.dueDate).toISOString() : invoice.dueDate,
            status: v.status as any,
          });
          setActiveEditor(null);
        }}
      />

      <QuickEditDrawer
        open={activeEditor === "tax"}
        onClose={() => setActiveEditor(null)}
        title="Edit Tax & Discounts"
        subtitle={`Invoice ${invoice.id}`}
        icon={CreditCard}
        width="max-w-sm"
        initialValues={{ subtotal: String(invoice.subtotal), discount: String(invoice.discount), tax: String(invoice.tax) }}
        fields={[
          { key: "subtotal", label: "Subtotal (₹)", type: "number" },
          { key: "discount", label: "Discount (₹)", type: "number" },
          { key: "tax", label: "Tax / GST (₹)", type: "number" },
        ]}
        onSave={(v) => {
          const subtotal = Number(v.subtotal) || 0;
          const discount = Number(v.discount) || 0;
          const tax = Number(v.tax) || 0;
          updateInvoice(invoice.id, { subtotal, discount, tax, total: subtotal - discount + tax });
          setActiveEditor(null);
        }}
      />

      {/* ─── Invoice Items Drawer ───────────────────────────────────────── */}
      <Drawer
        open={showItemsDrawer}
        onClose={() => setShowItemsDrawer(false)}
        title="Edit Invoice Items"
        subtitle={`Invoice ${invoice.id}`}
        icon={Receipt}
        width="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowItemsDrawer(false)}>Cancel</Button>
            <Button size="sm" onClick={saveItems}><Check className="h-3.5 w-3.5" /> Save</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {itemsDraft.map((item, idx) => (
            <div key={item.id} className="rounded-xl border border-border p-3 space-y-2">
              <input
                value={item.name}
                onChange={(e) => setItemsDraft((prev) => prev.map((it, i) => i === idx ? { ...it, name: e.target.value } : it))}
                className="flex h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
                placeholder="Item name"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Qty</label>
                  <NumericInput value={item.qty} min={1} onChange={(v) => setItemsDraft((prev) => prev.map((it, i) => i === idx ? { ...it, qty: v } : it))} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Price (₹)</label>
                  <NumericInput value={item.price} onChange={(v) => setItemsDraft((prev) => prev.map((it, i) => i === idx ? { ...it, price: v } : it))} />
                </div>
              </div>
            </div>
          ))}
          {itemsDraft.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No line items to edit.</p>
          )}
        </div>
      </Drawer>

      {/* ─── Delete Confirmation ──────────────────────────────────────── */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title={`Delete invoice ${invoice.id}?`}
        description="This action cannot be undone. The invoice and all associated data will be permanently removed."
        confirmLabel="Delete Invoice"
        cancelLabel="Cancel"
        danger
      />
    </div>
  );
}

/* ─── Sub-Components ─────────────────────────────────────────────────── */

function SummaryCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-sm transition hover:border-[#B3BFF6]/50">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-sm font-semibold truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, icon: Icon, children, action }: { title: string; icon: any; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-center justify-between gap-2.5 mb-5 pb-4 border-b border-border/70">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function DetailField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm", highlight ? "font-bold text-rose-600" : "font-medium text-foreground")}>{value}</p>
    </div>
  );
}
