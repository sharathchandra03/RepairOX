"use client";

import { useMemo, useState } from "react";
import {
  RefreshCw, ScanBarcode, Printer, Eye, Store, ArrowRight, Package, Calendar,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { DataTable, type Column } from "@/components/inventory/data-table";
import { cn } from "@/lib/utils";
import {
  barcodes, BARCODE_STATUS_LABEL, BARCODE_STATUS_TONE,
  type BarcodeRow, type BarcodeStatus,
} from "@/lib/inventory-data";

const STATUS_TABS: { value: "all" | BarcodeStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "consumed", label: "Consumed" },
  { value: "expired", label: "Expired" },
  { value: "returned", label: "Returned" },
];

function StatusBadge({ status }: { status: BarcodeStatus }) {
  return <Badge tone={BARCODE_STATUS_TONE[status]} dot={status === "active"}>{BARCODE_STATUS_LABEL[status]}</Badge>;
}

/* Decorative barcode rendered from the item id (deterministic bar widths). */
function BarcodeGlyph({ value }: { value: string }) {
  const bars = Array.from({ length: 48 }).map((_, i) => {
    const code = value.charCodeAt(i % value.length) + i;
    return (code % 3) + 1; // 1..3 px-ish weight
  });
  return (
    <div className="flex h-16 items-end gap-[2px] overflow-hidden rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-border">
      {bars.map((w, i) => (
        <span key={i} className="bg-zinc-900" style={{ width: w, height: i % 5 === 0 ? "100%" : "85%" }} />
      ))}
    </div>
  );
}

