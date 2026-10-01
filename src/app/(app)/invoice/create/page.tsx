"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight, ArrowLeft, Check, Plus, Trash2, Copy, Save,
  User, FileText, Package, IndianRupee, StickyNote, ClipboardCheck, Sparkles, X, Search, Link2, PackageSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select, NumericInput } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreationSuccess } from "@/components/ui/creation-success";
import { CompletionScreen } from "@/components/completion/completion-screen";
import { useStore } from "@/lib/store";
import { useStoreSettings } from "@/lib/store-settings";
import { toast } from "@/components/ui/toaster";
import { cn, formatINR } from "@/lib/utils";
import type { Invoice, InvoiceLineItem, InvoiceStatus, InvoiceType, InvoiceDeviceRecord, TicketStatus, DocumentType } from "@/lib/mock-data";
import { createInvoiceDeviceRecord } from "@/lib/mock-data";
import { loadDeviceCategories, getCachedCategories } from "@/lib/device-categories";
import { detectIdentifier, sanitizeIdentifierInput, resolveIdentifierType, identifierDisplayLabel, IDENTIFIER_PLACEHOLDER } from "@/lib/identifier-detection";
import { StatusPillSelect } from "@/components/ui/status-pill-select";
import { DeviceBrandModelSelector } from "@/components/common/device-brand-model-selector";
import type { InventoryItem } from "@/lib/inventory-data";
import { InventorySearchBox } from "@/components/inventory/inventory-search-box";
import { AddInventoryModal } from "@/components/inventory/add-inventory-modal";
import { Can } from "@/components/common/can";
import { searchCustomers, type Customer } from "@/lib/customer-data";
import { searchCustomerCandidates, resolvePromotionOrigin, type CustomerCandidate } from "@/lib/customer-candidates";
import { findOrCreateCustomer } from "@/lib/customer-service";
import { useLeads } from "@/lib/leads-context";
import { CustomerLifecycleBadge, customerLifecycle } from "@/components/common/customer-classification";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { NoPermission } from "@/components/common/no-permission";

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
  /** The originating Ticket DeviceRecord.id (when pushed from a ticket). This
   *  is the durable link that keeps selective / partial invoicing traceable and
   *  lets the per-device Repair Status control update the real ticket device. */
  ticketDeviceId?: string;
  /** The device's current repair status (carried from the ticket device) so the
   *  device-grouped Pricing step can show + change it. Uses the ticket status
   *  vocabulary. */
  repairStatus?: TicketStatus;
  category: string;
  brand: string;
  model: string;
  /** Durable Category → Brand → Model relationship ids (inherited from the
   *  ticket device when pushed to invoice; not re-inferred from text). */
  brandId?: string;
  modelId?: string;
  imei: string;
  imeiType: string;
  issue: string;
  description: string;
  jobType: string;
  priority: string;
  warranty: string;
  warrantyValue: string;
  warrantyUnit: string;
  /** Device colour carried over from the linked ticket device / persisted invoice. */
  deviceColour: string;
  technician: string;
  /** Commercial estimate value (₹) for this device. Sourced from the linked
   *  ticket's estimate when invoicing from a ticket; a REFERENCE amount only —
   *  never a Parts & Services inventory line. Held as a string for the input,
   *  persisted as a number. */
  estimateValue: string;
  /** Agreed repair/labour charge (₹) for this device. NOTE: this is no longer
   *  entered in the Products step (removed — the Products step is Device + Job +
   *  Inventory only). The field is retained for backward compatibility with
   *  persisted invoices and the pricing/totals math; when set (e.g. legacy
   *  data) it still participates in pricing. New invoices leave it empty. */
  repairCost: string;
  notes: string;
  parts: InvoiceLineItem[];
};

type InvoiceFormData = {
  customer: { name: string; phone: string; altPhone: string; email: string; company: string; gstNumber: string; customerId?: string };
  details: { dueDate: string; employee: string; ticketId: string; ticketNo: string; ticketLocked: boolean; status: InvoiceStatus; repairStatus: TicketStatus; invoiceType: InvoiceType; serviceCategory: "service" | "accessories"; documentType: DocumentType; sourceEstimateId?: string; sourceTicketId?: string; sourceProformaId?: string };
  /** Flat items — used when no devices are present (legacy mode) */
  items: InvoiceLineItem[];
  /** Multi-device entries */
  devices: InvoiceFormDevice[];
  /** Index of the active device being edited */
  activeDeviceIndex: number;
  pricing: { discount: number; gstRate: number; paymentMode: string };
  notes: { notes: string; terms: string; slogan: string; footer: string };
};

