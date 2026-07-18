"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useDashboardSettings } from "@/lib/dashboard-settings-context";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

export default function DashboardSettingsPage() {
  const { resizeEnabled, setResizeEnabled } = useDashboardSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings / Dashboard"
        title="Dashboard Settings"
        subtitle="Customise how the dashboard behaves for your account."
      />

      <div className="max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-card">
        <h3 className="text-sm font-semibold">Card Resize</h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          When enabled, you can drag the edges of dashboard cards to resize them and
          adjust the layout to your preference.
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

        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
          <p className="text-[12px] leading-relaxed text-[#3347D6]">
            Card resize is only available on desktop screens (1024px and above). On mobile and tablet
            devices, the dashboard uses a single-column responsive layout automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
