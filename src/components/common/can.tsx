"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — permission-gated rendering primitive.

   Wrap anything that should disappear when the active role (real admin, or
   whoever is being previewed) lacks a capability. This is intentionally the
   *only* new UI primitive introduced for this feature — no new visual
   language, just conditional rendering around what already exists.

   Usage:
     <Can permission="delete"><Button>Delete</Button></Can>
     <Can permission={["create", "manage_inventory"]} mode="any">…</Can>
     <Can permission="manage_reports" fallback={<Locked />}>…</Can>
   ────────────────────────────────────────────────────────────────────────── */

import type { ReactNode } from "react";
import { usePermissions } from "@/lib/permissions-context";
import type { PermissionKey } from "@/lib/permissions";

export function Can({
  permission,
  mode = "any",
  fallback = null,
  children,
}: {
  /** One permission key, or several to check together. */
  permission: PermissionKey | PermissionKey[];
  /** "any" (default) renders if at least one key is granted; "all" requires every key. */
  mode?: "any" | "all";
  /** Rendered instead when the check fails (defaults to nothing). */
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can } = usePermissions();
  const keys = Array.isArray(permission) ? permission : [permission];
  const allowed = mode === "all" ? keys.every(can) : keys.some(can);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
