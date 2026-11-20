"use client";
/* Quick invoice for the field: a short list of lines, one price check, one payment choice.
   Not the CRM wizard. Lines come from the job's ticket (when there is one), from stock, or as a
   free-text service. It saves through the SAME addInvoice choke point as the website (numbering,
   duplicate guard, loyalty, audit, server-side stock + cost finalisation). Totals follow the website
   maths: subtotal − discount, then GST split into SGST + CGST. */
import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Boxes, CheckCircle2, Plus, ShieldAlert, Trash2, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { useStore } from "@/lib/store";
import { useStoreSettings } from "@/lib/store-settings";
import { useSession } from "@/lib/use-session";
import { formatINR } from "@/lib/utils";
import { genInvoiceId } from "@/lib/invoice-id";
import type { Invoice, InvoiceLineItem } from "@/lib/mock-data";
import type { InventoryItem } from "@/lib/inventory-data";
import { isService, sellPrice, availableQty } from "@/lib/ninja/stock";
import { toast } from "@/components/ui/toaster";
import { useNinja } from "@/lib/ninja/ninja-context";
import { TYPE_LABEL } from "@/lib/ninja/model";
import { Btn, Card, ChipGroup, Empty, FormLabel, QtyStepper, Sheet, Skeleton, inputCls } from "@/components/ninja/ui";
import { JobPicker } from "@/components/ninja/job-picker";
import { StockBrowser } from "@/components/ninja/stock-browser";

