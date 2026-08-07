"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight, Camera, Image as ImageIcon, FileSignature, ShieldCheck,
  CheckCircle2, Check, XCircle, MinusCircle, Mail, Phone, MessageCircle,
  Printer, FileText, Plus, Search, User, Building2, Sparkles, ListPlus,
  Upload, ArrowLeft, RotateCcw, Trash2, Package, AlertTriangle, Minus,
  Shield, ChevronDown, ChevronUp, StickyNote, CircleDot, ClipboardList, Clock,
  X, IndianRupee,
} from "lucide-react";
import { WizardShell } from "@/components/wizard/wizard-shell";
import { OptionGrid } from "@/components/wizard/option-grid";
import { CategoryWheel } from "@/components/wizard/category-wheel";
import { CreationSuccess } from "@/components/ui/creation-success";
import { CompletionScreen } from "@/components/completion/completion-screen";
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
import { getIssueLibrary, addIssueToLibrary, parseIssueString, serializeIssues } from "@/lib/issue-library";
import { createAssignedByOption } from "@/lib/assigned-by-data";
import { createAssignedToOption } from "@/lib/assigned-to-data";
import { loadDeviceCategories } from "@/lib/device-categories";

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

type WizardDeviceData = {
  brand: string;
  model: string;
  imei: string;
  imeiType: string;
  assignedBy: string;
  assignedTo: string;
  source: string;
  type: string;
};

type WizardJobData = {
  jobType: string;
  estimate: string;
  warranty: string;
  issue: string;
  priority: string;
  resolutionMinutes: string;
  customResolutionDate: string;
  accessories: string;
  description: string;
  notes: string;
};

type WizardPartData = {
  inventoryId: string;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
  total: number;
  uom: string;
};

/** A single device entry in the wizard — contains device info, job, parts, and QC */
type WizardDevice = {
  id: string;
  device: WizardDeviceData;
  job: WizardJobData;
  parts: WizardPartData[];
  qc: Record<string, "ok" | "no" | "na" | undefined>;
  category?: string;
};