export default function BarcodePage() {
  const [status, setStatus] = useState<"all" | BarcodeStatus>("all");
  const [active, setActive] = useState<BarcodeRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = useMemo(
    () => (status === "all" ? barcodes : barcodes.filter((b) => b.status === status)),
    [status]
  );

  function refresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  }

  const columns: Column<BarcodeRow>[] = [
    { key: "itemId", header: "Item ID", accessor: (r) => r.itemId, hideable: false, render: (r) => <span className="font-mono text-[12px]">{r.itemId}</span> },
    { key: "itemName", header: "Item Name", primary: true, accessor: (r) => r.itemName, hideable: false, minWidth: 200, render: (r) => <span className="font-semibold">{r.itemName}</span> },
    { key: "qtyOut", header: "Quantity Out", accessor: (r) => r.qtyOut, align: "right", render: (r) => <span className="tnum">{r.qtyOut}</span> },
    { key: "balance", header: "Balance Quantity", accessor: (r) => r.balanceQty, align: "right", render: (r) => <span className="tnum font-semibold">{r.balanceQty}</span> },
    { key: "return", header: "Return Quantity", accessor: (r) => r.returnQty, align: "right", render: (r) => <span className={cn("tnum", r.returnQty > 0 ? "text-amber-700" : "text-muted-foreground")}>{r.returnQty}</span> },
    { key: "status", header: "Status", accessor: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
    { key: "fromStore", header: "From Store", accessor: (r) => r.fromStore, render: (r) => <span className="text-[13px]">{r.fromStore}</span> },
    { key: "toStore", header: "To Store", accessor: (r) => r.toStore, render: (r) => <span className="text-[13px]">{r.toStore}</span> },
    { key: "createdBy", header: "Created By", accessor: (r) => r.createdBy, defaultHidden: true },
    { key: "creationDate", header: "Creation Date", accessor: (r) => r.creationDate, defaultHidden: true, render: (r) => <span className="text-muted-foreground">{r.creationDate}</span> },
    { key: "mfg", header: "Manufacturing Date", accessor: (r) => r.mfgDate, defaultHidden: true, render: (r) => <span className="text-muted-foreground">{r.mfgDate}</span> },
    { key: "expiry", header: "Expiry Date", accessor: (r) => r.expiryDate, defaultHidden: true, render: (r) => <span className="text-muted-foreground">{r.expiryDate}</span> },
    { key: "info1", header: "Info 1", accessor: (r) => r.info1, defaultHidden: true },
    { key: "info2", header: "Info 2", accessor: (r) => r.info2, defaultHidden: true },
    { key: "lastModBy", header: "Last Modified By", accessor: (r) => r.lastModifiedBy, defaultHidden: true },
    { key: "lastModDate", header: "Last Modified Date", accessor: (r) => r.lastModifiedDate, defaultHidden: true, render: (r) => <span className="text-muted-foreground">{r.lastModifiedDate}</span> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventory Management"
        title="Barcode"
        subtitle="Manage barcode batches, balances and traceability."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh
            </Button>
            <Button size="sm" className="gap-1.5 rounded-full">
              <Printer className="h-3.5 w-3.5" /> Print Barcodes
            </Button>
          </>
        }
      />

      {/* Item status filter */}
      <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setStatus(t.value)}
              className={cn(
                "relative shrink-0 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                status === t.value ? "bg-[#4361EE] text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => `${r.itemId}-${r.creationDate}`}
        pageSize={8}
        loading={refreshing}
        onRowClick={(r) => setActive(r)}
        minTableWidth={1100}
        rowActions={(r) => [
          { label: "View details", icon: Eye, onClick: () => setActive(r) },
          { label: "Print label", icon: Printer, onClick: () => {} },
        ]}
        emptyTitle="No barcodes found"
        emptyDescription="No barcode records match this status filter."
      />

      <Drawer
        open={!!active}
        onClose={() => setActive(null)}
        icon={ScanBarcode}
        title={active?.itemName ?? ""}
        subtitle={active?.itemId}
        footer={<Button className="w-full gap-1.5"><Printer className="h-4 w-4" /> Print this label</Button>}
      >
        {active && (
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <BarcodeGlyph value={active.itemId} />
              <p className="mt-2 text-center font-mono text-[12px] tracking-[0.3em] text-muted-foreground">{active.itemId}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Stat label="Qty Out" value={active.qtyOut} />
              <Stat label="Balance" value={active.balanceQty} accent />
              <Stat label="Returned" value={active.returnQty} />
            </div>

            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-3.5">
              <div className="min-w-0 flex-1 text-center">
                <Store className="mx-auto h-4 w-4 text-muted-foreground" />
                <p className="mt-1 truncate text-[12px] font-medium">{active.fromStore}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-[#4361EE]" />
              <div className="min-w-0 flex-1 text-center">
                <Store className="mx-auto h-4 w-4 text-muted-foreground" />
                <p className="mt-1 truncate text-[12px] font-medium">{active.toStore}</p>
              </div>
            </div>

            <div className="divide-y divide-border">
              <DetailRow label="Status"><StatusBadge status={active.status} /></DetailRow>
              <DetailRow label="Created By">{active.createdBy}</DetailRow>
              <DetailRow label="Creation Date"><span className="text-muted-foreground">{active.creationDate}</span></DetailRow>
              <DetailRow label="Manufacturing Date"><span className="inline-flex items-center gap-1 text-muted-foreground"><Calendar className="h-3 w-3" />{active.mfgDate}</span></DetailRow>
              <DetailRow label="Expiry Date"><span className="inline-flex items-center gap-1 text-muted-foreground"><Calendar className="h-3 w-3" />{active.expiryDate}</span></DetailRow>
              <DetailRow label="Info 1">{active.info1}</DetailRow>
              <DetailRow label="Info 2">{active.info2}</DetailRow>
              <DetailRow label="Last Modified By">{active.lastModifiedBy}</DetailRow>
              <DetailRow label="Last Modified Date"><span className="text-muted-foreground">{active.lastModifiedDate}</span></DetailRow>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3 text-center", accent ? "border-[#B3BFF6]/60 bg-[#EEF1FD]/60" : "border-border bg-card")}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-display mt-0.5 text-xl font-extrabold tnum", accent && "text-[#3347D6]")}>{value}</p>
    </div>
  );
}
