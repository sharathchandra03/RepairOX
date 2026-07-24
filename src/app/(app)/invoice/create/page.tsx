"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight, ArrowLeft, Check, Plus, Trash2, Copy, Save,
  User, FileText, Package, DollarSign, StickyNote, ClipboardCheck, Sparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select, NumericInput } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useStore } from "@/lib/store";
import { cn, formatINR } from "@/lib/utils";
import type { Invoice, InvoiceLineItem, InvoiceStatus, InvoiceType } from "@/lib/mock-data";

/* ─── Step Definitions ───────────────────────────────────────────────── */

const STEPS = [
  { id: 1, label: "Customer", icon: User },
  { id: 2, label: "Details", icon: FileText },
  { id: 3, label: "Products", icon: Package },
  { id: 4, label: "Pricing", icon: DollarSign },
  { id: 5, label: "Notes", icon: StickyNote },
  { id: 6, label: "Review", icon: ClipboardCheck },
  { id: 7, label: "Complete", icon: Sparkles },
];

/* ─── Form Data Type ─────────────────────────────────────────────────── */

type InvoiceFormData = {
  customer: { name: string; phone: string; email: string; company: string };
  details: { reference: string; dueDate: string; employee: string; ticketId: string; status: InvoiceStatus; invoiceType: InvoiceType };
  items: InvoiceLineItem[];
  pricing: { discount: number; taxRate: number };
  notes: { notes: string; terms: string; slogan: string; footer: string };
};

const DEFAULT_FORM: InvoiceFormData = {
  customer: { name: "", phone: "", email: "", company: "" },
  details: { reference: "", dueDate: "", employee: "", ticketId: "", status: "draft", invoiceType: "retail" },
  items: [],
  pricing: { discount: 0, taxRate: 18 },
  notes: { notes: "", terms: "Limited Warranty\nWe stand behind our repair services.\nYour repaired device is covered by a service warranty.", slogan: "", footer: "THANK YOU FOR CHOOSING FIX IND" },
};

