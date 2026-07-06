"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Permission-driven rendering context.

   This is the reactive layer on top of `lib/permissions.ts`. The plain
   exports over there (`ROLES`, `hasPermission`, `currentRole`, etc.) stay
   untouched and remain the backend-ready source of truth for the *shape* of
   role/permission data. This file adds the piece a static module can't give
   us: state that changes at runtime (admin edits + saves a role's grants,
   then clicks "Preview Current Role") and something every component can
   subscribe to so the whole tree re-renders instantly — no reload, no
   second login.

   Consumers should use `usePermissions()` instead of calling
   `currentRole()` / `currentAllowedWorkspaces()` directly, so the UI reacts
   to preview mode and saved permission edits.
   ────────────────────────────────────────────────────────────────────────── */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ROLES,
  WORKSPACES,
  ALL_PERMISSIONS,
  CURRENT_USER,
  type PermissionKey,
  type RoleDef,
  type WorkspaceDef,
  type WorkspaceId,
} from "@/lib/permissions";
import { TEAM_SEED, type TeamMember } from "@/lib/mock-data";

/** Same shape as `RoleDef["permissions"]` — either the full catalogue or an explicit list. */
export type GrantMap = Record<string, PermissionKey[] | "all">;

function initialGrants(): GrantMap {
  const map: GrantMap = {};
  for (const r of ROLES) map[r.id] = r.permissions;
  return map;
}

/** Turn a free-typed role name into a stable id, e.g. "Store Auditor" -> "store_auditor". */
function slugify(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "role"
  );
}

/** Input for creating a brand-new role — an administrator-defined collection
 *  of workspaces + starting permissions. New roles slot in next to the
 *  built-in catalogue everywhere the app reads roles from (permission
 *  matrix, role browser, user invite/edit pickers) with zero extra wiring,
 *  since everything already reads through `usePermissions()`. */
export interface AddRoleInput {
  label: string;
  summary?: string;
  workspaces: WorkspaceId[];
  permissions?: PermissionKey[];
}

/** Expand a role's grant entry into a concrete Set for fast lookups. */
export function resolveGrantedKeys(grants: GrantMap, roleId: string): Set<PermissionKey> {
  const g = grants[roleId];
  if (!g || g === "all") return new Set(ALL_PERMISSIONS.map((p) => p.key));
  return new Set(g);
}

/** Same semantics as `hasPermission()` in lib/permissions.ts, but reads the live grant map. */
export function checkGrantedPermission(grants: GrantMap, roleId: string, key: PermissionKey): boolean {
  const set = resolveGrantedKeys(grants, roleId);
  return set.has(key) || set.has("full_access");
}

/** Result of attempting to delete a role — lets the UI branch between "just
 *  gone", "N people need to be reassigned first", or a protected role that
 *  can't be removed at all, without throwing. */
export interface DeleteRoleResult {
  ok: boolean;
  reason?: "platform_owner" | "own_role" | "in_use";
  affectedMembers?: TeamMember[];
}

/** Result of attempting to delete a team member. */
export interface DeleteMemberResult {
  ok: boolean;
  reason?: "self";
}

interface PermissionsContextValue {
  /** Every role's saved capability grants — what "Save changes" writes to. */
  grants: GrantMap;
  /** Persist a role's edited permission list (called by the Permissions matrix page). */
  saveGrants: (roleId: string, keys: PermissionKey[]) => void;

  /** Built-in catalogue plus any administrator-created roles — the single
   *  list every role picker/tab strip/browser should render from. */
  allRoles: RoleDef[];
  /** Look up any role (built-in or custom) by id. */
  getRoleById: (roleId: string) => RoleDef | undefined;
  /** True for roles created via "Add Role" (kept for UI that only wants to
   *  label roles as custom — deletion itself is no longer restricted to
   *  these; see `deleteRole`). */
  isCustomRole: (roleId: string) => boolean;
  /** Whether a role can be deleted at all: everything except Platform Owner
   *  (the one role the spec says always has full access, non-negotiable)
   *  and whichever role the signed-in administrator is currently using. */
  canDeleteRole: (roleId: string) => boolean;
  /** Create a new role from the "Add Role" form and return its generated id. */
  addRole: (input: AddRoleInput) => string;
  /** Remove any role — built-in or custom — except Platform Owner and the
   *  administrator's own role. Fails with `reason: "in_use"` (and the list
   *  of who's affected) unless `reassignTo` is given, in which case affected
   *  members are moved to that role first, then this one is deleted. */
  deleteRole: (roleId: string, reassignTo?: string) => DeleteRoleResult;

