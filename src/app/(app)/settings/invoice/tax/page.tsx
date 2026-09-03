"use client";

import { useState, useCallback } from "react";
import { Percent, Plus, X, Info } from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { Label, Select } from "@/components/ui/input";
import { useStoreSettings } from "@/lib/store-settings";
import { cn } from "@/lib/utils";

export default function InvoiceTaxSettingsPage() {
  const { settings, updateSettings } = useStoreSettings();
  const [rates, setRates] = useState<number[]>(settings.invoiceGstRates);
  const [defaultRate, setDefaultRate] = useState<number>(settings.invoiceDefaults.gstRate);
  const [newRate, setNewRate] = useState("");
  const [saving, setSaving] = useState(false);

  const addRate = useCallback(() => {
    const v = parseFloat(newRate);
    if (isNaN(v) || v < 0 || v > 100) return;
    setRates((prev) => (prev.includes(v) ? prev : [...prev, v].sort((a, b) => a - b)));
    setNewRate("");
  }, [newRate]);

  const removeRate = useCallback((rate: number) => {
    setRates((prev) => prev.filter((r) => r !== rate));
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    // Keep the default GST rate on invoiceDefaults so there is one source of truth.
    updateSettings({
      invoiceGstRates: rates,
      invoiceDefaults: { ...settings.invoiceDefaults, gstRate: defaultRate },
    });
    setTimeout(() => setSaving(false), 400);
  }, [rates, defaultRate, settings.invoiceDefaults, updateSettings]);

  const rateOptions = [
    ...rates.map((r) => ({ label: `${r}%`, value: String(r) })),
    ...(rates.includes(defaultRate) ? [] : [{ label: `${defaultRate}%`, value: String(defaultRate) }]),
  ];

  return (
    <SettingsPage
      breadcrumbs={[
        { label: "Invoice", href: "/settings/invoice/general" },
        { label: "Tax" },
      ]}
      title="Tax"
      description="GST rates offered on invoices. The rate is split evenly into SGST + CGST at billing time using the existing tax calculation."
      onSave={handleSave}
      saving={saving}
    >
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[12.5px] text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          RepairOX uses a single GST rate per invoice, split equally into{" "}
          <strong>SGST</strong> and <strong>CGST</strong> (e.g. 18% → 9% + 9%). IGST is retained on
          historical invoices only. Changing these settings applies to <strong>new</strong> invoices;
          existing invoices keep the tax they were saved with.
        </p>
      </div>

      <SettingsSection
        title="Default GST Rate"
        description="Pre-selected GST rate when creating a new invoice."
        icon={Percent}
      >
        <div className="max-w-xs space-y-1.5">
          <Label>Default rate</Label>
          <Select
            value={String(defaultRate)}
            onChange={(e) => setDefaultRate(Number(e.target.value))}
            options={rateOptions}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title="Available GST Rates"
        description="The rate presets shown as quick-pick buttons in the invoice pricing step. A custom rate is always available in addition to these."
        icon={Percent}
      >
        <div className="flex flex-wrap gap-2">
          {rates.map((rate) => (
            <span
              key={rate}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-1.5 pl-3 pr-1.5 text-[13px] font-semibold"
            >
              {rate}%
              <button
                onClick={() => removeRate(rate)}
                className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground transition hover:bg-rose-100 hover:text-rose-600"
                title={`Remove ${rate}%`}
                aria-label={`Remove ${rate}% rate`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {rates.length === 0 && (
            <p className="text-[13px] text-muted-foreground">No preset rates. Add one below.</p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addRate(); }}
            placeholder="e.g. 28"
            className="h-[34px] w-28 rounded-xl border border-border bg-card px-3 text-[13px] focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 focus:outline-none"
          />
          <button
            onClick={addRate}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl bg-[#4361EE] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3550d8]",
              !newRate && "opacity-50"
            )}
          >
            <Plus className="h-3.5 w-3.5" /> Add rate
          </button>
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
