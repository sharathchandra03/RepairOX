"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw, ArrowLeftRight, ArrowDownToLine, ArrowUpToLine, SlidersHorizontal,
  RotateCcw, Eye, Store, ArrowRight, User, Package, CalendarDays, Table2, GitBranch,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { DataTable, type Column } from "@/components/inventory/data-table";
import { FilterSelect } from "@/components/inventory/widgets";
import { cn } from "@/lib/utils";
import {
  stockMovements, MOVEMENT_STATUS_LABEL, MOVEMENT_STATUS_TONE,
  type StockMovement, type MovementType, type MovementStatus,
} from "@/lib/inventory-data";

const TYPE_ICON: Record<MovementType, React.ComponentType<{ className?: string }>> = {
  Transfer: ArrowLeftRight,
  Inward: ArrowDownToLine,
  Outward: ArrowUpToLine,
  Adjustment: SlidersHorizontal,
  Return: RotateCcw,
};
const TYPE_TONE: Record<MovementType, "info" | "success" | "warning" | "violet" | "neutral"> = {
  Transfer: "info", Inward: "success", Outward: "warning", Adjustment: "violet", Return: "neutral",
};

function StatusBadge({ status }: { status: MovementStatus }) {
  return <Badge tone={MOVEMENT_STATUS_TONE[status]} dot={status === "in-transit"}>{MOVEMENT_STATUS_LABEL[status]}</Badge>;
}