  /** Team directory — who has a login, their role, branch and status. */
  team: TeamMember[];
  /** People currently assigned to a given role (built-in or custom). */
  membersInRole: (roleId: string) => TeamMember[];
  /** Reassign a single team member to a different role (Users page). */
  setMemberRole: (email: string, roleId: string) => void;
  /** Remove a team member entirely. Fails with `reason: "self"` for the
   *  signed-in administrator's own account — you can't delete yourself. */
  deleteMember: (email: string) => DeleteMemberResult;

  /** The real signed-in administrator's role — never changes while previewing. */
  adminRoleId: string;
  /** The role currently driving the rendered UI (adminRoleId, unless a preview is active). */
  activeRoleId: string;
  /** Resolved role record for `activeRoleId`. */
  role: RoleDef;
  /** The single check every screen should use: `can("manage_inventory")`, `can("delete")`, etc. */
  can: (key: PermissionKey) => boolean;
  /** Workspaces the active role may access — drives the sidebar/topbar switcher and `/workspaces`. */
  allowedWorkspaces: WorkspaceDef[];

  /** True while an administrator is previewing a role other than their own. */
  isPreviewing: boolean;
  previewRoleId: string | null;
  /** Rebuild the entire CRM as the given role would see it, instantly. */
  enterPreview: (roleId: string) => void;
  /** Restore the administrator's own view. */
  exitPreview: () => void;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [grants, setGrants] = useState<GrantMap>(initialGrants);
  const [customRoles, setCustomRoles] = useState<RoleDef[]>([]);
  // Built-in roles (from lib/permissions.ts) that an administrator deleted.
  // The static catalogue itself is never mutated — we just filter these ids
  // out of every list the app renders from `allRoles`.
  const [removedBuiltInRoles, setRemovedBuiltInRoles] = useState<string[]>([]);
  const [team, setTeam] = useState<TeamMember[]>(TEAM_SEED);
  const [previewRoleId, setPreviewRoleId] = useState<string | null>(null);

  const adminRoleId = CURRENT_USER.roleId;
  const activeRoleId = previewRoleId ?? adminRoleId;

  const allRoles = useMemo(
    () => [...ROLES, ...customRoles].filter((r) => !removedBuiltInRoles.includes(r.id)),
    [customRoles, removedBuiltInRoles]
  );
  const roleMap = useMemo(() => Object.fromEntries(allRoles.map((r) => [r.id, r])), [allRoles]);
  const getRoleById = useCallback((roleId: string) => roleMap[roleId], [roleMap]);
  const isCustomRole = useCallback(
    (roleId: string) => customRoles.some((r) => r.id === roleId),
    [customRoles]
  );
  const canDeleteRole = useCallback(
    (roleId: string) => roleId !== "platform_owner" && roleId !== adminRoleId,
    [adminRoleId]
  );

  const saveGrants = useCallback((roleId: string, keys: PermissionKey[]) => {
    setGrants((prev) => ({ ...prev, [roleId]: keys }));
  }, []);

  const addRole = useCallback(({ label, summary, workspaces, permissions = [] }: AddRoleInput) => {
    const base = slugify(label);
    let id = base;
    let n = 2;
    // Guard against name collisions with built-ins or previously created roles.
    while (ROLES.some((r) => r.id === id) || customRoles.some((r) => r.id === id)) {
      id = `${base}_${n++}`;
    }
    const newRole: RoleDef = {
      id,
      label: label.trim(),
      summary: summary?.trim() || `Custom role created by an administrator.`,
      workspaces: workspaces.length > 0 ? workspaces : WORKSPACES.map((w) => w.id),
      permissions,
    };
    setCustomRoles((prev) => [...prev, newRole]);
    setGrants((prev) => ({ ...prev, [id]: permissions }));
    return id;
  }, [customRoles]);

