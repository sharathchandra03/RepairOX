"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Permission-driven rendering + staff/auth context.

   Single integration point for the whole access system. It transparently
   runs in one of two modes:

     • Supabase mode  (when NEXT_PUBLIC_SUPABASE_* env vars are present):
         - real authentication via Supabase Auth
         - roles / permission grants read from Postgres
         - staff directory read from Postgres (RLS enforced)
         - all privileged writes go through server API routes (/api/*)

     • Local mode  (no env vars): the original localStorage prototype, so the
         app keeps working with zero configuration.

   Every consuming component uses `usePermissions()` and never needs to know
   which mode is active.
   ────────────────────────────────────────────────────────────────────────── */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import {
  hashPassword,
  verifyPassword,
  normalizeEmail,
  computeLandingHref,
  type SalaryType,
} from "@/lib/auth";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { rowToStaff, type StaffRow } from "@/lib/staff-map";
import { setCurrentActor } from "@/lib/activity-log";
import {
  type StoreFeatureVisibility,
  type VisibilityMode,
  resolveVisibility,
  resolveVisibilityByHref,
} from "@/lib/feature-visibility";
import {
  isDemoRole,
  getDemoRoleIds,
  addDemoRole,
  removeDemoRole,
  setDemoRoleIds,
  demoGetItem,
  demoSetItem,
  isDemoSeeded,
  markDemoSeeded,
  resetDemoData,
} from "@/lib/demo-mode";
import { getDemoAccessPayload, DEMO_TEAM } from "@/lib/demo-seed-data";

export type GrantMap = Record<string, PermissionKey[] | "all">;

function initialGrants(): GrantMap {
  const map: GrantMap = {};
  for (const r of ROLES) map[r.id] = r.permissions;
  return map;
}

function slugify(label: string): string {
  return (
    label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "role"
  );
}

function nextEmployeeId(team: TeamMember[]): string {
  let max = 0;
  for (const m of team) {
    const match = /^EMP-(\d+)$/.exec(m.id ?? "");
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `EMP-${String(max + 1).padStart(3, "0")}`;
}

/* ── Local-mode persistence (only used when Supabase is NOT configured) ───── */
const ACCESS_KEY = "repairox-access";
const SESSION_KEY = "repairox-session";
const FEATURE_VISIBILITY_KEY = "repairox-feature-visibility";

interface PersistedAccess {
  grants: GrantMap;
  customRoles: RoleDef[];
  removedBuiltInRoles: string[];
  team: TeamMember[];
}

function migrateTeam(team: TeamMember[]): TeamMember[] {
  return team.map((m, i) => ({
    ...m,
    id: m.id ?? `EMP-${String(i + 1).padStart(3, "0")}`,
    loginEnabled: m.loginEnabled ?? m.status === "active",
    status: m.status ?? "active",
  }));
}

function loadAccess(): PersistedAccess | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACCESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedAccess>;
    return {
      grants: { ...initialGrants(), ...(parsed.grants ?? {}) },
      customRoles: parsed.customRoles ?? [],
      removedBuiltInRoles: parsed.removedBuiltInRoles ?? [],
      team: migrateTeam(parsed.team ?? TEAM_SEED),
    };
  } catch {
    return null;
  }
}

function loadSessionEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function loadFeatureVisibility(): StoreFeatureVisibility | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FEATURE_VISIBILITY_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoreFeatureVisibility;
  } catch {
    return null;
  }
}

export interface AddRoleInput {
  label: string;
  summary?: string;
  workspaces: WorkspaceId[];
  permissions?: PermissionKey[];
}

export interface AddStaffInput {
  name: string;
  phone?: string;
  email: string;
  hasLogin: boolean;
  password?: string;
  roleId: string;
  branch: string;
  salaryType?: SalaryType;
  salaryAmount?: number;
  department?: string;
  designation?: string;
}

export interface AddStaffResult {
  ok: boolean;
  reason?: "duplicate_email" | "missing_password" | "missing_email" | "server_error";
  member?: TeamMember;
}

export type LoginResult =
  | { ok: true; account: TeamMember; landingHref: string }
  | { ok: false; reason: "not_found" | "bad_password" | "login_disabled" | "suspended" | "invited" };

