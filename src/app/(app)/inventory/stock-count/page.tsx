"use client";
/* Inventory → Stock Audit.
   Sessions of physical counting. An audit is a `stock_count` inventory document: counters enter
   quantities (optionally blind), a reviewer approves, and ONLY approval corrects stock.
   Detail lives on /inventory/stock-count/[id]. Workflow + keys: lib/stock-audit.ts, migration 0128. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardCheck, Hourglass, Plus, ScanLine, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollHint } from "@/components/common/scroll-hint";
import { SegmentedTabs } from "@/components/ui/tabs";
import { TableSearch } from "@/components/common/table-utility-bar";
import { NoPermission } from "@/components/common/no-permission";
import { AuditCreateDialog } from "@/components/inventory/stock-audit/audit-create-dialog";
import { AuditReports } from "@/components/inventory/stock-audit/audit-reports";
import { ToneChip, fmtDate } from "@/components/inventory/doc-ui";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, InvPageHeader, StatusTabs } from "@/components/inventory/inv-ui";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { DOC_META, type InvDoc } from "@/lib/inventory-ops";
import { AUDIT_KIND_LABEL, accuracyByAudit, auditMeta, canApproveAudit, summarize } from "@/lib/stock-audit";

type View = "audits" | "reports";
const meta = DOC_META.stock_count;
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

export default function StockAuditPage() {
  const router = useRouter();
  const { can, currentUser } = usePermissions();
  const { docsOfType, ready } = useInventoryOps();
  const [viewRaw, setView] = useState<View>("audits");
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const canView = allow(can, CAP.stockAudit.view);
  const canReports = allow(can, CAP.stockAudit.reports);
  const canCreate = allow(can, CAP.stockAudit.create);
  const view: View = viewRaw === "reports" && !canReports ? "audits" : viewRaw;
  const all = docsOfType("stock_count");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((d) => (tab === "all" || d.status === tab) && (!q || `${d.id} ${d.party} ${d.createdBy} ${d.lines.map((l) => l.name).join(" ")}`.toLowerCase().includes(q)));
  }, [all, tab, query]);
  const waiting = useMemo(() => all.filter((d) => canApproveAudit(d, can, currentUser?.id).ok), [all, can, currentUser?.id]);
  const latest = accuracyByAudit(all)[0];
  const counting = all.filter((d) => d.status === "draft").length;
  const submitted = all.filter((d) => d.status === "submitted").length;
  const approved = all.filter((d) => d.status === "approved").length;

  if (!canView) return <NoPermission title="You don't have access to Stock Audit" />;

  const columns: InvColumn<InvDoc>[] = [
    { key: "id", pct: 10, header: "Audit", render: (d) => (
      <div className="whitespace-nowrap pr-3">
        <Link href={`/inventory/stock-count/${d.id}`} onClick={(e) => e.stopPropagation()} className="font-bold text-[#4361EE] hover:underline">{d.id}</Link>
        <p className="text-[11.5px] text-muted-foreground">{fmtDate(d.createdAt)}</p>
      </div>
    ) },
    { key: "scope", pct: 20, header: "Scope", render: (d) => {
      const m = auditMeta(d);
      return <div className="min-w-0"><p className="truncate font-medium" title={m.scope}>{m.scope || "—"}</p><p className="truncate text-[11.5px] text-muted-foreground">{AUDIT_KIND_LABEL[m.kind]}{m.blind ? " · Blind" : ""}</p></div>;
    } },
    { key: "progress", pct: 19, header: "Counted", render: (d) => {
      const s = summarize(d.lines);
      const p = s.total ? Math.round((s.counted / s.total) * 100) : 0;
      return (
        <div className="max-w-[170px]" title={`${s.counted} of ${s.total} items counted`}>
          <div className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className={`block h-full rounded-full ${p >= 100 ? "bg-emerald-500" : "bg-[#4361EE]"}`} style={{ width: `${p}%` }} /></span><span className="w-9 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">{p}%</span></div>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">{s.counted} of {s.total} items</p>
        </div>
      );
    } },
    { key: "diff", pct: 13, header: "Differences", align: "right", render: (d) => {
      const s = summarize(d.lines);
      if (s.counted === 0) return <span className="text-muted-foreground">—</span>;
      return <div className="text-[12.5px] tabular-nums"><span className="font-semibold text-rose-600">{s.short ? `−${s.shortUnits}` : "0"}</span><span className="px-1 text-muted-foreground">/</span><span className="font-semibold text-sky-700">{s.excess ? `+${s.excessUnits}` : "0"}</span>{s.high && <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 ring-1 ring-inset ring-amber-200">High</span>}</div>;
    } },
    { key: "acc", pct: 9, header: "Accuracy", align: "right", render: (d) => <span className="font-bold tabular-nums">{pct(summarize(d.lines).accuracy)}</span> },
    { key: "by", pct: 12, header: "Started by", render: (d) => <span className="block truncate text-muted-foreground">{d.createdBy || "—"}</span> },
    { key: "status", pct: 17, header: "Status", align: "center", render: (d) => { const s = meta.statuses[d.status]; return <ToneChip tone={s?.tone ?? "neutral"} label={(s?.label ?? d.status).split(" ·")[0]} />; } },
  ];

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={ClipboardCheck}
        title="Stock Audit"
        subtitle="Count physical stock, review the differences, then correct the system"
        actions={canCreate ? <Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Start audit</Button> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InvKpi label="Counting now" value={counting} icon={ScanLine} tone="amber" hint="Audits being counted" />
        <InvKpi label="Awaiting approval" value={submitted} icon={Hourglass} tone={submitted ? "brand" : "emerald"} hint={waiting.length ? `${waiting.length} waiting for you` : "Nothing waiting for you"} />
        <InvKpi label="Approved audits" value={approved} icon={CheckCircle2} tone="emerald" hint="Stock corrected" />
        <InvKpi label="Last audit accuracy" value={pct(latest?.accuracy ?? null)} icon={Target} tone="violet" hint={latest ? `${latest.id} · ${latest.matched} of ${latest.counted} matched` : "No approved audit yet"} />
      </div>

      {/* ONE control row: view switch · status filters · waiting chip · search */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          {canReports && <StatusTabs<View> value={view} onChange={setView} options={[{ value: "audits", label: "Audits" }, { value: "reports", label: "Reports" }]} />}
          {view === "audits" && (
            <ScrollHint framed className="min-w-0 flex-initial">
              <SegmentedTabs size="sm" value={tab} onChange={setTab} className="border-0 bg-transparent p-0"
                options={[{ value: "all", label: `All (${all.length})` }, ...Object.entries(meta.statuses).map(([k, s]) => ({ value: k, label: `${s.label.split(" ·")[0]} (${all.filter((d) => d.status === k).length})` }))]} />
            </ScrollHint>
          )}
          {view === "audits" && waiting.length > 0 && (
            <button type="button" onClick={() => setTab("submitted")} title="Show the audits waiting for your approval"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[#4361EE]/40 bg-[#EEF1FD] px-3.5 text-[12.5px] font-semibold text-[#4361EE] transition hover:bg-[#E3E8FC]">
              <Hourglass className="h-3.5 w-3.5" />{waiting.length} waiting for your approval
            </button>
          )}
        </div>
        {view === "audits" && (
          <TableSearch
            value={query}
            onChange={setQuery}
            placeholder="Search audits by number, scope, starter or item…"
            animatedPrefix="Search by "
            animatedWords={["audit number", "scope", "started by", "item name"]}
            className="w-full xl:w-80"
          />
        )}
      </div>

      {view === "reports" ? <AuditReports /> : (
        <InvTable
          fill
          columns={columns}
          rows={rows}
          rowKey={(d) => d.id}
          onRowClick={(d) => router.push(`/inventory/stock-count/${d.id}`)}
          resetKey={`${tab}|${query}`}
          emptyTitle={ready ? "No stock audits yet" : "Loading…"}
          emptyHint={ready ? (canCreate ? "Use “Start audit” to count your stock." : undefined) : undefined}
          itemLabel="audit"
        />
      )}
      <AuditCreateDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
