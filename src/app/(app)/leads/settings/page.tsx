"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Settings hub.

   The landing page for Lead Management configuration. It presents each lead
   settings AREA as its own card linking to a dedicated sub-page, so the module
   can grow (new settings sections) without ever becoming one giant page.

   Current areas:
     • Form Edit — manage the dropdown values on the Lead Form (/form-edit).

   Store-level lead configuration (Lead Store Mode / Default Lead Store) lives in
   Settings → Store Information (it is a store configuration, not a lead field).
   ────────────────────────────────────────────────────────────────────────── */

import Link from "next/link";
import { ListChecks, ChevronRight, Store, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { usePermissions } from "@/lib/permissions-context";

type SettingsArea = {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  available: boolean;
  badge?: string;
};

const AREAS: SettingsArea[] = [
  {
    id: "form-edit",
    label: "Form Edit",
    description: "Manage the dropdown values sales agents pick from when capturing a lead — Source, Device, Status, Priority and more. Reorder, rename, archive.",
    icon: ListChecks,
    href: "/leads/settings/form-edit",
    available: true,
  },
];

export default function LeadsSettingsPage() {
  const { can } = usePermissions();
  const canManage = can("manage_settings");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Lead Management"
        title="Lead Settings"
        subtitle="Configure how Lead Management works for your team. Choose an area to manage."
      />

      {/* Settings areas — each links to a dedicated sub-page. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {AREAS.map((area) => (
          <Link
            key={area.id}
            href={area.href}
            className="group flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-card transition hover:border-[#4361EE]/40 hover:shadow-md"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">
              <area.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base font-bold text-foreground">{area.label}</h3>
                {area.badge && (
                  <span className="rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-semibold text-[#4361EE]">{area.badge}</span>
                )}
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{area.description}</p>
            </div>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-[#4361EE]" />
          </Link>
        ))}

        {/* Future-ready placeholder so the layout communicates that more lead
            settings areas will appear here. Non-interactive, muted. */}
        <div className="flex items-start gap-4 rounded-2xl border border-dashed border-border bg-muted/20 p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold text-muted-foreground">More coming soon</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Additional Lead Management settings areas will appear here as they're added.
            </p>
          </div>
        </div>
      </div>

      {/* Pointer to the store-level lead configuration (lives in Store settings). */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-muted/20 px-4 py-3">
        <Store className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
        <p className="text-[12.5px] text-muted-foreground">
          Looking for how leads are assigned to stores? That's the{" "}
          <span className="font-semibold text-foreground">Lead Store Mode</span>, in{" "}
          <Link href="/settings/store" className="font-semibold text-[#4361EE] hover:underline">Settings → Store Information</Link>.
        </p>
      </div>

      {!canManage && (
        <p className="text-[12px] text-muted-foreground">
          You can view these settings, but only Admin/Owner roles (Manage Settings) can change them.
        </p>
      )}
    </div>
  );
}
