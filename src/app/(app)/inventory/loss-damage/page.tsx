"use client";

/* Inventory → Loss & Damage.

   One register of incidents (loss = missing stock, damage = unusable stock) with
   a manager approval workflow, plus a report section built from the same rows.

   An incident is a `write_off` inventory document. Stock is written off ONLY when
   a manager approves it (use-inventory-actions → effect `writeoff_out`), which
   depletes cost layers and logs the movement. Reported / verified / quarantined /
   rejected incidents never touch stock. Older write-offs (before the workflow)
   still appear as confirmed. Full detail lives on /inventory/loss-damage/[id]. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, Hourglass, X, PackageX, Plus, ShieldAlert, ShieldQuestion, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { Select } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/tabs";
import { ScrollHint } from "@/components/common/scroll-hint";
import { TableSearch } from "@/components/common/table-utility-bar";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import { DeviceCard } from "@/components/common/device-card";
import { ExportMenu } from "@/components/inventory/export-menu";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, InvPageHeader, StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { IncidentStatus, KindPill, money, statusLabel } from "@/components/inventory/loss-damage/ld-ui";
import { LossReports } from "@/components/inventory/loss-damage/loss-reports";
import { DecisionDialog } from "@/components/inventory/loss-damage/decision-dialog";
import { ReportIncidentDialog } from "@/components/inventory/loss-damage/report-incident-dialog";
import { useStore } from "@/lib/store";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { CAP, allow } from "@/lib/capabilities";
import { usePermissions } from "@/lib/permissions-context";
import { NoPermission } from "@/components/common/no-permission";
import { formatINR } from "@/lib/utils";
import { STANDARD_DATE_STRIP, isInListDateRange, type ListDatePreset } from "@/lib/date-filter";
import { downloadCSV, downloadXLSX, toCSV } from "@/lib/csv-utils";
import {
  STATUS_FILTERS, actionableFor, buildIncidents, computeKpis, matchesStatusFilter, quickActions, registerExport,
  type Incident, type IncidentKind, type QuickAction, type StatusFilter,
} from "@/lib/loss-damage";

type View = "register" | "reports";
const ALL = "__all__";

export default function LossDamagePage() {
  const router = useRouter();
  const { stockMovements } = useStore();
  const { docsOfType, ready } = useInventoryOps();
  const { canViewCost } = useInventoryScope();
  const { can, currentUser } = usePermissions();
  const myId = currentUser?.id;
  const [decide, setDecide] = useState<{ inc: Incident; qa: QuickAction } | null>(null);
  const canReports = allow(can, CAP.lossDamage.reports);
  const canExport = allow(can, CAP.lossDamage.export);

  const [viewRaw, setView] = useState<View>("register");
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ListDatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [kind, setKind] = useState<"all" | IncidentKind>("all");
  const [branch, setBranch] = useState(ALL);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");

  const view: View = viewRaw === "reports" && !canReports ? "register" : viewRaw;
  const docs = docsOfType("write_off");
  const incidents = useMemo(() => buildIncidents(docs, stockMovements), [docs, stockMovements]);
  const branches = useMemo(() => [...new Set(incidents.map((i) => i.branch).filter((b) => b && b !== "—"))].sort(), [incidents]);

  // Everything except the status tab, so the tab counts reflect the other filters.
  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return incidents.filter((i) =>
      isInListDateRange(i.createdAt, preset, customFrom, customTo) &&
      (kind === "all" || i.kind === kind) &&
      (branch === ALL || i.branch === branch) &&
      (!q || `${i.id} ${i.itemName} ${i.itemId} ${i.model} ${i.reason} ${i.branch} ${i.reportedBy} ${i.responsible}`.toLowerCase().includes(q)));
  }, [incidents, preset, customFrom, customTo, kind, branch, query]);
  const rows = useMemo(() => scoped.filter((i) => matchesStatusFilter(i.status, status)), [scoped, status]);
  const kpi = useMemo(() => computeKpis(scoped), [scoped]);
  // Incidents THIS person can approve / verify / reject right now (drives the banner and the Actions column).
  const waiting = useMemo(() => actionableFor(incidents, can, myId), [incidents, can, myId]);
  const canAct = allow(can, [...CAP.lossDamage.verify, ...CAP.lossDamage.approve, ...CAP.lossDamage.reject]);
  const countOf = (f: StatusFilter) => scoped.filter((i) => matchesStatusFilter(i.status, f)).length;

  function onPreset(v: string) { setPreset(v as ListDatePreset); }

  async function doExport(format: "xlsx" | "csv") {
    const { headers, rows: body } = registerExport(rows, canViewCost, statusLabel);
    const name = `loss-damage-register-${new Date().toISOString().slice(0, 10)}`;
    if (format === "xlsx") await downloadXLSX(`${name}.xlsx`, headers, body, "Incidents");
    else downloadCSV(`${name}.csv`, toCSV(headers, body));
  }

  const columns: InvColumn<Incident>[] = [
    { key: "id", pct: 10, header: "Incident", render: (r) => (
      <div className="whitespace-nowrap pr-4">
        {r.legacy ? <span className="font-bold">{r.id}</span>
          : <Link href={`/inventory/loss-damage/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-bold text-[#4361EE] hover:underline">{r.id}</Link>}
        <p className="text-[11.5px] text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</p>
      </div>
    ) },
    { key: "item", pct: 22, header: "Model / Item", align: "center", render: (r) => {
      const known = r.model && r.model !== "Unspecified";
      return (
        <DeviceCard className="mx-auto max-w-[270px] py-1.5" wrap
          label={known ? r.model : r.itemName}
          hint={`${r.model} ${r.itemName}`}
          issue={known ? r.itemName : undefined}
          detail={r.itemId ? <span className="font-medium tracking-wide">{r.itemId}</span> : undefined}
          title={`${r.model} · ${r.itemName}${r.itemId ? ` · ${r.itemId}` : ""}`} />
      );
    } },
    { key: "kind", pct: 8, header: "Type", render: (r) => <KindPill kind={r.kind} /> },
    { key: "reason", pct: 12, header: "Reason", render: (r) => <span className="block truncate" title={r.reason}>{r.reason}</span> },
    { key: "branch", pct: 10, header: "Branch", render: (r) => <span className="block truncate text-muted-foreground" title={r.branch}>{r.branch}</span> },
    { key: "qty", pct: 4, header: "Qty", align: "right", render: (r) => <span className="font-semibold tabular-nums">{r.qty}</span> },
    { key: "value", pct: 8, header: "Value", align: "right", hidden: !canViewCost, render: (r) => <span className="font-semibold tabular-nums">{money(r.value, canViewCost)}</span> },
    { key: "by", pct: 11, header: "Reported by", render: (r) => (
      <div className="min-w-0">
        <p className="truncate" title={r.reportedBy}>{r.reportedBy}</p>
        {r.responsible && <p className="truncate text-[11.5px] text-muted-foreground" title={`Responsible: ${r.responsible}`}>Resp. {r.responsible}</p>}
      </div>
    ) },
    { key: "status", pct: 12, header: "Status", align: "center", render: (r) => <IncidentStatus status={r.status} /> },
    { key: "act", pct: 8, header: "Action", align: "center", hidden: !canAct, render: (r) => {
      const qa = quickActions(r, can, myId);
      if (qa.length === 0) return <span className="text-[12px] text-muted-foreground">{r.legacy ? "" : "—"}</span>;
      return (
        <div className="mx-auto inline-flex h-7 items-stretch overflow-hidden rounded-full bg-card shadow-sm ring-1 ring-inset ring-border" onClick={(e) => e.stopPropagation()}>
          {qa.map((a, i) => {
            const reject = a.tone === "danger";
            return (
              <button key={a.key} type="button" title={a.label} aria-label={`${a.label} ${r.id}`} onClick={() => setDecide({ inc: r, qa: a })}
                className={`grid w-7 place-items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset ${i > 0 ? "border-l border-border" : ""} ${reject
                  ? "bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white focus-visible:ring-rose-300"
                  : "bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white focus-visible:ring-emerald-300"}`}>
                {reject ? <X className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      );
    } },
  ];

  if (!allow(can, CAP.lossDamage.view)) return <NoPermission subtitle="Viewing Loss & Damage needs the Loss & Damage permission. Ask an administrator to turn it on for your role." />;

  return (
    <div className={view === "register" ? "rox-lock-root space-y-4" : "space-y-4"}>
      <InvPageHeader
        icon={ShieldAlert}
        title="Loss & Damage"
        subtitle="Report, verify and approve lost or damaged stock, then see where the money goes"
        actions={
          <>
            {canExport && <ExportMenu onExport={doExport} disabled={rows.length === 0} />}
            <Can permission={CAP.lossDamage.report}>
              <Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Report incident</Button>
            </Can>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InvKpi label="Needs a decision" value={kpi.needsAction} hint={kpi.needsAction ? "Waiting for a manager" : "Nothing waiting"} hintTone={kpi.needsAction ? "danger" : "success"} icon={Hourglass} tone="amber" />
        <InvKpi label="Quarantined" value={kpi.quarantined} hint="Repairable, not written off" icon={ShieldQuestion} tone="violet" />
        {canViewCost ? (
          <>
            <InvKpi label="Confirmed loss" value={formatINR(kpi.confirmedLoss)} hint="Missing stock, approved" icon={PackageX} tone="rose" />
            <InvKpi label="Confirmed damage" value={formatINR(kpi.confirmedDamage)} hint={kpi.atRisk > 0 ? `${formatINR(kpi.atRisk)} still pending` : "Unusable stock, approved"} icon={Wallet} tone="brand" />
          </>
        ) : (
          <>
            <InvKpi label="Units written off" value={kpi.confirmedUnits} hint="Approved incidents" icon={PackageX} tone="rose" />
            <InvKpi label="Total incidents" value={kpi.incidents} icon={BadgeCheck} tone="brand" />
          </>
        )}
      </div>

      {waiting.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12.5px] text-amber-900">
          <p className="flex min-w-0 items-center gap-2">
            <Hourglass className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span className="truncate"><b>{waiting.length}</b> waiting for your approval{canViewCost && waiting.some((w) => w.value > 0) ? ` · ${formatINR(waiting.reduce((s, w) => s + w.value, 0))}` : ""}</span>
          </p>
          {!(view === "register" && status === "needs_action") && (
            <button type="button" className="shrink-0 font-semibold text-amber-800 underline-offset-2 hover:underline"
              onClick={() => { setView("register"); setPreset("all"); setKind("all"); setBranch(ALL); setQuery(""); setStatus("needs_action"); }}>Review</button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ScrollHint framed className="min-w-0 flex-initial">
          <SegmentedTabs size="sm" value={preset} onChange={onPreset} className="border-0 bg-transparent p-0"
            options={STANDARD_DATE_STRIP.map((d) => ({ label: d.label, value: d.value }))} />
        </ScrollHint>
        <TableSearch value={query} onChange={setQuery} className="w-full sm:w-[320px]"
          placeholder="Search incidents by ID, model, item, SKU, reason, branch or employee…"
          animatedPrefix="Search by " animatedWords={["incident ID", "model", "item name", "SKU", "reason", "branch", "employee"]} />
      </div>
      <DateRangePicker open={preset === "custom"} from={customFrom} to={customTo} onFromChange={setCustomFrom} onToChange={setCustomTo} />

      <div className="flex flex-wrap items-center gap-3">
        {canReports && (
          <SegmentedTabs size="sm" value={view} onChange={(v) => setView(v as View)}
            options={[{ label: "Incident register", value: "register" }, { label: "Reports", value: "reports" }]} />
        )}
        <StatusTabs<"all" | IncidentKind> value={kind} onChange={setKind}
          options={[{ value: "all", label: "All types" }, { value: "loss", label: "Loss" }, { value: "damage", label: "Damage" }]} />
        <Select className="h-[34px] w-[180px]" value={branch} onChange={(e) => setBranch(e.target.value)}
          options={[{ label: "All branches", value: ALL }, ...branches.map((b) => ({ label: b, value: b }))]} />
        {view === "register" && (
          <ScrollHint framed className="min-w-0 flex-initial">
            <SegmentedTabs size="sm" value={status} onChange={(v) => setStatus(v as StatusFilter)} className="border-0 bg-transparent p-0"
              options={STATUS_FILTERS.map((s) => ({ value: s.value, label: `${s.label} (${countOf(s.value)})` }))} />
          </ScrollHint>
        )}
      </div>

      {view === "register" ? (
        <InvTable fill minWidth={1320} columns={columns} rows={rows} rowKey={(r) => r.id} itemLabel="incident"
          onRowClick={(r) => { if (!r.legacy) router.push(`/inventory/loss-damage/${r.id}`); }}
          resetKey={`${preset}|${customFrom}|${customTo}|${kind}|${branch}|${status}|${query}`}
          emptyTitle={ready ? "No incidents match" : "Loading…"}
          emptyHint={ready ? (incidents.length === 0 ? "Use “Report incident” when stock goes missing or is damaged." : "Try a wider date range or clear a filter.") : undefined} />
      ) : (
        <LossReports rows={scoped} canViewCost={canViewCost} canExport={canExport} />
      )}

      <ReportIncidentDialog open={open} onClose={() => setOpen(false)} />
      {decide?.inc.doc && <DecisionDialog doc={decide.inc.doc} action={decide.qa.action} chain={decide.qa.chain} onClose={() => setDecide(null)} />}
    </div>
  );
}
