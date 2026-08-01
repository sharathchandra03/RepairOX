"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Check, AlertTriangle, ChevronRight, Plus, Trash2,
  Search, Upload, Calendar, IndianRupee, Package, FileText,
  Megaphone, ClipboardList, Eye, Briefcase,
} from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input, Textarea, Label, NumericInput } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface DealProduct {
  id: string;
  name: string;
  type: "product" | "service";
  quantity: number;
  unitPrice: number;
  tax: number;
  discount: number;
}

export interface DealFormData {
  // Basic
  dealName: string;
  owner: string;
  closingDate: string;
  pipeline: string;
  pipelineStage: string;
  contact: string;
  company: string;
  priority: string;
  source: string;
  // Products
  products: DealProduct[];
  // Payment
  estimatedValue: number;
  expectedRevenue: number;
  advanceReceived: number;
  paymentStatus: string;
  expectedPaymentDate: string;
  // Campaign
  campaignName: string;
  leadSource: string;
  referralSource: string;
  marketingChannel: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  // Other
  internalNotes: string;
  attachments: File[];
  probability: number;
  tags: string[];
}

const INITIAL_FORM: DealFormData = {
  dealName: "",
  owner: "",
  closingDate: "",
  pipeline: "",
  pipelineStage: "",
  contact: "",
  company: "",
  priority: "medium",
  source: "",
  products: [],
  estimatedValue: 0,
  expectedRevenue: 0,
  advanceReceived: 0,
  paymentStatus: "pending",
  expectedPaymentDate: "",
  campaignName: "",
  leadSource: "",
  referralSource: "",
  marketingChannel: "",
  utmSource: "",
  utmMedium: "",
  utmCampaign: "",
  internalNotes: "",
  attachments: [],
  probability: 50,
  tags: [],
};

/* ─── Section Nav Config ────────────────────────────────────────────── */

interface NavSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: NavSection[] = [
  { id: "basic", label: "Basic Information", icon: Briefcase },
  { id: "products", label: "Products & Services", icon: Package },
  { id: "payment", label: "Payment Information", icon: IndianRupee },
  { id: "campaign", label: "Campaign Information", icon: Megaphone },
  { id: "other", label: "Other Details", icon: FileText },
  { id: "review", label: "Review", icon: Eye },
];

/* ─── Select Options ────────────────────────────────────────────────── */

const PIPELINE_OPTIONS = [
  { label: "Sales Pipeline", value: "sales" },
  { label: "Service Pipeline", value: "service" },
  { label: "Enterprise Pipeline", value: "enterprise" },
];

const STAGE_OPTIONS: Record<string, { label: string; value: string }[]> = {
  sales: [
    { label: "Discovery", value: "discovery" },
    { label: "Proposal", value: "proposal" },
    { label: "Negotiation", value: "negotiation" },
    { label: "Closing", value: "closing" },
  ],
  service: [
    { label: "Initial Contact", value: "initial" },
    { label: "Assessment", value: "assessment" },
    { label: "Quote Sent", value: "quote" },
    { label: "Confirmation", value: "confirmation" },
  ],
  enterprise: [
    { label: "Lead Qualification", value: "qualification" },
    { label: "Needs Analysis", value: "needs" },
    { label: "Proposal", value: "proposal" },
    { label: "Contract Review", value: "contract" },
    { label: "Closed Won", value: "won" },
  ],
};

const PRIORITY_OPTIONS = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Critical", value: "critical" },
];

const SOURCE_OPTIONS = [
  { label: "Website", value: "website" },
  { label: "Referral", value: "referral" },
  { label: "Walk-In", value: "walkin" },
  { label: "Google Ads", value: "google" },
  { label: "Social Media", value: "social" },
  { label: "Cold Call", value: "cold_call" },
  { label: "Partner", value: "partner" },
];

const OWNER_OPTIONS = [
  { label: "Kalai S.", value: "kalai" },
  { label: "Manoj S.", value: "manoj" },
  { label: "Ritesh Kumar", value: "ritesh" },
  { label: "Pranav Admin", value: "pranav" },
];

const CONTACT_OPTIONS = [
  { label: "Aarav Mehta", value: "aarav" },
  { label: "Falguni Patel", value: "falguni" },
  { label: "Diya Sen", value: "diya" },
  { label: "Heena Kapoor", value: "heena" },
  { label: "Eshan Roy", value: "eshan" },
  { label: "Bina Soni", value: "bina" },
];

