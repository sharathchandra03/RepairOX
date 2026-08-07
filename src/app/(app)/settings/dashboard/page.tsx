"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { useDashboardSettings } from "@/lib/dashboard-settings-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Info, Check } from "lucide-react";

export default function DashboardSettingsPage() {
  const { resizeEnabled, setResizeEnabled, reorderEnabled, setReorderEnabled, saveSettings, isSaving } = useDashboardSettings();
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await saveSettings();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings / Dashboard"
        title="Dashboard Settings"
        subtitle="Customise how the dashboard behaves for your account."
      />

      <div className="max-w-2xl space-y-5">
        {/* Reorder / Position Switch */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <h3 className="text-sm font-semibold">Widget Position</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            When enabled, you can drag dashboard widgets to rearrange their position.
            Turn this off and save to lock the layout in place.
          </p>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-background p-4">
            <div>
              <p className="text-sm font-medium">Enable position rearrange</p>
              <p className="text-[12px] text-muted-foreground">Drag widgets to change their order on the dashboard</p>
            </div>
            <button
              role="switch"
              aria-checked={reorderEnabled}
              onClick={() => setReorderEnabled(!reorderEnabled)}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                reorderEnabled ? "bg-[#4361EE]" : "bg-zinc-200"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                  reorderEnabled && "translate-x-5"
                )}
              />
            </button>
          </div>
        </div>

        {/* Resize */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <h3 className="text-sm font-semibold">Card Resize</h3>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            When enabled, you can drag the edges of dashboard cards to resize them.
            Turn this off and save to lock the sizes in place.
          </p>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-background p-4">
            <div>
              <p className="text-sm font-medium">Enable card resize</p>
              <p className="text-[12px] text-muted-foreground">Show drag handles on dashboard widgets</p>
            </div>
            <button
              role="switch"
              aria-checked={resizeEnabled}
              onClick={() => setResizeEnabled(!resizeEnabled)}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                resizeEnabled ? "bg-[#4361EE]" : "bg-zinc-200"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                  resizeEnabled && "translate-x-5"
                )}
              />
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center gap-3">
          <Button
            size="md"
            className="rounded-[10px]"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : saved ? <><Check className="h-4 w-4" /> Saved</> : "Save Settings"}
          </Button>
          {saved && (
            <span className="text-[12px] font-medium text-emerald-600">Settings saved to your account</span>
          )}
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
          <p className="text-[12px] leading-relaxed text-[#3347D6]">
            Click Save to push your settings to the database. Once saved with both options disabled,
            the dashboard layout is permanently locked until you re-enable and save again.
            Available on desktop screens (1024px+) only.
          </p>
        </div>
      </div>
    </div>
  );
}
