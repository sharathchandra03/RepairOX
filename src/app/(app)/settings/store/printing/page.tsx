"use client";

import { useState, useEffect } from "react";
import { Ticket, Receipt, Building2, Info, Plus, Trash2, LayoutTemplate } from "lucide-react";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { useStoreSettings, type StoreSettings, type CustomPrintTemplate } from "@/lib/store-settings";

/**
 * Settings → Store → Printing
 *
 * Single place to manage ALL print-document text:
 *   • Store (Master Default) → the house-style terms/warranty/footer/slogan that
 *     custom document types inherit from.
 *   • Ticket   → Terms & Notes printed on Ticket documents (independent).
 *   • Invoice  → Terms & Notes printed on Invoice documents (independent).
 *   • Custom Print Templates → user-defined templates for FUTURE document types
 *     (quotation, estimate, delivery note…). Each inherits the Master Default
 *     unless it overrides a field.
 *
 * Ticket & Invoice remain fully independent and never read the Master Default.
 */

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={`space-y-1.5 ${span ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/* Slugify a template name into a stable machine key. */
function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function newTemplate(): CustomPrintTemplate {
  return {
    id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    slug: "",
    inheritFromStore: true,
    terms: "",
    warrantyText: "",
    footer: "",
    slogan: "",
  };
}

export default function PrintingSettingsPage() {
  const { settings, updateSettings, hydrated } = useStoreSettings();
  const [draft, setDraft] = useState<StoreSettings>(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (hydrated) setDraft(settings);
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof StoreSettings, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  /* ── Custom template helpers ── */
  const templates = draft.customPrintTemplates ?? [];

  const updateTemplate = (id: string, patch: Partial<CustomPrintTemplate>) => {
    setDraft((prev) => ({
      ...prev,
      customPrintTemplates: (prev.customPrintTemplates ?? []).map((t) =>
        t.id === id ? { ...t, ...patch } : t,
      ),
    }));
  };

  const addTemplate = () => {
    setDraft((prev) => ({
      ...prev,
      customPrintTemplates: [...(prev.customPrintTemplates ?? []), newTemplate()],
    }));
  };

  const removeTemplate = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      customPrintTemplates: (prev.customPrintTemplates ?? []).filter((t) => t.id !== id),
    }));
  };

  const handleSave = () => {
    setSaving(true);
    // Ensure every template has a slug derived from its name before saving.
    const normalizedTemplates = templates.map((t) => ({
      ...t,
      slug: t.slug?.trim() ? t.slug : slugify(t.name),
    }));
    updateSettings({
      // Store master default
      printFooter: draft.printFooter,
      printSlogan: draft.printSlogan,
      termsAndConditions: draft.termsAndConditions,
      warrantyText: draft.warrantyText,
      // Custom templates
      customPrintTemplates: normalizedTemplates,
      // Ticket print Terms & Notes (independent)
      ticketTerms: draft.ticketTerms,
      ticketWarrantyText: draft.ticketWarrantyText,
      ticketFooter: draft.ticketFooter,
      // Invoice print Terms & Notes (independent)
      invoiceTerms: draft.invoiceTerms,
      invoiceWarrantyText: draft.invoiceWarrantyText,
      invoiceFooter: draft.invoiceFooter,
      invoiceSlogan: draft.invoiceSlogan,
    });
    setTimeout(() => setSaving(false), 600);
  };

  return (
    <SettingsPage
      breadcrumbs={[{ label: "Store", href: "/settings/store" }, { label: "Printing" }]}
      title="Printing"
      description="All print-document text in one place. Ticket and Invoice terms are independent; the Master Default feeds custom document types."
      onSave={handleSave}
      saving={saving}
    >
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[12.5px] text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Ticket and Invoice prints are independent. Custom templates inherit the Master Default.</p>
      </div>

      {/* ── STORE MASTER DEFAULT ── */}
      <SettingsSection
        title="Master Default (Store)"
        description="House-style terms, warranty, footer and slogan. Custom Print Templates inherit these unless they override a field. Tickets and invoices do NOT use this."
        icon={Building2}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Print Footer">
            <Input value={draft.printFooter} onChange={(e) => set("printFooter", e.target.value)} placeholder="Thank you message" />
          </Field>
          <Field label="Print Slogan">
            <Input value={draft.printSlogan} onChange={(e) => set("printSlogan", e.target.value)} placeholder="Short brand tagline" />
          </Field>
          <Field label="Terms & Conditions" span>
            <Textarea value={draft.termsAndConditions} onChange={(e) => set("termsAndConditions", e.target.value)} rows={4} className="min-h-0 font-mono text-xs" />
          </Field>
          <Field label="Warranty Text" span>
            <Textarea value={draft.warrantyText} onChange={(e) => set("warrantyText", e.target.value)} rows={5} className="min-h-0 font-mono text-xs" />
          </Field>
        </div>
      </SettingsSection>

      {/* ── TICKET TERMS & NOTES ── */}
      <SettingsSection
        title="Ticket Terms & Notes"
        description="Terms, warranty and footer printed on Ticket documents (A4 & thermal). Independent of the Master Default."
        icon={Ticket}
      >
        <div className="grid grid-cols-1 gap-4">
          <Field label="Terms & Conditions" span>
            <Textarea
              value={draft.ticketTerms}
              onChange={(e) => set("ticketTerms", e.target.value)}
              rows={6}
              className="min-h-0 font-mono text-xs"
              placeholder="Terms & conditions that appear on ticket documents…"
            />
          </Field>
          <Field label="Warranty Text" span>
            <Textarea
              value={draft.ticketWarrantyText}
              onChange={(e) => set("ticketWarrantyText", e.target.value)}
              rows={6}
              className="min-h-0 font-mono text-xs"
              placeholder="Warranty details that appear on ticket documents…"
            />
          </Field>
          <Field label="Footer" span>
            <Input value={draft.ticketFooter} onChange={(e) => set("ticketFooter", e.target.value)} placeholder="Thank you for choosing RepairOX!" />
          </Field>
        </div>
      </SettingsSection>

      {/* ── INVOICE TERMS & NOTES ── */}
      <SettingsSection
        title="Invoice Terms & Notes"
        description="Terms, warranty, footer and slogan printed on Invoice documents. Independent of the Master Default. Terms/footer/slogan seed each new invoice and can be overridden per invoice."
        icon={Receipt}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Terms & Conditions" span>
            <Textarea
              value={draft.invoiceTerms}
              onChange={(e) => set("invoiceTerms", e.target.value)}
              rows={5}
              className="min-h-0 font-mono text-xs"
              placeholder="Terms & conditions that appear on invoice documents…"
            />
          </Field>
          <Field label="Warranty Text" span>
            <Textarea
              value={draft.invoiceWarrantyText}
              onChange={(e) => set("invoiceWarrantyText", e.target.value)}
              rows={5}
              className="min-h-0 font-mono text-xs"
              placeholder="Warranty details that appear on invoice documents…"
            />
          </Field>
          <Field label="Footer">
            <Input value={draft.invoiceFooter} onChange={(e) => set("invoiceFooter", e.target.value)} placeholder="THANK YOU FOR CHOOSING…" />
          </Field>
          <Field label="Slogan">
            <Input value={draft.invoiceSlogan} onChange={(e) => set("invoiceSlogan", e.target.value)} placeholder="Your invoice slogan" />
          </Field>
        </div>
      </SettingsSection>

      {/* ── CUSTOM PRINT TEMPLATES ── */}
      <SettingsSection
        title="Custom Print Templates"
        description="Reusable templates for future document types (quotation, estimate, delivery note…). Each inherits the Master Default unless it overrides a field."
        icon={LayoutTemplate}
      >
        <div className="space-y-4">
          {templates.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-[13px] text-muted-foreground">
              No custom templates yet. Add one to prepare a print style for a new document type.
            </div>
          )}

          {templates.map((tpl) => {
            const inheritedHint = (val: string, master: string) =>
              tpl.inheritFromStore && !val.trim()
                ? master.trim()
                  ? "Inheriting Master Default"
                  : "Master Default is empty"
                : undefined;

            return (
              <div key={tpl.id} className="rounded-xl border border-border bg-card p-4 space-y-4">
                {/* Header row: name + delete */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label>Template Name</Label>
                    <Input
                      value={tpl.name}
                      onChange={(e) => updateTemplate(tpl.id, { name: e.target.value, slug: slugify(e.target.value) })}
                      placeholder="e.g. Quotation, Estimate, Delivery Note"
                    />
                    {tpl.name.trim() && (
                      <p className="text-[11px] text-muted-foreground font-mono">key: {tpl.slug || slugify(tpl.name)}</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeTemplate(tpl.id)}
                    className="mt-6 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-rose-500 transition hover:bg-rose-50"
                    title="Remove template"
                    aria-label="Remove template"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Inherit toggle */}
                <label className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tpl.inheritFromStore}
                    onChange={(e) => updateTemplate(tpl.id, { inheritFromStore: e.target.checked })}
                    className="h-4 w-4 accent-[#4361EE]"
                  />
                  <span className="text-[12.5px]">
                    Inherit from Master Default — leave a field blank below to use the store house style.
                  </span>
                </label>

                {/* Override fields */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label>Terms & Conditions</Label>
                      {inheritedHint(tpl.terms, draft.termsAndConditions) && (
                        <span className="text-[10.5px] text-[#4361EE]">{inheritedHint(tpl.terms, draft.termsAndConditions)}</span>
                      )}
                    </div>
                    <Textarea
                      value={tpl.terms}
                      onChange={(e) => updateTemplate(tpl.id, { terms: e.target.value })}
                      rows={4}
                      className="min-h-0 font-mono text-xs"
                      placeholder={tpl.inheritFromStore ? "Blank = use Master Default terms" : "Terms for this template…"}
                    />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <div className="flex items-center justify-between">
                      <Label>Warranty Text</Label>
                      {inheritedHint(tpl.warrantyText, draft.warrantyText) && (
                        <span className="text-[10.5px] text-[#4361EE]">{inheritedHint(tpl.warrantyText, draft.warrantyText)}</span>
                      )}
                    </div>
                    <Textarea
                      value={tpl.warrantyText}
                      onChange={(e) => updateTemplate(tpl.id, { warrantyText: e.target.value })}
                      rows={4}
                      className="min-h-0 font-mono text-xs"
                      placeholder={tpl.inheritFromStore ? "Blank = use Master Default warranty" : "Warranty for this template…"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Footer</Label>
                      {inheritedHint(tpl.footer, draft.printFooter) && (
                        <span className="text-[10.5px] text-[#4361EE]">{inheritedHint(tpl.footer, draft.printFooter)}</span>
                      )}
                    </div>
                    <Input
                      value={tpl.footer}
                      onChange={(e) => updateTemplate(tpl.id, { footer: e.target.value })}
                      placeholder={tpl.inheritFromStore ? "Blank = Master Default" : "Footer…"}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Slogan</Label>
                      {inheritedHint(tpl.slogan, draft.printSlogan) && (
                        <span className="text-[10.5px] text-[#4361EE]">{inheritedHint(tpl.slogan, draft.printSlogan)}</span>
                      )}
                    </div>
                    <Input
                      value={tpl.slogan}
                      onChange={(e) => updateTemplate(tpl.id, { slogan: e.target.value })}
                      placeholder={tpl.inheritFromStore ? "Blank = Master Default" : "Slogan…"}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <Button variant="outline" size="sm" onClick={addTemplate}>
            <Plus className="h-3.5 w-3.5" /> Add Print Template
          </Button>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
