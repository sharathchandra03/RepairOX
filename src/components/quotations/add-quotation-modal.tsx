"use client";

/* ────────────────────────────────────────────────────────────────────────
   RepairOX — Add Quotation workspace modal.

   A large workspace modal (mirrors the Add Deal modal framework) that lets a
   user build a full proposal: general info with smart-linking (Lead → Company
   / Contact / Deal auto-fill), inventory-backed products & services, live
   pricing with GST split (CGST/SGST/IGST) and round-off, billing, terms,
   internal notes and a review step. On save it persists to Supabase (best
   effort, resilient) and can be converted into an Invoice in one click reusing
   the existing invoice store — no re-typing.
   ──────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  X, Check, AlertTriangle, Plus, Trash2, Search, Package, Wrench, PenLine,
  FileText, IndianRupee, MapPin, ScrollText, StickyNote, ClipboardCheck, Info,
  CheckCircle2, Eye, Download, Mail, MessageCircle, ArrowLeft, RefreshCw, FileCheck2,
} from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input, Textarea, Label, NumericInput } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import { useStore } from "@/lib/store";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { InventoryItem } from "@/lib/inventory-data";
import type { Invoice } from "@/lib/mock-data";
import {
  createQuotationForm, createLineItem, computeLineTotal, computeTotals,
  quotationToInvoice, quotationToRow, generateQuotationNumber,
  QUOTATION_STATUS_OPTIONS, QUOTATION_UNITS, PAYMENT_TERMS_OPTIONS, PAYMENT_METHOD_OPTIONS,
  PRIORITY_OPTIONS, SOURCE_OPTIONS, OWNER_OPTIONS, BRANCH_OPTIONS,
  SAMPLE_COMPANIES, SAMPLE_CONTACTS, SAMPLE_DEALS, SAMPLE_LEADS,
  type QuotationFormData, type QuotationLineItem, type QuotationLineKind,
  type QuotationStatus, type QuotationAddress, type SampleParty,
} from "@/lib/quotation-data";

/* ─── Section nav config ─────────────────────────────────────────────── */

const SECTIONS = [
  { id: "general", label: "General Information", icon: FileText },
  { id: "products", label: "Products & Services", icon: Package },
  { id: "pricing", label: "Pricing Summary", icon: IndianRupee },
  { id: "billing", label: "Billing Information", icon: MapPin },
  { id: "terms", label: "Terms & Conditions", icon: ScrollText },
  { id: "notes", label: "Internal Notes", icon: StickyNote },
  { id: "review", label: "Review", icon: ClipboardCheck },
] as const;

/* ─── Public created-quotation shape (for the list page) ─────────────── */