const COMPANY_OPTIONS = [
  { label: "TechNova", value: "technova" },
  { label: "NexaCore Labs", value: "nexacore" },
  { label: "GreenLeaf Org", value: "greenleaf" },
  { label: "PixelCraft", value: "pixelcraft" },
  { label: "CloudSync", value: "cloudsync" },
  { label: "DesignHub", value: "designhub" },
  { label: "SwiftServe", value: "swiftserve" },
];

const PAYMENT_STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Partial", value: "partial" },
  { label: "Received", value: "received" },
  { label: "Overdue", value: "overdue" },
];

const CHANNEL_OPTIONS = [
  { label: "Google Ads", value: "google_ads" },
  { label: "Facebook", value: "facebook" },
  { label: "Instagram", value: "instagram" },
  { label: "LinkedIn", value: "linkedin" },
  { label: "Email", value: "email" },
  { label: "Organic", value: "organic" },
  { label: "Offline", value: "offline" },
];

/* ─── Inventory items for product search ────────────────────────────── */

const INVENTORY_ITEMS = [
  { id: "INV-001", name: "iPhone Screen Replacement", type: "service" as const, price: 4500 },
  { id: "INV-002", name: "Battery Replacement", type: "service" as const, price: 1800 },
  { id: "INV-003", name: "Logic Board Repair", type: "service" as const, price: 8500 },
  { id: "INV-004", name: "Data Recovery", type: "service" as const, price: 3500 },
  { id: "INV-005", name: "Screen Protector (Premium)", type: "product" as const, price: 450 },
  { id: "INV-006", name: "Back Cover - iPhone 14", type: "product" as const, price: 2200 },
  { id: "INV-007", name: "Charging Port Module", type: "product" as const, price: 1200 },
  { id: "INV-008", name: "Annual Maintenance Contract", type: "service" as const, price: 12000 },
  { id: "INV-009", name: "Device Diagnostic Check", type: "service" as const, price: 500 },
  { id: "INV-010", name: "Wireless Charger Pad", type: "product" as const, price: 1800 },
];

