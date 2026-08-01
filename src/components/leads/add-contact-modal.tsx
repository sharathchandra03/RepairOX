"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  X, Check, AlertTriangle, Plus, Trash2,
  User, Phone, Mail, MapPin, Building2, StickyNote,
  Globe, Briefcase, Tag, Users, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import { Avatar } from "@/components/ui/avatar";
import { usePermissions } from "@/lib/permissions-context";
import { useStore } from "@/lib/store";
import { createCustomer, findDuplicates, type DuplicateMatch } from "@/lib/customer-data";

/* ─── Types ─────────────────────────────────────────────────────────── */

type PhoneType = "Mobile" | "Office" | "Home" | "WhatsApp" | "Secondary";
type PhoneEntry = { id: number; type: PhoneType; number: string; isPrimary: boolean };
type EmailEntry = { id: number; address: string; isPrimary: boolean };

export interface ContactFormData {
  firstName: string;
  lastName: string;
  displayName: string;
  leadSource: string;
  company: string;
  jobTitle: string;
  owner: string;
  status: string;
  phones: PhoneEntry[];
  emails: EmailEntry[];
  whatsappSameAsPrimary: boolean;
  whatsappNumber: string;
  address: string;
  area: string;
  city: string;
  state: string;
  country: string;
  pinCode: string;
  mapsLink: string;
  landmark: string;
  industry: string;
  businessType: string;
  gstNumber: string;
  website: string;
  customerType: string;
  notes: string;
}

const INITIAL_FORM: ContactFormData = {
  firstName: "",
  lastName: "",
  displayName: "",
  leadSource: "",
  company: "",
  jobTitle: "",
  owner: "",
  status: "active",
  phones: [{ id: 1, type: "Mobile", number: "", isPrimary: true }],
  emails: [{ id: 1, address: "", isPrimary: true }],
  whatsappSameAsPrimary: true,
  whatsappNumber: "",
  address: "",
  area: "",
  city: "",
  state: "",
  country: "India",
  pinCode: "",
  mapsLink: "",
  landmark: "",
  industry: "",
  businessType: "",
  gstNumber: "",
  website: "",
  customerType: "individual",
  notes: "",
};

/* ─── Section Nav Config ────────────────────────────────────────────── */

interface NavSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: NavSection[] = [
  { id: "basic", label: "Basic Information", icon: User },
  { id: "communication", label: "Communication", icon: Phone },
  { id: "address", label: "Address", icon: MapPin },
  { id: "business", label: "Business Details", icon: Building2 },
  { id: "notes", label: "Internal Notes", icon: StickyNote },
  { id: "review", label: "Review", icon: Eye },
];

/* ─── Select Options ────────────────────────────────────────────────── */

const LEAD_SOURCES = [
  { label: "Walk-In", value: "walk-in" },
  { label: "Referral", value: "referral" },
  { label: "Website", value: "website" },
  { label: "Social Media", value: "social-media" },
  { label: "Google Ads", value: "google-ads" },
  { label: "Cold Call", value: "cold-call" },
  { label: "Trade Show", value: "trade-show" },
  { label: "Partner", value: "partner" },
  { label: "Other", value: "other" },
];

const INDUSTRIES = [
  { label: "Electronics", value: "electronics" },
  { label: "Retail", value: "retail" },
  { label: "IT Services", value: "it-services" },
  { label: "Manufacturing", value: "manufacturing" },
  { label: "Education", value: "education" },
  { label: "Healthcare", value: "healthcare" },
  { label: "Real Estate", value: "real-estate" },
  { label: "Hospitality", value: "hospitality" },
  { label: "Other", value: "other" },
];

const CUSTOMER_TYPES = [
  { label: "Individual", value: "individual" },
  { label: "Business", value: "business" },
  { label: "Corporate", value: "corporate" },
  { label: "Dealer", value: "dealer" },
  { label: "Vendor", value: "vendor" },
];

