"use client";

import { useState, useCallback, useMemo } from "react";
import { Palette, Columns3 } from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { useStoreSettings } from "@/lib/store-settings";
import { usePermissions } from "@/lib/permissions-context";
import { useStore } from "@/lib/store";
import { normalizeStatusConfig, type TicketStatusConfig } from "@/lib/ticket-status-config";
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
  // Custom statuses used on any ticket/device can't be deleted (only switched off).
  const { tickets } = useStore();
  const usedStatusIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tickets) {
      if (t.statusId) ids.add(t.statusId);
      for (const d of t.devices ?? []) if (d.statusId) ids.add(d.statusId);
    }
    return ids;
  }, [tickets]);
  const handleSave = useCallback(() => {
    if (!canManage) return;
    setSaving(true);
    updateSettings({ statusColors: colors, ticketStatusConfig: normalizeStatusConfig(statusConfig) });
    setTimeout(() => setSaving(false), 400);
  }, [canManage, colors, statusConfig, updateSettings]);

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
        description="Group ticket statuses into categories, add your own statuses and pick their colours. The status dropdown on tickets follows this layout."
        icon={Palette}
      >
        <TicketStatusManager config={statusConfig} onChange={setStatusConfig} colors={colors} onColorsChange={setColors}
          usedIds={usedStatusIds} disabled={!canManage} />
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
