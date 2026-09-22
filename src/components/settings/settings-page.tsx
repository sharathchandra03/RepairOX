"use client";

import { createContext, useContext } from "react";
import { SettingsBreadcrumb } from "./settings-breadcrumb";
import { Button } from "@/components/ui/button";
import { Save, Eye } from "lucide-react";

type Crumb = { label: string; href?: string };

/* Read-only context so nested custom controls (not plain inputs) can react to
   the page's edit permission. Plain <input>/<select>/<button> inside the page
   are ALSO disabled natively by the <fieldset disabled> wrapper below. */
const SettingsReadOnlyContext = createContext<boolean>(false);

/** True when the surrounding SettingsPage is in read-only (view-only) mode. */
export function useSettingsReadOnly(): boolean {
  return useContext(SettingsReadOnlyContext);
}

export function SettingsPage({
  breadcrumbs,
  title,
  description,
  onSave,
  saving,
  /** When false, the page renders READ-ONLY: the Save button is hidden, a
   *  banner explains it, and every form control inside is disabled. Defaults to
   *  true for backward compatibility — callers pass their permission check
   *  (e.g. `canEdit={useCanEdit(CAP.settings.invoiceGeneral)}`) to enforce the
   *  View-vs-Edit gradation. */
  canEdit = true,
  /** Optional custom message for the read-only banner. */
  readOnlyNote,
  children,
}: {
  breadcrumbs: Crumb[];
  title: string;
  description?: string;
  onSave?: () => void;
  saving?: boolean;
  canEdit?: boolean;
  readOnlyNote?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <SettingsBreadcrumb items={breadcrumbs} />

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {/* Save is only shown when the user may actually edit this page. */}
        {onSave && canEdit && (
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </div>

      {!canEdit && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] font-medium text-amber-700">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{readOnlyNote ?? "You have view-only access to this page. Ask an administrator for edit permission to make changes."}</span>
        </div>
      )}

      {/* A disabled <fieldset> natively greys out and blocks EVERY form control
          (input/select/textarea/button) rendered inside — so a view-only user
          physically cannot change or submit anything, with zero per-field code.
          Custom controls can additionally read useSettingsReadOnly(). */}
      <SettingsReadOnlyContext.Provider value={!canEdit}>
        <fieldset disabled={!canEdit} className={canEdit ? undefined : "opacity-70"}>
          <div className="space-y-5">
            {children}
          </div>
        </fieldset>
      </SettingsReadOnlyContext.Provider>
    </div>
  );
}

/* ─── Collapsible Section Card ───────────────────────────────────────── */

export function SettingsSection({
  title,
  description,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors rounded-xl"
      >
        {Icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

/* Needed for SettingsSection's useState */
import { useState } from "react";
