"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Boxes, Wallet, AlertTriangle, Layers, PackageX, ArrowRight, ArrowLeftRight,
  BadgeCheck, ArrowDownToLine, ArrowUpToLine, SlidersHorizontal, RotateCcw, ChevronRight,
} from "lucide-react";
import { StatTile } from "@/components/inventory/widgets";
import { Badge } from "@/components/ui/badge";
import { formatINR, cn } from "@/lib/utils";
import {
  inventoryStats, stockMovements, approvals,
  MOVEMENT_STATUS_TONE, MOVEMENT_STATUS_LABEL, type MovementType,
} from "@/lib/inventory-data";

const TYPE_ICON: Record<MovementType, React.ComponentType<{ className?: string }>> = {
  Transfer: ArrowLeftRight, Inward: ArrowDownToLine, Outward: ArrowUpToLine, Adjustment: SlidersHorizontal, Return: RotateCcw,
};

export function InventoryOverview() {
  const router = useRouter();
  const s = inventoryStats();
  const recent = stockMovements.slice(0, 4);
  const pending = approvals.filter((a) => a.status === "pending").slice(0, 3);
  const go = (path: string) => router.push(path);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Inventory Management</p>
          <h2 className="font-display mt-0.5 text-lg font-bold tracking-tight">Inventory Overview</h2>
        </div>
        <Link href="/inventory" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-semibold text-[#4361EE] transition hover:bg-muted">
          Open Inventory <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Metric tiles — each drills into the inventory module */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatTile label="Total Items" value={s.count} icon={Boxes} tone="sky" hint="In catalogue" delay={0.02} onClick={() => go("/inventory/item-master")} />
        <StatTile label="Inventory Value" value={s.value} format={formatINR} icon={Wallet} tone="emerald" hint="At buying price" delay={0.04} onClick={() => go("/inventory")} />
        <StatTile label="Low Stock" value={s.low} icon={AlertTriangle} tone="amber" hint="Below minimum" delay={0.06} onClick={() => go("/inventory/item-master?status=low")} />
        <StatTile label="Excess Stock" value={s.excess} icon={Layers} tone="violet" hint="Above maximum" delay={0.08} onClick={() => go("/inventory/item-master?status=excess")} />
        <StatTile label="Negative Stock" value={s.negative} icon={PackageX} tone="rose" hint="Needs correction" delay={0.1} onClick={() => go("/inventory/item-master?status=negative")} />
      </div>

      {/* Recent movements + pending approvals */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><ArrowLeftRight className="h-3.5 w-3.5" /></span>
              <p className="text-[13px] font-semibold">Recent Stock Movements</p>
            </div>
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
                  onClick={() => go("/inventory/stock-movement")}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted/50"
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
    </section>
  );
}
