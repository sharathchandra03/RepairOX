"use client";

/* Inventory → Bulk Import / Export.

   Export: Excel (primary) + CSV of current stock (cost columns only for users
   with CAP.sensitive.viewCost).
   Import: Excel/CSV upload → validated preview → create new SKUs (with opening
   stock) or update existing SKUs (prices / min / max / vendor / barcode).
   Stock quantities of EXISTING SKUs are never changed by an import — stock only
   moves through purchases, sales, returns, transfers and write-offs.
   Template is Excel-only (spreadsheet standard). */

import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, FileUp, Upload, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/common/can";
import { toast } from "@/components/ui/toaster";
import { ExportMenu } from "@/components/inventory/export-menu";
import { InvPageHeader, Panel, useInventoryScope } from "@/components/inventory/inv-ui";
import { buildInventoryItem, emptyInventoryForm, validateInventoryForm } from "@/components/inventory/inventory-item-form";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { downloadXLSX, parseCSV, readSpreadsheetFileToCSV, SPREADSHEET_ACCEPT } from "@/lib/csv-utils";
import { exportStock } from "@/lib/inventory-export";
import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/lib/inventory-data";

const HEADERS = [
  "SKU", "Item Name", "Category", "Brand / Model", "Vendor", "Unit", "Selling Price", "MRP", "Cost Price",
  "HSN", "GST %", "Min Stock", "Max Stock", "Opening Qty", "Opening Unit Cost", "Barcode", "Location",
] as const;
type H = (typeof HEADERS)[number];

const EXAMPLES: (string | number)[][] = [
  ["IP15-DSP-OEM", "iPhone 15 Display (OEM)", "Display Modules", "Apple / iPhone 15", "Mobile Parts Co", "Piece", 18900, 21000, 14500, "85177090", 18, 3, 12, 6, 14500, "", "Main Store"],
  ["IP15-BAT-01", "iPhone 15 Battery", "Batteries", "Apple / iPhone 15", "Mobile Parts Co", "Piece", 2900, 3500, 1700, "85076000", 18, 5, 20, 10, 1700, "", "Main Store"],
];

type PlanRow =
  | { line: number; action: "create"; name: string; sku: string; build: ReturnType<typeof buildInventoryItem> }
  | { line: number; action: "update"; name: string; sku: string; id: string; patch: Partial<InventoryItem> }
  | { line: number; action: "skip"; name: string; sku: string; error: string };

