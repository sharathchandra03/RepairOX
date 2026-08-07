"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MoreHorizontal, Eye, Download, Truck, MapPin, Store,
  User, Package,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { cn, formatINR } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { getTicketDevices, type Ticket, type DeviceRecord } from "@/lib/mock-data";
import { logActivity } from "@/lib/activity-log";

/* ── Types ── */
type OrderType = "pickup" | "onsite" | "walkin";

type OrderTypeRow = {
  type: OrderType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  assigned: number;
  received: number;
};

/* ── Type config ── */
const TYPE_CONFIG: Record<OrderType, { label: string; icon: React.ComponentType<{ className?: string }>; dot: string }> = {
  pickup: { label: "Pickup", icon: Truck, dot: "bg-violet-500" },
  onsite: { label: "On-site", icon: MapPin, dot: "bg-sky-500" },
  walkin: { label: "Walk-in", icon: Store, dot: "bg-emerald-500" },
};

/* ── Helper: get device type from ticket ── */
function getTicketType(ticket: Ticket): OrderType | null {
  const devices = getTicketDevices(ticket);
  // Use first device's type — most tickets have a single type
  for (const d of devices) {
    if (d.type === "pickup") return "pickup";
    if (d.type === "onsite") return "onsite";
    if (d.type === "walkin") return "walkin";
  }
  return null;
}

/* ── Helper: is ticket "assigned" (has technician) ── */
function isAssigned(ticket: Ticket): boolean {
  // Check device-level assignment first
  const devices = getTicketDevices(ticket);
  if (devices.some((d) => d.assignedTo && d.assignedTo.trim() !== "")) return true;
  // Fallback to ticket-level technician
  return Boolean(ticket.technician && ticket.technician.trim() !== "");
}

/* ── Helper: is ticket "received" (device physically at store) ── */
function isReceived(ticket: Ticket): boolean {
  // A ticket is considered "received" when its status indicates it's being worked on
  // and not yet collected (meaning the device is physically at the shop)
  const activeStatuses = ["in_progress", "waiting_approval", "waiting_parts", "repaired"];
  return activeStatuses.includes(ticket.status);
}