export function resolveGrantedKeys(grants: GrantMap, roleId: string): Set<PermissionKey> {
  const g = grants[roleId];
  if (!g || g === "all") return new Set(ALL_PERMISSIONS.map((p) => p.key));
  return new Set(g);
}

export function checkGrantedPermission(grants: GrantMap, roleId: string, key: PermissionKey): boolean {
  const set = resolveGrantedKeys(grants, roleId);
  return set.has(key) || set.has("full_access");
}

export interface DeleteRoleResult {
  ok: boolean;
  reason?: "platform_owner" | "own_role" | "in_use";
  affectedMembers?: TeamMember[];
}

export interface DeleteMemberResult {
  ok: boolean;
  reason?: "self";
}

interface PermissionsContextValue {
  grants: GrantMap;
  saveGrants: (roleId: string, keys: PermissionKey[]) => void;

  allRoles: RoleDef[];
  getRoleById: (roleId: string) => RoleDef | undefined;
  isCustomRole: (roleId: string) => boolean;
  canDeleteRole: (roleId: string) => boolean;
  addRole: (input: AddRoleInput) => string;
  deleteRole: (roleId: string, reassignTo?: string) => DeleteRoleResult;
  updateRoleWorkspaces: (roleId: string, workspaces: WorkspaceId[]) => void;

  team: TeamMember[];
  membersInRole: (roleId: string) => TeamMember[];
  getStaffById: (id: string) => TeamMember | undefined;
  setMemberRole: (email: string, roleId: string) => void;
  deleteMember: (email: string) => DeleteMemberResult;

  addStaff: (input: AddStaffInput) => Promise<AddStaffResult>;
  updateStaff: (id: string, updates: Partial<TeamMember>) => void;
  /** Self-service: the signed-in user edits their own name / phone / photo. */
  updateProfile: (updates: { name?: string; phone?: string; avatarUrl?: string | null }) => Promise<{ ok: boolean; reason?: string }>;
  resetPassword: (id: string, newPassword: string) => void;
  setStaffStatus: (id: string, status: TeamMember["status"]) => void;
  toggleLogin: (id: string, enabled: boolean, password?: string) => void;

  authReady: boolean;
  currentUser: TeamMember | null;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
  landingForRole: (roleId: string) => string;

  adminRoleId: string;
  activeRoleId: string;
  role: RoleDef;
  can: (key: PermissionKey) => boolean;
  allowedWorkspaces: WorkspaceDef[];

  isPreviewing: boolean;
  previewRoleId: string | null;
  enterPreview: (roleId: string) => void;
  exitPreview: () => void;

  /* ── Feature Visibility ── */
  featureVisibility: StoreFeatureVisibility;
  setFeatureVisibility: (roleId: string, featureId: string, mode: VisibilityMode) => void;
  setFeatureVisibilityBulk: (roleId: string, updates: Record<string, VisibilityMode>) => void;
  getVisibility: (featureId: string) => VisibilityMode;
  getVisibilityByHref: (href: string) => VisibilityMode;