function createFormDevice(overrides?: Partial<InvoiceFormDevice>): InvoiceFormDevice {
  return {
    id: `ifd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ticketDeviceId: undefined,
    repairStatus: undefined,
    category: "",
    brand: "",
    model: "",
    brandId: undefined,
    modelId: undefined,
    imei: "",
    imeiType: "imei1",
    issue: "",
    description: "",
    jobType: "service",
    priority: "normal",
    warranty: "",
    warrantyValue: "",
    warrantyUnit: "",
    deviceColour: "",
    technician: "",
    estimateValue: "",
    repairCost: "",
    notes: "",
    parts: [],
    ...overrides,
  };
}

const DEFAULT_FORM: InvoiceFormData = {
  customer: { name: "", phone: "", altPhone: "", email: "", company: "", gstNumber: "" },
  details: { dueDate: "", employee: "", ticketId: "", ticketNo: "", ticketLocked: false, status: "draft", repairStatus: "repaired_collected", invoiceType: "retail", serviceCategory: "service", documentType: "invoice" },
  items: [],
  devices: [createFormDevice()],
  activeDeviceIndex: 0,
  pricing: { discount: 0, gstRate: 0, paymentMode: "" },
  notes: { notes: "", terms: "Limited Warranty\nWe stand behind our repair services.\nYour repaired device is covered by a service warranty.", slogan: "", footer: "THANK YOU FOR CHOOSING FIX IND" },
};

/** Numbering config shape (from Settings → Invoice → Numbering). */
type NumberingCfg = { prefix: string; startNumber: number; digits: number };

/**
 * Generate the next invoice id for a series. Uses the configured prefix/digits/
 * start number from Settings when provided, otherwise the legacy INV/INVG · 3-digit
 * defaults. The next number always continues from the highest EXISTING invoice in
 * the series, so changing settings never renumbers historical invoices.
 */
function genInvoiceId(type: InvoiceType, existingInvoices: Invoice[], cfg?: NumberingCfg, documentType: DocumentType = "invoice"): string {
  const fallbackPrefix = type === "business" ? "INVG" : "INV";
  let prefix = (cfg?.prefix?.trim()) || fallbackPrefix;
  const digits = cfg?.digits && cfg.digits > 0 ? cfg.digits : 3;
  let startNumber = cfg?.startNumber && cfg.startNumber > 0 ? cfg.startNumber : 1;
  // PROFORMA gets its OWN series prefixed with "P-" (→ "P-INV"), matching the
  // DB-side nextInvoiceIdFromDb. This keeps proforma numbers from ever consuming
  // a normal invoice number. The store re-checks against the DB on insert.
  const isProformaDoc = documentType === "proforma";
  if (isProformaDoc) { prefix = `P-${prefix}`; startNumber = 1; }
  // Only compare within the SAME document type + invoice type so the running
  // max never mixes proformas with normal invoices.
  const existing = existingInvoices.filter((i) => i.invoiceType === type && (i.documentType ?? "invoice") === documentType);
  // Only count ids that match this series' canonical shape `<prefix><digits>`
  // (optionally with a store prefix like "KOR-INV054"). Off-series / malformed
  // ids (e.g. a duplicated invoice with a random suffix "INV-5483") are ignored
  // so they can never poison the running max and jump the whole series forward.
  // Match the trailing number ONLY when it directly follows the prefix with no
  // separator: "INV054" ✓, "KOR-INV054" ✓, but "INV-5483" ✗.
  const seriesRe = new RegExp(`(?:^|[A-Za-z]+-)${prefix}(\\d+)$`);
  const maxNum = existing.reduce((max, i) => {
    const canonical = seriesRe.exec(i.id);
    return canonical ? Math.max(max, parseInt(canonical[1], 10)) : max;
  }, 0);
  // First invoice in a fresh series honours the configured start number.
  const next = maxNum === 0 ? startNumber : maxNum + 1;
  return `${prefix}${String(next).padStart(digits, "0")}`;
}

function genLineId(): string {
  return `li-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Friendly labels for known payment modes; custom modes are title-cased. */
const PAYMENT_MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  card: "Card",
  cheque: "Cheque",
  wallet: "Wallet",
  other: "Other",
};

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
  const { can } = usePermissions();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { invoices, tickets, addInvoice, updateInvoice, customers, addCustomer } = useStore();
  const { contacts, leads, updateContact } = useLeads();
  const { settings, hydrated: settingsHydrated } = useStoreSettings();
  const isEdit = !!editId;

  // Resolve a ticket's stable primary key (stored in Invoice.ticketId) to its
  // human-readable number (T-045) for display. Also supports the reverse lookup
  // when a ticket number is what we have.
  const ticketNoForId = useCallback((ticketId?: string): string => {
    if (!ticketId) return "";
    const byId = tickets.find((t) => t.id === ticketId);
    if (byId) return byId.ticketNo ?? byId.id;
    const byNo = tickets.find((t) => t.ticketNo === ticketId);
    return byNo?.ticketNo ?? ticketId;
  }, [tickets]);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<InvoiceFormData>(DEFAULT_FORM);
  const [dirty, setDirty] = useState(false);
  // Set true when the user tries to advance the Products step without a
  // complete warranty; drives the red-border indication on the field (matches
  // the Lead form's touched-then-highlight pattern).
  const [showProductErrors, setShowProductErrors] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState("");
  // Tracks the id of a draft persisted from this flow, so repeated Save Draft
  // clicks update the same record instead of creating duplicates.
  const [draftId, setDraftId] = useState<string | null>(null);
  // When this invoice is being created FROM a proforma (?fromProforma=), the
  // source proforma id — so on submit we can mark it converted + linked.
  const [fromProformaId, setFromProformaId] = useState<string | null>(null);

  // Pre-fill when editing
  useEffect(() => {
    if (editId) {
      const existing = invoices.find((i) => i.id === editId);
      if (existing) {
        setForm(invoiceToForm(existing, ticketNoForId(existing.ticketId)));
      }
    }
  }, [editId, invoices, ticketNoForId]);

  // Pre-fill from ticket (Push to Invoice)
  useEffect(() => {
    const fromTicket = searchParams.get("fromTicket");
    if (fromTicket && !editId) {
      const customer = searchParams.get("customer") || "";
      const phone = searchParams.get("phone") || "";
      const altPhone = searchParams.get("altPhone") || "";
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

            // The ticket estimate is a COMMERCIAL REFERENCE VALUE — it maps to
            // the device's Estimate Value field below, NOT to a Parts & Services
            // line item. We deliberately do NOT synthesise a "Repair Service"
            // labour line from the estimate any more: Parts & Services carries
            // only the real ticket parts, and the estimate stays a separate
            // financial value the user can see and adjust.
            const estimateValue = Number(dev.estimate) || 0;

            return createFormDevice({
              // Durable link to the originating ticket device (selective invoicing).
              ticketDeviceId: dev.ticketDeviceId || undefined,
              // Match the standalone invoice flow: a pushed invoice defaults to
              // "Repaired & Collected" rather than inheriting the ticket's live
              // (usually "in_progress") status. Leaving this seeded to the ticket
              // status made the Pricing step's `activeDevice?.repairStatus ??
              // d.repairStatus` fallback resolve to in_progress and mirror it
              // back onto the invoice. Seed repaired_collected so the invoice
              // default applies exactly like creating an invoice individually.
              repairStatus: "repaired_collected",
              category: dev.category || "",
              brand: dev.brand || "",
              model: dev.model || "",
              brandId: dev.brandId || undefined,
              modelId: dev.modelId || undefined,
              imei: dev.imei || "",
              imeiType: dev.imeiType || "imei1",
              issue: dev.issue || "",
              description: dev.description || "",
              jobType: dev.jobType || "service",
              priority: dev.priority || "normal",
              warranty: dev.warranty || "",
              warrantyValue: dev.warrantyValue ? String(dev.warrantyValue) : "",
              warrantyUnit: dev.warrantyUnit || "",
              deviceColour: dev.deviceColour || "",
              technician: dev.technician || "",
              // Ticket estimate → Estimate Value (reference), not an item.
              estimateValue: estimateValue > 0 ? String(estimateValue) : "",
              repairCost: "",
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

        // Legacy single-device push carries only a total `amount` (the ticket
        // estimate). That is a COMMERCIAL REFERENCE VALUE → Estimate Value, not
        // a synthetic Parts & Services line. Parts & Services stays empty here;
        // the user adds real billable items as needed.
        formDevices = [createFormDevice({
          brand,
          model: device,
          imei: serial,
          issue: service,
          estimateValue: amount > 0 ? String(amount) : "",
        })];
        flatItems = [];
      }

      setForm((prev) => ({
        ...prev,
        customer: { name: customer, phone, altPhone, email, company, gstNumber: searchParams.get("gstNumber") || "" },
        details: (() => {
          // Distinguish the source of the push. When it comes from an ESTIMATE
          // (Estimate → Proforma), `fromTicket` is the ESTIMATE id — NOT a
          // ticket. In that case the proforma must NOT adopt the estimate id as
          // its `ticketId`/`sourceTicketId` (that made the TICKET column show
          // the estimate forever). It only records `sourceEstimateId`; the real
          // ticket link is stamped later, when the estimate/proforma is pushed
          // to a ticket. A push from a real TICKET keeps the existing behaviour.
          const isEstimatePush = searchParams.get("documentType") === "proforma";
          const explicitTicketId = searchParams.get("sourceTicketId") || undefined;
          return {
            ...prev.details,
            // No ticket yet for an estimate push (unless the estimate already
            // had a converted ticket, passed explicitly).
            ticketId: isEstimatePush ? (explicitTicketId || "") : fromTicket,
            ticketNo: isEstimatePush
              ? (explicitTicketId ? (ticketNoForId(explicitTicketId) || explicitTicketId) : "")
              : (ticketNoForId(fromTicket) || (searchParams.get("ticketNo") || fromTicket)),
            ticketLocked: true,
            employee,
            status: "draft",
            repairStatus: "repaired_collected",
            invoiceType: (searchParams.get("customerType") === "business" ? "business" : "retail") as InvoiceType,
            // Document type + commercial lineage. When the push originates from
            // an Estimate the caller sets documentType=proforma so this flow
            // produces a PROFORMA, not a normal invoice.
            documentType: (isEstimatePush ? "proforma" : "invoice") as DocumentType,
            sourceEstimateId: searchParams.get("sourceEstimateId") || undefined,
            // Only a REAL ticket id — never the estimate id.
            sourceTicketId: isEstimatePush ? explicitTicketId : (explicitTicketId || fromTicket),
          };
        })(),
        items: flatItems,
        devices: formDevices.length > 0 ? formDevices : prev.devices,
        activeDeviceIndex: 0,
        pricing: {
          ...prev.pricing,
          gstRate: searchParams.get("gstRate") != null ? Number(searchParams.get("gstRate")) : prev.pricing.gstRate,
        },
      }));
    }
  }, [searchParams, editId, ticketNoForId]);

  // Pre-fill from a PROFORMA (?fromProforma=) — the "Push to Invoice" flow for a
  // proforma that already has a linked ticket. We reuse the proforma's captured
  // commercial data (customer / devices / parts / pricing / notes) so the user
  // can review and adjust before creating the FINAL normal invoice. The created
  // record is a normal invoice (documentType invoice) linked back to the source
  // proforma; the proforma is marked converted on submit (see handleSubmit).
  useEffect(() => {
    const pid = searchParams.get("fromProforma");
    if (!pid || editId) return;
    const proforma = invoices.find((i) => i.id === pid);
    if (!proforma) return;
    setFromProformaId(pid);
    const seeded = invoiceToForm(proforma, ticketNoForId(proforma.ticketId ?? proforma.sourceTicketId));
    setForm({
      ...seeded,
      details: {
        ...seeded.details,
        // The NEW record is a NORMAL, revenue-bearing invoice — not a proforma.
        documentType: "invoice",
        // Fresh financial lifecycle (proforma statuses never carry over).
        status: "draft",
        // Commercial lineage: where this invoice came from.
        sourceProformaId: proforma.id,
        sourceEstimateId: proforma.sourceEstimateId,
        sourceTicketId: proforma.sourceTicketId ?? proforma.ticketId,
        // Link + lock to the proforma's ticket so the invoice ↔ ticket relation
        // is preserved (and the field is read-only in the flow).
        ticketId: proforma.sourceTicketId ?? proforma.ticketId ?? "",
        ticketNo: ticketNoForId(proforma.sourceTicketId ?? proforma.ticketId) || "",
        ticketLocked: !!(proforma.sourceTicketId ?? proforma.ticketId),
      },
    });
  }, [searchParams, editId, invoices, ticketNoForId]);

  // Seed defaults from Settings → Invoice for brand-new invoices only.
  // Never runs for edits (?edit=) or ticket pushes (?fromTicket=), and only once,
  // so it never overwrites user input or historical invoice values.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (editId || searchParams.get("fromTicket") || searchParams.get("fromProforma")) return; // don't touch edits/pushes
    if (!settingsHydrated) return; // wait for settings to load
    seededRef.current = true;
    const d = settings.invoiceDefaults;
    const due = new Date(Date.now() + (d.dueDateDays ?? 7) * 86_400_000).toISOString().slice(0, 10);
    setForm((prev) => ({
      ...prev,
      details: {
        ...prev.details,
        invoiceType: d.invoiceType ?? prev.details.invoiceType,
        serviceCategory: d.serviceCategory ?? prev.details.serviceCategory,
        status: (d.status as InvoiceStatus) ?? prev.details.status,
        dueDate: prev.details.dueDate || due,
      },
      pricing: {
        ...prev.pricing,
        gstRate: d.gstRate ?? prev.pricing.gstRate,
        paymentMode: d.paymentMode ?? prev.pricing.paymentMode,
      },
      notes: {
        ...prev.notes,
        terms: settings.invoiceTerms ?? prev.notes.terms,
        footer: settings.invoiceFooter ?? prev.notes.footer,
        slogan: settings.invoiceSlogan ?? prev.notes.slogan,
      },
    }));
  }, [settingsHydrated, settings, editId, searchParams]);

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

  // Computed totals — derive from devices or flat items.
  //  • partsTotal   = sum of all Parts & Services line totals (inventory).
  //  • repairCost   = sum of each device's agreed Repair Cost (a separate,
  //                   non-inventory financial component that IS billed).
  //  • estimateTotal = sum of device Estimate Values — a COMMERCIAL REFERENCE
  //                   only; it is NOT added to the billed subtotal/total.
  //  Billed subtotal = partsTotal + repairCost, then discount → GST → total,
  //  reusing the existing SGST/CGST split so nothing else in pricing changes.
  const totals = useMemo(() => {
    const hasDevices = form.devices.length > 0;
    const allItems = hasDevices
      ? form.devices.flatMap((d) => d.parts)
      : form.items;
    const partsTotal = allItems.reduce((s, item) => s + item.total, 0);
    const repairCost = hasDevices
      ? form.devices.reduce((s, d) => s + (Number(d.repairCost) || 0), 0)
      : 0;
    const estimateTotal = hasDevices
      ? form.devices.reduce((s, d) => s + (Number(d.estimateValue) || 0), 0)
      : 0;
    const subtotal = partsTotal + repairCost;
    const discount = form.pricing.discount;
    const taxable = subtotal - discount;
    const gstRate = form.pricing.gstRate;
    const sgstRate = gstRate / 2;
    const cgstRate = gstRate / 2;
    const sgst = Math.round(taxable * (sgstRate / 100));
    const cgst = Math.round(taxable * (cgstRate / 100));
    const tax = sgst + cgst;
    const total = taxable + tax;
    return { subtotal, partsTotal, repairCost, estimateTotal, discount, sgst, cgst, sgstRate, cgstRate, gstRate, tax, total };
  }, [form.devices, form.items, form.pricing]);

  // Build a full Invoice record from the current form. An optional status
  // override lets callers (e.g. Save Draft) force a specific status without
  // touching the rest of the invoice-building logic.
  const buildInvoice = useCallback((statusOverride?: InvoiceStatus, customerIdOverride?: string): Invoice => {
    // Build invoice device records for storage. A device is worth persisting
    // when it carries identity, parts, or any financial value (estimate /
    // repair cost) — an estimate-only device (pushed from a ticket with no
    // parts) must still be saved.
    const hasDevices = form.devices.length > 0 && form.devices.some((d) => d.brand || d.model || d.parts.length > 0 || Number(d.estimateValue) > 0 || Number(d.repairCost) > 0);
    const invoiceDevices: InvoiceDeviceRecord[] = hasDevices ? form.devices.map((d) => ({
      id: d.id,
      // Persist the durable link back to the ticket device so the invoice stays
      // traceable (partial invoicing, duplicate-billing prevention, coverage).
      ticketDeviceId: d.ticketDeviceId || undefined,
      category: d.category || "",
      brand: d.brand,
      model: d.model,
      brandId: d.brandId || undefined,
      modelId: d.modelId || undefined,
      imei: d.imei,
      imeiType: d.imeiType as "imei1" | "imei2" | "serial",
      issue: d.issue,
      description: d.description,
      jobType: d.jobType,
      priority: d.priority,
      warranty: d.warranty,
      warrantyValue: d.warrantyValue ? Number(d.warrantyValue) : undefined,
      warrantyUnit: (d.warrantyUnit || undefined) as "days" | "months" | "years" | undefined,
      deviceColour: d.deviceColour || undefined,
      technician: d.technician,
      // Financial reference (estimate) + agreed repair charge — persisted as
      // numbers. Estimate Value is a reference; Repair Cost participates in
      // pricing. Neither is an inventory line item.
      estimateValue: d.estimateValue ? Number(d.estimateValue) : 0,
      repairCost: d.repairCost ? Number(d.repairCost) : 0,
      parts: d.parts,
      notes: d.notes,
      subtotal: d.parts.reduce((s, p) => s + p.total, 0),
    })) : [];

    // Flat items = all parts from all devices (for backward compat and totals)
    const allItems = hasDevices ? form.devices.flatMap((d) => d.parts) : form.items;

    const isProformaDoc = form.details.documentType === "proforma";
    // A Proforma is NON-FINANCIAL: its financial `status` is forced to a
    // non-payment value ("draft") so it can never imply payment; its lifecycle
    // is tracked separately via `proformaStatus`. The Status/paid overrides in
    // the wizard never apply to proformas.
    const finalStatus: InvoiceStatus = isProformaDoc ? "draft" : (statusOverride ?? form.details.status);
    const invoice: Invoice = {
      id: editId || draftId || genInvoiceId(
        form.details.invoiceType as InvoiceType,
        invoices,
        settings.invoiceNumbering[(form.details.invoiceType as InvoiceType) === "business" ? "business" : "retail"],
        form.details.documentType,
      ),
      invoiceType: (form.details.invoiceType as InvoiceType) || "retail",
      customer: form.customer.name || "Walk-in Customer",
      customerId: customerIdOverride || form.customer.customerId || undefined,
      phone: form.customer.phone,
      email: form.customer.email || undefined,
      company: form.customer.company || undefined,
      status: finalStatus,
      createdAt: isEdit ? (invoices.find((i) => i.id === editId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
      dueDate: form.details.dueDate || new Date(Date.now() + 7 * 86_400_000).toISOString(),
      paidAmount: isProformaDoc
        ? 0
        : isEdit
          ? (invoices.find((i) => i.id === editId)?.paidAmount || 0)
          : ((statusOverride ?? form.details.status) === "paid" ? totals.total : 0),
      items: allItems,
      subtotal: totals.subtotal,
      discount: totals.discount,
      tax: totals.tax,
      gstRate: form.pricing.gstRate,
      sgst: totals.sgst,
      cgst: totals.cgst,
      sgstRate: totals.sgstRate,
      cgstRate: totals.cgstRate,
      total: totals.total,
      notes: form.notes.notes || undefined,
      terms: form.notes.terms || undefined,
      slogan: form.notes.slogan || undefined,
      footer: form.notes.footer || undefined,
      employee: form.details.employee || undefined,
      ticketId: form.details.ticketId || undefined,
      repairStatus: form.details.repairStatus,
      paymentMode: form.pricing.paymentMode || undefined,
      serviceCategory: form.details.serviceCategory || "service",
      gstNumber: form.customer.gstNumber || undefined,
      devices: invoiceDevices.length > 0 ? invoiceDevices : undefined,
      // Document type + commercial lineage.
      documentType: form.details.documentType,
      proformaStatus: isProformaDoc
        ? (isEdit ? (invoices.find((i) => i.id === editId)?.proformaStatus ?? "open") : "open")
        : undefined,
      sourceEstimateId: form.details.sourceEstimateId || undefined,
      sourceTicketId: form.details.sourceTicketId || undefined,
      sourceProformaId: form.details.sourceProformaId || undefined,
      // Preserve an existing proforma→invoice link when editing.
      convertedInvoiceId: isEdit ? invoices.find((i) => i.id === editId)?.convertedInvoiceId : undefined,
    };

    return invoice;
  }, [form, totals, editId, isEdit, invoices, draftId, settings.invoiceNumbering]);

  // Promote the picked identity into the Customer Master before saving. When
  // the user picked an existing customer, customerId is already set and this is
  // a no-op. When they picked a not-yet-promoted CRM contact (or typed a fresh
  // name), we resolve through the shared dedup service and capture them into
  // the Customer Master — the same "capture everyone / one canonical identity"
  // rule the Ticket and Walk-In flows follow.
  const resolveCustomerForSave = useCallback(async (): Promise<string | undefined> => {
    if (form.customer.customerId) return form.customer.customerId;
    const name = (form.customer.name || "").trim();
    const phone = (form.customer.phone || "").trim();
    if (!name && !phone) return undefined;
    const [first, ...rest] = name.split(" ");
    // Two-logic origin: Sales if the person came from a LEAD/CRM contact,
    // otherwise Manual (created individually here on the invoice).
    const origin = resolvePromotionOrigin(
      { mobile: phone, email: (form.customer.email || "").trim() },
      contacts,
      leads,
    );
    const { customer, created } = findOrCreateCustomer(
      {
        firstName: first || name || "Walk-in Customer",
        lastName: rest.join(" "),
        mobile: phone,
        altMobile: (form.customer.altPhone || "").trim() || undefined,
        email: (form.customer.email || "").trim() || undefined,
        type: form.details.invoiceType === "business" ? "business" : "personal",
        captureSource: origin.fromLead ? "lead" : "invoice",
        source: origin.fromLead ? "sales" : undefined,
        company: (form.customer.company || "").trim() || undefined,
      },
      customers,
    );
    if (created) await addCustomer(customer);
    // Link the originating CRM contact so it stops showing as an unpromoted
    // prospect (kills the duplicate in the CRM tab).
    if (origin.contactId) void updateContact(origin.contactId, { customerId: customer.id });
    // Link the resolved id back onto the form so buildInvoice picks it up.
    updateForm((f) => ({ ...f, customer: { ...f.customer, customerId: customer.id } }));
    return customer.id;
  }, [form.customer, form.details.invoiceType, customers, addCustomer, updateForm, contacts, leads, updateContact]);

  // Submit (finalize / save)
  const handleSubmit = useCallback(async () => {
    const resolvedId = await resolveCustomerForSave();
    const invoice = buildInvoice(undefined, resolvedId);

    setDirty(false);
    if (isEdit) {
      updateInvoice(editId!, invoice);
      setCreatedInvoiceId(invoice.id);
      router.push("/invoice");
    } else {
      // Use the id actually persisted by the store — it may differ from the
      // locally generated one if it collided with an existing (or soft-deleted)
      // invoice, so the print/share links point at a real, retrievable record.
      const savedId = await addInvoice(invoice);
      // The store returns "" when creation is rejected (e.g. a device was
      // already invoiced by another tab/user). Keep the user on the form —
      // addInvoice already surfaced the reason via a toast.
      if (!savedId) {
        setDirty(true);
        return;
      }
      // If this invoice was created FROM a proforma, mark the proforma as
      // converted + link it to this new invoice (the proforma stays as the
      // historical source document; it is never edited/deleted).
      if (fromProformaId) {
        await updateInvoice(fromProformaId, { convertedInvoiceId: savedId, proformaStatus: "converted" });
      }
      setCreatedInvoiceId(savedId);
      setShowSuccessAnimation(true);
    }
  }, [buildInvoice, editId, isEdit, addInvoice, updateInvoice, router, fromProformaId, resolveCustomerForSave]);

  // Save Draft — persist current form to the DB with status "draft" without
  // finalizing the invoice or leaving the flow. Re-uses the same invoice store
  // logic as a normal save. Subsequent saves update the same draft record.
  const [savingDraft, setSavingDraft] = useState(false);
  const handleSaveDraft = useCallback(async () => {
    if (savingDraft) return;
    setSavingDraft(true);
    try {
      const invoice = buildInvoice("draft");

      if (isEdit) {
        // Editing an existing invoice: update it in place, keeping user in flow.
        await updateInvoice(editId!, invoice);
        setDirty(false);
        toast.success("Draft saved", { description: `Invoice ${invoice.id} saved as draft.` });
      } else if (draftId) {
        // Already saved this draft once — update the same record.
        await updateInvoice(draftId, { ...invoice, id: draftId });
        setDirty(false);
        toast.success("Draft saved", { description: `Invoice ${draftId} updated.` });
      } else {
        // First draft save for a new invoice — create the record.
        const savedId = await addInvoice(invoice);
        if (savedId) {
          setDraftId(savedId);
          setDirty(false);
          toast.success("Draft saved", { description: `Invoice ${savedId} saved as draft.` });
        }
      }
    } finally {
      setSavingDraft(false);
    }
  }, [savingDraft, buildInvoice, isEdit, editId, draftId, addInvoice, updateInvoice]);

  // Step navigation. On the Products step (3) with multiple devices, "Next"
  // walks through the devices one at a time (fill device 1 → Next → device 2 …)
  // and only advances to Pricing after the LAST device. "Back" mirrors this,
  // stepping backwards through the devices before returning to the previous
  // step. Single-device invoices behave exactly as before.
  // Steps that page THROUGH devices before advancing: Products (3) and
  // Pricing (4). On these, with multiple devices, Next/Back move device-by-
  // device first, and only then change step. When entering Pricing we reset to
  // the first device so the user reviews each device's pricing in order.
  const isDeviceStep = step === 3 || step === 4;
  const goNext = () => {
    // Warranty is MANDATORY on the Products step. Validate the ACTIVE device
    // before advancing (whether moving to the next device or leaving the step),
    // so every device carries a warranty value + duration unit.
    if (step === 3) {
      const dev = form.devices[form.activeDeviceIndex];
      // A warranty is complete when a value is entered (0 is a VALID value —
      // e.g. "0 Days" / no warranty) AND a duration unit is chosen.
      const hasWarranty = !!dev && dev.warrantyValue.trim() !== "" && !!dev.warrantyUnit;
      if (!hasWarranty) {
        setShowProductErrors(true);
        toast.error("Warranty is required — enter a value and select a duration.");
        return;
      }
      setShowProductErrors(false);
    }
    if (isDeviceStep && form.devices.length > 1 && form.activeDeviceIndex < form.devices.length - 1) {
      updateForm((f) => ({ ...f, activeDeviceIndex: f.activeDeviceIndex + 1 }));
      return;
    }
    // Reset to the first device when advancing INTO the Pricing step.
    if (step === 3 && form.devices.length > 1) {
      updateForm((f) => ({ ...f, activeDeviceIndex: 0 }));
    }
    setStep((s) => Math.min(s + 1, 6));
  };
  const goBack = () => {
    if (isDeviceStep && form.devices.length > 1 && form.activeDeviceIndex > 0) {
      updateForm((f) => ({ ...f, activeDeviceIndex: f.activeDeviceIndex - 1 }));
      return;
    }
    setStep((s) => Math.max(s - 1, 1));
  };
  // Direct step navigation — jump to ANY step from the stepper. The whole flow
  // shares a single `form` state (updateForm), so switching steps never loses
  // or resets entered values. Validation is only enforced at the final Create
  // action, not while navigating between steps.
  const goToStep = (s: number) => { if (s >= 1 && s <= 6) setStep(s); };

  if (showSuccessAnimation && !isEdit) {
    return (
      <CreationSuccess
        type="invoice"
        id={createdInvoiceId}
        isProforma={form.details.documentType === "proforma"}
        onComplete={() => {
          setShowSuccessAnimation(false);
          setShowCompletion(true);
        }}
      />
    );
  }

  // Permission gate: creating an invoice needs CAP.invoice.create; editing an
  // existing one needs CAP.invoice.edit. View-only users are refused the form
  // (they use the read-only invoice detail page).
  const canUseInvoiceWizard = isEdit ? allow(can, CAP.invoice.edit) : allow(can, CAP.invoice.create);
  if (!canUseInvoiceWizard) {
    return (
      <NoPermission
        title={isEdit ? "You can't edit this invoice" : "You can't create invoices"}
        subtitle="Ask an administrator to grant the matching Invoices permission in Settings → Roles & Permissions."
      />
    );
  }

  if (showCompletion && !isEdit) {
    return (
      <CompletionScreen
        type="invoice"
        id={createdInvoiceId}
        isProforma={form.details.documentType === "proforma"}
        onBack={() => router.push("/invoice")}
        onEdit={() => router.push(`/invoice/${createdInvoiceId}`)}
      />
    );
  }

  return (
    <div className="relative -mx-4 -mt-2 -mb-4 flex min-h-[calc(100%+1.5rem)] flex-col bg-[hsl(var(--background))] sm:-mx-6 lg:-mx-8">
      {/* Background — continuous RepairOX workspace canvas */}
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-15 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-br from-[#B3BFF6]/20 to-[#4361EE]/8 blur-3xl" />

      {/* Top bar */}
      <div className="relative mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex-1" />

        {/* Back + Breadcrumb — centered group. Matches the Ticket flow's blue
            hover treatment (indigo tint + brand-blue border on hover). */}
        <button onClick={goBack} disabled={step === 1} className="grid h-10 w-10 place-items-center rounded-xl border border-black/25 bg-card text-zinc-700 shadow-card transition hover:bg-indigo-50 hover:border-[#B3BFF6] disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Previous step">
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => attemptNav("/dashboard")} className="hover:text-foreground transition">Dashboard</button>
          <span>/</span>
          <button onClick={() => attemptNav("/invoice")} className="hover:text-foreground transition">Invoices</button>
          <span>/</span>
          <span className="text-foreground font-semibold">{isEdit ? `Edit ${editId}` : (form.details.documentType === "proforma" ? "Create Proforma Invoice" : "Create Invoice")}</span>
        </nav>

        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={savingDraft}>
          <Save className="h-3.5 w-3.5" /> {savingDraft ? "Saving…" : "Save Draft"}
        </Button>
        <button onClick={() => attemptNav("/invoice")} className="grid h-9 w-9 place-items-center rounded-xl border border-black/25 bg-card text-indigo-600 shadow-card transition hover:bg-indigo-50 hover:border-indigo-200" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Stepper */}
      <div className="relative mx-auto w-full max-w-6xl px-4 pt-2 pb-2 sm:px-6 lg:px-8">
        <div className="hidden md:flex items-center justify-between">
          {STEPS.slice(0, 6).map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => goToStep(s.id)}
                className={cn("flex items-center gap-2 group cursor-pointer")}
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
      <div className="relative mx-auto w-full max-w-6xl px-4 pt-4 pb-4 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
            {step === 1 && <StepCustomer form={form} updateForm={updateForm} />}
            {step === 2 && <StepDetails form={form} updateForm={updateForm} />}
            {step === 3 && <StepProducts form={form} updateForm={updateForm} showErrors={showProductErrors} />}
            {step === 4 && <StepPricing form={form} updateForm={updateForm} totals={totals} />}
            {step === 5 && <StepNotes form={form} updateForm={updateForm} />}
            {step === 6 && <StepReview form={form} totals={totals} isEdit={isEdit} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav — sits naturally below the form, sharing the page background */}
      {step < 7 && (
        <div className="relative bg-[#EFF0F6]">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-end px-4 pt-2 pb-6 sm:px-6 lg:px-8">
            {step < 6 ? (
              <Button size="md" onClick={goNext} className="mr-[145px]">
                {(step === 3 || step === 4) && form.devices.length > 1 && form.activeDeviceIndex < form.devices.length - 1
                  ? <>Next Device ({form.activeDeviceIndex + 2}/{form.devices.length})</>
                  : <>Next</>} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="md" onClick={handleSubmit} className="mr-[145px]">
                <Save className="h-4 w-4" /> {(() => {
                  const noun = form.details.documentType === "proforma" ? "Proforma" : "Invoice";
                  return isEdit ? `Save ${noun}` : `Create ${noun}`;
                })()}
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

function invoiceToForm(inv: Invoice, ticketNo?: string): InvoiceFormData {
  // Restore devices if available, otherwise create a single device from flat items
  const devices: InvoiceFormDevice[] = inv.devices && inv.devices.length > 0
    ? inv.devices.map((d) => createFormDevice({
        id: d.id,
        ticketDeviceId: d.ticketDeviceId || undefined,
        repairStatus: inv.repairStatus,
        category: d.category || "",
        brand: d.brand,
        model: d.model,
        brandId: (d as any).brandId || undefined,
        modelId: (d as any).modelId || undefined,
        imei: d.imei,
        imeiType: d.imeiType,
        issue: d.issue,
        description: d.description,
        jobType: d.jobType,
        priority: d.priority,
        warranty: d.warranty,
        warrantyValue: d.warrantyValue ? String(d.warrantyValue) : "",
        warrantyUnit: d.warrantyUnit || "",
        deviceColour: d.deviceColour || "",
        technician: d.technician,
        estimateValue: d.estimateValue ? String(d.estimateValue) : "",
        repairCost: d.repairCost ? String(d.repairCost) : "",
        notes: d.notes,
        parts: d.parts,
      }))
    : [createFormDevice({ technician: inv.employee || "", parts: inv.items })];

  return {
    customer: { name: inv.customer, phone: inv.phone, altPhone: "", email: inv.email || "", company: inv.company || "", gstNumber: inv.gstNumber || "", customerId: inv.customerId },
    details: { dueDate: inv.dueDate?.slice(0, 10) || "", employee: inv.employee || "", ticketId: inv.ticketId || "", ticketNo: ticketNo || inv.ticketId || "", ticketLocked: !!inv.ticketId, status: inv.status, repairStatus: inv.repairStatus ?? "repaired_collected", invoiceType: inv.invoiceType || "retail", serviceCategory: inv.serviceCategory || "service", documentType: inv.documentType ?? "invoice", sourceEstimateId: inv.sourceEstimateId, sourceTicketId: inv.sourceTicketId, sourceProformaId: inv.sourceProformaId },
    items: inv.items,
    devices,
    activeDeviceIndex: 0,
    pricing: { discount: inv.discount, gstRate: inv.gstRate ?? 18, paymentMode: inv.paymentMode || "" },
    notes: { notes: inv.notes || "", terms: inv.terms || "", slogan: inv.slogan || "", footer: inv.footer || "" },
  };
}

/* ─── Step 1: Customer ───────────────────────────────────────────────── */

function StepCustomer({ form, updateForm }: { form: InvoiceFormData; updateForm: (fn: (f: InvoiceFormData) => InvoiceFormData) => void }) {
  const { customers } = useStore();
  const { contacts } = useLeads();
  const c = form.customer;
  const d = form.details;
  const [showResults, setShowResults] = useState(false);

  const set = (k: keyof typeof c, v: string) =>
    updateForm((f) => ({
      ...f,
      // Editing the name after a customer was picked breaks the link to that
      // Customer Master record — clear customerId so loyalty/stats don't get
      // attributed to a now-stale identity.
      customer: { ...f.customer, [k]: v, ...(k === "name" ? { customerId: undefined } : {}) },
    }));
  const setType = (v: string) => updateForm((f) => ({
    ...f,
    details: { ...f.details, invoiceType: v as any },
    // Company / Organization + GST are Business-only billing details. Clear
    // them when switching to Retail so a hidden value never lands on the saved
    // invoice; they reappear (blank) if the user switches back to Business.
    customer: v === "retail" ? { ...f.customer, company: "", gstNumber: "" } : f.customer,
  }));

  // Search over BOTH the Customer Master AND un-promoted CRM contacts so a
  // captured contact is fetchable here. A contact-candidate is virtual — it's
  // promoted to a real Customer via findOrCreateCustomer at invoice save time.
  const results: CustomerCandidate[] = c.name.trim().length >= 2 ? searchCustomerCandidates(customers, contacts, c.name) : [];

  const selectCustomer = (cust: CustomerCandidate) => {
    setShowResults(false);
    updateForm((f) => ({
      ...f,
      customer: {
        name: cust.fullName,
        phone: cust.mobile,
        altPhone: cust.altMobile || "",
        email: cust.email,
        company: cust.company,
        gstNumber: cust.gstNumber || "",
        // A contact-candidate has no Customer Master id yet — leave it
        // undefined so save-time promotion links the real customer.
        customerId: cust.isContact ? undefined : cust.id,
      },
      details: {
        ...f.details,
        invoiceType: cust.type === "business" ? "business" : f.details.invoiceType,
      },
    }));
  };

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-black/15 bg-card shadow-card">
      {/* Invoice Type — compact inline selector */}
      <div className="border-b border-border px-6 py-5 sm:px-8">
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

      {/* Customer Info */}
      <div className="px-6 py-8 sm:px-8">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-5">Customer Information</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Customer Name with inline search */}
          <div className="space-y-1 relative">
            <Label>Customer Name *</Label>
            <Input
              value={c.name}
              onChange={(e: any) => { set("name", e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              placeholder="Type to search or enter name"
              iconLeft={<Search className="h-3.5 w-3.5" />}
            />
            {/* Autocomplete dropdown */}
            {showResults && results.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[240px] overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                {results.slice(0, 6).map((cust) => (
                  <button
                    key={cust.id}
                    type="button"
                    onClick={() => selectCustomer(cust)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition border-b border-border last:border-0 hover:bg-indigo-50/50"
                  >
                    <span className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                      cust.type === "business" ? "bg-violet-100 text-violet-700" : "bg-[#EEF1FD] text-[#4361EE]"
                    )}>
                      {cust.firstName[0]}{cust.lastName[0] || ""}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium truncate">{cust.fullName}</p>
                        <CustomerLifecycleBadge lifecycle={customerLifecycle(cust)} />
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {cust.mobile}
                        {cust.company && <> · {cust.company}</>}
                        {cust.isContact && <> · Prospect</>}
                      </p>
                    </div>
                    {cust.type === "business" && (
                      <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700 uppercase">Biz</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1"><Label>Phone</Label><Input value={c.phone} onChange={(e: any) => set("phone", e.target.value)} placeholder="+91 98456 12345" /></div>
          <div className="space-y-1"><Label>Alternate Number</Label><Input value={c.altPhone} onChange={(e: any) => set("altPhone", e.target.value)} placeholder="+91 …" /></div>
          <div className="space-y-1"><Label>Email</Label><Input value={c.email} onChange={(e: any) => set("email", e.target.value)} placeholder="customer@email.com" type="email" /></div>
          {/* Company / Organization + GST Number — Business invoices only.
              Like GST, the org name is a business-billing detail, so it stays
              hidden for a Retail (individual / walk-in) invoice and appears as a
              paired row only when Business is selected. */}
          {d.invoiceType === "business" && (
            <>
              <div className="space-y-1">
                <Label>Company / Organization</Label>
                <Input value={c.company} onChange={(e: any) => set("company", e.target.value)} placeholder="e.g. Kapoor Electronics" />
              </div>
              <div className="space-y-1">
                <Label>GST Number</Label>
                <Input
                  value={c.gstNumber}
                  onChange={(e: any) => set("gstNumber", e.target.value.toUpperCase())}
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  className="font-mono tracking-wider uppercase"
                  maxLength={15}
                />
              </div>
            </>
          )}
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
    <div className="mx-auto max-w-2xl rounded-2xl border border-black/15 bg-card p-6 shadow-card sm:p-10">
      <h2 className="font-display text-lg font-bold mb-1">Invoice Details</h2>
      <p className="text-sm text-muted-foreground mb-8">Linked ticket, dates, and assignment.</p>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
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
        {/* Linked Ticket — occupies the previous Reference slot (same position,
            width and styling). Locked/read-only when the invoice originated from
            a "Push to Invoice" action; a searchable picker otherwise. */}
        <div className="space-y-1.5"><Label>Linked Ticket</Label><LinkedTicketField form={form} updateForm={updateForm} /></div>
        <div className="space-y-1.5"><Label>Due Date</Label><Input type="date" value={d.dueDate} onChange={(e: any) => set("dueDate", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Created by</Label><Input value={d.employee} onChange={(e: any) => set("employee", e.target.value)} placeholder="Anjali R." /></div>
      </div>
    </div>
  );
}

/* ─── Linked Ticket Field ────────────────────────────────────────────
   - Locked read-only display when the invoice was created from a ticket push
     (relationship already established → cannot be changed here).
   - Searchable picker for standalone invoices: optional, blank when unset.
   Stores the ticket's stable primary key in details.ticketId (FK-safe) and its
   display number in details.ticketNo. */
function LinkedTicketField({ form, updateForm }: { form: InvoiceFormData; updateForm: (fn: (f: InvoiceFormData) => InvoiceFormData) => void }) {
  const { tickets } = useStore();
  const d = form.details;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const results = q.trim().length >= 1
    ? tickets.filter((t) => {
        const query = q.toLowerCase();
        return (
          (t.ticketNo || "").toLowerCase().includes(query) ||
          t.id.toLowerCase().includes(query) ||
          (t.customer || "").toLowerCase().includes(query) ||
          (t.phone || "").toLowerCase().includes(query)
        );
      }).slice(0, 8)
    : [];

  const selectTicket = (id: string, ticketNo: string) => {
    updateForm((f) => ({ ...f, details: { ...f.details, ticketId: id, ticketNo } }));
    setOpen(false);
    setQ("");
  };

  const clearTicket = () => {
    updateForm((f) => ({ ...f, details: { ...f.details, ticketId: "", ticketNo: "" } }));
  };

  // Locked: relationship established via Push-to-Invoice — read-only.
  if (d.ticketLocked && d.ticketId) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#EEF1FD] text-[#4361EE]"><Link2 className="h-3.5 w-3.5" /></span>
        <span className="flex-1 text-sm font-medium tabular-nums">{d.ticketNo || d.ticketId}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"><Check className="h-3 w-3" /> Linked</span>
      </div>
    );
  }

  // Selected (standalone) — show the chosen ticket with a clear button.
  if (d.ticketId) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#4361EE]/30 bg-[#EEF1FD]/40 px-3 py-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#EEF1FD] text-[#4361EE]"><Link2 className="h-3.5 w-3.5" /></span>
        <span className="flex-1 text-sm font-medium tabular-nums">{d.ticketNo || d.ticketId}</span>
        <button type="button" onClick={clearTicket} className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted" aria-label="Remove linked ticket"><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }

  // Unlinked — optional searchable picker.
  return (
    <div className="relative">
      <Input
        value={q}
        onChange={(e: any) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search a ticket to link (optional)"
        iconLeft={<Search className="h-3.5 w-3.5" />}
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-[240px] overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {results.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTicket(t.id, t.ticketNo ?? t.id)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition border-b border-border last:border-0 hover:bg-indigo-50/50"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE] text-[10px] font-bold tabular-nums">{(t.ticketNo ?? t.id).replace(/^T-?/i, "").slice(0, 3) || "T"}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{t.ticketNo ?? t.id}</p>
                <p className="text-[10px] text-muted-foreground truncate">{t.customer}{t.device ? ` · ${t.device}` : ""}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && q.trim().length >= 1 && results.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-xl border border-border bg-card shadow-lg">
          <p className="text-center text-sm text-muted-foreground py-3">No tickets match &ldquo;{q}&rdquo;</p>
        </div>
      )}
    </div>
  );
}

/* ─── Line-item name field with inline inventory autocomplete ─────────
   The Item cell in the line-item table is inventory-aware: typing searches the
   Inventory Master (same store-scoped useStore().inventory, debounced) and
   shows matching items in a dropdown. Picking one binds the line to that master
   item (name / sku / price) via onPick — it never creates or mutates a master
   record. Free typing still works for non-inventory / manual lines. */
function LineItemNameInput({
  value,
  onChange,
  onPick,
  placeholder,
  onAddInventory,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (item: InventoryItem) => void;
  placeholder?: string;
  /** When provided, an "+ Add Inventory" action shows if a search yields no
   *  matching master item. The caller gates this on CAP.inventory.create. */
  onAddInventory?: (searchTerm: string) => void;
}) {
  const { inventory } = useStore();
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 160);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const query = debounced.trim().toLowerCase();
  const results = useMemo(() => {
    if (query.length < 1) return [];
    return inventory
      .filter((item) =>
        item.active && (
          item.name.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query) ||
          (item.hsnCode ? item.hsnCode.toLowerCase().includes(query) : false)
        )
      )
      .slice(0, 8);
  }, [inventory, query]);

  const hasQuery = query.length >= 1;
  const showList = open && results.length > 0;
  const showEmpty = open && hasQuery && results.length === 0;

  return (
    <div className="relative" ref={wrapRef}>
      {/* Search-styled field: leading icon inside, text padded clear of it so
          the placeholder is never clipped. */}
      <div className="flex h-9 items-center gap-2 rounded-xl border border-input bg-card px-2.5 transition-colors focus-within:border-[#4361EE] focus-within:ring-2 focus-within:ring-[#4361EE]/15">
        <Search className="h-4 w-4 shrink-0 text-[#4361EE]" />
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length > 0) { e.preventDefault(); onPick(results[0]); setOpen(false); }
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
          autoComplete="off"
        />
      </div>
      {showList && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[240px] overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
          {results.map((item) => {
            const available = item.currentStock - (item.reservedStock || 0);
            const out = item.type === "Product" && available <= 0;
            return (
              <button
                key={item.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onPick(item); setOpen(false); }}
                className="flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left transition last:border-0 hover:bg-indigo-50/50"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Package className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{item.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{item.id} · {item.category}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-semibold tabular-nums">{formatINR(item.regularSellingPrice)}</p>
                  <span className={cn("text-[10px]", out ? "text-rose-500" : "text-muted-foreground")}>
                    {item.type === "Service" ? "Service" : out ? "Out of stock" : `Stock: ${available}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {showEmpty && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-border bg-card p-3.5 shadow-xl">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"><PackageSearch className="h-4 w-4" /></span>
            <p className="text-[13px] text-muted-foreground">
              No inventory found for &ldquo;<span className="font-medium text-foreground">{debounced.trim()}</span>&rdquo;
            </p>
            {onAddInventory ? (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onAddInventory(debounced.trim()); setOpen(false); }}
                className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-[#4361EE] px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#3347D6]"
              >
                <Plus className="h-3.5 w-3.5" /> Add to Inventory
              </button>
            ) : (
              <p className="text-[11px] text-muted-foreground">Add it in the Inventory module first.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Step 3: Devices & Products (Multi-Device) ──────────────────────── */

function StepProducts({ form, updateForm, showErrors = false }: { form: InvoiceFormData; updateForm: (fn: (f: InvoiceFormData) => InvoiceFormData) => void; showErrors?: boolean }) {
  const { can } = usePermissions();
  const activeIdx = form.activeDeviceIndex;
  const activeDevice = form.devices[activeIdx] || form.devices[0];

  // Category options — reuse the same Settings-backed master used everywhere.
  const [categoryOptions, setCategoryOptions] = useState<{ id: string; label: string }[]>(
    () => getCachedCategories()?.map((c) => ({ id: c.id, label: c.label })) ?? []
  );
  useEffect(() => {
    let alive = true;
    loadDeviceCategories().then((cats) => {
      if (alive) setCategoryOptions(cats.map((c) => ({ id: c.id, label: c.label })));
    });
    return () => { alive = false; };
  }, []);
  // Inventory search popover (live search → add existing item as a line) and
  // the Add Inventory modal (create a NEW Inventory Master record) are two
  // DISTINCT workflows, tracked separately.
  const [showInventorySearch, setShowInventorySearch] = useState(false);
  const [showAddInventory, setShowAddInventory] = useState(false);
  const [addInventorySeed, setAddInventorySeed] = useState("");
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Close the inventory search popover on outside click / Escape.
  useEffect(() => {
    if (!showInventorySearch) return;
    const onDown = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowInventorySearch(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showInventorySearch]);

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

  const setDeviceField = (key: string, value: string | undefined) => {
    updateForm((f) => ({
      ...f,
      devices: f.devices.map((d, i) => {
        if (i !== activeIdx) return d;
        // Changing category resets the dependent brand/model (+ their ids) on
        // THIS device only, so stale values can't survive a category switch.
        if (key === "category" && (d.category || "") !== (value || "")) {
          return { ...d, category: value as string, brand: "", brandId: undefined, model: "", modelId: undefined };
        }
        return { ...d, [key]: value };
      }),
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

  // Bind an EXISTING line row to an inventory item picked from the inline
  // autocomplete in the Item cell. Fills name / sku / price / description from
  // the master (references it, never mutates it); keeps the row's current qty
  // and recomputes the total.
  const setLineFromInventory = (partId: string, item: InventoryItem) => {
    updateForm((f) => ({
      ...f,
      devices: f.devices.map((d, i) => {
        if (i !== activeIdx) return d;
        return {
          ...d,
          parts: d.parts.map((p) =>
            p.id === partId
              ? { ...p, name: item.name, sku: item.id, price: item.regularSellingPrice, description: item.category, total: p.qty * item.regularSellingPrice }
              : p
          ),
        };
      }),
    }));
  };

  // Add an EXISTING Inventory Master item to the active device as a line item.
  // If the same inventory item (matched by sku) is already on the device, bump
  // its quantity instead of adding a duplicate row — the master record is never
  // touched, only the invoice line.
  const addInventoryLine = (item: InventoryItem) => {
    updateForm((f) => ({
      ...f,
      devices: f.devices.map((d, i) => {
        if (i !== activeIdx) return d;
        const existing = d.parts.find((p) => p.sku && p.sku === item.id);
        if (existing) {
          return {
            ...d,
            parts: d.parts.map((p) =>
              p.id === existing.id
                ? { ...p, qty: p.qty + 1, total: (p.qty + 1) * p.price }
                : p
            ),
          };
        }
        return {
          ...d,
          parts: [
            ...d.parts,
            { id: genLineId(), name: item.name, sku: item.id, qty: 1, price: item.regularSellingPrice, discount: 0, total: item.regularSellingPrice, description: item.category },
          ],
        };
      }),
    }));
  };

  // Add a NON-inventory line item (a manual service / charge). This is a
  // billed invoice line with no Inventory Master record — the existing invoice
  // line-item architecture already supports free-text items with a price.
  const addService = () => {
    updateForm((f) => ({
      ...f,
      devices: f.devices.map((d, i) => i === activeIdx
        ? { ...d, parts: [...d.parts, { id: genLineId(), name: "", qty: 1, price: 0, discount: 0, total: 0 }] }
        : d
      ),
    }));
  };

  const deviceSubtotal = activeDevice.parts.reduce((s, p) => s + p.total, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* Device Tabs */}
      <div className="rounded-2xl border border-black/15 bg-card shadow-card">
        <div className="border-b border-border px-6 py-2.5 sm:px-8">
          <div className="flex items-center gap-3">
            <p className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Devices ({form.devices.length})</p>
            <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
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
            <Button size="sm" className="shrink-0" onClick={addDevice}><Plus className="h-3.5 w-3.5" /> Add Device</Button>
          </div>
        </div>

        {/* Active Device Form */}
        <div className="px-6 pt-3 pb-3 sm:px-8 space-y-2.5">
          {/* Device Details */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Device Details</p>
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-3">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={activeDevice.category || ""}
                  onChange={(e: any) => setDeviceField("category", e.target.value)}
                  options={[{ label: "Select category…", value: "" }, ...categoryOptions.map((c) => ({ label: c.label, value: c.id }))]}
                  className="h-9"
                />
              </div>
              <DeviceBrandModelSelector
                brand={activeDevice.brand}
                model={activeDevice.model}
                categoryId={activeDevice.category || ""}
                brandId={activeDevice.brandId}
                modelId={activeDevice.modelId}
                onBrandChange={(v) => setDeviceField("brand", v)}
                onModelChange={(v) => setDeviceField("model", v)}
                onBrandIdChange={(v) => setDeviceField("brandId", v)}
                onModelIdChange={(v) => setDeviceField("modelId", v)}
              />
              {/* Second row: IMEI / Serial paired with Warranty (per the detail
                  layout — Warranty sits directly next to the identifier). */}
              {/* Single intelligent identifier field — auto-detects IMEI vs
                  Serial from the value. When pushed from a ticket the type is
                  copied (never re-inferred); editing the value recalculates it. */}
              <div className="space-y-1">
                <Label>{detectIdentifier(activeDevice.imei).label}</Label>
                <Input
                  value={activeDevice.imei}
                  onChange={(e: any) => {
                    const val = sanitizeIdentifierInput(e.target.value);
                    const nextType = resolveIdentifierType(val);
                    updateForm((f) => ({
                      ...f,
                      devices: f.devices.map((d, i) => i === activeIdx
                        ? { ...d, imei: val, imeiType: nextType }
                        : d
                      ),
                    }));
                  }}
                  placeholder={IDENTIFIER_PLACEHOLDER}
                  maxLength={16}
                  className="h-9 font-mono"
                  autoComplete="off"
                />
              </div>
              {/* Warranty — moved beside IMEI / Serial. Same underlying logic
                  (value + duration → `warranty` label); only the placement and
                  the centered value alignment changed. */}
              {/* Warranty is MANDATORY. When the user tries to advance without a
                  value + duration, `showErrors` turns the field red (matching
                  the Lead form). A value of 0 is VALID (e.g. "0 Days"). */}
              {(() => {
                const warrantyValueInvalid = showErrors && activeDevice.warrantyValue.trim() === "";
                const warrantyUnitInvalid = showErrors && !activeDevice.warrantyUnit;
                const warrantyInvalid = warrantyValueInvalid || warrantyUnitInvalid;
                return (
              <div className="space-y-1">
                <Label>Warranty <span className="text-rose-500">*</span></Label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={activeDevice.warrantyValue}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      updateForm((f) => ({
                        ...f,
                        devices: f.devices.map((d, i) => i === activeIdx
                          ? { ...d, warrantyValue: val, warranty: val !== "" && d.warrantyUnit ? `${val} ${d.warrantyUnit.charAt(0).toUpperCase() + d.warrantyUnit.slice(1)}` : "" }
                          : d
                        ),
                      }));
                    }}
                    placeholder="0"
                    className={cn(
                      "h-9 w-[72px] rounded-xl border bg-card px-2.5 text-center text-sm font-medium text-foreground outline-none transition-all duration-150",
                      warrantyValueInvalid
                        ? "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-200/40"
                        : "border-input hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15"
                    )}
                  />
                  <div className="flex-1">
                    <Select className={cn("h-9", warrantyUnitInvalid && "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-200/40")} value={activeDevice.warrantyUnit} onChange={(e: any) => {
                      const unit = e.target.value;
                      updateForm((f) => ({
                        ...f,
                        devices: f.devices.map((d, i) => i === activeIdx
                          ? { ...d, warrantyUnit: unit, warranty: d.warrantyValue !== "" && unit ? `${d.warrantyValue} ${unit.charAt(0).toUpperCase() + unit.slice(1)}` : "" }
                          : d
                        ),
                      }));
                    }} placeholder="Duration" options={[
                      { label: "Days", value: "days" },
                      { label: "Months", value: "months" },
                      { label: "Years", value: "years" },
                    ]} />
                  </div>
                </div>
                {warrantyInvalid && (
                  <p className="text-[11px] font-medium text-rose-500">Enter a warranty value and select a duration.</p>
                )}
              </div>
                );
              })()}
              {/* Notes — moved up into the Device Details row alongside IMEI /
                  Serial and Warranty (per the detail layout). Same field, same
                  data + persistence; only its placement changed. */}
              <div className="space-y-1">
                <Label>Notes</Label>
                <Input value={activeDevice.notes} onChange={(e: any) => setDeviceField("notes", e.target.value)} placeholder="Optional notes" className="h-9" />
              </div>
            </div>
          </div>

          {/* Job Details — Priority removed (no invoice/pricing meaning; it stays
              a Ticket concept). */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Job Details</p>
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 md:grid-cols-3">
              <div className="space-y-1"><Label>Issue</Label><Input value={activeDevice.issue} onChange={(e: any) => setDeviceField("issue", e.target.value)} placeholder="Display replacement" className="h-9" /></div>
              <div className="space-y-1">
                <Label>Job Type</Label>
                <Select value={activeDevice.jobType} onChange={(e: any) => setDeviceField("jobType", e.target.value)} className="h-9" options={[
                  { label: "Service", value: "service" }, { label: "Accessories", value: "accessories" }, { label: "Warranty", value: "warranty" }, { label: "Estimate", value: "estimate" }, { label: "Buyback", value: "buyback" },
                ]} />
              </div>
              <div className="space-y-1"><Label>Technician</Label><Input value={activeDevice.technician} onChange={(e: any) => setDeviceField("technician", e.target.value)} placeholder="Anand" className="h-9" /></div>
            </div>
          </div>

          {/* ── Boundary before the Inventory Cost workspace ── */}
          <div className="border-t border-border pt-4 mt-3" />

          {/* INVENTORY COST — the primary working area of the Products step.
              Two DISTINCT workflows live here:
                • Search Inventory → select an existing Inventory Master item →
                  it becomes an invoice LINE ITEM (addInventoryLine).
                • Add Inventory   → opens the canonical Inventory Master create
                  form (AddInventoryModal) → creates a REAL master record; the
                  new item is then findable in Search and can be added as a line.
              Add Service adds a non-inventory manual charge. Master creation is
              NEVER the same action as adding a line item. */}
          <div className="overflow-hidden rounded-2xl border-2 border-zinc-300 bg-gradient-to-b from-[#4361EE]/[0.05] to-transparent shadow-sm">
            {/* Section header — clean, professional ERP inventory workspace. */}
            <div className="flex flex-col gap-2.5 rounded-t-2xl border-b-2 border-zinc-300 bg-[#EEF1FD]/70 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#3347D6] text-white shadow-sm">
                  <Package className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[13px] font-bold uppercase tracking-wider text-[#1E2A8A]">Inventory</p>
                  <p className="text-[11px] text-muted-foreground">
                    {activeDevice.parts.length > 0
                      ? `${activeDevice.parts.length} line item${activeDevice.parts.length !== 1 ? "s" : ""} · ${formatINR(deviceSubtotal)}`
                      : "Search the inventory to bill items on this invoice"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant={showInventorySearch ? "secondary" : "outline"} onClick={() => setShowInventorySearch((v) => !v)} className={showInventorySearch ? undefined : "border-[#4361EE]/30 hover:border-[#4361EE]/50"}>
                  <Search className="h-3.5 w-3.5" /> Search Inventory
                </Button>
                <Button size="sm" variant="outline" onClick={addService} className="border-[#4361EE]/30 hover:border-[#4361EE]/50">
                  <Plus className="h-3.5 w-3.5" /> Add Row
                </Button>
                {/* Add Inventory (create a master record) — only when the user
                    holds an inventory create capability. Search/select stays
                    available to any invoice user regardless. */}
                <Can permission={CAP.inventory.create}>
                  <Button size="sm" onClick={() => { setAddInventorySeed(""); setShowAddInventory(true); }}>
                    <Plus className="h-3.5 w-3.5" /> Add Inventory
                  </Button>
                </Can>
              </div>
            </div>

            <div className="px-4 py-3 sm:px-5">
              {/* Live inventory search — anchored popover, type-to-search. */}
              {showInventorySearch && (
                <div className="relative z-30 mb-4" ref={searchWrapRef}>
                  <InventorySearchBox
                    onSelect={(item) => { addInventoryLine(item); /* keep open for rapid multi-add */ }}
                    onClose={() => setShowInventorySearch(false)}
                    onAddInventory={(term) => {
                      // Empty-state "+ Add Inventory" — gated too: only open the
                      // create form when the user can create inventory.
                      if (allow(can, CAP.inventory.create)) {
                        setAddInventorySeed(term);
                        setShowInventorySearch(false);
                        setShowAddInventory(true);
                      }
                    }}
                  />
                </div>
              )}

              {/* Line-item workspace */}
              {activeDevice.parts.length === 0 ? (
                // Empty state — compact prompt only. The actions live in the
                // section header above, so we DON'T repeat the three buttons
                // here; a single "Search Inventory" link is enough to get going.
                <button
                  type="button"
                  onClick={() => setShowInventorySearch(true)}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-dashed border-[#4361EE]/30 bg-card/60 px-4 py-4 text-center transition hover:border-[#4361EE]/50 hover:bg-[#EEF1FD]/40"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                    <Search className="h-4 w-4" />
                  </span>
                  <span className="text-left">
                    <span className="block text-[13px] font-semibold text-foreground">No items added yet</span>
                    <span className="block text-[11px] text-muted-foreground">Click to search the inventory and add an item.</span>
                  </span>
                </button>
              ) : (
                <div className="overflow-hidden rounded-xl border-2 border-zinc-300 bg-card">
                  {/* Table header */}
                  <div className="hidden grid-cols-[1fr_80px_110px_110px_44px] gap-2 border-b border-zinc-300 bg-muted/60 px-3 py-2 sm:grid">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Qty</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</span>
                    <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</span>
                    <span />
                  </div>
                  {activeDevice.parts.map((item) => (
                    <div key={item.id} className="grid grid-cols-1 gap-2 border-t border-zinc-300 px-3 py-2.5 first:border-t-0 sm:grid-cols-[1fr_80px_110px_110px_44px] sm:items-center sm:gap-2">
                      <div className="space-y-1 sm:space-y-0">
                        <Label className="sm:hidden">Item</Label>
                        <LineItemNameInput
                          value={item.name}
                          onChange={(v) => updatePart(item.id, "name", v)}
                          onPick={(inv) => setLineFromInventory(item.id, inv)}
                          placeholder="Type to search inventory, or enter an item…"
                          onAddInventory={allow(can, CAP.inventory.create) ? (term) => { setAddInventorySeed(term); setShowAddInventory(true); } : undefined}
                        />
                      </div>
                      <div className="space-y-1 sm:space-y-0">
                        <Label className="sm:hidden">Qty</Label>
                        <NumericInput value={item.qty} onChange={(v) => updatePart(item.id, "qty", v)} min={1} className="h-9" />
                      </div>
                      <div className="space-y-1 sm:space-y-0">
                        <Label className="sm:hidden">Price</Label>
                        <NumericInput value={item.price} onChange={(v) => updatePart(item.id, "price", v)} iconLeft={<span className="text-[13px]">₹</span>} className="h-9" />
                      </div>
                      <div className="space-y-1 sm:space-y-0">
                        <Label className="sm:hidden">Total</Label>
                        <div className="flex h-9 items-center justify-end rounded-xl border border-border bg-muted/40 px-3 text-sm font-semibold tabular-nums sm:border-0 sm:bg-transparent sm:px-0">{formatINR(item.total)}</div>
                      </div>
                      <div className="flex items-center justify-end">
                        <button onClick={() => removePart(item.id)} className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 transition hover:bg-rose-50" aria-label="Remove line item"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeDevice.parts.length > 0 && (
                <div className="mt-3 flex justify-end">
                  <div className="rounded-xl border border-[#4361EE]/30 bg-white px-4 py-2 text-sm shadow-sm">
                    <span className="text-muted-foreground">Device Subtotal: </span>
                    <span className="font-bold tabular-nums text-[#3347D6]">{formatINR(deviceSubtotal)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Inventory modal — creates a canonical Inventory Master record and,
          on success, adds it to this device as a line item so the user doesn't
          have to search for what they just created. */}
      <AddInventoryModal
        open={showAddInventory}
        onClose={() => setShowAddInventory(false)}
        initialName={addInventorySeed}
        onCreated={(item) => addInventoryLine(item)}
      />
    </div>
  );
}

/* ─── Step 4: Pricing ────────────────────────────────────────────────── */

function StepPricing({ form, updateForm, totals }: { form: InvoiceFormData; updateForm: (fn: (f: InvoiceFormData) => InvoiceFormData) => void; totals: { subtotal: number; partsTotal: number; repairCost: number; estimateTotal: number; discount: number; sgst: number; cgst: number; sgstRate: number; cgstRate: number; gstRate: number; tax: number; total: number } }) {
  const { settings } = useStoreSettings();
  const { updateDeviceStatus, invoices } = useStore();
  const gstPresets = settings.invoiceGstRates?.length ? settings.invoiceGstRates : [0, 12, 18];
  const paymentModeOptions = [
    { label: "Select payment mode…", value: "" },
    ...settings.invoicePaymentModes.map((m) => ({ label: PAYMENT_MODE_LABEL[m] ?? titleCase(m), value: m })),
  ];
  const p = form.pricing;
  const d = form.details;
  const [customGst, setCustomGst] = useState(!gstPresets.includes(p.gstRate));
  const [customRaw, setCustomRaw] = useState(String(p.gstRate));
  const [customFocused, setCustomFocused] = useState(false);

  // Per-device pricing context. The device pills mirror the Products step so
  // the user can switch devices here and set each device's Repair Status; the
  // Repair Status control edits the ACTIVE device only. Status / Payment / GST
  // and the Grand Total remain invoice-level. Single-device invoices behave
  // exactly as before (the pills row simply isn't rendered).
  const multiDevice = form.devices.length > 1;
  const activeIdx = form.activeDeviceIndex;
  const activeDevice = form.devices[activeIdx] || form.devices[0];
  const activeDeviceSubtotal = activeDevice ? activeDevice.parts.reduce((s, li) => s + li.total, 0) : 0;
  const activeDeviceLabel = activeDevice
    ? ([activeDevice.brand, activeDevice.model].filter(Boolean).join(" ") || `Device ${activeIdx + 1}`)
    : "";
  const switchDevice = (idx: number) => updateForm((f) => ({ ...f, activeDeviceIndex: idx }));
  const ticketId = form.details.ticketId;
  const ticketHasInvoice = !!ticketId && invoices.some((inv) => inv.ticketId === ticketId);
  // Effective Repair Status for the active device (falls back to the invoice
  // default when the device hasn't got its own yet).
  const activeStatus: TicketStatus = activeDevice?.repairStatus ?? d.repairStatus;
  // Set the active device's Repair Status: mirror on the form AND update the
  // real ticket device (so the ticket, activity log + linked invoices sync).
  const setActiveStatus = (next: TicketStatus) => {
    updateForm((f) => ({
      ...f,
      details: { ...f.details, repairStatus: next },
      devices: f.devices.map((x, i) => (i === activeIdx ? { ...x, repairStatus: next } : x)),
    }));
    if (ticketId && activeDevice?.ticketDeviceId) {
      void updateDeviceStatus(ticketId, activeDevice.ticketDeviceId, next);
    }
  };

  return (
    <div className="rounded-2xl border border-black/15 bg-card p-6 shadow-card sm:p-8 max-w-2xl mx-auto">
      <h2 className="font-display text-lg font-bold mb-1">Pricing & Payment</h2>
      <p className="text-sm text-muted-foreground mb-6">Discount, tax, payment mode, and status.</p>

      {/* Device pills — same pattern as the Products step. Lets the user switch
          devices and set each device's Repair Status. Read-only switching (add /
          remove devices lives in the Products step). */}
      {multiDevice && (
        <div className="mb-5 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
          <p className="shrink-0 pr-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Device</p>
          {form.devices.map((dev, idx) => {
            const label = [dev.brand, dev.model].filter(Boolean).join(" ") || `Device ${idx + 1}`;
            const isActive = idx === activeIdx;
            return (
              <button
                key={dev.id}
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
                <span className="max-w-[110px] truncate">{label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Status</Label>
          {d.documentType === "proforma" ? (
            // A Proforma is a NON-financial commercial document — it never carries
            // a payment status (Paid/Sent/Overdue…). Show a fixed, read-only label
            // instead of the financial status selector.
            <div className="flex h-11 items-center rounded-xl border border-border bg-muted/50 px-3 text-sm font-medium text-[#3347D6]">
              Proforma Invoice (non-financial)
            </div>
          ) : (
            <Select value={d.status} onChange={(e: any) => updateForm((f) => ({ ...f, details: { ...f.details, status: e.target.value } }))} options={[
              { label: "Draft", value: "draft" }, { label: "Sent", value: "sent" }, { label: "Paid", value: "paid" },
              { label: "Partial", value: "partial" }, { label: "Overdue", value: "overdue" }, { label: "Cancelled", value: "cancelled" },
            ]} />
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Mode of Payment</Label>
          <Select value={p.paymentMode} onChange={(e: any) => updateForm((f) => ({ ...f, pricing: { ...f.pricing, paymentMode: e.target.value } }))} options={paymentModeOptions} />
        </div>
        <div className="space-y-1.5"><Label>Discount (flat amount)</Label><NumericInput value={p.discount} onChange={(v) => updateForm((f) => ({ ...f, pricing: { ...f.pricing, discount: v } }))} iconLeft={<span className="text-[13px]">₹</span>} /></div>
        <div className="space-y-1.5">
          <Label>{multiDevice ? `Repair Status — ${activeDeviceLabel}` : "Repair Status"}</Label>
          <StatusPillSelect
            value={activeStatus}
            onChange={(v) => setActiveStatus(v)}
            blockedStatuses={!ticketHasInvoice && activeStatus !== "repaired_collected" ? ["repaired_collected"] : undefined}
            blockedReason="Create an invoice before selecting Repaired & Collected"
          />
        </div>
        <div className="space-y-1.5">
          <Label>GST Rate</Label>
          <div className="flex items-center gap-1.5">
            {gstPresets.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => { updateForm((f) => ({ ...f, pricing: { ...f.pricing, gstRate: rate } })); setCustomGst(false); }}
                className={cn(
                  "flex-1 rounded-lg px-2 py-2 text-[12px] font-semibold transition-all text-center",
                  p.gstRate === rate && !customGst
                    ? "bg-[#4361EE] text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE]"
                )}
              >
                {rate}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setCustomGst(true); setCustomRaw(String(p.gstRate)); }}
              className={cn(
                "flex-1 rounded-lg px-2 py-2 text-[12px] font-semibold transition-all text-center",
                customGst
                  ? "bg-[#4361EE] text-white shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-[#EEF1FD] hover:text-[#4361EE]"
              )}
            >
              Custom
            </button>
          </div>
          {customGst && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={customFocused ? customRaw : String(p.gstRate)}
                onFocus={() => { setCustomFocused(true); setCustomRaw(String(p.gstRate)); }}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.]/g, "");
                  setCustomRaw(raw);
                  const v = parseFloat(raw);
                  if (!isNaN(v) && v >= 0 && v <= 100) {
                    updateForm((f) => ({ ...f, pricing: { ...f.pricing, gstRate: v } }));
                  } else if (raw === "" || raw === ".") {
                    updateForm((f) => ({ ...f, pricing: { ...f.pricing, gstRate: 0 } }));
                  }
                }}
                onBlur={() => setCustomFocused(false)}
                placeholder="Total GST %"
                className="h-9 w-24 rounded-lg border border-border bg-card px-2.5 text-sm font-medium tabular-nums text-center focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
              />
              <span className="text-[11px] text-muted-foreground">% → SGST {totals.sgstRate}% + CGST {totals.cgstRate}%</span>
            </div>
          )}
        </div>
      </div>
      {/* Summary */}
      <div className="mt-6 rounded-xl border border-border bg-gradient-to-b from-indigo-50/40 to-white p-5">
        <div className="space-y-2 text-sm">
          {multiDevice && activeDevice && (
            <div className="flex justify-between border-b border-border/60 pb-2"><span className="text-muted-foreground">{activeDeviceLabel} subtotal</span><span className="tabular-nums font-medium">{formatINR(activeDeviceSubtotal)}</span></div>
          )}
          {/* Estimate Value is a REFERENCE only — shown for context, never added
              to the billed subtotal/total. */}
          {totals.estimateTotal > 0 && (
            <div className="flex justify-between"><span className="text-muted-foreground">Estimate Value <span className="text-[11px]">(reference)</span></span><span className="tabular-nums text-muted-foreground">{formatINR(totals.estimateTotal)}</span></div>
          )}
          {/* Parts & Repair Cost are the two billed components that make up the
              subtotal. Show them separately when a repair cost exists. */}
          {totals.repairCost > 0 && (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Parts &amp; Services</span><span className="tabular-nums font-medium">{formatINR(totals.partsTotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Repair Cost</span><span className="tabular-nums font-medium">{formatINR(totals.repairCost)}</span></div>
            </>
          )}
          <div className="flex justify-between"><span className="text-muted-foreground">{multiDevice ? "Invoice Subtotal" : "Subtotal"}</span><span className="tabular-nums font-medium">{formatINR(totals.subtotal)}</span></div>
          {totals.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums text-emerald-600">-{formatINR(totals.discount)}</span></div>}
          {totals.sgst > 0 && <div className="flex justify-between"><span className="text-muted-foreground">SGST ({totals.sgstRate}%)</span><span className="tabular-nums">{formatINR(totals.sgst)}</span></div>}
          {totals.cgst > 0 && <div className="flex justify-between"><span className="text-muted-foreground">CGST ({totals.cgstRate}%)</span><span className="tabular-nums">{formatINR(totals.cgst)}</span></div>}
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>{multiDevice ? "Grand Total" : "Total"}</span><span className="tabular-nums brand-gradient-text">{formatINR(totals.total)}</span></div>
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
    <div className="mx-auto max-w-2xl rounded-2xl border border-black/15 bg-card p-6 shadow-card sm:p-8">
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

function StepReview({ form, totals, isEdit }: { form: InvoiceFormData; totals: { subtotal: number; partsTotal: number; repairCost: number; estimateTotal: number; discount: number; sgst: number; cgst: number; sgstRate: number; cgstRate: number; gstRate: number; tax: number; total: number }; isEdit: boolean }) {
  const hasDevices = form.devices.length > 0 && form.devices.some((d) => d.brand || d.model || d.parts.length > 0 || Number(d.estimateValue) > 0 || Number(d.repairCost) > 0);
  const statusLabel = (form.details.status || "draft").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="overflow-hidden rounded-2xl border border-black/15 bg-card shadow-card">
        {/* Header band */}
        <div className="flex items-center justify-between gap-3 border-b border-border bg-gradient-to-r from-[#4361EE]/[0.06] to-transparent px-6 py-3 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#4361EE]/10 text-[#4361EE]"><ClipboardCheck className="h-4 w-4" /></span>
            <div>
              <h2 className="font-display text-base font-bold leading-tight">Review {form.details.documentType === "proforma" ? "Proforma" : "Invoice"}</h2>
              <p className="text-[11px] text-muted-foreground">Confirm the details before {isEdit ? "saving" : "creating"}.</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[#4361EE]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]">{statusLabel}</span>
        </div>

        {/* Two-column body — sections are paired row-by-row so the two boxes
            on each row share the same height. Short boxes distribute their
            content to fill the matched height. */}
        <div className="grid grid-cols-1 items-stretch gap-x-6 gap-y-5 p-6 sm:p-8 lg:grid-cols-2">
          {/* Row 1 — Customer / Line Items (or Devices) */}
          <section className="flex flex-col">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</p>
            <div className="flex flex-1 flex-col justify-center rounded-xl border border-border bg-muted/20 p-4">
              <p className="text-sm font-semibold leading-tight">{form.customer.name || "Walk-in Customer"}</p>
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {form.customer.phone && <p>{form.customer.phone}</p>}
                {form.customer.email && <p>{form.customer.email}</p>}
                {form.customer.company && <p>{form.customer.company}</p>}
                {!form.customer.phone && !form.customer.email && !form.customer.company && <p className="italic">No contact details</p>}
              </div>
            </div>
          </section>

          {hasDevices ? (
            <section className="flex flex-col">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Devices ({form.devices.length})</p>
              <div className="flex flex-1 flex-col gap-3">
                {form.devices.map((dev, idx) => {
                  const devLabel = [dev.brand, dev.model].filter(Boolean).join(" ") || `Device ${idx + 1}`;
                  const devTotal = dev.parts.reduce((s, p) => s + p.total, 0);
                  return (
                    <div key={dev.id} className="overflow-hidden rounded-xl border border-border">
                      <div className="flex items-center justify-between bg-muted/40 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="grid h-5 w-5 place-items-center rounded bg-[#4361EE] text-[9px] font-bold text-white">{idx + 1}</span>
                          <span className="text-sm font-semibold">{devLabel}</span>
                          {dev.imei && <span className="ml-2 font-mono text-[10px] text-muted-foreground"><span className="font-semibold">{identifierDisplayLabel(dev.imeiType, dev.imei)}:</span> {dev.imei}</span>}
                        </div>
                        <span className="text-sm font-bold tabular-nums">{formatINR(devTotal)}</span>
                      </div>
                      {dev.issue && (
                        <div className="border-b border-border bg-muted/20 px-4 py-1.5 text-[11px] text-muted-foreground">
                          <span className="font-medium">Issue:</span> {dev.issue} {dev.technician && <> · <span className="font-medium">Tech:</span> {dev.technician}</>}
                        </div>
                      )}
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <th className="px-4 py-1.5 text-left">Item</th>
                            <th className="w-14 py-1.5 text-center">Qty</th>
                            <th className="w-20 py-1.5 text-right">Price</th>
                            <th className="w-20 py-1.5 pr-4 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dev.parts.map((item) => (
                            <tr key={item.id} className="border-t border-border">
                              <td className="px-4 py-1.5 font-medium">{item.name || "Unnamed"}</td>
                              <td className="py-1.5 text-center tabular-nums">{item.qty}</td>
                              <td className="py-1.5 text-right tabular-nums">{formatINR(item.price)}</td>
                              <td className="py-1.5 pr-4 text-right font-medium tabular-nums">{formatINR(item.total)}</td>
                            </tr>
                          ))}
                          {dev.parts.length === 0 && <tr><td colSpan={4} className="px-4 py-3 text-center text-xs text-muted-foreground">No parts</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <section className="flex flex-col">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Line Items ({form.items.length})</p>
              <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2 text-left">Item</th>
                      <th className="w-14 py-2 text-center">Qty</th>
                      <th className="w-20 py-2 text-right">Price</th>
                      <th className="w-20 py-2 pr-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((item) => (
                      <tr key={item.id} className="border-t border-border">
                        <td className="px-4 py-2 font-medium">{item.name || "Unnamed item"}</td>
                        <td className="py-2 text-center tabular-nums">{item.qty}</td>
                        <td className="py-2 text-right tabular-nums">{formatINR(item.price)}</td>
                        <td className="py-2 pr-4 text-right font-medium tabular-nums">{formatINR(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {form.items.length === 0 && (
                  <div className="flex flex-1 items-center justify-center py-6 text-sm text-muted-foreground">No items</div>
                )}
              </div>
            </section>
          )}

          {/* Row 2 — Details / Summary. Rows stay grouped at the top; the blue
              Total bar sits directly under the line items at a natural size. */}
          <section className="flex flex-col">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Details</p>
            <div className="flex flex-1 flex-col rounded-xl border border-border bg-muted/20 p-4 text-[13px]">
              <div className="flex items-center justify-between gap-3 py-1.5"><span className="text-muted-foreground">Linked Ticket</span><span className="font-medium">{form.details.ticketNo || form.details.ticketId || "—"}</span></div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between gap-3 py-1.5"><span className="text-muted-foreground">Due Date</span><span className="font-medium">{form.details.dueDate || "7 days from now"}</span></div>
              <div className="h-px bg-border/50" />
              <div className="flex items-center justify-between gap-3 py-1.5"><span className="text-muted-foreground">Status</span><span className="rounded-md bg-[#4361EE]/10 px-2 py-0.5 text-xs font-semibold text-[#4361EE]">{statusLabel}</span></div>
            </div>
          </section>

          <section className="flex flex-col">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Summary</p>
            <div className="flex flex-1 flex-col rounded-xl border border-border bg-muted/20 p-4 text-[13px]">
              {totals.estimateTotal > 0 && <><div className="flex items-center justify-between py-1.5"><span className="text-muted-foreground">Estimate Value <span className="text-[11px]">(reference)</span></span><span className="tabular-nums text-muted-foreground">{formatINR(totals.estimateTotal)}</span></div><div className="h-px bg-border/50" /></>}
              {totals.repairCost > 0 && <><div className="flex items-center justify-between py-1.5"><span className="text-muted-foreground">Parts &amp; Services</span><span className="tabular-nums">{formatINR(totals.partsTotal)}</span></div><div className="h-px bg-border/50" /><div className="flex items-center justify-between py-1.5"><span className="text-muted-foreground">Repair Cost</span><span className="tabular-nums">{formatINR(totals.repairCost)}</span></div><div className="h-px bg-border/50" /></>}
              <div className="flex items-center justify-between py-1.5"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatINR(totals.subtotal)}</span></div>
              {totals.discount > 0 && <><div className="h-px bg-border/50" /><div className="flex items-center justify-between py-1.5"><span className="text-muted-foreground">Discount</span><span className="tabular-nums text-emerald-600">-{formatINR(totals.discount)}</span></div></>}
              {totals.sgst > 0 && <><div className="h-px bg-border/50" /><div className="flex items-center justify-between py-1.5"><span className="text-muted-foreground">SGST ({totals.sgstRate}%)</span><span className="tabular-nums">{formatINR(totals.sgst)}</span></div></>}
              {totals.cgst > 0 && <><div className="h-px bg-border/50" /><div className="flex items-center justify-between py-1.5"><span className="text-muted-foreground">CGST ({totals.cgstRate}%)</span><span className="tabular-nums">{formatINR(totals.cgst)}</span></div></>}
              <div className="mt-3 flex items-center justify-between rounded-lg bg-[#4361EE]/10 px-3.5 py-2.5">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className="font-display text-base font-bold tabular-nums text-[#4361EE]">{formatINR(totals.total)}</span>
              </div>
            </div>
          </section>

          {/* Notes / payment — spans full width below the paired rows */}
          {(form.pricing.paymentMode || form.notes.notes) && (
            <section className="flex flex-col lg:col-span-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
              <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
                {form.pricing.paymentMode && (
                  <div className={form.notes.notes ? "mb-2 border-b border-border/60 pb-2" : undefined}>
                    <p className="text-xs text-muted-foreground">Payment Mode</p>
                    <p className="font-medium capitalize">{form.pricing.paymentMode}</p>
                  </div>
                )}
                {form.notes.notes && (
                  <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{form.notes.notes}</p>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}