/* ─── Helper: generate unique ID ────────────────────────────────────── */

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export function AddDealModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave?: (data: DealFormData) => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [form, setForm] = React.useState<DealFormData>(INITIAL_FORM);
  const [activeSection, setActiveSection] = React.useState("basic");
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const sectionRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  React.useEffect(() => { setMounted(true); }, []);

  // Lock body scroll when open
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Scroll spy
  React.useEffect(() => {
    if (!open) return;
    const container = scrollRef.current;
    if (!container) return;

    const handler = () => {
      const offsets = SECTIONS.map((s) => {
        const el = sectionRefs.current[s.id];
        if (!el) return { id: s.id, top: Infinity };
        return { id: s.id, top: el.getBoundingClientRect().top };
      });
      const visible = offsets.filter((o) => o.top <= 280);
      if (visible.length > 0) {
        setActiveSection(visible[visible.length - 1].id);
      }
    };
    container.addEventListener("scroll", handler, { passive: true });
    return () => container.removeEventListener("scroll", handler);
  }, [open]);

  // Form helpers
  const set = React.useCallback(<K extends keyof DealFormData>(key: K, value: DealFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
  }, []);

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id];
    if (el && scrollRef.current) {
      const top = el.offsetTop - scrollRef.current.offsetTop - 24;
      scrollRef.current.scrollTo({ top, behavior: "smooth" });
    }
  };

  // Product calculations
  const productTotal = React.useMemo(() => {
    return form.products.reduce((sum, p) => {
      const subtotal = p.quantity * p.unitPrice;
      const taxAmt = subtotal * (p.tax / 100);
      const discAmt = subtotal * (p.discount / 100);
      return sum + subtotal + taxAmt - discAmt;
    }, 0);
  }, [form.products]);

  const balance = React.useMemo(() => {
    return form.estimatedValue - form.advanceReceived;
  }, [form.estimatedValue, form.advanceReceived]);

  // Validation
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.dealName.trim()) errs.dealName = "Deal name is required";
    if (!form.owner) errs.owner = "Owner is required";
    if (!form.pipeline) errs.pipeline = "Pipeline is required";
    if (!form.contact) errs.contact = "Contact is required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      scrollToSection("basic");
      return false;
    }
    return true;
  };

  // Save handler
  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const payload = {
          deal_name: form.dealName,
          owner: form.owner,
          expected_closing_date: form.closingDate || null,
          pipeline: form.pipeline,
          pipeline_stage: form.pipelineStage,
          contact: form.contact,
          company: form.company || null,
          priority: form.priority,
          source: form.source || null,
          products: form.products,
          estimated_value: form.estimatedValue || productTotal,
          expected_revenue: form.expectedRevenue,
          advance_received: form.advanceReceived,
          payment_status: form.paymentStatus,
          expected_payment_date: form.expectedPaymentDate || null,
          campaign_name: form.campaignName || null,
          lead_source: form.leadSource || null,
          referral_source: form.referralSource || null,
          marketing_channel: form.marketingChannel || null,
          utm_source: form.utmSource || null,
          utm_medium: form.utmMedium || null,
          utm_campaign: form.utmCampaign || null,
          internal_notes: form.internalNotes || null,
          probability: form.probability,
          tags: form.tags,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await supabase.from("deals").insert(payload);
      }
      onSave?.(form);
      onClose();
      setForm(INITIAL_FORM);
    } catch (err) {
      console.error("Failed to create deal:", err);
    } finally {
      setSaving(false);
    }
  };

  // Section completeness
  const sectionStatus = React.useMemo(() => {
    const s: Record<string, "complete" | "incomplete" | "warning"> = {};
    s.basic = form.dealName && form.owner && form.pipeline && form.contact ? "complete" : form.dealName || form.owner ? "warning" : "incomplete";
    s.products = form.products.length > 0 ? "complete" : "incomplete";
    s.payment = form.estimatedValue > 0 ? "complete" : "incomplete";
    s.campaign = form.campaignName || form.leadSource ? "complete" : "incomplete";
    s.other = form.internalNotes ? "complete" : "incomplete";
    s.review = "incomplete";
    return s;
  }, [form]);

  if (!mounted) return null;

  const content = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[9998] bg-foreground/50 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          >
            <div className="relative flex h-[90vh] w-[95vw] max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_32px_80px_-20px_rgba(20,30,80,0.25)]">
              {/* ─── Header ─── */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-gradient-to-r from-card to-[#EEF1FD]/30">
                <div>
                  <h2 className="font-display text-xl font-bold tracking-tight">Add Deal</h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Create and manage a sales opportunity linked to a lead.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* ─── Body ─── */}
              <div className="flex flex-1 overflow-hidden">
                {/* Left Navigation */}
                <nav className="hidden w-[220px] shrink-0 flex-col gap-1 border-r border-border bg-[#FAFBFF] p-4 lg:flex">
                  <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                    Sections
                  </p>
                  {SECTIONS.map((sec) => {
                    const Icon = sec.icon;
                    const isActive = activeSection === sec.id;
                    const status = sectionStatus[sec.id];
                    return (
                      <button
                        key={sec.id}
                        onClick={() => scrollToSection(sec.id)}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-all duration-150",
                          isActive
                            ? "bg-[#EEF1FD] text-[#4361EE] shadow-sm"
                            : "text-zinc-600 hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <span className={cn(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-lg transition",
                          isActive ? "bg-[#4361EE] text-white" : "bg-muted text-zinc-400 group-hover:text-zinc-600"
                        )}>
                          {status === "complete" ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : status === "warning" ? (
                            <AlertTriangle className="h-3 w-3" />
                          ) : (
                            <Icon className="h-3.5 w-3.5" />
                          )}
                        </span>
                        <span className="truncate">{sec.label}</span>
                      </button>
                    );
                  })}
                </nav>

                {/* Main Content Area */}
                <div className="flex flex-1 overflow-hidden">
                  {/* Scrollable Form */}
                  <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 lg:px-8">
                    <div className="mx-auto max-w-3xl space-y-8">
                      {/* Section 1: Basic Information */}
                      <div ref={(el) => { sectionRefs.current.basic = el; }}>
                        <SectionBasic form={form} set={set} errors={errors} />
                      </div>

                      {/* Section 2: Products & Services */}
                      <div ref={(el) => { sectionRefs.current.products = el; }}>
                        <SectionProducts form={form} set={set} productTotal={productTotal} />
                      </div>

                      {/* Section 3: Payment Information */}
                      <div ref={(el) => { sectionRefs.current.payment = el; }}>
                        <SectionPayment form={form} set={set} productTotal={productTotal} balance={balance} />
                      </div>

                      {/* Section 4: Campaign Information */}
                      <div ref={(el) => { sectionRefs.current.campaign = el; }}>
                        <SectionCampaign form={form} set={set} />
                      </div>

                      {/* Section 5: Other Details */}
                      <div ref={(el) => { sectionRefs.current.other = el; }}>
                        <SectionOther form={form} set={set} />
                      </div>

                      {/* Section 6: Review */}
                      <div ref={(el) => { sectionRefs.current.review = el; }}>
                        <SectionReview form={form} productTotal={productTotal} />
                      </div>

                      {/* Bottom padding for scroll */}
                      <div className="h-8" />
                    </div>
                  </div>

                  {/* Right Summary Card */}
                  <aside className="hidden w-[280px] shrink-0 border-l border-border bg-[#FAFBFF] p-5 xl:block overflow-y-auto">
                    <DealSummaryCard form={form} productTotal={productTotal} balance={balance} />
                  </aside>
                </div>
              </div>

              {/* ─── Sticky Footer ─── */}
              <div className="flex items-center justify-between border-t border-border bg-card px-6 py-3.5">
                <p className="text-[12px] text-muted-foreground">
                  {form.products.length > 0 && (
                    <span className="font-medium text-foreground">{formatINR(productTotal)}</span>
                  )}
                  {form.products.length > 0 && " estimated value"}
                </p>
                <div className="flex items-center gap-2.5">
                  <Button variant="ghost" size="md" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button variant="outline" size="md" onClick={() => { /* save draft logic */ }}>
                    Save Draft
                  </Button>
                  <Button size="md" loading={saving} onClick={handleCreate}>
                    Create Deal
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}