  /* ── Demo Mode ── */
  isDemoMode: boolean;
  demoRoleIds: string[];
  toggleDemoRole: (roleId: string, enabled: boolean) => void;
  resetDemo: () => void;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [grants, setGrants] = useState<GrantMap>(initialGrants);
  const [customRoles, setCustomRoles] = useState<RoleDef[]>([]);
  const [removedBuiltInRoles, setRemovedBuiltInRoles] = useState<string[]>([]);
  const [team, setTeam] = useState<TeamMember[]>(TEAM_SEED);
  const [previewRoleId, setPreviewRoleId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [featureVisibility, setFeatureVisibilityState] = useState<StoreFeatureVisibility>({});
  const [demoRoleIds, setDemoRoleIdsState] = useState<string[]>(getDemoRoleIds);

  /* ── Supabase read helpers ── */
  const refreshTeamFromDb = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("staff").select("*").order("created_at", { ascending: true });
    if (error || !data) return;
    setTeam(data.map((r) => rowToStaff(r as StaffRow)));
  }, []);

  const loadAccessFromDb = useCallback(async () => {
    if (!supabase) return;
    const [{ data: dbRoles }, { data: dbGrants }, { data: dbFv }] = await Promise.all([
      supabase.from("roles").select("*"),
      supabase.from("role_permissions").select("*"),
      supabase.from("feature_visibility").select("*"),
    ]);
    if (!dbRoles || dbRoles.length === 0) return; // not seeded yet — keep static defaults

    // Grants map from role_permissions ('*' means all).
    const gmap: GrantMap = {};
    for (const r of dbRoles) gmap[r.id] = [];
    for (const g of (dbGrants ?? [])) {
      if (g.permission_key === "*") gmap[g.role_id] = "all";
      else if (gmap[g.role_id] !== "all") (gmap[g.role_id] as PermissionKey[]).push(g.permission_key);
    }

    const builtinIds = new Set(ROLES.map((r) => r.id));
    const presentIds = new Set(dbRoles.map((r) => r.id));
    const custom: RoleDef[] = dbRoles
      .filter((r) => r.is_custom || !builtinIds.has(r.id))
      .map((r) => ({
        id: r.id,
        label: r.label,
        summary: r.summary ?? "",
        workspaces: (r.workspaces ?? []) as WorkspaceId[],
        permissions: gmap[r.id] === "all" ? "all" : ((gmap[r.id] as PermissionKey[]) ?? []),
      }));
    const removed = ROLES.filter((r) => !presentIds.has(r.id)).map((r) => r.id);

    setGrants({ ...initialGrants(), ...gmap });
    setCustomRoles(custom);
    setRemovedBuiltInRoles(removed);

    // Feature visibility from DB: rows have role_id, feature_id, mode
    if (dbFv && dbFv.length > 0) {
      const fvMap: StoreFeatureVisibility = {};
      for (const row of dbFv) {
        if (!fvMap[row.role_id]) fvMap[row.role_id] = {};
        fvMap[row.role_id][row.feature_id] = row.mode as VisibilityMode;
      }
      setFeatureVisibilityState(fvMap);
    }
  }, []);

  /* ── Authed API helper (browser → server routes) ── */
  const apiFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    let token: string | undefined;
    if (supabase) token = (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    let json: any = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { ok: res.ok, status: res.status, json };
  }, []);

  /* ── Hydration ── */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      // Local prototype mode.
      const access = loadAccess();
      if (access) {
        setGrants(access.grants);
        setCustomRoles(access.customRoles);
        setRemovedBuiltInRoles(access.removedBuiltInRoles);
        setTeam(access.team);
      }
      const fv = loadFeatureVisibility();
      if (fv) setFeatureVisibilityState(fv);
      setCurrentUserEmail(loadSessionEmail());
      setHydrated(true);
      return;
    }

    // Supabase mode.
    let active = true;
    (async () => {
      await loadAccessFromDb();
      // Also load feature visibility from localStorage (works as local cache
      // and ensures visibility config set by the owner applies to demo users
      // on the same device).
      const fv = loadFeatureVisibility();
      if (fv) setFeatureVisibilityState((prev) => {
        // Merge: DB takes priority, localStorage fills gaps
        return Object.keys(fv).length > 0 || Object.keys(prev).length === 0 ? { ...prev, ...fv } : prev;
      });
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user?.email ?? null;
      if (email) {
        await refreshTeamFromDb();
        if (active) setCurrentUserEmail(email);
      }
      if (active) setHydrated(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const email = session?.user?.email ?? null;
      setCurrentUserEmail(email);
      if (email) await refreshTeamFromDb();
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadAccessFromDb, refreshTeamFromDb]);

  // Persist local-mode state only (Supabase mode is authoritative in the DB).
  useEffect(() => {
    if (isSupabaseConfigured || !hydrated || typeof window === "undefined") return;
    try {
      const payload: PersistedAccess = { grants, customRoles, removedBuiltInRoles, team };
      localStorage.setItem(ACCESS_KEY, JSON.stringify(payload));
    } catch { /* ignore */ }
  }, [grants, customRoles, removedBuiltInRoles, team, hydrated]);

  useEffect(() => {
    if (isSupabaseConfigured || !hydrated || typeof window === "undefined") return;
    try {
      if (currentUserEmail) localStorage.setItem(SESSION_KEY, currentUserEmail);
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* ignore */ }
  }, [currentUserEmail, hydrated]);

  // Persist feature visibility — always use localStorage (shared across all users on this device).
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    try {
      localStorage.setItem(FEATURE_VISIBILITY_KEY, JSON.stringify(featureVisibility));
    } catch { /* ignore */ }
  }, [featureVisibility, hydrated]);

  const allRoles = useMemo(
    () => {
      const customIds = new Set(customRoles.map((r) => r.id));
      const builtIn = ROLES.filter((r) => !customIds.has(r.id) && !removedBuiltInRoles.includes(r.id));
      const custom = customRoles.filter((r) => !removedBuiltInRoles.includes(r.id));
      return [...builtIn, ...custom];
    },
    [customRoles, removedBuiltInRoles]
  );
  const roleMap = useMemo(() => Object.fromEntries(allRoles.map((r) => [r.id, r])), [allRoles]);
  const getRoleById = useCallback((roleId: string) => roleMap[roleId], [roleMap]);

  const allowedWorkspacesForRole = useCallback(
    (roleId: string): WorkspaceDef[] => {
      const r = roleMap[roleId];
      if (!r) return [];
      return WORKSPACES.filter((w) => r.workspaces.includes(w.id));
    },
    [roleMap]
  );

  const isCustomRole = useCallback(
    (roleId: string) => customRoles.some((r) => r.id === roleId),
    [customRoles]
  );

  const currentUser = useMemo<TeamMember | null>(() => {
    if (!currentUserEmail) return null;
    const norm = normalizeEmail(currentUserEmail);
    return team.find((m) => normalizeEmail(m.email) === norm) ?? null;
  }, [currentUserEmail, team]);

  // Keep the activity-log actor in sync with the real signed-in user.
  useEffect(() => {
    setCurrentActor(
      currentUser?.name ?? null,
      currentUser?.branch ?? CURRENT_USER.branch
    );
  }, [currentUser?.name, currentUser?.branch]);

  const adminRoleId = currentUser?.roleId ?? CURRENT_USER.roleId;
  const activeRoleId = previewRoleId ?? adminRoleId;

  /** True when the current user is in a demo-flagged role. */
  const isDemoMode = useMemo(() => isDemoRole(adminRoleId), [adminRoleId, demoRoleIds]);

  const canDeleteRole = useCallback(
    (roleId: string) => roleId !== "platform_owner" && roleId !== adminRoleId,
    [adminRoleId]
  );

  /* ── Grant edits ── */
  const saveGrants = useCallback((roleId: string, keys: PermissionKey[]) => {
    setGrants((prev) => ({ ...prev, [roleId]: keys }));
    if (isSupabaseConfigured) {
      apiFetch(`/api/roles/${roleId}`, { method: "PATCH", body: JSON.stringify({ permissions: keys }) });
    }
  }, [apiFetch]);

  const addRole = useCallback(({ label, summary, workspaces, permissions = [] }: AddRoleInput) => {
    const base = slugify(label);
    let id = base;
    let n = 2;
    while (ROLES.some((r) => r.id === id) || customRoles.some((r) => r.id === id)) id = `${base}_${n++}`;
    const newRole: RoleDef = {
      id,
      label: label.trim(),
      summary: summary?.trim() || `Custom role created by an administrator.`,
      workspaces: workspaces.length > 0 ? workspaces : WORKSPACES.map((w) => w.id),
      permissions,
    };
    setCustomRoles((prev) => [...prev, newRole]);
    setGrants((prev) => ({ ...prev, [id]: permissions }));
    if (isSupabaseConfigured) {
      apiFetch("/api/roles", {
        method: "POST",
        body: JSON.stringify({ id, label: newRole.label, summary: newRole.summary, workspaces: newRole.workspaces, permissions }),
      });
    }
    return id;
  }, [customRoles, apiFetch]);

  const updateRoleWorkspaces = useCallback((roleId: string, workspaces: WorkspaceId[]) => {
    // Update built-in roles by moving them to custom (override) or update existing custom role.
    setCustomRoles((prev) => {
      const existing = prev.find((r) => r.id === roleId);
      if (existing) {
        return prev.map((r) => (r.id === roleId ? { ...r, workspaces } : r));
      }
      // Built-in role — clone it into customRoles with the new workspaces.
      const builtIn = ROLES.find((r) => r.id === roleId);
      if (builtIn) {
        return [...prev, { ...builtIn, workspaces }];
      }
      return prev;
    });
    if (isSupabaseConfigured) {
      apiFetch(`/api/roles/${roleId}`, { method: "PATCH", body: JSON.stringify({ workspaces }) });
    }
  }, [apiFetch]);

  const membersInRole = useCallback((roleId: string) => team.filter((m) => m.roleId === roleId), [team]);
  const getStaffById = useCallback((id: string) => team.find((m) => m.id === id), [team]);

  const setMemberRole = useCallback((email: string, roleId: string) => {
    const now = new Date().toISOString();
    const member = team.find((m) => m.email === email);
    setTeam((prev) => prev.map((m) => (m.email === email ? { ...m, roleId, updatedAt: now } : m)));
    if (isSupabaseConfigured && member) {
      apiFetch(`/api/staff/${member.id}`, { method: "PATCH", body: JSON.stringify({ roleId }) })
        .then(() => refreshTeamFromDb());
    }
  }, [team, apiFetch, refreshTeamFromDb]);

  const deleteRole = useCallback((roleId: string, reassignTo?: string): DeleteRoleResult => {
    if (roleId === "platform_owner") return { ok: false, reason: "platform_owner" };
    if (roleId === adminRoleId) return { ok: false, reason: "own_role" };
    const affected = team.filter((m) => m.roleId === roleId);
    if (affected.length > 0 && !reassignTo) return { ok: false, reason: "in_use", affectedMembers: affected };
    if (affected.length > 0 && reassignTo) {
      setTeam((prev) => prev.map((m) => (m.roleId === roleId ? { ...m, roleId: reassignTo } : m)));
    }
    setCustomRoles((prev) => prev.filter((r) => r.id !== roleId));
    setRemovedBuiltInRoles((prev) => (prev.includes(roleId) ? prev : [...prev, roleId]));
    setGrants((prev) => { const next = { ...prev }; delete next[roleId]; return next; });
    setPreviewRoleId((prev) => (prev === roleId ? null : prev));
    if (isSupabaseConfigured) {
      const q = reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : "";
      apiFetch(`/api/roles/${roleId}${q}`, { method: "DELETE" }).then(() => refreshTeamFromDb());
    }
    return { ok: true };
  }, [adminRoleId, team, apiFetch, refreshTeamFromDb]);

  const deleteMember = useCallback((email: string): DeleteMemberResult => {
    const selfEmail = currentUser?.email ?? CURRENT_USER.email;
    if (normalizeEmail(email) === normalizeEmail(selfEmail)) return { ok: false, reason: "self" };
    const member = team.find((m) => m.email === email);
    setTeam((prev) => prev.filter((m) => m.email !== email));
    if (isSupabaseConfigured && member) {
      apiFetch(`/api/staff/${member.id}`, { method: "DELETE" }).then(() => refreshTeamFromDb());
    }
    return { ok: true };
  }, [currentUser, team, apiFetch, refreshTeamFromDb]);

  /* ── Staff creation ── */
  const addStaff = useCallback(async (input: AddStaffInput): Promise<AddStaffResult> => {
    const email = normalizeEmail(input.email);
    if (input.hasLogin && !email) return { ok: false, reason: "missing_email" };
    if (input.hasLogin && !input.password) return { ok: false, reason: "missing_password" };

    if (isSupabaseConfigured) {
      const res = await apiFetch("/api/staff", {
        method: "POST",
        body: JSON.stringify({ ...input, email: input.email, createdBy: currentUser?.name }),
      });
      if (!res.ok || !res.json?.ok) {
        return { ok: false, reason: res.json?.reason ?? "server_error" };
      }
      await refreshTeamFromDb();
      return { ok: true, member: res.json.member };
    }

    // Local mode
    if (email && team.some((m) => normalizeEmail(m.email) === email)) return { ok: false, reason: "duplicate_email" };
    const id = nextEmployeeId(team);
    const now = new Date().toISOString();
    const member: TeamMember = {
      id,
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone?.trim() || undefined,
      roleId: input.roleId,
      branch: input.branch,
      status: "active",
      loginEnabled: input.hasLogin,
      passwordHash: input.hasLogin && input.password ? hashPassword(input.password, id) : undefined,
      department: input.department,
      designation: input.designation ?? roleMap[input.roleId]?.label,
      joiningDate: now.slice(0, 10),
      salaryType: input.salaryType,
      salaryAmount: input.salaryAmount,
      createdBy: currentUser?.name ?? CURRENT_USER.name,
      createdAt: now,
      updatedAt: now,
    };
    setTeam((prev) => [member, ...prev]);
    return { ok: true, member };
  }, [team, currentUser, roleMap, apiFetch, refreshTeamFromDb]);

  const updateStaff = useCallback((id: string, updates: Partial<TeamMember>) => {
    const now = new Date().toISOString();
    setTeam((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates, updatedAt: now } : m)));
    if (isSupabaseConfigured) {
      apiFetch(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify(updates) }).then(() => refreshTeamFromDb());
    }
  }, [apiFetch, refreshTeamFromDb]);

  /* Self-service profile update — works for every signed-in user (not just
     admins). Applies an optimistic local change, then persists.

     Persistence strategy (Supabase mode):
       1) Write the user's OWN staff row straight from the browser under RLS.
          This needs no server-only service-role key, so profile saving works
          even if that key isn't configured on the deployment. (Admins are
          allowed by the staff_write policy; other staff by staff_self_update.)
       2) If that direct write is blocked (policy not applied yet), fall back to
          the privileged /api/profile route (service-role key).
     Either way the DB is the source of truth, so the change survives refresh
     and logout/login. */
  const updateProfile = useCallback(async (
    updates: { name?: string; phone?: string; avatarUrl?: string | null }
  ): Promise<{ ok: boolean; reason?: string }> => {
    const id = currentUser?.id;
    if (!id) return { ok: false, reason: "no_user" };
    const now = new Date().toISOString();
    setTeam((prev) => prev.map((m) => {
      if (m.id !== id) return m;
      const next: TeamMember = { ...m, updatedAt: now };
      if (updates.name !== undefined) next.name = updates.name;
      if (updates.phone !== undefined) next.phone = updates.phone;
      if (updates.avatarUrl !== undefined) next.avatarUrl = updates.avatarUrl ?? undefined;
      return next;
    }));

    if (isSupabaseConfigured && supabase) {
      // 1) Direct, RLS-protected write of the caller's own row.
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.phone !== undefined) payload.phone = updates.phone || null;
      if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl ?? null;

      const direct = await supabase.from("staff").update(payload).eq("id", id).select("*").maybeSingle();
      if (!direct.error && direct.data) {
        const saved = rowToStaff(direct.data as StaffRow);
        setTeam((prev) => prev.map((m) => (m.id === id ? saved : m)));
        return { ok: true };
      }

      // 2) Fall back to the privileged server route.
      const res = await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify(updates) });
      if (!res.ok || !res.json?.ok) {
        // Nothing persisted — discard the optimistic change so the form shows
        // the real DB state instead of falsely appearing saved until a refresh.
        await refreshTeamFromDb();
        return { ok: false, reason: res.json?.reason ?? (res.status === 401 ? "unauthorized" : "server_error") };
      }
      const saved = res.json.member as TeamMember | undefined;
      if (saved) setTeam((prev) => prev.map((m) => (m.id === saved.id ? saved : m)));
      await refreshTeamFromDb();
    }
    return { ok: true };
  }, [currentUser, apiFetch, refreshTeamFromDb]);

  const resetPassword = useCallback((id: string, newPassword: string) => {
    const now = new Date().toISOString();
    setTeam((prev) => prev.map((m) => (m.id === id
      ? { ...m, passwordHash: hashPassword(newPassword, id), loginEnabled: true, updatedAt: now }
      : m)));
    if (isSupabaseConfigured) {
      apiFetch(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify({ password: newPassword, loginEnabled: true }) })
        .then(() => refreshTeamFromDb());
    }
  }, [apiFetch, refreshTeamFromDb]);

  const setStaffStatus = useCallback((id: string, status: TeamMember["status"]) => {
    const now = new Date().toISOString();
    setTeam((prev) => prev.map((m) => (m.id === id ? { ...m, status, updatedAt: now } : m)));
    if (isSupabaseConfigured) {
      apiFetch(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }).then(() => refreshTeamFromDb());
    }
  }, [apiFetch, refreshTeamFromDb]);

  const toggleLogin = useCallback((id: string, enabled: boolean, password?: string) => {
    const now = new Date().toISOString();
    setTeam((prev) => prev.map((m) => {
      if (m.id !== id) return m;
      return {
        ...m,
        loginEnabled: enabled,
        passwordHash: enabled && password ? hashPassword(password, id) : m.passwordHash,
        updatedAt: now,
      };
    }));
    if (isSupabaseConfigured) {
      apiFetch(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify({ loginEnabled: enabled, ...(password ? { password } : {}) }) })
        .then(() => refreshTeamFromDb());
    }
  }, [apiFetch, refreshTeamFromDb]);

  /* ── Session ── */
  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const norm = normalizeEmail(email);

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: norm, password });
      if (error || !data.user) {
        const msg = error?.message?.toLowerCase() ?? "";
        if (msg.includes("ban")) return { ok: false, reason: "suspended" };
        return { ok: false, reason: "bad_password" };
      }
      // Load the linked profile to drive permissions + landing.
      const { data: rows } = await supabase.from("staff").select("*").ilike("email", norm).limit(1);
      const account = rows && rows[0] ? rowToStaff(rows[0] as StaffRow) : null;
      if (!account) { await supabase.auth.signOut(); return { ok: false, reason: "not_found" }; }
      if (!account.loginEnabled) { await supabase.auth.signOut(); return { ok: false, reason: "login_disabled" }; }
      if (account.status === "suspended") { await supabase.auth.signOut(); return { ok: false, reason: "suspended" }; }
      await refreshTeamFromDb();
      setCurrentUserEmail(account.email);
      setPreviewRoleId(null);
      return { ok: true, account, landingHref: computeLandingHref(allowedWorkspacesForRole(account.roleId)) };
    }

    // Local mode
    const acc = team.find((m) => normalizeEmail(m.email) === norm);
    if (!acc) return { ok: false, reason: "not_found" };
    if (!acc.loginEnabled || !acc.passwordHash) return { ok: false, reason: "login_disabled" };
    if (acc.status === "suspended") return { ok: false, reason: "suspended" };
    if (acc.status === "invited") return { ok: false, reason: "invited" };
    if (!verifyPassword(password, acc.id, acc.passwordHash)) return { ok: false, reason: "bad_password" };
    const now = new Date().toISOString();
    setTeam((prev) => prev.map((m) => (m.id === acc.id ? { ...m, lastLogin: now } : m)));
    setCurrentUserEmail(acc.email);
    setPreviewRoleId(null);
    return { ok: true, account: { ...acc, lastLogin: now }, landingHref: computeLandingHref(allowedWorkspacesForRole(acc.roleId)) };
  }, [team, allowedWorkspacesForRole, refreshTeamFromDb]);

  const logout = useCallback(() => {
    if (isSupabaseConfigured && supabase) supabase.auth.signOut();
    setCurrentUserEmail(null);
    setPreviewRoleId(null);
  }, []);

  const landingForRole = useCallback(
    (roleId: string) => computeLandingHref(allowedWorkspacesForRole(roleId)),
    [allowedWorkspacesForRole]
  );

  const enterPreview = useCallback((roleId: string) => setPreviewRoleId(roleId), []);
  const exitPreview = useCallback(() => setPreviewRoleId(null), []);

  /* ── Feature Visibility ── */
  const setFeatureVisibility = useCallback((roleId: string, featureId: string, mode: VisibilityMode) => {
    setFeatureVisibilityState((prev) => {
      const roleMap = { ...(prev[roleId] ?? {}) };
      if (mode === "visible") {
        delete roleMap[featureId]; // Only store overrides; "visible" is the default
      } else {
        roleMap[featureId] = mode;
      }
      const next = { ...prev, [roleId]: roleMap };
      // Clean up empty role maps
      if (Object.keys(next[roleId]).length === 0) delete next[roleId];
      return next;
    });
    if (isSupabaseConfigured) {
      if (mode === "visible") {
        apiFetch("/api/feature-visibility", { method: "DELETE", body: JSON.stringify({ roleId, featureId }) });
      } else {
        apiFetch("/api/feature-visibility", { method: "PUT", body: JSON.stringify({ roleId, featureId, mode }) });
      }
    }
  }, [apiFetch]);

  const setFeatureVisibilityBulk = useCallback((roleId: string, updates: Record<string, VisibilityMode>) => {
    setFeatureVisibilityState((prev) => {
      const roleMap = { ...(prev[roleId] ?? {}) };
      for (const [featureId, mode] of Object.entries(updates)) {
        if (mode === "visible") {
          delete roleMap[featureId];
        } else {
          roleMap[featureId] = mode;
        }
      }
      const next = { ...prev, [roleId]: roleMap };
      if (Object.keys(next[roleId]).length === 0) delete next[roleId];
      return next;
    });
    if (isSupabaseConfigured) {
      apiFetch("/api/feature-visibility", { method: "PUT", body: JSON.stringify({ roleId, bulk: updates }) });
    }
  }, [apiFetch]);

  /** Resolve visibility for the ACTIVE role (respects preview mode). */
  const getVisibility = useCallback(
    (featureId: string): VisibilityMode => resolveVisibility(featureVisibility, activeRoleId, featureId),
    [featureVisibility, activeRoleId]
  );

  /** Resolve visibility by href for the ACTIVE role (respects preview mode). */
  const getVisibilityByHref = useCallback(
    (href: string): VisibilityMode => resolveVisibilityByHref(featureVisibility, activeRoleId, href),
    [featureVisibility, activeRoleId]
  );

  /* ── Demo Mode controls ── */
  const toggleDemoRole = useCallback((roleId: string, enabled: boolean) => {
    if (enabled) {
      addDemoRole(roleId);
    } else {
      removeDemoRole(roleId);
    }
    setDemoRoleIdsState(getDemoRoleIds());
  }, []);

  const resetDemo = useCallback(() => {
    resetDemoData();
    // Force a page reload to re-seed demo data
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  const role = useMemo(
    () => getRoleById(activeRoleId) ?? allRoles[allRoles.length - 1],
    [getRoleById, activeRoleId, allRoles]
  );

  const can = useCallback(
    (key: PermissionKey) => checkGrantedPermission(grants, activeRoleId, key),
    [grants, activeRoleId]
  );

  const allowedWorkspaces = useMemo(
    () => allowedWorkspacesForRole(activeRoleId),
    [allowedWorkspacesForRole, activeRoleId]
  );

  const value = useMemo<PermissionsContextValue>(
    () => {
      // In demo mode, expose demo team instead of real staff
      const exposedTeam = isDemoMode ? DEMO_TEAM : team;
      return {
        grants, saveGrants, allRoles, getRoleById, isCustomRole, canDeleteRole, addRole, deleteRole, updateRoleWorkspaces,
        team: exposedTeam, membersInRole: isDemoMode ? ((roleId: string) => DEMO_TEAM.filter((m) => m.roleId === roleId)) : membersInRole, getStaffById, setMemberRole, deleteMember,
        addStaff, updateStaff, updateProfile, resetPassword, setStaffStatus, toggleLogin,
        authReady: hydrated, currentUser, login, logout, landingForRole,
        adminRoleId, activeRoleId, role, can, allowedWorkspaces,
        isPreviewing: previewRoleId !== null, previewRoleId, enterPreview, exitPreview,
        featureVisibility, setFeatureVisibility, setFeatureVisibilityBulk, getVisibility, getVisibilityByHref,
        isDemoMode, demoRoleIds, toggleDemoRole, resetDemo,
      };
    },
    [
      grants, saveGrants, allRoles, getRoleById, isCustomRole, canDeleteRole, addRole, deleteRole, updateRoleWorkspaces,
      team, membersInRole, getStaffById, setMemberRole, deleteMember,
      addStaff, updateStaff, updateProfile, resetPassword, setStaffStatus, toggleLogin,
      hydrated, currentUser, login, logout, landingForRole,
      adminRoleId, activeRoleId, role, can, allowedWorkspaces, previewRoleId, enterPreview, exitPreview,
      featureVisibility, setFeatureVisibility, setFeatureVisibilityBulk, getVisibility, getVisibilityByHref,
      isDemoMode, demoRoleIds, toggleDemoRole, resetDemo,
    ]
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error("usePermissions() must be used within a <PermissionsProvider>");
  return ctx;
}