interface Line { id: string; sku?: string; name: string; qty: number; price: number; kind: "part" | "service"; max?: number }
type Pay = "cash" | "upi" | "card" | "later";
const lid = () => `li-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function Form() {
  const params = useSearchParams();
  const tripId = params.get("trip");
  const { trips, loading, track, refresh } = useNinja();
  const { can } = usePermissions();
  const { addInvoice, invoices, tickets } = useStore();
  const { settings } = useStoreSettings();
  const { name } = useSession();
  const trip = trips.find((t) => t.id === tripId);
  const ticketId = params.get("ticket") || trip?.ticket_id || "";
  const ticket = tickets.find((t) => t.id === ticketId);

  const [lines, setLines] = useState<Line[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [discount, setDiscount] = useState("");
  const [gst, setGst] = useState<number>(settings.invoiceDefaults?.gstRate ?? 0);
  const [pay, setPay] = useState<Pay>("cash");
  const [notes, setNotes] = useState("");
  const [stock, setStock] = useState(false);
  const [svc, setSvc] = useState(false);
  const [svcName, setSvcName] = useState("");
  const [svcPrice, setSvcPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; total: number; paid: boolean } | null>(null);
  const submitting = useRef(false);

  // Seed once from the ticket: its planned parts + the agreed estimate.
  if (!seeded && ticket) {
    setSeeded(true);
    const seed: Line[] = [];
    for (const d of ticket.devices ?? []) {
      for (const p of d.parts ?? []) seed.push({ id: lid(), sku: p.sku || p.inventoryId, name: p.name, qty: p.qty, price: p.unitPrice, kind: "part" });
    }
    const est = (ticket.devices ?? []).reduce((s, d) => s + (Number(d.estimate) || 0), 0) || (seed.length ? 0 : Number(ticket.amount) || 0);
    if (est > 0) seed.push({ id: lid(), name: ticket.service || ticket.issue || "Service charge", qty: 1, price: est, kind: "service" });
    setLines(seed);
  }

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const disc = Math.min(subtotal, Math.max(0, Number(discount) || 0));
    const taxable = subtotal - disc;
    const sgst = Math.round(taxable * (gst / 2 / 100)), cgst = Math.round(taxable * (gst / 2 / 100));
    return { subtotal, disc, sgst, cgst, tax: sgst + cgst, total: taxable + sgst + cgst };
  }, [lines, discount, gst]);

  if (!allow(can, CAP.invoice.create)) return <Empty icon={<ShieldAlert className="h-7 w-7" />} title="Invoice access is off" body="Ask your manager to enable invoice creation for your role." />;
  if (!tripId) return <JobPicker base="/ninja/new/invoice" title="New invoice" />;
  if (loading && !trip) return <Skeleton className="h-64" />;
  if (!trip) return <Empty icon={<ShieldAlert className="h-7 w-7" />} title="Job not found" body="This job isn't assigned to you." action={<Link href="/ninja/new/invoice"><Btn>Pick a job</Btn></Link>} />;
  const job = trip.job;

  if (done) {
    return (
      <div className="space-y-4">
        <Card className="flex flex-col items-center px-6 py-8 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-9 w-9" /></span>
          <p className="mt-4 text-[20px] font-extrabold">Invoice created</p>
          <p className="mt-1 text-[14px] font-semibold text-slate-500">{done.id} · {job?.customer}</p>
          <p className="mt-3 text-[30px] font-extrabold tabular-nums text-slate-900">{formatINR(done.total)}</p>
          <p className={`mt-1 text-[13px] font-bold ${done.paid ? "text-emerald-600" : "text-amber-600"}`}>{done.paid ? "Paid" : "Payment pending"}</p>
        </Card>
        <Link href={`/ninja/trip/${trip.id}`} className="block"><Btn className="w-full !bg-[#2B3553] !shadow-none active:!bg-[#1B2238]">Back to job</Btn></Link>
        <Link href="/ninja" className="block"><Btn tone="ghost" className="w-full">Home</Btn></Link>
      </div>
    );
  }

  const addPart = (i: InventoryItem) => {
    setLines((ls) => {
      const ex = ls.find((l) => l.sku === i.id && l.kind === (isService(i) ? "service" : "part"));
      if (ex) return ls.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { id: lid(), sku: i.id, name: i.name, qty: 1, price: sellPrice(i), kind: isService(i) ? "service" : "part", max: isService(i) ? undefined : availableQty(i) }];
    });
    setStock(false);
    toast.success(`${i.name} added`);
  };
  const addService = () => {
    const price = Number(svcPrice);
    if (!svcName.trim() || !(price >= 0)) return;
    setLines((ls) => [...ls, { id: lid(), name: svcName.trim(), qty: 1, price, kind: "service" }]);
    setSvcName(""); setSvcPrice(""); setSvc(false);
  };
  const overStock = lines.filter((l) => l.max != null && l.qty > l.max);
  const valid = lines.length > 0 && totals.total > 0 && overStock.length === 0;

  async function submit() {
    if (!trip || !valid || submitting.current) return;
    submitting.current = true; setBusy(true);
    try {
      const items: InvoiceLineItem[] = lines.map((l) => ({ id: l.id, sku: l.sku, name: l.name, description: "", qty: l.qty, price: l.price, discount: 0, total: Math.round(l.qty * l.price * 100) / 100, kind: l.kind }));
      const paidNow = pay !== "later";
      const inv: Invoice = {
        id: genInvoiceId("retail", invoices, settings.invoiceNumbering?.retail, "invoice"),
        invoiceType: "retail", customer: job?.customer || "Customer", customerId: trip.customer_id || undefined, phone: job?.phone || "",
        status: paidNow ? "paid" : "sent", createdAt: new Date().toISOString(),
        dueDate: new Date(Date.now() + (settings.invoiceDefaults?.dueDateDays ?? 7) * 86_400_000).toISOString(),
        paidAmount: paidNow ? totals.total : 0, items, subtotal: totals.subtotal, discount: totals.disc, tax: totals.tax,
        gstRate: gst, sgst: totals.sgst, cgst: totals.cgst, sgstRate: gst / 2, cgstRate: gst / 2, total: totals.total,
        notes: notes.trim() || undefined, employee: name || undefined, ticketId: ticket?.id, paymentMode: paidNow ? pay : undefined,
        serviceCategory: "service", documentType: "invoice",
      };
      const id = await addInvoice(inv);
      const check = id && supabase ? await supabase.from("invoices").select("id").eq("id", id).maybeSingle() : { data: null };
      if (!check.data) { track({ kind: "doc_failed", tripId: trip.id, jobId: trip.job_id, payload: { doc: "invoice" } }); toast.error("Invoice was not saved. Check your connection and try again."); return; }
      const link = await supabase!.rpc("ninja_link_trip_docs", { p_trip: trip.id, p_ticket: null, p_invoice: id });
      if (link.error) toast.error("Invoice saved, but it could not be attached to the job. Tell your manager.");
      track({ kind: "doc_invoice_created", tripId: trip.id, jobId: trip.job_id, screen: "new-invoice", payload: { invoice: id, total: totals.total, lines: lines.length, parts: lines.filter((l) => l.kind === "part").length, pay, gst, linked: !link.error } });
      setDone({ id, total: totals.total, paid: paidNow });
      void refresh();
      try { navigator.vibrate?.(30); } catch { /* ignore */ }
    } finally { submitting.current = false; setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-[26px] font-extrabold leading-none tracking-tight">New invoice</h1>
        <p className="mt-1.5 text-[13px] font-medium text-slate-500">{job?.customer || "Customer"} · {TYPE_LABEL[trip.trip_type]} · {trip.trip_no}{ticket ? ` · ${ticket.ticketNo ?? ticket.id}` : ""}</p>
      </div>

      <div>
        <FormLabel hint={`${lines.length} line${lines.length === 1 ? "" : "s"}`}>Items</FormLabel>
        {lines.length === 0 ? <Card className="px-4 py-6 text-center text-[13.5px] font-medium text-slate-500">Add parts from stock or a service charge.</Card> : (
          <Card className="divide-y divide-slate-100">
            {lines.map((l) => (
              <div key={l.id} className="p-3.5">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${l.kind === "service" ? "bg-sky-50 text-sky-600" : "bg-[#EEF1FD] text-[#4361EE]"}`}>{l.kind === "service" ? <Wrench className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[14.5px] font-extrabold text-slate-900">{l.name}</p>
                    {l.max != null && l.qty > l.max ? <p className="text-[12px] font-bold text-rose-600">Only {l.max} in stock</p> : <p className="text-[12px] font-medium text-slate-400">{l.kind === "service" ? "Service" : l.sku}</p>}</div>
                  <button aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-400 active:bg-rose-50 active:text-rose-600"><Trash2 className="h-5 w-5" /></button>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <QtyStepper value={l.qty} onChange={(n) => setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, qty: n } : x)))} />
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-slate-400">₹</span>
                    <input aria-label={`Price for ${l.name}`} inputMode="decimal" value={String(l.price)} onChange={(e) => { const v = Number(e.target.value.replace(/[^\d.]/g, "")); setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, price: Number.isFinite(v) ? v : 0 } : x))); }}
                      className="h-11 w-24 rounded-xl border border-slate-300 bg-white px-3 text-right text-[16px] font-extrabold tabular-nums outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/20" />
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <button onClick={() => setStock(true)} className="flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-white text-[14px] font-bold text-[#3450D8] ring-1 ring-inset ring-[#4361EE]/40 active:bg-[#EEF1FD]"><Boxes className="h-5 w-5" />From stock</button>
          <button onClick={() => setSvc(true)} className="flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-white text-[14px] font-bold text-slate-700 ring-1 ring-inset ring-slate-300 active:bg-slate-50"><Plus className="h-5 w-5" />Service</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><FormLabel>Discount (₹)</FormLabel><input className={inputCls} inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" /></div>
        <div><FormLabel>GST</FormLabel>
          <div className="flex gap-1.5">{(settings.invoiceGstRates?.length ? settings.invoiceGstRates : [0, 12, 18]).map((r) => (
            <button key={r} onClick={() => setGst(r)} className={`min-h-[50px] flex-1 rounded-xl text-[14px] font-extrabold ring-1 ring-inset ${gst === r ? "bg-[#4361EE] text-white ring-[#4361EE]" : "bg-white text-slate-700 ring-slate-300"}`}>{r}%</button>
          ))}</div></div>
      </div>

      <div><FormLabel>Payment</FormLabel>
        <ChipGroup<Pay> value={pay} onChange={setPay} options={[{ id: "cash", label: "Cash" }, { id: "upi", label: "UPI" }, { id: "card", label: "Card" }, { id: "later", label: "Pay later" }]} /></div>
      <div><FormLabel>Note</FormLabel><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>

      <Card className="space-y-1.5 p-4 text-[14px]">
        <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-bold tabular-nums text-slate-800">{formatINR(totals.subtotal)}</span></div>
        {totals.disc > 0 ? <div className="flex justify-between text-slate-500"><span>Discount</span><span className="font-bold tabular-nums text-emerald-600">− {formatINR(totals.disc)}</span></div> : null}
        {totals.tax > 0 ? <div className="flex justify-between text-slate-500"><span>GST {gst}%</span><span className="font-bold tabular-nums text-slate-800">{formatINR(totals.tax)}</span></div> : null}
        <div className="mt-2 flex items-end justify-between border-t border-slate-100 pt-3"><span className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Total</span><span className="text-[28px] font-extrabold leading-none tabular-nums">{formatINR(totals.total)}</span></div>
      </Card>

      <Btn className="w-full" tone={pay === "later" ? "primary" : "success"} disabled={!valid} loading={busy} onClick={submit}>{pay === "later" ? "Create invoice" : `Create & mark paid · ${formatINR(totals.total)}`}</Btn>

      <Sheet open={stock} onClose={() => setStock(false)} title="Add from stock"><StockBrowser onPick={addPart} pickLabel="Add" /></Sheet>
      <Sheet open={svc} onClose={() => setSvc(false)} title="Add a service"
        footer={<Btn className="w-full" disabled={!svcName.trim() || svcPrice === ""} onClick={addService}>Add service</Btn>}>
        <div className="space-y-4 pb-2">
          <div><FormLabel>Service</FormLabel><input className={inputCls} value={svcName} onChange={(e) => setSvcName(e.target.value)} placeholder="e.g. Screen replacement labour" /></div>
          <div><FormLabel>Price (₹)</FormLabel><input className={inputCls} inputMode="decimal" value={svcPrice} onChange={(e) => setSvcPrice(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" /></div>
        </div>
      </Sheet>
    </div>
  );
}

export default function NewInvoicePage() { return <Suspense fallback={null}><Form /></Suspense>; }
