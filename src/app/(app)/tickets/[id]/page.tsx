"use client";

import { useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, Pencil, MoreHorizontal, Printer, Trash2,
  ArrowRightLeft, MessageSquarePlus, FileText, Clock,
  User, Smartphone, Wrench, CreditCard, AlertTriangle,
  CheckCircle2, Phone, Mail, Building2, MapPin, Shield,
  Package, Hash, Calendar, Tag, CircleDot, Receipt,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useStore } from "@/lib/store";
import { formatINR, cn } from "@/lib/utils";
import {
  STATUS_LABEL, STATUS_TONE, PRIORITY_LABEL, PRIORITY_TONE,
  type Ticket, type TicketStatus, type TicketPriority,
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

function getElapsedLabel(createdAt: string): string {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

/* ─── Mock Timeline Data ─────────────────────────────────────────────── */

function generateTimeline(ticket: Ticket) {
  const events: { id: number; type: string; title: string; description: string; time: string; icon: any; color: string }[] = [];
  let idx = 0;

  events.push({
    id: idx++,
    type: "created",
    title: "Ticket Created",
    description: `Ticket ${ticket.id} created for ${ticket.customer}`,
    time: ticket.createdAt,
    icon: CheckCircle2,
    color: "text-emerald-600 bg-emerald-50 ring-emerald-200",
  });

  if (ticket.status !== "received") {
    events.push({
      id: idx++,
      type: "status",
      title: "Status Updated",
      description: `Status changed to ${STATUS_LABEL[ticket.status]}`,
      time: new Date(new Date(ticket.createdAt).getTime() + 15 * 60_000).toISOString(),
      icon: CircleDot,
      color: "text-indigo-600 bg-indigo-50 ring-indigo-200",
    });
  }

  events.push({
    id: idx++,
    type: "assigned",
    title: "Technician Assigned",
    description: `Assigned to ${ticket.technician}`,
    time: new Date(new Date(ticket.createdAt).getTime() + 5 * 60_000).toISOString(),
    icon: Wrench,
    color: "text-blue-600 bg-blue-50 ring-blue-200",
  });

  if (ticket.priority !== "normal") {
    events.push({
      id: idx++,
      type: "priority",
      title: "Priority Set",
      description: `Marked as ${PRIORITY_LABEL[ticket.priority]}`,
      time: new Date(new Date(ticket.createdAt).getTime() + 8 * 60_000).toISOString(),
      icon: AlertTriangle,
      color: ticket.priority === "critical" ? "text-rose-600 bg-rose-50 ring-rose-200" : "text-amber-600 bg-amber-50 ring-amber-200",
    });
  }

  if (ticket.dueDate) {
    events.push({
      id: idx++,
      type: "due",
      title: "Due Date Set",
      description: `Due by ${fmtDate(ticket.dueDate)}`,
      time: new Date(new Date(ticket.createdAt).getTime() + 10 * 60_000).toISOString(),
      icon: Calendar,
      color: "text-violet-600 bg-violet-50 ring-violet-200",
    });
  }

  return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

/* ─── Page Component ─────────────────────────────────────────────────── */

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { tickets, invoices, deleteTicket, updateTicket, deductPartsForTicket } = useStore();
  const ticketId = params.id as string;

  const ticket = useMemo(() => tickets.find((t) => t.id === ticketId), [tickets, ticketId]);
  const linkedInvoice = useMemo(() => invoices.find((inv) => inv.ticketId === ticketId), [invoices, ticketId]);
  const timeline = useMemo(() => ticket ? generateTimeline(ticket) : [], [ticket]);

  const [showDelete, setShowDelete] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);

  const handleDelete = useCallback(() => {
    if (ticket) {
      deleteTicket(ticket.id);
      router.push("/tickets");
    }
  }, [ticket, deleteTicket, router]);

  const handleStatusChange = useCallback((status: TicketStatus) => {
    if (ticket) {
      updateTicket(ticket.id, { status });
      // Deduct inventory when ticket is completed
      if (status === "completed" && ticket.parts && ticket.parts.some((p) => p.status === "planned")) {
        deductPartsForTicket(ticket.id);
      }
      setShowStatusMenu(false);
    }
  }, [ticket, updateTicket, deductPartsForTicket]);

  const handlePriorityChange = useCallback((priority: TicketPriority) => {
    if (ticket) {
      updateTicket(ticket.id, { priority });
      setShowPriorityMenu(false);
    }
  }, [ticket, updateTicket]);

  const handlePushToInvoice = useCallback(() => {
    if (!ticket) return;
    // Encode ticket data as query params for the invoice create page
    const params = new URLSearchParams();
    params.set("fromTicket", ticket.id);
    params.set("customer", ticket.customer);
    params.set("phone", ticket.phone);
    if (ticket.company) params.set("company", ticket.company);
    params.set("amount", String(ticket.amount));
    params.set("service", ticket.service || ticket.issue);
    params.set("device", ticket.model);
    if (ticket.parts && ticket.parts.length > 0) {
      params.set("parts", JSON.stringify(ticket.parts.map((p) => ({ name: p.name, qty: p.qty, price: p.unitPrice, total: p.total }))));
    }
    router.push(`/invoice/create?${params.toString()}`);
  }, [ticket, router]);

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <FileText className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-bold">Ticket Not Found</h2>
        <p className="text-sm text-muted-foreground">The ticket "{ticketId}" does not exist or has been deleted.</p>
        <Link href="/tickets">
          <Button variant="outline" size="md"><ArrowLeft className="h-4 w-4" /> Back to Tickets</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* ─── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/tickets">
            <button className="mt-1 grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-zinc-600 shadow-card transition hover:bg-muted" aria-label="Back to tickets">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-extrabold tracking-tight">{ticket.id}</h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${STATUS_TONE[ticket.status]}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {STATUS_LABEL[ticket.status]}
              </span>
              {ticket.priority !== "normal" && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${PRIORITY_TONE[ticket.priority]}`}>
                  {PRIORITY_LABEL[ticket.priority]}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {ticket.model} &middot; {ticket.customer} &middot; Created {getElapsedLabel(ticket.createdAt)}
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="rounded-full" onClick={() => router.push(`/tickets/new?edit=${ticket.id}`)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button size="sm" className="rounded-full" onClick={handlePushToInvoice} disabled={!!linkedInvoice}>
            <Receipt className="h-3.5 w-3.5" /> {linkedInvoice ? "Invoice Linked" : "Push to Invoice"}
          </Button>
          {/* More actions */}
          <Dropdown
            align="right"
            width="w-52"
            trigger={({ toggle }) => (
              <button onClick={toggle} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-card transition hover:bg-muted hover:text-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={ArrowRightLeft} onClick={() => { close(); }}>Transfer Ticket</MenuItem>
                <MenuItem icon={MessageSquarePlus} onClick={() => { close(); }}>View / Add Comment</MenuItem>
                <MenuItem icon={CircleDot} onClick={() => { setShowStatusMenu(true); close(); }}>Mark Status</MenuItem>
                <MenuItem icon={AlertTriangle} onClick={() => { setShowPriorityMenu(true); close(); }}>Change Priority</MenuItem>
                <MenuItem icon={Printer} onClick={() => { window.print(); close(); }}>Print</MenuItem>
                <div className="my-1 border-t border-border" />
                <MenuItem icon={Trash2} danger onClick={() => { setShowDelete(true); close(); }}>Delete Ticket</MenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </div>

      {/* ─── Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Customer" value={ticket.customer} icon={User} />
        <SummaryCard label="Phone" value={ticket.phone} icon={Phone} />
        <SummaryCard label="Device" value={ticket.model} icon={Smartphone} />
        <SummaryCard label="Technician" value={ticket.technician} icon={Wrench} />
        <SummaryCard label="Amount" value={formatINR(ticket.amount)} icon={CreditCard} />
        <SummaryCard label="Created" value={fmtDateShort(ticket.createdAt)} icon={Calendar} />
      </div>

      {/* ─── Main Content Grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column — 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Information */}
          <DetailSection title="Customer Information" icon={User}>
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Name" value={ticket.customer} />
              <DetailField label="Phone" value={ticket.phone} />
              <DetailField label="Company" value={ticket.company || "—"} />
              <DetailField label="Customer Group" value="Regular" />
              <DetailField label="Email" value="—" />
              <DetailField label="Address" value="—" />
            </div>
          </DetailSection>

          {/* Device Information */}
          <DetailSection title="Device Information" icon={Smartphone}>
            {ticket.items && ticket.items.length > 0 ? (
              <div className="space-y-4">
                {ticket.items.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-border p-4 bg-muted/20">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-700">{idx + 1}</span>
                      <span className="text-sm font-semibold">{item.model}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                      <DetailField label="Device" value={item.device} />
                      <DetailField label="Model" value={item.model} />
                      <DetailField label="Serial / IMEI" value={item.serial || "—"} />
                      <DetailField label="Issue" value={item.issue} />
                      <DetailField label="Service" value={item.service || "—"} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <DetailField label="Brand" value={ticket.device} />
                <DetailField label="Model" value={ticket.model} />
                <DetailField label="Category" value={ticket.device} />
                <DetailField label="IMEI / Serial" value="—" />
                <DetailField label="Condition" value="—" />
                <DetailField label="Accessories" value="—" />
                <DetailField label="Password / PIN" value="—" />
                <DetailField label="Warranty" value="—" />
              </div>
            )}
          </DetailSection>

          {/* Ticket Information */}
          <DetailSection title="Ticket Information" icon={Tag}>
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Ticket ID" value={ticket.id} />
              <DetailField label="Source" value="Walk-in" />
              <DetailField label="Service" value={ticket.service || ticket.issue} />
              <DetailField label="Issue" value={ticket.issue} />
              <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Priority</p>
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${PRIORITY_TONE[ticket.priority]}`}>
                  {PRIORITY_LABEL[ticket.priority]}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Status</p>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_TONE[ticket.status]}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {STATUS_LABEL[ticket.status]}
                </span>
              </div>
              <DetailField label="Branch" value="BTM Layout (HQ)" />
              <DetailField label="Technician" value={ticket.technician} />
              <DetailField label="Estimated Cost" value={formatINR(ticket.amount)} />
              <DetailField label="Created" value={fmtDate(ticket.createdAt)} />
              <DetailField label="Expected Resolution" value={ticket.resolutionMinutes ? (ticket.resolutionMinutes >= 60 ? `${Math.floor(ticket.resolutionMinutes / 60)}h ${ticket.resolutionMinutes % 60 ? `${ticket.resolutionMinutes % 60}m` : ""}`.trim() : `${ticket.resolutionMinutes} min`) : "59 min (default)"} />
              {ticket.dueDate && <DetailField label="Due Time" value={fmtDate(ticket.dueDate)} />}
            </div>
          </DetailSection>

          {/* Parts Used */}
          {ticket.parts && ticket.parts.length > 0 && (
            <DetailSection title="Parts Used" icon={Package}>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 text-left">Item</th>
                      <th className="py-2 text-center w-16">Qty</th>
                      <th className="py-2 text-right w-24">Price</th>
                      <th className="py-2 text-right w-24">Total</th>
                      <th className="py-2 text-right w-20 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticket.parts.map((part, idx) => (
                      <tr key={idx} className="border-t border-border">
                        <td className="px-4 py-2.5">
                          <p className="font-medium">{part.name}</p>
                          <p className="text-[11px] text-muted-foreground">{part.sku} · {part.uom}</p>
                        </td>
                        <td className="py-2.5 text-center tabular-nums">{part.qty}</td>
                        <td className="py-2.5 text-right tabular-nums">{formatINR(part.unitPrice)}</td>
                        <td className="py-2.5 text-right tabular-nums font-medium">{formatINR(part.total)}</td>
                        <td className="py-2.5 text-right pr-4">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                            part.status === "used"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-amber-50 text-amber-700 ring-amber-200"
                          )}>
                            {part.status === "used" ? "Consumed" : "Planned"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <div className="rounded-lg bg-muted/60 px-4 py-2 text-sm">
                  <span className="text-muted-foreground">Parts Total: </span>
                  <span className="font-semibold tabular-nums">{formatINR(ticket.parts.reduce((s, p) => s + p.total, 0))}</span>
                </div>
              </div>
            </DetailSection>
          )}

          {/* Billing Information */}
          <DetailSection title="Billing Information" icon={CreditCard}>
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Amount" value={formatINR(ticket.amount)} />
              <DetailField label="Discount" value={formatINR(0)} />
              <DetailField label="Tax (18%)" value={formatINR(Math.round(ticket.amount * 0.18))} />
              <DetailField label="Total" value={formatINR(Math.round(ticket.amount * 1.18))} highlight />
              <DetailField label="Payment State" value={ticket.status === "delivered" ? "Paid" : "Pending"} />
              <div>
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Related Invoice</p>
                {linkedInvoice ? (
                  <Link href="/invoice" className="text-sm font-medium text-[#4361EE] hover:underline">
                    {linkedInvoice.id}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">None</span>
                )}
              </div>
            </div>
          </DetailSection>
        </div>

        {/* Right Column — 1/3 width */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={handlePushToInvoice}
                disabled={!!linkedInvoice}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                  linkedInvoice
                    ? "border-emerald-200 bg-emerald-50/50 cursor-default"
                    : "border-border hover:border-[#4361EE] hover:bg-indigo-50/40"
                )}
              >
                <span className={cn("grid h-9 w-9 place-items-center rounded-lg", linkedInvoice ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-[#4361EE]")}>
                  <Receipt className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{linkedInvoice ? "Invoice Linked" : "Push to Invoice"}</p>
                  <p className="text-[11px] text-muted-foreground">{linkedInvoice ? `Linked to ${linkedInvoice.id}` : "Create invoice from ticket"}</p>
                </div>
              </button>
              <button
                onClick={() => router.push(`/tickets/new?edit=${ticket.id}`)}
                className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:border-zinc-300 hover:bg-muted/40"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Pencil className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Edit Ticket</p>
                  <p className="text-[11px] text-muted-foreground">Modify ticket details</p>
                </div>
              </button>
              <button
                onClick={() => setShowStatusMenu(true)}
                className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:border-zinc-300 hover:bg-muted/40"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-100 text-violet-700">
                  <CircleDot className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Change Status</p>
                  <p className="text-[11px] text-muted-foreground">Update ticket progress</p>
                </div>
              </button>
              <button
                onClick={() => window.print()}
                className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:border-zinc-300 hover:bg-muted/40"
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-zinc-100 text-zinc-600">
                  <Printer className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Print Ticket</p>
                  <p className="text-[11px] text-muted-foreground">Job card or receipt</p>
                </div>
              </button>
            </div>
          </div>

          {/* Timeline / Activity */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Activity Timeline</h3>
            <div className="space-y-4">
              {timeline.map((event, idx) => {
                const Icon = event.icon;
                return (
                  <div key={event.id} className="flex gap-3">
                    <div className="relative flex flex-col items-center">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 ring-inset ${event.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      {idx < timeline.length - 1 && (
                        <div className="mt-1 w-px flex-1 bg-border" />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium leading-tight">{event.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{event.description}</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{getElapsedLabel(event.time)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Internal Notes */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Internal Notes</h3>
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-sm text-muted-foreground italic">No internal notes yet. Click "Add Comment" from the actions menu to add notes.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Status Change Dialog ─────────────────────────────────────── */}
      {showStatusMenu && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={() => setShowStatusMenu(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-card shadow-2xl ring-1 ring-border p-5">
            <p className="text-sm font-bold mb-1">Change Status</p>
            <p className="text-[11px] text-muted-foreground mb-4">Ticket {ticket.id}</p>
            <div className="space-y-2">
              {(["received", "diagnosis", "repairing", "qc", "completed", "delivered"] as TicketStatus[]).map((s) => (
                <button key={s} onClick={() => handleStatusChange(s)}
                  className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition", ticket.status === s ? "border-[#4361EE] bg-indigo-50/50" : "border-border hover:border-zinc-300")}>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${STATUS_TONE[s]}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {STATUS_LABEL[s]}
                  </span>
                  {ticket.status === s && <span className="ml-auto text-[10px] font-semibold text-[#4361EE]">Current</span>}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* ─── Priority Change Dialog ───────────────────────────────────── */}
      {showPriorityMenu && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={() => setShowPriorityMenu(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs rounded-2xl bg-card shadow-2xl ring-1 ring-border p-5">
            <p className="text-sm font-bold mb-1">Change Priority</p>
            <p className="text-[11px] text-muted-foreground mb-4">Ticket {ticket.id}</p>
            <div className="space-y-2">
              {(["normal", "high", "critical"] as TicketPriority[]).map((p) => (
                <button key={p} onClick={() => handlePriorityChange(p)}
                  className={cn("flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition", ticket.priority === p ? "border-[#4361EE] bg-indigo-50/50" : "border-border hover:border-zinc-300")}>
                  <span className={cn("h-2.5 w-2.5 rounded-full", p === "critical" ? "bg-rose-500" : p === "high" ? "bg-amber-500" : "bg-zinc-300")} />
                  <span className="text-sm font-medium">{PRIORITY_LABEL[p]}</span>
                  {ticket.priority === p && <span className="ml-auto text-[10px] font-semibold text-[#4361EE]">Current</span>}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* ─── Delete Confirmation ──────────────────────────────────────── */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title={`Delete ticket ${ticket.id}?`}
        description="This action cannot be undone. The ticket and all associated data will be permanently removed."
        confirmLabel="Delete Ticket"
        cancelLabel="Cancel"
        danger
      />
    </div>
  );
}

/* ─── Sub-Components ─────────────────────────────────────────────────── */

function SummaryCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
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

function DetailSection({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function DetailField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm", highlight ? "font-bold text-foreground" : "font-medium text-foreground")}>{value}</p>
    </div>
  );
}
