"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Save, RotateCcw } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────── */

type NumberingConfig = {
  prefix: string;
  startNumber: number;
  digits: number;
};

type StatusColor = {
  draft: string;
  sent: string;
  paid: string;
  partial: string;
  overdue: string;
  cancelled: string;
};

type InvoiceSettings = {
  retail: NumberingConfig;
  business: NumberingConfig;
  statusColors: StatusColor;
};

const DEFAULT_SETTINGS: InvoiceSettings = {
  retail: { prefix: "INV", startNumber: 1, digits: 4 },
  business: { prefix: "INVG", startNumber: 1, digits: 4 },
  statusColors: {
    draft: "#6b7280",
    sent: "#d97706",
    paid: "#059669",
    partial: "#2563eb",
    overdue: "#ea580c",
    cancelled: "#dc2626",
  },
};

const STORAGE_KEY = "repairox-invoice-settings";

function loadSettings(): InvoiceSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: InvoiceSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function preview(config: NumberingConfig): string {
  return `${config.prefix}${String(config.startNumber).padStart(config.digits, "0")}`;
}

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function InvoiceSettingsPage() {
  const [settings, setSettings] = useState<InvoiceSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => { setSettings(loadSettings()); }, []);

  const validate = (): boolean => {
    const errs: string[] = [];
    if (!settings.retail.prefix.trim()) errs.push("Retail prefix cannot be empty.");
    if (!settings.business.prefix.trim()) errs.push("Business prefix cannot be empty.");
    if (settings.retail.prefix.trim() === settings.business.prefix.trim()) errs.push("Retail and Business prefixes must be different.");
    if (settings.retail.digits < 1 || settings.retail.digits > 8) errs.push("Retail digit length must be 1–8.");
    if (settings.business.digits < 1 || settings.business.digits > 8) errs.push("Business digit length must be 1–8.");
    setErrors(errs);
    return errs.length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setErrors([]);
  };

  const updateRetail = (k: keyof NumberingConfig, v: any) => setSettings((s) => ({ ...s, retail: { ...s.retail, [k]: v } }));
  const updateBusiness = (k: keyof NumberingConfig, v: any) => setSettings((s) => ({ ...s, business: { ...s.business, [k]: v } }));
  const updateColor = (status: keyof StatusColor, color: string) => setSettings((s) => ({ ...s, statusColors: { ...s.statusColors, [status]: color } }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Invoice Settings"
        subtitle="Configure invoice numbering patterns and status appearance."
        actions={
          <Link href="/invoice">
            <Button variant="outline" size="md" className="rounded-full">
              <ArrowLeft className="h-4 w-4" /> Back to Invoices
            </Button>
          </Link>
        }
      />

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          {errors.map((e, i) => <p key={i} className="text-sm text-rose-700">{e}</p>)}
        </div>
      )}

      {/* Numbering Configuration */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Retail */}
        <NumberingCard
          title="Retail Invoice"
          subtitle="For individual customers and walk-ins"
          config={settings.retail}
          onChange={updateRetail}
          tone="indigo"
        />
        {/* Business */}
        <NumberingCard
          title="Business Invoice"
          subtitle="For companies with GST billing"
          config={settings.business}
          onChange={updateBusiness}
          tone="emerald"
        />
      </div>

      {/* Status Colors */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <h3 className="font-display text-base font-bold mb-1">Invoice Status Appearance</h3>
        <p className="text-sm text-muted-foreground mb-5">Customize colours used for invoice status indicators throughout the module.</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(["draft", "sent", "paid", "partial", "overdue", "cancelled"] as const).map((status) => {
            const label = status === "partial" ? "Partially Paid" : status === "sent" ? "Pending Payment" : status.charAt(0).toUpperCase() + status.slice(1);
            return (
              <div key={status} className="group flex items-center gap-3 rounded-xl border border-border p-3.5 hover:border-zinc-300 transition">
                {/* Color swatch — clickable */}
                <label className="relative shrink-0 cursor-pointer">
                  <span className="block h-9 w-9 rounded-lg shadow-sm ring-1 ring-inset ring-black/10" style={{ backgroundColor: settings.statusColors[status] }} />
                  <input type="color" value={settings.statusColors[status]} onChange={(e) => updateColor(status, e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </label>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold leading-tight">{label}</p>
                  <p className="text-[11px] font-semibold mt-0.5 truncate" style={{ color: settings.statusColors[status] }}>
                    {preview(settings.retail)} — {label}
                  </p>
                </div>
                <button onClick={() => updateColor(status, DEFAULT_SETTINGS.statusColors[status])}
                  className="opacity-0 group-hover:opacity-100 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition" title="Reset to default">
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" size="md" onClick={handleReset}>
          <RotateCcw className="h-4 w-4" /> Reset to Defaults
        </Button>
        <Button size="md" onClick={handleSave}>
          <Save className="h-4 w-4" /> {saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

/* ─── Numbering Config Card ──────────────────────────────────────────── */

function NumberingCard({ title, subtitle, config, onChange, tone }: {
  title: string;
  subtitle: string;
  config: NumberingConfig;
  onChange: (k: keyof NumberingConfig, v: any) => void;
  tone: "indigo" | "emerald";
}) {
  const toneClasses = tone === "indigo" ? "border-indigo-200 bg-indigo-50/30" : "border-emerald-200 bg-emerald-50/30";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-6 shadow-card">
      <h3 className="font-display text-base font-bold mb-0.5">{title}</h3>
      <p className="text-[12px] text-muted-foreground mb-5">{subtitle}</p>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Prefix</Label>
          <Input value={config.prefix} onChange={(e: any) => onChange("prefix", e.target.value)} placeholder="INV" />
        </div>
        <div className="space-y-1.5">
          <Label>Start Number</Label>
          <Input type="number" value={config.startNumber} onChange={(e: any) => onChange("startNumber", Math.max(1, parseInt(e.target.value) || 1))} min={1} />
        </div>
        <div className="space-y-1.5">
          <Label>Digits</Label>
          <Input type="number" value={config.digits} onChange={(e: any) => onChange("digits", Math.max(1, Math.min(8, parseInt(e.target.value) || 4)))} min={1} max={8} />
        </div>
      </div>

      {/* Preview */}
      <div className={cn("mt-4 rounded-xl border p-3 text-center", toneClasses)}>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Preview</p>
        <p className="font-display text-xl font-bold tracking-tight">{preview(config)}</p>
      </div>
    </motion.div>
  );
}
