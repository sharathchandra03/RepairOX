"use client";

import { useState, useCallback, useMemo } from "react";
import { Palette, Columns3 } from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { useStoreSettings } from "@/lib/store-settings";
import { usePermissions } from "@/lib/permissions-context";
import { useStore } from "@/lib/store";
import { normalizeStatusConfig, effectiveColors, SYSTEM_STATUSES, type TicketStatusConfig } from "@/lib/ticket-status-config";
import { isWarranty } from "@/lib/mock-data";
import { SegmentedTabs } from "@/components/ui/tabs";
import { TicketStatusManager } from "@/components/settings/ticket-status-manager";
import { ColumnSettingsPanel } from "@/components/tickets/column-settings-panel";
import {
  DEFAULT_ORDER as COLUMN_DEFAULT_ORDER,
  DEFAULT_VISIBLE as COLUMN_DEFAULT_VISIBLE,
  type ColumnId,
} from "@/lib/ticket-columns";



export default function TicketSettingsPage() {
  const { settings, updateSettings } = useStoreSettings();
  const { can } = usePermissions();
  // Same permission model as the other Ticket Settings sub-sections.
  const canManage = can("edit_ticket_settings") || can("manage_settings");

  const [colors, setColors] = useState<Record<string, string>>(settings.statusColors);
  const [saving, setSaving] = useState(false);

  const [statusConfig, setStatusConfig] = useState<TicketStatusConfig>(settings.ticketStatusConfig);
  // Warranty records have their own categories / custom statuses / system-status colours.
  const [warrantyConfig, setWarrantyConfig] = useState<TicketStatusConfig>(settings.warrantyStatusConfig);
  const [statusScope, setStatusScope] = useState<"ticket" | "warranty">("ticket");
  // Custom statuses used on any ticket/device can't be deleted (only switched off).
  const { tickets } = useStore();
  const { usedStatusIds, usedWarrantyStatusIds } = useMemo(() => {
    const ids = new Set<string>();
    const wIds = new Set<string>();
    for (const t of tickets) {
      const target = isWarranty(t) ? wIds : ids;
      if (t.statusId) target.add(t.statusId);
      for (const d of t.devices ?? []) if (d.statusId) target.add(d.statusId);
    }
    return { usedStatusIds: ids, usedWarrantyStatusIds: wIds };
  }, [tickets]);
  const handleSave = useCallback(() => {
    if (!canManage) return;
    setSaving(true);
    updateSettings({ statusColors: colors, ticketStatusConfig: normalizeStatusConfig(statusConfig), warrantyStatusConfig: normalizeStatusConfig(warrantyConfig) });
    setTimeout(() => setSaving(false), 400);
  }, [canManage, colors, statusConfig, warrantyConfig, updateSettings]);

  /* ── Column Settings ──────────────────────────────────────────────────
     Reads the shared, persisted config (single source of truth) and writes it
     back on Apply. The panel keeps its own local working copy, so Cancel simply
     re-seeds it from the saved settings by bumping the remount key. */
  const [columnPanelKey, setColumnPanelKey] = useState(0);

  const savedColumnOrder = (settings.ticketColumnOrder?.length
    ? settings.ticketColumnOrder
    : COLUMN_DEFAULT_ORDER) as ColumnId[];
  const savedVisibleColumns = new Set<ColumnId>(
    (settings.ticketVisibleColumns?.length
      ? settings.ticketVisibleColumns
      : COLUMN_DEFAULT_VISIBLE) as ColumnId[]
  );

  const handleColumnsApply = useCallback(
    (order: ColumnId[], visible: Set<ColumnId>) => {
      updateSettings({
        ticketColumnOrder: order as string[],
        ticketVisibleColumns: Array.from(visible) as string[],
      });
      // Re-seed the panel from the freshly-saved state.
      setColumnPanelKey((k) => k + 1);
    },
    [updateSettings]
  );

  const handleColumnsCancel = useCallback(() => {
    // Discard the working copy by remounting the panel from saved settings.
    setColumnPanelKey((k) => k + 1);
  }, []);

  const handleColumnsReset = useCallback(() => {
    // Persist the built-in default configuration immediately.
    updateSettings({
      ticketColumnOrder: [...COLUMN_DEFAULT_ORDER] as string[],
      ticketVisibleColumns: [...COLUMN_DEFAULT_VISIBLE] as string[],
    });
  }, [updateSettings]);

  return (
    <SettingsPage
      breadcrumbs={[
        { label: "Tickets", href: "/settings/tickets/general" },
        { label: "Ticket Settings" },
      ]}
      title="Ticket Settings"
      description="Configure ticket statuses, categories, colours and table columns."
      onSave={handleSave}
      saving={saving}
      canEdit={canManage}
    >
      <SettingsSection
        title="Statuses & Categories"
        description="Group statuses into categories, add your own statuses and pick their colours. Tickets and Warranty records each have their own layout, and their status dropdowns follow it."
        icon={Palette}
      >
        <div className="mb-4">
          <SegmentedTabs
            size="sm"
            value={statusScope}
            onChange={(v) => setStatusScope(v as "ticket" | "warranty")}
            options={[{ label: "Tickets", value: "ticket" }, { label: "Warranty", value: "warranty" }]}
          />
        </div>
        {statusScope === "ticket" ? (
          <TicketStatusManager config={statusConfig} onChange={setStatusConfig} colors={colors} onColorsChange={setColors}
            usedIds={usedStatusIds} disabled={!canManage} />
        ) : (
          <TicketStatusManager key="warranty" config={warrantyConfig} onChange={setWarrantyConfig}
            colors={effectiveColors(warrantyConfig, colors)}
            onColorsChange={(c) => setWarrantyConfig((w) => ({
              ...w,
              colors: Object.fromEntries(SYSTEM_STATUSES.filter((st) => c[st] && c[st] !== colors[st]).map((st) => [st, c[st]])),
            }))}
            usedIds={usedWarrantyStatusIds} disabled={!canManage} />
        )}
      </SettingsSection>
      <SettingsSection
        title="Column Settings"
        description="Choose which columns appear in the ticket table, reorder them, and set defaults. Applies to the Tickets table for everyone in your workspace."
        icon={Columns3}
      >
        {canManage ? (
          <ColumnSettingsPanel
            key={columnPanelKey}
            bare
            columnOrder={savedColumnOrder}
            visibleColumns={savedVisibleColumns}
            onApply={handleColumnsApply}
            onCancel={handleColumnsCancel}
            onReset={handleColumnsReset}
          />
        ) : (
          <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-[13px] text-muted-foreground">
            You don&apos;t have permission to change ticket column settings.
          </p>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
