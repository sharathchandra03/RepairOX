"use client";

/* Inventory → Part Grades & Variants: group SKUs that are the same part in
   different grades (OEM / Premium / OLED / Incell / Refurbished …), each with
   its own price and warranty. Stored on the item (grade, variant_group,
   warranty_months — migration 0119), so the Price List can show every grade
   through the SKU link. */

import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { TableSearch } from "@/components/common/table-utility-bar";
import { InvTable, type InvColumn } from "@/components/inventory/inv-table";
import { InvKpi, InvPageHeader, StatusTabs, useInventoryScope } from "@/components/inventory/inv-ui";
import { toast } from "@/components/ui/toaster";
import { useStore } from "@/lib/store";
import { availableStock, effectiveSellingPrice } from "@/lib/inventory-analytics";
import { formatINR } from "@/lib/utils";
import type { InventoryItem } from "@/lib/inventory-data";

const GRADES = ["OEM", "Premium", "OLED", "Hard OLED", "Soft OLED", "Incell", "Aftermarket", "Refurbished", "Used / Pulled"];
const field = "mt-1.5 h-[34px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15";

export default function PartGradesPage() {
  const { updateInventoryItem } = useStore();
  const { stockItems, canEdit } = useInventoryScope();
  const [tab, setTab] = useState<"all" | "grouped" | "ungrouped">("all");
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<InventoryItem | null>(null);
  const [grade, setGrade] = useState("");
  const [group, setGroup] = useState("");
  const [warranty, setWarranty] = useState("");
  const [saving, setSaving] = useState(false);

  const groups = useMemo(() => [...new Set(stockItems.map((i) => i.variantGroup).filter(Boolean) as string[])].sort(), [stockItems]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stockItems
      .filter((i) => (tab === "all" || (tab === "grouped" ? !!i.variantGroup : !i.variantGroup)) && (!q || `${i.name} ${i.id} ${i.grade ?? ""} ${i.variantGroup ?? ""}`.toLowerCase().includes(q)))
      .sort((a, b) => (a.variantGroup ?? "~").localeCompare(b.variantGroup ?? "~") || effectiveSellingPrice(b) - effectiveSellingPrice(a));
  }, [stockItems, tab, query]);

  function open(i: InventoryItem) { setEdit(i); setGrade(i.grade ?? ""); setGroup(i.variantGroup ?? ""); setWarranty(i.warrantyMonths != null ? String(i.warrantyMonths) : ""); }

  async function save() {
    if (!edit || saving) return;
    setSaving(true);
    await updateInventoryItem(edit.id, { grade: grade.trim() || undefined, variantGroup: group.trim() || undefined, warrantyMonths: warranty === "" ? undefined : Number(warranty) });
    setSaving(false);
    toast.success(`${edit.name} updated`);
    setEdit(null);
  }

  const columns: InvColumn<InventoryItem>[] = [
    { key: "group", header: "Variant group", render: (i) => <span className="block truncate font-semibold" title={i.variantGroup}>{i.variantGroup || <span className="font-normal text-muted-foreground">Not grouped</span>}</span> },
    { key: "grade", header: "Grade", render: (i) => i.grade ? <span className="inline-flex h-7 items-center rounded-full bg-violet-50 px-2.5 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">{i.grade}</span> : <span className="text-muted-foreground">—</span> },
    { key: "item", grow: true, header: "Item / SKU", render: (i) => <div className="min-w-0"><p className="truncate font-medium" title={i.name}>{i.name}</p><p className="truncate text-[11.5px] text-muted-foreground">{i.id}</p></div> },
    { key: "warranty", header: "Warranty", align: "right", render: (i) => <span className="tabular-nums">{i.warrantyMonths != null ? `${i.warrantyMonths} mo` : "—"}</span> },
    { key: "sell", header: "Selling price", align: "right", render: (i) => <span className="font-semibold tabular-nums">{formatINR(effectiveSellingPrice(i))}</span> },
    { key: "avail", header: "Available", align: "right", render: (i) => <span className="tabular-nums">{availableStock(i)}</span> },
    { key: "act", header: "", align: "right", render: (i) => canEdit ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); open(i); }}>Edit</Button> : null },
  ];

  const grouped = stockItems.filter((i) => i.variantGroup).length;

  return (
    <div className="rox-lock-root space-y-4">
      <InvPageHeader icon={Layers} title="Part Grades & Variants" subtitle="Same part, different grades: each SKU keeps its own price, stock and warranty" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InvKpi label="Variant groups" value={groups.length} icon={Layers} tone="violet" />
        <InvKpi label="SKUs in a group" value={grouped} icon={Layers} tone="brand" />
        <InvKpi label="Not grouped yet" value={stockItems.length - grouped} icon={Layers} tone="amber" />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusTabs value={tab} onChange={setTab} options={[{ value: "all", label: "All" }, { value: "grouped", label: "Grouped" }, { value: "ungrouped", label: "Not grouped" }]} />
        <TableSearch value={query} onChange={setQuery} placeholder="Search by item, SKU, grade or variant group…" animatedPrefix="Search by " animatedWords={["item name", "SKU", "grade", "variant group"]} className="w-full sm:w-64" />
      </div>
      <InvTable columns={columns} rows={rows} rowKey={(i) => i.id} resetKey={`${tab}|${query}`} itemLabel="item" onRowClick={canEdit ? open : undefined} emptyTitle="No items" />

      <RoxCenteredForm
        open={!!edit} onClose={() => setEdit(null)} title="Grade & variant" subtitle={edit?.name} icon={Layers}
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button></div>}
      >
        <div className="space-y-4">
          <div>
            <Label>Variant group</Label>
            <input list="variant-groups" className={field} value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. iPhone 16 Pro Max · Display" />
            <datalist id="variant-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Grade</Label>
              <input list="part-grades" className={field} value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="OEM, Premium…" />
              <datalist id="part-grades">{GRADES.map((g) => <option key={g} value={g} />)}</datalist>
            </div>
            <div><Label>Warranty (months)</Label><input type="number" min={0} className={field} value={warranty} onChange={(e) => setWarranty(e.target.value)} /></div>
          </div>
        </div>
      </RoxCenteredForm>
    </div>
  );
}
