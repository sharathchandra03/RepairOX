"use client";

import { useState, useRef, useEffect } from "react";
import {
  Building2, Phone, MapPin, FileText, Globe, Clock, Upload, X, Printer,
} from "lucide-react";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { useStoreSettings, type StoreSettings } from "@/lib/store-settings";

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={`space-y-1.5 ${span ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export default function StoreSettingsPage() {
  const { settings, updateSettings, resetSettings, hydrated } = useStoreSettings();
  const [draft, setDraft] = useState<StoreSettings>(settings);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (hydrated) setDraft(settings);
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key: keyof StoreSettings, value: any) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    updateSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) { alert("Logo must be under 500KB"); return; }
    const reader = new FileReader();
    reader.onloadend = () => set("logo", reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <SettingsPage
      breadcrumbs={[{ label: "Store", href: "/settings/store" }, { label: "Store Information" }]}
      title="Store Information"
      description="Your business identity. This information is displayed on all printed documents and communications."
      onSave={handleSave}
      saving={saved}
    >
      {/* Basic Information */}
      <SettingsSection title="Basic Information" description="Logo, business name and branding" icon={Building2}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Store Logo</Label>
            <div className="mt-1.5 flex items-center gap-4">
              {draft.logo ? (
                <div className="relative">
                  <img src={draft.logo} alt="Logo" className="h-14 w-14 rounded-xl object-contain border border-border bg-muted p-1" />
                  <button onClick={() => set("logo", "")} className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white text-[10px]">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="grid h-14 w-14 place-items-center rounded-xl border-2 border-dashed border-border bg-muted text-muted-foreground">
                  <Upload className="h-5 w-5" />
                </div>
              )}
              <div>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" /> Upload
                </Button>
                <p className="mt-1 text-[10px] text-muted-foreground">PNG, JPG under 500KB</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          </div>
          <Field label="Store Name">
            <Input value={draft.storeName} onChange={(e) => set("storeName", e.target.value)} placeholder="Your Store Name" />
          </Field>
          <Field label="Alternate Name">
            <Input value={draft.alternateName} onChange={(e) => set("alternateName", e.target.value)} placeholder="DBA or trading name" />
          </Field>
        </div>
      </SettingsSection>

      {/* Contact Information */}
      <SettingsSection title="Contact Information" description="Phone, email and web presence" icon={Phone}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Phone">
            <Input value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 ..." />
          </Field>
          <Field label="Mobile">
            <Input value={draft.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+91 ..." />
          </Field>
          <Field label="Email">
            <Input value={draft.email} onChange={(e) => set("email", e.target.value)} placeholder="store@example.com" type="email" />
          </Field>
          <Field label="Website">
            <Input value={draft.website} onChange={(e) => set("website", e.target.value)} placeholder="www.example.com" />
          </Field>
        </div>
      </SettingsSection>

      {/* Store Location */}
      <SettingsSection title="Store Location" description="Physical address for invoices and receipts" icon={MapPin}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Address" span>
            <Input value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="Street address" />
          </Field>
          <Field label="City">
            <Input value={draft.city} onChange={(e) => set("city", e.target.value)} placeholder="City" />
          </Field>
          <Field label="State">
            <Input value={draft.state} onChange={(e) => set("state", e.target.value)} placeholder="State / Province" />
          </Field>
          <Field label="Post Code">
            <Input value={draft.postCode} onChange={(e) => set("postCode", e.target.value)} placeholder="Pin code" />
          </Field>
          <Field label="Country">
            <Input value={draft.country} onChange={(e) => set("country", e.target.value)} placeholder="Country" />
          </Field>
        </div>
      </SettingsSection>

      {/* Business Information */}
      <SettingsSection title="Business Information" description="Registration, currency and timezone" icon={FileText}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="GSTIN / Registration Number" span>
            <Input value={draft.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} placeholder="29AABCU9603R1ZP" />
          </Field>
          <Field label="Currency">
            <Select value={draft.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value)} options={[
              { label: "INR (₹)", value: "INR" }, { label: "USD ($)", value: "USD" }, { label: "GBP (£)", value: "GBP" }, { label: "EUR (€)", value: "EUR" }, { label: "AED (د.إ)", value: "AED" },
            ]} />
          </Field>
          <Field label="Language">
            <Select value={draft.language} onChange={(e) => set("language", e.target.value)} options={[
              { label: "English", value: "English" }, { label: "Hindi", value: "Hindi" }, { label: "Tamil", value: "Tamil" }, { label: "Kannada", value: "Kannada" },
            ]} />
          </Field>
          <Field label="Time Zone">
            <Select value={draft.timeZone} onChange={(e) => set("timeZone", e.target.value)} options={[
              { label: "Asia/Kolkata (IST)", value: "Asia/Kolkata" }, { label: "Asia/Dubai (GST)", value: "Asia/Dubai" }, { label: "America/New_York (EST)", value: "America/New_York" }, { label: "Europe/London (GMT)", value: "Europe/London" },
            ]} />
          </Field>
          <Field label="Start Time">
            <Input type="time" value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} />
          </Field>
          <Field label="End Time">
            <Input type="time" value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} />
          </Field>
        </div>
      </SettingsSection>

      {/* Printing Defaults */}
      <SettingsSection title="Printing Defaults" description="Templates, terms and warranty for printed documents" icon={Printer}>
        <div className="grid grid-cols-1 gap-4">
          <Field label="Print Footer" span>
            <Input value={draft.printFooter} onChange={(e) => set("printFooter", e.target.value)} placeholder="Thank you message" />
          </Field>
          <Field label="Print Slogan" span>
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
    </SettingsPage>
  );
}
