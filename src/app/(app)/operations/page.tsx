"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Boxes, Wallet, AlertTriangle, Layers, PackageX, ArrowRight, ArrowLeftRight,
  BadgeCheck, Truck, ClipboardList, ChevronRight, Plus,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/inventory/widgets";
import { formatINR } from "@/lib/utils";
import {
  inventoryStats, stockMovements, approvals,
  MOVEMENT_STATUS_TONE, MOVEMENT_STATUS_LABEL, type MovementType,
} from "@/lib/inventory-data";

const TYPE_ICON: Record<MovementType, React.ComponentType<{ className?: string }>> = {
  Transfer: ArrowLeftRight, Inward: Boxes, Outward: Boxes, Adjustment: ClipboardList, Return: ArrowLeftRight,
};

/* Lightweight vendor / purchase-order snapshots — the two things an
   Inventory Manager needs to act on today, kept off the main inventory
   dataset so this dashboard stays fast and focused. */
const OPEN_PURCHASE_ORDERS = [
  { id: "PO-2041", vendor: "Mobilex Distributors", items: 18, value: 84500, eta: "Tomorrow" },
  { id: "PO-2038", vendor: "ScreenTech Supplies",   items: 6,  value: 21200, eta: "2 days" },
  { id: "PO-2035", vendor: "PartsHub India",        items: 32, value: 145000, eta: "4 days" },
];

const TOP_VENDORS = [
  { name: "Mobilex Distributors", orders: 24, spend: 412000 },
  { name: "ScreenTech Supplies",  orders: 18, spend: 268000 },
  { name: "PartsHub India",       orders: 15, spend: 512000 },
];

export default function OperationsDashboard() {
  const s = inventoryStats();
  const recent = stockMovements.slice(0, 4);
  const pending = approvals.filter((a) => a.status === "pending").slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Operations Overview"
        subtitle="Stock health, purchasing and vendors — what needs your attention right now."
        actions={
          <Link href="/operations/purchase-orders">
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Purchase Order
            </Button>
          </Link>
        }
      />

      {/* Primary metrics — the "need to know right now" row */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Total Items" value={s.count} icon={Boxes} tone="sky" hint="In catalogue" delay={0.02} />
        <StatTile label="Inventory Value" value={s.value} format={formatINR} icon={Wallet} tone="emerald" hint="At buying price" delay={0.04} />
        <StatTile label="Low Stock" value={s.low} icon={AlertTriangle} tone="amber" hint="Below minimum" delay={0.06} />
        <StatTile label="Excess Stock" value={s.excess} icon={Layers} tone="violet" hint="Above maximum" delay={0.08} />
        <StatTile label="Negative Stock" value={s.negative} icon={PackageX} tone="rose" hint="Needs correction" delay={0.1} />
      </div>

      {/* Secondary — purchasing + vendors + approvals, the actionable middle layer */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Open purchase orders */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><ClipboardList className="h-3.5 w-3.5" /></span>
              <p className="text-[13px] font-semibold">Open Purchase Orders</p>
            </div>
            <Link href="/operations/purchase-orders" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="space-y-1">
            {OPEN_PURCHASE_ORDERS.map((po, i) => (
              <motion.li
                key={po.id}
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.04 * i }}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-muted/50"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Truck className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight">
                    <span className="font-mono">{po.id}</span> · {po.vendor}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{po.items} items · ETA {po.eta}</p>
                </div>
                <span className="text-[13px] font-bold text-[#4361EE] tnum whitespace-nowrap">{formatINR(po.value)}</span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Pending approvals */}
        <Link
          href="/inventory/approvals"
          className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-700"><BadgeCheck className="h-3.5 w-3.5" /></span>
              <p className="text-[13px] font-semibold">Pending Approvals</p>
            </div>
            <span className="font-display text-2xl font-extrabold text-amber-600 tnum">{s.pendingApprovals}</span>
          </div>
          <ul className="mt-3 flex-1 space-y-1.5">
            {pending.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold">{a.id}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{a.docType} · {a.createdBy}</p>
                </div>
                <Badge tone="warning" dot>Pending</Badge>
              </li>
            ))}
          </ul>
          <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE]">
            Review approvals <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>

      {/* Tertiary — recent movements + top vendors, drill-down territory */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Stock Movements</p>
            <Link href="/inventory/stock-movement" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="space-y-1">
            {recent.map((m, i) => {
              const Icon = TYPE_ICON[m.type];
              return (
                <motion.li
                  key={m.docNumber}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i }}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted/50"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold leading-tight">
                      <span className="font-mono">{m.docNumber}</span> · {m.type}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{m.fromStore} → {m.toStore} · {m.items} items</p>
                  </div>
                  <Badge tone={MOVEMENT_STATUS_TONE[m.status]}>{MOVEMENT_STATUS_LABEL[m.status]}</Badge>
                </motion.li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Top Vendors</p>
          <ul className="space-y-2.5">
            {TOP_VENDORS.map((v, i) => (
              <motion.li
                key={v.name}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold">{v.name}</p>
                  <p className="text-[11px] text-muted-foreground">{v.orders} orders</p>
                </div>
                <span className="whitespace-nowrap text-[12.5px] font-bold text-[#4361EE] tnum">{formatINR(v.spend)}</span>
              </motion.li>
            ))}
          </ul>
          <Link href="/operations/vendors" className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#4361EE] hover:underline">
            View all vendors <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
