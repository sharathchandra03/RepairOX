"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Purchase Order editor — ONE scrollable page in two halves:
     TOP    Buyer · Supplier · Delivery location & place of supply · PO details
     BOTTOM Items table (search / low-stock / Excel upload) · notes tabs · totals
   Create: /inventory/purchase-orders/new        Edit a draft: ?edit=PO-0007
   Persists through the existing inventory_docs workflow (useInventoryActions /
   useInventoryOps), so the PO list, detail page, "Receive stock (GRN)" and the
   cost ledger keep working unchanged. Purchasing keys only (CAP.inventory.purchase);
   RLS on inventory_docs is the real boundary. Maths: lib/purchase-order.ts.
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2, CalendarClock, ClipboardList, Mail, Phone, ShieldCheck, Download, FileText, MapPin, PackagePlus, Plus, Send, Save, Sparkles, Trash2, Truck, Upload,
} from "lucide-react";
import { BackPill } from "@/components/common/back-pill";
import { DetailHero, SummaryCard, ACCENT, type Accent } from "@/components/common/detail-page";
import { NoPermission } from "@/components/common/no-permission";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { DateTimeField } from "@/components/ui/date-time-picker";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { InventorySearchBox } from "@/components/inventory/inventory-search-box";
import { toast } from "@/components/ui/toaster";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import { useInventoryScope } from "@/components/inventory/inv-ui";
import { useStoreSettings } from "@/lib/store-settings";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { buildSkuIndex, findLinkedItem, stockStatus, suggestedReorderQty, availableStock } from "@/lib/inventory-analytics";
import { downloadXLSX, readSpreadsheetFileToCSV, parseCSV, SPREADSHEET_ACCEPT } from "@/lib/csv-utils";
import { computePoTotals, isIntraState, GST_RATES, type PoCharge, type PoDiscount } from "@/lib/purchase-order";
import type { DocLine, InvDoc } from "@/lib/inventory-ops";
import type { InventoryItem } from "@/lib/inventory-data";
import { cn, formatINR } from "@/lib/utils";

type Line = DocLine & { unitCost: number; taxPct: number };
type NoteTab = "charges" | "terms" | "comment";

const today = () => new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const inputCls = "h-[32px] w-full rounded-lg border border-input bg-card px-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15";
const TH = "px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]";

/** Card used in the top half (one shared frame so the cards match; coloured accent strip + icon chip). */
function HeadCard({ icon: Icon, title, action, children, className, accent = "blue" }: { icon: React.ComponentType<{ className?: string }>; title: string; action?: React.ReactNode; children: React.ReactNode; className?: string; accent?: Accent }) {
  const a = ACCENT[accent];
  return (
    <section className={cn("group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border-[1.5px] border-border bg-card shadow-[0_1px_2px_rgba(20,30,80,0.04),0_10px_30px_-18px_rgba(20,30,80,0.22)] transition hover:shadow-[0_1px_2px_rgba(20,30,80,0.05),0_16px_36px_-18px_rgba(20,30,80,0.3)]", className)}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", a.bar)} />
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-5 py-3">
        <h2 className="flex items-center gap-2.5 text-[12.5px] font-bold uppercase tracking-wider text-foreground">
          <span className={cn("grid h-7 w-7 place-items-center rounded-lg", a.chip)}><Icon className="h-4 w-4" /></span>{title}
        </h2>
        {action}
      </div>
      <div className="flex-1 space-y-2.5 p-5 text-[13px]">{children}</div>
    </section>
  );
}
function Avatar({ name, tone = "bg-[#EEF1FD] text-[#4361EE]" }: { name: string; tone?: string }) {
  return <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[16px] font-extrabold", tone)}>{(name || "?").trim().charAt(0).toUpperCase()}</span>;
}
function Chip({ icon: Icon, children, tone = "bg-muted text-muted-foreground" }: { icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode; tone?: string }) {
  return <span className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-1 text-[11.5px] font-semibold", tone)}>{Icon && <Icon className="h-3 w-3 shrink-0" />}<span className="truncate">{children}</span></span>;
}