  const membersInRole = useCallback(
    (roleId: string) => team.filter((m) => m.roleId === roleId),
    [team]
  );

  const setMemberRole = useCallback((email: string, roleId: string) => {
    setTeam((prev) => prev.map((m) => (m.email === email ? { ...m, roleId } : m)));
  }, []);

  const deleteRole = useCallback((roleId: string, reassignTo?: string): DeleteRoleResult => {
    // Platform Owner always has full access by design (matches the spec) —
    // it's the one role that can never be removed.
    if (roleId === "platform_owner") {
      return { ok: false, reason: "platform_owner" };
    }
    // An administrator can't delete the role they themselves are signed in
    // as — that would leave nobody able to administer the account.
    if (roleId === adminRoleId) {
      return { ok: false, reason: "own_role" };
    }
    const affected = team.filter((m) => m.roleId === roleId);
    if (affected.length > 0 && !reassignTo) {
      return { ok: false, reason: "in_use", affectedMembers: affected };
    }
    if (affected.length > 0 && reassignTo) {
      setTeam((prev) => prev.map((m) => (m.roleId === roleId ? { ...m, roleId: reassignTo } : m)));
    }
    // Built-in roles simply stop being offered anywhere (hidden), since the
    // static catalogue in lib/permissions.ts is read-only; custom roles are
    // fully removed from state. Either way `allRoles` no longer includes it.
    setCustomRoles((prev) => prev.filter((r) => r.id !== roleId));
    setRemovedBuiltInRoles((prev) => (prev.includes(roleId) ? prev : [...prev, roleId]));
    setGrants((prev) => {
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
    // If the role being deleted is currently being previewed, drop back to
    // the administrator's own view rather than previewing a role that no
    // longer exists.
    setPreviewRoleId((prev) => (prev === roleId ? null : prev));
    return { ok: true };
  }, [adminRoleId, team]);

  const deleteMember = useCallback((email: string): DeleteMemberResult => {
    if (email === CURRENT_USER.email) {
      return { ok: false, reason: "self" };
    }
    setTeam((prev) => prev.filter((m) => m.email !== email));
    return { ok: true };
  }, []);

  const enterPreview = useCallback((roleId: string) => setPreviewRoleId(roleId), []);
  const exitPreview = useCallback(() => setPreviewRoleId(null), []);

  const role = useMemo(
    () => getRoleById(activeRoleId) ?? allRoles[allRoles.length - 1],
    [getRoleById, activeRoleId, allRoles]
  );

  const can = useCallback(
    (key: PermissionKey) => checkGrantedPermission(grants, activeRoleId, key),
    [grants, activeRoleId]
  );

  const allowedWorkspaces = useMemo(() => {
    const r = getRoleById(activeRoleId);
    if (!r) return [];
    return WORKSPACES.filter((w) => r.workspaces.includes(w.id));
  }, [getRoleById, activeRoleId]);

  const value = useMemo<PermissionsContextValue>(
    () => ({
      grants,
      saveGrants,
      allRoles,
      getRoleById,
      isCustomRole,
      canDeleteRole,
      addRole,
      deleteRole,
      team,
      membersInRole,
      setMemberRole,
      deleteMember,
      adminRoleId,
      activeRoleId,
      role,
      can,
      allowedWorkspaces,
      isPreviewing: previewRoleId !== null,
      previewRoleId,
      enterPreview,
      exitPreview,
    }),
    [
      grants, saveGrants, allRoles, getRoleById, isCustomRole, canDeleteRole, addRole, deleteRole,
      team, membersInRole, setMemberRole, deleteMember, adminRoleId, activeRoleId,
      role, can, allowedWorkspaces, previewRoleId, enterPreview, exitPreview,
    ]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error("usePermissions() must be used within a <PermissionsProvider>");
  }
  return ctx;
}