export interface CreatedQuotation {
  id: string;
  title: string;
  contact: string;
  company: string;
  value: number;
  status: QuotationStatus;
  createdAt: string;
  validUntil: string;
  items: number;
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export function AddQuotationModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave?: (q: CreatedQuotation) => void;
}) {
  const router = useRouter();
  const { inventory, companies, customers, invoices, addInvoice } = useStore();

  const [mounted, setMounted] = React.useState(false);
  const [form, setForm] = React.useState<QuotationFormData>(() => createQuotationForm());
  const [activeSection, setActiveSection] = React.useState<string>("general");
  const [saving, setSaving] = React.useState(false);
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [deals, setDeals] = React.useState(SAMPLE_DEALS);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const sectionRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  React.useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while open
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Best-effort: pull real deals from Supabase and merge with samples
  React.useEffect(() => {
    if (!open || !isSupabaseConfigured || !supabase) return;
    let active = true;
    (async () => {
      const { data } = await supabase!.from("deals").select("id, deal_name, company, contact, products").limit(50);
      if (!active || !data) return;
      const mapped = data.map((d: any) => ({
        id: d.id,
        title: d.deal_name || d.id,
        companyId: undefined,
        contactId: undefined,
        items: Array.isArray(d.products) ? d.products : [],
      }));
      // Samples first (they carry demonstrable auto-fill links), then real deals
      const merged = [...SAMPLE_DEALS];
      for (const m of mapped) if (!merged.some((x) => x.id === m.id)) merged.push(m as any);
      setDeals(merged);
    })();
    return () => { active = false; };
  }, [open]);

  // Scroll spy
  React.useEffect(() => {
    if (!open || savedId) return;
    const container = scrollRef.current;
    if (!container) return;
    const handler = () => {
      const offsets = SECTIONS.map((s) => {
        const el = sectionRefs.current[s.id];
        return { id: s.id, top: el ? el.getBoundingClientRect().top : Infinity };
      });
      const visible = offsets.filter((o) => o.top <= 280);
      if (visible.length > 0) setActiveSection(visible[visible.length - 1].id);
    };
    container.addEventListener("scroll", handler, { passive: true });
    return () => container.removeEventListener("scroll", handler);
  }, [open, savedId]);

  const set = React.useCallback(<K extends keyof QuotationFormData>(key: K, value: QuotationFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[key as string]; return next; });
  }, []);

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id];
    if (el && scrollRef.current) {
      const top = el.offsetTop - scrollRef.current.offsetTop - 16;
      scrollRef.current.scrollTo({ top, behavior: "smooth" });
    }
  };

  /* ─── Merged linking data (live store first, then samples) ─────────── */

  const companyParties = React.useMemo<SampleParty[]>(() => {
    const live: SampleParty[] = companies.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phones?.find((p) => p.isPrimary)?.number || c.phones?.[0]?.number || "",
      email: c.emails?.find((e) => e.isPrimary)?.address || c.emails?.[0]?.address || "",
      gst: c.gstNumber,
      address: {
        line1: [c.address?.addressLine1, c.address?.area].filter(Boolean).join(", "),
        city: c.address?.city || "",
        state: c.address?.state || "",
        country: c.address?.country || "India",
        zipcode: c.address?.pinCode || "",
      },
    }));
    const merged = [...live];
    for (const s of SAMPLE_COMPANIES) if (!merged.some((x) => x.id === s.id)) merged.push(s);
    return merged;
  }, [companies]);

  const contactParties = React.useMemo<SampleParty[]>(() => {
    const live: SampleParty[] = customers.map((c) => ({
      id: c.id,
      name: c.fullName || `${c.firstName} ${c.lastName}`.trim(),
      phone: c.mobile,
      email: c.email,
      gst: c.gstNumber,
      address: {
        line1: c.address || "",
        city: c.city || "",
        state: c.state || "",
        country: "India",
        zipcode: c.postalCode || "",
      },
    }));
    const merged = [...live];
    for (const s of SAMPLE_CONTACTS) if (!merged.some((x) => x.id === s.id)) merged.push(s);
    return merged;
  }, [customers]);

  const companyOptions = React.useMemo(() => companyParties.map((c) => ({ label: c.name, value: c.id })), [companyParties]);
  const contactOptions = React.useMemo(() => contactParties.map((c) => ({ label: c.phone ? `${c.name} · ${c.phone}` : c.name, value: c.id })), [contactParties]);
  const dealOptions = React.useMemo(() => deals.map((d) => ({ label: d.title, value: d.id })), [deals]);
  const leadOptions = React.useMemo(() => SAMPLE_LEADS.map((l) => ({ label: l.name, value: l.id })), []);

  const findCompany = (id: string) => companyParties.find((c) => c.id === id);
  const findContact = (id: string) => contactParties.find((c) => c.id === id);

  /* ─── Smart linking ────────────────────────────────────────────────── */

  const applyContactFill = (contactId: string, next: QuotationFormData): QuotationFormData => {
    const contact = findContact(contactId);
    if (!contact) return next;
    const addr = contact.address;
    if (addr && !next.billing.line1) {
      const filled: QuotationAddress = {
        line1: addr.line1 || "",
        city: addr.city || "",
        state: addr.state || "",
        country: addr.country || "India",
        zipcode: addr.zipcode || "",
      };
      return { ...next, billing: filled, shippingAddr: next.sameAsBilling ? filled : next.shippingAddr };
    }
    return next;
  };

  const applyCompanyFill = (companyId: string, next: QuotationFormData): QuotationFormData => {
    const company = findCompany(companyId);
    if (!company) return next;
    const addr = company.address;
    if (addr && !next.billing.line1) {
      const filled: QuotationAddress = {
        line1: addr.line1 || "",
        city: addr.city || "",
        state: addr.state || "",
        country: addr.country || "India",
        zipcode: addr.zipcode || "",
      };
      return { ...next, billing: filled, shippingAddr: next.sameAsBilling ? filled : next.shippingAddr };
    }
    return next;
  };

  const handleSelectLead = (leadId: string) => {
    const lead = SAMPLE_LEADS.find((l) => l.id === leadId);
    setForm((prev) => {
      let next: QuotationFormData = { ...prev, leadId };
      if (lead) {
        if (lead.companyId) next.companyId = lead.companyId;
        if (lead.contactId) next.contactId = lead.contactId;
        if (lead.dealId) next.dealId = lead.dealId;
        if (lead.source) next.source = lead.source;
        if (lead.companyId) next = applyCompanyFill(lead.companyId, next);
        if (lead.contactId) next = applyContactFill(lead.contactId, next);
        // Deal → pull products
        if (lead.dealId) next = applyDealFill(lead.dealId, next);
      }
      return next;
    });
  };

  const applyDealFill = (dealId: string, next: QuotationFormData): QuotationFormData => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return next;
    let updated = { ...next };
    if (deal.companyId && !updated.companyId) { updated.companyId = deal.companyId; updated = applyCompanyFill(deal.companyId, updated); }
    if (deal.contactId && !updated.contactId) { updated.contactId = deal.contactId; updated = applyContactFill(deal.contactId, updated); }
    if (deal.items && deal.items.length > 0 && updated.items.length === 0) {
      updated.items = deal.items.map((it) => createLineItem({
        kind: (it.kind as QuotationLineKind) || "custom",
        name: it.name || "",
        sku: it.sku || "",
        qty: it.qty ?? 1,
        unit: it.unit || "Piece",
        unitPrice: it.unitPrice ?? 0,
        tax: it.tax ?? 18,
        discount: it.discount ?? 0,
      }));
    }
    return updated;
  };

  const handleSelectDeal = (dealId: string) => {
    setForm((prev) => applyDealFill(dealId, { ...prev, dealId }));
  };

  const handleSelectCompany = (companyId: string) => {
    setForm((prev) => applyCompanyFill(companyId, { ...prev, companyId }));
  };

  const handleSelectContact = (contactId: string) => {
    setForm((prev) => applyContactFill(contactId, { ...prev, contactId }));
  };

  /* ─── Line item ops ────────────────────────────────────────────────── */

  const addLine = (kind: QuotationLineKind) => {
    const unit = kind === "service" ? "Service" : "Piece";
    setForm((prev) => ({ ...prev, items: [...prev.items, createLineItem({ kind, unit })] }));
  };

  const addInventoryLine = (item: InventoryItem) => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, createLineItem({
        kind: item.type === "Service" ? "service" : "product",
        itemId: item.id,
        name: item.name,
        sku: item.id,
        description: item.category,
        unit: item.uom || "Piece",
        unitPrice: item.regularSellingPrice,
        tax: item.tax ?? 18,
      })],
    }));
  };

  const updateLine = (id: string, patch: Partial<QuotationLineItem>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it) => {
        if (it.id !== id) return it;
        const merged = { ...it, ...patch };
        merged.total = computeLineTotal(merged);
        return merged;
      }),
    }));
  };

  const removeLine = (id: string) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((it) => it.id !== id) }));
  };

  /* ─── Totals ───────────────────────────────────────────────────────── */

  const totals = React.useMemo(() => computeTotals(form), [form]);

  const resolved = React.useMemo(() => {
    const contact = findContact(form.contactId);
    const company = findCompany(form.companyId);
    return {
      customerName: contact?.name || company?.name || "",
      phone: contact?.phone || company?.phone || "",
      email: contact?.email || company?.email || "",
      company: company?.name || "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.contactId, form.companyId, companyParties, contactParties]);

  /* ─── Section status ───────────────────────────────────────────────── */

  const sectionStatus = React.useMemo(() => {
    const s: Record<string, "complete" | "incomplete" | "warning"> = {};
    const linked = form.companyId || form.contactId || form.leadId;
    s.general = form.title && linked ? "complete" : form.title ? "warning" : "incomplete";
    s.products = form.items.length > 0 ? "complete" : "incomplete";
    s.pricing = totals.grandTotal > 0 ? "complete" : "incomplete";
    s.billing = form.billing.line1 && form.billing.city ? "complete" : "incomplete";
    s.terms = form.terms ? "complete" : "incomplete";
    s.notes = form.internalNotes ? "complete" : "incomplete";
    s.review = "incomplete";
    return s;
  }, [form, totals.grandTotal]);

  /* ─── Validation + Save ────────────────────────────────────────────── */

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Quotation title is required";
    setErrors(errs);
    if (Object.keys(errs).length > 0) { scrollToSection("general"); return false; }
    return true;
  };

  const persist = async (status: QuotationStatus) => {
    if (!validate()) return null;
    setSaving(true);
    const finalForm = { ...form, status };
    try {
      if (isSupabaseConfigured && supabase) {
        const row = quotationToRow(finalForm, totals);
        // Best-effort insert; the quotations table may not exist yet in every
        // environment, so we never block the UX on it (mirrors AddDealModal).
        await supabase.from("quotations").insert(row);
      }
    } catch (err) {
      console.error("[quotation] save failed (kept locally):", err);
    } finally {
      setSaving(false);
    }
    setForm(finalForm);
    setSavedId(finalForm.number);
    onSave?.({
      id: finalForm.number,
      title: finalForm.title,
      contact: resolved.customerName,
      company: resolved.company,
      value: totals.grandTotal,
      status,
      createdAt: new Date().toISOString(),
      validUntil: finalForm.validUntil,
      items: finalForm.items.length,
    });
    return finalForm.number;
  };

  const genInvoiceId = (): string => {
    const nums = invoices
      .map((i) => { const m = i.id.match(/\d+$/); return m ? parseInt(m[0], 10) : 0; });
    const max = nums.length ? Math.max(...nums) : 0;
    return `INV${String(max + 1).padStart(3, "0")}`;
  };

  const handleConvertToInvoice = async () => {
    const invoiceId = genInvoiceId();
    const invoice: Invoice = quotationToInvoice(form, totals, resolved, invoiceId);
    await addInvoice(invoice);
    onClose();
    router.push(`/invoice/${invoiceId}`);
  };

  const handleGeneratePdf = () => {
    openQuotationPrint(form, totals, resolved);
  };

  const resetForNew = () => {
    setForm(createQuotationForm());
    setSavedId(null);
    setErrors({});
    setActiveSection("general");
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const handleClose = () => {
    if (savedId) resetForNew();
    onClose();
  };

  if (!mounted) return null;

  const content = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            className="fixed inset-0 z-[9998] bg-foreground/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4"
          >
            <div className="relative flex h-[92vh] w-[95vw] max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_32px_80px_-20px_rgba(20,30,80,0.25)]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-card to-[#EEF1FD]/30 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#4361EE] text-white shadow-sm">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-display text-xl font-bold tracking-tight">Add Quotation</h2>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      Create a quotation for an existing lead, company or customer.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {savedId ? (
                <QuotationSuccess
                  id={savedId}
                  status={form.status}
                  total={totals.grandTotal}
                  onView={() => { handleGeneratePdf(); }}
                  onDownload={handleGeneratePdf}
                  onEmail={() => window.open(`mailto:${resolved.email}?subject=${encodeURIComponent(`Quotation ${savedId}`)}`)}
                  onWhatsApp={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Quotation ${savedId} — ${formatINR(totals.grandTotal)}`)}`, "_blank")}
                  onConvert={handleConvertToInvoice}
                  onCreateAnother={resetForNew}
                  onBack={() => { resetForNew(); onClose(); }}
                />
              ) : (
                <>
                  {/* Body */}
                  <div className="flex flex-1 overflow-hidden">
                    {/* Left nav */}
                    <nav className="hidden w-[230px] shrink-0 flex-col gap-1 border-r border-border bg-[#FAFBFF] p-4 lg:flex">
                      <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                        Sections
                      </p>
                      {SECTIONS.map((sec) => {
                        const Icon = sec.icon;
                        const isActive = activeSection === sec.id;
                        const status = sectionStatus[sec.id];
                        const hasError = sec.id === "general" && !!errors.title;
                        return (
                          <button
                            key={sec.id}
                            onClick={() => scrollToSection(sec.id)}
                            className={cn(
                              "group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-all duration-150",
                              isActive ? "bg-[#EEF1FD] text-[#4361EE] shadow-sm" : "text-zinc-600 hover:bg-muted hover:text-foreground"
                            )}
                          >
                            <span className={cn(
                              "grid h-6 w-6 shrink-0 place-items-center rounded-lg transition",
                              hasError ? "bg-rose-500 text-white"
                                : isActive ? "bg-[#4361EE] text-white"
                                : status === "complete" ? "bg-emerald-500 text-white"
                                : "bg-muted text-zinc-400 group-hover:text-zinc-600"
                            )}>
                              {hasError ? <AlertTriangle className="h-3 w-3" />
                                : status === "complete" ? <Check className="h-3.5 w-3.5" />
                                : status === "warning" ? <AlertTriangle className="h-3 w-3" />
                                : <Icon className="h-3.5 w-3.5" />}
                            </span>
                            <span className="truncate">{sec.label}</span>
                          </button>
                        );
                      })}
                    </nav>

                    {/* Main + summary */}
                    <div className="flex flex-1 overflow-hidden">
                      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-6 lg:px-8">
                        <div className="mx-auto max-w-3xl space-y-7">
                          <div ref={(el) => { sectionRefs.current.general = el; }}>
                            <SectionGeneral
                              form={form} set={set} errors={errors}
                              leadOptions={leadOptions} dealOptions={dealOptions}
                              companyOptions={companyOptions} contactOptions={contactOptions}
                              onSelectLead={handleSelectLead} onSelectDeal={handleSelectDeal}
                              onSelectCompany={handleSelectCompany} onSelectContact={handleSelectContact}
                            />
                          </div>
                          <div ref={(el) => { sectionRefs.current.products = el; }}>
                            <SectionProducts form={form} inventory={inventory} onAdd={addLine} onAddInventory={addInventoryLine} onUpdate={updateLine} onRemove={removeLine} totals={totals} />
                          </div>
                          <div ref={(el) => { sectionRefs.current.pricing = el; }}>
                            <SectionPricing form={form} set={set} totals={totals} />
                          </div>
                          <div ref={(el) => { sectionRefs.current.billing = el; }}>
                            <SectionBilling form={form} set={set} />
                          </div>
                          <div ref={(el) => { sectionRefs.current.terms = el; }}>
                            <SectionTerms form={form} set={set} />
                          </div>
                          <div ref={(el) => { sectionRefs.current.notes = el; }}>
                            <SectionNotes form={form} set={set} />
                          </div>
                          <div ref={(el) => { sectionRefs.current.review = el; }}>
                            <SectionReview form={form} totals={totals} resolved={resolved} />
                          </div>
                          <div className="h-6" />
                        </div>
                      </div>

                      {/* Right summary */}
                      <aside className="hidden w-[290px] shrink-0 overflow-y-auto border-l border-border bg-[#FAFBFF] p-5 xl:block">
                        <QuotationSummaryCard form={form} totals={totals} resolved={resolved} />
                      </aside>
                    </div>
                  </div>

                  {/* Sticky footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-6 py-3.5">
                    <p className="text-[12px] text-muted-foreground">
                      Grand Total <span className="font-semibold text-[#4361EE]">{formatINR(totals.grandTotal)}</span>
                      <span className="mx-2 text-zinc-300">·</span>
                      {form.items.length} item{form.items.length !== 1 ? "s" : ""}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="ghost" size="md" onClick={handleClose}>Cancel</Button>
                      <Button variant="outline" size="md" loading={saving} onClick={() => persist("draft")}>Save Draft</Button>
                      <Button size="md" loading={saving} onClick={() => persist("sent")}>Save &amp; Send</Button>
                      <Button variant="soft" size="md" disabled={!savedId} onClick={handleGeneratePdf}>
                        <Download className="h-3.5 w-3.5" /> Generate PDF
                      </Button>
                      <Button variant="outline" size="md" disabled={!savedId} onClick={handleConvertToInvoice}>
                        <FileCheck2 className="h-3.5 w-3.5" /> Convert to Invoice
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}

/* ═══════════════════════════════════════════════════════════════════════
   SECTION 1 — GENERAL INFORMATION
   ═══════════════════════════════════════════════════════════════════════ */

function SectionGeneral({
  form, set, errors, leadOptions, dealOptions, companyOptions, contactOptions,
  onSelectLead, onSelectDeal, onSelectCompany, onSelectContact,
}: {
  form: QuotationFormData;
  set: <K extends keyof QuotationFormData>(k: K, v: QuotationFormData[K]) => void;
  errors: Record<string, string>;
  leadOptions: { label: string; value: string }[];
  dealOptions: { label: string; value: string }[];
  companyOptions: { label: string; value: string }[];
  contactOptions: { label: string; value: string }[];
  onSelectLead: (v: string) => void;
  onSelectDeal: (v: string) => void;
  onSelectCompany: (v: string) => void;
  onSelectContact: (v: string) => void;
}) {
  const [tagInput, setTagInput] = React.useState("");
  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) set("tags", [...form.tags, t]);
    setTagInput("");
  };
  return (
    <Card>
      <SectionHead icon={FileText} title="General Information" desc="Core details, ownership and smart-linked records." />
      <CardContent>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Quotation Number</Label>
            <div className="flex gap-1.5">
              <Input value={form.number} onChange={(e) => set("number", e.target.value)} className="h-11 font-mono" />
              <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => set("number", generateQuotationNumber())} aria-label="Regenerate number">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Auto-generated · editable by admin.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Quotation Status</Label>
            <RSelect value={form.status} onChange={(v) => set("status", v as QuotationStatus)} options={QUOTATION_STATUS_OPTIONS} placeholder="Select status" />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Quotation Title <span className="text-rose-500">*</span></Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. iPhone Fleet Repair — Annual Contract"
              className={cn("h-11", errors.title && "border-rose-400 focus:ring-rose-200")}
            />
            {errors.title && <p className="text-[11px] text-rose-500">{errors.title}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Quotation Date</Label>
            <Input type="date" value={form.quotationDate} onChange={(e) => set("quotationDate", e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Valid Until</Label>
            <Input type="date" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} className="h-11" />
          </div>

          {/* Smart-linking group */}
          <div className="sm:col-span-2 rounded-xl border border-[#B3BFF6]/40 bg-[#EEF1FD]/30 p-4">
            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]">
              <Info className="h-3.5 w-3.5" /> Smart Linking — pick a lead to auto-load company, contact &amp; deal
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Associated Lead</Label>
                <RSelect value={form.leadId} onChange={onSelectLead} options={leadOptions} placeholder="Search leads…" searchable />
              </div>
              <div className="space-y-1.5">
                <Label>Associated Deal</Label>
                <RSelect value={form.dealId} onChange={onSelectDeal} options={dealOptions} placeholder="Search deals…" searchable />
              </div>
              <div className="space-y-1.5">
                <Label>Associated Company</Label>
                <RSelect value={form.companyId} onChange={onSelectCompany} options={companyOptions} placeholder="Search companies…" searchable />
              </div>
              <div className="space-y-1.5">
                <Label>Associated Contact</Label>
                <RSelect value={form.contactId} onChange={onSelectContact} options={contactOptions} placeholder="Search contacts…" searchable />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Assigned Owner</Label>
            <RSelect value={form.owner} onChange={(v) => set("owner", v)} options={OWNER_OPTIONS} placeholder="Select owner" searchable />
          </div>
          <div className="space-y-1.5">
            <Label>Sales Executive</Label>
            <RSelect value={form.salesExecutive} onChange={(v) => set("salesExecutive", v)} options={OWNER_OPTIONS} placeholder="Select executive" searchable />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <RSelect value={form.priority} onChange={(v) => set("priority", v)} options={PRIORITY_OPTIONS} placeholder="Select priority" />
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <RSelect value={form.source} onChange={(v) => set("source", v)} options={SOURCE_OPTIONS} placeholder="Select source" />
          </div>
          <div className="space-y-1.5">
            <Label>Reference Number</Label>
            <Input value={form.referenceNumber} onChange={(e) => set("referenceNumber", e.target.value)} placeholder="e.g. PO-2026-114" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Branch</Label>
            <RSelect value={form.branch} onChange={(v) => set("branch", v)} options={BRANCH_OPTIONS} placeholder="Select branch" />
          </div>
          <div className="space-y-1.5">
            <Label>Created By</Label>
            <Input value={form.createdBy} onChange={(e) => set("createdBy", e.target.value)} placeholder="Your name" className="h-11" />
          </div>

          {/* Tags */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tags</Label>
            <div className="flex items-center gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Type a tag and press Enter"
                className="h-10 flex-1"
              />
              <Button variant="outline" size="sm" onClick={addTag} className="shrink-0">Add</Button>
            </div>
            {form.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#EEF1FD] px-2.5 py-1 text-[11px] font-medium text-[#4361EE]">
                    {tag}
                    <button type="button" onClick={() => set("tags", form.tags.filter((t) => t !== tag))} className="hover:text-rose-500"><X className="h-3 w-3" /></button>
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

/* ═══════════════════════════════════════════════════════════════════════
   SECTION 2 — PRODUCTS & SERVICES
   ═══════════════════════════════════════════════════════════════════════ */

function SectionProducts({
  form, inventory, onAdd, onAddInventory, onUpdate, onRemove, totals,
}: {
  form: QuotationFormData;
  inventory: InventoryItem[];
  onAdd: (kind: QuotationLineKind) => void;
  onAddInventory: (item: InventoryItem) => void;
  onUpdate: (id: string, patch: Partial<QuotationLineItem>) => void;
  onRemove: (id: string) => void;
  totals: ReturnType<typeof computeTotals>;
}) {
  const [showSearch, setShowSearch] = React.useState(false);
  const [q, setQ] = React.useState("");

  const results = q.trim().length >= 2
    ? inventory.filter((it) => {
        const query = q.toLowerCase();
        return it.active && (it.name.toLowerCase().includes(query) || it.id.toLowerCase().includes(query) || it.category.toLowerCase().includes(query));
      }).slice(0, 8)
    : [];

  return (
    <Card>
      <div className="flex items-start justify-between p-5 pb-0 sm:p-6 sm:pb-0">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]"><Package className="h-4 w-4" /></span>
          <div>
            <CardTitle>Products &amp; Services</CardTitle>
            <CardDescription>Pull items from inventory or add custom lines. Totals update live.</CardDescription>
          </div>
        </div>
      </div>
      <CardContent className="pt-4">
        {/* Action buttons */}
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="soft" size="sm" onClick={() => setShowSearch((v) => !v)}><Search className="h-3.5 w-3.5" /> Search Inventory</Button>
          <Button variant="outline" size="sm" onClick={() => onAdd("product")}><Package className="h-3.5 w-3.5" /> Add Product</Button>
          <Button variant="outline" size="sm" onClick={() => onAdd("service")}><Wrench className="h-3.5 w-3.5" /> Add Service</Button>
          <Button variant="outline" size="sm" onClick={() => onAdd("accessory")}><Plus className="h-3.5 w-3.5" /> Add Accessory</Button>
          <Button variant="outline" size="sm" onClick={() => onAdd("custom")}><PenLine className="h-3.5 w-3.5" /> Custom Item</Button>
        </div>

        {/* Inventory search */}
        <AnimatePresence>
          {showSearch && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="mb-4 overflow-hidden">
              <div className="rounded-xl border border-[#4361EE]/30 bg-[#EEF1FD]/30 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Search className="h-4 w-4 text-[#4361EE]" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search inventory by name, SKU or category…" autoFocus className="h-10 flex-1" />
                  <button type="button" onClick={() => { setShowSearch(false); setQ(""); }} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                </div>
                {results.length > 0 && (
                  <div className="max-h-[240px] overflow-y-auto rounded-lg border border-border bg-card">
                    {results.map((item) => {
                      const available = item.currentStock - (item.reservedStock || 0);
                      return (
                        <button key={item.id} type="button" onClick={() => { onAddInventory(item); setShowSearch(false); setQ(""); }}
                          className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition last:border-0 hover:bg-indigo-50/50">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Package className="h-3.5 w-3.5" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground">{item.id} · {item.category} · GST {item.tax}%</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums">{formatINR(item.regularSellingPrice)}</p>
                            <span className="text-[10px] text-muted-foreground">Stock: {available}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {q.trim().length >= 2 && results.length === 0 && (
                  <p className="py-3 text-center text-sm text-muted-foreground">No inventory items match &ldquo;{q}&rdquo;</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Line items */}
        {form.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-12 text-center">
            <Package className="h-10 w-10 text-zinc-200" />
            <p className="mt-3 text-sm font-medium text-zinc-500">No items added yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Search inventory or add a product, service or custom line.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {form.items.map((item, idx) => (
              <LineItemRow key={item.id} index={idx} item={item} onUpdate={onUpdate} onRemove={onRemove} />
            ))}
            <div className="flex justify-end pt-1">
              <div className="rounded-xl bg-muted/60 px-4 py-2 text-sm">
                <span className="text-muted-foreground">Items total (incl. tax): </span>
                <span className="font-semibold tabular-nums">{formatINR(form.items.reduce((s, i) => s + i.total, 0))}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const KIND_META: Record<QuotationLineKind, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  product:   { label: "Product",   icon: Package, color: "bg-sky-50 text-sky-700" },
  service:   { label: "Service",   icon: Wrench,  color: "bg-violet-50 text-violet-700" },
  accessory: { label: "Accessory", icon: Plus,    color: "bg-amber-50 text-amber-700" },
  custom:    { label: "Custom",    icon: PenLine, color: "bg-zinc-100 text-zinc-600" },
};

function LineItemRow({ index, item, onUpdate, onRemove }: {
  index: number;
  item: QuotationLineItem;
  onUpdate: (id: string, patch: Partial<QuotationLineItem>) => void;
  onRemove: (id: string) => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.color)}>
          <Icon className="h-3 w-3" /> {meta.label} #{index + 1}
        </span>
        <button onClick={() => onRemove(item.id)} className="grid h-7 w-7 place-items-center rounded-lg text-rose-500 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
        <div className="space-y-1 sm:col-span-4">
          <Label>Product / Service</Label>
          <Input value={item.name} onChange={(e) => onUpdate(item.id, { name: e.target.value })} placeholder="Item name" className="h-10" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>SKU</Label>
          <Input value={item.sku} onChange={(e) => onUpdate(item.id, { sku: e.target.value })} placeholder="SKU" className="h-10 font-mono text-[12px]" />
        </div>
        <div className="space-y-1 sm:col-span-3">
          <Label>Unit</Label>
          <RSelect value={item.unit} onChange={(v) => onUpdate(item.id, { unit: v })} options={QUOTATION_UNITS.map((u) => ({ label: u, value: u }))} menuWidth="w-40" />
        </div>
        <div className="space-y-1 sm:col-span-3">
          <Label>Description</Label>
          <Input value={item.description} onChange={(e) => onUpdate(item.id, { description: e.target.value })} placeholder="Optional" className="h-10" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Quantity</Label>
          <NumericInput value={item.qty} onChange={(n) => onUpdate(item.id, { qty: Math.max(1, n) })} min={1} className="h-10" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Unit Price</Label>
          <NumericInput value={item.unitPrice} onChange={(n) => onUpdate(item.id, { unitPrice: n })} min={0} className="h-10" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Discount %</Label>
          <NumericInput value={item.discount} onChange={(n) => onUpdate(item.id, { discount: Math.min(100, n) })} min={0} className="h-10" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Tax (GST) %</Label>
          <NumericInput value={item.tax} onChange={(n) => onUpdate(item.id, { tax: Math.min(100, n) })} min={0} className="h-10" />
        </div>
        <div className="space-y-1 sm:col-span-4">
          <Label>Total</Label>
          <div className="flex h-10 items-center rounded-xl border border-border bg-muted/40 px-3 text-sm font-semibold tabular-nums">{formatINR(item.total)}</div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SECTION 3 — PRICING SUMMARY
   ═══════════════════════════════════════════════════════════════════════ */

function SectionPricing({ form, set, totals }: {
  form: QuotationFormData;
  set: <K extends keyof QuotationFormData>(k: K, v: QuotationFormData[K]) => void;
  totals: ReturnType<typeof computeTotals>;
}) {
  return (
    <Card>
      <SectionHead icon={IndianRupee} title="Pricing Summary" desc="Discounts, charges and GST — calculated in real time." />
      <CardContent>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Inputs */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>GST Type</Label>
              <RSelect
                value={form.gstMode}
                onChange={(v) => set("gstMode", v as QuotationFormData["gstMode"])}
                options={[{ label: "Intra-state (CGST + SGST)", value: "intra" }, { label: "Inter-state (IGST)", value: "inter" }]}
                placeholder="Select GST type"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Overall Discount (₹)</Label>
                <NumericInput value={form.overallDiscount} onChange={(n) => set("overallDiscount", n)} min={0} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <div className="flex h-11 items-center rounded-xl border border-border bg-muted/40 px-3.5 text-sm font-medium">₹ INR</div>
              </div>
              <div className="space-y-1.5">
                <Label>Shipping (₹)</Label>
                <NumericInput value={form.shipping} onChange={(n) => set("shipping", n)} min={0} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label>Additional Charges (₹)</Label>
                <NumericInput value={form.additionalCharges} onChange={(n) => set("additionalCharges", n)} min={0} className="h-11" />
              </div>
            </div>
          </div>

          {/* Live summary */}
          <div className="rounded-xl border border-border bg-gradient-to-b from-indigo-50/40 to-white p-5">
            <div className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatINR(totals.subtotal)} />
              <Row label="Item Discounts" value={`- ${formatINR(totals.itemDiscounts)}`} tone="emerald" />
              <Row label="Overall Discount" value={`- ${formatINR(totals.overallDiscount)}`} tone="emerald" />
              <Row label="Taxable Amount" value={formatINR(totals.taxableBase)} />
              {form.gstMode === "intra" ? (
                <>
                  <Row label="CGST" value={formatINR(totals.cgst)} />
                  <Row label="SGST" value={formatINR(totals.sgst)} />
                </>
              ) : (
                <Row label="IGST" value={formatINR(totals.igst)} />
              )}
              <Row label="Total GST" value={formatINR(totals.tax)} />
              <Row label="Shipping" value={formatINR(totals.shipping)} />
              <Row label="Additional Charges" value={formatINR(totals.additionalCharges)} />
              <Row label="Round Off" value={`${totals.roundOff >= 0 ? "+" : ""}${formatINR(totals.roundOff)}`} />
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>Grand Total</span>
                <span className="tabular-nums text-[#4361EE]">{formatINR(totals.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "emerald" }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums font-medium", tone === "emerald" && "text-emerald-600")}>{value}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SECTION 4 — BILLING INFORMATION
   ═══════════════════════════════════════════════════════════════════════ */

function SectionBilling({ form, set }: {
  form: QuotationFormData;
  set: <K extends keyof QuotationFormData>(k: K, v: QuotationFormData[K]) => void;
}) {
  const setBilling = (patch: Partial<QuotationAddress>) => {
    const next = { ...form.billing, ...patch };
    set("billing", next);
    if (form.sameAsBilling) set("shippingAddr", next);
  };
  const setShipping = (patch: Partial<QuotationAddress>) => set("shippingAddr", { ...form.shippingAddr, ...patch });

  return (
    <Card>
      <SectionHead icon={MapPin} title="Billing Information" desc="Billing / shipping address, payment terms and method." />
      <CardContent>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Billing Address</p>
            <AddressFields addr={form.billing} onChange={setBilling} />
          </div>
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Shipping Address</p>
              <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-zinc-600">
                <button
                  type="button"
                  onClick={() => { const v = !form.sameAsBilling; set("sameAsBilling", v); if (v) set("shippingAddr", form.billing); }}
                  className={cn("relative h-5 w-9 rounded-full transition", form.sameAsBilling ? "bg-[#4361EE]" : "bg-zinc-300")}
                >
                  <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", form.sameAsBilling ? "left-[18px]" : "left-0.5")} />
                </button>
                Same as billing
              </label>
            </div>
            {form.sameAsBilling ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-[13px] text-muted-foreground">
                Shipping address mirrors the billing address.
              </div>
            ) : (
              <AddressFields addr={form.shippingAddr} onChange={setShipping} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Payment Terms</Label>
            <RSelect value={form.paymentTerms} onChange={(v) => set("paymentTerms", v)} options={PAYMENT_TERMS_OPTIONS} placeholder="Select payment terms" />
          </div>
          <div className="space-y-1.5">
            <Label>Expected Payment Method</Label>
            <RSelect value={form.paymentMethod} onChange={(v) => set("paymentMethod", v)} options={PAYMENT_METHOD_OPTIONS} placeholder="Select payment method" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AddressFields({ addr, onChange }: { addr: QuotationAddress; onChange: (patch: Partial<QuotationAddress>) => void }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Address</Label>
        <Textarea value={addr.line1} onChange={(e) => onChange({ line1: e.target.value })} placeholder="Street, area, landmark" rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>City</Label><Input value={addr.city} onChange={(e) => onChange({ city: e.target.value })} className="h-10" /></div>
        <div className="space-y-1.5"><Label>State</Label><Input value={addr.state} onChange={(e) => onChange({ state: e.target.value })} className="h-10" /></div>
        <div className="space-y-1.5"><Label>Country</Label><Input value={addr.country} onChange={(e) => onChange({ country: e.target.value })} className="h-10" /></div>
        <div className="space-y-1.5"><Label>Zipcode</Label><Input value={addr.zipcode} onChange={(e) => onChange({ zipcode: e.target.value })} className="h-10" /></div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SECTION 5 — TERMS & CONDITIONS
   ═══════════════════════════════════════════════════════════════════════ */

function SectionTerms({ form, set }: {
  form: QuotationFormData;
  set: <K extends keyof QuotationFormData>(k: K, v: QuotationFormData[K]) => void;
}) {
  return (
    <Card>
      <SectionHead icon={ScrollText} title="Terms & Conditions" desc="Default terms are pre-filled and fully editable." />
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Terms &amp; Conditions</Label><Textarea value={form.terms} onChange={(e) => set("terms", e.target.value)} rows={4} /></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Warranty Terms</Label><Textarea value={form.warrantyTerms} onChange={(e) => set("warrantyTerms", e.target.value)} rows={3} /></div>
            <div className="space-y-1.5"><Label>Return Policy</Label><Textarea value={form.returnPolicy} onChange={(e) => set("returnPolicy", e.target.value)} rows={3} /></div>
            <div className="space-y-1.5"><Label>Delivery Terms</Label><Textarea value={form.deliveryTerms} onChange={(e) => set("deliveryTerms", e.target.value)} rows={3} /></div>
            <div className="space-y-1.5"><Label>Installation Notes</Label><Textarea value={form.installationNotes} onChange={(e) => set("installationNotes", e.target.value)} rows={3} placeholder="Optional installation instructions" /></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SECTION 6 — INTERNAL NOTES
   ═══════════════════════════════════════════════════════════════════════ */

function SectionNotes({ form, set }: {
  form: QuotationFormData;
  set: <K extends keyof QuotationFormData>(k: K, v: QuotationFormData[K]) => void;
}) {
  return (
    <Card>
      <SectionHead icon={StickyNote} title="Internal Notes" desc="Visible to staff only — never printed or shared with the customer." />
      <CardContent>
        <div className="space-y-1.5">
          <Label>Internal Comments</Label>
          <Textarea value={form.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} rows={4} placeholder="Notes for your team about this quotation…" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SECTION 7 — REVIEW
   ═══════════════════════════════════════════════════════════════════════ */

function SectionReview({ form, totals, resolved }: {
  form: QuotationFormData;
  totals: ReturnType<typeof computeTotals>;
  resolved: { customerName: string; phone: string; email: string; company: string };
}) {
  return (
    <Card>
      <SectionHead icon={ClipboardCheck} title="Review" desc="Verify everything before saving." tone="emerald" />
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReviewItem label="Quotation" value={`${form.number}${form.title ? ` — ${form.title}` : ""}`} />
          <ReviewItem label="Status" value={QUOTATION_STATUS_OPTIONS.find((o) => o.value === form.status)?.label || form.status} />
          <ReviewItem label="Customer" value={resolved.customerName || "—"} />
          <ReviewItem label="Company" value={resolved.company || "—"} />
          <ReviewItem label="Valid Until" value={form.validUntil || "—"} />
          <ReviewItem label="Products / Services" value={`${form.items.length} line${form.items.length !== 1 ? "s" : ""}`} />
          <ReviewItem label="Total GST" value={formatINR(totals.tax)} />
          <ReviewItem label="Final Amount" value={formatINR(totals.grandTotal)} highlight />
        </div>
        {form.items.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-[#EEF1FD]/60 text-left text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/70">
                <tr><th className="px-3 py-2">Item</th><th className="py-2 text-center">Qty</th><th className="py-2 text-right">Unit</th><th className="py-2 pr-3 text-right">Total</th></tr>
              </thead>
              <tbody>
                {form.items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="px-3 py-2">{it.name || "Untitled"}</td>
                    <td className="py-2 text-center tabular-nums">{it.qty}</td>
                    <td className="py-2 text-right tabular-nums">{formatINR(it.unitPrice)}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{formatINR(it.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className={cn("text-[13px] font-medium", highlight ? "font-semibold text-[#4361EE]" : "text-foreground")}>{value}</span>
    </div>
  );
}

/* ─── Right summary card ─────────────────────────────────────────────── */

function QuotationSummaryCard({ form, totals, resolved }: {
  form: QuotationFormData;
  totals: ReturnType<typeof computeTotals>;
  resolved: { customerName: string; phone: string; email: string; company: string };
}) {
  const statusMeta = QUOTATION_STATUS_OPTIONS.find((o) => o.value === form.status);
  return (
    <div className="space-y-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Quotation Summary</h3>

      <div className="rounded-xl border border-[#B3BFF6]/30 bg-gradient-to-br from-[#4361EE]/5 to-[#4361EE]/10 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#4361EE]/70">Grand Total</p>
        <p className="font-display mt-1 text-2xl font-extrabold tabular-nums text-[#4361EE]">{formatINR(totals.grandTotal)}</p>
        <p className="mt-0.5 font-mono text-[11px] text-[#4361EE]/70">{form.number}</p>
      </div>

      <div className="space-y-3">
        <SummaryRow label="Customer" value={resolved.customerName || "—"} />
        <SummaryRow label="Company" value={resolved.company || "—"} />
        <SummaryRow label="Products" value={form.items.length > 0 ? `${form.items.length} lines` : "None"} />
        <SummaryRow label="Subtotal" value={formatINR(totals.subtotal)} />
        <SummaryRow label="Tax" value={formatINR(totals.tax)} />
        <SummaryRow label="Valid Until" value={form.validUntil || "—"} />
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">Status</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset", QUOTATION_STATUS_META_LOCAL(form.status))}>{statusMeta?.label}</span>
        </div>
      </div>
    </div>
  );
}

function QUOTATION_STATUS_META_LOCAL(status: QuotationStatus): string {
  const map: Record<QuotationStatus, string> = {
    draft: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    pending: "bg-amber-50 text-amber-700 ring-amber-200",
    sent: "bg-sky-50 text-sky-700 ring-sky-200",
    accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    rejected: "bg-rose-50 text-rose-700 ring-rose-200",
    expired: "bg-zinc-100 text-zinc-500 ring-zinc-200",
  };
  return map[status];
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="max-w-[150px] truncate text-right text-[12px] font-medium text-foreground">{value}</span>
    </div>
  );
}

/* ─── Shared section head ────────────────────────────────────────────── */

function SectionHead({ icon: Icon, title, desc, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  tone?: "emerald";
}) {
  return (
    <CardHeader>
      <div className="flex items-center gap-3">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tone === "emerald" ? "bg-emerald-50 text-emerald-600" : "bg-[#EEF1FD] text-[#4361EE]")}>
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{desc}</CardDescription>
        </div>
      </div>
    </CardHeader>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SUCCESS SCREEN (post-save)
   ═══════════════════════════════════════════════════════════════════════ */

function QuotationSuccess({
  id, status, total, onView, onDownload, onEmail, onWhatsApp, onConvert, onCreateAnother, onBack,
}: {
  id: string;
  status: QuotationStatus;
  total: number;
  onView: () => void;
  onDownload: () => void;
  onEmail: () => void;
  onWhatsApp: () => void;
  onConvert: () => void;
  onCreateAnother: () => void;
  onBack: () => void;
}) {
  const actions = [
    { label: "View Quotation", icon: Eye, onClick: onView, variant: "outline" as const },
    { label: "Download PDF", icon: Download, onClick: onDownload, variant: "outline" as const },
    { label: "Email Customer", icon: Mail, onClick: onEmail, variant: "outline" as const },
    { label: "WhatsApp Customer", icon: MessageCircle, onClick: onWhatsApp, variant: "outline" as const },
    { label: "Convert to Invoice", icon: FileCheck2, onClick: onConvert, variant: "primary" as const },
    { label: "Create Another", icon: Plus, onClick: onCreateAnother, variant: "soft" as const },
  ];
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-10 text-center">
      <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-20" />
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 240, damping: 18 }}
        className="relative grid h-20 w-20 place-items-center rounded-full brand-gradient text-white shadow-glow">
        <CheckCircle2 className="h-10 w-10" />
      </motion.div>
      <motion.h2 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="font-display mt-6 text-3xl font-extrabold tracking-tight">
        Quotation <span className="brand-gradient-text">saved</span>
      </motion.h2>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#E2E8F8] bg-[#F7FAFF] px-4 py-1.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#4361EE]" />
        <span className="font-mono text-[13px] font-semibold tracking-wide text-[#4361EE]">{id}</span>
        <span className="text-[12px] text-muted-foreground">· {formatINR(total)} · {status}</span>
      </motion.div>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        Your quotation is ready. Share it, generate a PDF, or convert it into an invoice in one click — all details carry over automatically.
      </p>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Button key={a.label} variant={a.variant} size="lg" className="justify-start" onClick={a.onClick}>
              <Icon className="h-4 w-4" /> {a.label}
            </Button>
          );
        })}
      </motion.div>

      <button onClick={onBack} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Quotations
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PDF / PRINT — self-contained print window for the quotation
   ═══════════════════════════════════════════════════════════════════════ */

function openQuotationPrint(
  form: QuotationFormData,
  totals: ReturnType<typeof computeTotals>,
  resolved: { customerName: string; phone: string; email: string; company: string },
) {
  if (typeof window === "undefined") return;
  const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
  const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rows = form.items.map((it, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(it.name)}</strong>${it.sku ? `<br/><span class="muted">${esc(it.sku)}</span>` : ""}${it.description ? `<br/><span class="muted">${esc(it.description)}</span>` : ""}</td>
      <td class="num">${it.qty} ${esc(it.unit)}</td>
      <td class="num">${inr(it.unitPrice)}</td>
      <td class="num">${it.discount}%</td>
      <td class="num">${it.tax}%</td>
      <td class="num"><strong>${inr(it.total)}</strong></td>
    </tr>`).join("");

  const gstRows = form.gstMode === "intra"
    ? `<tr><td>CGST</td><td class="num">${inr(totals.cgst)}</td></tr><tr><td>SGST</td><td class="num">${inr(totals.sgst)}</td></tr>`
    : `<tr><td>IGST</td><td class="num">${inr(totals.igst)}</td></tr>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Quotation ${esc(form.number)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;margin:0;padding:40px;}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #4361EE;padding-bottom:16px;margin-bottom:24px}
    h1{font-size:26px;margin:0;color:#4361EE}
    .muted{color:#71717a;font-size:12px}
    .grid{display:flex;gap:40px;margin-bottom:24px}
    .box{flex:1}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px}
    th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e4e4e7}
    th{background:#EEF1FD;color:#4361EE;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
    .num{text-align:right}
    .totals{width:320px;margin-left:auto;font-size:13px}
    .totals td{border:none;padding:5px 10px}
    .grand{font-size:16px;font-weight:800;color:#4361EE;border-top:2px solid #4361EE!important}
    .terms{margin-top:24px;font-size:12px;color:#3f3f46;white-space:pre-wrap;border-top:1px solid #e4e4e7;padding-top:12px}
    .status{display:inline-block;padding:3px 10px;border-radius:999px;background:#EEF1FD;color:#4361EE;font-size:12px;font-weight:600}
  </style></head><body>
    <div class="head">
      <div><h1>QUOTATION</h1><div class="muted">${esc(form.number)}</div><span class="status">${esc(form.status)}</span></div>
      <div style="text-align:right"><div class="muted">Date: ${esc(form.quotationDate)}</div><div class="muted">Valid Until: ${esc(form.validUntil)}</div>${form.referenceNumber ? `<div class="muted">Ref: ${esc(form.referenceNumber)}</div>` : ""}</div>
    </div>
    <div class="grid">
      <div class="box"><div class="muted">Billed To</div><strong>${esc(resolved.customerName || resolved.company || "Customer")}</strong><br/>
        ${resolved.company ? esc(resolved.company) + "<br/>" : ""}${resolved.phone ? esc(resolved.phone) + "<br/>" : ""}${resolved.email ? esc(resolved.email) + "<br/>" : ""}
        ${esc(form.billing.line1)}<br/>${esc([form.billing.city, form.billing.state, form.billing.zipcode].filter(Boolean).join(", "))}</div>
      <div class="box"><div class="muted">Title</div><strong>${esc(form.title || "—")}</strong></div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Disc</th><th class="num">Tax</th><th class="num">Total</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7" class="muted">No items</td></tr>`}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${inr(totals.subtotal)}</td></tr>
      <tr><td>Item Discounts</td><td class="num">- ${inr(totals.itemDiscounts)}</td></tr>
      <tr><td>Overall Discount</td><td class="num">- ${inr(totals.overallDiscount)}</td></tr>
      ${gstRows}
      <tr><td>Shipping</td><td class="num">${inr(totals.shipping)}</td></tr>
      <tr><td>Additional Charges</td><td class="num">${inr(totals.additionalCharges)}</td></tr>
      <tr><td>Round Off</td><td class="num">${inr(totals.roundOff)}</td></tr>
      <tr class="grand"><td>Grand Total</td><td class="num">${inr(totals.grandTotal)}</td></tr>
    </table>
    ${form.terms ? `<div class="terms"><strong>Terms &amp; Conditions</strong>\n${esc(form.terms)}</div>` : ""}
    ${form.warrantyTerms ? `<div class="terms"><strong>Warranty</strong>\n${esc(form.warrantyTerms)}</div>` : ""}
    <script>window.onload=function(){setTimeout(function(){window.print();},250);}<\/script>
  </body></html>`;

  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
  if (w) { w.document.write(html); w.document.close(); }
}
