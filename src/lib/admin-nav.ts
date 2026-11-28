/* ──────────────────────────────────────────────────────────────────────────
   Admin Hub — the dedicated area that holds Employees and Accounts.
   Works exactly like Inventory: one entry in the main sidebar opens a separate
   page set with its OWN sidebar (components/layout/admin-sidebar.tsx), and a
   "Main menu" pill returns to the normal sidebar.
   The sections / pages come from `expandableNavGroups.shop` (mock-data.ts) —
   the same single definition (with its permissions) the old expandable groups
   used — so nothing is duplicated here.
   Rename the area by changing ADMIN_HUB_LABEL only.
   ────────────────────────────────────────────────────────────────────────── */
import { expandableNavGroups } from "@/lib/mock-data";

export const ADMIN_HUB_LABEL = "People & Finance";
/** Main-sidebar entry; the route just forwards to the first page the user may open. */
export const ADMIN_HUB_HOME = "/admin-hub";

function adminHrefs(): string[] {
  return (expandableNavGroups.shop ?? []).flatMap((g) => g.children.map((c) => c.href));
}

/** True on every page that belongs to the Admin Hub (swaps in its own sidebar). */
export function isAdminPath(pathname: string): boolean {
  if (pathname === ADMIN_HUB_HOME) return true;
  return adminHrefs().some((h) => pathname === h || pathname.startsWith(h + "/"));
}
