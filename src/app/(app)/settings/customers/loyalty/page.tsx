"use client";

import { useEffect, useState } from "react";
import { Save, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Can } from "@/components/common/can";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreSettings } from "@/lib/store-settings";
import { LOYALTY_TIERS, LOYALTY_TIER_THRESHOLDS } from "@/lib/customer-service";

export default function LoyaltySettingsPage() {
  const { can } = usePermissions();
  const canManage = can("manage_loyalty");
  const { settings, updateSettings, hydrated } = useStoreSettings();

  // Loyalty program settings — seeded from the persisted config once loaded,
  // then edited locally until Save. hydrated guards against briefly showing
  // the hardcoded default before the real (possibly different) saved value
  // arrives.
  const [enabled, setEnabled] = useState(settings.loyaltyConfig.enabled);
  const [pointsPerRupee, setPointsPerRupee] = useState(settings.loyaltyConfig.pointsPerRupee);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (hydrated) {
      setEnabled(settings.loyaltyConfig.enabled);
      setPointsPerRupee(settings.loyaltyConfig.pointsPerRupee);
    }
    // Only re-sync when the persisted settings actually load/change — not on
    // every render, so in-progress local edits aren't clobbered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, settings.loyaltyConfig.enabled, settings.loyaltyConfig.pointsPerRupee]);

  const handleSave = async () => {
    setSaveStatus("saving");
    updateSettings({ loyaltyConfig: { enabled, pointsPerRupee } });
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

      {/* Program Settings */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card space-y-6">
        <div>
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
          <div className="space-y-2 mb-6">
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

          {/* Save button */}
          <div className="flex items-center gap-2 pt-4">
            <Button
              onClick={handleSave}
              disabled={!canManage}
              size="md"
            >
              <Save className="h-4 w-4" />
              {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "Save Settings"}
            </Button>
          </div>
        </div>
      </div>

      {/* Loyalty Tiers */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <h3 className="text-sm font-semibold mb-4">Loyalty Tiers</h3>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground mb-4">
            Customers automatically move to higher tiers as they accumulate points from finalized invoices.
          </p>
          {LOYALTY_TIERS.map((tier, i) => {
            const threshold = LOYALTY_TIER_THRESHOLDS[tier];
            const nextTier = LOYALTY_TIERS[i + 1];
            const nextThreshold = nextTier ? LOYALTY_TIER_THRESHOLDS[nextTier] : null;

            return (
              <div key={tier} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/30 transition">
                {/* Tier badge */}
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${
                  tier === "bronze" ? "bg-amber-700" :
                  tier === "silver" ? "bg-slate-500" :
                  tier === "gold" ? "bg-amber-500" :
                  "bg-blue-600"
                }`}>
                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                </span>

                {/* Points range */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {threshold > 0
                      ? `${threshold.toLocaleString()} points${nextThreshold ? ` - ${nextThreshold.toLocaleString()}` : "+"}`
                      : "Starting tier"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {threshold > 0
                      ? `Customers with ${threshold}+ points reach ${tier} status`
                      : "Customers start here"}
                  </p>
                </div>

                {/* Arrow to next tier */}
                {nextThreshold && (
                  <>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-xs font-semibold text-muted-foreground">{nextThreshold - threshold} points to {nextTier}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
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