export default function StockMovementPage() {
  const [view, setView] = useState("table");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [active, setActive] = useState<StockMovement | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(
    () => stockMovements.filter((m) => (type === "all" || m.type === type) && (status === "all" || m.status === status)),
    [type, status]
  );

  function refresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }

  const columns: Column<StockMovement>[] = [
    { key: "docNumber", header: "Document Number", primary: true, hideable: false, accessor: (r) => r.docNumber, render: (r) => <span className="font-semibold">{r.docNumber}</span> },
    { key: "from", header: "From Store", accessor: (r) => r.fromStore, render: (r) => <span className="text-[13px]">{r.fromStore}</span> },
    { key: "to", header: "To Store", accessor: (r) => r.toStore, render: (r) => <span className="text-[13px]">{r.toStore}</span> },
    { key: "items", header: "No. Of Items", accessor: (r) => r.items, align: "right", render: (r) => <span className="tnum font-semibold">{r.items}</span> },
    { key: "date", header: "Date", accessor: (r) => r.date, render: (r) => <span className="text-muted-foreground">{r.date}</span> },
    { key: "user", header: "User", accessor: (r) => r.user },
    { key: "type", header: "Movement Type", accessor: (r) => r.type, render: (r) => {
      const Icon = TYPE_ICON[r.type];
      return <Badge tone={TYPE_TONE[r.type]}><Icon className="h-3 w-3" />{r.type}</Badge>;
    } },
    { key: "status", header: "Status", accessor: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventory Management"
        title="Stock Movement"
        subtitle="Track transfers, inward and outward flows between stores."
        actions={
          <>
            <SegmentedTabs
              size="sm"
              options={[{ label: "Table", value: "table" }, { label: "Timeline", value: "timeline" }]}
              value={view}
              onChange={setView}
            />
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh
            </Button>
          </>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-card">
        <FilterSelect
          label="Movement Type"
          value={type}
          onChange={setType}
          options={[{ value: "all", label: "All Types" }, ...(["Transfer", "Inward", "Outward", "Adjustment", "Return"] as const).map((t) => ({ value: t, label: t }))]}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[{ value: "all", label: "All Statuses" }, ...(Object.keys(MOVEMENT_STATUS_LABEL) as MovementStatus[]).map((s) => ({ value: s, label: MOVEMENT_STATUS_LABEL[s] }))]}
        />
        <span className="ml-auto text-[12px] text-muted-foreground">{filtered.length} movements</span>
      </div>

      {view === "table" ? (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.docNumber}
          pageSize={8}
          loading={refreshing}
          onRowClick={(r) => setActive(r)}
          minTableWidth={1000}
          rowActions={(r) => [{ label: "View details", icon: Eye, onClick: () => setActive(r) }]}
          emptyTitle="No movements found"
          emptyDescription="Adjust the type or status filters to see stock movements."
        />
      ) : (
        <Timeline rows={filtered} onSelect={setActive} />
      )}

      {/* Detail drawer */}
      <Drawer
        open={!!active}
        onClose={() => setActive(null)}
        icon={active ? TYPE_ICON[active.type] : undefined}
        title={active?.docNumber ?? ""}
        subtitle={active ? `${active.type} · ${active.date}` : ""}
        footer={<p className="text-center text-[12px] text-muted-foreground">Logged by {active?.user}</p>}
      >
        {active && (
          <div className="space-y-5">
            {/* Route visual */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-4">
              <div className="min-w-0 flex-1 text-center">
                <span className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-card ring-1 ring-inset ring-border"><Store className="h-4 w-4 text-muted-foreground" /></span>
                <p className="mt-1.5 truncate text-[12px] font-medium">{active.fromStore}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">From</p>
              </div>
              <div className="flex flex-col items-center">
                <Badge tone={TYPE_TONE[active.type]}>{active.items} items</Badge>
                <ArrowRight className="mt-1 h-4 w-4 text-[#4361EE]" />
              </div>
              <div className="min-w-0 flex-1 text-center">
                <span className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-card ring-1 ring-inset ring-border"><Store className="h-4 w-4 text-muted-foreground" /></span>
                <p className="mt-1.5 truncate text-[12px] font-medium">{active.toStore}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">To</p>
              </div>
            </div>

            <div className="divide-y divide-border">
              <DetailRow label="Movement Type"><Badge tone={TYPE_TONE[active.type]}>{active.type}</Badge></DetailRow>
              <DetailRow label="Status"><StatusBadge status={active.status} /></DetailRow>
              <DetailRow label="Number Of Items"><span className="tnum">{active.items}</span></DetailRow>
              <DetailRow label="Date">{active.date}</DetailRow>
              <DetailRow label="User">{active.user}</DetailRow>
            </div>

            {/* Lifecycle timeline */}
            <div>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle</p>
              <Lifecycle status={active.status} />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

/* ── Timeline view — movements grouped by date ── */
function Timeline({ rows, onSelect }: { rows: StockMovement[]; onSelect: (m: StockMovement) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, StockMovement[]>();
    rows.forEach((r) => map.set(r.date, [...(map.get(r.date) ?? []), r]));
    return [...map.entries()];
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="grid place-items-center rounded-2xl border border-border bg-card p-16 text-center shadow-card">
        <p className="font-display text-base font-bold">No movements found</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Adjust the filters to populate the timeline.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="space-y-6">
        {groups.map(([date, items]) => (
          <div key={date}>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><CalendarDays className="h-3.5 w-3.5" /></span>
              <p className="text-[12px] font-semibold">{date}</p>
              <span className="text-[11px] text-muted-foreground">· {items.length} movement{items.length > 1 ? "s" : ""}</span>
            </div>
            <ol className="relative ml-3 space-y-3 border-l border-border pl-6">
              {items.map((m, i) => {
                const Icon = TYPE_ICON[m.type];
                return (
                  <motion.li
                    key={m.docNumber}
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.2) }}
                    className="relative"
                  >
                    <span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full bg-card ring-1 ring-inset ring-border">
                      <Icon className="h-3 w-3 text-[#4361EE]" />
                    </span>
                    <button
                      onClick={() => onSelect(m)}
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3.5 py-2.5 text-left transition hover:bg-muted/40"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-[12px] font-semibold">{m.docNumber}</span>
                        <span className="hidden items-center gap-1 text-[12px] text-muted-foreground sm:inline-flex">
                          {m.fromStore} <ArrowRight className="h-3 w-3" /> {m.toStore}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Package className="h-3 w-3" />{m.items}</span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><User className="h-3 w-3" />{m.user}</span>
                        <StatusBadge status={m.status} />
                      </div>
                    </button>
                  </motion.li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}

function Lifecycle({ status }: { status: MovementStatus }) {
  const steps = ["Created", "In Transit", "Completed"];
  const reached =
    status === "cancelled" ? 1 : status === "draft" ? 1 : status === "in-transit" ? 2 : 3;
  const cancelled = status === "cancelled";
  return (
    <ol className="relative ml-2 space-y-4 border-l border-border pl-6">
      {steps.map((s, i) => {
        const done = i + 1 <= reached;
        return (
          <li key={s} className="relative">
            <span className={cn(
              "absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full ring-1 ring-inset",
              done ? "bg-[#4361EE] text-white ring-[#4361EE]" : "bg-card text-muted-foreground ring-border"
            )}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            <p className={cn("text-[13px] font-medium", !done && "text-muted-foreground")}>{s}</p>
          </li>
        );
      })}
      {cancelled && <li className="relative"><span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white"><span className="h-1.5 w-1.5 rounded-full bg-current" /></span><p className="text-[13px] font-medium text-rose-600">Cancelled</p></li>}
    </ol>
  );
}
