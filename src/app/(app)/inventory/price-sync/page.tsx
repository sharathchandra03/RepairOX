"use client";

/* Inventory → Price List Link.

   ONE RULE: a Price List part whose Part Number equals an inventory SKU is
   LINKED, and the inventory Selling Price is the single source of truth for it.
   Change the selling price once in Inventory → the Price List (and everything
   Sales sees) follows. Cost never leaves Inventory.

   Live propagation is done by the DB (migration 0118: trigger on inventory_items
   → price_list_parts). This page is the control room: see what is linked, fix
   gaps, and run a one-click "Sync now" backfill. */

import { useMemo, useState } from "react";
import { BadgeDollarSign, Link2, Link2Off, RefreshCw, Scale, PackageSearch, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InventorySearchBox } from "@/components/inventory/inventory-search-box";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, InvPageHeader, StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { toast } from "@/components/ui/toaster";
import { useCatalog } from "@/lib/catalog-context";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { availableStock, buildSkuIndex, effectiveSellingPrice, findLinkedItem } from "@/lib/inventory-analytics";
import { cn, formatINR } from "@/lib/utils";
import type { DevicePart } from "@/lib/price-list-data";
import type { InventoryItem } from "@/lib/inventory-data";

type LinkState = "synced" | "diff" | "unlinked";
type Row = {
  part: DevicePart;
  model: string;
  brand: string;
  item?: InventoryItem;
  state: LinkState;
};