function genInvoiceId(type: InvoiceType, existingInvoices: Invoice[]): string {
  const prefix = type === "business" ? "INVG" : "INV";
  const existing = existingInvoices.filter((i) => i.invoiceType === type);
  const maxNum = existing.reduce((max, i) => {
    const match = i.id.match(/\d+$/);
    return match ? Math.max(max, parseInt(match[0], 10)) : max;
  }, 0);
  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

function genLineId(): string {
  return `li-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── Page Wrapper (Suspense for useSearchParams) ────────────────────── */

export default function InvoiceCreatePage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center"><div className="h-8 w-8 rounded-full border-2 border-[#4361EE] border-r-transparent animate-spin" /></div>}>
      <InvoiceWizard />
    </Suspense>
  );
}

/* ─── Main Wizard ────────────────────────────────────────────────────── */

function InvoiceWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { invoices, addInvoice, updateInvoice } = useStore();
  const isEdit = !!editId;

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<InvoiceFormData>(DEFAULT_FORM);
  const [dirty, setDirty] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Pre-fill when editing
  useEffect(() => {
    if (editId) {
      const existing = invoices.find((i) => i.id === editId);
      if (existing) {
        setForm(invoiceToForm(existing));
      }
    }
  }, [editId, invoices]);

  // Pre-fill from ticket (Push to Invoice)
  useEffect(() => {
    const fromTicket = searchParams.get("fromTicket");
    if (fromTicket && !editId) {
      const customer = searchParams.get("customer") || "";
      const phone = searchParams.get("phone") || "";
      const email = searchParams.get("email") || "";
      const address = searchParams.get("address") || "";
      const company = searchParams.get("company") || "";
      const amount = parseFloat(searchParams.get("amount") || "0");
      const service = searchParams.get("service") || "";
      const device = searchParams.get("device") || "";
      const brand = searchParams.get("brand") || "";
      const serial = searchParams.get("serial") || "";
      const employee = searchParams.get("employee") || "";
      const partsRaw = searchParams.get("parts");

      let items: any[] = [];

      // If ticket has parts, use them as line items
      if (partsRaw) {
        try {
          const parts = JSON.parse(partsRaw);
          items = parts.map((p: any, i: number) => ({
            id: `li-${Date.now()}-${i}`,
            name: p.name,
            description: "",
            qty: p.qty || 1,
            price: p.price || 0,
            discount: 0,
            total: p.total || (p.qty * p.price),
          }));
        } catch { /* ignore parse errors */ }
      }

      // If no parts but has amount, create a single service line item
      if (items.length === 0 && amount > 0) {
        const descParts = [brand, device, serial ? `SN: ${serial}` : ""].filter(Boolean);
        items = [{
          id: `li-${Date.now()}`,
          name: service || "Repair Service",
          description: descParts.length > 0 ? descParts.join(" — ") : "",
          qty: 1,
          price: amount,
          discount: 0,
          total: amount,
        }];
      }

      setForm((prev) => ({
        ...prev,
        customer: { name: customer, phone, email, company },
        details: { ...prev.details, ticketId: fromTicket, employee, status: "draft" },
        items,
      }));
    }
  }, [searchParams, editId]);

  // Track dirty state
  const updateForm = useCallback((updater: (prev: InvoiceFormData) => InvoiceFormData) => {
    setForm((prev) => { const next = updater(prev); setDirty(true); return next; });
  }, []);

  // Navigation guard
  const attemptNav = useCallback((path: string) => {
    if (dirty && !submitted) {
      setPendingNav(path);
      setShowLeaveDialog(true);
    } else {
      router.push(path);
    }
  }, [dirty, submitted, router]);

  const confirmLeave = useCallback(() => {
    setShowLeaveDialog(false);
    if (pendingNav) router.push(pendingNav);
  }, [pendingNav, router]);

  // Computed totals
  const totals = useMemo(() => {
    const subtotal = form.items.reduce((s, item) => s + item.total, 0);
    const discount = form.pricing.discount;
    const taxable = subtotal - discount;
    const tax = Math.round(taxable * (form.pricing.taxRate / 100));
    const total = taxable + tax;
    return { subtotal, discount, tax, total };
  }, [form.items, form.pricing]);

  // Submit
  const handleSubmit = useCallback(() => {
    const invoice: Invoice = {
      id: editId || genInvoiceId(form.details.invoiceType as InvoiceType, invoices),
      reference: form.details.reference || `CORP-${Math.floor(1000 + Math.random() * 9000)}`,
      invoiceType: (form.details.invoiceType as InvoiceType) || "retail",
      customer: form.customer.name || "Walk-in Customer",
      phone: form.customer.phone,
      email: form.customer.email || undefined,
      company: form.customer.company || undefined,
      status: form.details.status,
      createdAt: isEdit ? (invoices.find((i) => i.id === editId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      dueDate: form.details.dueDate || new Date(Date.now() + 7 * 86_400_000).toISOString(),
      paidAmount: isEdit ? (invoices.find((i) => i.id === editId)?.paidAmount || 0) : 0,
      items: form.items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      total: totals.total,
      notes: form.notes.notes || undefined,
      terms: form.notes.terms || undefined,
      slogan: form.notes.slogan || undefined,
      footer: form.notes.footer || undefined,
      employee: form.details.employee || undefined,
      ticketId: form.details.ticketId || undefined,
    };

    if (isEdit) {
      updateInvoice(editId!, invoice);
    } else {
      addInvoice(invoice);
    }
    setDirty(false);
    setSubmitted(true);
    setStep(7);
  }, [form, totals, editId, isEdit, invoices, addInvoice, updateInvoice]);

  // Step navigation
  const goNext = () => setStep((s) => Math.min(s + 1, 6));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));
  const goToStep = (s: number) => { if (s <= step || s <= maxReached) setStep(s); };
  const maxReached = step;

  if (submitted && step === 7) {
    return <CompletionScreen isEdit={isEdit} invoiceId={editId || form.details.reference} onDone={() => router.push("/invoice")} />;
  }

  return (
    <div className="relative flex flex-col min-h-full bg-gradient-to-b from-[hsl(228,30%,96%)] via-white to-[hsl(228,30%,96%)]">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-15 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-br from-[#B3BFF6]/20 to-[#4361EE]/8 blur-3xl" />

      {/* Top bar */}
      <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <button onClick={() => attemptNav("/invoice")} className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-zinc-600 shadow-card transition hover:bg-muted" aria-label="Back to invoices">
          <ArrowLeft className="h-4 w-4" />
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <button onClick={() => attemptNav("/dashboard")} className="hover:text-foreground transition">Home</button>
          <span>/</span>
          <button onClick={() => attemptNav("/invoice")} className="hover:text-foreground transition">Invoices</button>
          <span>/</span>
          <span className="text-foreground font-medium">{isEdit ? `Edit ${editId}` : "Create Invoice"}</span>
        </nav>

        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={() => { setDirty(false); router.push("/invoice"); }}>
          <Save className="h-3.5 w-3.5" /> Save Draft
        </Button>
        <button onClick={() => attemptNav("/invoice")} className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-zinc-600 shadow-card transition hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Stepper */}
      <div className="relative mx-auto max-w-6xl px-4 pt-2 pb-2 sm:px-6 lg:px-8">
        <div className="hidden md:flex items-center justify-between">
          {STEPS.slice(0, 6).map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => goToStep(s.id)}
                disabled={s.id > maxReached + 1}
                className={cn("flex items-center gap-2 group", s.id > maxReached + 1 && "opacity-40 cursor-not-allowed")}
              >
                <motion.span
                  initial={false}
                  animate={active ? { scale: [1, 1.1, 1] } : {}}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-xs font-bold transition",
                    done ? "bg-emerald-500 text-white" : active ? "bg-[#4361EE] text-white shadow-[0_4px_12px_-4px_rgba(67,97,238,0.5)]" : "bg-muted text-muted-foreground ring-1 ring-border"
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                </motion.span>
                <span className={cn("text-xs font-medium transition", active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{s.label}</span>
                {i < 5 && <div className={cn("mx-2 h-px flex-1 min-w-[20px] transition", done ? "bg-emerald-300" : "bg-border")} />}
              </button>
            );
          })}
        </div>
        {/* Mobile progress */}
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground">Step {step} of 6</span>
            <span className="text-xs font-semibold">{STEPS[step - 1]?.label}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div className="h-full rounded-full bg-[#4361EE]" animate={{ width: `${(step / 6) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="relative mx-auto max-w-6xl px-4 pt-4 pb-6 sm:px-6 lg:px-8 flex-1 min-h-0 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            {step === 1 && <StepCustomer form={form} updateForm={updateForm} />}
            {step === 2 && <StepDetails form={form} updateForm={updateForm} />}
            {step === 3 && <StepProducts form={form} updateForm={updateForm} />}
            {step === 4 && <StepPricing form={form} updateForm={updateForm} totals={totals} />}
            {step === 5 && <StepNotes form={form} updateForm={updateForm} />}
            {step === 6 && <StepReview form={form} totals={totals} onSubmit={handleSubmit} isEdit={isEdit} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      {step < 7 && (
        <div className="sticky bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur-md shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.06)]">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <Button variant="outline" size="md" onClick={goBack} disabled={step === 1}>
              <ArrowLeft className="h-4 w-4" /> Previous
            </Button>
            {step < 6 ? (
              <Button size="md" onClick={goNext}>
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="md" onClick={handleSubmit}>
                <Save className="h-4 w-4" /> {isEdit ? "Save Invoice" : "Create Invoice"}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Unsaved changes dialog */}
      <ConfirmDialog
        open={showLeaveDialog}
        onClose={() => setShowLeaveDialog(false)}
        onConfirm={confirmLeave}
        title="Unsaved Changes"
        description="You have unsaved invoice changes. Leaving now will discard your work."
        confirmLabel="Leave Without Saving"
        cancelLabel="Stay Here"
        danger={false}
      />
    </div>
  );
}

/* ─── Helper: Invoice to Form ────────────────────────────────────────── */

function invoiceToForm(inv: Invoice): InvoiceFormData {
  return {
    customer: { name: inv.customer, phone: inv.phone, email: inv.email || "", company: inv.company || "" },
    details: { reference: inv.reference, dueDate: inv.dueDate?.slice(0, 10) || "", employee: inv.employee || "", ticketId: inv.ticketId || "", status: inv.status, invoiceType: inv.invoiceType || "retail" },
    items: inv.items,
    pricing: { discount: inv.discount, taxRate: inv.tax > 0 && inv.subtotal > 0 ? Math.round((inv.tax / (inv.subtotal - inv.discount)) * 100) : 18 },
    notes: { notes: inv.notes || "", terms: inv.terms || "", slogan: inv.slogan || "", footer: inv.footer || "" },
  };
}

/* ─── Step 1: Customer ───────────────────────────────────────────────── */

function StepCustomer({ form, updateForm }: { form: InvoiceFormData; updateForm: (fn: (f: InvoiceFormData) => InvoiceFormData) => void }) {
  const c = form.customer;
  const d = form.details;
  const set = (k: keyof typeof c, v: string) => updateForm((f) => ({ ...f, customer: { ...f.customer, [k]: v } }));
  const setType = (v: string) => updateForm((f) => ({ ...f, details: { ...f.details, invoiceType: v as any } }));
  return (
    <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      {/* Invoice Type — compact inline selector */}
      <div className="border-b border-border px-6 py-4 sm:px-8">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Invoice Type</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setType("retail")}
            className={cn("flex items-center gap-2.5 rounded-lg border px-4 py-2.5 transition-all text-left flex-1", d.invoiceType === "retail" ? "border-[#4361EE] bg-indigo-50/60 shadow-sm" : "border-border hover:border-zinc-300")}>
            <span className={cn("grid h-8 w-8 place-items-center rounded-lg text-xs font-bold", d.invoiceType === "retail" ? "bg-[#4361EE] text-white" : "bg-indigo-100 text-[#4361EE]")}>R</span>
            <div>
              <p className="text-[13px] font-semibold leading-tight">Retail Invoice</p>
              <p className="text-[10px] text-muted-foreground">Individual / walk-in</p>
            </div>
          </button>
          <button type="button" onClick={() => setType("business")}
            className={cn("flex items-center gap-2.5 rounded-lg border px-4 py-2.5 transition-all text-left flex-1", d.invoiceType === "business" ? "border-[#4361EE] bg-indigo-50/60 shadow-sm" : "border-border hover:border-zinc-300")}>
            <span className={cn("grid h-8 w-8 place-items-center rounded-lg text-xs font-bold", d.invoiceType === "business" ? "bg-[#4361EE] text-white" : "bg-emerald-100 text-emerald-700")}>B</span>
            <div>
              <p className="text-[13px] font-semibold leading-tight">Business Invoice</p>
              <p className="text-[10px] text-muted-foreground">GST / company billing</p>
            </div>
          </button>
        </div>
      </div>

      {/* Customer Info — same card, below the type */}
      <div className="px-6 py-5 sm:px-8">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4">Customer Information</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1"><Label>Customer Name *</Label><Input value={c.name} onChange={(e: any) => set("name", e.target.value)} placeholder="Rahul Kapoor" /></div>
          <div className="space-y-1"><Label>Phone</Label><Input value={c.phone} onChange={(e: any) => set("phone", e.target.value)} placeholder="+91 98456 12345" /></div>
          <div className="space-y-1"><Label>Email</Label><Input value={c.email} onChange={(e: any) => set("email", e.target.value)} placeholder="customer@email.com" type="email" /></div>
          <div className="space-y-1"><Label>Company / Organization</Label><Input value={c.company} onChange={(e: any) => set("company", e.target.value)} placeholder="Optional" /></div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 2: Details ────────────────────────────────────────────────── */

function StepDetails({ form, updateForm }: { form: InvoiceFormData; updateForm: (fn: (f: InvoiceFormData) => InvoiceFormData) => void }) {
  const d = form.details;
  const set = (k: keyof typeof d, v: string) => updateForm((f) => ({ ...f, details: { ...f.details, [k]: v } }));
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
      <h2 className="font-display text-lg font-bold mb-1">Invoice Details</h2>
      <p className="text-sm text-muted-foreground mb-6">Reference, dates, and assignment.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Invoice Type *</Label>
          <Select value={d.invoiceType} onChange={(e: any) => set("invoiceType", e.target.value)} options={[
            { label: "Retail Invoice", value: "retail" }, { label: "Business Invoice", value: "business" },
          ]} />
        </div>
        <div className="space-y-1.5"><Label>Reference / PO Number</Label><Input value={d.reference} onChange={(e: any) => set("reference", e.target.value)} placeholder="CORP-1758" /></div>
        <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={d.dueDate} onChange={(e: any) => set("dueDate", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Employee</Label><Input value={d.employee} onChange={(e: any) => set("employee", e.target.value)} placeholder="Anjali R." /></div>
        <div className="space-y-1.5"><Label>Linked Ticket</Label><Input value={d.ticketId} onChange={(e: any) => set("ticketId", e.target.value)} placeholder="T-1837 (optional)" /></div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={d.status} onChange={(e: any) => set("status", e.target.value)} options={[
            { label: "Draft", value: "draft" }, { label: "Sent", value: "sent" }, { label: "Paid", value: "paid" },
            { label: "Partial", value: "partial" }, { label: "Overdue", value: "overdue" }, { label: "Cancelled", value: "cancelled" },
          ]} />
        </div>
      </div>
    </div>
  );
}

/* ─── Step 3: Products ───────────────────────────────────────────────── */

function StepProducts({ form, updateForm }: { form: InvoiceFormData; updateForm: (fn: (f: InvoiceFormData) => InvoiceFormData) => void }) {
  const addItem = () => {
    updateForm((f) => ({
      ...f,
      items: [...f.items, { id: genLineId(), name: "", qty: 1, price: 0, discount: 0, total: 0 }],
    }));
  };
  const removeItem = (id: string) => {
    updateForm((f) => ({ ...f, items: f.items.filter((i) => i.id !== id) }));
  };
  const duplicateItem = (id: string) => {
    updateForm((f) => {
      const source = f.items.find((i) => i.id === id);
      if (!source) return f;
      return { ...f, items: [...f.items, { ...source, id: genLineId() }] };
    });
  };
  const updateItem = (id: string, key: string, value: any) => {
    updateForm((f) => ({
      ...f,
      items: f.items.map((i) => {
        if (i.id !== id) return i;
        const updated = { ...i, [key]: value };
        updated.total = updated.qty * updated.price - updated.discount;
        return updated;
      }),
    }));
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display text-lg font-bold">Products & Services</h2>
          <p className="text-sm text-muted-foreground">Add line items to this invoice.</p>
        </div>
        <Button size="sm" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Add Item</Button>
      </div>

      {form.items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border p-10 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">No items yet. Click "Add Item" to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {form.items.map((item, idx) => (
            <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_80px_100px_80px_100px_auto]">
                <div className="space-y-1">
                  <Label>Item Name</Label>
                  <Input value={item.name} onChange={(e: any) => updateItem(item.id, "name", e.target.value)} placeholder="Display assembly" />
                </div>
                <div className="space-y-1">
                  <Label>Qty</Label>
                  <NumericInput value={item.qty} onChange={(v) => updateItem(item.id, "qty", v)} min={1} />
                </div>
                <div className="space-y-1">
                  <Label>Price</Label>
                  <NumericInput value={item.price} onChange={(v) => updateItem(item.id, "price", v)} />
                </div>
                <div className="space-y-1">
                  <Label>Disc.</Label>
                  <NumericInput value={item.discount} onChange={(v) => updateItem(item.id, "discount", v)} />
                </div>
                <div className="space-y-1">
                  <Label>Total</Label>
                  <div className="flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm font-semibold tabular-nums">{formatINR(item.total)}</div>
                </div>
                <div className="flex items-end gap-1">
                  <button onClick={() => duplicateItem(item.id)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted transition" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
                  <button onClick={() => removeItem(item.id)} className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 transition" title="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              {/* Optional description */}
              <div className="mt-2">
                <Input value={item.description || ""} onChange={(e: any) => updateItem(item.id, "description", e.target.value)} placeholder="Description (optional)" className="text-xs" />
              </div>
            </motion.div>
          ))}
          <Button variant="outline" size="sm" onClick={addItem} className="w-full"><Plus className="h-3.5 w-3.5" /> Add Another Item</Button>
        </div>
      )}

      {/* Running total */}
      {form.items.length > 0 && (
        <div className="mt-4 flex justify-end">
          <div className="rounded-xl bg-muted/60 px-4 py-2 text-sm">
            <span className="text-muted-foreground">Subtotal: </span>
            <span className="font-semibold tabular-nums">{formatINR(form.items.reduce((s, i) => s + i.total, 0))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Step 4: Pricing ────────────────────────────────────────────────── */

function StepPricing({ form, updateForm, totals }: { form: InvoiceFormData; updateForm: (fn: (f: InvoiceFormData) => InvoiceFormData) => void; totals: { subtotal: number; discount: number; tax: number; total: number } }) {
  const p = form.pricing;
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
      <h2 className="font-display text-lg font-bold mb-1">Pricing & Tax</h2>
      <p className="text-sm text-muted-foreground mb-6">Adjust discount and tax settings.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5"><Label>Discount (flat amount)</Label><NumericInput value={p.discount} onChange={(v) => updateForm((f) => ({ ...f, pricing: { ...f.pricing, discount: v } }))} /></div>
        <div className="space-y-1.5"><Label>Tax Rate (%)</Label><NumericInput value={p.taxRate} onChange={(v) => updateForm((f) => ({ ...f, pricing: { ...f.pricing, taxRate: v } }))} /></div>
      </div>
      {/* Summary */}
      <div className="mt-6 rounded-xl border border-border bg-gradient-to-b from-indigo-50/40 to-white p-5">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums font-medium">{formatINR(totals.subtotal)}</span></div>
          {totals.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums text-emerald-600">-{formatINR(totals.discount)}</span></div>}
          <div className="flex justify-between"><span className="text-muted-foreground">Tax ({p.taxRate}%)</span><span className="tabular-nums">{formatINR(totals.tax)}</span></div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>Total</span><span className="tabular-nums brand-gradient-text">{formatINR(totals.total)}</span></div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 5: Notes ──────────────────────────────────────────────────── */

function StepNotes({ form, updateForm }: { form: InvoiceFormData; updateForm: (fn: (f: InvoiceFormData) => InvoiceFormData) => void }) {
  const n = form.notes;
  const set = (k: keyof typeof n, v: string) => updateForm((f) => ({ ...f, notes: { ...f.notes, [k]: v } }));
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
      <h2 className="font-display text-lg font-bold mb-1">Notes & Terms</h2>
      <p className="text-sm text-muted-foreground mb-6">Add any notes, warranty terms, or branding.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2 space-y-1.5"><Label>Notes (visible to customer)</Label><Textarea value={n.notes} onChange={(e: any) => set("notes", e.target.value)} placeholder="Any additional notes…" rows={3} /></div>
        <div className="md:col-span-2 space-y-1.5"><Label>Terms & Conditions</Label><Textarea value={n.terms} onChange={(e: any) => set("terms", e.target.value)} rows={3} /></div>
        <div className="space-y-1.5"><Label>Slogan</Label><Input value={n.slogan} onChange={(e: any) => set("slogan", e.target.value)} placeholder="Your invoice slogan" /></div>
        <div className="space-y-1.5"><Label>Footer</Label><Input value={n.footer} onChange={(e: any) => set("footer", e.target.value)} placeholder="THANK YOU FOR CHOOSING…" /></div>
      </div>
    </div>
  );
}

/* ─── Step 6: Review ─────────────────────────────────────────────────── */

function StepReview({ form, totals, onSubmit, isEdit }: { form: InvoiceFormData; totals: { subtotal: number; discount: number; tax: number; total: number }; onSubmit: () => void; isEdit: boolean }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
        <h2 className="font-display text-lg font-bold mb-4">Review Invoice</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Customer summary */}
          <div className="rounded-xl border border-border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Customer</p>
            <p className="font-semibold">{form.customer.name || "—"}</p>
            <p className="text-xs text-muted-foreground">{form.customer.phone}</p>
            {form.customer.company && <p className="text-xs text-muted-foreground">{form.customer.company}</p>}
          </div>
          {/* Details summary */}
          <div className="rounded-xl border border-border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Details</p>
            <p className="text-sm"><span className="text-muted-foreground">Ref:</span> {form.details.reference || "Auto-generated"}</p>
            <p className="text-sm"><span className="text-muted-foreground">Due:</span> {form.details.dueDate || "7 days from now"}</p>
            <p className="text-sm"><span className="text-muted-foreground">Status:</span> {form.details.status}</p>
          </div>
        </div>

        {/* Items */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Line Items ({form.items.length})</p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="py-2 text-center w-14">Qty</th>
                  <th className="py-2 text-right w-20">Price</th>
                  <th className="py-2 text-right w-20 pr-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{item.name || "Unnamed item"}</td>
                    <td className="py-2 text-center tabular-nums">{item.qty}</td>
                    <td className="py-2 text-right tabular-nums">{formatINR(item.price)}</td>
                    <td className="py-2 text-right tabular-nums pr-3 font-medium">{formatINR(item.total)}</td>
                  </tr>
                ))}
                {form.items.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No items</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-xs rounded-xl border border-border p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatINR(totals.subtotal)}</span></div>
            {totals.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums text-emerald-600">-{formatINR(totals.discount)}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{formatINR(totals.tax)}</span></div>
            <div className="flex justify-between border-t border-border pt-2 font-bold"><span>Total</span><span className="tabular-nums">{formatINR(totals.total)}</span></div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="lg" onClick={onSubmit}>
          <Save className="h-4 w-4" /> {isEdit ? "Save Invoice" : "Create Invoice"}
        </Button>
      </div>
    </div>
  );
}

/* ─── Step 7: Completion ─────────────────────────────────────────────── */

function CompletionScreen({ isEdit, invoiceId, onDone }: { isEdit: boolean; invoiceId: string; onDone: () => void }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-white via-indigo-50/30 to-white">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-20" />
      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-10 text-center">
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 18 }} className="grid h-20 w-20 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.5)]">
          <Check className="h-10 w-10" />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="font-display mt-6 text-3xl font-extrabold tracking-tight">
          {isEdit ? "Invoice Updated" : "Invoice Created"}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mt-2 text-sm text-muted-foreground">
          {isEdit ? `Invoice ${invoiceId} has been updated successfully.` : "Your invoice has been created and is ready to send."}
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="mt-8 flex gap-3">
          <Button variant="outline" size="lg" onClick={onDone}>Back to Invoices</Button>
          <Button size="lg" onClick={onDone}><ArrowRight className="h-4 w-4" /> View Invoice</Button>
        </motion.div>
      </div>
    </div>
  );
}
