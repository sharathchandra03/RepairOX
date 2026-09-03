"use client";

import { useState, useCallback } from "react";
import { Hash, Info } from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { Input, Label } from "@/components/ui/input";
import { useStoreSettings, type InvoiceNumberingConfig } from "@/lib/store-settings";
import { cn } from "@/lib/utils";

function preview(cfg: InvoiceNumberingConfig): string {
  return `${cfg.prefix}${String(cfg.startNumber).padStart(cfg.digits, "0")}`;
}

export default function InvoiceNumberingSettingsPage() {
  const { settings, updateSettings } = useStoreSettings();
  const [numbering, setNumbering] = useState(settings.invoiceNumbering);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const update = useCallback(
    (series: "retail" | "business", key: keyof InvoiceNumberingConfig, value: string | number) => {
      setNumbering((n) => ({ ...n, [series]: { ...n[series], [key]: value } }));
    },
    []
  );

  const validate = (): boolean => {
    const errs: string[] = [];
    if (!numbering.retail.prefix.trim()) errs.push("Retail prefix cannot be empty.");
    if (!numbering.business.prefix.trim()) errs.push("Business prefix cannot be empty.");
    if (numbering.retail.prefix.trim() === numbering.business.prefix.trim())
      errs.push("Retail and Business prefixes must be different so the two series stay independent.");
    if (numbering.retail.digits < 1 || numbering.retail.digits > 8) errs.push("Retail digit length must be 1–8.");
    if (numbering.business.digits < 1 || numbering.business.digits > 8) errs.push("Business digit length must be 1–8.");
    setErrors(errs);
    return errs.length === 0;
  };

  const handleSave = useCallback(() => {
    if (!validate()) return;
    setSaving(true);
    updateSettings({ invoiceNumbering: numbering });
    setTimeout(() => setSaving(false), 400);
  }, [numbering, updateSettings]);

  return (
    <SettingsPage
      breadcrumbs={[
        { label: "Invoice", href: "/settings/invoice/general" },
        { label: "Numbering" },
      ]}
      title="Invoice Numbering"
      description="Independent numbering series for Retail and Business invoices."
      onSave={handleSave}
      saving={saving}
    >
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          The next invoice number always continues from the highest existing number in each series.
          Changing the prefix or digits here affects <strong>new</strong> invoices only — it never
          renumbers invoices you have already created. The start number applies only when a series
          has no invoices yet.
        </p>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          {errors.map((e, i) => (
            <p key={i} className="text-sm text-rose-700">{e}</p>
          ))}
        </div>
      )}

      <SettingsSection
        title="Retail Invoice Series"
        description="Used for individual customers and walk-ins."
        icon={Hash}
      >
        <NumberingFields
          cfg={numbering.retail}
          onChange={(k, v) => update("retail", k, v)}
          tone="indigo"
        />
      </SettingsSection>

      <SettingsSection
        title="Business Invoice Series"
        description="Used for companies with GST billing. Kept separate from the retail sequence."
        icon={Hash}
      >
        <NumberingFields
          cfg={numbering.business}
          onChange={(k, v) => update("business", k, v)}
          tone="emerald"
        />
      </SettingsSection>
    </SettingsPage>
  );
}

function NumberingFields({
  cfg,
  onChange,
  tone,
}: {
  cfg: InvoiceNumberingConfig;
  onChange: (key: keyof InvoiceNumberingConfig, value: string | number) => void;
  tone: "indigo" | "emerald";
}) {
  const toneClasses = tone === "indigo" ? "border-indigo-200 bg-indigo-50/40" : "border-emerald-200 bg-emerald-50/40";
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Prefix</Label>
          <Input value={cfg.prefix} onChange={(e) => onChange("prefix", e.target.value)} placeholder="INV" />
        </div>
        <div className="space-y-1.5">
          <Label>Start Number</Label>
          <Input
            type="number"
            min={1}
            value={cfg.startNumber}
            onChange={(e) => onChange("startNumber", Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Digits</Label>
          <Input
            type="number"
            min={1}
            max={8}
            value={cfg.digits}
            onChange={(e) => onChange("digits", Math.max(1, Math.min(8, parseInt(e.target.value) || 3)))}
          />
        </div>
      </div>
      <div className={cn("mt-4 rounded-xl border p-3 text-center", toneClasses)}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Preview</p>
        <p className="font-display text-xl font-bold tracking-tight">{preview(cfg)}</p>
      </div>
    </div>
  );
}
