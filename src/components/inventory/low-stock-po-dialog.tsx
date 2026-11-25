"use client";
/* Low Stock → purchase order wizard.
   Step 1  Items & vendors : confirm what to order, quantity, vendor and unit cost per line.
   Step 2  Delivery & review: one card per vendor (= one draft PO) with expected delivery, notes and totals.
   Nothing is created until the user presses "Create". POs are drafts and move no stock. */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Trash2, AlertTriangle, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { DateTimeField } from "@/components/ui/date-time-picker";
import { toast } from "@/components/ui/toaster";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import { suggestedReorderQty } from "@/lib/inventory-analytics";
import { computePoTotals } from "@/lib/purchase-order";
import { cn, formatINR } from "@/lib/utils";
import type { InventoryItem } from "@/lib/inventory-data";
type Line = { itemId: string; name: string; code: string; store: string; qty: number; unitCost: number; taxPct: number; vendor: string };
const NO_VENDOR = "";
const numInput = "h-[32px] w-full rounded-lg border border-input bg-card px-2 text-right text-[13px] tabular-nums outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15";
const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

export function LowStockPoDialog({ items, open, onClose, canViewCost, qtyFor }: { items: InventoryItem[]; open: boolean; onClose: () => void; canViewCost: boolean; qtyFor?: (i: InventoryItem) => number }) {
  const router = useRouter();
  const { vendors } = useInventoryOps();
  const { createDoc } = useInventoryActions();
  const [step, setStep] = useState<1 | 2>(1);
  const [lines, setLines] = useState<Line[]>([]);
  const [meta, setMeta] = useState<Record<string, { expected?: string; notes: string }>>({});
  const [saving, setSaving] = useState(false);
  const activeVendors = useMemo(() => vendors.filter((v) => v.active), [vendors]);
  const vendorByName = useMemo(() => new Map(vendors.map((v) => [v.name, v])), [vendors]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setMeta({});
    setLines(
      items.map((i) => ({
        itemId: i.id, name: i.name, code: i.itemCode ?? i.id, store: i.store ?? "",
        qty: Math.max(1, (qtyFor ?? suggestedReorderQty)(i)),
        unitCost: canViewCost ? i.costPrice ?? 0 : 0,
        taxPct: i.costTax ?? i.tax ?? 0,
        vendor: i.vendor ?? NO_VENDOR,
      })),
    );
  }, [open, items, canViewCost]); // qtyFor is read once when the dialog opens

  const patch = (idx: number, v: Partial<Line>) => setLines((p) => p.map((l, i) => (i === idx ? { ...l, ...v } : l)));
  const missingVendor = lines.filter((l) => !l.vendor.trim()).length;
  const badQty = lines.some((l) => !Number.isInteger(l.qty) || l.qty <= 0);
  const step1Ok = lines.length > 0 && missingVendor === 0 && !badQty;

  const groups = useMemo(() => {
    const m = new Map<string, Line[]>();
    for (const l of lines) m.set(l.vendor, [...(m.get(l.vendor) ?? []), l]);
    return [...m.entries()].map(([vendor, ls]) => {
      const v = vendorByName.get(vendor);
      return { vendor, v, lines: ls, totals: computePoTotals(ls.map((l) => ({ qty: l.qty, unitCost: l.unitCost, taxPct: l.taxPct }))) };
    });
  }, [lines, vendorByName]);
  const grand = groups.reduce((s, g) => s + g.totals.grandTotal, 0);
  const expectedOf = (g: (typeof groups)[number]) => meta[g.vendor]?.expected ?? inDays(g.v?.leadTimeDays ?? 3);

  async function create() {
    if (saving || !step1Ok) return;
    setSaving(true);
    try {
      let last: string | null = null;
      let made = 0;
      for (const g of groups) {
        const stores = [...new Set(g.lines.map((l) => l.store).filter(Boolean))].join(", ");
        const doc = await createDoc("purchase_order", {
          party: g.vendor,
          lines: g.lines.map((l) => ({ itemId: l.itemId, name: l.name, qty: l.qty, unitCost: l.unitCost, taxPct: l.taxPct })),
          data: {
            notes: meta[g.vendor]?.notes?.trim() || (qtyFor ? "Created from Stock Forecast" : "Created from Low Stock Alerts"),
            expectedDate: expectedOf(g),
            shipTo: stores,
            paymentTerms: g.v?.paymentTerms ?? "",
            subtotal: g.totals.subtotal, tax: g.totals.tax, grandTotal: g.totals.grandTotal,
            source: "low_stock",
          },
        });
        if (doc) { made++; last = doc.id; }
      }
      if (made === 0) return;
      toast.success(`${made} draft purchase order${made === 1 ? "" : "s"} created`);
      onClose();
      router.push(made === 1 && last ? `/inventory/docs/${last}` : "/inventory/purchase-orders");
    } finally { setSaving(false); }
  }

  return (
    <RoxCenteredForm
      open={open}
      onClose={onClose}
      title="Create purchase order"
      subtitle={step === 1 ? "Step 1 of 2 · Confirm items, quantities and vendors" : "Step 2 of 2 · Delivery details and review"}
      icon={ClipboardList}
      width="max-w-4xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <p className="hidden text-[12px] text-muted-foreground sm:block">Drafts only. Stock changes when the goods are received (GRN).</p>
          <div className="ml-auto flex gap-2">
            {step === 1 ? (
              <>
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={() => setStep(2)} disabled={!step1Ok}>Next: delivery & review</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={create} disabled={saving || !step1Ok}>{saving ? "Creating…" : `Create ${groups.length} purchase order${groups.length === 1 ? "" : "s"}`}</Button>
              </>
            )}
          </div>
        </div>
      }
    >
      {/* stepper */}
      <div className="mb-4 flex items-center gap-2 text-[12px] font-semibold">
        {["Items & vendors", "Delivery & review"].map((t, i) => (
          <div key={t} className="flex items-center gap-2">
            <span className={cn("grid h-6 w-6 place-items-center rounded-full text-[11px]", step === i + 1 ? "bg-[#4361EE] text-white" : step > i + 1 ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}>{i + 1}</span>
            <span className={step === i + 1 ? "text-foreground" : "text-muted-foreground"}>{t}</span>
            {i === 0 && <span className="mx-1 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-3">
          {missingVendor > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {missingVendor} item{missingVendor === 1 ? " has" : "s have"} no vendor. Pick one below{activeVendors.length === 0 && <> or <Link href="/inventory/vendors" className="font-semibold underline">add a vendor</Link> first</>}.
              </span>
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full table-fixed text-[13px]">
              <thead>
                <tr className="bg-[#EEF1FD] text-left text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]">
                  <th className="px-3 py-2.5">Item</th>
                  <th className="w-[190px] px-3 py-2.5">Vendor</th>
                  <th className="w-[84px] px-3 py-2.5 text-right">Qty</th>
                  {canViewCost && <th className="w-[104px] px-3 py-2.5 text-right">Unit cost</th>}
                  {canViewCost && <th className="w-[100px] px-3 py-2.5 text-right">Amount</th>}
                  <th className="w-[40px]" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.itemId} className="border-t border-border align-middle">
                    <td className="px-3 py-2">
                      <p className="truncate font-medium" title={l.name}>{l.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{l.code}{l.store ? ` · ${l.store}` : ""}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        className="h-[32px]"
                        value={l.vendor}
                        placeholder="Select vendor"
                        onChange={(e) => patch(i, { vendor: e.target.value })}
                        options={[...new Set([...(l.vendor ? [l.vendor] : []), ...activeVendors.map((v) => v.name)])].map((n) => ({ label: n, value: n }))}
                      />
                    </td>
                    <td className="px-3 py-2"><input type="number" min={1} step={1} value={l.qty} onChange={(e) => patch(i, { qty: Number(e.target.value) })} className={numInput} /></td>
                    {canViewCost && <td className="px-3 py-2"><input type="number" min={0} step="0.01" value={l.unitCost} onChange={(e) => patch(i, { unitCost: Number(e.target.value) })} className={numInput} /></td>}
                    {canViewCost && <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(l.qty * l.unitCost)}</td>}
                    <td className="px-2 py-2 text-right">
                      <button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} aria-label="Remove line" className="text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-[13px] text-muted-foreground">No items left to order.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.vendor} className="rounded-xl border border-border">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Truck className="h-4 w-4" /></span>
                  <div>
                    <p className="text-[13.5px] font-bold">{g.vendor}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {g.lines.length} item{g.lines.length === 1 ? "" : "s"} · {g.lines.reduce((s, l) => s + l.qty, 0)} units
                      {g.v?.paymentTerms ? ` · ${g.v.paymentTerms}` : ""}{g.v?.leadTimeDays ? ` · ${g.v.leadTimeDays}d lead time` : ""}
                    </p>
                  </div>
                </div>
                {canViewCost && <p className="font-display text-[1.1rem] font-extrabold tabular-nums">{formatINR(g.totals.grandTotal)}</p>}
              </header>
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                <div>
                  <Label>Expected delivery</Label>
                  <div className="mt-1.5">
                    <DateTimeField
                      value={expectedOf(g)}
                      title="Expected delivery"
                      onChange={(iso) => setMeta((m) => ({ ...m, [g.vendor]: { notes: m[g.vendor]?.notes ?? "", expected: iso } }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Notes to vendor</Label>
                  <input
                    value={meta[g.vendor]?.notes ?? ""}
                    onChange={(e) => setMeta((m) => ({ ...m, [g.vendor]: { ...m[g.vendor], notes: e.target.value } }))}
                    placeholder="Optional"
                    className="mt-1.5 h-[38px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15"
                  />
                </div>
                {canViewCost && (
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-muted-foreground sm:col-span-2">
                    <span>Subtotal <b className="text-foreground">{formatINR(g.totals.subtotal)}</b></span>
                    <span>GST <b className="text-foreground">{formatINR(g.totals.tax)}</b></span>
                    <span>Total <b className="text-foreground">{formatINR(g.totals.grandTotal)}</b></span>
                  </div>
                )}
              </div>
            </section>
          ))}
          {canViewCost && groups.length > 1 && (
            <p className="text-right text-[13px] text-muted-foreground">All {groups.length} orders <b className="ml-1 text-foreground">{formatINR(grand)}</b></p>
          )}
        </div>
      )}
    </RoxCenteredForm>
  );
}
