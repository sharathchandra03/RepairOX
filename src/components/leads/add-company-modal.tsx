"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Building2, Phone, MapPin, Briefcase, Link2, StickyNote,
  ClipboardCheck, Plus, Trash2, CheckCircle2, AlertTriangle,
  Globe, Users, IndianRupee, Hash, Mail, Facebook, Instagram,
  Linkedin, Twitter, Youtube,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import { usePermissions } from "@/lib/permissions-context";
import { useStore } from "@/lib/store";
import {
  createCompany, findCompanyDuplicates,
  type Company, type PhoneEntry, type EmailEntry,
  type CompanyAddress, type CompanyBusinessDetails, type CompanySocialLinks,
  type CommunicationPreferences, type CompanyDuplicateMatch,
} from "@/lib/company-data";
import { cn } from "@/lib/utils";

/* ─── Constants ─────────────────────────────────────────────────── */

type SectionId = "general" | "communication" | "address" | "business" | "social" | "notes" | "review";

interface NavSection {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: NavSection[] = [
  { id: "general", label: "General Information", icon: Building2 },
  { id: "communication", label: "Communication", icon: Phone },
  { id: "address", label: "Business Address", icon: MapPin },
  { id: "business", label: "Business Details", icon: Briefcase },
  { id: "social", label: "Social Links", icon: Link2 },
  { id: "notes", label: "Internal Notes", icon: StickyNote },
  { id: "review", label: "Review", icon: ClipboardCheck },
];

const COMPANY_TYPES = [
  { label: "Pvt Ltd", value: "pvt_ltd" },
  { label: "LLP", value: "llp" },
  { label: "Proprietorship", value: "proprietorship" },
  { label: "Partnership", value: "partnership" },
  { label: "Public Ltd", value: "public_ltd" },
  { label: "NGO", value: "ngo" },
  { label: "Government", value: "government" },
  { label: "Other", value: "other" },
];

const INDUSTRIES = [
  { label: "Technology", value: "technology" },
  { label: "Electronics", value: "electronics" },
  { label: "Retail", value: "retail" },
  { label: "IT Services", value: "it-services" },
  { label: "Manufacturing", value: "manufacturing" },
  { label: "Education", value: "education" },
  { label: "Healthcare", value: "healthcare" },
  { label: "Real Estate", value: "real-estate" },
  { label: "Hospitality", value: "hospitality" },
  { label: "Finance", value: "finance" },
  { label: "Logistics", value: "logistics" },
  { label: "Construction", value: "construction" },
  { label: "Other", value: "other" },
];

const BUSINESS_CATEGORIES = [
  { label: "Service Provider", value: "service-provider" },
  { label: "Product Seller", value: "product-seller" },
  { label: "Distributor", value: "distributor" },
  { label: "Dealer", value: "dealer" },
  { label: "Manufacturer", value: "manufacturer" },
  { label: "Consultant", value: "consultant" },
  { label: "Freelancer", value: "freelancer" },
  { label: "Other", value: "other" },
];

const BUSINESS_SIZES = [
  { label: "Micro (1–10)", value: "micro" },
  { label: "Small (11–50)", value: "small" },
  { label: "Medium (51–200)", value: "medium" },
  { label: "Large (201–1000)", value: "large" },
  { label: "Enterprise (1000+)", value: "enterprise" },
];

const EMPLOYEE_RANGES = [
  { label: "1–10", value: "1-10" },
  { label: "11–50", value: "11-50" },
  { label: "51–200", value: "51-200" },
  { label: "201–500", value: "201-500" },
  { label: "501–1000", value: "501-1000" },
  { label: "1000+", value: "1000+" },
];

const REVENUE_RANGES = [
  { label: "Under ₹5 Lakh", value: "under-5l" },
  { label: "₹5–25 Lakh", value: "5l-25l" },
  { label: "₹25 Lakh – ₹1 Cr", value: "25l-1cr" },
  { label: "₹1–5 Cr", value: "1cr-5cr" },
  { label: "₹5–25 Cr", value: "5cr-25cr" },
  { label: "₹25 Cr+", value: "25cr+" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Prospect", value: "prospect" },
  { label: "Inactive", value: "inactive" },
];

const PHONE_TYPES: { label: string; value: PhoneEntry["type"] }[] = [
  { label: "Mobile", value: "Mobile" },
  { label: "Office", value: "Office" },
  { label: "Reception", value: "Reception" },
  { label: "Support", value: "Support" },
  { label: "WhatsApp", value: "WhatsApp" },
];

const EMAIL_TYPES: { label: string; value: EmailEntry["type"] }[] = [
  { label: "Business", value: "Business" },
  { label: "Support", value: "Support" },
  { label: "Sales", value: "Sales" },
  { label: "Accounts", value: "Accounts" },
  { label: "General", value: "General" },
];

const TAX_TYPES = [
  { label: "GST Regular", value: "gst-regular" },
  { label: "GST Composition", value: "gst-composition" },
  { label: "Unregistered", value: "unregistered" },
  { label: "Exempt", value: "exempt" },
];

const BILLING_CYCLES = [
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Half-Yearly", value: "half-yearly" },
  { label: "Yearly", value: "yearly" },
  { label: "On Delivery", value: "on-delivery" },
];

const PAYMENT_TERMS = [
  { label: "Net 15", value: "net-15" },
  { label: "Net 30", value: "net-30" },
  { label: "Net 45", value: "net-45" },
  { label: "Net 60", value: "net-60" },
  { label: "Net 90", value: "net-90" },
  { label: "Due on Receipt", value: "due-on-receipt" },
  { label: "Advance Payment", value: "advance" },
];

const PAYMENT_MODES = [
  { label: "Bank Transfer (NEFT/RTGS)", value: "bank-transfer" },
  { label: "UPI", value: "upi" },
  { label: "Cheque", value: "cheque" },
  { label: "Cash", value: "cash" },
  { label: "Credit Card", value: "credit-card" },
  { label: "Other", value: "other" },
];

const TURNOVER_RANGES = [
  { label: "Under ₹10 Lakh", value: "under-10l" },
  { label: "₹10–50 Lakh", value: "10l-50l" },
  { label: "₹50 Lakh – ₹2 Cr", value: "50l-2cr" },
  { label: "₹2–10 Cr", value: "2cr-10cr" },
  { label: "₹10–50 Cr", value: "10cr-50cr" },
  { label: "₹50 Cr+", value: "50cr+" },
];

/* ─── Field Helper ───────────────────────────────────────────────── */

function Field({ label, required, hint, error, success, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  success?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertTriangle className="h-3 w-3" /> {error}
        </p>
      )}
      {success && !error && (
        <p className="flex items-center gap-1 text-[11px] text-emerald-600">
          <CheckCircle2 className="h-3 w-3" /> Looks good
        </p>
      )}
      {hint && !error && !success && (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/* ─── Section Card Wrapper ───────────────────────────────────────── */

function SectionCard({ id, title, subtitle, children, sectionRef }: {
  id: SectionId;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  sectionRef: (el: HTMLElement | null) => void;
}) {
  return (
    <section
      id={id}
      ref={sectionRef}
      className="scroll-mt-6 rounded-2xl border border-border bg-card p-6 shadow-card"
    >
      <div className="mb-5">
        <h3 className="text-[15px] font-bold tracking-tight">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/* ─── Main Modal Component ───────────────────────────────────────── */

export function AddCompanyModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { can, currentUser, team } = usePermissions();
  const { addCompany, companies } = useStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  /* ── Form State ── */
  const [companyName, setCompanyName] = useState("");
  const [companyType, setCompanyType] = useState("");
  const [industry, setIndustry] = useState("");
  const [businessCategory, setBusinessCategory] = useState("");
  const [businessSize, setBusinessSize] = useState("");
  const [numberOfEmployees, setNumberOfEmployees] = useState("");
  const [annualRevenue, setAnnualRevenue] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [website, setWebsite] = useState("");
  const [owner, setOwner] = useState(currentUser?.name ?? "");
  const [branch, setBranch] = useState(currentUser?.branch ?? "");
  const [assignedEmployee, setAssignedEmployee] = useState("");
  const [status, setStatus] = useState("active");

  // Communication
  const [phones, setPhones] = useState<PhoneEntry[]>([
    { id: 1, type: "Office", number: "", isPrimary: true },
  ]);
  const [emails, setEmails] = useState<EmailEntry[]>([
    { id: 1, type: "Business", address: "", isPrimary: true },
  ]);
  const [commPrefs, setCommPrefs] = useState<CommunicationPreferences>({
    email: true, phone: true, whatsapp: false,
  });
  const [phoneSeq, setPhoneSeq] = useState(2);
  const [emailSeq, setEmailSeq] = useState(2);

  // Address
  const [address, setAddress] = useState<CompanyAddress>({
    addressLine1: "", addressLine2: "", area: "", city: "",
    district: "", state: "", country: "India", pinCode: "",
    landmark: "", googleMapsUrl: "", gpsLocation: "",
  });

  // Business Details
  const [bizDetails, setBizDetails] = useState<CompanyBusinessDetails>({
    registrationNumber: "", gstin: "", pan: "", taxType: "",
    billingCycle: "", creditLimit: 0, paymentTerms: "",
    preferredPaymentMode: "", currency: "INR", businessSince: "",
    annualTurnover: "", description: "",
  });

  // Social Links
  const [socialLinks, setSocialLinks] = useState<CompanySocialLinks>({
    facebook: "", instagram: "", linkedin: "",
    twitter: "", youtube: "", website: "",
  });

  // Notes
  const [notes, setNotes] = useState("");

  // UI state
  const [activeSection, setActiveSection] = useState<SectionId>("general");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    general: null, communication: null, address: null,
    business: null, social: null, notes: null, review: null,
  });
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  /* ── Derived Values ── */
  const primaryPhone = phones.find((p) => p.isPrimary)?.number ?? "";
  const primaryEmail = emails.find((e) => e.isPrimary)?.address ?? "";

  const teamOptions = useMemo(() =>
    team.filter((m) => m.status === "active").map((m) => ({ label: m.name, value: m.name })),
    [team]
  );

  /* ── Validation ── */
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (touched.companyName && !companyName.trim()) e.companyName = "Company name is required";
    if (touched.gst && gstNumber && !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[Z]{1}[A-Z\d]{1}$/.test(gstNumber))
      e.gst = "Invalid GST format (e.g. 29AABCK1234F1ZP)";
    if (touched.pan && panNumber && !/^[A-Z]{5}\d{4}[A-Z]$/.test(panNumber))
      e.pan = "Invalid PAN format (e.g. ABCDE1234F)";
    if (touched.website && website && !/^https?:\/\/.+/.test(website) && website.length > 0)
      e.website = "Enter a valid URL (https://...)";
    return e;
  }, [touched, companyName, gstNumber, panNumber, website]);

  const canSubmit = companyName.trim().length > 0 && Object.keys(errors).length === 0;

  /* ── Duplicate Detection ── */
  const duplicates = useMemo<CompanyDuplicateMatch[]>(() => {
    if (!companyName && !gstNumber && !panNumber) return [];
    return findCompanyDuplicates(companies, {
      name: companyName || undefined,
      gstNumber: gstNumber || undefined,
      panNumber: panNumber || undefined,
    });
  }, [companies, companyName, gstNumber, panNumber]);

  /* ── Section Completion Status ── */
  const sectionStatus = useMemo(() => {
    const s: Record<SectionId, "empty" | "partial" | "complete" | "error"> = {
      general: "empty", communication: "empty", address: "empty",
      business: "empty", social: "empty", notes: "empty", review: "empty",
    };
    // General
    if (companyName && industry) s.general = "complete";
    else if (companyName || industry || companyType) s.general = "partial";
    if (errors.companyName) s.general = "error";
    // Communication
    if (primaryPhone || primaryEmail) s.communication = "complete";
    else if (phones.some((p) => p.number) || emails.some((e) => e.address)) s.communication = "partial";
    // Address
    if (address.city && address.addressLine1) s.address = "complete";
    else if (address.city || address.state || address.pinCode) s.address = "partial";
    // Business
    if (bizDetails.gstin || bizDetails.registrationNumber) s.business = "complete";
    else if (bizDetails.taxType || bizDetails.billingCycle) s.business = "partial";
    if (errors.gst) s.business = "error";
    // Social
    if (socialLinks.linkedin || socialLinks.facebook || socialLinks.instagram) s.social = "complete";
    else if (Object.values(socialLinks).some(Boolean)) s.social = "partial";
    // Notes
    if (notes.trim()) s.notes = "complete";
    // Review — always empty unless all others are complete
    const allDone = [s.general, s.communication, s.address, s.business].every((v) => v === "complete");
    if (allDone) s.review = "complete";
    return s;
  }, [companyName, industry, companyType, primaryPhone, primaryEmail, phones, emails, address, bizDetails, socialLinks, notes, errors]);

  /* ── Scroll Spy ── */
  useEffect(() => {
    if (!open) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id as SectionId);
          }
        }
      },
      { root: container, rootMargin: "-10% 0px -70% 0px", threshold: 0.1 }
    );
    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [open]);

  /* ── Escape to close ── */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  /* ── Handlers ── */
  const scrollTo = useCallback((id: SectionId) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const addPhone = () => {
    setPhones((p) => [...p, { id: phoneSeq, type: "Office", number: "", isPrimary: false }]);
    setPhoneSeq((s) => s + 1);
  };
  const removePhone = (id: number) => {
    setPhones((p) => {
      const next = p.filter((ph) => ph.id !== id);
      if (next.length > 0 && !next.some((ph) => ph.isPrimary)) next[0].isPrimary = true;
      return next;
    });
  };
  const updatePhone = (id: number, updates: Partial<PhoneEntry>) => {
    setPhones((p) => p.map((ph) => (ph.id === id ? { ...ph, ...updates } : ph)));
  };
  const setPrimaryPhone = (id: number) => {
    setPhones((p) => p.map((ph) => ({ ...ph, isPrimary: ph.id === id })));
  };

  const addEmail = () => {
    setEmails((e) => [...e, { id: emailSeq, type: "General", address: "", isPrimary: false }]);
    setEmailSeq((s) => s + 1);
  };
  const removeEmail = (id: number) => {
    setEmails((e) => {
      const next = e.filter((em) => em.id !== id);
      if (next.length > 0 && !next.some((em) => em.isPrimary)) next[0].isPrimary = true;
      return next;
    });
  };
  const updateEmail = (id: number, updates: Partial<EmailEntry>) => {
    setEmails((e) => e.map((em) => (em.id === id ? { ...em, ...updates } : em)));
  };
  const setPrimaryEmail = (id: number) => {
    setEmails((e) => e.map((em) => ({ ...em, isPrimary: em.id === id })));
  };

  /* ── Save Handler ── */
  const handleSave = async (draft = false) => {
    setTouched({ companyName: true, gst: true, pan: true, website: true });
    if (!canSubmit) return;
    setSaving(true);
    try {
      const company = createCompany({
        name: companyName.trim(),
        companyType: (companyType || "pvt_ltd") as Company["companyType"],
        industry,
        businessCategory,
        businessSize: (businessSize || "small") as Company["businessSize"],
        numberOfEmployees,
        annualRevenue,
        gstNumber: gstNumber.toUpperCase(),
        panNumber: panNumber.toUpperCase(),
        website,
        owner,
        branch,
        assignedEmployee,
        status: (draft ? "prospect" : status) as Company["status"],
        phones: phones.filter((p) => p.number),
        emails: emails.filter((e) => e.address),
        communicationPreferences: commPrefs,
        address,
        businessDetails: bizDetails,
        socialLinks,
        notes,
        workspace: "leads",
        createdBy: currentUser?.name ?? "",
        updatedBy: currentUser?.name ?? "",
      });
      await addCompany(company);
      setToast(draft ? "Draft saved successfully" : "Company created successfully");
      setTimeout(() => onClose(), 800);
    } catch (err) {
      console.error("Save company failed:", err);
      setToast("Failed to save company");
    } finally {
      setSaving(false);
    }
  };

  /* ── Render ── */
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
            className="fixed inset-0 z-[9998] bg-foreground/50 backdrop-blur-[3px]"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
          >
            <div
              className="flex h-[90vh] w-[95vw] max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >

              {/* ── Header ── */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-display text-lg font-bold tracking-tight">Add Company</h2>
                    <p className="text-[12px] text-muted-foreground">
                      Create a business profile linked to contacts, deals, invoices, tickets and activities.
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* ── Body: Nav + Workspace ── */}
              <div className="flex flex-1 overflow-hidden">

                {/* Left Navigation Panel */}
                <nav className="hidden w-56 shrink-0 border-r border-border bg-zinc-50/50 p-4 lg:block">
                  <div className="space-y-1">
                    {SECTIONS.map((sec) => {
                      const isActive = activeSection === sec.id;
                      const st = sectionStatus[sec.id];
                      return (
                        <button
                          key={sec.id}
                          onClick={() => scrollTo(sec.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-all duration-150",
                            isActive
                              ? "bg-[#EEF1FD] text-[#4361EE] shadow-sm"
                              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                          )}
                        >
                          <span className={cn(
                            "grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px]",
                            st === "complete" ? "bg-emerald-100 text-emerald-600" :
                            st === "error" ? "bg-red-100 text-red-500" :
                            st === "partial" ? "bg-amber-100 text-amber-600" :
                            isActive ? "bg-[#4361EE]/10 text-[#4361EE]" : "bg-zinc-200/70 text-zinc-400"
                          )}>
                            {st === "complete" ? <CheckCircle2 className="h-3 w-3" /> :
                             st === "error" ? <AlertTriangle className="h-3 w-3" /> :
                             <sec.icon className="h-3 w-3" />}
                          </span>
                          <span className="truncate">{sec.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Duplicate Warning */}
                  {duplicates.length > 0 && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Possible Duplicate
                      </p>
                      {duplicates.map((d, i) => (
                        <p key={i} className="mt-1 text-[11px] text-amber-600">
                          <span className="font-medium">{d.company.name}</span>
                          <br />
                          Matched on: {d.matchedOn}
                        </p>
                      ))}
                    </div>
                  )}
                </nav>

                {/* Main Workspace */}
                <div className="flex flex-1 overflow-hidden">
                  <div
                    ref={scrollContainerRef}
                    className="flex-1 overflow-y-auto scroll-smooth p-6 space-y-6"
                  >

                    {/* SECTION 1: General Information */}
                    <SectionCard
                      id="general"
                      title="General Information"
                      subtitle="Basic company identity and classification"
                      sectionRef={(el) => { sectionRefs.current.general = el; }}
                    >
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <Field label="Company Name" required error={errors.companyName} success={touched.companyName && !errors.companyName && !!companyName}>
                          <Input
                            value={companyName}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setCompanyName(e.target.value); setTouched((t) => ({ ...t, companyName: true })); }}
                            placeholder="e.g. TechNova Pvt Ltd"
                            iconLeft={<Building2 className="h-4 w-4" />}
                          />
                        </Field>
                        <Field label="Company Type">
                          <RSelect value={companyType} onChange={setCompanyType} options={COMPANY_TYPES} placeholder="Select type" />
                        </Field>
                        <Field label="Industry">
                          <RSelect value={industry} onChange={setIndustry} options={INDUSTRIES} placeholder="Select industry" searchable />
                        </Field>
                        <Field label="Business Category">
                          <RSelect value={businessCategory} onChange={setBusinessCategory} options={BUSINESS_CATEGORIES} placeholder="Select category" />
                        </Field>
                        <Field label="Business Size">
                          <RSelect value={businessSize} onChange={setBusinessSize} options={BUSINESS_SIZES} placeholder="Select size" />
                        </Field>
                        <Field label="Number of Employees">
                          <RSelect value={numberOfEmployees} onChange={setNumberOfEmployees} options={EMPLOYEE_RANGES} placeholder="Select range" />
                        </Field>

                        <Field label="Annual Revenue">
                          <RSelect value={annualRevenue} onChange={setAnnualRevenue} options={REVENUE_RANGES} placeholder="Select range" />
                        </Field>
                        <Field label="GST Number" error={errors.gst} hint="15-digit GSTIN">
                          <Input
                            value={gstNumber}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setGstNumber(e.target.value.toUpperCase()); setTouched((t) => ({ ...t, gst: true })); }}
                            placeholder="29AABCK1234F1ZP"
                            iconLeft={<Hash className="h-4 w-4" />}
                          />
                        </Field>
                        <Field label="PAN Number" error={errors.pan}>
                          <Input
                            value={panNumber}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPanNumber(e.target.value.toUpperCase()); setTouched((t) => ({ ...t, pan: true })); }}
                            placeholder="ABCDE1234F"
                          />
                        </Field>
                        <Field label="Website" error={errors.website}>
                          <Input
                            value={website}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setWebsite(e.target.value); setTouched((t) => ({ ...t, website: true })); }}
                            placeholder="https://example.com"
                            iconLeft={<Globe className="h-4 w-4" />}
                          />
                        </Field>
                        <Field label="Company Owner">
                          <RSelect value={owner} onChange={setOwner} options={teamOptions} placeholder="Select owner" searchable />
                        </Field>
                        <Field label="Branch">
                          <Input value={branch} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBranch(e.target.value)} placeholder="e.g. Main Branch" />
                        </Field>
                        <Field label="Assigned Employee">
                          <RSelect value={assignedEmployee} onChange={setAssignedEmployee} options={teamOptions} placeholder="Select employee" searchable />
                        </Field>
                        <Field label="Status">
                          <RSelect value={status} onChange={setStatus} options={STATUS_OPTIONS} placeholder="Select status" />
                        </Field>
                      </div>
                    </SectionCard>

                    {/* SECTION 2: Communication */}
                    <SectionCard
                      id="communication"
                      title="Communication"
                      subtitle="Phone numbers, emails and contact preferences"
                      sectionRef={(el) => { sectionRefs.current.communication = el; }}
                    >
                      {/* Phone Numbers */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[13px] font-semibold text-zinc-700">Phone Numbers</p>
                          <button onClick={addPhone} className="inline-flex items-center gap-1 text-[12px] font-medium text-[#4361EE] hover:text-[#3B54E8] transition">
                            <Plus className="h-3.5 w-3.5" /> Add Phone
                          </button>
                        </div>
                        <div className="space-y-3">
                          {phones.map((phone) => (
                            <div key={phone.id} className="flex items-center gap-2">
                              <div className="w-32">
                                <RSelect
                                  value={phone.type}
                                  onChange={(v) => updatePhone(phone.id, { type: v as PhoneEntry["type"] })}
                                  options={PHONE_TYPES}
                                  menuWidth="w-40"
                                />
                              </div>
                              <div className="flex-1">
                                <Input
                                  value={phone.number}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePhone(phone.id, { number: e.target.value })}
                                  placeholder="+91 98765 43210"
                                  iconLeft={<Phone className="h-4 w-4" />}
                                />
                              </div>
                              <button
                                onClick={() => setPrimaryPhone(phone.id)}
                                className={cn(
                                  "shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition",
                                  phone.isPrimary ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                                )}
                              >
                                {phone.isPrimary ? "Primary" : "Set Primary"}
                              </button>
                              {phones.length > 1 && (
                                <button onClick={() => removePhone(phone.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-500 transition">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Emails */}
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[13px] font-semibold text-zinc-700">Emails</p>
                          <button onClick={addEmail} className="inline-flex items-center gap-1 text-[12px] font-medium text-[#4361EE] hover:text-[#3B54E8] transition">
                            <Plus className="h-3.5 w-3.5" /> Add Email
                          </button>
                        </div>
                        <div className="space-y-3">
                          {emails.map((email) => (
                            <div key={email.id} className="flex items-center gap-2">
                              <div className="w-32">
                                <RSelect
                                  value={email.type}
                                  onChange={(v) => updateEmail(email.id, { type: v as EmailEntry["type"] })}
                                  options={EMAIL_TYPES}
                                  menuWidth="w-40"
                                />
                              </div>
                              <div className="flex-1">
                                <Input
                                  value={email.address}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateEmail(email.id, { address: e.target.value })}
                                  placeholder="info@company.com"
                                  iconLeft={<Mail className="h-4 w-4" />}
                                />
                              </div>
                              <button
                                onClick={() => setPrimaryEmail(email.id)}
                                className={cn(
                                  "shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition",
                                  email.isPrimary ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                                )}
                              >
                                {email.isPrimary ? "Primary" : "Set Primary"}
                              </button>
                              {emails.length > 1 && (
                                <button onClick={() => removeEmail(email.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-500 transition">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Communication Preferences */}
                      <div>
                        <p className="text-[13px] font-semibold text-zinc-700 mb-3">Communication Preferences</p>
                        <div className="flex flex-wrap gap-4">
                          {(["email", "phone", "whatsapp"] as const).map((ch) => (
                            <label key={ch} className="inline-flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={commPrefs[ch]}
                                onChange={(e) => setCommPrefs((p) => ({ ...p, [ch]: e.target.checked }))}
                                className="h-4 w-4 rounded border-border text-[#4361EE] focus:ring-[#4361EE]/20"
                              />
                              <span className="text-[13px] font-medium text-zinc-700 capitalize">{ch}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </SectionCard>

                    {/* SECTION 3: Business Address */}
                    <SectionCard
                      id="address"
                      title="Business Address"
                      subtitle="Primary office or registered address"
                      sectionRef={(el) => { sectionRefs.current.address = el; }}
                    >
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <Field label="Address Line 1">
                            <Input value={address.addressLine1} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, addressLine1: e.target.value }))} placeholder="Building name, street" iconLeft={<MapPin className="h-4 w-4" />} />
                          </Field>
                        </div>
                        <div className="md:col-span-2">
                          <Field label="Address Line 2">
                            <Input value={address.addressLine2} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, addressLine2: e.target.value }))} placeholder="Floor, suite, unit" />
                          </Field>
                        </div>
                        <Field label="Area / Locality">
                          <Input value={address.area} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, area: e.target.value }))} placeholder="e.g. Indiranagar" />
                        </Field>
                        <Field label="City">
                          <Input value={address.city} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, city: e.target.value }))} placeholder="e.g. Bengaluru" />
                        </Field>
                        <Field label="District">
                          <Input value={address.district} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, district: e.target.value }))} placeholder="e.g. Bangalore Urban" />
                        </Field>
                        <Field label="State">
                          <Input value={address.state} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, state: e.target.value }))} placeholder="e.g. Karnataka" />
                        </Field>
                        <Field label="Country">
                          <Input value={address.country} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, country: e.target.value }))} placeholder="India" />
                        </Field>
                        <Field label="PIN Code">
                          <Input value={address.pinCode} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, pinCode: e.target.value }))} placeholder="560038" />
                        </Field>
                        <Field label="Landmark">
                          <Input value={address.landmark} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, landmark: e.target.value }))} placeholder="Near..." />
                        </Field>
                        <Field label="Google Maps URL">
                          <Input value={address.googleMapsUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddress((a) => ({ ...a, googleMapsUrl: e.target.value }))} placeholder="https://maps.google.com/..." iconLeft={<Globe className="h-4 w-4" />} />
                        </Field>
                      </div>
                    </SectionCard>

                    {/* SECTION 4: Business Details */}
                    <SectionCard
                      id="business"
                      title="Business Details"
                      subtitle="Registration, billing and payment configuration"
                      sectionRef={(el) => { sectionRefs.current.business = el; }}
                    >
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <Field label="Business Registration Number">
                          <Input value={bizDetails.registrationNumber} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBizDetails((b) => ({ ...b, registrationNumber: e.target.value }))} placeholder="CIN / Registration No." />
                        </Field>
                        <Field label="GSTIN">
                          <Input value={bizDetails.gstin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBizDetails((b) => ({ ...b, gstin: e.target.value.toUpperCase() }))} placeholder="State-wise GSTIN" />
                        </Field>
                        <Field label="PAN">
                          <Input value={bizDetails.pan} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBizDetails((b) => ({ ...b, pan: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" />
                        </Field>
                        <Field label="Tax Type">
                          <RSelect value={bizDetails.taxType} onChange={(v) => setBizDetails((b) => ({ ...b, taxType: v }))} options={TAX_TYPES} placeholder="Select tax type" />
                        </Field>
                        <Field label="Billing Cycle">
                          <RSelect value={bizDetails.billingCycle} onChange={(v) => setBizDetails((b) => ({ ...b, billingCycle: v }))} options={BILLING_CYCLES} placeholder="Select cycle" />
                        </Field>
                        <Field label="Credit Limit">
                          <Input value={bizDetails.creditLimit ? String(bizDetails.creditLimit) : ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBizDetails((b) => ({ ...b, creditLimit: Number(e.target.value) || 0 }))} placeholder="₹0" iconLeft={<IndianRupee className="h-4 w-4" />} />
                        </Field>
                        <Field label="Payment Terms">
                          <RSelect value={bizDetails.paymentTerms} onChange={(v) => setBizDetails((b) => ({ ...b, paymentTerms: v }))} options={PAYMENT_TERMS} placeholder="Select terms" />
                        </Field>
                        <Field label="Preferred Payment Mode">
                          <RSelect value={bizDetails.preferredPaymentMode} onChange={(v) => setBizDetails((b) => ({ ...b, preferredPaymentMode: v }))} options={PAYMENT_MODES} placeholder="Select mode" />
                        </Field>
                        <Field label="Currency">
                          <Input value={bizDetails.currency} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBizDetails((b) => ({ ...b, currency: e.target.value }))} placeholder="INR" />
                        </Field>
                        <Field label="Business Since">
                          <Input type="date" value={bizDetails.businessSince} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBizDetails((b) => ({ ...b, businessSince: e.target.value }))} />
                        </Field>
                        <Field label="Annual Turnover">
                          <RSelect value={bizDetails.annualTurnover} onChange={(v) => setBizDetails((b) => ({ ...b, annualTurnover: v }))} options={TURNOVER_RANGES} placeholder="Select range" />
                        </Field>
                        <div className="md:col-span-2">
                          <Field label="Business Description" hint="Brief description of what the company does">
                            <Textarea value={bizDetails.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBizDetails((b) => ({ ...b, description: e.target.value }))} placeholder="What does this company do?" rows={3} />
                          </Field>
                        </div>
                      </div>
                    </SectionCard>

                    {/* SECTION 5: Social Links */}
                    <SectionCard
                      id="social"
                      title="Social Links"
                      subtitle="Company social media profiles (optional)"
                      sectionRef={(el) => { sectionRefs.current.social = el; }}
                    >
                      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                        <Field label="Facebook">
                          <Input value={socialLinks.facebook} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSocialLinks((s) => ({ ...s, facebook: e.target.value }))} placeholder="https://facebook.com/..." iconLeft={<Facebook className="h-4 w-4" />} />
                        </Field>
                        <Field label="Instagram">
                          <Input value={socialLinks.instagram} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSocialLinks((s) => ({ ...s, instagram: e.target.value }))} placeholder="https://instagram.com/..." iconLeft={<Instagram className="h-4 w-4" />} />
                        </Field>
                        <Field label="LinkedIn">
                          <Input value={socialLinks.linkedin} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSocialLinks((s) => ({ ...s, linkedin: e.target.value }))} placeholder="https://linkedin.com/company/..." iconLeft={<Linkedin className="h-4 w-4" />} />
                        </Field>
                        <Field label="X (Twitter)">
                          <Input value={socialLinks.twitter} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSocialLinks((s) => ({ ...s, twitter: e.target.value }))} placeholder="https://x.com/..." iconLeft={<Twitter className="h-4 w-4" />} />
                        </Field>
                        <Field label="YouTube">
                          <Input value={socialLinks.youtube} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSocialLinks((s) => ({ ...s, youtube: e.target.value }))} placeholder="https://youtube.com/@..." iconLeft={<Youtube className="h-4 w-4" />} />
                        </Field>
                        <Field label="Website">
                          <Input value={socialLinks.website} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSocialLinks((s) => ({ ...s, website: e.target.value }))} placeholder="https://..." iconLeft={<Globe className="h-4 w-4" />} />
                        </Field>
                      </div>
                    </SectionCard>

                    {/* SECTION 6: Internal Notes */}
                    <SectionCard
                      id="notes"
                      title="Internal Notes"
                      subtitle="Private notes visible only to your team"
                      sectionRef={(el) => { sectionRefs.current.notes = el; }}
                    >
                      <Textarea
                        value={notes}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                        placeholder="Add internal notes about this company... (not visible to the customer)"
                        rows={6}
                        className="min-h-[160px]"
                      />
                    </SectionCard>

                    {/* SECTION 7: Review */}
                    <SectionCard
                      id="review"
                      title="Review"
                      subtitle="Verify all information before creating the company"
                      sectionRef={(el) => { sectionRefs.current.review = el; }}
                    >
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {/* Company Summary */}
                        <div className="rounded-xl bg-zinc-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Company</p>
                          <p className="text-sm font-bold text-zinc-900">{companyName || "—"}</p>
                          <p className="text-[12px] text-muted-foreground">{COMPANY_TYPES.find((t) => t.value === companyType)?.label || "—"}</p>
                          <p className="text-[12px] text-muted-foreground">{INDUSTRIES.find((i) => i.value === industry)?.label || "—"}</p>
                        </div>
                        {/* Communication Summary */}
                        <div className="rounded-xl bg-zinc-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Communication</p>
                          <p className="text-[12px] text-zinc-700">{primaryPhone || "No phone"}</p>
                          <p className="text-[12px] text-zinc-700">{primaryEmail || "No email"}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">{phones.filter((p) => p.number).length} phone(s), {emails.filter((e) => e.address).length} email(s)</p>
                        </div>
                        {/* Address Summary */}
                        <div className="rounded-xl bg-zinc-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Address</p>
                          <p className="text-[12px] text-zinc-700">{[address.addressLine1, address.area, address.city].filter(Boolean).join(", ") || "—"}</p>
                          <p className="text-[12px] text-muted-foreground">{[address.state, address.pinCode].filter(Boolean).join(" - ")}</p>
                        </div>
                        {/* Business Summary */}
                        <div className="rounded-xl bg-zinc-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Business</p>
                          <p className="text-[12px] text-zinc-700">GST: {gstNumber || bizDetails.gstin || "—"}</p>
                          <p className="text-[12px] text-zinc-700">Payment: {PAYMENT_TERMS.find((t) => t.value === bizDetails.paymentTerms)?.label || "—"}</p>
                          <p className="text-[12px] text-zinc-700">Billing: {BILLING_CYCLES.find((b) => b.value === bizDetails.billingCycle)?.label || "—"}</p>
                        </div>
                        {/* Owner Summary */}
                        <div className="rounded-xl bg-zinc-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Owner</p>
                          <p className="text-[12px] text-zinc-700">{owner || "—"}</p>
                          <p className="text-[12px] text-muted-foreground">Branch: {branch || "—"}</p>
                          <p className="text-[12px] text-muted-foreground">Assigned: {assignedEmployee || "—"}</p>
                        </div>
                        {/* Notes Summary */}
                        <div className="rounded-xl bg-zinc-50 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Notes</p>
                          <p className="text-[12px] text-zinc-700 line-clamp-3">{notes || "No notes"}</p>
                        </div>
                      </div>
                    </SectionCard>

                  </div>

                  {/* Live Company Preview (right sticky panel) */}
                  <aside className="hidden w-72 shrink-0 border-l border-border bg-zinc-50/50 p-4 xl:block overflow-y-auto">
                    <div className="sticky top-0 space-y-4">
                      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-3">Company Preview</p>

                        <div className="flex items-center gap-3 mb-4">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
                            <Building2 className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-zinc-900 truncate">{companyName || "Company Name"}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{INDUSTRIES.find((i) => i.value === industry)?.label || "Industry"}</p>
                          </div>
                        </div>

                        <div className="space-y-2.5 text-[12px]">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Type</span>
                            <span className="font-medium text-zinc-700">{COMPANY_TYPES.find((t) => t.value === companyType)?.label || "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Size</span>
                            <span className="font-medium text-zinc-700">{BUSINESS_SIZES.find((s) => s.value === businessSize)?.label || "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Revenue</span>
                            <span className="font-medium text-zinc-700">{REVENUE_RANGES.find((r) => r.value === annualRevenue)?.label || "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Owner</span>
                            <span className="font-medium text-zinc-700 truncate ml-2">{owner || "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status</span>
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset capitalize",
                              status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                              status === "prospect" ? "bg-violet-50 text-violet-700 ring-violet-200" :
                              "bg-zinc-100 text-zinc-500 ring-zinc-200"
                            )}>
                              {status}
                            </span>
                          </div>
                        </div>

                        {/* Relationship placeholders */}
                        <div className="mt-4 pt-3 border-t border-border">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">Relationships</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-lg bg-zinc-50 p-2 text-center">
                              <p className="text-base font-bold text-zinc-300">0</p>
                              <p className="text-[9px] text-muted-foreground">Contacts</p>
                            </div>
                            <div className="rounded-lg bg-zinc-50 p-2 text-center">
                              <p className="text-base font-bold text-zinc-300">0</p>
                              <p className="text-[9px] text-muted-foreground">Deals</p>
                            </div>
                            <div className="rounded-lg bg-zinc-50 p-2 text-center">
                              <p className="text-base font-bold text-zinc-300">0</p>
                              <p className="text-[9px] text-muted-foreground">Tickets</p>
                            </div>
                            <div className="rounded-lg bg-zinc-50 p-2 text-center">
                              <p className="text-base font-bold text-zinc-300">0</p>
                              <p className="text-[9px] text-muted-foreground">Invoices</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </aside>
                </div>
              </div>

              {/* ── Sticky Footer ── */}
              <div className="flex items-center justify-between border-t border-border bg-card px-6 py-3.5">
                <div className="flex items-center gap-2">
                  {duplicates.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                      <AlertTriangle className="h-3 w-3" /> Possible duplicate found
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>
                    Cancel
                  </Button>
                  <Button variant="outline" size="md" onClick={() => handleSave(true)} disabled={saving || !companyName.trim()}>
                    Save Draft
                  </Button>
                  <Button variant="primary" size="md" onClick={() => handleSave(false)} loading={saving} disabled={!canSubmit}>
                    Create Company
                  </Button>
                </div>
              </div>

              {/* Toast notification */}
              <AnimatePresence>
                {toast && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="absolute bottom-20 left-1/2 -translate-x-1/2 rounded-xl bg-zinc-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-lg"
                    onAnimationComplete={() => setTimeout(() => setToast(null), 2000)}
                  >
                    {toast}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
