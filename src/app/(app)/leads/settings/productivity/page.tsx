"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead Settings → Productivity.

   Org-level Work Session / Productivity configuration for Sales Agents. Today
   it holds the break-reminder threshold (how long an agent may stay on break
   before being reminded to resume work). Gated by CAP.lead.settings — a
   view-tier user sees it read-only (no Save).
   ────────────────────────────────────────────────────────────────────────── */

import Link from "next/link";
import { ArrowLeft, Gauge, Lock } from "lucide-react";
import { RequireCapability } from "@/components/common/require-capability";
import { ProductivitySettingsSection } from "@/components/leads/settings/productivity-settings-card";
import { CAP } from "@/lib/capabilities";
import { useCanEdit } from "@/lib/use-can-edit";

export default function LeadProductivitySettingsPage() {
  return (
    <RequireCapability
      anyOf={CAP.settings.viewAny}
      title="Settings are restricted"
      description="Your role can't view settings. Ask an administrator to grant it in Settings → Roles & Permissions."
    >
      <ProductivitySettingsInner />
    </RequireCapability>
  );
}

function ProductivitySettingsInner() {
  const canEdit = useCanEdit(CAP.lead.settings);

  return (
    <div className="space-y-5">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Link
          href="/leads/settings"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card text-zinc-500 transition hover:border-[#4361EE]/40 hover:text-[#4361EE]"
          aria-label="Back to Lead Settings"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">Lead Settings</p>
          <h1 className="font-display text-lg font-bold tracking-tight text-foreground">Productivity</h1>
        </div>
      </div>

      <p className="text-[13px] text-muted-foreground">
        Control how RepairOX helps your Sales Agents keep their work-session productivity accurate.
      </p>

      {!canEdit && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
          <Lock className="h-4 w-4 shrink-0" />
          <p className="text-[13px]">You can view these settings, but only Admin/Owner roles can change them.</p>
        </div>
      )}

      {/* Settings card */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
        <div className="mb-5 flex items-center gap-2.5 border-b border-border/70 pb-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
            <Gauge className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Break Reminder</h2>
        </div>
        <ProductivitySettingsSection canEdit={canEdit} />
      </section>
    </div>
  );
}