const PHONE_TYPES: { label: string; value: PhoneType }[] = [
  { label: "Mobile", value: "Mobile" },
  { label: "Office", value: "Office" },
  { label: "Home", value: "Home" },
  { label: "WhatsApp", value: "WhatsApp" },
  { label: "Secondary", value: "Secondary" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export function AddContactModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave?: (data: ContactFormData) => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [form, setForm] = React.useState<ContactFormData>(INITIAL_FORM);
  const [activeSection, setActiveSection] = React.useState("basic");
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [phoneSeq, setPhoneSeq] = React.useState(2);
  const [emailSeq, setEmailSeq] = React.useState(2);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const sectionRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  const { currentUser, team } = usePermissions();
  const { addCustomer, customers } = useStore();

  React.useEffect(() => { setMounted(true); }, []);

  // Set default owner
  React.useEffect(() => {
    if (currentUser?.name && !form.owner) {
      setForm((f) => ({ ...f, owner: currentUser.name }));
    }
  }, [currentUser]);

  // Lock body scroll
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
      if (visible.length > 0) setActiveSection(visible[visible.length - 1].id);
    };
    container.addEventListener("scroll", handler, { passive: true });
    return () => container.removeEventListener("scroll", handler);
  }, [open]);

  // Form helpers
  const set = React.useCallback(<K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) => {
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

  // Derived values
  const fullName = React.useMemo(() => {
    if (form.displayName) return form.displayName;
    return `${form.firstName} ${form.lastName}`.trim();
  }, [form.firstName, form.lastName, form.displayName]);

  const initials = React.useMemo(() => {
    const parts = fullName.split(" ").filter(Boolean);
    return parts.map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
  }, [fullName]);

  const primaryPhone = form.phones.find((p) => p.isPrimary)?.number ?? "";
  const primaryEmail = form.emails.find((e) => e.isPrimary)?.address ?? "";

  // Duplicate detection
  const duplicates = React.useMemo<DuplicateMatch[]>(() => {
    if (!primaryPhone && !primaryEmail) return [];
    return findDuplicates(customers, {
      mobile: primaryPhone,
      email: primaryEmail || undefined,
      firstName: form.firstName || undefined,
      lastName: form.lastName || undefined,
      company: form.company || undefined,
    });
  }, [customers, primaryPhone, primaryEmail, form.firstName, form.lastName, form.company]);

  // Section completeness
  const sectionStatus = React.useMemo(() => {
    const s: Record<string, "complete" | "incomplete" | "warning"> = {};
    s.basic = form.firstName && form.lastName && form.owner ? "complete" : (form.firstName || form.lastName) ? "warning" : "incomplete";
    s.communication = primaryPhone || primaryEmail ? "complete" : "incomplete";
    s.address = form.city || form.address ? "complete" : "incomplete";
    s.business = form.company || form.gstNumber || form.industry ? "complete" : "incomplete";
    s.notes = form.notes ? "complete" : "incomplete";
    s.review = "incomplete";
    return s;
  }, [form, primaryPhone, primaryEmail]);

  // Validation
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = "First name is required";
    if (!form.lastName.trim()) errs.lastName = "Last name is required";
    if (primaryEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryEmail)) errs.email = "Invalid email format";
    if (form.gstNumber && !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[Z]{1}[A-Z\d]{1}$/.test(form.gstNumber)) errs.gstNumber = "Invalid GST format";
    setErrors(errs);
    if (Object.keys(errs).length > 0) { scrollToSection("basic"); return false; }
    return true;
  };

  // Save handler
  const handleCreate = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const customer = createCustomer({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        mobile: primaryPhone,
        email: primaryEmail,
        company: form.company,
        gstNumber: form.gstNumber,
        address: [form.address, form.area, form.landmark].filter(Boolean).join(", "),
        city: form.city,
        state: form.state,
        postalCode: form.pinCode,
        type: form.customerType === "individual" ? "personal" : "business",
        notes: [
          form.notes,
          form.jobTitle ? `Job Title: ${form.jobTitle}` : "",
          form.industry ? `Industry: ${form.industry}` : "",
          form.website ? `Website: ${form.website}` : "",
          form.leadSource ? `Lead Source: ${form.leadSource}` : "",
          form.mapsLink ? `Maps: ${form.mapsLink}` : "",
          form.owner ? `Owner: ${form.owner}` : "",
          form.phones.length > 1 ? `Phones: ${form.phones.map((p) => `${p.type}: ${p.number}`).join(", ")}` : "",
          form.emails.length > 1 ? `Emails: ${form.emails.map((e) => e.address).filter(Boolean).join(", ")}` : "",
        ].filter(Boolean).join("\n"),
      });
      await addCustomer(customer);
      onSave?.(form);
      onClose();
      setForm(INITIAL_FORM);
    } catch (err) {
      console.error("Failed to create contact:", err);
    } finally {
      setSaving(false);
    }
  };

  // Phone/Email handlers
  const addPhone = () => {
    set("phones", [...form.phones, { id: phoneSeq, type: "Mobile", number: "", isPrimary: false }]);
    setPhoneSeq((s) => s + 1);
  };
  const removePhone = (id: number) => {
    const next = form.phones.filter((ph) => ph.id !== id);
    if (next.length > 0 && !next.some((ph) => ph.isPrimary)) next[0].isPrimary = true;
    set("phones", next);
  };
  const updatePhone = (id: number, updates: Partial<PhoneEntry>) => {
    set("phones", form.phones.map((ph) => ph.id === id ? { ...ph, ...updates } : ph));
  };
  const setPrimaryPhone = (id: number) => {
    set("phones", form.phones.map((ph) => ({ ...ph, isPrimary: ph.id === id })));
  };
  const addEmail = () => {
    set("emails", [...form.emails, { id: emailSeq, address: "", isPrimary: false }]);
    setEmailSeq((s) => s + 1);
  };
  const removeEmail = (id: number) => {
    const next = form.emails.filter((em) => em.id !== id);
    if (next.length > 0 && !next.some((em) => em.isPrimary)) next[0].isPrimary = true;
    set("emails", next);
  };
  const updateEmail = (id: number, address: string) => {
    set("emails", form.emails.map((em) => em.id === id ? { ...em, address } : em));
  };
  const setPrimaryEmail = (id: number) => {
    set("emails", form.emails.map((em) => ({ ...em, isPrimary: em.id === id })));
  };

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
                  <h2 className="font-display text-xl font-bold tracking-tight">Add Contact</h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Create a new contact linked to your CRM pipeline.
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
                        <SectionBasic form={form} set={set} errors={errors} team={team} />
                      </div>

                      {/* Section 2: Communication */}
                      <div ref={(el) => { sectionRefs.current.communication = el; }}>
                        <SectionCommunication
                          form={form} set={set} errors={errors}
                          addPhone={addPhone} removePhone={removePhone}
                          updatePhone={updatePhone} setPrimaryPhone={setPrimaryPhone}
                          addEmail={addEmail} removeEmail={removeEmail}
                          updateEmail={updateEmail} setPrimaryEmail={setPrimaryEmail}
                        />
                      </div>

                      {/* Section 3: Address */}
                      <div ref={(el) => { sectionRefs.current.address = el; }}>
                        <SectionAddress form={form} set={set} />
                      </div>

                      {/* Section 4: Business Details */}
                      <div ref={(el) => { sectionRefs.current.business = el; }}>
                        <SectionBusiness form={form} set={set} errors={errors} />
                      </div>

                      {/* Section 5: Internal Notes */}
                      <div ref={(el) => { sectionRefs.current.notes = el; }}>
                        <SectionNotes form={form} set={set} />
                      </div>

                      {/* Section 6: Review */}
                      <div ref={(el) => { sectionRefs.current.review = el; }}>
                        <SectionReview form={form} fullName={fullName} initials={initials} primaryPhone={primaryPhone} primaryEmail={primaryEmail} />
                      </div>

                      <div className="h-8" />
                    </div>
                  </div>

                  {/* Right Summary Card */}
                  <aside className="hidden w-[280px] shrink-0 border-l border-border bg-[#FAFBFF] p-5 xl:block overflow-y-auto">
                    <ContactSummaryCard form={form} fullName={fullName} initials={initials} primaryPhone={primaryPhone} primaryEmail={primaryEmail} duplicates={duplicates} />
                  </aside>
                </div>
              </div>

              {/* ─── Sticky Footer ─── */}
              <div className="flex items-center justify-between border-t border-border bg-card px-6 py-3.5">
                <div>
                  {duplicates.length > 0 && (
                    <p className="flex items-center gap-1.5 text-[12px] text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Possible duplicate found &mdash; {duplicates[0].matchedOn}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  <Button variant="ghost" size="md" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button variant="outline" size="md" onClick={() => { /* save draft */ }}>
                    Save Draft
                  </Button>
                  <Button size="md" loading={saving} onClick={handleCreate}>
                    Save Contact
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

type TeamMember = { name: string; status: string };

/* ─── Section 1: Basic Information ──────────────────────────────────── */

function SectionBasic({
  form, set, errors, team,
}: {
  form: ContactFormData;
  set: <K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) => void;
  errors: Record<string, string>;
  team: TeamMember[];
}) {
  const ownerOptions = team.filter((m) => m.status === "active").map((m) => ({ label: m.name, value: m.name }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
            <User className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>Core identity details for this contact.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>First Name <span className="text-rose-500">*</span></Label>
            <Input
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              placeholder="Enter first name"
              className={cn("h-11", errors.firstName && "border-rose-400 focus:ring-rose-200")}
            />
            {errors.firstName && <p className="text-[11px] text-rose-500">{errors.firstName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Last Name <span className="text-rose-500">*</span></Label>
            <Input
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              placeholder="Enter last name"
              className={cn("h-11", errors.lastName && "border-rose-400 focus:ring-rose-200")}
            />
            {errors.lastName && <p className="text-[11px] text-rose-500">{errors.lastName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Display Name</Label>
            <Input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="Auto-generated if blank" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Lead Source</Label>
            <RSelect value={form.leadSource} onChange={(v) => set("leadSource", v)} options={LEAD_SOURCES} placeholder="Select source" />
          </div>
          <div className="space-y-1.5">
            <Label>Company Name</Label>
            <Input value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Company or organization" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Job Title</Label>
            <Input value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} placeholder="e.g. CEO, Manager" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Owner</Label>
            <RSelect value={form.owner} onChange={(v) => set("owner", v)} options={ownerOptions} placeholder="Assign owner" searchable />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <RSelect value={form.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} placeholder="Select status" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Section 2: Communication ──────────────────────────────────────── */

function SectionCommunication({
  form, set, errors,
  addPhone, removePhone, updatePhone, setPrimaryPhone,
  addEmail, removeEmail, updateEmail, setPrimaryEmail,
}: {
  form: ContactFormData;
  set: <K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) => void;
  errors: Record<string, string>;
  addPhone: () => void;
  removePhone: (id: number) => void;
  updatePhone: (id: number, updates: Partial<PhoneEntry>) => void;
  setPrimaryPhone: (id: number) => void;
  addEmail: () => void;
  removeEmail: (id: number) => void;
  updateEmail: (id: number, address: string) => void;
  setPrimaryEmail: (id: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
            <Phone className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle>Communication</CardTitle>
            <CardDescription>Phone numbers, email addresses, and WhatsApp.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Phone Numbers */}
        <div className="space-y-3">
          <Label className="text-[13px] font-semibold text-foreground">Phone Numbers</Label>
          {form.phones.map((ph) => (
            <div key={ph.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPrimaryPhone(ph.id)}
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition",
                  ph.isPrimary ? "border-[#4361EE] bg-[#4361EE]" : "border-zinc-300 hover:border-zinc-400"
                )}
              >
                {ph.isPrimary && <span className="h-2 w-2 rounded-full bg-white" />}
              </button>
              <div className="w-28 shrink-0">
                <RSelect
                  value={ph.type}
                  onChange={(v) => updatePhone(ph.id, { type: v as PhoneType })}
                  options={PHONE_TYPES}
                  placeholder="Type"
                />
              </div>
              <div className="flex-1">
                <Input
                  value={ph.number}
                  onChange={(e) => updatePhone(ph.id, { number: e.target.value })}
                  placeholder="+91 99999 99999"
                  className="h-11"
                />
              </div>
              {form.phones.length > 1 && (
                <button type="button" onClick={() => removePhone(ph.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addPhone} className="flex items-center gap-1.5 text-[12px] font-medium text-[#4361EE] transition hover:text-[#3347D6]">
            <Plus className="h-3.5 w-3.5" /> Add Phone
          </button>
        </div>

        <div className="my-5 h-px bg-border" />

        {/* Email Addresses */}
        <div className="space-y-3">
          <Label className="text-[13px] font-semibold text-foreground">Email Addresses</Label>
          {form.emails.map((em) => (
            <div key={em.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPrimaryEmail(em.id)}
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition",
                  em.isPrimary ? "border-[#4361EE] bg-[#4361EE]" : "border-zinc-300 hover:border-zinc-400"
                )}
              >
                {em.isPrimary && <span className="h-2 w-2 rounded-full bg-white" />}
              </button>
              <div className="flex-1">
                <Input
                  type="email"
                  value={em.address}
                  onChange={(e) => updateEmail(em.id, e.target.value)}
                  placeholder="email@example.com"
                  className="h-11"
                />
              </div>
              {form.emails.length > 1 && (
                <button type="button" onClick={() => removeEmail(em.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {errors.email && <p className="text-[11px] text-rose-500">{errors.email}</p>}
          <button type="button" onClick={addEmail} className="flex items-center gap-1.5 text-[12px] font-medium text-[#4361EE] transition hover:text-[#3347D6]">
            <Plus className="h-3.5 w-3.5" /> Add Email
          </button>
        </div>

        <div className="my-5 h-px bg-border" />

        {/* WhatsApp */}
        <div className="space-y-2">
          <Label className="text-[13px] font-semibold text-foreground">WhatsApp</Label>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={form.whatsappSameAsPrimary}
              onChange={(e) => set("whatsappSameAsPrimary", e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]"
            />
            <span className="text-zinc-600">Same as primary phone number</span>
          </label>
          {!form.whatsappSameAsPrimary && (
            <Input value={form.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value)} placeholder="+91 99999 99999" className="h-11" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Section 3: Address ────────────────────────────────────────────── */

function SectionAddress({
  form, set,
}: {
  form: ContactFormData;
  set: <K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
            <MapPin className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle>Address</CardTitle>
            <CardDescription>Physical location and mapping details.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address Line</Label>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street address" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Area / Locality</Label>
            <Input value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="Neighbourhood or area" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="City" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>State</Label>
            <Input value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="State / Province" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Country</Label>
            <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="Country" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>PIN Code</Label>
            <Input value={form.pinCode} onChange={(e) => set("pinCode", e.target.value)} placeholder="560001" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Landmark</Label>
            <Input value={form.landmark} onChange={(e) => set("landmark", e.target.value)} placeholder="Near..." className="h-11" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Google Maps Link</Label>
            <Input value={form.mapsLink} onChange={(e) => set("mapsLink", e.target.value)} placeholder="https://maps.google.com/..." className="h-11" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Section 4: Business Details ───────────────────────────────────── */

function SectionBusiness({
  form, set, errors,
}: {
  form: ContactFormData;
  set: <K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
            <Building2 className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle>Business Details</CardTitle>
            <CardDescription>Organization and financial identifiers.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Industry</Label>
            <RSelect value={form.industry} onChange={(v) => set("industry", v)} options={INDUSTRIES} placeholder="Select industry" />
          </div>
          <div className="space-y-1.5">
            <Label>Business Type</Label>
            <Input value={form.businessType} onChange={(e) => set("businessType", e.target.value)} placeholder="e.g. Partnership, Sole Prop" className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>GST Number</Label>
            <Input
              value={form.gstNumber}
              onChange={(e) => set("gstNumber", e.target.value.toUpperCase())}
              placeholder="29AABCK1234F1ZP"
              className={cn("h-11 font-mono uppercase", errors.gstNumber && "border-rose-400 focus:ring-rose-200")}
            />
            {errors.gstNumber && <p className="text-[11px] text-rose-500">{errors.gstNumber}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://..." className="h-11" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Customer Type</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {CUSTOMER_TYPES.map((ct) => (
                <button
                  key={ct.value}
                  type="button"
                  onClick={() => set("customerType", ct.value)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[12px] font-medium border transition",
                    form.customerType === ct.value
                      ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]"
                      : "border-border text-zinc-500 hover:border-zinc-300 hover:bg-muted"
                  )}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Section 5: Internal Notes ─────────────────────────────────────── */

function SectionNotes({
  form, set,
}: {
  form: ContactFormData;
  set: <K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
            <StickyNote className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle>Internal Notes</CardTitle>
            <CardDescription>Private notes visible only to your team.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Add internal notes about this contact..."
          className="min-h-[120px]"
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Not shared with the contact. Visible only to team members.
        </p>
      </CardContent>
    </Card>
  );
}

/* ─── Section 6: Review ─────────────────────────────────────────────── */

function SectionReview({
  form, fullName, initials, primaryPhone, primaryEmail,
}: {
  form: ContactFormData;
  fullName: string;
  initials: string;
  primaryPhone: string;
  primaryEmail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
            <Eye className="h-4.5 w-4.5" />
          </span>
          <div>
            <CardTitle>Review</CardTitle>
            <CardDescription>Verify the details before saving this contact.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border border-border bg-muted/30 p-5">
          <div className="flex items-center gap-3 mb-4">
            <Avatar name={fullName || "New"} size={44} />
            <div>
              <p className="font-semibold text-foreground">{fullName || "—"}</p>
              {form.jobTitle && <p className="text-[12px] text-muted-foreground">{form.jobTitle}{form.company ? ` at ${form.company}` : ""}</p>}
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
            {primaryPhone && <ReviewRow label="Phone" value={primaryPhone} />}
            {primaryEmail && <ReviewRow label="Email" value={primaryEmail} />}
            {form.city && <ReviewRow label="City" value={`${form.city}${form.state ? `, ${form.state}` : ""}`} />}
            {form.company && <ReviewRow label="Company" value={form.company} />}
            {form.customerType && <ReviewRow label="Type" value={form.customerType} />}
            {form.leadSource && <ReviewRow label="Source" value={form.leadSource.replace("-", " ")} />}
            {form.owner && <ReviewRow label="Owner" value={form.owner} />}
            {form.gstNumber && <ReviewRow label="GST" value={form.gstNumber} />}
          </dl>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground capitalize">{value}</dd>
    </div>
  );
}

/* ─── Right Summary Card ────────────────────────────────────────────── */

function ContactSummaryCard({
  form, fullName, initials, primaryPhone, primaryEmail, duplicates,
}: {
  form: ContactFormData;
  fullName: string;
  initials: string;
  primaryPhone: string;
  primaryEmail: string;
  duplicates: DuplicateMatch[];
}) {
  return (
    <div className="space-y-4">
      {/* Contact Preview */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Contact Preview
        </p>
        <div className="flex items-center gap-3">
          <Avatar name={fullName || "New Contact"} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{fullName || "New Contact"}</p>
            {form.jobTitle && <p className="truncate text-[11px] text-muted-foreground">{form.jobTitle}</p>}
          </div>
        </div>

        {form.company && (
          <div className="mt-3 flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 w-fit">
            <Building2 className="h-3 w-3 text-zinc-400" />
            <span className="text-[11px] font-medium text-zinc-600">{form.company}</span>
          </div>
        )}

        <dl className="mt-4 space-y-2 text-[12px]">
          {primaryPhone && (
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3 w-3" /> Mobile</dt>
              <dd className="font-medium">{primaryPhone}</dd>
            </div>
          )}
          {primaryEmail && (
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-muted-foreground"><Mail className="h-3 w-3" /> Email</dt>
              <dd className="truncate max-w-[130px] font-medium">{primaryEmail}</dd>
            </div>
          )}
          {form.city && (
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="h-3 w-3" /> Location</dt>
              <dd className="font-medium">{form.city}{form.state ? `, ${form.state}` : ""}</dd>
            </div>
          )}
          {form.leadSource && (
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-muted-foreground"><Tag className="h-3 w-3" /> Source</dt>
              <dd className="font-medium capitalize">{form.leadSource.replace("-", " ")}</dd>
            </div>
          )}
          {form.owner && (
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-1.5 text-muted-foreground"><Users className="h-3 w-3" /> Owner</dt>
              <dd className="font-medium">{form.owner}</dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                form.status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-zinc-100 text-zinc-600 ring-zinc-200"
              )}>
                {form.status === "active" ? "Active" : "Inactive"}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Initials */}
      {fullName && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#EEF1FD] font-display text-sm font-bold text-[#4361EE]">
            {initials}
          </span>
          <div>
            <p className="text-[11px] text-muted-foreground">Initials</p>
            <p className="text-[13px] font-semibold">{initials}</p>
          </div>
        </div>
      )}

      {/* Duplicate warning */}
      {duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-1.5 text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            <p className="text-[12px] font-semibold">Existing Contact Found</p>
          </div>
          {duplicates.slice(0, 2).map((d) => (
            <p key={d.customer.id} className="mt-1 text-[11px] text-amber-700">
              {d.customer.fullName} — matched on {d.matchedOn}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