function createWizardDevice(category?: string): WizardDevice {
  return {
    id: `wd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    device: { brand: "", model: "", imei: "", imeiType: "imei1", assignedBy: "", assignedTo: "", source: "", type: "" },
    job: { jobType: "service", estimate: "", warranty: "", issue: "", priority: "normal", resolutionMinutes: "", customResolutionDate: "", accessories: "", description: "", notes: "" },
    parts: [],
    qc: {},
    category,
  };
}

type WizardData = {
  process?: string;
  category?: string;
  /** Multi-device array — always has at least one entry */
  devices: WizardDevice[];
  /** Index of the currently active/expanded device */
  activeDeviceIndex: number;
  contactType: "personal" | "business";
  gstRate: number;
  customGstRate?: boolean;
  customer: { first: string; last: string; phone: string; email: string; address: string; postal: string; city: string; company: string };
  customerId: string | null;
  files: string[];
  signatureCleared: boolean;
  /* Backward-compat computed accessors — these alias into devices[activeDeviceIndex] */
};

/** Convenience: get the active device from wizard data */
function getActiveDevice(data: WizardData): WizardDevice {
  return data.devices[data.activeDeviceIndex] || data.devices[0];
}

const DEFAULT: WizardData = {
  devices: [createWizardDevice()],
  activeDeviceIndex: 0,
  contactType: "personal",
  gstRate: 18,
  customer: { first: "", last: "", phone: "", email: "", address: "", postal: "", city: "", company: "" },
  customerId: null,
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

  // If the ticket has multi-device records, restore them
  if (t.devices && t.devices.length > 0) {
    const devices: WizardDevice[] = t.devices.map((dr) => ({
      id: dr.id,
      device: {
        brand: dr.brand || "",
        model: dr.model || "",
        imei: dr.imei || "",
        imeiType: dr.imeiType || "imei1",
        assignedBy: dr.assignedBy || "",
        assignedTo: dr.assignedTo || "",
        source: dr.source || "",
        type: dr.type || "",
      },
      job: {
        jobType: dr.jobType || "service",
        estimate: String(dr.estimate || 0),
        warranty: dr.warranty || "",
        issue: dr.issue || "",
        priority: dr.priority || "normal",
        resolutionMinutes: dr.resolutionMinutes ? String(dr.resolutionMinutes) : "",
        customResolutionDate: (dr as any).customResolutionDate || "",
        accessories: dr.accessories || "",
        description: dr.description || "",
        notes: dr.notes || "",
      },
      parts: dr.parts ? dr.parts.map((p) => ({ inventoryId: p.inventoryId, name: p.name, sku: p.sku, qty: p.qty, unitPrice: p.unitPrice, total: p.total, uom: p.uom })) : [],
      qc: dr.qc || {},
      category: dr.category || category,
    }));

    return {
      process: "ticket",
      category,
      devices,
      activeDeviceIndex: 0,
      contactType: t.company ? "business" : "personal",
      gstRate: 18,
      customer: { first, last, phone: t.phone || "", email: t.email || "", address, postal, city, company: t.company || "" },
      customerId: (t as any).customerId || null,
      files: [],
      signatureCleared: false,
    };
  }

  // Legacy single-device ticket — wrap into devices array
  const singleDevice: WizardDevice = {
    id: `wd-legacy-${t.id}`,
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
      customResolutionDate: (t as any).customResolutionDate || "",
      accessories: "",
      description: t.issue,
      notes: t.internalNotes || "",
    },
    parts: t.parts ? t.parts.map((p) => ({ inventoryId: p.inventoryId, name: p.name, sku: p.sku, qty: p.qty, unitPrice: p.unitPrice, total: p.total, uom: p.uom })) : [],
    qc: {},
    category,
  };

  return {
    process: "ticket",
    category,
    devices: [singleDevice],
    activeDeviceIndex: 0,
    contactType: t.company ? "business" : "personal",
    gstRate: 18,
    customer: { first, last, phone: t.phone || "", email: t.email || "", address, postal, city, company: t.company || "" },
    customerId: (t as any).customerId || null,
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
  const fromPage = searchParams.get("from");
  const closeTarget = fromPage === "dashboard" ? "/dashboard" : "/tickets";
  const { tickets, addTicket, updateTicket, updateInventoryItem, inventory, customers, addCustomer, updateCustomer } = useStore();

  const [step, setStep] = useState(editId ? 3 : 1);
  const [data, setData] = useState<WizardData>(DEFAULT);
  const [submitted, setSubmitted] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [createdTicketId, setCreatedTicketId] = useState("");
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

  // Preload device categories + images on mount so the wheel renders instantly.
  useEffect(() => {
    loadDeviceCategories();
  }, []);

  // Track dirty state on data change (skip initial load)
  const [initialLoaded, setInitialLoaded] = useState(false);
  useEffect(() => {
    if (initialLoaded) setDirty(true);
    else setInitialLoaded(true);
  }, [data]);

  const next = () => setStep((s) => Math.min(s + 1, 11));
  const back = () => {
    if (step === 1) {
      attemptNav(closeTarget);
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
    const primaryDevice = data.devices[0];
    const allParts = data.devices.flatMap((d) => d.parts);
    const resMinutes = Number(primaryDevice.job.resolutionMinutes) || 59;
    const createdAt = isEdit ? (tickets.find((t) => t.id === editId)?.createdAt || new Date().toISOString()) : new Date().toISOString();
    // If a custom resolution date was set, use it directly as dueDate
    const dueDate = primaryDevice.job.customResolutionDate
      ? primaryDevice.job.customResolutionDate
      : new Date(new Date(createdAt).getTime() + resMinutes * 60_000).toISOString();

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

    // Build DeviceRecord[] for multi-device storage
    const deviceRecords: import("@/lib/mock-data").DeviceRecord[] = data.devices.map((wd) => ({
      id: wd.id,
      brand: wd.device.brand,
      model: wd.device.model,
      imei: wd.device.imei,
      imeiType: (wd.device.imeiType as "imei1" | "imei2" | "serial") || "imei1",
      category: wd.category || data.category || "",
      type: wd.device.type,
      source: wd.device.source,
      assignedBy: wd.device.assignedBy,
      assignedTo: wd.device.assignedTo,
      issue: wd.job.issue || wd.job.description || "General service",
      description: wd.job.description,
      jobType: wd.job.jobType,
      priority: (wd.job.priority as any) || "normal",
      warranty: wd.job.warranty,
      resolutionMinutes: Number(wd.job.resolutionMinutes) || 59,
      accessories: wd.job.accessories,
      notes: wd.job.notes,
      estimate: Number(wd.job.estimate) || wd.parts.reduce((s, p) => s + p.total, 0) || 0,
      parts: wd.parts.length > 0 ? wd.parts.map((p) => ({ ...p, status: "planned" as const })) : [],
      qc: wd.qc,
      status: "in_progress" as const,
    }));

    // Total amount across all devices
    const totalAmount = deviceRecords.reduce((s, dr) => s + dr.estimate, 0);

    const ticketData: Ticket = {
      id: editId || genId(),
      customer: customerName,
      phone: data.customer.phone || "+91 00000 00000",
      email: data.customer.email || undefined,
      address: [data.customer.address, data.customer.city, data.customer.postal].filter(Boolean).join(", ") || undefined,
      company: data.customer.company || undefined,
      // Primary device fields (backward compat — uses first device with data, or fallback)
      device: primaryDevice.device.brand || data.category || "others",
      model: deviceRecords.length > 1
        ? `${primaryDevice.device.model || primaryDevice.device.brand || "Device"} + ${deviceRecords.length - 1} more`
        : (primaryDevice.device.model || "Unknown Device"),
      issue: deviceRecords.length > 1
        ? `${deviceRecords.length} devices — ${primaryDevice.job.issue || "Repair"}`
        : (primaryDevice.job.issue || primaryDevice.job.description || "General service"),
      items: data.devices.filter((wd) => wd.device.imei).map((wd) => ({
        device: wd.device.brand || data.category || "others",
        model: wd.device.model || "Unknown Device",
        serial: wd.device.imei,
        issue: wd.job.issue || "General service",
        service: wd.job.issue || "Repair",
      })),
      parts: allParts.length > 0 ? allParts.map((p) => ({ ...p, status: "planned" as const })) : undefined,
      status: (isEdit ? (tickets.find((t) => t.id === editId)?.status || "in_progress") : "in_progress") as TicketStatus,
      priority: (primaryDevice.job.priority as any) || "normal",
      technician: primaryDevice.device.assignedTo || "Unassigned",
      createdAt,
      dueDate,
      resolutionMinutes: resMinutes,
      amount: totalAmount,
      service: deviceRecords.length > 1
        ? `${deviceRecords.length} device repair`
        : (primaryDevice.job.issue || "Repair"),
      source: primaryDevice.device.source || undefined,
      imeiType: primaryDevice.device.imei ? (primaryDevice.device.imeiType as "imei1" | "imei2" | "serial") || "imei1" : undefined,
      internalNotes: primaryDevice.job.notes || undefined,
      customerId: finalCustomerId || undefined,
      customerType: data.contactType as "personal" | "business",
      // Multi-device data — always store for data consistency
      devices: deviceRecords,
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
            lifetimeValue: cust.lifetimeValue + totalAmount,
          });
        }
      }
      // Reserve stock for parts (across all devices)
      if (allParts.length > 0) {
        allParts.forEach((p: any) => {
          const item = inventory.find((i: any) => i.id === p.inventoryId);
          if (item) {
            updateInventoryItem(p.inventoryId, { reservedStock: (item.reservedStock || 0) + p.qty });
          }
        });
      }
      setCreatedTicketId(ticketData.id);
      setShowSuccessAnimation(true);
    }
  };

  const handleSubmit = handleSave;

  if (showSuccessAnimation && !isEdit) {
    return (
      <CreationSuccess
        type="ticket"
        id={createdTicketId}
        onComplete={() => {
          setShowSuccessAnimation(false);
          setSubmitted(true);
        }}
      />
    );
  }

  if (submitted && !isEdit) {
    return (
      <CompletionScreen
        type="ticket"
        id={createdTicketId}
        onBack={() => router.push("/tickets")}
        onView={() => router.push(`/tickets/${createdTicketId}`)}
      />
    );
  }

  return (
    <>
      <WizardShell
        step={step}
        onBack={back}
        onClose={isEdit ? () => attemptNav(`/tickets/${editId}`) : undefined}
        closeHref={isEdit ? undefined : closeTarget}
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
              onChange={(id) => {
                const updatedDevices = data.devices.map((d, i) => i === data.activeDeviceIndex ? { ...d, category: id } : d);
                setData({ ...data, category: id, devices: updatedDevices });
              }}
              onNext={next}
              isEdit={isEdit}
            />
          )}
          {step === 3 && <DeviceForm data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 4 && <JobDetailsForm data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 5 && <PartsAssignment data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 6 && <ContactSearch data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 7 && <CustomerForm data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 8 && <QuoteSummary data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 9 && <QCForm data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 10 && <UploadStep data={data} setData={setData} onNext={next} isEdit={isEdit} />}
          {step === 11 && <ConfirmationStep onSubmit={handleSubmit} isEdit={isEdit} data={data} />}
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

const PROCESS_CARDS: {
  id: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  gradient: string;
  accentColor: string;
  badge?: string;
}[] = [
  {
    id: "ticket",
    title: "New Ticket",
    desc: "Create a new repair ticket and track progress",
    icon: <ClipboardList className="h-6 w-6" />,
    gradient: "from-blue-400/80 to-blue-600/80",
    accentColor: "#4361EE",
    badge: "Popular",
  },
  {
    id: "invoice",
    title: "New Invoice",
    desc: "Create bill, manage payments and send invoices",
    icon: <FileText className="h-6 w-6" />,
    gradient: "from-emerald-400/80 to-emerald-600/80",
    accentColor: "#10B981",
  },
  {
    id: "stock",
    title: "Add Stock",
    desc: "Add new inventory items to your store",
    icon: <Package className="h-6 w-6" />,
    gradient: "from-orange-400/80 to-orange-600/80",
    accentColor: "#F59E0B",
  },
  {
    id: "walkin",
    title: "Walk-In",
    desc: "Quick counter billing for walk-in customers",
    icon: <Building2 className="h-6 w-6" />,
    gradient: "from-violet-400/80 to-violet-600/80",
    accentColor: "#8B5CF6",
  },
  {
    id: "estimate",
    title: "Estimate",
    desc: "Send quote and estimated cost to your customer",
    icon: <IndianRupee className="h-6 w-6" />,
    gradient: "from-teal-400/80 to-teal-600/80",
    accentColor: "#14B8A6",
  },
  {
    id: "warranty",
    title: "Warranty",
    desc: "Claim or warranty check process",
    icon: <Shield className="h-6 w-6" />,
    gradient: "from-rose-400/80 to-rose-600/80",
    accentColor: "#F43F5E",
  },
];

function ProcessSelector({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  return (
    <div className="max-w-[660px] mx-auto">
      {/* Decorative background elements */}
      <div className="pointer-events-none absolute top-20 left-8 h-2 w-2 rounded-full bg-[#4361EE]/20 animate-pulse-dot" />
      <div className="pointer-events-none absolute top-32 left-12 h-1.5 w-1.5 rounded-full bg-[#4361EE]/15" />
      <div className="pointer-events-none absolute top-24 right-16 h-1.5 w-1.5 rounded-full bg-[#4361EE]/15 animate-pulse-dot" style={{ animationDelay: "0.5s" }} />

      {/* Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROCESS_CARDS.map((card, i) => {
          const isSelected = value === card.id;
          return (
            <motion.button
              key={card.id}
              type="button"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.07 * i + 0.1, duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
              whileHover={{
                y: -6,
                scale: 1.02,
                transition: { type: "spring", stiffness: 400, damping: 25, mass: 0.8 },
              }}
              whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
              onClick={() => onChange(card.id)}
              className={cn(
                "group relative flex flex-col items-center text-center rounded-2xl border p-3 sm:p-4 cursor-pointer",
                "transition-[background,border-color,box-shadow] duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
                "backdrop-blur-sm",
                "shadow-[0_1px_3px_rgba(20,30,80,0.04),0_4px_12px_-4px_rgba(20,30,80,0.06)]",
                // Hover: light blue background + stronger shadow + blue border
                "hover:bg-[#EEF2FF] hover:shadow-[0_12px_40px_-8px_rgba(67,97,238,0.22),0_4px_16px_-2px_rgba(20,30,80,0.08)]",
                "hover:border-[#4361EE]/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40 focus-visible:ring-offset-2",
                // Selected vs default
                isSelected
                  ? "bg-[#EEF2FF] border-[#4361EE] shadow-[0_0_0_1px_rgba(67,97,238,0.15),0_12px_32px_-6px_rgba(67,97,238,0.22)] ring-1 ring-[#4361EE]/20"
                  : "bg-white/80 border-white/60 dark:border-zinc-700/60"
              )}
              aria-label={`Create ${card.title}`}
            >
              {/* Badge */}
              {card.badge && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4, duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                  className="absolute top-2.5 left-2.5 flex items-center gap-0.5 rounded-full bg-[#4361EE] px-2 py-[1px] text-[9px] font-semibold text-white shadow-sm"
                >
                  <Sparkles className="h-2 w-2" />
                  {card.badge}
                </motion.span>
              )}

              {/* Icon Circle — scales on hover via group */}
              <span
                className={cn(
                  "relative grid h-12 w-12 place-items-center rounded-full text-white",
                  "bg-gradient-to-br shadow-lg",
                  "transition-transform duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
                  "group-hover:scale-[1.12]",
                  card.gradient
                )}
                style={{
                  boxShadow: `0 8px 24px -6px ${card.accentColor}50`,
                }}
              >
                {card.icon}
                {/* Sparkle decorations — reveal on hover */}
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 text-[#4361EE]/60 opacity-0 group-hover:opacity-100 transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                  <svg viewBox="0 0 8 8" fill="currentColor"><path d="M4 0l.7 2.3L7 3l-2.3.7L4 6l-.7-2.3L1 3l2.3-.7z" /></svg>
                </span>
                <span className="absolute -bottom-0.5 -left-1 h-1.5 w-1.5 text-[#4361EE]/40 opacity-0 group-hover:opacity-100 transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-110 group-hover:translate-y-0.5 group-hover:-translate-x-0.5" style={{ transitionDelay: "60ms" }}>
                  <svg viewBox="0 0 8 8" fill="currentColor"><path d="M4 0l.7 2.3L7 3l-2.3.7L4 6l-.7-2.3L1 3l2.3-.7z" /></svg>
                </span>
              </span>

              {/* Title */}
              <h3 className="mt-2 text-[13px] font-bold text-zinc-800 tracking-tight transition-colors duration-[350ms] group-hover:text-[#2A3AB8]">{card.title}</h3>

              {/* Description */}
              <p className="mt-1 text-[11px] text-zinc-500 leading-relaxed max-w-[180px]">{card.desc}</p>

              {/* Arrow Button — magnetic hover physics */}
              <span
                className={cn(
                  "mt-2.5 grid h-7 w-7 place-items-center rounded-full",
                  "transition-all duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
                  isSelected
                    ? "bg-[#4361EE] text-white shadow-[0_4px_16px_-2px_rgba(67,97,238,0.5)]"
                    : "bg-[#4361EE] text-white shadow-sm",
                  "group-hover:shadow-[0_6px_20px_-2px_rgba(67,97,238,0.5)] group-hover:scale-[1.15]"
                )}
              >
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-[350ms] ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-[3px]" />
              </span>

              {/* Bottom accent line — animates width on hover */}
              <span
                className={cn(
                  "absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full",
                  "transition-all duration-[400ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
                  isSelected ? "w-[calc(100%-2rem)] opacity-100" : "w-[40%] opacity-50 group-hover:w-[calc(100%-2rem)] group-hover:opacity-100"
                )}
                style={{
                  background: `linear-gradient(90deg, transparent, ${card.accentColor}, transparent)`,
                }}
              />
            </motion.button>
          );
        })}
      </div>

      {/* Premium Tip Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
        className="mt-5 mx-auto max-w-sm flex items-center gap-2.5 rounded-xl border border-border/50 bg-white/60 backdrop-blur-sm px-4 py-2 shadow-[0_1px_4px_rgba(20,30,80,0.03)]"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-500 text-xs">
          💡
        </span>
        <p className="text-[11px] text-zinc-500 leading-snug">
          <span className="font-semibold text-zinc-700">Tip:</span> You can access these options anytime from the sidebar.
        </p>
      </motion.div>
    </div>
  );
}

/* ---------------- Helpers ---------------- */
function titleFor(step: number) {
  return [
    "What would you like to do today?",
    "Select Your Category",
    "Device Details",
    "Job Details",
    "Assign Items / Parts to Service",
    "Search Contact",
    "Customer Information",
    "Quotation Summary",
    "Pre-Quality Check",
    "Upload Photos & Documents",
    "Ticket Confirmation",
  ][step - 1];
}
function subtitleFor(step: number) {
  return [
    "Choose a process to get started. We'll handle the rest.",
    "What kind of device is it?",
    "Capture brand, model and identifiers.",
    "Capture job type, priority and repair notes.",
    "Add spare parts and services consumed.",
    "Find an existing contact, or add a new one.",
    "Make sure the customer details are correct.",
    "Review the estimate before approval.",
    "Tick the visible condition checkpoints.",
    "Attach device photos and any paperwork.",
    "Verify all details before creating the ticket.",
  ][step - 1];
}

/* ---------------- Step 3: Device Details (Simplified) ---------------- */
function DeviceForm({ data, setData, onNext, isEdit }: any) {
  const { brands, deviceModels, addBrand, addDeviceModel, assignedByOptions, addAssignedByOption, assignedToOptions, addAssignedToOption } = useStore();
  const activeIdx = data.activeDeviceIndex;
  const activeDevice = data.devices[activeIdx];
  const d = activeDevice.device;

  // Ref for auto-scrolling to the active form
  const formRef = useRef<HTMLDivElement>(null);

  // Update a field on the active device
  const set = (k: string, v: string) => {
    const updatedDevices = data.devices.map((dev: WizardDevice, i: number) =>
      i === activeIdx ? { ...dev, device: { ...dev.device, [k]: v } } : dev
    );
    setData({ ...data, devices: updatedDevices });
  };

  // Add a new device
  const addNewDevice = () => {
    const newDevice = createWizardDevice(data.category);
    setData({
      ...data,
      devices: [...data.devices, newDevice],
      activeDeviceIndex: data.devices.length,
    });
    // Scroll to the form after React renders the new device
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  // Remove a device (prevent removing the last one)
  const removeDevice = (idx: number) => {
    if (data.devices.length <= 1) return;
    const updatedDevices = data.devices.filter((_: any, i: number) => i !== idx);
    const newActiveIdx = activeIdx >= updatedDevices.length
      ? updatedDevices.length - 1
      : activeIdx > idx ? activeIdx - 1 : activeIdx;
    setData({ ...data, devices: updatedDevices, activeDeviceIndex: newActiveIdx });
  };

  // Switch active device
  const switchDevice = (idx: number) => {
    setData({ ...data, activeDeviceIndex: idx });
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

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

  // Add New Assigned By modal state
  const [showNewAssignedBy, setShowNewAssignedBy] = useState(false);
  const [newAssignedByName, setNewAssignedByName] = useState("");

  // Add New Assigned To modal state
  const [showNewAssignedTo, setShowNewAssignedTo] = useState(false);
  const [newAssignedToName, setNewAssignedToName] = useState("");

  // Sync local queries when active device changes
  useEffect(() => {
    setBrandQuery(activeDevice.device.brand || "");
    setModelQuery(activeDevice.device.model || "");
  }, [activeIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Find selected brand id for filtering models
  const selectedBrand = brands.find((b) => b.name.toLowerCase() === (d.brand || brandQuery).toLowerCase().trim());

  // Search results
  const brandResults = searchBrands(brands, brandQuery);
  const modelResults = selectedBrand
    ? (modelQuery.trim() ? searchModels(deviceModels, selectedBrand.id, modelQuery) : getModelsForBrand(deviceModels, selectedBrand.id))
    : [];

  // Brand selection
  const handleBrandSelect = (b: Brand) => {
    const shouldClearModel = d.brand.toLowerCase() !== b.name.toLowerCase();
    const updatedDevices = data.devices.map((dev: WizardDevice, i: number) =>
      i === activeIdx ? { ...dev, device: { ...dev.device, brand: b.name, ...(shouldClearModel ? { model: "" } : {}) } } : dev
    );
    setData({ ...data, devices: updatedDevices });
    setBrandQuery(b.name);
    setBrandOpen(false);
    if (shouldClearModel) setModelQuery("");
  };

  // Save new brand
  const handleSaveNewBrand = () => {
    if (!newBrandName.trim()) return;
    const brand = createBrand(newBrandName.trim());
    addBrand(brand);
    const updatedDevices = data.devices.map((dev: WizardDevice, i: number) =>
      i === activeIdx ? { ...dev, device: { ...dev.device, brand: brand.name, model: "" } } : dev
    );
    setData({ ...data, devices: updatedDevices });
    setBrandQuery(brand.name);
    setModelQuery("");
    setShowNewBrand(false);
    setNewBrandName("");
    setBrandOpen(false);
  };

  // Model selection
  const handleModelSelect = (m: DeviceModel) => {
    const brandForModel = brands.find((br: Brand) => br.id === m.brandId);
    const updatedDevices = data.devices.map((dev: WizardDevice, i: number) =>
      i === activeIdx ? { ...dev, device: { ...dev.device, model: m.name, ...(brandForModel && !d.brand ? { brand: brandForModel.name } : {}) } } : dev
    );
    setData({ ...data, devices: updatedDevices });
    setModelQuery(m.name);
    setModelOpen(false);
    if (brandForModel && !d.brand) setBrandQuery(brandForModel.name);
  };

  // Save new model
  const handleSaveNewModel = () => {
    if (!newModelName.trim() || !selectedBrand) return;
    const model = createDeviceModel(selectedBrand.id, newModelName.trim());
    addDeviceModel(model);
    const updatedDevices = data.devices.map((dev: WizardDevice, i: number) =>
      i === activeIdx ? { ...dev, device: { ...dev.device, model: model.name } } : dev
    );
    setData({ ...data, devices: updatedDevices });
    setModelQuery(model.name);
    setShowNewModel(false);
    setNewModelName("");
    setModelOpen(false);
  };

  return (
    <div className="space-y-3" role="region" aria-label="Device details">
      {/* Collapsed Device Cards (for devices other than active) */}
      {data.devices.length > 1 && (
        <div className="space-y-2" role="list" aria-label="Added devices">
          {data.devices.map((dev: WizardDevice, idx: number) => {
            if (idx === activeIdx) return null;
            const brandModel = [dev.device.brand, dev.device.model].filter(Boolean).join(" ");
            const summary = brandModel || "Untitled Device";
            const issue = dev.job.issue || dev.job.description || "";
            const imeiSnippet = dev.device.imei ? `${dev.device.imeiType === "serial" ? "SN" : "IMEI"}: …${dev.device.imei.slice(-4)}` : "";
            const hasMinInfo = !!(dev.device.brand && dev.device.model);
            return (
              <motion.div
                key={dev.id}
                role="listitem"
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all hover:border-[#B3BFF6] hover:shadow-card"
              >
                <span className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[13px] font-bold transition-colors",
                  hasMinInfo ? "bg-[#EEF1FD] text-[#4361EE]" : "bg-amber-50 text-amber-600"
                )}>
                  {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => switchDevice(idx)}
                  className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40 rounded-lg px-1 -mx-1"
                  aria-label={`Switch to device ${idx + 1}: ${summary}`}
                >
                  <p className="text-sm font-semibold truncate">{summary}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {[issue, imeiSnippet].filter(Boolean).join(" · ") || "Tap to edit"}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => switchDevice(idx)}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[#4361EE] opacity-0 group-hover:opacity-100 hover:bg-[#EEF1FD] transition-all focus:opacity-100 focus-visible:ring-2 focus-visible:ring-[#4361EE]/40"
                  aria-label={`Edit device ${idx + 1}`}
                  tabIndex={-1}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeDevice(idx)}
                  className="shrink-0 rounded-lg p-1.5 text-rose-400 opacity-0 group-hover:opacity-100 hover:text-rose-600 hover:bg-rose-50 transition-all focus:opacity-100 focus-visible:ring-2 focus-visible:ring-rose-300"
                  aria-label={`Remove device ${idx + 1}: ${summary}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Active device label */}
      {data.devices.length > 1 && (
        <div className="flex items-center gap-2 pt-1">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#4361EE] text-[11px] font-bold text-white shadow-sm">
            {activeIdx + 1}
          </span>
          <p className="text-[12px] font-semibold text-[#4361EE] tracking-tight">
            Device {activeIdx + 1} of {data.devices.length}
          </p>
        </div>
      )}

    <div ref={formRef} className={FORM_CARD_COMPACT}>
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 lg:grid-cols-2">
        {/* Left Column — Device Identity */}
        <div className="space-y-2">
          <SectionLabel icon={Package}>Device Identity</SectionLabel>
          <div className="grid grid-cols-1 gap-x-2 gap-y-2 sm:grid-cols-2">
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
                  className="h-[34px]"
                  iconLeft={<Search className="h-3.5 w-3.5" />}
                  iconRight={<ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", brandOpen && "rotate-180")} />}
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
                  className="h-[34px]"
                  iconLeft={<Search className="h-3.5 w-3.5" />}
                  iconRight={<ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", modelOpen && "rotate-180")} />}
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
              <Field label="IMEI / Serial Number"><Input value={d.imei} onChange={(e: any) => set("imei", e.target.value)} placeholder="356xxxxxxxxxx" className="h-[34px] font-mono" /></Field>
            </div>
          </div>
        </div>

        {/* Right Column — Intake */}
        <div className="space-y-2">
          <SectionLabel icon={ListPlus}>Intake Details</SectionLabel>
          <div className="grid grid-cols-1 gap-x-2 gap-y-2 sm:grid-cols-2">
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
            <Field label="Assigned By">
              <RSelect
                value={d.assignedBy}
                onChange={(v) => set("assignedBy", v)}
                placeholder="Select…"
                searchable
                onAddNew={(name) => {
                  setNewAssignedByName(name);
                  setShowNewAssignedBy(true);
                }}
                options={assignedByOptions.map((o) => ({ label: o.name, value: o.id }))}
              />
            </Field>
            <Field label="Assigned To">
              <RSelect
                value={d.assignedTo}
                onChange={(v) => set("assignedTo", v)}
                placeholder="Select technician…"
                searchable
                onAddNew={(name) => {
                  setNewAssignedToName(name);
                  setShowNewAssignedTo(true);
                }}
                options={assignedToOptions.map((o) => ({ label: o.name, value: o.id }))}
              />
            </Field>
          </div>
        </div>
      </div>

      {/* + Add Device & Next */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <motion.button
          type="button"
          onClick={addNewDevice}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD]/30 px-3 py-2 text-[12px] font-semibold text-[#4361EE] transition-all hover:bg-[#EEF1FD] hover:border-[#4361EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40"
          aria-label={`Add another device to this ticket (currently ${data.devices.length} device${data.devices.length > 1 ? "s" : ""})`}
        >
          <Plus className="h-4 w-4" />
          <span>Add Device</span>
          {data.devices.length > 1 && (
            <span className="ml-1 grid h-5 w-5 place-items-center rounded-full bg-[#4361EE]/10 text-[10px] font-bold text-[#4361EE]">
              {data.devices.length}
            </span>
          )}
        </motion.button>
        {!isEdit && (
          <Button size="sm" onClick={onNext}>Next <ArrowRight className="h-3.5 w-3.5" /></Button>
        )}
      </div>

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

      {/* Add New Assigned By Modal */}
      {showNewAssignedBy && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={() => setShowNewAssignedBy(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-border p-5">
            <h3 className="text-base font-bold">Add New Assigned By</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">This name will be saved permanently and available in future tickets.</p>
            <div className="mt-4 space-y-1">
              <Label>Name</Label>
              <Input value={newAssignedByName} onChange={(e: any) => setNewAssignedByName(e.target.value)} placeholder="e.g. Front Desk, Counter 1" className="h-11" autoFocus />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowNewAssignedBy(false); setNewAssignedByName(""); }}>Cancel</Button>
              <Button size="sm" disabled={!newAssignedByName.trim()} onClick={() => {
                const option = createAssignedByOption(newAssignedByName.trim());
                addAssignedByOption(option);
                set("assignedBy", option.id);
                setShowNewAssignedBy(false);
                setNewAssignedByName("");
              }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Save
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add New Assigned To Modal */}
      {showNewAssignedTo && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={() => setShowNewAssignedTo(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-border p-5">
            <h3 className="text-base font-bold">Add New Technician</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">This name will be saved permanently and available in future tickets.</p>
            <div className="mt-4 space-y-1">
              <Label>Name</Label>
              <Input value={newAssignedToName} onChange={(e: any) => setNewAssignedToName(e.target.value)} placeholder="e.g. Anand, Pooja" className="h-11" autoFocus />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowNewAssignedTo(false); setNewAssignedToName(""); }}>Cancel</Button>
              <Button size="sm" disabled={!newAssignedToName.trim()} onClick={() => {
                const option = createAssignedToOption(newAssignedToName.trim());
                addAssignedToOption(option);
                set("assignedTo", option.id);
                setShowNewAssignedTo(false);
                setNewAssignedToName("");
              }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Save
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
    </div>
  );
}

/* ---------------- Step 4: Job Details ---------------- */
function JobDetailsForm({ data, setData, onNext, isEdit }: any) {
  const activeIdx = data.activeDeviceIndex;
  const activeDevice = data.devices[activeIdx];
  const j = activeDevice.job;
  const set = (k: string, v: string) => {
    const updatedDevices = data.devices.map((dev: WizardDevice, i: number) =>
      i === activeIdx ? { ...dev, job: { ...dev.job, [k]: v } } : dev
    );
    setData({ ...data, devices: updatedDevices });
  };

  // Custom date/time picker state
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customDate, setCustomDate] = useState<Date | null>(j.customResolutionDate ? new Date(j.customResolutionDate) : null);
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [pickerHour, setPickerHour] = useState(customDate ? customDate.getHours() % 12 || 12 : 4);
  const [pickerMinute, setPickerMinute] = useState(customDate ? customDate.getMinutes() : 30);
  const [pickerAmPm, setPickerAmPm] = useState<"AM" | "PM">(customDate ? (customDate.getHours() >= 12 ? "PM" : "AM") : "PM");

  const handleResolutionChange = (v: string) => {
    if (v === "custom") {
      setShowCustomPicker(true);
    } else {
      set("resolutionMinutes", v);
      // Clear custom date when a preset is selected
      const updatedDevices = data.devices.map((dev: WizardDevice, i: number) =>
        i === activeIdx ? { ...dev, job: { ...dev.job, resolutionMinutes: v, customResolutionDate: "" } } : dev
      );
      setData({ ...data, devices: updatedDevices });
    }
  };

  const confirmCustomDate = () => {
    if (!customDate) return;
    const finalDate = new Date(customDate);
    const hours = pickerAmPm === "PM" ? (pickerHour === 12 ? 12 : pickerHour + 12) : (pickerHour === 12 ? 0 : pickerHour);
    finalDate.setHours(hours, pickerMinute, 0, 0);
    // Calculate minutes from now
    const minutesFromNow = Math.max(1, Math.round((finalDate.getTime() - Date.now()) / 60000));
    const updatedDevices = data.devices.map((dev: WizardDevice, i: number) =>
      i === activeIdx ? { ...dev, job: { ...dev.job, resolutionMinutes: String(minutesFromNow), customResolutionDate: finalDate.toISOString() } } : dev
    );
    setData({ ...data, devices: updatedDevices });
    setShowCustomPicker(false);
  };

  // Format custom date for display
  const customResLabel = j.customResolutionDate ? (() => {
    const d = new Date(j.customResolutionDate);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + " • " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  })() : null;

  // Calendar helpers
  const getDaysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className={FORM_CARD_COMPACT}>
      <DeviceSwitcher data={data} setData={setData} />
      <div className="grid grid-cols-1 gap-x-4 lg:grid-cols-2 lg:items-stretch">
        {/* Left Column — Job Overview */}
        <div className="flex flex-col">
          <SectionLabel icon={ClipboardList}>Job Overview</SectionLabel>
          <div className="mt-2 grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-2">
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
              {customResLabel ? (
                <button
                  type="button"
                  onClick={() => setShowCustomPicker(true)}
                  className="flex h-[34px] w-full items-center justify-between gap-2 rounded-xl border border-[#C0392B]/30 bg-[#C0392B]/[0.04] px-3 text-[13px] font-medium text-[#922B21] transition hover:border-[#C0392B]/50"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Clock className="h-3.5 w-3.5 text-[#C0392B]/70" />
                    {customResLabel}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#C0392B]/50" />
                </button>
              ) : (
                <RSelect value={j.resolutionMinutes} onChange={handleResolutionChange} placeholder="Default (59 min)" options={[
                  { label: "30 Minutes", value: "30" },
                  { label: "45 Minutes", value: "45" },
                  { label: "1 Hour", value: "60" },
                  { label: "2 Hours", value: "120" },
                  { label: "4 Hours", value: "240" },
                  { label: "8 Hours (End of Day)", value: "480" },
                  { label: "Custom Date & Time", value: "custom" },
                ]} />
              )}
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Issue">
              <IssueSelector
                value={j.issue}
                onChange={(v) => set("issue", v)}
                className="min-h-[82px] items-start py-1.5"
              />
            </Field>
          </div>
          <div className="mt-auto pt-2">
            <Field label="User Accessories"><Input value={j.accessories} onChange={(e: any) => set("accessories", e.target.value)} placeholder="e.g. Charger, case, SIM tray received" className="h-[34px]" /></Field>
          </div>
        </div>

        {/* Right Column — Notes & Estimate */}
        <div className="flex flex-col">
          <SectionLabel icon={StickyNote}>Notes & Estimate</SectionLabel>
          <div className="mt-2">
            <Field label="Problem Description">
              <Textarea
                value={j.description}
                onChange={(e: any) => set("description", e.target.value)}
                placeholder="Customer reported intermittent reboots when charging…"
                rows={3}
                className="min-h-0 h-[103px] border-[#F0E68C]/70 bg-[#FFFDE7] placeholder:text-foreground/50 focus:border-amber-400 focus:ring-amber-300/20 hover:border-amber-400/60"
              />
            </Field>
          </div>
          <div className="mt-2">
            <Field label="Internal Notes">
              <Textarea
                value={j.notes}
                onChange={(e: any) => set("notes", e.target.value)}
                placeholder="Visible water damage on bottom left"
                rows={3}
                className="min-h-0 h-[82px] border-[#F0E68C]/70 bg-[#FFFDE7] placeholder:text-foreground/50 focus:border-amber-400 focus:ring-amber-300/20 hover:border-amber-400/60"
              />
            </Field>
          </div>
          <div className="mt-auto pt-2">
            <Field label="Estimate">
              <Input
                value={j.estimate}
                onChange={(e: any) => {
                  const v = e.target.value.replace(/[^0-9.]/g, "");
                  set("estimate", v);
                }}
                placeholder="0"
                inputMode="numeric"
                className="h-[34px] tabular-nums pl-9 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
                iconLeft={<IndianRupee className="h-3.5 w-3.5" />}
              />
            </Field>
          </div>
        </div>
      </div>
      {!isEdit && (
        <div className="mt-2.5 flex justify-end">
          <Button size="sm" onClick={onNext}>Next <ArrowRight className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      {/* Custom Date & Time Picker Modal */}
      {showCustomPicker && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={() => setShowCustomPicker(false)}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-border p-5">
            <h3 className="text-base font-bold">Select Resolution Date & Time</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">Choose a custom expected resolution deadline.</p>

            {/* Month/Year Navigation */}
            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={() => { if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(pickerYear - 1); } else setPickerMonth(pickerMonth - 1); }}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted transition">
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm font-semibold">{MONTHS[pickerMonth]} {pickerYear}</span>
              <button type="button" onClick={() => { if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(pickerYear + 1); } else setPickerMonth(pickerMonth + 1); }}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border hover:bg-muted transition">
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="mt-3">
              <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-muted-foreground mb-1">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span key={d}>{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: getFirstDayOfMonth(pickerMonth, pickerYear) }).map((_, i) => <span key={`e-${i}`} />)}
                {Array.from({ length: getDaysInMonth(pickerMonth, pickerYear) }).map((_, i) => {
                  const day = i + 1;
                  const thisDate = new Date(pickerYear, pickerMonth, day);
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  const isPast = thisDate < today;
                  const isSelected = customDate && customDate.getDate() === day && customDate.getMonth() === pickerMonth && customDate.getFullYear() === pickerYear;
                  const isToday = thisDate.getTime() === today.getTime();
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={isPast}
                      onClick={() => setCustomDate(new Date(pickerYear, pickerMonth, day))}
                      className={cn(
                        "h-8 w-full rounded-lg text-[12px] font-medium transition",
                        isPast && "text-muted-foreground/40 cursor-not-allowed",
                        !isPast && !isSelected && "hover:bg-[#EEF1FD] hover:text-[#4361EE]",
                        isSelected && "bg-[#4361EE] text-white shadow-sm",
                        isToday && !isSelected && "ring-1 ring-[#4361EE]/40"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Picker */}
            <div className="mt-4 flex items-center gap-2">
              <div className="flex-1">
                <Label className="text-[10px]">Hour</Label>
                <select value={pickerHour} onChange={(e) => setPickerHour(Number(e.target.value))}
                  className="h-10 w-full rounded-xl border border-border bg-card px-2 text-sm font-medium focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <span className="mt-4 text-lg font-bold text-muted-foreground">:</span>
              <div className="flex-1">
                <Label className="text-[10px]">Minute</Label>
                <select value={pickerMinute} onChange={(e) => setPickerMinute(Number(e.target.value))}
                  className="h-10 w-full rounded-xl border border-border bg-card px-2 text-sm font-medium focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15">
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <Label className="text-[10px]">AM/PM</Label>
                <select value={pickerAmPm} onChange={(e) => setPickerAmPm(e.target.value as "AM" | "PM")}
                  className="h-10 w-full rounded-xl border border-border bg-card px-2 text-sm font-medium focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15">
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCustomPicker(false)}>Cancel</Button>
              <Button size="sm" onClick={confirmCustomDate} disabled={!customDate}>
                <Check className="h-3.5 w-3.5" /> Confirm
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

const FORM_CARD = "rounded-[20px] border border-[#E2E8F8]/80 bg-[#F7FAFF] p-6 sm:p-8 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(67,97,238,0.06)]";
const FORM_CARD_COMPACT = "rounded-[16px] border border-[#E2E8F8]/80 bg-[#F7FAFF] px-5 py-3 sm:px-6 sm:py-3.5 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(67,97,238,0.06)]";

/** Inline device tab switcher — shown above Job Details & Parts steps when multiple devices exist */
function DeviceSwitcher({ data, setData }: { data: any; setData: (d: any) => void }) {
  if (data.devices.length <= 1) return null;
  const activeIdx = data.activeDeviceIndex;
  return (
    <div className="mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="Select device">
      {data.devices.map((dev: WizardDevice, idx: number) => {
        const label = [dev.device.brand, dev.device.model].filter(Boolean).join(" ") || `Device ${idx + 1}`;
        const isActive = idx === activeIdx;
        return (
          <button
            key={dev.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => setData({ ...data, activeDeviceIndex: idx })}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-all",
              isActive
                ? "bg-[#4361EE] text-white shadow-sm"
                : "bg-white border border-border text-muted-foreground hover:border-[#B3BFF6] hover:text-foreground"
            )}
          >
            <span className={cn(
              "grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold",
              isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
            )}>
              {idx + 1}
            </span>
            <span className="max-w-[120px] truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="grid h-5 w-5 place-items-center rounded-md bg-[#EEF1FD] text-[#4361EE]">
        <Icon className="h-3 w-3" />
      </span>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
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

/* ── Issue Multi-Select with search, pills, and "create new" ── */
function IssueSelector({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<string[]>(() => getIssueLibrary());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = parseIssueString(value);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = library.filter(
    (item) =>
      !selected.some((s) => s.toLowerCase() === item.toLowerCase()) &&
      item.toLowerCase().includes(query.trim().toLowerCase())
  );

  const addIssue = (issue: string) => {
    const trimmed = issue.trim();
    if (!trimmed) return;
    if (selected.some((s) => s.toLowerCase() === trimmed.toLowerCase())) return;
    const updated = [...selected, trimmed];
    onChange(serializeIssues(updated));
    // Also persist to the library
    const newLib = addIssueToLibrary(trimmed);
    setLibrary(newLib);
    setQuery("");
  };

  const removeIssue = (issue: string) => {
    const updated = selected.filter((s) => s.toLowerCase() !== issue.toLowerCase());
    onChange(serializeIssues(updated));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      addIssue(query);
    }
    if (e.key === "Backspace" && !query && selected.length > 0) {
      removeIssue(selected[selected.length - 1]);
    }
  };

  const showCreate = query.trim() && !library.some((i) => i.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger / pill container */}
      <div
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        className={cn(
          "flex min-h-[44px] max-h-[110px] w-full flex-wrap items-center gap-1.5 overflow-y-auto rounded-xl border bg-card px-3 py-2 text-sm transition-all duration-150 cursor-text",
          open
            ? "border-[#4361EE] ring-2 ring-[#4361EE]/15"
            : "border-border hover:border-[#4361EE]/40",
          className
        )}
      >
        {selected.map((issue) => (
          <span
            key={issue}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1.5 text-[13px] font-medium text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/40"
          >
            {issue}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeIssue(issue); }}
              className="grid h-4 w-4 place-items-center rounded-full hover:bg-[#4361EE]/10 transition"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected.length === 0 ? "Search or add issues…" : "Add more…"}
          className="min-w-[100px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-border bg-card p-1 shadow-lg max-h-60 overflow-y-auto">
          {showCreate && (
            <button
              type="button"
              onClick={() => addIssue(query)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[#EEF1FD]/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-[#4361EE]" />
              <span>Create &ldquo;<span className="font-medium text-[#4361EE]">{query.trim()}</span>&rdquo;</span>
            </button>
          )}
          {filtered.length > 0 ? (
            filtered.slice(0, 15).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => addIssue(item)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[#EEF1FD]/60 transition-colors"
              >
                <span className="grid h-4 w-4 shrink-0 place-items-center text-muted-foreground opacity-0">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="truncate">{item}</span>
              </button>
            ))
          ) : !showCreate ? (
            <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No issues found</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/* ---------------- Step 5: Parts (Inventory Integrated) ---------------- */
function PartsAssignment({ data, setData, onNext, isEdit }: any) {
  const { inventory } = useStore();
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  const activeIdx = data.activeDeviceIndex;
  const activeDevice = data.devices[activeIdx];
  const parts = activeDevice.parts;

  const total = parts.reduce((s: number, p: any) => s + Number(p.total || 0), 0);

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

  const updateDeviceParts = (newParts: any[]) => {
    const updatedDevices = data.devices.map((dev: WizardDevice, i: number) =>
      i === activeIdx ? { ...dev, parts: newParts } : dev
    );
    setData({ ...data, devices: updatedDevices });
  };

  const addPart = (item: InventoryItem) => {
    // Check if already added
    if (parts.some((p: any) => p.inventoryId === item.id)) return;
    const newPart = {
      inventoryId: item.id,
      name: item.name,
      sku: item.id,
      qty: 1,
      unitPrice: item.regularSellingPrice,
      total: item.regularSellingPrice,
      uom: item.uom,
    };
    updateDeviceParts([...parts, newPart]);
    setQuery("");
    setShowResults(false);
  };

  const removePart = (idx: number) => {
    updateDeviceParts(parts.filter((_: any, i: number) => i !== idx));
  };

  const updateQty = (idx: number, delta: number) => {
    updateDeviceParts(
      parts.map((p: any, i: number) => {
        if (i !== idx) return p;
        const newQty = Math.max(1, p.qty + delta);
        return { ...p, qty: newQty, total: newQty * p.unitPrice };
      })
    );
  };

  return (
    <div className="rounded-[20px] border border-[#E2E8F8]/80 bg-[#F7FAFF] p-6 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(67,97,238,0.06)] sm:p-8">
      <DeviceSwitcher data={data} setData={setData} />
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
              const alreadyAdded = parts.some((p: any) => p.inventoryId === item.id);
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
        {parts.length > 0 ? (
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
                {parts.map((p: any, i: number) => {
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

  // Live search results — show all customers regardless of type so same customer works for both
  const allResults = q.trim().length >= 2 ? searchCustomers(customers, q) : [];
  const results = allResults;

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
        <SegmentedTabs value={data.contactType} onChange={(v) => { setData({ ...data, contactType: v }); setSelectedId(null); }} options={[{ label: "Personal", value: "personal" }, { label: "Business", value: "business" }]} />
        {/* Type explanation */}
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {data.contactType === "personal"
            ? "Retail customer — invoice will be generated without GST details."
            : "GST / Business customer — invoice will include tax details and company billing."
          }
        </p>

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
function QuoteSummary({ data, onNext, isEdit, setData }: any) {
  const allParts = data.devices.flatMap((d: WizardDevice) => d.parts);
  const partsTotal = allParts.reduce((s: number, p: any) => s + Number(p.total || 0), 0);
  const estimatesTotal = data.devices.reduce((s: number, d: WizardDevice) => s + (Number(d.job.estimate) || 0), 0);
  // Subtotal: estimate (service/labor charges) + parts (material costs) when both exist
  const subtotal = (estimatesTotal + partsTotal) || 0;
  const isBusiness = data.contactType === "business";
  const gstRate = data.gstRate || (data.customGstRate ? 0 : 18);
  const tax = isBusiness ? Math.round(subtotal * (gstRate / 100)) : 0;
  const total = subtotal + tax;

  // Local raw string state for custom GST input — allows full editing freedom
  const [customGstRaw, setCustomGstRaw] = useState<string>(data.customGstRate ? (gstRate === 0 ? "" : String(gstRate)) : "");
  const [customGstFocused, setCustomGstFocused] = useState(false);
  return (
    <div className="rounded-[20px] border border-[#E2E8F8]/80 bg-[#F7FAFF] p-6 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(67,97,238,0.06)] sm:p-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.2fr_1fr]">
        {/* Line Items Table */}
        <div className="rounded-2xl border border-border overflow-hidden">
          <div className="grid grid-cols-3 bg-muted px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Description</div><div className="text-center">Qty</div><div className="text-right">Amount</div>
          </div>
          {/* Per-device estimates (multi-device) */}
          {data.devices.length > 1 && data.devices.map((d: WizardDevice, idx: number) => {
            const devLabel = [d.device.brand, d.device.model].filter(Boolean).join(" ") || `Device ${idx + 1}`;
            const devPartsTotal = d.parts.reduce((s: number, p: any) => s + Number(p.total || 0), 0);
            const devEstimate = Number(d.job.estimate) || 0;
            const devTotal = devEstimate + devPartsTotal;
            return (
              <div key={d.id}>
                {/* Device header */}
                <div className="grid grid-cols-3 px-4 py-3 text-sm bg-background border-t border-border">
                  <div>
                    <span className="font-medium">{d.job.issue || "Repair"}</span>
                    <span className="block text-[11px] text-muted-foreground">{devLabel}</span>
                  </div>
                  <div className="text-center">1</div>
                  <div className="text-right tnum font-medium">{formatINR(devTotal)}</div>
                </div>
                {/* Device parts */}
                {d.parts.map((p: any, pi: number) => (
                  <div key={pi} className="grid grid-cols-3 px-4 py-2 text-[13px] text-muted-foreground bg-muted/20 border-t border-border/50 pl-7">
                    <div>{p.name}</div><div className="text-center">{p.qty || 1}</div><div className="text-right tnum">{formatINR(Number(p.total))}</div>
                  </div>
                ))}
                {/* Device estimate (service charges) */}
                {devEstimate > 0 && (
                  <div className="grid grid-cols-3 px-4 py-2 text-[13px] text-muted-foreground bg-muted/20 border-t border-border/50 pl-7">
                    <div>Service Charges</div><div className="text-center">1</div><div className="text-right tnum">{formatINR(devEstimate)}</div>
                  </div>
                )}
              </div>
            );
          })}
          {/* Single device: show parts */}
          {data.devices.length <= 1 && allParts.length > 0 && allParts.map((p: any, i: number) => (
            <div key={i} className="grid grid-cols-3 px-4 py-3 text-sm border-t border-border odd:bg-background even:bg-muted/20">
              <div>{p.name}</div><div className="text-center">{p.qty || 1}</div><div className="text-right tnum">{formatINR(Number(p.total))}</div>
            </div>
          ))}
          {/* Single device: always show estimate as Service Charges when present */}
          {data.devices.length <= 1 && estimatesTotal > 0 && (
            <div className="grid grid-cols-3 px-4 py-3 text-sm border-t border-border bg-background">
              <div className="font-medium">{data.devices[0]?.job?.issue || "Service Charges"}</div>
              <div className="text-center">1</div>
              <div className="text-right tnum">{formatINR(estimatesTotal)}</div>
            </div>
          )}
          {/* Empty state */}
          {allParts.length === 0 && estimatesTotal === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No parts or estimate added.</div>
          )}
          {/* GST row for business */}
          {isBusiness && (
            <div className="grid grid-cols-3 px-4 py-3 text-sm border-t border-border bg-muted/30">
              <div className="font-medium">GST ({gstRate}%)</div><div className="text-center">—</div><div className="text-right tnum">{formatINR(tax)}</div>
            </div>
          )}
        </div>

        {/* Right Summary Panel */}
        <div className="rounded-2xl border border-border bg-gradient-to-b from-indigo-50/60 to-white p-5">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Customer pays</p>
          <p className="font-display mt-1 text-3xl font-extrabold brand-gradient-text">{formatINR(total)}</p>
          <ul className="mt-4 space-y-1.5 text-sm">
            {data.devices.length > 1 && <QRow k={`Devices (${data.devices.length})`} v={formatINR(subtotal)} />}
            {data.devices.length <= 1 && <QRow k="Sub-total" v={formatINR(subtotal)} />}
            {isBusiness && <QRow k={`GST (${gstRate}%)`} v={formatINR(tax)} />}
            <QRow k="Total" v={formatINR(total)} bold />
          </ul>

          {/* GST Rate selector for Business */}
          {isBusiness && setData && (
            <div className="mt-4 pt-3 border-t border-border">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">GST Rate</Label>
              <div className="mt-1.5 flex items-center gap-1.5">
                {[5, 12, 18].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setData({ ...data, gstRate: rate, customGstRate: false })}
                    className={cn(
                      "flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-all text-center",
                      gstRate === rate && !data.customGstRate
                        ? "bg-[#4361EE] text-white shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE]"
                    )}
                  >
                    {rate}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setData({ ...data, customGstRate: true })}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-all text-center",
                    data.customGstRate
                      ? "bg-[#4361EE] text-white shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE]"
                  )}
                >
                  Custom
                </button>
              </div>
              {data.customGstRate && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={customGstFocused ? customGstRaw : (gstRate === 0 ? "" : String(gstRate))}
                    onFocus={() => {
                      setCustomGstFocused(true);
                      setCustomGstRaw(gstRate === 0 ? "" : String(gstRate));
                    }}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9.]/g, "");
                      setCustomGstRaw(raw);
                      const v = parseFloat(raw);
                      if (!isNaN(v) && v >= 0 && v <= 100) {
                        setData({ ...data, gstRate: v, customGstRate: true });
                      } else if (raw === "" || raw === ".") {
                        setData({ ...data, gstRate: 0, customGstRate: true });
                      }
                    }}
                    onBlur={() => {
                      setCustomGstFocused(false);
                      const v = parseFloat(customGstRaw);
                      if (isNaN(v) || customGstRaw === "") {
                        setData({ ...data, gstRate: 0, customGstRate: true });
                      }
                    }}
                    placeholder="Rate"
                    className="h-9 w-20 rounded-lg border border-border bg-card px-2.5 text-sm font-medium tabular-nums text-center focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
                  />
                  <span className="text-[12px] font-medium text-muted-foreground">%</span>
                </div>
              )}
            </div>
          )}

          {!isEdit && <Button size="lg" className="mt-4 w-full" onClick={onNext}>Approve Quote <ArrowRight className="h-4 w-4" /></Button>}
          <p className="mt-2 text-center text-[11px] text-muted-foreground">You'll confirm all details in the final step.</p>
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

  const activeIdx = data.activeDeviceIndex;
  const activeDevice = data.devices[activeIdx];
  const qc = activeDevice.qc || {};
  const set = (k: string, v: "ok" | "no" | "na") => {
    const updatedDevices = data.devices.map((dev: WizardDevice, i: number) =>
      i === activeIdx ? { ...dev, qc: { ...dev.qc, [k]: v } } : dev
    );
    setData({ ...data, devices: updatedDevices });
  };

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
    const updatedDevicesMarkAll = data.devices.map((dev: WizardDevice, i: number) =>
      i === activeIdx ? { ...dev, qc: updated } : dev
    );
    setData({ ...data, devices: updatedDevicesMarkAll });
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
        <DeviceSwitcher data={data} setData={setData} />
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
              <Shield className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Quality Control Inspection</h2>
              <p className="text-[12px] text-muted-foreground">{activeDevice.device?.model || "Device"} • {activeDevice.device?.assignedTo || "Technician"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { const resetDevices = data.devices.map((dev: WizardDevice, i: number) => i === activeIdx ? { ...dev, qc: {} } : dev); setData({ ...data, devices: resetDevices }); }}><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
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

/* ---------------- Step 11: Ticket Confirmation ---------------- */
function ConfirmationStep({ onSubmit, isEdit, data }: { onSubmit: () => void; isEdit: boolean; data: any }) {
  const [confirmed, setConfirmed] = useState(false);
  const customerName = `${data.customer.first} ${data.customer.last}`.trim() || "Walk-in Customer";
  const primaryDevice = data.devices[0];
  const hasIssue = !!(primaryDevice?.job?.issue || primaryDevice?.job?.description);
  const hasEstimate = !!(Number(primaryDevice?.job?.estimate) > 0 || data.devices.some((d: any) => d.parts.length > 0));

  return (
    <div className="rounded-[20px] border border-[#E2E8F8]/80 bg-[#F7FAFF] p-5 sm:p-6 shadow-[0_2px_10px_-2px_rgba(15,23,42,0.05),0_10px_30px_-12px_rgba(67,97,238,0.06)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
          <ShieldCheck className="h-4.5 w-4.5" />
        </span>
        <div>
          <h3 className="text-sm font-bold">{isEdit ? "Confirm Changes" : "Ticket Confirmation"}</h3>
          <p className="text-[11px] text-muted-foreground">Verify all details before {isEdit ? "saving" : "creating the ticket"}.</p>
        </div>
      </div>

      {/* Verification Checklist — compact grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
        <ConfirmCheckItem checked={!!customerName && customerName !== "Walk-in Customer"} label="Customer verified" sublabel={customerName} />
        <ConfirmCheckItem checked={!!(primaryDevice?.device?.brand || primaryDevice?.device?.model)} label="Device verified" sublabel={[primaryDevice?.device?.brand, primaryDevice?.device?.model].filter(Boolean).join(" ") || "Not specified"} />
        <ConfirmCheckItem checked={hasIssue} label="Problem confirmed" sublabel={primaryDevice?.job?.issue || primaryDevice?.job?.description || "Not specified"} />
        <ConfirmCheckItem checked={hasEstimate} label="Charges explained" sublabel={hasEstimate ? `₹${primaryDevice?.job?.estimate || data.devices.reduce((s: number, d: any) => s + d.parts.reduce((ps: number, p: any) => ps + (p.total || 0), 0), 0)}` : "No estimate"} />
      </div>

      {/* Confirmation Checkbox + Submit — inline */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-xl border border-border bg-white px-4 py-3">
        <label className="flex items-center gap-2.5 cursor-pointer select-none flex-1 min-w-0">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="h-4.5 w-4.5 rounded border-2 border-border text-[#4361EE] focus:ring-[#4361EE]/20 focus:ring-2 accent-[#4361EE] shrink-0"
          />
          <span className="text-[13px] font-medium text-foreground leading-tight">
            I confirm all ticket details have been verified.
          </span>
        </label>
        <Button size="md" onClick={onSubmit} disabled={!confirmed} className="shrink-0 whitespace-nowrap">
          <ShieldCheck className="h-3.5 w-3.5" /> {isEdit ? "Save Changes" : "Create Ticket"}
        </Button>
      </div>
    </div>
  );
}

function ConfirmCheckItem({ checked, label, sublabel }: { checked: boolean; label: string; sublabel: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition", checked ? "bg-emerald-50/70 border border-emerald-100" : "bg-amber-50/60 border border-amber-100")}>
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", checked ? "bg-emerald-500 text-white" : "bg-amber-300 text-amber-800")}>
        {checked ? <Check className="h-3 w-3" strokeWidth={3} /> : <Minus className="h-3 w-3" strokeWidth={3} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[12px] font-semibold leading-tight", checked ? "text-emerald-800" : "text-amber-800")}>{label}</p>
        <p className="text-[10px] text-muted-foreground truncate">{sublabel}</p>
      </div>
    </div>
  );
}