export default function PurchaseOrderEditorPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const canPurchase = allow(can, CAP.inventory.purchase);
  const { settings } = useStoreSettings();
  const { stores } = useStoreContext();
  const { vendors, getDoc, saveDoc, nextDocId, ready } = useInventoryOps();
  const { createDoc } = useInventoryActions();
  const { inventory, stockItems } = useInventoryScope();

  const [editId, setEditId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [delivery, setDelivery] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [title, setTitle] = useState(`Purchase Order dated ${today()}`);
  const [deliveryAt, setDeliveryAt] = useState("");
  const [reference, setReference] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [noteTab, setNoteTab] = useState<NoteTab>("charges");
  const [charges, setCharges] = useState<PoCharge[]>([]);
  const [terms, setTerms] = useState("");
  const [comment, setComment] = useState("");
  const [discount, setDiscount] = useState<PoDiscount>({ type: "amount", value: 0 });
  const [roundOff, setRoundOff] = useState(true);
  const [advance, setAdvance] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ?edit=PO-0007 (read once on mount; window avoids a Suspense boundary for useSearchParams).
  useEffect(() => { setEditId(new URLSearchParams(window.location.search).get("edit")); }, []);
  const editing: InvDoc | undefined = editId ? getDoc(editId) : undefined;

  useEffect(() => {
    if (loaded || !ready || editId === null) return;
    if (editId && !editing) return;
    if (editing) {
      const d = editing.data;
      const str = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : "");
      setVendorName(editing.party);
      setDelivery(str("deliveryLocation"));
      setCity(str("placeCity")); setState(str("placeState"));
      setTitle(str("title") || `Purchase Order ${editing.id}`);
      setDeliveryAt(str("deliveryAt")); setReference(editing.ref);
      setPaymentTerms(str("paymentTerms")); setTerms(str("terms")); setComment(str("notes"));
      try { setCharges(JSON.parse(str("extraCharges") || "[]")); } catch { setCharges([]); }
      setDiscount({ type: d.discountType === "percent" ? "percent" : "amount", value: Number(d.discountValue ?? 0) });
      setRoundOff(d.roundOff !== false);
      setAdvance(d.advance ? String(d.advance) : "");
      setLines(editing.lines.map((l) => ({ ...l, unitCost: l.unitCost ?? 0, taxPct: l.taxPct ?? 18 })));
    }
    setLoaded(true);
  }, [ready, editId, editing, loaded]);

  // Defaults once settings/stores are known (new PO only).
  useEffect(() => {
    if (!loaded || editing) return;
    if (!delivery) setDelivery(settings.storeName || stores[0]?.name || "");
    if (!city) setCity(settings.city || "");
    if (!state) setState(settings.state || "");
  }, [loaded, editing, settings.storeName, settings.city, settings.state, stores]); // eslint-disable-line react-hooks/exhaustive-deps

  const vendor = vendors.find((v) => v.name === vendorName);
  const buyerGstin = settings.registrationNumber;
  const intra = isIntraState({ gstin: buyerGstin, state: settings.state }, { gstin: vendor?.gstNumber, state });
  const totals = useMemo(() => computePoTotals(lines, { discount, charges, roundOff, intraState: intra }), [lines, discount, charges, roundOff, intra]);
  const poNumber = editing?.id ?? nextDocId("purchase_order");
  const locations = useMemo(() => [...new Set([settings.storeName, ...stores.map((s) => s.name), ...inventory.map((i) => i.store)].filter(Boolean))].sort(), [settings.storeName, stores, inventory]);
  const skuIndex = useMemo(() => buildSkuIndex(inventory.filter((i) => (i.kind ?? "part") === "part")), [inventory]);

  // Pick up the vendor's payment terms when a vendor is chosen.
  useEffect(() => { if (vendor?.paymentTerms && !paymentTerms) setPaymentTerms(vendor.paymentTerms); }, [vendor]); // eslint-disable-line react-hooks/exhaustive-deps

  function lineFrom(it: InventoryItem, qty = 1): Line {
    return {
      itemId: it.id, name: it.name, qty, description: it.brandModel ?? "",
      hsn: it.hsnCode && it.hsnCode !== "—" ? it.hsnCode : "", uom: it.uom || "Piece",
      unitCost: it.costState === "configured" ? it.costPrice ?? 0 : 0, taxPct: Number(it.costTax ?? it.tax ?? 18),
    };
  }
  function addItem(it: InventoryItem, qty = 1) {
    setLines((p) => (p.some((l) => l.itemId === it.id) ? (toast.error(`${it.name} is already on this PO`), p) : [...p, lineFrom(it, qty)]));
  }
  const patch = (i: number, v: Partial<Line>) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...v } : l)));

  /** Repair-shop shortcut: every low / out-of-stock part (for this supplier when set) at its reorder quantity. */
  const lowStock = useMemo(() => stockItems.filter((i) => stockStatus(i) !== "in" && suggestedReorderQty(i) > 0 && (!vendor || !i.vendor || i.vendor === vendor.name)), [stockItems, vendor]);
  function addLowStock() {
    const have = new Set(lines.map((l) => l.itemId));
    const add = lowStock.filter((i) => !have.has(i.id));
    if (!add.length) { toast.info("No new low-stock parts to add"); return; }
    setLines((p) => [...p, ...add.map((i) => lineFrom(i, suggestedReorderQty(i)))]);
    toast.success(`${add.length} low-stock part${add.length === 1 ? "" : "s"} added`);
  }

  async function downloadTemplate() {
    await downloadXLSX("purchase-order-items-template.xlsx", ["SKU", "Quantity", "Unit Cost", "GST %"], [["MAC-2015", 10, 2500, 18]], "Items");
  }
  async function bulkUpload(file: File) {
    const rows = parseCSV(await readSpreadsheetFileToCSV(file));
    if (rows.length < 2) { toast.error("The file has no item rows"); return; }
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
    const cSku = col("sku", "item id", "part number"), cQty = col("quantity", "qty"), cCost = col("unit cost", "cost", "price"), cTax = col("gst %", "gst", "tax", "tax %");
    if (cSku < 0) { toast.error("Add a SKU column (use the Excel template)"); return; }
    const have = new Set(lines.map((l) => l.itemId));
    const added: Line[] = []; const missing: string[] = [];
    for (const r of rows.slice(1)) {
      const sku = (r[cSku] ?? "").trim(); if (!sku) continue;
      const it = findLinkedItem(skuIndex, sku);
      if (!it) { missing.push(sku); continue; }
      if (have.has(it.id)) continue;
      const l = lineFrom(it, Math.max(1, Math.round(Number(r[cQty] ?? 1)) || 1));
      if (cCost >= 0 && r[cCost]?.trim()) l.unitCost = Number(r[cCost]) || 0;
      if (cTax >= 0 && r[cTax]?.trim()) l.taxPct = Number(r[cTax]) || 0;
      added.push(l); have.add(it.id);
    }
    setLines((p) => [...p, ...added]);
    if (added.length) toast.success(`${added.length} item${added.length === 1 ? "" : "s"} added from the file`);
    if (missing.length) toast.error(`Not found in inventory: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
  }

  const invalidLine = lines.find((l) => !(Number.isInteger(l.qty) && l.qty > 0) || l.unitCost < 0);
  const canSave = !!vendorName && lines.length > 0 && !invalidLine && !saving;

  async function save(send: boolean) {
    if (!canSave) {
      toast.error(!vendorName ? "Choose a supplier" : lines.length === 0 ? "Add at least one item" : "Each line needs a whole quantity above 0");
      return;
    }
    setSaving(true);
    try {
      const data: InvDoc["data"] = {
        ...(editing?.data ?? {}),
        title, deliveryLocation: delivery, placeCity: city, placeState: state, deliveryAt, paymentTerms, terms, notes: comment,
        extraCharges: JSON.stringify(charges.filter((c) => c.label.trim() || c.amount)),
        discountType: discount.type, discountValue: discount.value || 0, roundOff,
        advance: Number(advance) || 0, subtotal: totals.subtotal, taxTotal: totals.tax, grandTotal: totals.grandTotal,
        taxMode: intra ? "CGST+SGST" : "IGST",
      };
      const cleanLines: DocLine[] = lines.map((l) => ({ ...l, received: l.received ?? 0 }));
      let doc: InvDoc | null;
      if (editing) {
        doc = { ...editing, party: vendorName, ref: reference, lines: cleanLines, data, status: send ? "sent" : editing.status };
        if (!(await saveDoc(doc))) doc = null;
      } else {
        doc = await createDoc("purchase_order", { party: vendorName, ref: reference, lines: cleanLines, data });
        if (doc && send) { doc = { ...doc, status: "sent" }; if (!(await saveDoc(doc))) doc = null; }
      }
      if (doc) {
        toast.success(`${doc.id} ${send ? "saved and marked as sent" : "saved as draft"}`);
        router.push(`/inventory/docs/${doc.id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!canPurchase) return <NoPermission subtitle="Creating purchase orders needs the Manage Purchases permission." />;
  if (editId && ready && !editing) return <div className="space-y-4"><BackPill href="/inventory/purchase-orders" label="Back to Purchase Orders" /><p className="py-16 text-center text-muted-foreground">This purchase order doesn&apos;t exist or you don&apos;t have access to it.</p></div>;
  if (editing && editing.status !== "draft") return <div className="space-y-4"><BackPill href={`/inventory/docs/${editing.id}`} label="Back to PO" /><p className="py-16 text-center text-muted-foreground">Only draft purchase orders can be edited. {editing.id} is already {editing.status}.</p></div>;

  const gstSplit = intra ? [["CGST", totals.tax / 2], ["SGST", totals.tax / 2]] as const : [["IGST", totals.tax]] as const;

  return (
    <div className="space-y-5 pb-10">
      {/* Hero */}
      <BackPill href="/inventory/purchase-orders" label="Back to Purchase Orders" />
      <DetailHero>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#4361EE] text-white shadow-[0_10px_24px_-10px_rgba(67,97,238,0.7)] ring-4 ring-white"><ClipboardList className="h-6 w-6" /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-[1.6rem] font-extrabold leading-tight tracking-tight">{editing ? `Edit ${editing.id}` : "New Purchase Order"}</h1>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-zinc-600 ring-1 ring-inset ring-zinc-200">Draft</span>
              </div>
              <p className="mt-0.5 text-[13px] text-muted-foreground">Order parts from a supplier. Stock moves only when you receive it (GRN).</p>
            </div>
          </div>
          <span className="rounded-full bg-white/80 px-3 py-1 text-[12px] font-semibold text-[#4361EE] ring-1 ring-[#4361EE]/20">INR · ₹</span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <SummaryCard label="PO number" value={<span className="font-mono">{poNumber}</span>} />
          <SummaryCard label="Supplier" value={vendorName || "Not selected"} tone={vendorName ? undefined : "text-muted-foreground"} />
          <SummaryCard label="Items · units" value={`${lines.length} · ${lines.reduce((n, l) => n + (l.qty || 0), 0)}`} />
          <SummaryCard label="Expected delivery" value={deliveryAt ? new Date(deliveryAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Not set"} tone={deliveryAt ? undefined : "text-muted-foreground"} />
          <SummaryCard label="Grand total" value={formatINR(totals.grandTotal)} tone="text-emerald-600" />
        </div>
      </DetailHero>

      {/* ── TOP HALF: parties + document details ───────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          <HeadCard accent="indigo" icon={Building2} title="Buyer details" action={<Link href="/settings/store" className="text-[11.5px] font-semibold text-[#4361EE] hover:underline">Edit</Link>}>
            <div className="flex items-center gap-3">
              <Avatar name={settings.storeName || "S"} tone="bg-indigo-50 text-indigo-600" />
              <p className="text-[15px] font-bold">{settings.storeName || "Your store"}</p>
            </div>
            <p className="text-muted-foreground">{[settings.address, settings.city && `${settings.city}${settings.state ? ` (${settings.state})` : ""}`, [settings.country, settings.postCode].filter(Boolean).join(" - ")].filter(Boolean).join(", ") || "Add your address in Settings → Store"}</p>
            <Chip icon={ShieldCheck} tone="bg-emerald-50 text-emerald-700">GSTIN {buyerGstin || "—"}</Chip>
          </HeadCard>

          <HeadCard accent="violet" icon={Truck} title="Supplier details" action={<Link href="/inventory/vendors" className="text-[11.5px] font-semibold text-[#4361EE] hover:underline">Manage vendors</Link>}>
            {vendors.length ? (
              <Select className="h-[34px]" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Select supplier" options={vendors.filter((v) => v.active || v.name === vendorName).map((v) => ({ label: v.name, value: v.name }))} />
            ) : (
              <p className="rounded-xl border border-dashed border-input px-3 py-2 text-[12.5px] text-muted-foreground">No vendors yet. <Link href="/inventory/vendors" className="font-semibold text-[#4361EE] hover:underline">Add a vendor</Link> first.</p>
            )}
            {vendor && (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center gap-3">
                  <Avatar name={vendor.name} tone="bg-violet-50 text-violet-600" />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold">{vendor.name}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{vendor.contactPerson || "No contact person"}</p>
                  </div>
                </div>
                {vendor.address && <p className="text-muted-foreground">{vendor.address}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {vendor.phone && <Chip icon={Phone}>{vendor.phone}</Chip>}
                  {vendor.email && <Chip icon={Mail}>{vendor.email}</Chip>}
                  <Chip icon={ShieldCheck} tone="bg-emerald-50 text-emerald-700">GSTIN {vendor.gstNumber || "—"}</Chip>
                  {vendor.leadTimeDays ? <Chip icon={CalendarClock} tone="bg-sky-50 text-sky-700">Delivers in {vendor.leadTimeDays} days</Chip> : null}
                </div>
              </div>
            )}
          </HeadCard>

          <HeadCard accent="teal" icon={MapPin} title="Delivery location" className="sm:col-span-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5"><Label>Deliver to *</Label>
                <Select className="h-[34px]" value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="Select store" options={locations.map((l) => ({ label: l, value: l }))} />
              </div>
              <div className="space-y-1.5"><Label>Place of supply · City</Label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" /></div>
              <div className="space-y-1.5"><Label>State</Label><Input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" /></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              <Chip tone={intra ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}>{intra ? "CGST + SGST · same state" : "IGST · different state"}</Chip>
              <span>Worked out from the buyer and supplier GSTIN.</span>
            </div>
          </HeadCard>
        </div>

        <HeadCard accent="blue" icon={FileText} title="Primary document details">
          <div className="space-y-1.5"><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>PO number</Label><div className="flex h-[34px] items-center rounded-xl border border-border bg-muted/40 px-3 font-mono text-[13px] font-semibold">{poNumber}</div></div>
            <div className="space-y-1.5"><Label>PO date</Label><div className="flex h-[34px] items-center rounded-xl border border-border bg-muted/40 px-3 text-[13px]">{editing ? new Date(editing.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : today()}</div></div>
          </div>
          <div className="space-y-1.5"><Label>Expected delivery</Label><DateTimeField value={deliveryAt} onChange={setDeliveryAt} placeholder="Pick delivery date & time" title="Expected delivery" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Supplier quote / ref.</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" /></div>
            <div className="space-y-1.5"><Label>Payment terms</Label><Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 30 days" /></div>
          </div>
        </HeadCard>
      </div>

      {/* ── BOTTOM HALF: items + notes + totals ────────────────────────── */}
      <section className="relative overflow-hidden rounded-2xl border-[1.5px] border-border bg-card p-5 pl-6 shadow-[0_1px_2px_rgba(20,30,80,0.04),0_10px_30px_-18px_rgba(20,30,80,0.22)]">
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", ACCENT.emerald.bar)} />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto flex items-center gap-2.5 font-display text-[15px] font-bold">
            <span className={cn("grid h-8 w-8 place-items-center rounded-lg", ACCENT.emerald.chip)}><PackagePlus className="h-4 w-4" /></span>
            Items <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">{lines.length}</span>
          </h2>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadTemplate}><Download className="h-3.5 w-3.5" />Excel Template</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}><Upload className="h-3.5 w-3.5" />Bulk Upload</Button>
          <input ref={fileRef} type="file" accept={SPREADSHEET_ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) bulkUpload(f); e.target.value = ""; }} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={addLowStock} disabled={lowStock.length === 0} title={vendor ? `Low-stock parts for ${vendor.name} (or with no vendor set)` : "All low / out-of-stock parts"}>
            <Sparkles className="h-3.5 w-3.5" />Add low-stock parts{lowStock.length ? ` (${lowStock.length})` : ""}
          </Button>
        </div>
        <div className="mb-3"><InventorySearchBox kind="part" autoFocus={false} onSelect={(it) => addItem(it)} placeholder="Search inventory by part name, SKU or HSN to add it to the PO…" /></div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[1080px] table-fixed text-[13px]">
            <colgroup>
              <col style={{ width: 36 }} /><col style={{ width: "20%" }} /><col style={{ width: "14%" }} /><col style={{ width: 90 }} />
              <col style={{ width: 76 }} /><col style={{ width: 80 }} /><col style={{ width: 70 }} /><col style={{ width: 104 }} />
              <col style={{ width: 80 }} /><col style={{ width: 104 }} /><col style={{ width: 92 }} /><col style={{ width: 108 }} /><col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr className="bg-[#EEF1FD] text-left">
                <th className={TH}>#</th><th className={TH}>Item</th><th className={TH}>Description</th><th className={TH}>HSN/SAC</th>
                <th className={cn(TH, "text-center")}>Qty</th><th className={TH}>Unit</th><th className={cn(TH, "text-center")}>In stock</th>
                <th className={cn(TH, "text-right")}>Unit cost</th><th className={cn(TH, "text-center")}>GST %</th>
                <th className={cn(TH, "text-right")}>Before tax</th><th className={cn(TH, "text-right")}>Tax</th><th className={cn(TH, "text-right")}>Total</th><th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const it = inventory.find((x) => x.id === l.itemId);
                const t = totals.lines[i];
                const bad = !(Number.isInteger(l.qty) && l.qty > 0);
                return (
                  <tr key={l.itemId} className="border-t border-border align-middle transition-colors even:bg-muted/20 hover:bg-[#EEF1FD]/50">
                    <td className="px-2 py-2 text-[12px] font-semibold text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-2"><p className="truncate font-semibold" title={l.name}>{l.name}</p><p className="truncate font-mono text-[11px] text-muted-foreground">{l.itemId}</p></td>
                    <td className="px-2 py-2"><input value={l.description ?? ""} onChange={(e) => patch(i, { description: e.target.value })} placeholder="Grade, colour…" className={inputCls} /></td>
                    <td className="px-2 py-2"><input value={l.hsn ?? ""} onChange={(e) => patch(i, { hsn: e.target.value })} className={cn(inputCls, "font-mono")} /></td>
                    <td className="px-2 py-2"><input inputMode="numeric" value={l.qty || ""} onChange={(e) => patch(i, { qty: Number(e.target.value.replace(/[^0-9]/g, "")) })} className={cn(inputCls, "text-center tabular-nums", bad && "border-rose-400")} /></td>
                    <td className="px-2 py-2"><input value={l.uom ?? ""} onChange={(e) => patch(i, { uom: e.target.value })} className={inputCls} /></td>
                    <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{it ? availableStock(it) : "—"}</td>
                    <td className="px-2 py-2"><input inputMode="decimal" value={l.unitCost || ""} placeholder="0" onChange={(e) => patch(i, { unitCost: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} className={cn(inputCls, "text-right tabular-nums")} /></td>
                    <td className="px-2 py-2"><Select className="h-[32px]" value={String(l.taxPct)} onChange={(e) => patch(i, { taxPct: Number(e.target.value) })} options={[...new Set([...GST_RATES, l.taxPct])].map((r) => ({ label: `${r}%`, value: String(r) }))} /></td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatINR(t?.taxable ?? 0)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatINR(t?.tax ?? 0)}</td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">{formatINR(t?.total ?? 0)}</td>
                    <td className="px-1 py-2 text-center"><button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} aria-label={`Remove ${l.name}`} className="text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr><td colSpan={13} className="px-4 py-10 text-center">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#EEF1FD] text-[#4361EE]"><PackagePlus className="h-6 w-6" /></span>
                  <p className="mt-3 text-[15px] font-bold">No items yet</p>
                  <p className="text-[12.5px] text-muted-foreground">Search inventory above, add your low-stock parts, or upload an Excel file.</p>
                  {lowStock.length > 0 && <Button size="sm" className="mt-3 gap-1.5" onClick={addLowStock}><Sparkles className="h-3.5 w-3.5" />Add {lowStock.length} low-stock parts</Button>}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Notes tabs */}
        <section className="relative overflow-hidden rounded-2xl border-[1.5px] border-border bg-card p-5 pl-6 shadow-card lg:col-span-3"><span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", ACCENT.amber.bar)} />
          <SegmentedTabs size="sm" value={noteTab} onChange={(v) => setNoteTab(v as NoteTab)} options={[{ label: "Extra charges", value: "charges" }, { label: "Terms & conditions", value: "terms" }, { label: "Comment", value: "comment" }]} />
          <div className="mt-4">
            {noteTab === "charges" && (
              <div className="space-y-2">
                {charges.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={c.label} onChange={(e) => setCharges((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Freight, packing, courier…" className="flex-1" />
                    <Input inputMode="decimal" value={c.amount || ""} onChange={(e) => setCharges((p) => p.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 } : x)))} placeholder="₹0" className="w-32 text-right" />
                    <button onClick={() => setCharges((p) => p.filter((_, j) => j !== i))} aria-label="Remove charge" className="text-muted-foreground hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCharges((p) => [...p, { label: "", amount: 0 }])}><Plus className="h-3.5 w-3.5" />Add charge</Button>
              </div>
            )}
            {noteTab === "terms" && <Textarea rows={4} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Warranty on parts, return policy for DOA parts, delivery terms…" />}
            {noteTab === "comment" && <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Internal note for your team (not for the supplier)" />}
          </div>
        </section>

        {/* Totals */}
        <section className="relative overflow-hidden rounded-2xl border-[1.5px] border-border bg-card p-5 pl-6 shadow-card lg:col-span-2"><span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", ACCENT.violet.bar)} />
          <div className="space-y-2.5 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Additional discount</span>
              <div className="flex items-center gap-1.5">
                <Select className="h-[32px] w-[76px]" value={discount.type} onChange={(e) => setDiscount((d) => ({ ...d, type: e.target.value as PoDiscount["type"] }))} options={[{ label: "₹", value: "amount" }, { label: "%", value: "percent" }]} />
                <Input inputMode="decimal" value={discount.value || ""} onChange={(e) => setDiscount((d) => ({ ...d, value: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 }))} placeholder="0" className="h-[32px] w-24 text-right" />
              </div>
            </div>
            <Row label="Subtotal" value={totals.subtotal} />
            {totals.discount > 0 && <Row label="Discount" value={-totals.discount} />}
            <Row label="Total (before tax)" value={totals.taxable} />
            {gstSplit.map(([k, v]) => <Row key={k} label={k} value={v} muted />)}
            <Row label="Total tax" value={totals.tax} />
            {totals.charges > 0 && <Row label="Extra charges" value={totals.charges} />}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-muted-foreground"><Checkbox checked={roundOff} onChange={() => setRoundOff((v) => !v)} aria-label="Round off" />Round off</label>
              <span className="tabular-nums text-muted-foreground">{formatINR(totals.roundOff)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-[#4361EE] to-[#5B7BFF] px-4 py-3 text-white shadow-[0_10px_24px_-12px_rgba(67,97,238,0.7)]">
              <span className="font-display text-[14px] font-bold">Grand total</span>
              <span className="font-display text-[22px] font-extrabold tabular-nums">{formatINR(totals.grandTotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Advance to pay</span>
              <Input inputMode="decimal" value={advance} onChange={(e) => setAdvance(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="₹0" className="h-[32px] w-32 text-right" />
            </div>
          </div>
        </section>
      </div>

      {/* Action bar (sits at the end of the page, not pinned) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-[1.5px] border-[#4361EE]/20 bg-card px-5 py-3 shadow-card">
        <div className="flex items-center gap-4 text-[13px]">
          <span className="text-muted-foreground">{lines.length} item{lines.length === 1 ? "" : "s"} · {lines.reduce((n, l) => n + (l.qty || 0), 0)} units</span>
          <span className="font-display text-[18px] font-extrabold tabular-nums text-[#4361EE]">{formatINR(totals.grandTotal)}</span>
          {!canSave && !saving && <span className="hidden text-[12px] text-amber-600 sm:inline">{!vendorName ? "Choose a supplier to continue" : lines.length === 0 ? "Add at least one item" : "Fix the highlighted quantities"}</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => save(false)} disabled={saving}><Save className="h-4 w-4" />Save draft</Button>
          <Button className="gap-2" onClick={() => save(true)} disabled={saving}><Send className="h-4 w-4" />{saving ? "Saving…" : "Save & mark sent"}</Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between", muted && "pl-3 text-[12.5px]")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", muted ? "text-muted-foreground" : "font-semibold")}>{formatINR(value)}</span>
    </div>
  );
}
