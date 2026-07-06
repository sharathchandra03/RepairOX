"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, ChevronDown, RefreshCw, LayoutDashboard, Search, Package, Settings2,
  Upload, Download, Printer, Tags, Pencil, Copy, Eye, Trash2, X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { DataTable, type Column } from "@/components/inventory/data-table";
import { ItemHealthBadge } from "@/components/inventory/widgets";
import { Can } from "@/components/common/can";
import { usePermissions } from "@/lib/permissions-context";
import { cn, formatINR } from "@/lib/utils";
import {
  inventoryItems, itemHealth, STORES, type InventoryItem,
} from "@/lib/inventory-data";

type StatusFilter = "all" | "low" | "excess" | "negative" | "inactive";
const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "low", label: "Low Stock" },
  { value: "excess", label: "Excess Stock" },
  { value: "negative", label: "Negative Stock" },
  { value: "inactive", label: "Inactive Items" },
];

function matchesStatus(it: InventoryItem, status: StatusFilter) {
  if (status === "all") return true;
  if (status === "inactive") return !it.active;
  const h = itemHealth(it);
  if (status === "low") return h === "low" || h === "reorder";
  if (status === "excess") return h === "excess" || h === "high";
  if (status === "negative") return h === "negative";
  return true;
}

const money = (n: number) => formatINR(n);

function ItemMasterInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = usePermissions();
  const [mode, setMode] = useState<"all" | "Product" | "Service">("all");
  const [store, setStore] = useState(STORES[0]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // drill-down from dashboard: /inventory/item-master?status=low
  useEffect(() => {
    const s = params.get("status") as StatusFilter | null;
    if (s && STATUS_TABS.some((t) => t.value === s)) setStatus(s);
  }, [params]);

  const rows = useMemo(() => {
    return inventoryItems.filter((it) => {
      if (mode !== "all" && it.type !== mode) return false;
      if (store !== STORES[0] && it.store !== store) return false;
      if (!matchesStatus(it, status)) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        if (!`${it.name} ${it.id} ${it.category} ${it.hsnCode}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [mode, store, status, query]);

  function refresh() {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  }

  const columns: Column<InventoryItem>[] = [
    {
      key: "name",
      header: "Item",
      primary: true,
      accessor: (r) => `${r.name} ${r.id}`,
      hideable: false,
      minWidth: 240,
      render: (r) => (
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/50">
            <Package className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{r.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{r.id}</p>
          </div>
        </div>
      ),
    },
    { key: "category", header: "Item Category", accessor: (r) => r.category, render: (r) => <span className="text-[13px]">{r.category}</span>, minWidth: 150 },
    {
      key: "stock",
      header: "Current Stock",
      accessor: (r) => r.currentStock,
      align: "left",
      minWidth: 150,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className={cn("tnum font-semibold", r.currentStock < 0 && "text-rose-600")}>{r.currentStock}</span>
          {r.type === "Product" && <ItemHealthBadge item={r} />}
        </div>
      ),
    },
    { key: "defaultPrice", header: "Default Price", accessor: (r) => r.defaultPrice, align: "right", render: (r) => <span className="tnum">{money(r.defaultPrice)}</span> },
    { key: "regBuy", header: "Regular Buying", accessor: (r) => r.regularBuyingPrice, align: "right", render: (r) => <span className="tnum text-muted-foreground">{money(r.regularBuyingPrice)}</span> },
    { key: "wholeBuy", header: "Wholesale Buying", accessor: (r) => r.wholesaleBuyingPrice, align: "right", defaultHidden: true, render: (r) => <span className="tnum text-muted-foreground">{money(r.wholesaleBuyingPrice)}</span> },
    { key: "regSell", header: "Regular Selling", accessor: (r) => r.regularSellingPrice, align: "right", render: (r) => <span className="tnum">{money(r.regularSellingPrice)}</span> },
    { key: "mrp", header: "MRP", accessor: (r) => r.mrp, align: "right", render: (r) => <span className="tnum">{money(r.mrp)}</span> },
    { key: "dealer", header: "Dealer Price", accessor: (r) => r.dealerPrice, align: "right", defaultHidden: true, render: (r) => <span className="tnum text-muted-foreground">{money(r.dealerPrice)}</span> },
    { key: "distributor", header: "Distributor Price", accessor: (r) => r.distributorPrice, align: "right", defaultHidden: true, render: (r) => <span className="tnum text-muted-foreground">{money(r.distributorPrice)}</span> },
    {
      key: "type", header: "Type", accessor: (r) => r.type, render: (r) => (
        <Badge tone={r.type === "Service" ? "violet" : "info"}>{r.type}</Badge>
      ),
    },
    { key: "hsn", header: "HSN Code", accessor: (r) => r.hsnCode, render: (r) => <span className="font-mono text-[12px] text-muted-foreground">{r.hsnCode}</span> },
    { key: "tax", header: "Tax", accessor: (r) => r.tax, align: "right", render: (r) => <span className="tnum">{r.tax}%</span> },
    { key: "min", header: "Min Stock", accessor: (r) => r.minStock, align: "right", defaultHidden: true, render: (r) => <span className="tnum text-muted-foreground">{r.minStock}</span> },
    { key: "max", header: "Max Stock", accessor: (r) => r.maxStock, align: "right", defaultHidden: true, render: (r) => <span className="tnum text-muted-foreground">{r.maxStock}</span> },
  ];

  // Row/bulk actions are plain data (consumed by DataTable's menu renderer, not JSX),
  // so each entry is filtered out here based on the active role's permissions.
  const rowActions = (_r: InventoryItem) => [
    { label: "View details", icon: Eye, onClick: () => {} },
    ...(can("edit") ? [{ label: "Edit item", icon: Pencil, onClick: () => router.push("/inventory/add-item") }] : []),
    ...(can("create") ? [{ label: "Duplicate", icon: Copy, onClick: () => {} }] : []),
    ...(can("delete") ? [{ label: "Delete", icon: Trash2, danger: true, onClick: () => {} }] : []),
  ];

  const bulkActions = [
    ...(can("print_documents") ? [{ label: "Print labels", icon: Tags, onClick: () => {} }] : []),
    ...(can("export_reports") ? [{ label: "Export", icon: Download, onClick: () => {} }] : []),
    ...(can("delete") ? [{ label: "Delete", icon: Trash2, danger: true, onClick: () => {} }] : []),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventory Management"
        title="Item Master"
        subtitle="Central catalogue of every item, price tier and stock level."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh Analytics
            </Button>
            <Link href="/inventory">
              <Button variant="ghost" size="sm" className="gap-1.5 rounded-full">
                <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard
              </Button>
            </Link>
            <Can permission={["import_data", "export_reports", "print_documents", "edit"]}>
              <Dropdown
                width="w-52"
                trigger={({ toggle, open }) => (
                  <Button variant="secondary" size="sm" className="gap-1.5 rounded-full" onClick={toggle}>
                    <Settings2 className="h-3.5 w-3.5" /> Actions <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
                  </Button>
                )}
              >
                {(close) => (
                  <>
                    <MenuLabel>Bulk operations</MenuLabel>
                    <Can permission="import_data">
                      <MenuItem icon={Upload} onClick={close}>Import items</MenuItem>
                    </Can>
                    <Can permission="export_reports">
                      <MenuItem icon={Download} onClick={close}>Export catalogue</MenuItem>
                    </Can>
                    <Can permission="print_documents">
                      <MenuItem icon={Printer} onClick={close}>Print barcodes</MenuItem>
                    </Can>
                    <Can permission="edit">
                      <MenuItem icon={Tags} onClick={close}>Bulk price update</MenuItem>
                    </Can>
                  </>
                )}
              </Dropdown>
            </Can>
            <Can permission="create">
              <Link href="/inventory/add-item">
                <Button size="sm" className="gap-1.5 rounded-full">
                  <Plus className="h-3.5 w-3.5" /> Add Single Item
                </Button>
              </Link>
            </Can>
          </>
        }
      />

      {/* Status segmented tabs */}
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

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-card sm:flex-row sm:items-center sm:p-3.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, SKU, category or HSN…"
            className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-9 text-sm placeholder:text-muted-foreground focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200/50"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Type"
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
            options={[{ value: "all", label: "Product / Service" }, { value: "Product", label: "Products" }, { value: "Service", label: "Services" }]}
          />
          <FilterSelect
            label="Store"
            value={store}
            onChange={setStore}
            options={STORES.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        selectable
        pageSize={8}
        loading={refreshing}
        rowActions={rowActions}
        bulkActions={bulkActions}
        minTableWidth={1100}
        emptyTitle="No items found"
        emptyDescription="Try adjusting filters or search, or add a new item to the catalogue."
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <Dropdown
      width="w-52"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-3 text-[13px] font-medium transition",
            open ? "border-[#4361EE]" : "border-border hover:bg-muted"
          )}
        >
          <span className="text-muted-foreground">{label}:</span>
          <span className="max-w-[140px] truncate">{options.find((o) => o.value === value)?.label}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      )}
    >
      {(close) => (
        <>
          {options.map((o) => (
            <MenuItem
              key={o.value}
              onClick={() => { onChange(o.value); close(); }}
              className={cn(value === o.value && "bg-muted font-semibold")}
            >
              {o.label}
            </MenuItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />}>
      <ItemMasterInner />
    </Suspense>
  );
}
