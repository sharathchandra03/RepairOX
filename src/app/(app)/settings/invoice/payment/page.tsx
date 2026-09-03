"use client";

import { useState, useCallback } from "react";
import { Wallet, Plus, X, GripVertical, Info } from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { Label, Select } from "@/components/ui/input";
import { useStoreSettings } from "@/lib/store-settings";
import { cn } from "@/lib/utils";

/** Known payment modes with friendly labels. Custom values are title-cased. */
const KNOWN_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank Transfer",
  card: "Card",
  cheque: "Cheque",
  wallet: "Wallet",
  other: "Other",
};

function labelFor(mode: string): string {
  return KNOWN_LABELS[mode] ?? mode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugify(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export default function InvoicePaymentSettingsPage() {
  const { settings, updateSettings } = useStoreSettings();
  const [modes, setModes] = useState<string[]>(settings.invoicePaymentModes);
  const [defaultMode, setDefaultMode] = useState<string>(settings.invoiceDefaults.paymentMode);
  const [newMode, setNewMode] = useState("");
  const [saving, setSaving] = useState(false);

  const addMode = useCallback(() => {
    const slug = slugify(newMode);
    if (!slug) return;
    setModes((prev) => (prev.includes(slug) ? prev : [...prev, slug]));
    setNewMode("");
  }, [newMode]);

  const removeMode = useCallback((mode: string) => {
    setModes((prev) => prev.filter((m) => m !== mode));
    setDefaultMode((d) => (d === mode ? "" : d));
  }, []);

  const move = useCallback((index: number, dir: -1 | 1) => {
    setModes((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    updateSettings({
      invoicePaymentModes: modes,
      invoiceDefaults: { ...settings.invoiceDefaults, paymentMode: defaultMode },
    });
    setTimeout(() => setSaving(false), 400);
  }, [modes, defaultMode, settings.invoiceDefaults, updateSettings]);

  return (
    <SettingsPage
      breadcrumbs={[
        { label: "Invoice", href: "/settings/invoice/general" },
        { label: "Payment" },
      ]}
      title="Payment"
      description="Payment modes offered when recording invoice payments, and the default selection for new invoices."
      onSave={handleSave}
      saving={saving}
    >
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[12.5px] text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          These are selection options only — payment amounts, deposits and totals continue to use the
          existing invoice payment calculation. Removing a mode does not change invoices already recorded with it.
        </p>
      </div>

      <SettingsSection
        title="Payment Modes"
        description="Shown in the Mode of Payment dropdown on the invoice pricing step and payment drawer."
        icon={Wallet}
      >
        <div className="space-y-2">
          {modes.map((mode, i) => (
            <div key={mode} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="flex flex-col text-muted-foreground">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="leading-none disabled:opacity-30 hover:text-foreground"
                  aria-label="Move up"
                >▲</button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === modes.length - 1}
                  className="leading-none disabled:opacity-30 hover:text-foreground"
                  aria-label="Move down"
                >▼</button>
              </span>
              <GripVertical className="h-4 w-4 text-muted-foreground/40" />
              <span className="flex-1 text-sm font-medium">{labelFor(mode)}</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{mode}</code>
              <button
                onClick={() => removeMode(mode)}
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition hover:bg-rose-100 hover:text-rose-600"
                title={`Remove ${labelFor(mode)}`}
                aria-label={`Remove ${labelFor(mode)}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {modes.length === 0 && (
            <p className="text-[13px] text-muted-foreground">No payment modes. Add one below.</p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={newMode}
            onChange={(e) => setNewMode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addMode(); }}
            placeholder="Add a payment mode (e.g. Store Credit)"
            className="h-[34px] flex-1 rounded-xl border border-border bg-card px-3 text-[13px] focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 focus:outline-none"
          />
          <button
            onClick={addMode}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl bg-[#4361EE] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3550d8]",
              !newMode.trim() && "opacity-50"
            )}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Default Payment Mode"
        description="Pre-selected on new invoices. Leave unset to ask each time."
        icon={Wallet}
      >
        <div className="max-w-xs space-y-1.5">
          <Label>Default mode</Label>
          <Select
            value={defaultMode}
            onChange={(e) => setDefaultMode(e.target.value)}
            options={[
              { label: "No default — ask each time", value: "" },
              ...modes.map((m) => ({ label: labelFor(m), value: m })),
            ]}
          />
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
