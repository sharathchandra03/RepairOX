"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — useCanEdit()

   A one-liner for the "View vs Edit" gradation inside a section. A page can
   check whether the current role may SAVE (edit) versus only VIEW, and pass the
   result to <SettingsPage canEdit={...}> so the Save button disappears and the
   form becomes read-only for view-tier users — instead of the all-or-nothing
   "hide the whole page" behaviour.

   Usage:
     const canEdit = useCanEdit(CAP.settings.invoiceGeneral);
     return <SettingsPage canEdit={canEdit} onSave={save} …>…</SettingsPage>;
   ────────────────────────────────────────────────────────────────────────── */

import { usePermissions } from "@/lib/permissions-context";
import { allow } from "@/lib/capabilities";
import type { PermissionKey } from "@/lib/permissions";

/** True when the current role holds ANY of the given edit keys. */
export function useCanEdit(anyOf: PermissionKey[]): boolean {
  const { can } = usePermissions();
  return allow(can, anyOf);
}
