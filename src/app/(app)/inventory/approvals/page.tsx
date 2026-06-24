"use client";

import { useMemo, useState } from "react";
import { RefreshCw, BadgeCheck, Check, X, Eye, ScanLine, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { DataTable, type Column } from "@/components/inventory/data-table";
import { cn, formatINR } from "@/lib/utils";
import {
  approvals as seedApprovals, APPROVAL_STATUS_LABEL, APPROVAL_STATUS_TONE,
  type Approval, type ApprovalStatus,
} from "@/lib/inventory-data";

const STATUS_TABS: { value: "all" | ApprovalStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function StatusBadge({ status }: { status: ApprovalStatus }) {
  return <Badge tone={APPROVAL_STATUS_TONE[status]} dot={status === "pending"}>{APPROVAL_STATUS_LABEL[status]}</Badge>;
}

export default function ApprovalsPage() {
  const [rows, setRows] = useState<Approval[]>(seedApprovals);
  const [status, setStatus] = useState<"all" | ApprovalStatus>("all");
  const [active, setActive] = useState<Approval | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  }), [rows]);

  const filtered = useMemo(
    () => (status === "all" ? rows : rows.filter((r) => r.status === status)),
    [rows, status]
  );

  function decide(id: string, next: ApprovalStatus) {
    setRows((arr) => arr.map((r) => (r.id === id ? { ...r, status: next, actionBy: "Shop Owner", actionDate: "Today" } : r)));
    setActive((a) => (a && a.id === id ? { ...a, status: next, actionBy: "Shop Owner", actionDate: "Today" } : a));
  }

  function refresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }

  const columns: Column<Approval>[] = [
    { key: "id", header: "Approval ID", primary: true, hideable: false, accessor: (r) => r.id, render: (r) => <span className="font-semibold">{r.id}</span> },
    { key: "docType", header: "Document Type", accessor: (r) => r.docType, render: (r) => <Badge tone="neutral">{r.docType}</Badge> },
    { key: "docNumber", header: "Document Number", accessor: (r) => r.docNumber, render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{r.docNumber}</span> },
    { key: "action", header: "Action", accessor: (r) => r.action, render: (r) => (
      <Badge tone={r.action === "Delete" ? "danger" : r.action === "Update" ? "warning" : "info"}>{r.action}</Badge>
    ) },
    { key: "status", header: "Status", accessor: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    { key: "createdBy", header: "Created By", accessor: (r) => r.createdBy },
    { key: "actionBy", header: "Action By", accessor: (r) => r.actionBy, render: (r) => <span className={cn(r.actionBy === "—" && "text-muted-foreground")}>{r.actionBy}</span> },
    { key: "actionDate", header: "Action Date", accessor: (r) => r.actionDate, render: (r) => <span className="text-muted-foreground">{r.actionDate}</span> },
    { key: "barcode", header: "Barcode", accessor: (r) => (r.barcodeAdded ? "Added" : "No"), render: (r) => (
      r.barcodeAdded
        ? <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700"><ScanLine className="h-3.5 w-3.5" /> Added</span>
        : <span className="text-[12px] text-muted-foreground">—</span>
    ) },
    { key: "amount", header: "Amount", accessor: (r) => r.amount, align: "right", defaultHidden: true, render: (r) => <span className="tnum">{formatINR(r.amount)}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventory Management"
        title="Inventory Approvals"
        subtitle="Review and action document approvals across the inventory workflow."
        actions={
          <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {/* Status filter tabs with counts */}
      <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1">
          {STATUS_TABS.map((t) => {
            const count = t.value === "all" ? rows.length : counts[t.value];
            return (
              <button
                key={t.value}
                onClick={() => setStatus(t.value)}
                className={cn(
                  "relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                  status === t.value ? "bg-[#4361EE] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold tnum", status === t.value ? "bg-white/20" : "bg-card")}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        pageSize={8}
        loading={refreshing}
        onRowClick={(r) => setActive(r)}
        minTableWidth={1000}
        rowActions={(r) => [
          { label: "View details", icon: Eye, onClick: () => setActive(r) },
          ...(r.status === "pending"
            ? [
                { label: "Approve", icon: Check, onClick: () => decide(r.id, "approved") },
                { label: "Reject", icon: X, danger: true, onClick: () => decide(r.id, "rejected") },
              ]
            : []),
        ]}
        emptyTitle="No approvals here"
        emptyDescription="Nothing matches this status filter right now."
      />

      {/* Detail drawer */}
      <Drawer
        open={!!active}
        onClose={() => setActive(null)}
        icon={BadgeCheck}
        title={active?.id ?? ""}
        subtitle={active ? `${active.docType} · ${active.docNumber}` : ""}
        footer={
          active?.status === "pending" ? (
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-1.5" onClick={() => active && decide(active.id, "rejected")}>
                <X className="h-4 w-4 text-rose-500" /> Reject
              </Button>
              <Button className="flex-1 gap-1.5" onClick={() => active && decide(active.id, "approved")}>
                <Check className="h-4 w-4" /> Approve
              </Button>
            </div>
          ) : (
            <p className="text-center text-[12px] text-muted-foreground">
              {active && `${APPROVAL_STATUS_LABEL[active.status]} by ${active.actionBy} · ${active.actionDate}`}
            </p>
          )
        }
      >
        {active && (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-card text-[#4361EE] ring-1 ring-inset ring-border">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold">{active.items} item{active.items > 1 ? "s" : ""}</p>
                  <p className="text-[12px] text-muted-foreground">{formatINR(active.amount)} total value</p>
                </div>
              </div>
              <StatusBadge status={active.status} />
            </div>

            <div className="divide-y divide-border">
              <DetailRow label="Document Type">{active.docType}</DetailRow>
              <DetailRow label="Document Number"><span className="font-mono">{active.docNumber}</span></DetailRow>
              <DetailRow label="Document Action"><Badge tone={active.action === "Delete" ? "danger" : active.action === "Update" ? "warning" : "info"}>{active.action}</Badge></DetailRow>
              <DetailRow label="Created By">{active.createdBy}</DetailRow>
              <DetailRow label="Action By"><span className={cn(active.actionBy === "—" && "text-muted-foreground")}>{active.actionBy}</span></DetailRow>
              <DetailRow label="Action Date"><span className="text-muted-foreground">{active.actionDate}</span></DetailRow>
              <DetailRow label="Barcode Added">
                {active.barcodeAdded
                  ? <span className="inline-flex items-center gap-1 text-emerald-700"><ScanLine className="h-3.5 w-3.5" /> Yes</span>
                  : <span className="text-muted-foreground">No</span>}
              </DetailRow>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
