"use client";

import { useState, useCallback } from "react";
import { Palette, Columns3 } from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { useStoreSettings } from "@/lib/store-settings";
import { usePermissions } from "@/lib/permissions-context";
import { STATUS_LABEL, type TicketStatus } from "@/lib/mock-data";
import { ColumnSettingsPanel } from "@/components/tickets/column-settings-panel";
import {
  DEFAULT_ORDER as COLUMN_DEFAULT_ORDER,
  DEFAULT_VISIBLE as COLUMN_DEFAULT_VISIBLE,
  type ColumnId,
} from "@/lib/ticket-columns";

const ALL_STATUSES: TicketStatus[] = [
  "in_progress",
  "waiting_approval",
  "waiting_parts",
  "repaired",
  "repaired_collected",
  "return",
  "return_collected",
];

/* Preset color options for quick pick */
const PRESET_COLORS = [
  "#3B82F6", "#2563EB", "#1D4ED8",
  "#F59E0B", "#D97706", "#B45309",
  "#F97316", "#EA580C", "#C2410C",
  "#10B981", "#059669", "#047857",
  "#6366F1", "#4F46E5", "#4338CA",
  "#F43F5E", "#E11D48", "#BE123C",
  "#8B5CF6", "#7C3AED", "#6D28D9",
  "#EC4899", "#DB2777", "#BE185D",
  "#71717A", "#52525B", "#3F3F46",
  "#06B6D4", "#0891B2", "#0E7490",
];

export default function TicketSettingsPage() {
  const { settings, updateSettings } = useStoreSettings();
  const { can } = usePermissions();
  // Same permission model as the other Ticket Settings sub-sections.
  const canManage = can("edit_ticket_settings") || can("manage_settings");

  const [colors, setColors] = useState<Record<string, string>>(settings.statusColors);
  const [saving, setSaving] = useState(false);
  const [activeStatus, setActiveStatus] = useState<TicketStatus | null>(null);

  const handleColorChange = useCallback((status: TicketStatus, color: string) => {
    setColors((prev) => ({ ...prev, [status]: color }));
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    updateSettings({ statusColors: colors });
    setTimeout(() => setSaving(false), 400);
  }, [colors, updateSettings]);

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
      description="Configure ticket status colours and display options."
      onSave={handleSave}
      saving={saving}
    >
      <SettingsSection
        title="Status Colours"
        description="Assign a colour to each ticket status. Applied to status pills and ticket markers in the table."
        icon={Palette}
      >
        <div className="space-y-3">
          {ALL_STATUSES.map((status) => {
            const color = colors[status] || "#71717A";
            const isActive = activeStatus === status;
            return (
              <div key={status} className="space-y-2">
                <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition hover:bg-muted/30">
                  {/* Color swatch */}
                  <button
                    onClick={() => setActiveStatus(isActive ? null : status)}
                    className="relative h-8 w-8 shrink-0 rounded-lg ring-2 ring-inset ring-black/10 transition hover:scale-110 focus:outline-none focus:ring-[#4361EE]"
                    style={{ backgroundColor: color }}
                    title="Click to pick colour"
                    aria-label={`Pick colour for ${STATUS_LABEL[status]}`}
                  />

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{STATUS_LABEL[status]}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{color}</p>
                  </div>

                  {/* Preview pill */}
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap"
                    style={{
                      backgroundColor: `${color}15`,
                      color: color,
                      boxShadow: `inset 0 0 0 1px ${color}30`,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {STATUS_LABEL[status]}
                  </span>

                  {/* Hex input */}
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) handleColorChange(status, v);
                    }}
                    className="w-20 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-mono text-center focus:border-[#4361EE] focus:ring-1 focus:ring-[#4361EE]/30 focus:outline-none"
                    maxLength={7}
                  />

                  {/* Native color picker */}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => handleColorChange(status, e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded-md border border-border p-0.5"
                    title="Open color picker"
                  />
                </div>

                {/* Preset palette (shown when active) */}
                {isActive && (
                  <div className="ml-11 flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/30 p-3">
                    {PRESET_COLORS.map((pc) => (
                      <button
                        key={pc}
                        onClick={() => { handleColorChange(status, pc); setActiveStatus(null); }}
                        className="h-6 w-6 rounded-md ring-1 ring-inset ring-black/10 transition hover:scale-125 focus:outline-none focus:ring-2 focus:ring-[#4361EE]"
                        style={{ backgroundColor: pc }}
                        title={pc}
                        aria-label={`Set colour ${pc}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
