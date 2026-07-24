"use client";

import { useState, useEffect, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight, Camera, Image as ImageIcon, FileSignature, ShieldCheck,
  CheckCircle2, Check, XCircle, MinusCircle, Mail, Phone, MessageCircle,
  Printer, FileText, Plus, Search, User, Building2, Sparkles, ListPlus,
  Upload, ArrowLeft, RotateCcw, Trash2, Package, AlertTriangle, Minus,
  Shield, ChevronDown, ChevronUp, StickyNote, CircleDot, ClipboardList,
} from "lucide-react";
import { WizardShell } from "@/components/wizard/wizard-shell";
import { OptionGrid } from "@/components/wizard/option-grid";
import { CategoryWheel } from "@/components/wizard/category-wheel";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { cn, formatINR } from "@/lib/utils";
import type { Ticket, TicketStatus } from "@/lib/mock-data";
import type { InventoryItem } from "@/lib/inventory-data";
import { searchCustomers, createCustomer, type Customer } from "@/lib/customer-data";
import { searchBrands, searchModels, getModelsForBrand, createBrand, createDeviceModel, type Brand, type DeviceModel } from "@/lib/brand-model-data";

/* Wrap the page in Suspense to support useSearchParams during static generation */
export default function NewTicketPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center"><div className="h-8 w-8 rounded-full border-2 border-[#4361EE] border-r-transparent animate-spin" /></div>}>
      <NewTicketWizard />
    </Suspense>
  );
}

/* ---------------- Step content data ---------------- */

const PROCESSES = [
  { id: "ticket", label: "New Ticket", emoji: "🧰", desc: "Repair job intake" },
  { id: "invoice", label: "New Invoice", emoji: "🧾", desc: "Bill on the spot" },
  { id: "stock", label: "Add Stock", emoji: "📦", desc: "Inbound inventory" },
  { id: "walkin", label: "Walk-In", emoji: "🏪", desc: "Counter customer" },
  { id: "estimate", label: "Estimate", emoji: "💵", desc: "Send a quote" },
  { id: "warranty", label: "Warranty", emoji: "🛡️", desc: "Claim or check" },
];

const CATEGORIES = [
  { id: "iphone", label: "iPhone", emoji: "📱" },
  { id: "macbook", label: "MacBook", emoji: "💻" },
  { id: "ipad", label: "iPad", emoji: "📲" },
  { id: "iwatch", label: "iWatch", emoji: "⌚" },
  { id: "imac", label: "iMac", emoji: "🖥️" },
  { id: "android", label: "Android", emoji: "📱" },
  { id: "windows", label: "Windows", emoji: "💻" },
  { id: "others", label: "Others", emoji: "🧩" },
];

const QC_FIELDS = [
  "Physical Condition", "Display", "Touch Panel", "Back Glass",
  "Display Sensor", "Touch ID / Face ID", "Receiver", "Speaker",
  "Microphone", "Battery Health", "Front Camera", "Back Camera",
  "Charging Port", "Volume Keys", "Power Key", "Bluetooth / WiFi",
  "Network", "Vibration",
];

const QC_GROUPS = [
  { id: "exterior", label: "Exterior Condition", items: ["Physical Condition", "Back Glass"] },
  { id: "display", label: "Display & Touch", items: ["Display", "Touch Panel", "Display Sensor"] },
  { id: "audio", label: "Audio", items: ["Receiver", "Speaker", "Microphone"] },
  { id: "camera", label: "Camera", items: ["Front Camera", "Back Camera"] },
  { id: "battery", label: "Battery", items: ["Battery Health"] },
  { id: "connectivity", label: "Connectivity", items: ["Bluetooth / WiFi", "Network", "Charging Port"] },
  { id: "buttons", label: "Buttons & Biometrics", items: ["Touch ID / Face ID", "Volume Keys", "Power Key", "Vibration"] },
];

/* ---------------- Types ---------------- */

type WizardData = {
  process?: string;
  category?: string;
  device: { brand: string; model: string; imei: string; imeiType: string; assignedBy: string; assignedTo: string; source: string; type: string };
  job: { jobType: string; estimate: string; warranty: string; issue: string; priority: string; resolutionMinutes: string; accessories: string; description: string; notes: string };
  parts: { inventoryId: string; name: string; sku: string; qty: number; unitPrice: number; total: number; uom: string }[];
  contactType: "personal" | "business";
  customer: { first: string; last: string; phone: string; email: string; address: string; postal: string; city: string; company: string };
  customerId: string | null;
  qc: Record<string, "ok" | "no" | "na" | undefined>;
  files: string[];
  signatureCleared: boolean;
};

const DEFAULT: WizardData = {
  device: { brand: "", model: "", imei: "", imeiType: "imei1", assignedBy: "", assignedTo: "", source: "", type: "" },
  job: { jobType: "service", estimate: "", warranty: "", issue: "", priority: "normal", resolutionMinutes: "", accessories: "", description: "", notes: "" },
  parts: [],
  contactType: "personal",
  customer: { first: "", last: "", phone: "", email: "", address: "", postal: "", city: "", company: "" },
  customerId: null,
  qc: {},
  files: [],
  signatureCleared: false,
};

/* ---------------- Helper: map existing ticket to wizard data ---------------- */

function ticketToWizard(t: Ticket): WizardData {
  const nameParts = t.customer.split(" ");
  const first = nameParts[0] || "";
  const last = nameParts.slice(1).join(" ");
  const category = t.device?.toLowerCase() || "others";

  // Parse address back into components (stored as "address, city, postal")
  const addressParts = (t.address || "").split(", ");
  const address = addressParts[0] || "";
  const city = addressParts[1] || "";
  const postal = addressParts[2] || "";

  return {
    process: "ticket",
    category,
    device: {
      brand: t.device || "",
      model: t.model,
      imei: t.items?.[0]?.serial || "",
      imeiType: t.imeiType || "imei1",
      assignedBy: "",
      assignedTo: t.technician?.toLowerCase() || "",
      source: t.source || "",
      type: "",
    },
    job: {
      jobType: "service",
      estimate: String(t.amount || 0),
      warranty: "",
      issue: t.issue,
      priority: t.priority || "normal",
      resolutionMinutes: t.resolutionMinutes ? String(t.resolutionMinutes) : "",
      accessories: "",
      description: t.issue,
      notes: t.internalNotes || "",
    },
    parts: t.parts ? t.parts.map((p) => ({ inventoryId: p.inventoryId, name: p.name, sku: p.sku, qty: p.qty, unitPrice: p.unitPrice, total: p.total, uom: p.uom })) : [],
    contactType: t.company ? "business" : "personal",
    customer: { first, last, phone: t.phone || "", email: t.email || "", address, postal, city, company: t.company || "" },
    customerId: (t as any).customerId || null,
    qc: {},
    files: [],
    signatureCleared: false,
  };
}

/* ---------------- Helper: generate ticket ID ---------------- */
function genId(): string {
  return `T-${Math.floor(1000 + Math.random() * 9000)}`;
}

/* ---------------- Main Component ---------------- */

function NewTicketWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { tickets, addTicket, updateTicket, updateInventoryItem, inventory, customers, addCustomer, updateCustomer } = useStore();

  const [step, setStep] = useState(editId ? 3 : 1);
  const [data, setData] = useState<WizardData>(DEFAULT);
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const isEdit = !!editId;

  // Pre-fill data when editing
  useEffect(() => {
    if (editId) {
      const existing = tickets.find((t) => t.id === editId);
      if (existing) {
        setData(ticketToWizard(existing));
      }
    }
  }, [editId, tickets]);

  // Track dirty state on data change (skip initial load)
  const [initialLoaded, setInitialLoaded] = useState(false);
  useEffect(() => {
    if (initialLoaded) setDirty(true);
    else setInitialLoaded(true);
  }, [data]);

  const next = () => setStep((s) => Math.min(s + 1, 11));
  const back = () => {
    if (step === 1) {
      attemptNav("/tickets");
    } else {
      setStep((s) => Math.max(1, s - 1));
    }
  };

  const attemptNav = (path: string) => {
    if (isEdit && dirty) {
      setPendingNav(path);
      setShowLeaveDialog(true);
    } else {
      router.push(path);
    }
  };

  const handleSave = () => {
    const customerName = `${data.customer.first} ${data.customer.last}`.trim() || "Walk-in Customer";
    const resMinutes = Number(data.job.resolutionMinutes) || 59;
    const createdAt = isEdit ? (tickets.find((t) => t.id === editId)?.createdAt || new Date().toISOString()) : new Date().toISOString();
    const dueDate = new Date(new Date(createdAt).getTime() + resMinutes * 60_000).toISOString();

    // If no existing customer was selected and we have customer details, save as new customer
    let finalCustomerId = data.customerId;
    if (!finalCustomerId && data.customer.first && data.customer.phone) {
      const newCustomer = createCustomer({
        type: data.contactType,
        firstName: data.customer.first.trim(),
        lastName: data.customer.last.trim(),
        mobile: data.customer.phone.trim(),
        email: data.customer.email.trim(),
        company: data.customer.company.trim(),
        address: data.customer.address.trim(),
        city: data.customer.city.trim(),
        postalCode: data.customer.postal.trim(),
      });
      addCustomer(newCustomer);
      finalCustomerId = newCustomer.id;
    }

    const ticketData: Ticket = {
      id: editId || genId(),
      customer: customerName,
      phone: data.customer.phone || "+91 00000 00000",
      email: data.customer.email || undefined,
      address: [data.customer.address, data.customer.city, data.customer.postal].filter(Boolean).join(", ") || undefined,
      company: data.customer.company || undefined,
      device: data.device.brand || data.category || "others",
      model: data.device.model || "Unknown Device",
      issue: data.job.issue || data.job.description || "General service",
      items: data.device.imei ? [{ device: data.device.brand || data.category || "others", model: data.device.model || "Unknown Device", serial: data.device.imei, issue: data.job.issue || "General service", service: data.job.issue || "Repair" }] : undefined,
      parts: data.parts.length > 0 ? data.parts.map((p) => ({ ...p, status: "planned" as const })) : undefined,
      status: (isEdit ? (tickets.find((t) => t.id === editId)?.status || "received") : "received") as TicketStatus,
      priority: (data.job.priority as any) || "normal",
      technician: data.device.assignedTo || "Unassigned",
      createdAt,
      dueDate,
      resolutionMinutes: resMinutes,
      amount: Number(data.job.estimate) || data.parts.reduce((s, p) => s + p.total, 0) || 0,
      service: data.job.issue || "Repair",
      source: data.device.source || undefined,
      imeiType: data.device.imei ? (data.device.imeiType as "imei1" | "imei2" | "serial") || "imei1" : undefined,
      internalNotes: data.job.notes || undefined,
      customerId: finalCustomerId || undefined,
    };

    if (isEdit) {
      updateTicket(editId, ticketData);
      setDirty(false);
      setShowSaveToast(true);
      setTimeout(() => {
        router.push(`/tickets/${editId}`);
      }, 800);
    } else {
      addTicket(ticketData);
      // Update customer stats (totalTickets, lastVisit)
      if (finalCustomerId) {
        const cust = customers.find((c) => c.id === finalCustomerId);
        if (cust) {
          updateCustomer(finalCustomerId, {
            totalTickets: cust.totalTickets + 1,
            totalRepairs: cust.totalRepairs + 1,
            lastVisit: new Date().toISOString(),
            lifetimeValue: cust.lifetimeValue + (Number(data.job.estimate) || data.parts.reduce((s, p) => s + p.total, 0) || 0),
          });
        }
      }
      // Reserve stock for parts
      if (data.parts.length > 0) {
        data.parts.forEach((p: any) => {
          const item = inventory.find((i: any) => i.id === p.inventoryId);
          if (item) {
            updateInventoryItem(p.inventoryId, { reservedStock: (item.reservedStock || 0) + p.qty });
          }
        });
      }
      setSubmitted(true);
    }
  };

  const handleSubmit = handleSave;

  if (submitted && !isEdit) return <ThankYou isEdit={isEdit} onDone={() => router.push("/tickets")} />;

  return (
    <>
      <WizardShell
        step={step}
        onBack={back}
        onClose={isEdit ? () => attemptNav(`/tickets/${editId}`) : undefined}
        closeHref={isEdit ? undefined : "/tickets"}
        title={isEdit ? `Edit Ticket ${editId}` : titleFor(step)}
        subtitle={isEdit ? "Update ticket details below." : subtitleFor(step)}
        isEdit={isEdit}
        footer={isEdit ? (
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Button variant="outline" size="md" onClick={back} disabled={step <= 1}>
              <ArrowLeft className="h-4 w-4" /> Previous
            </Button>
            <Button size="md" onClick={handleSave}>
              Save Changes
            </Button>
            <Button variant="outline" size="md" onClick={next} disabled={step >= 11}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : undefined}
      >
        <div className={cn("mx-auto", step === 9 ? "max-w-6xl" : (step === 2 || step === 3 || step === 4 || step === 7) ? "max-w-5xl" : "max-w-3xl")}>
          {step === 1 && (
            <ProcessSelector
              value={data.process}
              onChange={(id) => {
                if (id === "invoice") { router.push("/invoice/create"); return; }
                if (id === "walkin") { router.push("/walk-in"); return; }
                setData({ ...data, process: id }); setTimeout(next, 180);
              }}
            />
          )}
          {step === 2 && (
            <CategoryWheel
              value={data.category}
              onChange={(id) => setData({ ...data, category: id })}
              onNext={next}
              isEdit={isEdit}
            />
          )}
          {step === 3 && <DeviceForm data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 4 && <JobDetailsForm data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 5 && <PartsAssignment data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 6 && <ContactSearch data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 7 && <CustomerForm data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 8 && <QuoteSummary data={data} onNext={next} isEdit={isEdit} />}
          {step === 9 && <QCForm data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 10 && <UploadStep data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 11 && <SignatureStep onSubmit={handleSubmit} isEdit={isEdit} />}
        </div>
      </WizardShell>

      {/* Unsaved changes dialog */}
      {showLeaveDialog && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={() => setShowLeaveDialog(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-border p-6">
            <h3 className="text-base font-bold">Unsaved Changes</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">You have unsaved changes to this ticket.</p>
            <div className="mt-5 flex flex-col gap-2">
              <Button size="md" onClick={() => { setShowLeaveDialog(false); handleSave(); }}>
                Save Changes
              </Button>
              <Button variant="outline" size="md" onClick={() => { setShowLeaveDialog(false); setDirty(false); if (pendingNav) router.push(pendingNav); }}>
                Discard Changes
              </Button>
              <button onClick={() => setShowLeaveDialog(false)} className="text-sm font-medium text-muted-foreground hover:text-foreground transition py-2">
                Continue Editing
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Save toast */}
      <AnimatePresence>
        {showSaveToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg"
          >
            <CheckCircle2 className="h-4 w-4" /> Ticket updated successfully
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ---------------- Process Selector (Premium) ---------------- */

const PROCESS_CARDS = [
  { id: "ticket", title: "New Ticket", desc: "Repair job intake and tracking", icon: "🧰", tone: "bg-rose-50 text-rose-500" },
  { id: "invoice", title: "New Invoice", desc: "Create bill and manage payments", icon: "🧾", tone: "bg-violet-50 text-violet-500" },
  { id: "stock", title: "Add Stock", desc: "Add new inventory to your store", icon: "📦", tone: "bg-amber-50 text-amber-500" },
  { id: "walkin", title: "Walk-In", desc: "Counter customer billing", icon: "🏪", tone: "bg-sky-50 text-sky-500" },
  { id: "estimate", title: "Estimate", desc: "Send quote to your customer", icon: "💵", tone: "bg-emerald-50 text-emerald-500" },
  { id: "warranty", title: "Warranty", desc: "Claim or warranty check", icon: "🛡️", tone: "bg-cyan-50 text-cyan-500" },
];

function ProcessSelector({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PROCESS_CARDS.map((card, i) => (
          <motion.button
            key={card.id}
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => onChange(card.id)}
            className={cn(
              "group relative flex flex-col items-center text-center rounded-xl border bg-white p-4 sm:p-5 transition-all duration-250 ease-out",
              "hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(67,97,238,0.15)] hover:border-[#4361EE]/30",
              "active:scale-[0.98]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40",
              value === card.id ? "border-[#4361EE] shadow-[0_4px_16px_-6px_rgba(67,97,238,0.2)]" : "border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
            )}
            aria-label={`Create ${card.title}`}
          >
            <span className={cn("grid h-10 w-10 place-items-center rounded-full text-lg transition-transform duration-250 group-hover:scale-110", card.tone)}>
              {card.icon}
            </span>
            <h3 className="mt-3 text-[13px] font-bold text-zinc-800 tracking-tight">{card.title}</h3>
            <p className="mt-1 text-[11px] text-zinc-500 leading-snug">{card.desc}</p>
            <span className="mt-3 grid h-6 w-6 place-items-center rounded-full border border-border/80 text-zinc-400 transition-all duration-250 group-hover:border-[#4361EE] group-hover:bg-[#4361EE] group-hover:text-white">
              <ArrowRight className="h-3 w-3 transition-transform duration-250 group-hover:translate-x-0.5" />
            </span>
          </motion.button>
        ))}
      </div>

      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
        className="mt-5 flex items-center justify-center gap-1.5 text-[10px] text-zinc-400">
        <Sparkles className="h-3 w-3 text-[#4361EE]/50" />
        Tip: You can access these options anytime from the main menu.
      </motion.p>
    </div>
  );
}

/* ---------------- Helpers ---------------- */
function titleFor(step: number) {
  return [
    "Select Your Process",
    "Select Your Category",
    "Device Details",
    "Job Details",
    "Assign Items / Parts to Service",
    "Search Contact",
    "Customer Information",
    "Quotation Summary",
    "Pre-Quality Check",
    "Upload Photos & Documents",
    "Customer Signature",
  ][step - 1];
}
function subtitleFor(step: number) {
  return [
    "Pick what you're creating today.",
    "What kind of device is it?",
    "Capture brand, model and identifiers.",
    "Capture job type, priority and repair notes.",
    "Add spare parts and services consumed.",
    "Find an existing contact, or add a new one.",
    "Make sure the customer details are correct.",
    "Review the estimate before approval.",
    "Tick the visible condition checkpoints.",
    "Attach device photos and any paperwork.",
    "Capture the customer signature to confirm.",
  ][step - 1];
}

/* ---------------- Step 3: Device Details (Simplified) ---------------- */
function DeviceForm({ data, setData, onNext, isEdit }: any) {
  const { brands, deviceModels, addBrand, addDeviceModel } = useStore();
  const d = data.device;
  const set = (k: string, v: string) => setData({ ...data, device: { ...d, [k]: v } });

  // Brand combobox state
  const [brandQuery, setBrandQuery] = useState(d.brand || "");
  const [brandOpen, setBrandOpen] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  // Model combobox state
  const [modelQuery, setModelQuery] = useState(d.model || "");
  const [modelOpen, setModelOpen] = useState(false);
  const [showNewModel, setShowNewModel] = useState(false);
  const [newModelName, setNewModelName] = useState("");

  // Find selected brand id for filtering models
  const selectedBrand = brands.find((b) => b.name.toLowerCase() === (d.brand || brandQuery).toLowerCase().trim());

  // Search results
  const brandResults = searchBrands(brands, brandQuery);
  const modelResults = searchModels(deviceModels, selectedBrand?.id || null, modelQuery);

  // Brand selection
  const handleBrandSelect = (b: Brand) => {
    set("brand", b.name);
    setBrandQuery(b.name);
    setBrandOpen(false);
    // Clear model if brand changes
    if (d.brand.toLowerCase() !== b.name.toLowerCase()) {
      set("model", "");
      setModelQuery("");
    }
  };

  // Save new brand
  const handleSaveNewBrand = () => {
    if (!newBrandName.trim()) return;
    const brand = createBrand(newBrandName.trim());
    addBrand(brand);
    set("brand", brand.name);
    setBrandQuery(brand.name);
    setShowNewBrand(false);
    setNewBrandName("");
    setBrandOpen(false);
  };

  // Model selection
  const handleModelSelect = (m: DeviceModel) => {
    set("model", m.name);
    setModelQuery(m.name);
    setModelOpen(false);
    // Also set brand if not set
    if (!d.brand) {
      const b = brands.find((br) => br.id === m.brandId);
      if (b) { set("brand", b.name); setBrandQuery(b.name); }
    }
  };

  // Save new model
  const handleSaveNewModel = () => {
    if (!newModelName.trim() || !selectedBrand) return;
    const model = createDeviceModel(selectedBrand.id, newModelName.trim());
    addDeviceModel(model);
    set("model", model.name);
    setModelQuery(model.name);
    setShowNewModel(false);
    setNewModelName("");
    setModelOpen(false);
  };

  return (
    <div className={FORM_CARD}>
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
        {/* Left Column — Device Identity */}
        <div className="space-y-4">
          <SectionLabel icon={Package}>Device Identity</SectionLabel>
          <div className="grid grid-cols-1 gap-x-3.5 gap-y-4 sm:grid-cols-2">
            {/* Brand Combobox */}
            <div className="relative">
              <Field label="Brand Name">
                <Input
                  value={brandQuery}
                  onChange={(e: any) => {
                    setBrandQuery(e.target.value);
                    set("brand", e.target.value);
                    setBrandOpen(true);
                  }}
                  onFocus={() => setBrandOpen(true)}
                  placeholder="Search brand…"
                  className="h-11"
                  iconLeft={<Search className="h-4 w-4" />}
                />
              </Field>
              {brandOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[240px] overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                  {brandResults.slice(0, 10).map((b) => (
                    <button key={b.id} type="button" onClick={() => handleBrandSelect(b)}
                      className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[#EEF1FD]/60",
                        d.brand.toLowerCase() === b.name.toLowerCase() && "bg-[#EEF1FD] font-medium text-[#4361EE]"
                      )}>
                      <Check className={cn("h-3.5 w-3.5 shrink-0", d.brand.toLowerCase() === b.name.toLowerCase() ? "text-[#4361EE]" : "opacity-0")} strokeWidth={3} />
                      <span>{b.name}</span>
                    </button>
                  ))}
                  {brandResults.length === 0 && brandQuery.trim() && (
                    <p className="px-3 py-2 text-[12px] text-muted-foreground">No brands match &quot;{brandQuery}&quot;</p>
                  )}
                  <button type="button" onClick={() => { setNewBrandName(brandQuery); setShowNewBrand(true); setBrandOpen(false); }}
                    className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-[13px] font-medium text-[#4361EE] hover:bg-[#EEF1FD]/60 transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add New Brand
                  </button>
                </div>
              )}
              {/* Click outside to close */}
              {brandOpen && <div className="fixed inset-0 z-20" onClick={() => setBrandOpen(false)} />}
            </div>

            {/* Model Combobox */}
            <div className="relative">
              <Field label="Model">
                <Input
                  value={modelQuery}
                  onChange={(e: any) => {
                    setModelQuery(e.target.value);
                    set("model", e.target.value);
                    setModelOpen(true);
                  }}
                  onFocus={() => setModelOpen(true)}
                  placeholder={selectedBrand ? `Search ${selectedBrand.name} models…` : "Select brand first…"}
                  className="h-11"
                  iconLeft={<Search className="h-4 w-4" />}
                />
              </Field>
              {modelOpen && (
                <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[240px] overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                  {modelResults.slice(0, 12).map((m) => (
                    <button key={m.id} type="button" onClick={() => handleModelSelect(m)}
                      className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[#EEF1FD]/60",
                        d.model.toLowerCase() === m.name.toLowerCase() && "bg-[#EEF1FD] font-medium text-[#4361EE]"
                      )}>
                      <Check className={cn("h-3.5 w-3.5 shrink-0", d.model.toLowerCase() === m.name.toLowerCase() ? "text-[#4361EE]" : "opacity-0")} strokeWidth={3} />
                      <span>{m.name}</span>
                    </button>
                  ))}
                  {modelResults.length === 0 && modelQuery.trim() && (
                    <p className="px-3 py-2 text-[12px] text-muted-foreground">No models match &quot;{modelQuery}&quot;</p>
                  )}
                  {selectedBrand && (
                    <button type="button" onClick={() => { setNewModelName(modelQuery); setShowNewModel(true); setModelOpen(false); }}
                      className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-[13px] font-medium text-[#4361EE] hover:bg-[#EEF1FD]/60 transition-colors">
                      <Plus className="h-3.5 w-3.5" /> Add New Model
                    </button>
                  )}
                  {!selectedBrand && (
                    <p className="px-3 py-2 text-[11px] text-muted-foreground italic">Select a brand first to add a new model.</p>
                  )}
                </div>
              )}
              {modelOpen && <div className="fixed inset-0 z-20" onClick={() => setModelOpen(false)} />}
            </div>

            <div className="col-span-1">
              <Field label="ID Type">
                <RSelect value={d.imeiType} onChange={(v) => set("imeiType", v)} options={[
                  { label: "IMEI 1", value: "imei1" },
                  { label: "IMEI 2", value: "imei2" },
                  { label: "Serial No.", value: "serial" },
                ]} />
              </Field>
            </div>
            <div className="col-span-1">
              <Field label="IMEI / Serial Number"><Input value={d.imei} onChange={(e: any) => set("imei", e.target.value)} placeholder="356xxxxxxxxxx" className="h-11 font-mono" /></Field>
            </div>
          </div>
        </div>

        {/* Right Column — Intake */}
        <div className="space-y-4">
          <SectionLabel icon={ListPlus}>Intake Details</SectionLabel>
          <div className="grid grid-cols-1 gap-x-3.5 gap-y-4 sm:grid-cols-2">
            <Field label="Type">
              <RSelect value={d.type} onChange={(v) => set("type", v)} placeholder="Select type" options={[
                { label: "Walk-In", value: "walkin" },
                { label: "Pick-Up", value: "pickup" },
                { label: "On-Site", value: "onsite" },
              ]} />
            </Field>
            <Field label="Source">
              <RSelect value={d.source} onChange={(v) => set("source", v)} placeholder="Select source" options={[
                { label: "Google", value: "google" },
                { label: "Meta", value: "meta" },
                { label: "YouTube", value: "youtube" },
                { label: "Walk-in", value: "walk-in" },
                { label: "Reference", value: "ref" },
              ]} />
            </Field>
            <Field label="Assigned By"><Input value={d.assignedBy} onChange={(e: any) => set("assignedBy", e.target.value)} placeholder="Front desk" className="h-11" /></Field>
            <Field label="Assigned To">
              <RSelect value={d.assignedTo} onChange={(v) => set("assignedTo", v)} placeholder="Select technician" searchable options={[
                { label: "Anand · L2 Mobile", value: "anand" },
                { label: "Pooja · Logic-board", value: "pooja" },
                { label: "Vikas · Watch & iPad", value: "vikas" },
                { label: "Shubham · Hardware", value: "shubham" },
                { label: "Ravi · Android", value: "ravi" },
              ]} />
            </Field>
          </div>
        </div>
      </div>
      {!isEdit && (
        <div className="mt-6 flex justify-end">
          <Button size="lg" onClick={onNext}>Next <ArrowRight className="h-4 w-4" /></Button>
        </div>
      )}

      {/* Add New Brand Modal */}
      {showNewBrand && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={() => setShowNewBrand(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-border p-5">
            <h3 className="text-base font-bold">Add New Brand</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">This brand will be saved permanently to the Brand Master.</p>
            <div className="mt-4 space-y-1">
              <Label>Brand Name</Label>
              <Input value={newBrandName} onChange={(e: any) => setNewBrandName(e.target.value)} placeholder="e.g. Nokia, Motorola" className="h-11" autoFocus />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewBrand(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveNewBrand} disabled={!newBrandName.trim()}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Save Brand
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add New Model Modal */}
      {showNewModel && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={() => setShowNewModel(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-border p-5">
            <h3 className="text-base font-bold">Add New Model</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              This model will be linked to <span className="font-semibold text-[#4361EE]">{selectedBrand?.name}</span> in the Model Master.
            </p>
            <div className="mt-4 space-y-1">
              <Label>Model Name</Label>
              <Input value={newModelName} onChange={(e: any) => setNewModelName(e.target.value)} placeholder="e.g. iPhone 16 Pro Max" className="h-11" autoFocus />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNewModel(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveNewModel} disabled={!newModelName.trim()}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Save Model
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Step 4: Job Details ---------------- */
function JobDetailsForm({ data, setData, onNext, isEdit }: any) {
  const j = data.job;
  const set = (k: string, v: string) => setData({ ...data, job: { ...j, [k]: v } });
  return (
    <div className={FORM_CARD}>
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
        {/* Left Column — Job Overview */}
        <div className="space-y-4">
          <SectionLabel icon={ClipboardList}>Job Overview</SectionLabel>
          <div className="grid grid-cols-1 gap-x-3.5 gap-y-4 sm:grid-cols-2">
            <Field label="Job Type">
              <RSelect value={j.jobType} onChange={(v) => set("jobType", v)} options={[
                { label: "Service", value: "service" },
                { label: "Warranty", value: "warranty" },
                { label: "Estimate", value: "estimate" },
                { label: "Buyback", value: "buyback" },
              ]} />
            </Field>
            <Field label="Priority">
              <RSelect value={j.priority} onChange={(v) => set("priority", v)} options={[
                { label: "Normal", value: "normal" },
                { label: "High Priority", value: "high" },
                { label: "Critical", value: "critical" },
              ]} />
            </Field>
            <Field label="Warranty">
              <RSelect value={j.warranty} onChange={(v) => set("warranty", v)} placeholder="Select warranty" options={[
                { label: "In Warranty", value: "in-warranty" },
                { label: "Out of Warranty", value: "out-warranty" },
                { label: "Extended Warranty", value: "extended" },
              ]} />
            </Field>
            <Field label="Expected Resolution Time">
              <RSelect value={j.resolutionMinutes} onChange={(v) => set("resolutionMinutes", v)} placeholder="Default (59 min)" options={[
                { label: "30 Minutes", value: "30" },
                { label: "45 Minutes", value: "45" },
                { label: "1 Hour", value: "60" },
                { label: "2 Hours", value: "120" },
                { label: "4 Hours", value: "240" },
                { label: "8 Hours (End of Day)", value: "480" },
              ]} />
            </Field>
          </div>
          <Field label="Issue"><Input value={j.issue} onChange={(e: any) => set("issue", e.target.value)} placeholder="Display not working" className="h-11" /></Field>
          <Field label="User Accessories"><Textarea value={j.accessories} onChange={(e: any) => set("accessories", e.target.value)} placeholder="e.g. Charger, case, SIM tray received" rows={2} className="min-h-0" /></Field>
        </div>

        {/* Right Column — Notes */}
        <div className="space-y-4">
          <SectionLabel icon={StickyNote}>Notes</SectionLabel>
          <Field label="Problem Description"><Textarea value={j.description} onChange={(e: any) => set("description", e.target.value)} placeholder="Customer reported intermittent reboots when charging…" rows={5} className="min-h-0 h-[124px]" /></Field>
          <Field label="Internal Notes"><Textarea value={j.notes} onChange={(e: any) => set("notes", e.target.value)} placeholder="Visible water damage on bottom left" rows={3} className="min-h-0 h-[76px]" /></Field>
        </div>
      </div>
      {!isEdit && (
        <div className="mt-6 flex justify-end">
          <Button size="lg" onClick={onNext}>Next <ArrowRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}

const FORM_CARD = "rounded-[20px] border border-[#E2E8F8]/80 bg-[#F7FAFF] p-6 sm:p-8 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(67,97,238,0.06)]";

function SectionLabel({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/* ---------------- Step 5: Parts (Inventory Integrated) ---------------- */
function PartsAssignment({ data, setData, onNext, isEdit }: any) {
  const { inventory } = useStore();
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  const total = data.parts.reduce((s: number, p: any) => s + Number(p.total || 0), 0);

  // Search inventory items
  const results = query.trim().length >= 2
    ? inventory.filter((item: InventoryItem) => {
        const q = query.toLowerCase();
        return item.active && (
          item.name.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : [];

  const addPart = (item: InventoryItem) => {
    // Check if already added
    if (data.parts.some((p: any) => p.inventoryId === item.id)) return;
    const newPart = {
      inventoryId: item.id,
      name: item.name,
      sku: item.id,
      qty: 1,
      unitPrice: item.regularSellingPrice,
      total: item.regularSellingPrice,
      uom: item.uom,
    };
    setData({ ...data, parts: [...data.parts, newPart] });
    setQuery("");
    setShowResults(false);
  };

  const removePart = (idx: number) => {
    setData({ ...data, parts: data.parts.filter((_: any, i: number) => i !== idx) });
  };

  const updateQty = (idx: number, delta: number) => {
    setData({
      ...data,
      parts: data.parts.map((p: any, i: number) => {
        if (i !== idx) return p;
        const newQty = Math.max(1, p.qty + delta);
        return { ...p, qty: newQty, total: newQty * p.unitPrice };
      }),
    });
  };

  return (
    <div className="rounded-[20px] border border-[#E2E8F8]/80 bg-[#F7FAFF] p-6 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(67,97,238,0.06)] sm:p-8">
      {/* Search */}
      <div className="relative">
        <Field label="Search Inventory">
          <Input
            value={query}
            onChange={(e: any) => { setQuery(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            placeholder="Search by name, SKU, or category…"
            iconLeft={<Search className="h-4 w-4" />}
          />
        </Field>

        {/* Autocomplete Results */}
        {showResults && results.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[280px] overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
            {results.map((item: InventoryItem) => {
              const alreadyAdded = data.parts.some((p: any) => p.inventoryId === item.id);
              const available = item.currentStock - (item.reservedStock || 0);
              const outOfStock = available <= 0;
              const lowStock = available > 0 && available <= item.minStock;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={alreadyAdded || outOfStock}
                  onClick={() => addPart(item)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition border-b border-border last:border-0",
                    alreadyAdded ? "opacity-50 cursor-not-allowed bg-muted/30" :
                    outOfStock ? "opacity-50 cursor-not-allowed" :
                    "hover:bg-indigo-50/50"
                  )}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                    <Package className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">{item.id} · {item.category} · {item.uom}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{formatINR(item.regularSellingPrice)}</p>
                    {outOfStock ? (
                      <span className="text-[10px] font-medium text-rose-600">Out of Stock</span>
                    ) : lowStock ? (
                      <span className="text-[10px] font-medium text-amber-600">Low ({available})</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Available: {available}</span>
                    )}
                  </div>
                  {alreadyAdded && <span className="text-[10px] font-medium text-[#4361EE]">Added</span>}
                </button>
              );
            })}
          </div>
        )}
        {showResults && query.trim().length >= 2 && results.length === 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-border bg-card p-4 shadow-lg text-center text-sm text-muted-foreground">
            No inventory items match "{query}"
          </div>
        )}
      </div>

      {/* Added Parts List */}
      <div className="mt-5 rounded-xl border border-border overflow-hidden">
        {data.parts.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 text-left">Item</th>
                <th className="py-2 text-center w-28">Qty</th>
                <th className="py-2 text-right w-24">Price</th>
                <th className="py-2 text-right w-24">Total</th>
                <th className="py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data.parts.map((p: any, i: number) => {
                  const invItem = inventory.find((it: InventoryItem) => it.id === p.inventoryId);
                  const available = invItem ? invItem.currentStock - (invItem.reservedStock || 0) : 0;
                  const stockWarning = invItem && p.qty > available;
                  return (
                    <motion.tr key={p.inventoryId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">{p.sku} · {p.uom}</p>
                        {stockWarning && (
                          <p className="flex items-center gap-1 text-[11px] text-amber-600 mt-0.5">
                            <AlertTriangle className="h-3 w-3" /> Insufficient stock (Available: {available})
                          </p>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" onClick={() => updateQty(i, -1)} className="grid h-7 w-7 place-items-center rounded-lg border border-border hover:bg-muted transition">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center font-semibold tabular-nums">{p.qty}</span>
                          <button type="button" onClick={() => updateQty(i, 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-border hover:bg-muted transition">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 text-right tabular-nums">{formatINR(p.unitPrice)}</td>
                      <td className="py-3 text-right tabular-nums font-medium">{formatINR(p.total)}</td>
                      <td className="py-3 pr-3">
                        <button type="button" onClick={() => removePart(i)} className="grid h-7 w-7 place-items-center rounded-lg text-rose-500 hover:bg-rose-50 transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        ) : (
          <div className="flex items-center justify-center px-4 py-8 text-sm text-muted-foreground">
            <Package className="mr-2 h-4 w-4" /> No parts added yet - search inventory above or skip this step.
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm"><span className="text-muted-foreground">Parts total: </span><span className="font-semibold tabular-nums">{formatINR(total)}</span></div>
        {!isEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={onNext}>Skip</Button>
            <Button size="lg" onClick={onNext}>Continue <ArrowRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Step 6: Contact Search ---------------- */
function ContactSearch({ data, setData, onNext, isEdit }: any) {
  const { customers } = useStore();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(data.customerId || null);

  // Live search results
  const results = q.trim().length >= 2 ? searchCustomers(customers, q) : [];

  // Select an existing customer and auto-populate step 7
  const selectCustomer = (c: Customer) => {
    setSelectedId(c.id);
    setData({
      ...data,
      customerId: c.id,
      contactType: c.type,
      customer: {
        first: c.firstName,
        last: c.lastName,
        phone: c.mobile,
        email: c.email,
        address: c.address,
        postal: c.postalCode,
        city: c.city,
        company: c.company,
      },
    });
  };

  // Selected customer object (for display)
  const selectedCustomer = selectedId ? customers.find((c) => c.id === selectedId) : null;

  return (
    <div className="rounded-[20px] border border-[#E2E8F8]/80 bg-[#F7FAFF] p-6 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(67,97,238,0.06)] sm:p-8">
      <div className="flex flex-col items-center">
        <SegmentedTabs value={data.contactType} onChange={(v) => setData({ ...data, contactType: v })} options={[{ label: "Personal", value: "personal" }, { label: "Business", value: "business" }]} />

        {/* Search Input */}
        <div className="relative mt-6 w-full max-w-lg">
          <Input
            value={q}
            onChange={(e: any) => { setQ(e.target.value); setSelectedId(null); }}
            placeholder="Search by name, phone, email, company or ID…"
            iconLeft={<Search className="h-4 w-4" />}
            className="h-12"
          />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {data.contactType === "personal" ? <User className="inline h-3 w-3 mr-1" /> : <Building2 className="inline h-3 w-3 mr-1" />}
            Start typing to search existing customers.
          </p>

          {/* Search Results Dropdown */}
          {q.trim().length >= 2 && !selectedId && (
            <div className="absolute left-0 right-0 top-[52px] z-30 mt-1 max-h-[340px] overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
              {results.length > 0 ? (
                results.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition border-b border-border last:border-0 hover:bg-indigo-50/50"
                  >
                    {/* Avatar */}
                    <span className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold",
                      c.type === "business" ? "bg-violet-100 text-violet-700" : "bg-[#EEF1FD] text-[#4361EE]"
                    )}>
                      {c.firstName[0]}{c.lastName[0] || ""}
                    </span>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold truncate">{c.fullName}</p>
                        {c.type === "business" && (
                          <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-semibold text-violet-700 uppercase">Business</span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {c.mobile}
                        {c.email && <> · {c.email}</>}
                        {c.company && <> · {c.company}</>}
                      </p>
                    </div>
                    {/* Stats */}
                    <div className="text-right shrink-0 hidden sm:block">
                      <p className="text-[10px] text-muted-foreground">{c.totalTickets} tickets · {formatINR(c.lifetimeValue)}</p>
                      <p className="text-[10px] text-muted-foreground">{c.id}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-5 text-center">
                  <p className="text-sm text-muted-foreground">No matching customers found</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Click &quot;Add New&quot; to create a new customer in the next step.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Selected Customer Card */}
        {selectedCustomer && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 w-full max-w-lg rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-900">{selectedCustomer.fullName}</p>
                <p className="text-[11px] text-emerald-700">
                  {selectedCustomer.mobile}
                  {selectedCustomer.company && <> · {selectedCustomer.company}</>}
                  <> · {selectedCustomer.id}</>
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedId(null);
                  setData({ ...data, customerId: null, customer: { first: "", last: "", phone: "", email: "", address: "", postal: "", city: "", company: "" } });
                }}
                className="shrink-0 rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-100 transition"
                aria-label="Clear selection"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}

        {/* Action Buttons */}
        <div className={cn("mt-6 flex w-full max-w-lg flex-col gap-2 sm:flex-row sm:justify-center", isEdit && "hidden")}>
          <Button variant="outline" size="lg" onClick={() => { setData({ ...data, customerId: null, customer: { first: "", last: "", phone: "", email: "", address: "", postal: "", city: "", company: "" } }); onNext(); }}>
            <Plus className="h-4 w-4" /> Add New
          </Button>
          <Button size="lg" onClick={onNext} disabled={!selectedId}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Step 7: Customer (Premium) ---------------- */
function CustomerForm({ data, setData, onNext, isEdit }: any) {
  const { customers, addCustomer } = useStore();
  const c = data.customer;
  const set = (k: string, v: string) => setData({ ...data, customer: { ...c, [k]: v } });
  const hasLinkedCustomer = !!data.customerId;

  // Save new customer to Customer Master when proceeding to next step
  const handleNext = () => {
    // Only create a new customer if no existing one is linked and we have at least a name
    if (!data.customerId && c.first.trim()) {
      // Check if this customer already exists (by phone or name match) to avoid re-saving on back/forth navigation
      const existingByPhone = c.phone.trim()
        ? customers.find((cust) => cust.mobile.replace(/[\s\-\(\)\+]/g, "") === c.phone.replace(/[\s\-\(\)\+]/g, "") && c.phone.replace(/[\s\-\(\)\+]/g, "").length >= 10)
        : null;

      if (existingByPhone) {
        // Link to existing customer found by phone
        setData({ ...data, customerId: existingByPhone.id });
      } else {
        // Create new customer and link
        const newCustomer = createCustomer({
          type: data.contactType,
          firstName: c.first.trim(),
          lastName: c.last.trim(),
          mobile: c.phone.trim(),
          email: c.email.trim(),
          company: c.company.trim(),
          address: c.address.trim(),
          city: c.city.trim(),
          postalCode: c.postal.trim(),
        });
        addCustomer(newCustomer);
        setData({ ...data, customerId: newCustomer.id });
      }
    }
    onNext();
  };

  return (
    <div className={FORM_CARD}>
      {/* Linked customer banner */}
      {hasLinkedCustomer && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <p className="text-[12px] font-medium text-emerald-800">
            Linked to Customer Master <span className="font-mono font-bold">{data.customerId}</span> — edits here update this ticket only.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
        {/* Left Column — Identity */}
        <div className="space-y-4">
          <SectionLabel icon={User}>Personal Details</SectionLabel>
          <div className="grid grid-cols-1 gap-x-3.5 gap-y-4 sm:grid-cols-2">
            <Field label="First Name"><Input value={c.first} onChange={(e: any) => set("first", e.target.value)} placeholder="Rahul" className="h-11" /></Field>
            <Field label="Last Name"><Input value={c.last} onChange={(e: any) => set("last", e.target.value)} placeholder="Kapoor" className="h-11" /></Field>
            <div className="col-span-2"><Field label="Contact Number"><Input value={c.phone} onChange={(e: any) => set("phone", e.target.value)} iconLeft={<Phone className="h-4 w-4" />} placeholder="+91 …" className="h-11" /></Field></div>
            <Field label="E-mail ID"><Input value={c.email} onChange={(e: any) => set("email", e.target.value)} iconLeft={<Mail className="h-4 w-4" />} placeholder="rahul@email.com" className="h-11" /></Field>
            <Field label="Company / Organization"><Input value={c.company} onChange={(e: any) => set("company", e.target.value)} iconLeft={<Building2 className="h-4 w-4" />} placeholder="Optional" className="h-11" /></Field>
          </div>
        </div>

        {/* Right Column — Address */}
        <div className="space-y-4">
          <SectionLabel icon={Building2}>Address</SectionLabel>
          <div className="grid grid-cols-1 gap-x-3.5 gap-y-4 sm:grid-cols-2">
            <div className="col-span-2"><Field label="Address"><Input value={c.address} onChange={(e: any) => set("address", e.target.value)} placeholder="House / Street / Locality" className="h-11" /></Field></div>
            <Field label="City"><Input value={c.city} onChange={(e: any) => set("city", e.target.value)} placeholder="Bengaluru" className="h-11" /></Field>
            <Field label="Postal Code"><Input value={c.postal} onChange={(e: any) => set("postal", e.target.value)} placeholder="560001" className="h-11" /></Field>
          </div>
        </div>
      </div>
      {!isEdit && (
        <div className="mt-6 flex justify-end">
          <Button size="lg" onClick={handleNext}>Next <ArrowRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Step 8: Quote ---------------- */
function QuoteSummary({ data, onNext, isEdit }: any) {
  const partsTotal = data.parts.reduce((s: number, p: any) => s + Number(p.total || 0), 0);
  const labour = 499;
  const tax = Math.round(partsTotal * 0.18);
  const total = partsTotal + labour + tax;
  return (
    <div className="rounded-[20px] border border-[#E2E8F8]/80 bg-[#F7FAFF] p-6 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(67,97,238,0.06)] sm:p-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-border">
          <div className="grid grid-cols-3 bg-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Description</div><div className="text-center">Qty</div><div className="text-right">Amount</div>
          </div>
          {data.parts.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No parts added - quotation will reflect labour only.</div>
          ) : data.parts.map((p: any, i: number) => (
            <div key={i} className="grid grid-cols-3 px-4 py-3 text-sm odd:bg-background even:bg-muted/30">
              <div>{p.name}</div><div className="text-center">{p.qty || 1}</div><div className="text-right tnum">{formatINR(Number(p.total))}</div>
            </div>
          ))}
          <div className="grid grid-cols-3 px-4 py-3 text-sm border-t border-border">
            <div>Labour & Diagnostics</div><div className="text-center">1</div><div className="text-right tnum">{formatINR(labour)}</div>
          </div>
          <div className="grid grid-cols-3 px-4 py-3 text-sm border-t border-border">
            <div>GST (18%)</div><div className="text-center">-</div><div className="text-right tnum">{formatINR(tax)}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-gradient-to-b from-indigo-50/60 to-white p-5">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Customer pays</p>
          <p className="font-display mt-1 text-3xl font-extrabold brand-gradient-text">{formatINR(total)}</p>
          <ul className="mt-4 space-y-1.5 text-sm">
            <QRow k="Sub-total (parts)" v={formatINR(partsTotal)} />
            <QRow k="Labour" v={formatINR(labour)} />
            <QRow k="Tax" v={formatINR(tax)} />
            <QRow k="Total" v={formatINR(total)} bold />
          </ul>
          {!isEdit && <Button size="lg" className="mt-4 w-full" onClick={onNext}>Approve Quote <ArrowRight className="h-4 w-4" /></Button>}
          <p className="mt-2 text-center text-[11px] text-muted-foreground">Customer will be asked to sign at the end of this flow.</p>
        </div>
      </div>
    </div>
  );
}
function QRow({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span className={cn("text-muted-foreground", bold && "text-foreground font-semibold")}>{k}</span>
      <span className={cn("tnum", bold && "font-semibold")}>{v}</span>
    </li>
  );
}

/* ---------------- Step 9: QC (Premium Inspection) ---------------- */
function QCForm({ data, setData, onNext, isEdit }: any) {
  const [filter, setFilter] = useState<"all" | "pass" | "fail" | "skip" | "pending">("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(QC_GROUPS.map((g) => g.id)));
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const qc = data.qc || {};
  const set = (k: string, v: "ok" | "no" | "na") => setData({ ...data, qc: { ...qc, [k]: v } });

  const total = QC_FIELDS.length;
  const passed = QC_FIELDS.filter((f) => qc[f] === "ok").length;
  const failed = QC_FIELDS.filter((f) => qc[f] === "no").length;
  const skipped = QC_FIELDS.filter((f) => qc[f] === "na").length;
  const completed = passed + failed + skipped;
  const pending = total - completed;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const matchesFilter = (label: string) => {
    if (filter === "all") return true;
    if (filter === "pass") return qc[label] === "ok";
    if (filter === "fail") return qc[label] === "no";
    if (filter === "skip") return qc[label] === "na";
    if (filter === "pending") return !qc[label];
    return true;
  };
  const matchesSearch = (label: string) => !search.trim() || label.toLowerCase().includes(search.toLowerCase());

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const markAll = () => {
    const updated = { ...qc };
    QC_FIELDS.forEach((f) => { if (!updated[f]) updated[f] = "ok"; });
    setData({ ...data, qc: updated });
  };

  const filters = [
    { key: "all" as const, label: "All", count: total },
    { key: "pass" as const, label: "Passed", count: passed },
    { key: "fail" as const, label: "Failed", count: failed },
    { key: "skip" as const, label: "Skipped", count: skipped },
    { key: "pending" as const, label: "Pending", count: pending },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Main Inspection Area */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Quality Control Inspection</h2>
              <p className="text-[12px] text-muted-foreground">{data.device?.model || "Device"} • {data.device?.assignedTo || "Technician"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setData({ ...data, qc: {} })}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
            <Button variant="outline" size="sm" onClick={markAll}><CheckCircle2 className="h-3.5 w-3.5" /> Mark All Pass</Button>
            {!isEdit && <Button size="sm" onClick={onNext}>Finish QC</Button>}
          </div>
        </div>

        {/* Progress */}
        <div className="rounded-xl border border-border bg-card p-3 mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground">Inspection Progress</span>
            <span className="text-[11px] font-bold">{completed}/{total} · <span className="text-[#4361EE]">{pct}%</span></span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <motion.div className="h-full rounded-full bg-[#4361EE]" animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
          </div>
        </div>

        {/* Filters + Search */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn("rounded-full px-3 py-1 text-[11px] font-semibold transition-all",
                filter === f.key ? "bg-[#4361EE] text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-slate-200"
              )}>
              {f.label} ({f.count})
            </button>
          ))}
          <div className="ml-auto w-44">
            <Input value={search} onChange={(e: any) => setSearch(e.target.value)} placeholder="Search component…" iconLeft={<Search className="h-3.5 w-3.5" />} />
          </div>
        </div>

        {/* Groups — two balanced columns */}
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 lg:items-start">
          {[QC_GROUPS.slice(0, 3), QC_GROUPS.slice(3)].map((column, colIdx) => (
            <div key={colIdx} className="space-y-2.5">
              {column.map((group) => {
                const visibleItems = group.items.filter((item) => matchesFilter(item) && matchesSearch(item));
                if (visibleItems.length === 0) return null;
                const groupDone = group.items.filter((i) => qc[i]).length;
                const isCollapsed = collapsed.has(group.id);
                return (
                  <div key={group.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    <button onClick={() => toggleGroup(group.id)} className="flex w-full items-center justify-between px-4 py-2 bg-muted/40 hover:bg-muted/60 transition">
                      <div className="flex items-center gap-2">
                        {isCollapsed ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="text-[13px] font-semibold">{group.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">{groupDone}/{group.items.length}</span>
                    </button>
                    {!isCollapsed && (
                      <div className="divide-y divide-border">
                        {visibleItems.map((label) => {
                          const status = qc[label];
                          return (
                            <div key={label} className="flex items-center gap-2.5 px-4 py-2">
                              <span className={cn("h-2 w-2 rounded-full shrink-0", status === "ok" ? "bg-emerald-500" : status === "no" ? "bg-rose-500" : status === "na" ? "bg-[#4361EE]" : "bg-zinc-300")} />
                              <span className="flex-1 text-[13px] font-medium truncate">{label}</span>
                              <button onClick={() => { setNoteOpen(label); setNoteText(""); }} className="shrink-0 rounded-md px-1.5 py-1 text-[10px] font-semibold text-[#4361EE] hover:bg-[#EEF1FD] transition">
                                NOTE
                              </button>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => set(label, "ok")} className={cn("rounded-md px-2 py-1 text-[10px] font-semibold transition-all", status === "ok" ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200" : "bg-muted text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700")}>Pass</button>
                                <button onClick={() => set(label, "no")} className={cn("rounded-md px-2 py-1 text-[10px] font-semibold transition-all", status === "no" ? "bg-rose-100 text-rose-700 ring-1 ring-rose-200" : "bg-muted text-muted-foreground hover:bg-rose-50 hover:text-rose-700")}>Fail</button>
                                <button onClick={() => set(label, "na")} className={cn("rounded-md px-2 py-1 text-[10px] font-semibold transition-all", status === "na" ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200" : "bg-muted text-muted-foreground hover:bg-indigo-50 hover:text-indigo-700")}>Skip</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-full lg:w-52 shrink-0">
        <div className="lg:sticky lg:top-4 space-y-3 lg:mt-[60px]">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Summary</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-emerald-50 p-2 text-center"><p className="text-base font-bold text-emerald-700">{passed}</p><p className="text-[9px] font-medium text-emerald-600">Passed</p></div>
              <div className="rounded-lg bg-rose-50 p-2 text-center"><p className="text-base font-bold text-rose-700">{failed}</p><p className="text-[9px] font-medium text-rose-600">Failed</p></div>
              <div className="rounded-lg bg-indigo-50 p-2 text-center"><p className="text-base font-bold text-indigo-700">{skipped}</p><p className="text-[9px] font-medium text-indigo-600">Skipped</p></div>
              <div className="rounded-lg bg-zinc-100 p-2 text-center"><p className="text-base font-bold text-zinc-700">{pending}</p><p className="text-[9px] font-medium text-zinc-500">Pending</p></div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3 flex flex-col items-center">
            <div className="relative h-16 w-16">
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
                <motion.circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-[#4361EE]" strokeDasharray="97.4" animate={{ strokeDashoffset: 97.4 - (97.4 * pct) / 100 }} transition={{ duration: 0.5 }} />
              </svg>
              <span className="absolute inset-0 grid place-items-center text-xs font-bold">{pct}%</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">Completion</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Quick Actions</p>
            <button onClick={() => setFilter("fail")} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium hover:bg-muted transition"><XCircle className="h-3 w-3 text-rose-500" /> Show Failed</button>
            <button onClick={() => setCollapsed(new Set(QC_GROUPS.map((g) => g.id)))} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium hover:bg-muted transition"><MinusCircle className="h-3 w-3 text-muted-foreground" /> Collapse All</button>
            <button onClick={() => setCollapsed(new Set())} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium hover:bg-muted transition"><CircleDot className="h-3 w-3 text-muted-foreground" /> Expand All</button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground"><CheckCircle2 className="inline h-3 w-3 text-emerald-500" /> Auto-saved</p>
        </div>
      </div>

      {/* Note Modal */}
      {noteOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={() => setNoteOpen(null)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-border p-5">
            <p className="text-sm font-bold mb-1">Note: {noteOpen}</p>
            <p className="text-[11px] text-muted-foreground mb-3">Add technician notes for this item.</p>
            <Textarea value={noteText} onChange={(e: any) => setNoteText(e.target.value)} placeholder="Enter notes…" rows={3} />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setNoteOpen(null)}>Cancel</Button>
              <Button size="sm" onClick={() => setNoteOpen(null)}>Save Note</Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Step 10: Upload ---------------- */
function UploadStep({ data, setData, onNext, isEdit }: any) {
  return (
    <div className="rounded-[20px] border border-[#E2E8F8]/80 bg-[#F7FAFF] p-6 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(67,97,238,0.06)] sm:p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { id: "camera", label: "Camera", icon: Camera, desc: "Open camera to capture device shots" },
          { id: "gallery", label: "Gallery", icon: ImageIcon, desc: "Pick existing photos from device" },
        ].map((s, i) => (
          <motion.button key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
            onClick={() => setData({ ...data, files: [...data.files, `${s.id}-${Date.now()}.jpg`] })}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-gradient-to-b from-indigo-50/40 to-white p-5 text-left transition hover:-translate-y-0.5 hover:border-indigo-200"
          >
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-border bg-white text-brand-700 shadow-card"><s.icon className="h-6 w-6" /></span>
            <div className="flex-1">
              <p className="font-display text-lg font-bold">{s.label}</p>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </div>
            <Upload className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
          </motion.button>
        ))}
      </div>
      <div className="mt-5">
        <p className="text-xs font-medium text-muted-foreground">Attached files</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.files.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No files yet - add photos or documents above.</div>
          ) : data.files.map((f: string, i: number) => (
            <motion.div key={f + i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="aspect-[4/3] rounded-xl border border-border bg-gradient-to-br from-indigo-100/50 to-white p-2 shadow-card">
              <div className="flex h-full items-end justify-between rounded-lg border border-border bg-white p-2">
                <span className="truncate text-[10px] text-muted-foreground">{f}</span>
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      {!isEdit && (
        <div className="mt-6 flex justify-end">
          <Button size="lg" onClick={onNext}>Upload & Continue <ArrowRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Step 11: Signature ---------------- */
function SignatureStep({ onSubmit, isEdit }: { onSubmit: () => void; isEdit: boolean }) {
  const [signed, setSigned] = useState(false);
  return (
    <div className="rounded-[20px] border border-[#E2E8F8]/80 bg-[#F7FAFF] p-6 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(67,97,238,0.06)] sm:p-8">
      <p className="text-center text-sm text-muted-foreground">
        {isEdit ? "Confirm your changes by signing below." : "By signing below the customer agrees to the diagnosis, estimate and our service terms."}
      </p>
      <div onClick={() => setSigned(true)} className={cn("relative mt-5 grid h-[260px] cursor-crosshair place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-gradient-to-b from-indigo-50/40 to-white transition", signed ? "border-indigo-300" : "border-border")}>
        {!signed ? (
          <div className="text-center text-muted-foreground">
            <FileSignature className="mx-auto h-10 w-10" />
            <p className="mt-2 text-sm">Tap & sign here</p>
          </div>
        ) : (
          <motion.svg initial={{ opacity: 0 }} animate={{ opacity: 1 }} viewBox="0 0 400 120" className="h-32 w-[80%] text-brand-700" fill="none">
            <motion.path initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9 }} d="M10 90 C 60 30, 90 110, 130 50 S 220 110, 260 60 S 340 100, 390 50" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </motion.svg>
        )}
        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-wider text-muted-foreground">x ─────────────── customer signature</span>
      </div>
      <div className={cn("mt-5 flex items-center justify-between", isEdit && "hidden")}>
        <Button variant="outline" onClick={() => setSigned(false)}><RotateCcw className="h-4 w-4" /> Clear</Button>
        <Button size="lg" onClick={onSubmit} disabled={!signed}>
          <ShieldCheck className="h-4 w-4" /> {isEdit ? "Save Changes" : "Submit & finalise"}
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Thank you ---------------- */
function ThankYou({ isEdit, onDone }: { isEdit: boolean; onDone: () => void }) {
  const [format, setFormat] = useState<"a4" | "thermal">("a4");
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-white via-indigo-50/30 to-white">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-25" />
      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center px-4 py-10 text-center sm:px-6">
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 18 }} className="grid h-20 w-20 place-items-center rounded-full brand-gradient text-white shadow-glow">
          <CheckCircle2 className="h-10 w-10" />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="font-display mt-6 text-4xl font-extrabold tracking-tight md:text-5xl">
          {isEdit ? <><span className="brand-gradient-text">Ticket updated!</span></> : <>Thank you! <span className="brand-gradient-text">Ticket created.</span></>}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-2 max-w-md text-sm text-muted-foreground">
          {isEdit ? "Your changes have been saved. The ticket list will reflect the updates." : "A confirmation has been queued for SMS, WhatsApp and email. Choose how you'd like to print or share the receipt."}
        </motion.p>

        {!isEdit && (
          <>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { id: "a4", label: "A4 Receipt", desc: "Best for filing & email" },
                { id: "thermal", label: "Thermal Receipt", desc: "Quick counter print" },
              ].map((p) => {
                const active = format === (p.id as any);
                return (
                  <motion.button key={p.id} whileHover={{ y: -2 }} onClick={() => setFormat(p.id as any)} className={cn("rounded-2xl border bg-card p-5 text-left shadow-card transition", active ? "border-indigo-300 ring-2 ring-indigo-200/70" : "border-border")}>
                    <span className="grid h-12 w-12 place-items-center rounded-xl bg-indigo-50 text-brand-700 ring-1 ring-brand-200"><Printer className="h-5 w-5" /></span>
                    <p className="font-display mt-3 text-lg font-bold">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.desc}</p>
                  </motion.button>
                );
              })}
            </div>
            <div className="mt-6 flex w-full max-w-md flex-col gap-2 sm:flex-row">
              <Button variant="outline" size="lg" className="flex-1"><MessageCircle className="h-4 w-4 text-emerald-600" /> Share on WhatsApp</Button>
              <Button variant="outline" size="lg" className="flex-1"><Mail className="h-4 w-4 text-indigo-600" /> Share on Email</Button>
            </div>
            <Button size="xl" className="mt-3 w-full max-w-md" onClick={onDone}><Printer className="h-4 w-4" /> Print Ticket</Button>
          </>
        )}

        <button onClick={onDone} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to tickets
        </button>
      </div>
    </div>
  );
}