/* ═══════════════════════════════════════════════════════════════════════
   SECTION COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

/* ─── Section 1: Basic Information ──────────────────────────────────── */

function SectionBasic({
  form,
  set,
  errors,
}: {
  form: DealFormData;
  set: <K extends keyof DealFormData>(key: K, value: DealFormData[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
            <Briefcase className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Core details about this deal opportunity.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Deal Name - full width */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Deal Name <span className="text-rose-500">*</span></Label>
            <Input
              value={form.dealName}
              onChange={(e) => set("dealName", e.target.value)}
              placeholder="e.g. iPhone Fleet Repair Contract"
              className={cn("h-11", errors.dealName && "border-rose-400 focus:ring-rose-200")}
            />
            {errors.dealName && <p className="text-[11px] text-rose-500">{errors.dealName}</p>}
          </div>

          {/* Owner */}
          <div className="space-y-1.5">
            <Label>Owner <span className="text-rose-500">*</span></Label>
            <RSelect
              value={form.owner}
              onChange={(v) => set("owner", v)}
              options={OWNER_OPTIONS}
              placeholder="Select owner"
              searchable
              className={cn(errors.owner && "border-rose-400")}
            />
            {errors.owner && <p className="text-[11px] text-rose-500">{errors.owner}</p>}
          </div>

          {/* Expected Closing Date */}
          <div className="space-y-1.5">
            <Label>Expected Closing Date</Label>
            <Input
              type="date"
              value={form.closingDate}
              onChange={(e) => set("closingDate", e.target.value)}
              className="h-11"
            />
          </div>

          {/* Pipeline */}
          <div className="space-y-1.5">
            <Label>Pipeline <span className="text-rose-500">*</span></Label>
            <RSelect
              value={form.pipeline}
              onChange={(v) => { set("pipeline", v); set("pipelineStage", ""); }}
              options={PIPELINE_OPTIONS}
              placeholder="Select pipeline"
              className={cn(errors.pipeline && "border-rose-400")}
            />
            {errors.pipeline && <p className="text-[11px] text-rose-500">{errors.pipeline}</p>}
          </div>

          {/* Pipeline Stage */}
          <div className="space-y-1.5">
            <Label>Pipeline Stage</Label>
            <RSelect
              value={form.pipelineStage}
              onChange={(v) => set("pipelineStage", v)}
              options={form.pipeline ? (STAGE_OPTIONS[form.pipeline] || []) : []}
              placeholder={form.pipeline ? "Select stage" : "Select a pipeline first"}
            />
          </div>

          {/* Contact */}
          <div className="space-y-1.5">
            <Label>Contact <span className="text-rose-500">*</span></Label>
            <RSelect
              value={form.contact}
              onChange={(v) => set("contact", v)}
              options={CONTACT_OPTIONS}
              placeholder="Search contacts…"
              searchable
              className={cn(errors.contact && "border-rose-400")}
            />
            {errors.contact && <p className="text-[11px] text-rose-500">{errors.contact}</p>}
          </div>

          {/* Company */}
          <div className="space-y-1.5">
            <Label>Company</Label>
            <RSelect
              value={form.company}
              onChange={(v) => set("company", v)}
              options={COMPANY_OPTIONS}
              placeholder="Search companies…"
              searchable
            />
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <Label>Deal Priority</Label>
            <RSelect
              value={form.priority}
              onChange={(v) => set("priority", v)}
              options={PRIORITY_OPTIONS}
              placeholder="Select priority"
            />
          </div>

          {/* Source */}
          <div className="space-y-1.5">
            <Label>Deal Source</Label>
            <RSelect
              value={form.source}
              onChange={(v) => set("source", v)}
              options={SOURCE_OPTIONS}
              placeholder="Select source"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Section 2: Products & Services ────────────────────────────────── */

function SectionProducts({
  form,
  set,
  productTotal,
}: {
  form: DealFormData;
  set: <K extends keyof DealFormData>(key: K, value: DealFormData[K]) => void;
  productTotal: number;
}) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showSearch, setShowSearch] = React.useState(false);

  const filteredItems = React.useMemo(() => {
    if (!searchQuery.trim()) return INVENTORY_ITEMS;
    return INVENTORY_ITEMS.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  const addProduct = (item: typeof INVENTORY_ITEMS[0]) => {
    const existing = form.products.find((p) => p.id === item.id);
    if (existing) {
      set("products", form.products.map((p) =>
        p.id === item.id ? { ...p, quantity: p.quantity + 1 } : p
      ));
    } else {
      set("products", [...form.products, {
        id: item.id,
        name: item.name,
        type: item.type,
        quantity: 1,
        unitPrice: item.price,
        tax: 18,
        discount: 0,
      }]);
    }
    setShowSearch(false);
    setSearchQuery("");
  };

  const removeProduct = (id: string) => {
    set("products", form.products.filter((p) => p.id !== id));
  };

  const updateProduct = (id: string, updates: Partial<DealProduct>) => {
    set("products", form.products.map((p) => p.id === id ? { ...p, ...updates } : p));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
              <Package className="h-4.5 w-4.5" />
            </span>
            <div>
              <CardTitle>Products & Services</CardTitle>
              <CardDescription>Add items from inventory or create new line items.</CardDescription>
            </div>
          </div>
          <Button variant="soft" size="sm" onClick={() => setShowSearch(!showSearch)}>
            <Plus className="h-3.5 w-3.5" /> Add Item
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search Inventory */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mb-5 overflow-hidden"
            >
              <div className="rounded-xl border border-border bg-[#FAFBFF] p-4">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search inventory items…"
                  iconLeft={<Search className="h-3.5 w-3.5" />}
                  className="h-10 mb-3"
                  autoFocus
                />
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addProduct(item)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition hover:bg-[#EEF1FD]/60"
                    >
                      <div>
                        <p className="text-[13px] font-medium text-foreground">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground capitalize">{item.type}</p>
                      </div>
                      <span className="text-[13px] font-semibold tnum text-zinc-700">{formatINR(item.price)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Products Table */}
        {form.products.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-[#EEF1FD]/60">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/70">
                  <th className="px-4 py-2.5">Item</th>
                  <th className="py-2.5 text-center w-20">Qty</th>
                  <th className="py-2.5 w-28">Unit Price</th>
                  <th className="py-2.5 w-20 text-center">Tax %</th>
                  <th className="py-2.5 w-20 text-center">Disc %</th>
                  <th className="py-2.5 w-28 text-right">Total</th>
                  <th className="py-2.5 w-10 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {form.products.map((p) => {
                  const subtotal = p.quantity * p.unitPrice;
                  const taxAmt = subtotal * (p.tax / 100);
                  const discAmt = subtotal * (p.discount / 100);
                  const lineTotal = subtotal + taxAmt - discAmt;
                  return (
                    <tr key={p.id} className="border-t border-border transition hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium text-zinc-800 text-[13px]">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground capitalize">{p.type}</p>
                      </td>
                      <td className="py-3">
                        <NumericInput
                          value={p.quantity}
                          onChange={(n) => updateProduct(p.id, { quantity: Math.max(1, n) })}
                          min={1}
                          className="h-8 w-16 mx-auto text-center text-[12px] rounded-lg"
                        />
                      </td>
                      <td className="py-3">
                        <NumericInput
                          value={p.unitPrice}
                          onChange={(n) => updateProduct(p.id, { unitPrice: n })}
                          min={0}
                          className="h-8 w-24 text-[12px] rounded-lg"
                        />
                      </td>
                      <td className="py-3">
                        <NumericInput
                          value={p.tax}
                          onChange={(n) => updateProduct(p.id, { tax: Math.min(100, n) })}
                          min={0}
                          className="h-8 w-14 mx-auto text-center text-[12px] rounded-lg"
                        />
                      </td>
                      <td className="py-3">
                        <NumericInput
                          value={p.discount}
                          onChange={(n) => updateProduct(p.id, { discount: Math.min(100, n) })}
                          min={0}
                          className="h-8 w-14 mx-auto text-center text-[12px] rounded-lg"
                        />
                      </td>
                      <td className="py-3 text-right pr-2">
                        <span className="font-semibold tnum text-[13px]">{formatINR(lineTotal)}</span>
                      </td>
                      <td className="py-3 pr-3">
                        <button
                          type="button"
                          onClick={() => removeProduct(p.id)}
                          className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 transition hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals row */}
            <div className="flex items-center justify-between border-t border-border bg-[#FAFBFF] px-4 py-3">
              <p className="text-[12px] text-muted-foreground">
                {form.products.length} item{form.products.length !== 1 ? "s" : ""}
              </p>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground">Grand Total</p>
                <p className="font-display text-lg font-bold tnum text-[#4361EE]">{formatINR(productTotal)}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-12 text-center">
            <Package className="h-10 w-10 text-zinc-200" />
            <p className="mt-3 text-sm font-medium text-zinc-500">No items added yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Click "Add Item" to search inventory</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Section 3: Payment Information ────────────────────────────────── */

function SectionPayment({
  form,
  set,
  productTotal,
  balance,
}: {
  form: DealFormData;
  set: <K extends keyof DealFormData>(key: K, value: DealFormData[K]) => void;
  productTotal: number;
  balance: number;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
            <IndianRupee className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle>Payment Information</CardTitle>
            <CardDescription>Financial details and payment tracking for this deal.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {/* Estimated Value */}
          <div className="space-y-1.5">
            <Label>Estimated Value</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] font-medium text-muted-foreground">₹</span>
              <NumericInput
                value={form.estimatedValue || productTotal}
                onChange={(n) => set("estimatedValue", n)}
                min={0}
                className="h-11 pl-8"
              />
            </div>
            {productTotal > 0 && form.estimatedValue === 0 && (
              <p className="text-[11px] text-muted-foreground">Auto-calculated from products: {formatINR(productTotal)}</p>
            )}
          </div>

          {/* Expected Revenue */}
          <div className="space-y-1.5">
            <Label>Expected Revenue</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] font-medium text-muted-foreground">₹</span>
              <NumericInput
                value={form.expectedRevenue}
                onChange={(n) => set("expectedRevenue", n)}
                min={0}
                className="h-11 pl-8"
              />
            </div>
          </div>

          {/* Advance Received */}
          <div className="space-y-1.5">
            <Label>Advance Received</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] font-medium text-muted-foreground">₹</span>
              <NumericInput
                value={form.advanceReceived}
                onChange={(n) => set("advanceReceived", n)}
                min={0}
                className="h-11 pl-8"
              />
            </div>
          </div>

          {/* Balance (read-only) */}
          <div className="space-y-1.5">
            <Label>Balance</Label>
            <div className="flex h-11 items-center rounded-xl border border-border bg-muted/50 px-3.5 text-sm font-semibold tnum">
              {formatINR(balance > 0 ? balance : (form.estimatedValue || productTotal) - form.advanceReceived)}
            </div>
          </div>

          {/* Payment Status */}
          <div className="space-y-1.5">
            <Label>Payment Status</Label>
            <RSelect
              value={form.paymentStatus}
              onChange={(v) => set("paymentStatus", v)}
              options={PAYMENT_STATUS_OPTIONS}
              placeholder="Select status"
            />
          </div>

          {/* Expected Payment Date */}
          <div className="space-y-1.5">
            <Label>Expected Payment Date</Label>
            <Input
              type="date"
              value={form.expectedPaymentDate}
              onChange={(e) => set("expectedPaymentDate", e.target.value)}
              className="h-11"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Section 4: Campaign Information ───────────────────────────────── */

function SectionCampaign({
  form,
  set,
}: {
  form: DealFormData;
  set: <K extends keyof DealFormData>(key: K, value: DealFormData[K]) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
            <Megaphone className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle>Campaign Information</CardTitle>
            <CardDescription>Marketing attribution and campaign tracking data.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Campaign Name</Label>
            <Input
              value={form.campaignName}
              onChange={(e) => set("campaignName", e.target.value)}
              placeholder="e.g. Q3 Service Promotion"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Lead Source</Label>
            <RSelect
              value={form.leadSource}
              onChange={(v) => set("leadSource", v)}
              options={SOURCE_OPTIONS}
              placeholder="Select lead source"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Referral Source</Label>
            <Input
              value={form.referralSource}
              onChange={(e) => set("referralSource", e.target.value)}
              placeholder="e.g. John from TechNova"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Marketing Channel</Label>
            <RSelect
              value={form.marketingChannel}
              onChange={(v) => set("marketingChannel", v)}
              options={CHANNEL_OPTIONS}
              placeholder="Select channel"
            />
          </div>

          <div className="space-y-1.5">
            <Label>UTM Source</Label>
            <Input
              value={form.utmSource}
              onChange={(e) => set("utmSource", e.target.value)}
              placeholder="e.g. google"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label>UTM Medium</Label>
            <Input
              value={form.utmMedium}
              onChange={(e) => set("utmMedium", e.target.value)}
              placeholder="e.g. cpc"
              className="h-11"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>UTM Campaign</Label>
            <Input
              value={form.utmCampaign}
              onChange={(e) => set("utmCampaign", e.target.value)}
              placeholder="e.g. summer_repair_promo_2025"
              className="h-11"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Section 5: Other Details ──────────────────────────────────────── */

function SectionOther({
  form,
  set,
}: {
  form: DealFormData;
  set: <K extends keyof DealFormData>(key: K, value: DealFormData[K]) => void;
}) {
  const [tagInput, setTagInput] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag)) {
      set("tags", [...form.tags, tag]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    set("tags", form.tags.filter((t) => t !== tag));
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      set("attachments", [...form.attachments, ...Array.from(e.target.files)]);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
            <FileText className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle>Other Details</CardTitle>
            <CardDescription>Notes, attachments, and additional metadata.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {/* Internal Notes */}
          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <Textarea
              value={form.internalNotes}
              onChange={(e) => set("internalNotes", e.target.value)}
              placeholder="Add any internal notes about this deal…"
              rows={4}
            />
          </div>

          {/* Attachments */}
          <div className="space-y-1.5">
            <Label>Attachments</Label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFiles}
              className="hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xls,.xlsx"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-6 text-[13px] font-medium text-muted-foreground transition hover:border-[#4361EE]/40 hover:bg-[#EEF1FD]/30 hover:text-[#4361EE]"
            >
              <Upload className="h-4 w-4" />
              Click to upload files
            </button>
            {form.attachments.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {form.attachments.map((file, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                    <span className="text-[12px] font-medium truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => set("attachments", form.attachments.filter((_, idx) => idx !== i))}
                      className="text-zinc-400 hover:text-rose-500 transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Probability */}
          <div className="space-y-1.5">
            <Label>Probability (%)</Label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={0}
                max={100}
                value={form.probability}
                onChange={(e) => set("probability", Number(e.target.value))}
                className="flex-1 h-2 accent-[#4361EE] cursor-pointer"
              />
              <span className="min-w-[3rem] text-right text-sm font-semibold tnum text-[#4361EE]">
                {form.probability}%
              </span>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex items-center gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Type a tag and press Enter"
                className="h-10 flex-1"
              />
              <Button variant="outline" size="sm" onClick={addTag} className="shrink-0">
                Add
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-[#EEF1FD] px-2.5 py-1 text-[11px] font-medium text-[#4361EE]"
                  >
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-rose-500 transition">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Section 6: Review ─────────────────────────────────────────────── */

function SectionReview({
  form,
  productTotal,
}: {
  form: DealFormData;
  productTotal: number;
}) {
  const getLabel = (options: { label: string; value: string }[], value: string) =>
    options.find((o) => o.value === value)?.label || "—";

  const stageOptions = form.pipeline ? (STAGE_OPTIONS[form.pipeline] || []) : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <ClipboardList className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle>Review</CardTitle>
            <CardDescription>Verify all details before creating this deal.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Summary grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReviewItem label="Deal Name" value={form.dealName || "—"} />
            <ReviewItem label="Owner" value={getLabel(OWNER_OPTIONS, form.owner)} />
            <ReviewItem label="Contact" value={getLabel(CONTACT_OPTIONS, form.contact)} />
            <ReviewItem label="Company" value={getLabel(COMPANY_OPTIONS, form.company)} />
            <ReviewItem label="Pipeline" value={getLabel(PIPELINE_OPTIONS, form.pipeline)} />
            <ReviewItem label="Stage" value={getLabel(stageOptions, form.pipelineStage)} />
            <ReviewItem label="Priority" value={getLabel(PRIORITY_OPTIONS, form.priority)} />
            <ReviewItem label="Source" value={getLabel(SOURCE_OPTIONS, form.source)} />
            <ReviewItem label="Estimated Value" value={formatINR(form.estimatedValue || productTotal)} highlight />
            <ReviewItem label="Expected Close" value={form.closingDate || "—"} />
            <ReviewItem label="Products" value={`${form.products.length} item${form.products.length !== 1 ? "s" : ""}`} />
            <ReviewItem label="Probability" value={`${form.probability}%`} />
          </div>

          {/* Notes */}
          {form.internalNotes && (
            <div className="mt-4 rounded-xl bg-muted/50 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
              <p className="text-[13px] text-foreground whitespace-pre-wrap">{form.internalNotes}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className={cn("text-[13px] font-medium", highlight ? "text-[#4361EE] font-semibold" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

/* ─── Deal Summary Card (Right sidebar) ─────────────────────────────── */

function DealSummaryCard({
  form,
  productTotal,
  balance,
}: {
  form: DealFormData;
  productTotal: number;
  balance: number;
}) {
  const getLabel = (options: { label: string; value: string }[], value: string) =>
    options.find((o) => o.value === value)?.label || "—";

  const stageOptions = form.pipeline ? (STAGE_OPTIONS[form.pipeline] || []) : [];
  const dealValue = form.estimatedValue || productTotal;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Deal Summary
        </h3>
      </div>

      {/* Value highlight */}
      <div className="rounded-xl bg-gradient-to-br from-[#4361EE]/5 to-[#4361EE]/10 p-4 border border-[#B3BFF6]/30">
        <p className="text-[11px] font-medium text-[#4361EE]/70 uppercase tracking-wider">Deal Value</p>
        <p className="font-display text-2xl font-extrabold tnum text-[#4361EE] mt-1">
          {dealValue > 0 ? formatINR(dealValue) : "₹0"}
        </p>
      </div>

      {/* Key metrics */}
      <div className="space-y-3">
        <SummaryRow label="Expected Close" value={form.closingDate || "Not set"} />
        <SummaryRow label="Products" value={form.products.length > 0 ? `${form.products.length} items` : "None"} />
        <SummaryRow label="Contact" value={getLabel(CONTACT_OPTIONS, form.contact)} />
        <SummaryRow label="Company" value={getLabel(COMPANY_OPTIONS, form.company)} />
        <SummaryRow label="Pipeline" value={getLabel(PIPELINE_OPTIONS, form.pipeline)} />
        <SummaryRow label="Stage" value={getLabel(stageOptions, form.pipelineStage)} />
        <SummaryRow label="Probability" value={`${form.probability}%`} />
      </div>

      {/* Probability visual */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-muted-foreground">Win Probability</span>
          <span className="text-[12px] font-bold tnum text-foreground">{form.probability}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className={cn(
              "h-full rounded-full transition-all",
              form.probability >= 70 ? "bg-emerald-500" :
              form.probability >= 40 ? "bg-amber-500" : "bg-zinc-300"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${form.probability}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Tags */}
      {form.tags.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-2">Tags</p>
          <div className="flex flex-wrap gap-1">
            {form.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-medium text-[#4361EE]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[12px] font-medium text-foreground truncate max-w-[140px] text-right">{value}</span>
    </div>
  );
}
