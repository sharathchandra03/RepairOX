"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — useSession hook.

   Lightweight hook that provides the current user's identity from the
   permissions context. Consuming components should prefer this over importing
   `CURRENT_USER` directly from permissions.ts.

   In Supabase mode: returns the real authenticated user from the DB.
   In local mode: returns the local-mode user (CURRENT_USER fallback).

   Usage:
     const { name, email, roleId, branch, organization } = useSession();
   ────────────────────────────────────────────────────────────────────────── */

import { usePermissions } from "@/lib/permissions-context";
import { CURRENT_USER } from "@/lib/permissions";

export interface SessionUser {
  id?: string;
  name: string;
  email: string;
  organization: string;
  branch: string;
  roleId: string;
  avatarUrl?: string;
  isAuthenticated: boolean;
}

/**
 * Returns the current signed-in user's identity. Falls back to the local-mode
 * defaults when no real session exists (e.g., before hydration or when Supabase
 * is not configured).
 */
export function useSession(): SessionUser {
  const { currentUser, authReady } = usePermissions();

  if (currentUser) {
    return {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      organization: currentUser.branch ?? CURRENT_USER.organization,
      branch: currentUser.branch ?? CURRENT_USER.branch,
      roleId: currentUser.roleId,
      avatarUrl: currentUser.avatarUrl,
      isAuthenticated: true,
    };
  }

  // Fallback: local mode or session not yet loaded
  return {
    name: CURRENT_USER.name,
    email: CURRENT_USER.email,
    organization: CURRENT_USER.organization,
    branch: CURRENT_USER.branch,
    roleId: CURRENT_USER.roleId,
    isAuthenticated: authReady ? false : false,
  };
}