export default function ImportExportPage() {
  const { addInventoryItem, updateInventoryItem } = useStore();
  const { can } = usePermissions();
  const { inventory, stockItems, canViewCost } = useInventoryScope();
  const canEditCost = allow(can, CAP.sensitive.editCost);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [parseError, setParseError] = useState("");
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(inventory.map((i) => [i.id.toLowerCase(), i])), [inventory]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setParseError(""); setPlan(null); setFileName(f.name);
    try {
      const matrix = parseCSV(await readSpreadsheetFileToCSV(f));
      const headIdx = matrix.findIndex((r) => r.some((c) => c.trim().toLowerCase() === "item name"));
      if (headIdx < 0) { setParseError("Couldn't find the header row. Use the Excel template (it has an “Item Name” column)."); return; }
      const head = matrix[headIdx].map((c) => c.trim().toLowerCase());
      const col = (h: H) => head.indexOf(h.toLowerCase());
      const out: PlanRow[] = [];
      matrix.slice(headIdx + 1).forEach((r, i) => {
        if (r.every((c) => !c.trim())) return;
        const get = (h: H) => (col(h) >= 0 ? (r[col(h)] ?? "").trim() : "");
        const line = headIdx + i + 2;
        const sku = get("SKU"), name = get("Item Name");
        const existing = sku ? byId.get(sku.toLowerCase()) : undefined;
        const nums: [H, string][] = [["Selling Price", get("Selling Price")], ["MRP", get("MRP")], ["Cost Price", get("Cost Price")], ["Min Stock", get("Min Stock")], ["Max Stock", get("Max Stock")], ["Opening Qty", get("Opening Qty")], ["Opening Unit Cost", get("Opening Unit Cost")]];
        const badNum = nums.find(([, v]) => v !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0));
        if (badNum) { out.push({ line, action: "skip", name: name || sku || "(blank)", sku, error: `${badNum[0]} must be a non-negative number` }); return; }

        if (existing) {
          const patch: Partial<InventoryItem> = {};
          if (get("Selling Price") !== "") { const sp = Number(get("Selling Price")); patch.sellingPrice = sp; patch.regularSellingPrice = sp; patch.defaultPrice = sp; }
          if (get("MRP") !== "") patch.mrp = Number(get("MRP"));
          if (get("Min Stock") !== "") patch.minStock = Number(get("Min Stock"));
          if (get("Max Stock") !== "") patch.maxStock = Number(get("Max Stock"));
          if (get("Vendor")) patch.vendor = get("Vendor");
          if (get("Brand / Model")) patch.brandModel = get("Brand / Model");
          if (get("Barcode")) patch.barcode = get("Barcode");
          if (get("HSN")) patch.hsnCode = get("HSN");
          if (get("GST %") !== "") patch.tax = Number(get("GST %"));
          if (Object.keys(patch).length === 0) { out.push({ line, action: "skip", name: existing.name, sku, error: "Nothing to update" }); return; }
          out.push({ line, action: "update", name: existing.name, sku, id: existing.id, patch });
          return;
        }

        const v = emptyInventoryForm();
        v.name = name; v.sku = sku; v.category = get("Category"); v.brandModel = get("Brand / Model"); v.vendor = get("Vendor");
        v.uom = get("Unit") || "Piece"; v.sellingPrice = get("Selling Price"); v.mrp = get("MRP");
        v.hsn = get("HSN"); v.tax = get("GST %") || "18"; v.minStock = get("Min Stock"); v.maxStock = get("Max Stock");
        v.barcode = get("Barcode"); v.store = get("Location");
        v.currentStock = get("Opening Qty");
        if (canEditCost) { v.costPrice = get("Cost Price"); v.openingUnitCost = get("Opening Unit Cost") || get("Cost Price"); }
        else if (v.currentStock !== "" && Number(v.currentStock) > 0) { out.push({ line, action: "skip", name: name || "(blank)", sku, error: "Opening stock needs cost permission" }); return; }
        const err = validateInventoryForm(v);
        if (err) { out.push({ line, action: "skip", name: name || "(blank)", sku, error: err }); return; }
        out.push({ line, action: "create", name, sku, build: buildInventoryItem(v, { store: v.store || undefined }) });
      });
      // Duplicate SKUs inside the file would create the same item twice.
      const seen = new Set<string>();
      out.forEach((p, i) => {
        if (p.action !== "create" || !p.sku) return;
        const k = p.sku.toLowerCase();
        if (seen.has(k)) out[i] = { line: p.line, action: "skip", name: p.name, sku: p.sku, error: "Duplicate SKU in file" };
        seen.add(k);
      });
      setPlan(out);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  }

  const summary = useMemo(() => ({
    create: plan?.filter((p) => p.action === "create").length ?? 0,
    update: plan?.filter((p) => p.action === "update").length ?? 0,
    skip: plan?.filter((p) => p.action === "skip").length ?? 0,
  }), [plan]);

  async function runImport() {
    if (!plan || busy) return;
    setBusy(true);
    let created = 0, updated = 0;
    try {
      for (const p of plan) {
        if (p.action === "create") {
          await addInventoryItem(p.build.item, { cost: p.build.cost, opening: p.build.opening });
          created++;
        } else if (p.action === "update") {
          await updateInventoryItem(p.id, p.patch);
          updated++;
        }
      }
      toast.success(`Import complete: ${created} created, ${updated} updated`);
      setPlan(null); setFileName("");
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <InvPageHeader icon={FileSpreadsheet} title="Bulk Import / Export" subtitle="Move items in and out of RepairOX with Excel or CSV" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Export stock" className="xl:col-span-1">
          <p className="mb-4 text-[13px] text-muted-foreground">Download every tracked item with on-hand, reserved, available stock and selling price{canViewCost ? ", plus cost and cost value" : ""}.</p>
          <ExportMenu onExport={(f) => exportStock(stockItems, canViewCost, f)} label={`Export ${stockItems.length} items`} variant="primary" />
        </Panel>

        <Can permission={CAP.inventory.create}>
          <Panel title="Import items" className="xl:col-span-2">
            <ol className="mb-4 list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
              <li>Download the Excel template and fill one row per SKU.</li>
              <li>Upload it (.xlsx, .xls or .csv). New SKUs are created with opening stock; existing SKUs get price / min / max / vendor updates.</li>
              <li>Review the preview, then confirm. Stock of existing SKUs is never changed by an import.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="gap-2" onClick={() => downloadXLSX("repairox-inventory-template", [...HEADERS], EXAMPLES, "Items")}>
                <Download className="h-4 w-4" />Excel Template
              </Button>
              <input ref={fileRef} type="file" accept={SPREADSHEET_ACCEPT} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button className="gap-2" onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" />{fileName ? "Choose another file" : "Upload file"}</Button>
              {fileName && <span className="truncate text-[12.5px] text-muted-foreground">{fileName}</span>}
            </div>
            {parseError && <p className="mt-3 flex items-center gap-2 text-[13px] text-rose-600"><AlertTriangle className="h-4 w-4" />{parseError}</p>}
          </Panel>
        </Can>
      </div>

      {plan && (
        <Panel
          title="Import preview"
          action={
            <Button className="gap-2" disabled={busy || summary.create + summary.update === 0} onClick={runImport}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import {summary.create + summary.update} row{summary.create + summary.update === 1 ? "" : "s"}
            </Button>
          }
        >
          <div className="mb-4 flex flex-wrap gap-2 text-[12px] font-semibold">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-200">{summary.create} new</span>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 ring-1 ring-inset ring-sky-200">{summary.update} updates</span>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700 ring-1 ring-inset ring-rose-200">{summary.skip} skipped</span>
          </div>
          <div className="max-h-[360px] overflow-auto rounded-xl border border-border">
            <table className="w-full table-fixed text-[13px]">
              <thead className="sticky top-0">
                <tr className="bg-[#EEF1FD] text-left text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]">
                  <th className="w-[8%] px-3 py-2.5">Row</th><th className="w-[16%] px-3 py-2.5">Action</th><th className="w-[18%] px-3 py-2.5">SKU</th><th className="px-3 py-2.5">Item</th><th className="w-[30%] px-3 py-2.5">Note</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.line} className="border-t border-border">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{p.line}</td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", p.action === "create" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : p.action === "update" ? "bg-sky-50 text-sky-700 ring-sky-200" : "bg-rose-50 text-rose-700 ring-rose-200")}>
                        {p.action === "skip" ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        {p.action === "create" ? "Create" : p.action === "update" ? "Update" : "Skip"}
                      </span>
                    </td>
                    <td className="truncate px-3 py-2 font-mono text-[12px]">{p.sku || "auto"}</td>
                    <td className="truncate px-3 py-2 font-medium" title={p.name}>{p.name}</td>
                    <td className="truncate px-3 py-2 text-muted-foreground">{p.action === "skip" ? p.error : p.action === "update" ? Object.keys(p.patch).length + " fields" : "New item"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
