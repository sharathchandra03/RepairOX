"use client";
/* Read-only ticket status pill that honours custom statuses (Settings →
   Tickets → Statuses & Categories): custom label + colour when the record's
   statusId is valid for its system status, else the system status. */
import type { TicketStatus } from "@/lib/mock-data";
import { useStoreSettings } from "@/lib/store-settings";
import { resolveStatus, effectiveColors, type StatusScope } from "@/lib/ticket-status-config";
import { cn } from "@/lib/utils";

export function ResolvedStatusPill({ status, statusId, className, scope = "ticket" }: { status: TicketStatus; statusId?: string; className?: string; scope?: StatusScope }) {
  const { settings } = useStoreSettings();
  const cfg = scope === "warranty" ? settings.warrantyStatusConfig : settings.ticketStatusConfig;
  const r = resolveStatus(status, statusId, cfg, scope === "warranty" ? effectiveColors(cfg, settings.statusColors) : settings.statusColors);
  return (
    <span title={r.categoryName ? `${r.categoryName} · ${r.label}` : r.label}
      className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap", className)}
      style={{ backgroundColor: `${r.color}15`, color: r.color, boxShadow: `inset 0 0 0 1px ${r.color}30` }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
      <span className="truncate">{r.label}</span>
    </span>
  );
}