/* ── Detail drawer ── */
function OrderTypeDetailDrawer({
  row,
  tickets,
  column,
  open,
  onClose,
}: {
  row: OrderTypeRow | null;
  tickets: Ticket[];
  column: "assigned" | "received" | null;
  open: boolean;
  onClose: () => void;
}) {
  const filteredTickets = React.useMemo(() => {
    if (!row || !column) return [];
    const byType = tickets.filter((t) => getTicketType(t) === row.type);
    if (column === "assigned") return byType.filter(isAssigned);
    return byType.filter(isReceived);
  }, [row, column, tickets]);

  const Icon = row ? row.icon : Package;
  const title = row ? `${row.label} — ${column === "assigned" ? "Assigned" : "Received"}` : "Orders";
  const subtitle = `${filteredTickets.length} ticket${filteredTickets.length !== 1 ? "s" : ""}`;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      icon={Icon}
      width="max-w-md"
    >
      {row && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{filteredTickets.length}</p>
                <p className="text-[11px] text-muted-foreground">
                  {column === "assigned" ? "Assigned" : "Received"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-[#4361EE]">
                  {formatINR(filteredTickets.reduce((s, t) => s + (t.amount || 0), 0))}
                </p>
                <p className="text-[11px] text-muted-foreground">Total Value</p>
              </div>
            </div>
          </div>

          {/* Ticket list */}
          {filteredTickets.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No tickets found.
            </div>
          ) : (
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-0.5">
              {filteredTickets.slice(0, 25).map((ticket) => (
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
              {filteredTickets.length > 25 && (
                <p className="py-2 text-center text-[11px] text-muted-foreground">
                  +{filteredTickets.length - 25} more tickets
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* ── Widget ── */
export function OrdersStatusWidget({ className, tickets: ticketsProp }: { className?: string; tickets?: Ticket[] }) {
  const store = useStore();
  const tickets = ticketsProp ?? store.tickets;
  const [selectedRow, setSelectedRow] = React.useState<OrderTypeRow | null>(null);
  const [selectedColumn, setSelectedColumn] = React.useState<"assigned" | "received" | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Compute live order type data from real ticket + walk-in data
  const orderRows = React.useMemo((): OrderTypeRow[] => {
    const types: OrderType[] = ["pickup", "onsite", "walkin"];
    return types.map((type) => {
      const config = TYPE_CONFIG[type];
      const typeTickets = tickets.filter((t) => getTicketType(t) === type);
      const assigned = typeTickets.filter(isAssigned).length;
      const received = typeTickets.filter(isReceived).length;
      return { type, label: config.label, icon: config.icon, assigned, received };
    });
  }, [tickets]);

  const totalAssigned = React.useMemo(
    () => orderRows.reduce((s, r) => s + r.assigned, 0),
    [orderRows]
  );
  const totalReceived = React.useMemo(
    () => orderRows.reduce((s, r) => s + r.received, 0),
    [orderRows]
  );

  const hasData = totalAssigned > 0 || totalReceived > 0;

  const openDetail = (row: OrderTypeRow, column: "assigned" | "received") => {
    setSelectedRow(row);
    setSelectedColumn(column);
    setDrawerOpen(true);
    logActivity({
      module: "Ticket",
      action: "Order Status Viewed",
      severity: "info",
      entity: "Ticket",
      reference: `${row.label} — ${column}`,
      description: `Viewed ${row.label} ${column} orders (${column === "assigned" ? row.assigned : row.received} tickets).`,
    });
  };

  const handleExport = () => {
    const csvHeaders = "Type,Assigned,Received\n";
    const csvRows = orderRows.map((r) => `"${r.label}",${r.assigned},${r.received}`).join("\n");
    const csv = csvHeaders + csvRows;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-status-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logActivity({
      module: "Ticket",
      action: "Orders Summary Exported",
      severity: "info",
      entity: "Ticket",
      description: `Exported orders status summary.`,
    });
  };

  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] sm:p-6", className)}>
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
                <MenuItem icon={Download} onClick={() => { handleExport(); close(); }}>
                  Export Summary
                </MenuItem>
              </>
            )}
          </Dropdown>
        </div>
      </div>

      {/* Table */}
      <div className="mt-3 overflow-hidden rounded-xl border border-border">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_80px] bg-muted px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Type</div>
          <div className="text-center">Assigned</div>
          <div className="text-center">Received</div>
        </div>

        {/* Rows */}
        {!hasData ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No active orders.
          </div>
        ) : (
          <div>
            <AnimatePresence initial={false}>
              {orderRows.map((row, i) => {
                const Config = TYPE_CONFIG[row.type];
                const Icon = Config.icon;
                return (
                  <motion.div
                    key={row.type}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className="group grid grid-cols-[1fr_80px_80px] items-center px-4 py-3 text-sm border-t border-border transition hover:bg-[#EEF1FD]/40"
                  >
                    {/* Type label */}
                    <div className="flex items-center gap-2.5">
                      <span className={cn("h-2 w-2 rounded-full shrink-0", Config.dot)} />
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-foreground">{row.label}</span>
                    </div>

                    {/* Assigned — clickable */}
                    <button
                      onClick={() => openDetail(row, "assigned")}
                      className={cn(
                        "mx-auto grid h-8 w-14 place-items-center rounded-lg text-sm font-semibold tabular-nums transition",
                        row.assigned > 0
                          ? "text-[#4361EE] hover:bg-[#4361EE]/10 cursor-pointer"
                          : "text-muted-foreground/50 cursor-default"
                      )}
                      disabled={row.assigned === 0}
                      aria-label={`View ${row.label} assigned tickets`}
                    >
                      {row.assigned}
                    </button>

                    {/* Received — clickable */}
                    <button
                      onClick={() => openDetail(row, "received")}
                      className={cn(
                        "mx-auto grid h-8 w-14 place-items-center rounded-lg text-sm font-semibold tabular-nums transition",
                        row.received > 0
                          ? "text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                          : "text-muted-foreground/50 cursor-default"
                      )}
                      disabled={row.received === 0}
                      aria-label={`View ${row.label} received tickets`}
                    >
                      {row.received}
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Total row */}
            <div className="grid grid-cols-[1fr_80px_80px] items-center bg-[#EEF1FD] px-4 py-2.5 text-sm font-semibold border-t border-border">
              <div className="text-foreground">Total</div>
              <div className="text-center tabular-nums text-[#4361EE]">{totalAssigned}</div>
              <div className="text-center tabular-nums text-emerald-700">{totalReceived}</div>
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <OrderTypeDetailDrawer
        row={selectedRow}
        tickets={tickets}
        column={selectedColumn}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
