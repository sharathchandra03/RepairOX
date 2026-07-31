"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight, ArrowLeft, Check, Plus, Trash2, Copy, Save,
  User, FileText, Package, IndianRupee, StickyNote, ClipboardCheck, Sparkles, X, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select, NumericInput } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreationSuccess } from "@/components/ui/creation-success";
import { CompletionScreen } from "@/components/completion/completion-screen";
import { useStore } from "@/lib/store";
import { cn, formatINR } from "@/lib/utils";
import type { Invoice, InvoiceLineItem, InvoiceStatus, InvoiceType, InvoiceDeviceRecord } from "@/lib/mock-data";
import { createInvoiceDeviceRecord } from "@/lib/mock-data";
import { DeviceBrandModelSelector } from "@/components/common/device-brand-model-selector";
import type { InventoryItem } from "@/lib/inventory-data";

/* ─── Step Definitions ───────────────────────────────────────────────── */

const STEPS = [
  { id: 1, label: "Customer", icon: User },
  { id: 2, label: "Details", icon: FileText },
  { id: 3, label: "Products", icon: Package },
  { id: 4, label: "Pricing", icon: IndianRupee },
  { id: 5, label: "Notes", icon: StickyNote },
  { id: 6, label: "Review", icon: ClipboardCheck },
  { id: 7, label: "Complete", icon: Sparkles },
];

/* ─── Form Data Type ─────────────────────────────────────────────────── */

/** A device entry within the invoice form */
type InvoiceFormDevice = {
  id: string;
  brand: string;
  model: string;
  imei: string;
  imeiType: string;
  issue: string;
  description: string;
  jobType: string;
  priority: string;
  warranty: string;
  technician: string;
  notes: string;
  parts: InvoiceLineItem[];
};

type InvoiceFormData = {
  customer: { name: string; phone: string; email: string; company: string };
  details: { reference: string; dueDate: string; employee: string; ticketId: string; status: InvoiceStatus; invoiceType: InvoiceType; serviceCategory: "service" | "accessories" };
  /** Flat items — used when no devices are present (legacy mode) */
  items: InvoiceLineItem[];
  /** Multi-device entries */
  devices: InvoiceFormDevice[];
  /** Index of the active device being edited */
  activeDeviceIndex: number;
  pricing: { discount: number; taxRate: number; paymentMode: string };
  notes: { notes: string; terms: string; slogan: string; footer: string };
};