const STATE_STYLE: Record<LinkState, { label: string; cls: string; dot: string }> = {
  synced: { label: "Linked · In sync", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  diff: { label: "Price differs", cls: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  unlinked: { label: "Not linked", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200", dot: "bg-zinc-400" },
};

type Tab = "all" | LinkState;

export default function PriceSyncPage() {
  const { parts, models, brands, updatePart } = useCatalog();
  const { inventory, canEdit } = useInventoryScope();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [linkTarget, setLinkTarget] = useState<Row | null>(null);
  const [picked, setPicked] = useState<InventoryItem | null>(null);

  const index = useMemo(() => buildSkuIndex(inventory.filter((i) => (i.kind ?? "part") === "part")), [inventory]);
  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);

  const all = useMemo<Row[]>(
    () =>
      parts.map((part) => {
        const m = modelById.get(part.modelId);
        const item = findLinkedItem(index, part.partNumber);
        const sell = item ? effectiveSellingPrice(item) : 0;
        const state: LinkState = !item ? "unlinked" : sell > 0 && part.price !== sell ? "diff" : "synced";
        return { part, model: m?.name ?? "—", brand: brandById.get(m?.brandId ?? "")?.name ?? "", item, state };
      }),
    [parts, modelById, brandById, index]
  );

  const counts = useMemo(() => {
    const c = { all: all.length, synced: 0, diff: 0, unlinked: 0 };
    all.forEach((r) => { c[r.state]++; });
    return c;
  }, [all]);

  // Inventory SKUs that no price-list part points at (candidates to add to the Price List).
  const orphanSkus = useMemo(() => {
    const used = new Set<string>();
    all.forEach((r) => r.item && used.add(r.item.id));
    return inventory.filter((i) => (i.kind ?? "part") === "part" && i.active !== false && !used.has(i.id)).length;
  }, [all, inventory]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => (tab === "all" || r.state === tab) && (!q || `${r.part.partName} ${r.part.partNumber} ${r.model} ${r.brand}`.toLowerCase().includes(q)));
  }, [all, tab, query]);

  function applyLocally(r: Row) {
    if (!r.item) return;
    const sell = effectiveSellingPrice(r.item);
    if (sell > 0) updatePart(r.part.id, { price: sell, priceKnown: true, availability: availabilityOf(r.item) });
  }

  async function syncNow() {
    if (syncing) return;
    setSyncing(true);
    try {
      let done = false;
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.rpc("sync_price_list_from_inventory");
        if (!error) { toast.success(`Price List synced from Inventory (${Number(data ?? 0)} parts updated)`); done = true; }
      }
      if (!done) {
        // Demo / migration-not-applied fallback: update the linked parts directly.
        const diffs = all.filter((r) => r.state === "diff");
        diffs.forEach(applyLocally);
        toast.success(`${diffs.length} price${diffs.length === 1 ? "" : "s"} synced from Inventory`);
      }
    } finally {
      setSyncing(false);
    }
  }

  function confirmLink() {
    if (!linkTarget || !picked) return;
    const sell = effectiveSellingPrice(picked);
    updatePart(linkTarget.part.id, {
      partNumber: picked.id,
      ...(sell > 0 ? { price: sell, priceKnown: true } : {}),
      availability: availabilityOf(picked),
    });
    toast.success(`${linkTarget.part.partName} linked to ${picked.id}`);
    setLinkTarget(null);
    setPicked(null);
  }

  const columns: InvColumn<Row>[] = [
    {
      key: "part", grow: true, header: "Price List Part", render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold" title={r.part.partName}>{r.part.partName}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">{[r.brand, r.model].filter(Boolean).join(" · ")}</p>
        </div>
      ),
    },
    { key: "sku", header: "SKU / Part No.", render: (r) => <span className="block truncate font-mono text-[12.5px]" title={r.part.partNumber}>{r.part.partNumber || "—"}</span> },
    { key: "pl", header: "Price List Price", align: "right", render: (r) => <span className="font-semibold tabular-nums">{r.part.priceKnown === false ? "N/A" : formatINR(r.part.price)}</span> },
    {
      key: "inv", header: "Inventory Selling", align: "right",
      render: (r) => r.item ? <span className={cn("font-semibold tabular-nums", r.state === "diff" && "text-amber-600")}>{formatINR(effectiveSellingPrice(r.item))}</span> : <span className="text-muted-foreground">—</span>,
    },
    { key: "stock", header: "Available", align: "right", render: (r) => r.item ? <span className="tabular-nums">{availableStock(r.item)}</span> : <span className="text-muted-foreground">—</span> },
    {
      key: "state", min: 150, header: "Link Status", render: (r) => {
        const s = STATE_STYLE[r.state];
        return (
          <span className={cn("flex h-7 w-full min-w-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", s.cls)}>
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} />
            <span className="truncate">{s.label}</span>
          </span>
        );
      },
    },
    {
      key: "action", header: "Action", align: "right",
      render: (r) => !canEdit ? <span className="text-muted-foreground">—</span> : r.state === "diff"
        ? <Button size="sm" variant="outline" onClick={() => applyLocally(r)}>Sync price</Button>
        : r.state === "unlinked"
          ? <Button size="sm" variant="outline" onClick={() => { setLinkTarget(r); setPicked(null); }}>Link SKU</Button>
          : <span className="text-[12px] text-muted-foreground">Up to date</span>,
    },
  ];

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader
        icon={BadgeDollarSign}
        title="Price List Link"
        subtitle="SKU connects the Price List to the Inventory master. Sales sees the selling price only."
        actions={canEdit ? <Button className="gap-2" onClick={syncNow} disabled={syncing}><RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />Sync now</Button> : undefined}
      />

      {/* How it works */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 shadow-card md:grid-cols-3">
        {[
          { n: 1, t: "Use the SKU as the part number", d: "In the Price List, set a part's Part Number to the inventory SKU (or item code / barcode)." },
          { n: 2, t: "Set the selling price once", d: "Edit Selling Price on the inventory item. It is the only price for that SKU." },
          { n: 3, t: "Everyone sees it instantly", d: "The Price List, quotations and sales screens show the new price and live availability. Cost stays hidden." },
        ].map((s) => (
          <div key={s.n} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#EEF1FD] text-[12px] font-bold text-[#4361EE]">{s.n}</span>
            <div><p className="text-[13px] font-semibold">{s.t}</p><p className="text-[12px] text-muted-foreground">{s.d}</p></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <InvKpi label="Linked & in sync" value={counts.synced} icon={Link2} tone="emerald" />
        <InvKpi label="Price differs" value={counts.diff} icon={Scale} tone="amber" hint={counts.diff ? "Run Sync now" : "All prices match"} hintTone={counts.diff ? "danger" : "success"} />
        <InvKpi label="Price List parts not linked" value={counts.unlinked} icon={Link2Off} tone="rose" hint="No matching inventory SKU" />
        <InvKpi label="Inventory SKUs not in Price List" value={orphanSkus} icon={PackageSearch} tone="sky" hint="No part uses this SKU yet" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: `All (${counts.all})` },
            { value: "synced", label: `In sync (${counts.synced})` },
            { value: "diff", label: `Differs (${counts.diff})` },
            { value: "unlinked", label: `Not linked (${counts.unlinked})` },
          ]}
        />
        <TableSearch
          value={query}
          onChange={setQuery}
          placeholder="Search price list parts by name, SKU, brand or model…"
          animatedPrefix="Search by "
          animatedWords={["part name", "SKU", "brand", "model"]}
          className="w-full sm:w-64"
        />
      </div>

      <InvTable columns={columns} rows={rows} rowKey={(r) => String(r.part.id)} resetKey={`${tab}|${query}`} emptyTitle="No parts to show" emptyHint="Add parts to the Price List (Settings → Device Catalog) to link them here." itemLabel="part" />

      <RoxCenteredForm
        open={!!linkTarget}
        onClose={() => { setLinkTarget(null); setPicked(null); }}
        title="Link to inventory SKU"
        subtitle={linkTarget ? `${linkTarget.part.partName} · ${linkTarget.model}` : undefined}
        icon={Link2}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setLinkTarget(null); setPicked(null); }}>Cancel</Button>
            <Button onClick={confirmLink} disabled={!picked}>Link & use inventory price</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Label>Inventory item</Label>
          {picked ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-input px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Package className="h-4 w-4 shrink-0 text-[#4361EE]" />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold">{picked.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">{picked.id} · Selling {formatINR(effectiveSellingPrice(picked))} · Available {availableStock(picked)}</p>
                </div>
              </div>
              <button onClick={() => setPicked(null)} className="text-[12px] font-semibold text-[#4361EE] hover:underline">Change</button>
            </div>
          ) : (
            <InventorySearchBox kind="part" onSelect={setPicked} placeholder="Search the matching inventory part by name, SKU or category…" />
          )}
          <p className="text-[12px] text-muted-foreground">The part number becomes the SKU and the price list price follows the inventory selling price from now on.</p>
        </div>
      </RoxCenteredForm>
    </div>
  );
}

function availabilityOf(it: InventoryItem): DevicePart["availability"] {
  const a = availableStock(it);
  return a <= 0 ? "Out of Stock" : it.minStock > 0 && a <= it.minStock ? "Limited" : "In Stock";
}
