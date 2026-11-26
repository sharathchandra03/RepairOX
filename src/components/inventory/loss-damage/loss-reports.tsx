"use client";

/* Loss & Damage reports. Built from the SAME filtered incidents the register
   shows, grouped by the pure engine in lib/loss-damage.ts. The Excel/CSV export
   uses the same rows (reportExport), so export == on-screen. */

import { useMemo, useState } from "react";
import { BarChart3, Boxes, PackageX, ShieldAlert, Wallet } from "lucide-react";
import { ExportMenu } from "@/components/inventory/export-menu";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, Panel, StatusTabs } from "@/components/inventory/inv-ui";
import { ScrollHint } from "@/components/common/scroll-hint";
import { SegmentedTabs } from "@/components/ui/tabs";
import { downloadCSV, downloadXLSX, toCSV } from "@/lib/csv-utils";
import {
  GROUP_OPTIONS, buildReport, reportExport, reportTotals,
  type GroupBy, type Incident, type ReportBasis, type ReportRow,
} from "@/lib/loss-damage";
import { formatINR } from "@/lib/utils";

const r0 = (v: number) => formatINR(v);

export function LossReports({ rows, canViewCost, canExport }: { rows: Incident[]; canViewCost: boolean; canExport: boolean }) {
  const [by, setBy] = useState<GroupBy>("model");
  const [basis, setBasis] = useState<ReportBasis>("confirmed");

  const report = useMemo(() => buildReport(rows, by, basis), [rows, by, basis]);
  const totals = useMemo(() => reportTotals(report), [report]);
  const heading = GROUP_OPTIONS.find((g) => g.value === by)!.heading;
  const top = report[0];
  // Bars scale by value when cost is visible, otherwise by quantity.
  const metric = (r: ReportRow) => (canViewCost ? r.total : r.qty);
  const max = Math.max(...report.map(metric), 1);

  async function doExport(format: "xlsx" | "csv") {
    const { headers, rows: body } = reportExport(report, by, canViewCost);
    const name = `loss-damage-by-${by}-${new Date().toISOString().slice(0, 10)}`;
    if (format === "xlsx") await downloadXLSX(`${name}.xlsx`, headers, body, "Loss & Damage");
    else downloadCSV(`${name}.csv`, toCSV(headers, body));
  }

  const columns: InvColumn<ReportRow>[] = [
    { key: "label", pct: 30, header: heading, render: (r) => (
      <div className="min-w-0">
        <p className="truncate font-semibold" title={r.label}>{r.label}</p>
        {r.sub && <p className="truncate text-[11.5px] text-muted-foreground">{r.sub}</p>}
        <div className="mt-1.5 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-[#4361EE]" style={{ width: `${Math.max((metric(r) / max) * 100, metric(r) > 0 ? 3 : 0)}%` }} />
        </div>
      </div>
    ) },
    { key: "inc", pct: 9, header: "Incidents", align: "right", render: (r) => <span className="tabular-nums">{r.incidents}</span> },
    { key: "lq", pct: 9, header: "Loss qty", align: "right", render: (r) => <span className="tabular-nums text-rose-600">{r.lossQty || "—"}</span> },
    { key: "dq", pct: 9, header: "Damage qty", align: "right", render: (r) => <span className="tabular-nums text-amber-600">{r.damageQty || "—"}</span> },
    { key: "q", pct: 8, header: "Total qty", align: "right", render: (r) => <span className="font-semibold tabular-nums">{r.qty}</span> },
    { key: "lv", pct: 11, header: "Loss ₹", align: "right", hidden: !canViewCost, render: (r) => <span className="tabular-nums text-rose-600">{r.lossValue ? r0(r.lossValue) : "—"}</span> },
    { key: "dv", pct: 11, header: "Damage ₹", align: "right", hidden: !canViewCost, render: (r) => <span className="tabular-nums text-amber-600">{r.damageValue ? r0(r.damageValue) : "—"}</span> },
    { key: "tv", pct: 12, header: "Total ₹", align: "right", hidden: !canViewCost, render: (r) => <span className="font-bold tabular-nums">{r.total ? r0(r.total) : "—"}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InvKpi label="Incidents in report" value={totals.incidents} icon={ShieldAlert} tone="brand" />
        <InvKpi label="Units" value={totals.qty} hint={`${totals.lossQty} lost · ${totals.damageQty} damaged`} icon={Boxes} tone="amber" />
        {canViewCost ? (
          <>
            <InvKpi label="Financial impact" value={r0(totals.total)} hint={`${r0(totals.lossValue)} loss · ${r0(totals.damageValue)} damage`} icon={Wallet} tone="rose" />
            <InvKpi label={`Top ${heading.toLowerCase()}`} value={<span className="block max-w-[170px] truncate text-[1.1rem]" title={top?.label}>{top?.label ?? "—"}</span>} hint={top ? r0(top.total) : "Nothing reported"} icon={PackageX} tone="violet" />
          </>
        ) : (
          <>
            <InvKpi label="Units lost" value={totals.lossQty} icon={PackageX} tone="rose" />
            <InvKpi label="Units damaged" value={totals.damageQty} icon={PackageX} tone="violet" />
          </>
        )}
      </div>

      <Panel
        title={`${heading}-wise summary`}
        action={canExport ? <ExportMenu onExport={doExport} disabled={report.length === 0} /> : undefined}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <ScrollHint framed className="min-w-0 flex-initial">
            <SegmentedTabs size="sm" value={by} onChange={(v) => setBy(v as GroupBy)} className="border-0 bg-transparent p-0"
              options={GROUP_OPTIONS.map((g) => ({ label: g.label, value: g.value }))} />
          </ScrollHint>
          <StatusTabs<ReportBasis> value={basis} onChange={setBasis}
            options={[{ value: "confirmed", label: "Approved write-offs" }, { value: "all", label: "Include pending" }]} />
        </div>
        <p className="mb-3 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          {basis === "confirmed" ? "Counts only incidents a manager approved, the real financial loss." : "Also counts incidents still awaiting a decision. Rejected and restored ones are always left out."}
          {" "}Follows the filters above.
        </p>
        <InvTable flow columns={columns} rows={report} rowKey={(r) => r.key} itemLabel={heading.toLowerCase()} resetKey={`${by}|${basis}|${rows.length}`}
          emptyTitle="Nothing to report yet"
          emptyHint={basis === "confirmed" ? "No approved write-offs match these filters. Try “Include pending”." : "No incidents match these filters."} />
      </Panel>
    </div>
  );
}