function createFormDevice(overrides?: Partial<InvoiceFormDevice>): InvoiceFormDevice {
  return {
    id: `ifd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    brand: "",
    model: "",
    imei: "",
    imeiType: "imei1",
    issue: "",
    description: "",
    jobType: "service",
    priority: "normal",
    warranty: "",
    technician: "",
    notes: "",
    parts: [],
    ...overrides,
  };
}

const DEFAULT_FORM: InvoiceFormData = {
  customer: { name: "", phone: "", email: "", company: "" },
  details: { reference: "", dueDate: "", employee: "", ticketId: "", status: "draft", invoiceType: "retail", serviceCategory: "service" },
  items: [],
  devices: [createFormDevice()],
  activeDeviceIndex: 0,
  pricing: { discount: 0, taxRate: 18, paymentMode: "" },
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
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState("");

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
      const company = searchParams.get("company") || "";
      const employee = searchParams.get("employee") || "";
      const devicesRaw = searchParams.get("devices");

      let formDevices: InvoiceFormDevice[] = [];
      let flatItems: InvoiceLineItem[] = [];

      // Parse multi-device data from ticket
      if (devicesRaw) {
        try {
          const parsed = JSON.parse(devicesRaw);
          formDevices = parsed.map((dev: any, idx: number) => {
            const parts: InvoiceLineItem[] = (dev.parts || []).map((p: any, pi: number) => ({
              id: `li-${Date.now()}-${idx}-${pi}`,
              name: p.name,
              sku: p.sku || "",
              description: "",
              qty: p.qty || 1,
              price: p.unitPrice || p.price || 0,
              discount: 0,
              total: p.total || ((p.qty || 1) * (p.unitPrice || p.price || 0)),
            }));

            // Add service/labour line if estimate exceeds parts total
            const partsTotal = parts.reduce((s, p2) => s + p2.total, 0);
            const labourAmount = (dev.estimate || 0) - partsTotal;
            if (labourAmount > 0 || parts.length === 0) {
              parts.push({
                id: `li-${Date.now()}-${idx}-labour`,
                name: dev.issue || "Repair Service",
                description: [dev.brand, dev.model].filter(Boolean).join(" "),
                qty: 1,
                price: Math.max(labourAmount, dev.estimate || 0),
                discount: 0,
                total: Math.max(labourAmount, dev.estimate || 0),
              });
            }

            return createFormDevice({
              brand: dev.brand || "",
              model: dev.model || "",
              imei: dev.imei || "",
              imeiType: dev.imeiType || "imei1",
              issue: dev.issue || "",
              description: dev.description || "",
              jobType: dev.jobType || "service",
              priority: dev.priority || "normal",
              warranty: dev.warranty || "",
              technician: dev.technician || "",
              notes: dev.notes || "",
              parts,
            });
          });

          // Build flat items from all devices for totals
          flatItems = formDevices.flatMap((d) => d.parts);
        } catch { /* ignore parse errors */ }
      }

      // Fallback: if no devices data, use legacy amount/service params
      if (formDevices.length === 0) {
        const amount = parseFloat(searchParams.get("amount") || "0");
        const service = searchParams.get("service") || "";
        const device = searchParams.get("device") || "";
        const brand = searchParams.get("brand") || "";
        const serial = searchParams.get("serial") || "";

        if (amount > 0) {
          const parts: InvoiceLineItem[] = [{
            id: `li-${Date.now()}`,
            name: service || "Repair Service",
            description: [brand, device, serial ? `SN: ${serial}` : ""].filter(Boolean).join(" — "),
            qty: 1,
            price: amount,
            discount: 0,
            total: amount,
          }];
          formDevices = [createFormDevice({ brand, model: device, imei: serial, issue: service, parts })];
          flatItems = parts;
        }
      }

      setForm((prev) => ({
        ...prev,
        customer: { name: customer, phone, email, company },
        details: { ...prev.details, ticketId: fromTicket, employee, status: "draft" },
        items: flatItems,
        devices: formDevices.length > 0 ? formDevices : prev.devices,
        activeDeviceIndex: 0,
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

  // Computed totals — derive from devices or flat items
  const totals = useMemo(() => {
    const allItems = form.devices.length > 0
      ? form.devices.flatMap((d) => d.parts)
      : form.items;
    const subtotal = allItems.reduce((s, item) => s + item.total, 0);
    const discount = form.pricing.discount;
    const taxable = subtotal - discount;
    const tax = Math.round(taxable * (form.pricing.taxRate / 100));
    const total = taxable + tax;
    return { subtotal, discount, tax, total };
  }, [form.devices, form.items, form.pricing]);

  // Submit
  const handleSubmit = useCallback(() => {
    // Build invoice device records for storage
    const hasDevices = form.devices.length > 0 && form.devices.some((d) => d.brand || d.model || d.parts.length > 0);
    const invoiceDevices: InvoiceDeviceRecord[] = hasDevices ? form.devices.map((d) => ({
      id: d.id,
      brand: d.brand,
      model: d.model,
      imei: d.imei,
      imeiType: d.imeiType as "imei1" | "imei2" | "serial",
      issue: d.issue,
      description: d.description,
      jobType: d.jobType,
      priority: d.priority,
      warranty: d.warranty,
      technician: d.technician,
      parts: d.parts,
      notes: d.notes,
      subtotal: d.parts.reduce((s, p) => s + p.total, 0),
    })) : [];

    // Flat items = all parts from all devices (for backward compat and totals)
    const allItems = hasDevices ? form.devices.flatMap((d) => d.parts) : form.items;

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
      items: allItems,
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
      paymentMode: form.pricing.paymentMode || undefined,
      serviceCategory: form.details.serviceCategory || "service",
      devices: invoiceDevices.length > 0 ? invoiceDevices : undefined,
    };

    if (isEdit) {
      updateInvoice(editId!, invoice);
    } else {
      addInvoice(invoice);
    }
    setCreatedInvoiceId(invoice.id);
    setDirty(false);
    if (isEdit) {
      router.push("/invoice");
    } else {
      setShowSuccessAnimation(true);
    }
  }, [form, totals, editId, isEdit, invoices, addInvoice, updateInvoice]);

  // Step navigation
  const goNext = () => setStep((s) => Math.min(s + 1, 6));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));
  const goToStep = (s: number) => { if (s <= step || s <= maxReached) setStep(s); };
  const maxReached = step;

  if (showSuccessAnimation && !isEdit) {
    return (
      <CreationSuccess
        type="invoice"
        id={createdInvoiceId}
        onComplete={() => {
          setShowSuccessAnimation(false);
          setShowCompletion(true);
        }}
      />
    );
  }

  if (showCompletion && !isEdit) {
    return (
      <CompletionScreen
        type="invoice"
        id={createdInvoiceId}
        onBack={() => router.push("/invoice")}
        onView={() => router.push(`/invoice/${createdInvoiceId}`)}
      />
    );
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
  // Restore devices if available, otherwise create a single device from flat items
  const devices: InvoiceFormDevice[] = inv.devices && inv.devices.length > 0
    ? inv.devices.map((d) => createFormDevice({
        id: d.id,
        brand: d.brand,
        model: d.model,
        imei: d.imei,
        imeiType: d.imeiType,
        issue: d.issue,
        description: d.description,
        jobType: d.jobType,
        priority: d.priority,
        warranty: d.warranty,
        technician: d.technician,
        notes: d.notes,
        parts: d.parts,
      }))
    : [createFormDevice({ technician: inv.employee || "", parts: inv.items })];

  return {
    customer: { name: inv.customer, phone: inv.phone, email: inv.email || "", company: inv.company || "" },
    details: { reference: inv.reference, dueDate: inv.dueDate?.slice(0, 10) || "", employee: inv.employee || "", ticketId: inv.ticketId || "", status: inv.status, invoiceType: inv.invoiceType || "retail", serviceCategory: inv.serviceCategory || "service" },
    items: inv.items,
    devices,
    activeDeviceIndex: 0,
    pricing: { discount: inv.discount, taxRate: inv.tax > 0 && inv.subtotal > 0 ? Math.round((inv.tax / (inv.subtotal - inv.discount)) * 100) : 18, paymentMode: inv.paymentMode || "" },
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
        <div className="space-y-1.5">
          <Label>Service / Accessories</Label>
          <Select value={d.serviceCategory} onChange={(e: any) => set("serviceCategory", e.target.value)} options={[
            { label: "Service", value: "service" }, { label: "Accessories", value: "accessories" },
          ]} />
        </div>
        <div className="space-y-1.5"><Label>Reference/Invoice Number</Label><Input value={d.reference} onChange={(e: any) => set("reference", e.target.value)} placeholder="CORP-1758" /></div>
        <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={d.dueDate} onChange={(e: any) => set("dueDate", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Employee</Label><Input value={d.employee} onChange={(e: any) => set("employee", e.target.value)} placeholder="Anjali R." /></div>
        <div className="space-y-1.5"><Label>Linked Ticket</Label><Input value={d.ticketId} onChange={(e: any) => set("ticketId", e.target.value)} placeholder="T-1837 (optional)" /></div>
      </div>
    </div>
  );
}

/* ─── Inventory Search Box (reuses ticket inventory search pattern) ──── */

function InventorySearchBox({ onSelect, onClose }: { onSelect: (item: InventoryItem) => void; onClose: () => void }) {
  const { inventory } = useStore();
  const [q, setQ] = useState("");

  const results = q.trim().length >= 2
    ? inventory.filter((item) => {
        const query = q.toLowerCase();
        return item.active && (item.name.toLowerCase().includes(query) || item.id.toLowerCase().includes(query) || item.category.toLowerCase().includes(query));
      }).slice(0, 8)
    : [];

  return (
    <div className="rounded-xl border border-[#4361EE]/30 bg-[#EEF1FD]/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Search className="h-4 w-4 text-[#4361EE]" />
        <Input value={q} onChange={(e: any) => setQ(e.target.value)} placeholder="Search inventory by name, SKU, or category…" autoFocus className="flex-1" />
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted transition"><X className="h-4 w-4" /></button>
      </div>
      {results.length > 0 && (
        <div className="max-h-[220px] overflow-y-auto rounded-lg border border-border bg-card">
          {results.map((item) => {
            const available = item.currentStock - (item.reservedStock || 0);
            return (
              <button key={item.id} type="button" onClick={() => onSelect(item)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition border-b border-border last:border-0 hover:bg-indigo-50/50">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Package className="h-3.5 w-3.5" /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">{item.id} · {item.category}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums">{formatINR(item.regularSellingPrice)}</p>
                  <span className="text-[10px] text-muted-foreground">Stock: {available}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {q.trim().length >= 2 && results.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-3">No inventory items match "{q}"</p>
      )}
    </div>
  );
}

/* ─── Step 3: Devices & Products (Multi-Device) ──────────────────────── */

function StepProducts({ form, updateForm }: { form: InvoiceFormData; updateForm: (fn: (f: InvoiceFormData) => InvoiceFormData) => void }) {
  const activeIdx = form.activeDeviceIndex;
  const activeDevice = form.devices[activeIdx] || form.devices[0];
  const [showInventorySearch, setShowInventorySearch] = useState(false);

  const switchDevice = (idx: number) => updateForm((f) => ({ ...f, activeDeviceIndex: idx }));

  const addDevice = () => {
    updateForm((f) => ({
      ...f,
      devices: [...f.devices, createFormDevice()],
      activeDeviceIndex: f.devices.length,
    }));
  };

  const removeDevice = (idx: number) => {
    if (form.devices.length <= 1) return;
    updateForm((f) => {
      const updated = f.devices.filter((_, i) => i !== idx);
      const newIdx = f.activeDeviceIndex >= updated.length ? updated.length - 1 : f.activeDeviceIndex > idx ? f.activeDeviceIndex - 1 : f.activeDeviceIndex;
      return { ...f, devices: updated, activeDeviceIndex: newIdx };
    });
  };

  const setDeviceField = (key: string, value: string) => {
    updateForm((f) => ({
      ...f,
      devices: f.devices.map((d, i) => i === activeIdx ? { ...d, [key]: value } : d),
    }));
  };

  const addPart = () => {
    updateForm((f) => ({
      ...f,
      devices: f.devices.map((d, i) => i === activeIdx
        ? { ...d, parts: [...d.parts, { id: genLineId(), name: "", qty: 1, price: 0, discount: 0, total: 0 }] }
        : d
      ),
    }));
  };

  const removePart = (partId: string) => {
    updateForm((f) => ({
      ...f,
      devices: f.devices.map((d, i) => i === activeIdx
        ? { ...d, parts: d.parts.filter((p) => p.id !== partId) }
        : d
      ),
    }));
  };

  const updatePart = (partId: string, key: string, value: any) => {
    updateForm((f) => ({
      ...f,
      devices: f.devices.map((d, i) => {
        if (i !== activeIdx) return d;
        return {
          ...d,
          parts: d.parts.map((p) => {
            if (p.id !== partId) return p;
            const updated = { ...p, [key]: value };
            updated.total = updated.qty * updated.price;
            updated.discount = 0;
            return updated;
          }),
        };
      }),
    }));
  };

  const deviceSubtotal = activeDevice.parts.reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-4">
      {/* Device Tabs */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="border-b border-border px-6 py-3 sm:px-8">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Devices ({form.devices.length})</p>
            <Button size="sm" onClick={addDevice}><Plus className="h-3.5 w-3.5" /> Add Device</Button>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {form.devices.map((dev, idx) => {
              const label = [dev.brand, dev.model].filter(Boolean).join(" ") || `Device ${idx + 1}`;
              const isActive = idx === activeIdx;
              return (
                <div key={dev.id} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => switchDevice(idx)}
                    className={cn(
                      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-all",
                      isActive
                        ? "bg-[#4361EE] text-white shadow-sm"
                        : "bg-white border border-border text-muted-foreground hover:border-[#B3BFF6] hover:text-foreground"
                    )}
                  >
                    <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold", isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground")}>{idx + 1}</span>
                    <span className="max-w-[100px] truncate">{label}</span>
                  </button>
                  {form.devices.length > 1 && (
                    <button type="button" onClick={() => removeDevice(idx)} className="grid h-5 w-5 place-items-center rounded-full text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Device Form */}
        <div className="px-6 py-5 sm:px-8 space-y-5">
          {/* Device Details */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Device Details</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <DeviceBrandModelSelector
                brand={activeDevice.brand}
                model={activeDevice.model}
                onBrandChange={(v) => setDeviceField("brand", v)}
                onModelChange={(v) => setDeviceField("model", v)}
              />
              <div className="space-y-1"><Label>IMEI / Serial</Label><Input value={activeDevice.imei} onChange={(e: any) => setDeviceField("imei", e.target.value)} placeholder="356xxxxxxxxxx" className="font-mono" /></div>
            </div>
          </div>

          {/* Job Details */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Job Details</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1"><Label>Issue</Label><Input value={activeDevice.issue} onChange={(e: any) => setDeviceField("issue", e.target.value)} placeholder="Display replacement" /></div>
              <div className="space-y-1">
                <Label>Job Type</Label>
                <Select value={activeDevice.jobType} onChange={(e: any) => setDeviceField("jobType", e.target.value)} options={[
                  { label: "Service", value: "service" }, { label: "Warranty", value: "warranty" }, { label: "Estimate", value: "estimate" },
                ]} />
              </div>
              <div className="space-y-1"><Label>Technician</Label><Input value={activeDevice.technician} onChange={(e: any) => setDeviceField("technician", e.target.value)} placeholder="Anand" /></div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={activeDevice.priority} onChange={(e: any) => setDeviceField("priority", e.target.value)} options={[
                  { label: "Normal", value: "normal" }, { label: "High", value: "high" }, { label: "Critical", value: "critical" },
                ]} />
              </div>
              <div className="space-y-1">
                <Label>Warranty</Label>
                <Select value={activeDevice.warranty} onChange={(e: any) => setDeviceField("warranty", e.target.value)} options={[
                  { label: "None", value: "" }, { label: "In Warranty", value: "in-warranty" }, { label: "Out of Warranty", value: "out-warranty" },
                ]} />
              </div>
              <div className="space-y-1"><Label>Notes</Label><Input value={activeDevice.notes} onChange={(e: any) => setDeviceField("notes", e.target.value)} placeholder="Optional notes" /></div>
            </div>
          </div>

          {/* Parts for this device */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Parts & Services</p>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setShowInventorySearch(true)}><Search className="h-3.5 w-3.5" /> Search Item</Button>
                <Button size="sm" onClick={addPart}><Plus className="h-3.5 w-3.5" /> Add Item</Button>
              </div>
            </div>

            {/* Inventory Search Dropdown */}
            {showInventorySearch && (
              <div className="mb-3">
                <InventorySearchBox
                  onSelect={(item) => {
                    updateForm((f) => ({
                      ...f,
                      devices: f.devices.map((d, i) => i === activeIdx
                        ? { ...d, parts: [...d.parts, { id: genLineId(), name: item.name, sku: item.id, qty: 1, price: item.regularSellingPrice, discount: 0, total: item.regularSellingPrice, description: item.category }] }
                        : d
                      ),
                    }));
                    setShowInventorySearch(false);
                  }}
                  onClose={() => setShowInventorySearch(false)}
                />
              </div>
            )}

            {/* Always-visible item entry row */}
            {activeDevice.parts.length === 0 && !showInventorySearch && (
              <div className="rounded-xl border border-border p-3 mb-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_70px_90px_90px_auto]">
                  <div className="space-y-1"><Label>Item</Label><Input value="" onChange={() => addPart()} onFocus={() => addPart()} placeholder="Click to add an item…" /></div>
                  <div className="space-y-1"><Label>Qty</Label><div className="flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm text-muted-foreground">1</div></div>
                  <div className="space-y-1"><Label>Price</Label><div className="flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm text-muted-foreground">₹0</div></div>
                  <div className="space-y-1"><Label>Total</Label><div className="flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm text-muted-foreground">₹0</div></div>
                  <div className="flex items-end"><div className="h-9 w-9" /></div>
                </div>
              </div>
            )}

            {activeDevice.parts.length > 0 && (
              <div className="space-y-2">
                {activeDevice.parts.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border p-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_70px_90px_90px_auto]">
                      <div className="space-y-1"><Label>Item</Label><Input value={item.name} onChange={(e: any) => updatePart(item.id, "name", e.target.value)} placeholder="Display assembly" /></div>
                      <div className="space-y-1"><Label>Qty</Label><NumericInput value={item.qty} onChange={(v) => updatePart(item.id, "qty", v)} min={1} /></div>
                      <div className="space-y-1"><Label>Price</Label><NumericInput value={item.price} onChange={(v) => updatePart(item.id, "price", v)} /></div>
                      <div className="space-y-1"><Label>Total</Label><div className="flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm font-semibold tabular-nums">{formatINR(item.total)}</div></div>
                      <div className="flex items-end"><button onClick={() => removePart(item.id)} className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 transition"><Trash2 className="h-3.5 w-3.5" /></button></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeDevice.parts.length > 0 && (
              <div className="mt-3 flex justify-end">
                <div className="rounded-xl bg-muted/60 px-4 py-2 text-sm">
                  <span className="text-muted-foreground">Device Subtotal: </span>
                  <span className="font-semibold tabular-nums">{formatINR(deviceSubtotal)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 4: Pricing ────────────────────────────────────────────────── */

function StepPricing({ form, updateForm, totals }: { form: InvoiceFormData; updateForm: (fn: (f: InvoiceFormData) => InvoiceFormData) => void; totals: { subtotal: number; discount: number; tax: number; total: number } }) {
  const p = form.pricing;
  const d = form.details;
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
      <h2 className="font-display text-lg font-bold mb-1">Pricing & Payment</h2>
      <p className="text-sm text-muted-foreground mb-6">Discount, tax, payment mode, and status.</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Mode of Payment</Label>
          <Select value={p.paymentMode} onChange={(e: any) => updateForm((f) => ({ ...f, pricing: { ...f.pricing, paymentMode: e.target.value } }))} options={[
            { label: "Select payment mode…", value: "" },
            { label: "Cash", value: "cash" },
            { label: "UPI", value: "upi" },
            { label: "Bank Transfer", value: "bank_transfer" },
            { label: "Card", value: "card" },
            { label: "Cheque", value: "cheque" },
            { label: "Wallet", value: "wallet" },
            { label: "Other", value: "other" },
          ]} />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={d.status} onChange={(e: any) => updateForm((f) => ({ ...f, details: { ...f.details, status: e.target.value } }))} options={[
            { label: "Draft", value: "draft" }, { label: "Sent", value: "sent" }, { label: "Paid", value: "paid" },
            { label: "Partial", value: "partial" }, { label: "Overdue", value: "overdue" }, { label: "Cancelled", value: "cancelled" },
          ]} />
        </div>
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
  const hasDevices = form.devices.length > 0 && form.devices.some((d) => d.brand || d.model || d.parts.length > 0);
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

        {/* Devices Breakdown */}
        {hasDevices && (
          <div className="mt-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Devices ({form.devices.length})</p>
            {form.devices.map((dev, idx) => {
              const devLabel = [dev.brand, dev.model].filter(Boolean).join(" ") || `Device ${idx + 1}`;
              const devTotal = dev.parts.reduce((s, p) => s + p.total, 0);
              return (
                <div key={dev.id} className="rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center justify-between bg-muted/40 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="grid h-5 w-5 place-items-center rounded bg-[#4361EE] text-[9px] font-bold text-white">{idx + 1}</span>
                      <span className="text-sm font-semibold">{devLabel}</span>
                      {dev.imei && <span className="text-[10px] text-muted-foreground font-mono ml-2">{dev.imei}</span>}
                    </div>
                    <span className="text-sm font-bold tabular-nums">{formatINR(devTotal)}</span>
                  </div>
                  {dev.issue && (
                    <div className="px-4 py-1.5 text-[11px] text-muted-foreground border-b border-border bg-muted/20">
                      <span className="font-medium">Issue:</span> {dev.issue} {dev.technician && <> · <span className="font-medium">Tech:</span> {dev.technician}</>}
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-1.5 text-left">Item</th>
                        <th className="py-1.5 text-center w-14">Qty</th>
                        <th className="py-1.5 text-right w-20">Price</th>
                        <th className="py-1.5 text-right w-20 pr-3">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dev.parts.map((item) => (
                        <tr key={item.id} className="border-t border-border">
                          <td className="px-3 py-1.5 font-medium">{item.name || "Unnamed"}</td>
                          <td className="py-1.5 text-center tabular-nums">{item.qty}</td>
                          <td className="py-1.5 text-right tabular-nums">{formatINR(item.price)}</td>
                          <td className="py-1.5 text-right tabular-nums font-medium pr-3">{formatINR(item.total)}</td>
                        </tr>
                      ))}
                      {dev.parts.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-center text-muted-foreground text-xs">No parts</td></tr>}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}

        {/* Legacy flat items (no devices) */}
        {!hasDevices && (
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
        )}

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


