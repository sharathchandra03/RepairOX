"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Save, Plus, Wand2, Package, Trash2, Info, Tag, IndianRupee,
  Boxes, ListPlus, CheckCircle2, Layers3,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/tabs";
import { SectionCard, HealthBadge } from "@/components/inventory/widgets";
import { InlineCombo } from "@/components/inventory/inline-combo";
import { CATEGORIES, UOMS, classifyStock } from "@/lib/inventory-data";
import { cn, formatINR } from "@/lib/utils";

type CustomField = { id: number; label: string; value: string };

export default function AddItemPage() {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [type, setType] = useState("Product");
  const [mode, setMode] = useState("Both");
  const [categories, setCategories] = useState(CATEGORIES);
  const [category, setCategory] = useState("");
  const [uoms, setUoms] = useState(UOMS);
  const [uom, setUom] = useState("Piece");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [hsn, setHsn] = useState("");
  const [tax, setTax] = useState("18");
  const [currentStock, setCurrentStock] = useState("");
  const [minStock, setMinStock] = useState("");
  const [maxStock, setMaxStock] = useState("");
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [fieldSeq, setFieldSeq] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const isService = type === "Service";

  const health = useMemo(() => {
    const c = Number(currentStock || 0);
    const mn = Number(minStock || 0);
    const mx = Number(maxStock || 0);
    if (isService || (!minStock && !maxStock)) return null;
    return classifyStock(c, mn, mx || mn + 1);
  }, [currentStock, minStock, maxStock, isService]);

  function generateSku() {
    const base = (name || "ITM").slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "X");
    const n = (Date.now() % 10000).toString().padStart(4, "0");
    setSku(`${base}-${n}`);
  }

  function addField() {
    setCustomFields((f) => [...f, { id: fieldSeq, label: "", value: "" }]);
    setFieldSeq((s) => s + 1);
  }

  function save(addNew: boolean) {
    setToast(addNew ? "Item saved — ready for the next one" : "Item saved successfully");
    setTimeout(() => setToast(null), 2600);
    if (addNew) {
      setName(""); setSku(""); setCategory(""); setDefaultPrice(""); setHsn("");
      setCurrentStock(""); setMinStock(""); setMaxStock(""); setCustomFields([]);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Inventory Management"
        title="Add Item"
        subtitle="Create a new product or service with full pricing and stock controls."
        actions={
          <>
            <Link href="/inventory/item-master">
              <Button variant="ghost" size="sm" className="gap-1.5 rounded-full">
                <ArrowLeft className="h-3.5 w-3.5" /> Item Master
              </Button>
            </Link>
            <Button variant="secondary" size="sm" className="gap-1.5 rounded-full" onClick={() => save(true)}>
              <Plus className="h-3.5 w-3.5" /> Save &amp; Add New
            </Button>
            <Button size="sm" className="gap-1.5 rounded-full" onClick={() => save(false)}>
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_330px]">
        {/* ── Form column ── */}
        <div className="space-y-5">
          <SectionCard icon={Package} title="Item Basics" description="Identity and classification" bodyClassName="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Item Name" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. iPhone 15 Pro OLED Assembly" />
              </Field>
              <Field label="Item ID / SKU" hint="Leave blank to auto-generate">
                <div className="flex gap-2">
                  <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-0001" className="font-mono" />
                  <Button type="button" variant="soft" size="md" className="shrink-0 rounded-xl px-3" onClick={generateSku}>
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Product / Service">
                <SegmentedTabs
                  className="w-full [&>button]:flex-1"
                  options={[{ label: "Product", value: "Product" }, { label: "Service", value: "Service" }]}
                  value={type}
                  onChange={setType}
                />
              </Field>
              <Field label="Buy / Sell / Both">
                <SegmentedTabs
                  className="w-full [&>button]:flex-1"
                  options={[{ label: "Buy", value: "Buy" }, { label: "Sell", value: "Sell" }, { label: "Both", value: "Both" }]}
                  value={mode}
                  onChange={setMode}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Item Category" required>
                <InlineCombo
                  value={category}
                  onChange={setCategory}
                  options={categories}
                  onCreate={(n) => setCategories((c) => [n, ...c])}
                  placeholder="Select or create category"
                  createLabel="Create category"
                />
              </Field>
              <Field label="Unit of Measurement">
                <InlineCombo
                  value={uom}
                  onChange={setUom}
                  options={uoms}
                  onCreate={(n) => setUoms((u) => [n, ...u])}
                  placeholder="Select or create unit"
                  createLabel="Create unit"
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard icon={IndianRupee} title="Pricing & Tax" description="Default price and tax treatment" bodyClassName="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Default Price" required>
                <Input type="number" inputMode="decimal" value={defaultPrice} onChange={(e) => setDefaultPrice(e.target.value)} placeholder="0" iconLeft={<span className="text-[13px]">₹</span>} />
              </Field>
              <Field label="HSN Code">
                <Input value={hsn} onChange={(e) => setHsn(e.target.value)} placeholder="8517xx" className="font-mono" />
              </Field>
              <Field label="Tax (GST)">
                <Select
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  options={["0", "5", "12", "18", "28"].map((t) => ({ value: t, label: `${t}%` }))}
                />
              </Field>
            </div>
          </SectionCard>

          {!isService && (
            <SectionCard icon={Boxes} title="Stock Levels" description="Opening stock and reorder thresholds" bodyClassName="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Current Stock">
                  <Input type="number" inputMode="numeric" value={currentStock} onChange={(e) => setCurrentStock(e.target.value)} placeholder="0" />
                </Field>
                <Field label="Minimum Stock Level">
                  <Input type="number" inputMode="numeric" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="0" />
                </Field>
                <Field label="Maximum Stock Level">
                  <Input type="number" inputMode="numeric" value={maxStock} onChange={(e) => setMaxStock(e.target.value)} placeholder="0" />
                </Field>
              </div>
              {health && (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-[13px] text-muted-foreground">Projected stock status:</span>
                  <HealthBadge health={health} />
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard
            icon={Layers3}
            title="Custom Fields"
            description="Add bespoke attributes for this item"
            action={
              <Button type="button" variant="soft" size="sm" className="gap-1.5 rounded-full" onClick={addField}>
                <ListPlus className="h-3.5 w-3.5" /> Add Field
              </Button>
            }
            bodyClassName="space-y-3"
          >
            <AnimatePresence initial={false}>
              {customFields.length === 0 ? (
                <motion.p
                  key="empty"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground"
                >
                  No custom fields yet. Use <span className="font-medium text-foreground">Add Field</span> to capture extra attributes like warranty, supplier, or grade.
                </motion.p>
              ) : (
                customFields.map((f) => (
                  <motion.div
                    key={f.id}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_auto]"
                  >
                    <Input
                      placeholder="Field name (e.g. Warranty)"
                      value={f.label}
                      onChange={(e) => setCustomFields((arr) => arr.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))}
                    />
                    <Input
                      placeholder="Value"
                      value={f.value}
                      onChange={(e) => setCustomFields((arr) => arr.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))}
                    />
                    <Button
                      type="button" variant="outline" size="icon" className="shrink-0 rounded-xl"
                      onClick={() => setCustomFields((arr) => arr.filter((x) => x.id !== f.id))}
                    >
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </SectionCard>
        </div>

        {/* ── Live preview rail ── */}
        <div className="lg:sticky lg:top-[76px] lg:self-start">
          <div className="rounded-2xl border border-border bg-card shadow-card">
            <div className="border-b border-border px-5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Live Preview</p>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/50">
                  <Package className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-display text-[15px] font-bold">{name || "New item"}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{sku || "SKU — auto"}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <Badge tone={isService ? "violet" : "info"}>{type}</Badge>
                <Badge tone="neutral">{mode}</Badge>
                {category && <Badge tone="brand"><Tag className="h-3 w-3" />{category}</Badge>}
              </div>

              <dl className="mt-4 space-y-2.5 text-[13px]">
                <PreviewRow label="Default price" value={defaultPrice ? formatINR(Number(defaultPrice)) : "—"} />
                <PreviewRow label="Tax" value={`${tax}%`} />
                <PreviewRow label="UOM" value={uom} />
                {!isService && <PreviewRow label="Current stock" value={currentStock || "0"} />}
                {!isService && health && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd><HealthBadge health={health} /></dd>
                  </div>
                )}
                {customFields.filter((f) => f.label).length > 0 && (
                  <div className="border-t border-border pt-2.5">
                    {customFields.filter((f) => f.label).map((f) => (
                      <PreviewRow key={f.id} label={f.label} value={f.value || "—"} />
                    ))}
                  </div>
                )}
              </dl>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[#B3BFF6]/60 bg-[#EEF1FD]/60 p-4">
            <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Tip: Set realistic min/max levels to unlock low-stock alerts and reorder recommendations on the dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* Success toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-emerald-200 bg-white px-4 py-2.5 shadow-[0_12px_40px_-12px_rgba(16,185,129,0.45)]"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-[13px] font-semibold text-foreground">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}{required && <span className="ml-0.5 text-rose-500">*</span>}</Label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium tnum">{value}</dd>
    </div>
  );
}
