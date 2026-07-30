"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MoreHorizontal, Eye, ArrowRight, Filter, Download,
  Clock, User, Package, ClipboardList,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { cn, formatINR } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { STATUS_LABEL, STATUS_TONE, type Ticket, type TicketStatus } from "@/lib/mock-data";
import { logActivity } from "@/lib/activity-log";

/* ── Types ── */
export type OrderStatusRow = {
  status: TicketStatus;
  detail: string;
  assigned: number;
  received: number;
};

/* ── Status icon helper ── */
function statusIcon(status: TicketStatus): React.ComponentType<{ className?: string }> {
  switch (status) {
    case "received": return Package;
    case "diagnosis": return ClipboardList;
    case "repairing": return ClipboardList;
    case "qc": return ClipboardList;
    case "completed": return ClipboardList;
    case "delivered": return Package;
    default: return ClipboardList;
  }
}

/* ── Detail drawer content ── */
function OrderStatusDetailDrawer({
  row,
  tickets,
  open,
  onClose,
}: {
  row: OrderStatusRow | null;
  tickets: Ticket[];
  open: boolean;
  onClose: () => void;
}) {
  const statusTickets = React.useMemo(() => {
    if (!row) return [];
    return tickets.filter((t) => t.status === row.status);
  }, [row, tickets]);

  const assignedTickets = React.useMemo(
    () => statusTickets.filter((t) => t.technician && t.technician.trim() !== ""),
    [statusTickets]
  );
  const unassignedTickets = React.useMemo(
    () => statusTickets.filter((t) => !t.technician || t.technician.trim() === ""),
    [statusTickets]
  );

  const totalAmount = React.useMemo(
    () => statusTickets.reduce((s, t) => s + (t.amount || 0), 0),
    [statusTickets]
  );

  const lastUpdated = React.useMemo(() => {
    if (statusTickets.length === 0) return null;
    const sorted = [...statusTickets].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted[0]?.createdAt;
  }, [statusTickets]);

  const Icon = row ? statusIcon(row.status) : ClipboardList;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={row?.detail ?? "Order Status"}
      subtitle={`${row?.received ?? 0} ticket${(row?.received ?? 0) !== 1 ? "s" : ""} in this status`}
      icon={Icon}
      width="max-w-md"
    >
      {row && (
        <div className="space-y-5">
          {/* Summary card */}
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{row.received}</p>
                <p className="text-[11px] text-muted-foreground">Total Tickets</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#4361EE]">{row.assigned}</p>
                <p className="text-[11px] text-muted-foreground">Assigned</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-lg font-semibold text-amber-600">{unassignedTickets.length}</p>
                <p className="text-[11px] text-muted-foreground">Unassigned</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold text-emerald-600">{formatINR(totalAmount)}</p>
                <p className="text-[11px] text-muted-foreground">Total Value</p>
              </div>
            </div>
          </div>

          {/* Facts */}
          <div className="rounded-xl border border-border divide-y divide-border px-4">
            <DetailRow label="Status">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", STATUS_TONE[row.status])}>
                {row.detail}
              </span>
            </DetailRow>
            <DetailRow label="Assigned Count">{row.assigned}</DetailRow>
            <DetailRow label="Total Count">{row.received}</DetailRow>
            <DetailRow label="Unassigned">{unassignedTickets.length}</DetailRow>
            <DetailRow label="Total Value">{formatINR(totalAmount)}</DetailRow>
            {lastUpdated && (
              <DetailRow label="Last Updated">
                {new Date(lastUpdated).toLocaleString("en-GB", {
                  day: "2-digit", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </DetailRow>
            )}
          </div>

          {/* Linked tickets list */}
          {statusTickets.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Linked Tickets ({statusTickets.length})
              </p>
              <div className="max-h-[280px] space-y-2 overflow-y-auto pr-0.5">
                {statusTickets.slice(0, 20).map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-center gap-3 rounded-xl border border-border p-3 transition hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-medium text-muted-foreground">
                          {ticket.id}
                        </span>
                        {ticket.priority !== "normal" && (
                          <span className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ring-inset",
                            ticket.priority === "critical"
                              ? "bg-rose-50 text-rose-700 ring-rose-200"
                              : "bg-amber-50 text-amber-700 ring-amber-200"
                          )}>
                            {ticket.priority === "critical" ? "CRITICAL" : "HIGH"}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm font-medium">{ticket.customer}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {ticket.device} {ticket.model} &middot; {ticket.issue}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {ticket.technician ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <User className="h-3 w-3" /> {ticket.technician}
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-600 font-medium">Unassigned</span>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatINR(ticket.amount)}
                      </p>
                    </div>
                  </div>
                ))}
                {statusTickets.length > 20 && (
                  <p className="py-2 text-center text-[11px] text-muted-foreground">
                    +{statusTickets.length - 20} more tickets
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* ── Widget ── */
export function OrdersStatusWidget() {
  const { tickets } = useStore();
  const [selectedRow, setSelectedRow] = React.useState<OrderStatusRow | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Compute live Orders Status from real ticket data
  const ordersStatus = React.useMemo(() => {
    const statusList: TicketStatus[] = ["received", "diagnosis", "repairing", "qc", "completed", "delivered"];
    return statusList
      .map((status) => {
        const inStatus = tickets.filter((t) => t.status === status);
        const assigned = inStatus.filter((t) => t.technician && t.technician.trim() !== "").length;
        return { status, detail: STATUS_LABEL[status], assigned, received: inStatus.length };
      })
      .filter((row) => row.received > 0);
  }, [tickets]);

  const totalAssigned = React.useMemo(
    () => ordersStatus.reduce((s, r) => s + r.assigned, 0),
    [ordersStatus]
  );
  const totalReceived = React.useMemo(
    () => ordersStatus.reduce((s, r) => s + r.received, 0),
    [ordersStatus]
  );

  const openDetail = (row: OrderStatusRow) => {
    setSelectedRow(row);
    setDrawerOpen(true);
    logActivity({
      module: "Ticket",
      action: "Order Status Viewed",
      severity: "info",
      entity: "Ticket",
      reference: row.detail,
      description: `Viewed order status details for "${row.detail}" (${row.received} tickets).`,
    });
  };

  const handleExport = (row: OrderStatusRow) => {
    // Build CSV of tickets in this status
    const statusTickets = tickets.filter((t) => t.status === row.status);
    const csvHeaders = "ID,Customer,Device,Model,Issue,Technician,Amount,Created\n";
    const csvRows = statusTickets.map((t) =>
      `${t.id},"${t.customer}","${t.device}","${t.model}","${t.issue}","${t.technician || "Unassigned"}",${t.amount},${t.createdAt}`
    ).join("\n");
    const csv = csvHeaders + csvRows;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${row.status}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logActivity({
      module: "Ticket",
      action: "Order Status Exported",
      severity: "info",
      entity: "Ticket",
      reference: row.detail,
      description: `Exported ${statusTickets.length} "${row.detail}" tickets to CSV.`,
    });
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Orders Status</p>
        <div className="flex items-center gap-1.5">
          <Badge tone="info" dot>live</Badge>
          <Dropdown
            align="right"
            width="w-44"
            trigger={({ toggle }) => (
              <button
                onClick={toggle}
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE] transition"
                aria-label="Orders status actions"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  icon={Eye}
                  onClick={() => {
                    // View all — open the first row's detail
                    if (ordersStatus.length > 0) openDetail(ordersStatus[0]);
                    close();
                  }}
                >
                  View Summary
                </MenuItem>
                <MenuItem
                  icon={Download}
                  onClick={() => {
                    // Export all orders
                    const csvHeaders = "Status,Assigned,Total\n";
                    const csvRows = ordersStatus.map((r) => `"${r.detail}",${r.assigned},${r.received}`).join("\n");
                    const csv = csvHeaders + csvRows;
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `orders-summary-${new Date().toISOString().slice(0, 10)}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    logActivity({
                      module: "Ticket",
                      action: "Orders Summary Exported",
                      severity: "info",
                      entity: "Ticket",
                      description: `Exported full orders summary (${totalReceived} tickets across ${ordersStatus.length} statuses).`,
                    });
                    close();
                  }}
                >
                  Export Summary
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </div>

      {/* Table */}
      <div className="mt-3 overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[1fr_auto_auto_auto] bg-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Status</div>
          <div className="w-16 text-center">Assigned</div>
          <div className="w-16 text-center">Total</div>
          <div className="w-9" />
        </div>
        <ul>
          {ordersStatus.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No active orders yet.</li>
          ) : (
            <>
              <AnimatePresence initial={false}>
                {ordersStatus.map((row, i) => (
                  <motion.li
                    key={row.status}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className="group grid grid-cols-[1fr_auto_auto_auto] items-center px-3 py-2.5 text-sm odd:bg-background even:bg-muted/40 cursor-pointer transition hover:bg-[#EEF1FD]/50"
                    onClick={() => openDetail(row)}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        row.status === "received" ? "bg-blue-500" :
                        row.status === "diagnosis" ? "bg-amber-500" :
                        row.status === "repairing" ? "bg-indigo-500" :
                        row.status === "qc" ? "bg-violet-500" :
                        row.status === "completed" ? "bg-emerald-500" :
                        "bg-zinc-400"
                      )} />
                      <span className="font-medium">{row.detail}</span>
                    </div>
                    <div className="w-16 text-center tabular-nums">{row.assigned}</div>
                    <div className="w-16 text-center tabular-nums">{row.received}</div>
                    <div className="w-9 flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <Dropdown
                        align="right"
                        width="w-40"
                        trigger={({ toggle }) => (
                          <button
                            onClick={toggle}
                            aria-label={`Actions for ${row.detail}`}
                            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        )}
                      >
                        {(close) => (
                          <>
                            <MenuItem icon={Eye} onClick={() => { openDetail(row); close(); }}>
                              View Details
                            </MenuItem>
                            <MenuItem icon={Filter} onClick={() => {
                              // Scroll to top / could hook into filter state
                              logActivity({
                                module: "Ticket",
                                action: "Status Filter Applied",
                                severity: "info",
                                entity: "Ticket",
                                reference: row.detail,
                                description: `Filtered dashboard by "${row.detail}" status.`,
                              });
                              close();
                            }}>
                              Filter by Status
                            </MenuItem>
                            <MenuItem icon={Download} onClick={() => { handleExport(row); close(); }}>
                              Export CSV
                            </MenuItem>
                          </>
                        )}
                      </Dropdown>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
              <li className="grid grid-cols-[1fr_auto_auto_auto] items-center bg-[#EEF1FD] px-3 py-2.5 text-sm font-semibold">
                <div>Total</div>
                <div className="w-16 text-center tabular-nums">{totalAssigned}</div>
                <div className="w-16 text-center tabular-nums">{totalReceived}</div>
                <div className="w-9" />
              </li>
            </>
          )}
        </ul>
      </div>

      {/* Detail Drawer */}
      <OrderStatusDetailDrawer
        row={selectedRow}
        tickets={tickets}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
