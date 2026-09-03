"use client";

import { useState, useCallback } from "react";
import { Palette, SlidersHorizontal, RotateCcw } from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { Label, Select } from "@/components/ui/input";
import { useStoreSettings, DEFAULT_STORE_SETTINGS } from "@/lib/store-settings";
import {
  INVOICE_STATUS_LABEL,
  invoiceStatusPillStyle,
  type InvoiceStatus,
} from "@/lib/mock-data";

const ALL_INVOICE_STATUSES: InvoiceStatus[] = [
  "draft", "sent", "paid", "partial", "overdue", "cancelled",
];

/* Preset palette for quick colour picking (shared with Tickets). */
const PRESET_COLORS = [
  "#3B82F6", "#2563EB", "#1D4ED8",
  "#F59E0B", "#D97706", "#B45309",
  "#F97316", "#EA580C", "#C2410C",
  "#10B981", "#059669", "#047857",
  "#6366F1", "#4F46E5", "#4338CA",
  "#F43F5E", "#E11D48", "#BE123C",
  "#8B5CF6", "#7C3AED", "#6D28D9",
  "#71717A", "#52525B", "#3F3F46",
];

export default function InvoiceGeneralSettingsPage() {
  const { settings, updateSettings } = useStoreSettings();

  // Local editing state — persisted as a whole on Save (matches Tickets pattern).
  const [defaults, setDefaults] = useState(settings.invoiceDefaults);
  const [colors, setColors] = useState<Record<string, string>>(settings.invoiceStatusColors);
  const [activeStatus, setActiveStatus] = useState<InvoiceStatus | null>(null);
  const [saving, setSaving] = useState(false);

  const paymentModeOptions = [
    { label: "No default — ask each time", value: "" },
    ...settings.invoicePaymentModes.map((m) => ({ label: paymentModeLabel(m), value: m })),
  ];

  const handleColorChange = useCallback((status: InvoiceStatus, color: string) => {
    setColors((prev) => ({ ...prev, [status]: color }));
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    updateSettings({ invoiceDefaults: defaults, invoiceStatusColors: colors });
    setTimeout(() => setSaving(false), 400);
  }, [defaults, colors, updateSettings]);

  return (
    <SettingsPage
      breadcrumbs={[
        { label: "Invoice", href: "/settings/invoice/general" },
        { label: "Invoice Settings" },
      ]}
      title="Invoice Settings"
      description="Defaults applied to new invoices and the colours used for invoice statuses. Existing invoices keep the values they were saved with."
      onSave={handleSave}
      saving={saving}
    >
      {/* ── General / Invoice Defaults ── */}
      <SettingsSection
        title="Invoice Defaults"
        description="Pre-selected values when a new invoice is created. These never change existing invoices."
        icon={SlidersHorizontal}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Default Invoice Type</Label>
            <Select
              value={defaults.invoiceType}
              onChange={(e) => setDefaults((d) => ({ ...d, invoiceType: e.target.value as "retail" | "business" }))}
              options={[
                { label: "Retail Invoice", value: "retail" },
                { label: "Business Invoice", value: "business" },
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Default Category</Label>
            <Select
              value={defaults.serviceCategory}
              onChange={(e) => setDefaults((d) => ({ ...d, serviceCategory: e.target.value as "service" | "accessories" }))}
              options={[
                { label: "Service", value: "service" },
                { label: "Accessories", value: "accessories" },
              ]}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Default Status</Label>
            <Select
              value={defaults.status}
              onChange={(e) => setDefaults((d) => ({ ...d, status: e.target.value }))}
              options={ALL_INVOICE_STATUSES.map((s) => ({ label: INVOICE_STATUS_LABEL[s], value: s }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Default Payment Mode</Label>
            <Select
              value={defaults.paymentMode}
              onChange={(e) => setDefaults((d) => ({ ...d, paymentMode: e.target.value }))}
              options={paymentModeOptions}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Default Due Date (days from creation)</Label>
            <input
              type="number"
              min={0}
              max={365}
              value={defaults.dueDateDays}
              onChange={(e) => setDefaults((d) => ({ ...d, dueDateDays: Math.max(0, Math.min(365, parseInt(e.target.value) || 0)) }))}
              className="h-[34px] w-full rounded-xl border border-border bg-card px-3 text-[13px] focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Default GST Rate (%)</Label>
            <Select
              value={String(defaults.gstRate)}
              onChange={(e) => setDefaults((d) => ({ ...d, gstRate: Number(e.target.value) }))}
              options={[
                { label: "0% (No GST)", value: "0" },
                { label: "12%", value: "12" },
                { label: "18%", value: "18" },
                { label: "28%", value: "28" },
              ]}
            />
            <p className="text-[11px] text-muted-foreground">
              Split evenly into SGST + CGST at billing time. Configure rates in{" "}
              <a href="/settings/invoice/tax" className="text-[#4361EE] hover:underline">Tax</a>.
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* ── Status Colours ── */}
      <SettingsSection
        title="Status Colours"
        description="Colour applied to invoice status pills across the invoice table, dashboard, view and edit screens."
        icon={Palette}
      >
        <div className="space-y-3">
          {ALL_INVOICE_STATUSES.map((status) => {
            const color = colors[status] || "#71717A";
            const isActive = activeStatus === status;
            return (
              <div key={status} className="space-y-2">
                <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition hover:bg-muted/30">
                  <button
                    onClick={() => setActiveStatus(isActive ? null : status)}
                    className="relative h-8 w-8 shrink-0 rounded-lg ring-2 ring-inset ring-black/10 transition hover:scale-110 focus:outline-none focus:ring-[#4361EE]"
                    style={{ backgroundColor: color }}
                    title="Click to pick colour"
                    aria-label={`Pick colour for ${INVOICE_STATUS_LABEL[status]}`}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{INVOICE_STATUS_LABEL[status]}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{color}</p>
                  </div>

                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                    style={invoiceStatusPillStyle(color)}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                    {INVOICE_STATUS_LABEL[status]}
                  </span>

                  <input
                    type="text"
                    value={color}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) handleColorChange(status, v);
                    }}
                    className="w-20 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-mono text-center focus:border-[#4361EE] focus:ring-1 focus:ring-[#4361EE]/30 focus:outline-none"
                    maxLength={7}
                  />

                  <input
                    type="color"
                    value={color}
                    onChange={(e) => handleColorChange(status, e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded-md border border-border p-0.5"
                    title="Open color picker"
                  />

                  <button
                    onClick={() => handleColorChange(status, DEFAULT_STORE_SETTINGS.invoiceStatusColors[status])}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition"
                    title="Reset to default"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                </div>

                {isActive && (
                  <div className="ml-11 flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/30 p-3">
                    {PRESET_COLORS.map((pc) => (
                      <button
                        key={pc}
                        onClick={() => { handleColorChange(status, pc); setActiveStatus(null); }}
                        className="h-6 w-6 rounded-md ring-1 ring-inset ring-black/10 transition hover:scale-125 focus:outline-none focus:ring-2 focus:ring-[#4361EE]"
                        style={{ backgroundColor: pc }}
                        title={pc}
                        aria-label={`Set colour ${pc}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}

function paymentModeLabel(mode: string): string {
  const map: Record<string, string> = {
    cash: "Cash",
    upi: "UPI",
    bank_transfer: "Bank Transfer",
    card: "Card",
    cheque: "Cheque",
    wallet: "Wallet",
    other: "Other",
  };
  return map[mode] ?? mode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
