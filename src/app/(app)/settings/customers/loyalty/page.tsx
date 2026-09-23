"use client";

import { useEffect, useState } from "react";
import { Save, ArrowRight, RotateCcw, Award } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreSettings } from "@/lib/store-settings";
import {
  LOYALTY_TIERS,
  LOYALTY_TIER_LABELS,
  LOYALTY_TIER_THRESHOLDS,
  type LoyaltyTier,
} from "@/lib/customer-service";

type TierRow = { key: LoyaltyTier; label: string; threshold: number };

/** Per-tier badge colours (keyed by the fixed tier key, not the label). */
const TIER_BADGE: Record<LoyaltyTier, string> = {
  bronze: "bg-amber-700",
  silver: "bg-slate-500",
  gold: "bg-amber-500",
  platinum: "bg-blue-600",
};
const TIER_RING: Record<LoyaltyTier, string> = {
  bronze: "ring-amber-200",
  silver: "ring-slate-200",
  gold: "ring-amber-200",
  platinum: "ring-blue-200",
};

function defaultTiers(): TierRow[] {
  return LOYALTY_TIERS.map((key) => ({
    key,
    label: LOYALTY_TIER_LABELS[key],
    threshold: LOYALTY_TIER_THRESHOLDS[key],
  }));
}

export default function LoyaltySettingsPage() {
  const { can } = usePermissions();
  const canManage = can("manage_loyalty");
  const { settings, updateSettings, hydrated } = useStoreSettings();

  // Local editable copy — seeded from persisted config once loaded, then
  // edited until Save. hydrated guards against briefly showing the hardcoded
  // default before the real saved value arrives.
  const [enabled, setEnabled] = useState(settings.loyaltyConfig.enabled);
  const [pointsPerRupee, setPointsPerRupee] = useState(settings.loyaltyConfig.pointsPerRupee);
  const [tiers, setTiers] = useState<TierRow[]>(
    settings.loyaltyConfig.tiers?.length ? settings.loyaltyConfig.tiers : defaultTiers()
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (hydrated) {
      setEnabled(settings.loyaltyConfig.enabled);
      setPointsPerRupee(settings.loyaltyConfig.pointsPerRupee);
      setTiers(settings.loyaltyConfig.tiers?.length ? settings.loyaltyConfig.tiers : defaultTiers());
    }
    // Only re-sync when the persisted settings actually load/change — not on
    // every render, so in-progress local edits aren't clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrated,
    settings.loyaltyConfig.enabled,
    settings.loyaltyConfig.pointsPerRupee,
    settings.loyaltyConfig.tiers,
  ]);

  const updateTier = (key: LoyaltyTier, patch: Partial<TierRow>) =>
    setTiers((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const resetTiers = () => setTiers(defaultTiers());

  // Unsaved-change detection — compares the local editable copy against the
  // persisted config so the Save buttons enable only when there's something
  // to save (and show "Saved" once persisted).
  const savedTiers = settings.loyaltyConfig.tiers?.length ? settings.loyaltyConfig.tiers : defaultTiers();
  const dirty =
    enabled !== settings.loyaltyConfig.enabled ||
    pointsPerRupee !== settings.loyaltyConfig.pointsPerRupee ||
    JSON.stringify(tiers) !== JSON.stringify(savedTiers);

  // The base (lowest) tier must stay at 0; validate ascending thresholds.
  const sorted = [...tiers].sort(
    (a, b) => LOYALTY_TIERS.indexOf(a.key) - LOYALTY_TIERS.indexOf(b.key)
  );
  const orderWarning = sorted.some(
    (t, i) => i > 0 && t.threshold <= sorted[i - 1].threshold
  );

  const handleSave = async () => {
    setSaveStatus("saving");
    // Normalise: labels trimmed (fall back to default), thresholds are
    // non-negative integers, base tier forced to 0.
    const normalized: TierRow[] = sorted.map((t, i) => ({
      key: t.key,
      label: t.label.trim() || LOYALTY_TIER_LABELS[t.key],
      threshold: i === 0 ? 0 : Math.max(0, Math.round(t.threshold || 0)),
    }));
    updateSettings({ loyaltyConfig: { enabled, pointsPerRupee, tiers: normalized } });
    setTiers(normalized);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings › Customers"
        title="Loyalty Program"
        subtitle="Configure customer loyalty system, points earning, and tier definitions."
      />

      {/* Loyalty configuration — one card, two sections, one Save. */}
      <div className="rounded-2xl border border-border bg-card shadow-card">
        {/* ── Section 1: Program Configuration ── */}
        <section className="p-6">
          <h3 className="text-sm font-semibold mb-4">Program Configuration</h3>

          {/* Enable/Disable */}
          <div className="mb-6 flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
            <div>
              <p className="text-sm font-medium">Loyalty Program</p>
              <p className="text-xs text-muted-foreground mt-0.5">Enable or disable the entire program</p>
            </div>
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={!canManage}
                className="w-4 h-4 rounded border-input"
              />
            </label>
          </div>

          {/* Points Earning Rule */}
          <div className="space-y-2">
            <Label>Points Earning Rate</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">₹</span>
              <Input
                type="number"
                value={pointsPerRupee}
                onChange={(e) => setPointsPerRupee(Number(e.target.value) || 100)}
                disabled={!canManage || !enabled}
                className="max-w-[120px]"
                min="1"
              />
              <span className="text-sm text-muted-foreground">spent = 1 point</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {enabled
                ? `Example: ₹${pointsPerRupee} purchase = 1 point earned`
                : "Program is disabled — no points will be earned"
              }
            </p>
          </div>
        </section>

        {/* ── Section 2: Loyalty Tiers ── */}
        <section className="border-t border-border p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Award className="h-4 w-4 text-[#4361EE]" />
                Loyalty Tiers
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Rename each tier and set the points needed to reach it. Customers move up
                automatically as they earn points from finalized invoices.
              </p>
            </div>
            {canManage && (
              <Button variant="outline" size="sm" onClick={resetTiers} type="button">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </div>

          {/* Column headings */}
          <div className="hidden sm:grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3 px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Tier name</span>
            <span>Points to reach</span>
            <span>Range</span>
          </div>

          <div className="space-y-2">
            {sorted.map((tier, i) => {
              const isBase = i === 0;
              const nextTier = sorted[i + 1];
              const rangeLabel = isBase
                ? `0 – ${nextTier ? (nextTier.threshold - 1).toLocaleString() : "∞"} pts`
                : `${tier.threshold.toLocaleString()}${nextTier ? ` – ${(nextTier.threshold - 1).toLocaleString()}` : "+"} pts`;

              return (
                <div
                  key={tier.key}
                  className={`grid grid-cols-1 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 rounded-xl border border-border p-3 ring-1 ${TIER_RING[tier.key]} transition hover:bg-muted/30`}
                >
                  {/* Tier name (editable) with colour badge */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${TIER_BADGE[tier.key]}`}
                      aria-hidden
                    />
                    <Input
                      value={tier.label}
                      onChange={(e) => updateTier(tier.key, { label: e.target.value })}
                      disabled={!canManage}
                      placeholder={LOYALTY_TIER_LABELS[tier.key]}
                      maxLength={24}
                      className="font-medium"
                    />
                  </div>

                  {/* Threshold (editable, base locked to 0) */}
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={tier.threshold}
                      onChange={(e) =>
                        updateTier(tier.key, { threshold: Number(e.target.value) || 0 })
                      }
                      disabled={!canManage || isBase}
                      min="0"
                      className="max-w-[130px]"
                    />
                    <span className="text-xs text-muted-foreground">pts</span>
                  </div>

                  {/* Resolved range + starting badge */}
                  <div className="flex items-center gap-2 min-w-0">
                    {isBase ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        Starting tier
                      </span>
                    ) : (
                      <ArrowRight className="hidden sm:block h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate text-xs text-muted-foreground">{rangeLabel}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            The lowest tier always starts at 0 points. Tier identity is preserved across
            renames, so existing customers keep their standing.
          </p>
        </section>

        {/* ── Single Save footer for the whole card ── */}
        {canManage && (
          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            {orderWarning ? (
              <span className="text-xs font-medium text-red-600">
                Each tier's points must be higher than the one below it.
              </span>
            ) : dirty ? (
              <span className="text-xs text-muted-foreground">You have unsaved changes.</span>
            ) : null}
            <Button onClick={handleSave} disabled={orderWarning || !dirty} size="md">
              <Save className="h-4 w-4" />
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Save Changes"}
            </Button>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="rounded-2xl border border-border bg-blue-50 p-6 ring-1 ring-blue-200">
        <h3 className="text-sm font-semibold text-blue-900 mb-3">How Loyalty Works</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold mt-0.5">1.</span>
            <span>Points are earned when a customer's invoice is finalized (not from estimates or drafts).</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold mt-0.5">2.</span>
            <span>Points are calculated using the earning rate: ₹{pointsPerRupee} spent = 1 point.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold mt-0.5">3.</span>
            <span>Customers automatically move to higher tiers as their cumulative points increase.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold mt-0.5">4.</span>
            <span>All loyalty transactions are recorded in the customer's loyalty ledger for transparency.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 font-bold mt-0.5">5.</span>
            <span>Staff can manually adjust points or change tiers using the "Award Points" or "Change Tier" actions.</span>
          </li>
        </ul>
      </div>

      {/* Future: Redemption Rules */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <h3 className="text-sm font-semibold mb-2">Redemption (Future)</h3>
        <p className="text-xs text-muted-foreground">
          Redemption rules are planned for a future release. Customers will be able to redeem points for discounts or products.
        </p>
      </div>
    </div>
  );
}
