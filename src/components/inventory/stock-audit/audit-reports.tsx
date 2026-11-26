"use client";
/* Stock Audit reports: accuracy, shrinkage, repeat differences and items nobody has counted lately.
   Built from approved audits only (those are the ones that corrected stock). */
import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, CalendarClock, ClipboardCheck, Target, TrendingDown } from "lucide-react";
import { ExportMenu } from "@/components/inventory/export-menu";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, Panel, StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { Select } from "@/components/ui/input";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { downloadCSV, downloadXLSX, toCSV } from "@/lib/csv-utils";
import {
  accuracyByAudit, approvedAudits, counterAccuracy, notAuditedSince, repeatVariance, shrinkage,
  type AccuracyRow, type GroupBy, type ShrinkRow, type StaleItem,
} from "@/lib/stock-audit";
import { formatINR } from "@/lib/utils";

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "category", label: "By category" }, { value: "item", label: "By item" }, { value: "counter", label: "By counter" }, { value: "reason", label: "By reason" },
];
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const date = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };

export function AuditReports() {
  const { docsOfType } = useInventoryOps();
  const { stockItems, canViewCost, inventory } = useInventoryScope();
  const { can } = usePermissions();
  const canExport = allow(can, CAP.stockAudit.export);
  const [by, setBy] = useState<GroupBy>("category");
  const [days, setDays] = useState("30");
  const docs = docsOfType("stock_count");
  const costOf = useMemo(() => { const m = new Map(inventory.map((i) => [i.id, i.costPrice ?? 0])); return (id: string) => m.get(id) ?? 0; }, [inventory]);
  const approved = approvedAudits(docs);
  const acc = useMemo(() => accuracyByAudit(docs), [docs]);
  const shrink = useMemo(() => shrinkage(docs, by, canViewCost ? costOf : undefined), [docs, by, canViewCost, costOf]);
  const counters = useMemo(() => counterAccuracy(docs), [docs]);
  const repeat = useMemo(() => repeatVariance(docs), [docs]);
  const stale = useMemo(() => notAuditedSince(stockItems, docs, Number(days)), [stockItems, docs, days]);
  const totals = useMemo(() => {
    const counted = acc.reduce((n, a) => n + a.counted, 0), matched = acc.reduce((n, a) => n + a.matched, 0);
    return { counted, matched, short: acc.reduce((n, a) => n + a.shortUnits, 0), excess: acc.reduce((n, a) => n + a.excessUnits, 0), accuracy: counted ? matched / counted : null };
  }, [acc]);
  const netValue = shrink.reduce((n, r) => n + r.value, 0);

  const accCols: InvColumn<AccuracyRow>[] = [
    { key: "id", header: "Audit", render: (r) => <Link href={`/inventory/stock-count/${r.id}`} className="font-bold text-[#4361EE] hover:underline">{r.id}</Link> },
    { key: "date", header: "Approved", render: (r) => <span className="text-muted-foreground">{date(r.at)}</span> },
    { key: "scope", header: "Scope", grow: true, render: (r) => <span className="block truncate" title={r.scope}>{r.scope || "—"}</span> },
    { key: "counted", header: "Counted", align: "right", render: (r) => <span className="tabular-nums">{r.counted}</span> },
    { key: "short", header: "Short", align: "right", render: (r) => <span className="tabular-nums text-rose-600">{r.shortUnits ? `−${r.shortUnits}` : "0"}</span> },
    { key: "excess", header: "Excess", align: "right", render: (r) => <span className="tabular-nums text-sky-700">{r.excessUnits ? `+${r.excessUnits}` : "0"}</span> },
    { key: "acc", header: "Accuracy", align: "right", render: (r) => <span className="font-bold tabular-nums">{pct(r.accuracy)}</span> },
  ];
  const shrinkCols: InvColumn<ShrinkRow>[] = [
    { key: "label", header: GROUPS.find((g) => g.value === by)?.label.replace("By ", "") ?? "", grow: true, render: (r) => <span className="block truncate font-medium" title={r.label}>{r.label}</span> },
    { key: "lines", header: "Counts", align: "right", render: (r) => <span className="tabular-nums">{r.lines}</span> },
    { key: "short", header: "Short", align: "right", render: (r) => <span className="tabular-nums text-rose-600">{r.shortUnits ? `−${r.shortUnits}` : "0"}</span> },
    { key: "excess", header: "Excess", align: "right", render: (r) => <span className="tabular-nums text-sky-700">{r.excessUnits ? `+${r.excessUnits}` : "0"}</span> },
    { key: "net", header: "Net units", align: "right", render: (r) => <span className="font-semibold tabular-nums">{r.netUnits > 0 ? `+${r.netUnits}` : r.netUnits}</span> },
    { key: "value", header: "Net value", align: "right", hidden: !canViewCost, render: (r) => <span className="font-semibold tabular-nums">{formatINR(r.value)}</span> },
  ];
  const staleCols: InvColumn<StaleItem>[] = [
    { key: "item", header: "Item", grow: true, render: (r) => <div className="min-w-0"><p className="truncate font-medium" title={r.item.name}>{r.item.name}</p><p className="truncate text-[11.5px] text-muted-foreground">{r.item.id} · {r.item.category}</p></div> },
    { key: "loc", header: "Location", render: (r) => <span className="text-muted-foreground">{r.item.store || "—"}</span> },
    { key: "stock", header: "On hand", align: "right", render: (r) => <span className="tabular-nums">{r.item.currentStock}</span> },
    { key: "last", header: "Last counted", align: "right", render: (r) => <span className={r.lastAt === null ? "font-semibold text-amber-700" : "text-muted-foreground"}>{r.lastAt === null ? "Never" : `${r.days} days ago`}</span> },
  ];

  async function exportShrink(format: "xlsx" | "csv") {
    const headers = [GROUPS.find((g) => g.value === by)?.label.replace("By ", "") ?? "Group", "Counts", "Short units", "Excess units", "Net units", ...(canViewCost ? ["Net value"] : [])];
    const rows = shrink.map((r) => [r.label, r.lines, r.shortUnits, r.excessUnits, r.netUnits, ...(canViewCost ? [r.value] : [])]);
    const name = `stock-audit-variance-by-${by}-${new Date().toISOString().slice(0, 10)}`;
    if (format === "xlsx") await downloadXLSX(`${name}.xlsx`, headers, rows, "Variance"); else downloadCSV(`${name}.csv`, toCSV(headers, rows));
  }
  async function exportStale(format: "xlsx" | "csv") {
    const headers = ["SKU", "Item", "Category", "Location", "On hand", "Last counted"];
    const rows = stale.map((s) => [s.item.id, s.item.name, s.item.category, s.item.store, s.item.currentStock, s.lastAt === null ? "Never" : date(new Date(s.lastAt).toISOString())]);
    const name = `stock-not-audited-${days}d-${new Date().toISOString().slice(0, 10)}`;
    if (format === "xlsx") await downloadXLSX(`${name}.xlsx`, headers, rows, "Not audited"); else downloadCSV(`${name}.csv`, toCSV(headers, rows));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InvKpi label="Approved audits" value={approved.length} icon={ClipboardCheck} tone="brand" hint="Reports use approved audits only" />
        <InvKpi label="Count accuracy" value={pct(totals.accuracy)} icon={Target} tone="emerald" hint={`${totals.matched} of ${totals.counted} counts matched`} />
        <InvKpi label="Units short / excess" value={`−${totals.short} / +${totals.excess}`} icon={TrendingDown} tone="rose" hint="Across approved audits" />
        {canViewCost
          ? <InvKpi label="Net variance value" value={formatINR(netValue)} icon={BarChart3} tone="violet" hint="At cost, short less excess" />
          : <InvKpi label="Repeat differences" value={repeat.length} icon={BarChart3} tone="violet" hint="Items off in 2+ audits" />}
      </div>

      <Panel title="Variance summary" action={canExport ? <ExportMenu onExport={exportShrink} disabled={shrink.length === 0} /> : undefined}>
        <div className="mb-3"><StatusTabs<GroupBy> value={by} onChange={setBy} options={GROUPS} /></div>
        <InvTable flow columns={shrinkCols} rows={shrink} rowKey={(r) => r.key} itemLabel="row" resetKey={by} emptyTitle="No approved audits yet" emptyHint="Differences appear here once an audit is approved." />
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Accuracy by audit">
          <InvTable flow columns={accCols} rows={acc} rowKey={(r) => r.id} itemLabel="audit" emptyTitle="No approved audits yet" />
        </Panel>
        <Panel title="Counter accuracy">
          <InvTable flow rows={counters} rowKey={(r) => r.name} itemLabel="counter" emptyTitle="No counts yet"
            columns={[
              { key: "n", header: "Counter", grow: true, render: (r) => <span className="font-medium">{r.name}</span> },
              { key: "l", header: "Counts", align: "right", render: (r) => <span className="tabular-nums">{r.lines}</span> },
              { key: "m", header: "Matched", align: "right", render: (r) => <span className="tabular-nums">{r.matched}</span> },
              { key: "a", header: "Accuracy", align: "right", render: (r) => <span className="font-bold tabular-nums">{pct(r.accuracy)}</span> },
            ]} />
        </Panel>
      </div>

      {repeat.length > 0 && (
        <Panel title="Items that keep differing">
          <InvTable flow rows={repeat} rowKey={(r) => r.itemId} itemLabel="item"
            columns={[
              { key: "i", header: "Item", grow: true, render: (r) => <div className="min-w-0"><p className="truncate font-medium">{r.name}</p><p className="text-[11.5px] text-muted-foreground">{r.itemId}</p></div> },
              { key: "t", header: "Audits with a difference", align: "right", render: (r) => <span className="font-bold tabular-nums">{r.times}</span> },
              { key: "n", header: "Net units", align: "right", render: (r) => <span className="tabular-nums">{r.netUnits > 0 ? `+${r.netUnits}` : r.netUnits}</span> },
            ]} />
        </Panel>
      )}

      <Panel title="Not audited lately" action={canExport ? <ExportMenu onExport={exportStale} disabled={stale.length === 0} /> : undefined}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <span className="text-[13px] text-muted-foreground">Items not counted in the last</span>
          <Select className="h-[34px] w-[120px]" value={days} onChange={(e) => setDays(e.target.value)} options={[{ label: "30 days", value: "30" }, { label: "60 days", value: "60" }, { label: "90 days", value: "90" }, { label: "180 days", value: "180" }]} />
          <span className="text-[13px] font-semibold">{stale.length} item{stale.length === 1 ? "" : "s"}</span>
        </div>
        <InvTable flow columns={staleCols} rows={stale} rowKey={(r) => r.item.id} itemLabel="item" resetKey={days} emptyTitle="Everything has been counted recently" />
      </Panel>
    </div>
  );
}
