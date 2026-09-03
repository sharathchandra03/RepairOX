"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { GitBranch, Flag, Clock, Lock, ArrowRight, Palette } from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStoreSettings } from "@/lib/store-settings";
import { usePermissions } from "@/lib/permissions-context";
import { STATUS_LABEL, type TicketStatus } from "@/lib/mock-data";

/* The real ticket lifecycle order, as implemented by the status system
 * (mock-data.ts TicketStatus + deriveTicketStatus rollup). This is a fixed
 * system-controlled progression — statuses themselves are code-level, so we
 * surface them read-only and let admins configure the parts that are genuinely
 * variable (default status, default SLA). */
const LIFECYCLE_ORDER: TicketStatus[] = [
  "in_progress",
  "waiting_approval",
  "waiting_parts",
  "repaired",
  "repaired_collected",
  "return",
  "return_collected",
];

/** Statuses eligible to be a NEW ticket's default. Terminal/collected states
 *  are excluded because a ticket should never START in a completed state. */
const DEFAULTABLE: TicketStatus[] = [
  "in_progress",
  "waiting_approval",
  "waiting_parts",
];

export default function WorkflowSettingsPage() {
  const { settings, updateSettings } = useStoreSettings();
  const { can } = usePermissions();
  const canManage = can("edit_ticket_settings") || can("manage_settings");

  const [defaultStatus, setDefaultStatus] = useState<string>(settings.ticketDefaultStatus);
  const [resMinutes, setResMinutes] = useState<string>(String(settings.ticketDefaultResolutionMinutes));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDefaultStatus(settings.ticketDefaultStatus); }, [settings.ticketDefaultStatus]);
  useEffect(() => { setResMinutes(String(settings.ticketDefaultResolutionMinutes)); }, [settings.ticketDefaultResolutionMinutes]);

  const handleSave = useCallback(() => {
    if (!canManage) return;
    setSaving(true);
    const mins = Math.max(1, Math.round(Number(resMinutes) || 59));
    updateSettings({
      ticketDefaultStatus: DEFAULTABLE.includes(defaultStatus as TicketStatus) ? defaultStatus : "in_progress",
      ticketDefaultResolutionMinutes: mins,
    });
    setTimeout(() => setSaving(false), 400);
  }, [canManage, defaultStatus, resMinutes, updateSettings]);

  const color = (s: TicketStatus) => settings.statusColors[s] || "#71717A";

  return (
    <SettingsPage
      breadcrumbs={[
        { label: "Tickets", href: "/settings/tickets/general" },
        { label: "Workflow" },
      ]}
      title="Workflow"
      description="Configure how tickets move through their lifecycle. Changes apply to future tickets — existing tickets are never rewritten."
      onSave={canManage ? handleSave : undefined}
      saving={saving}
    >
      {/* Default status for new tickets */}
      <SettingsSection
        title="Default Status"
        description="The status applied to newly created tickets. Existing tickets keep their current status."
        icon={Flag}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DEFAULTABLE.map((s) => {
            const active = defaultStatus === s;
            const c = color(s);
            return (
              <button
                key={s}
                disabled={!canManage}
                onClick={() => setDefaultStatus(s)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed",
                  active ? "border-[#4361EE] bg-indigo-50/50" : "border-border hover:border-zinc-300"
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: c }} />
                <span className="text-sm font-medium">{STATUS_LABEL[s]}</span>
                {active && <span className="ml-auto text-[10px] font-semibold text-[#4361EE]">Default</span>}
              </button>
            );
          })}
        </div>
      </SettingsSection>

      {/* Default resolution / SLA */}
      <SettingsSection
        title="Default Resolution Time"
        description="Used to compute a ticket's due date when no custom resolution time is entered. Drives the overdue indicator in the ticket table."
        icon={Clock}
      >
        <div className="flex items-end gap-3">
          <div className="w-40 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Minutes</label>
            <Input
              type="number"
              min={1}
              value={resMinutes}
              disabled={!canManage}
              onChange={(e: any) => setResMinutes(e.target.value)}
            />
          </div>
          <p className="pb-2 text-[12px] text-muted-foreground">
            New tickets default to a due date {Number(resMinutes) || 59} minute(s) after creation unless a custom resolution date is set.
          </p>
        </div>
      </SettingsSection>

      {/* Lifecycle visualization */}
      <SettingsSection
        title="Status Lifecycle"
        description="The stages a ticket moves through. Statuses are part of the system and shared with linked invoices."
        icon={GitBranch}
      >
        <div className="flex flex-wrap items-center gap-2">
          {LIFECYCLE_ORDER.map((s, i) => {
            const c = color(s);
            return (
              <div key={s} className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset"
                  style={{ backgroundColor: `${c}15`, color: c, boxShadow: `inset 0 0 0 1px ${c}30` }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
                  {STATUS_LABEL[s]}
                </span>
                {i < LIFECYCLE_ORDER.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-zinc-300" />}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          On multi-device tickets the ticket status is derived from its devices (any Waiting for Parts → Waiting for Parts, any Repaired → Repaired, all Collected → Repaired &amp; Collected, and so on).
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Status colours are managed in{" "}
          <Link href="/settings/tickets/general" className="font-medium text-[#4361EE] hover:underline">Ticket Settings</Link>.
        </p>
      </SettingsSection>

      {/* Enforced business rule */}
      <SettingsSection
        title="Completion Rules"
        description="Business rules that always apply, regardless of other configuration."
        icon={Lock}
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <Lock className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-900">Invoice required for “Repaired &amp; Collected”</p>
              <p className="mt-1 text-[12px] text-amber-800/90">
                A ticket can only move to <span className="font-medium">Repaired &amp; Collected</span> after an invoice has been
                generated for it. This is enforced at the data layer for single, bulk, and invoice-driven status changes, and
                cannot be bypassed from Settings. Creating an invoice for a ticket sets its status automatically.
              </p>
            </div>
          </div>
        </div>
      </SettingsSection>

      {!canManage && (
        <p className="text-center text-[12px] text-muted-foreground">
          You have view-only access to Workflow settings. Ask an administrator to make changes.
        </p>
      )}
    </SettingsPage>
  );
}
