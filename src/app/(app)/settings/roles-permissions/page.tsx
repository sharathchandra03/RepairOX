"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronRight, Search, RotateCcw, Info, Eye, CheckCircle2, Trash2, Users, Mail, UserCog, Plus, KeyRound, MoreHorizontal, Power, Ban, Phone, Sparkles, CircleUser } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Can } from "@/components/common/can";
import { RequireCapability } from "@/components/common/require-capability";
import { CAP } from "@/lib/capabilities";


import { ChangeRoleDrawer } from "@/components/settings/change-role-drawer";
import { ChangeStoreDrawer } from "@/components/settings/change-store-drawer";
import { useStoreContext } from "@/lib/store-context";
import { DeleteMemberDialog } from "@/components/settings/delete-member-dialog";
import { ResetPasswordDrawer } from "@/components/settings/reset-password-drawer";
import { UserDetailsDrawer } from "@/components/settings/user-details-drawer";
import { WORKSPACE_MAP, type PermissionKey, type RoleDef, type WorkspaceId } from "@/lib/permissions";
import { usePermissions } from "@/lib/permissions-context";

import type { TeamMember } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { FEATURE_REGISTRY, featuresByWorkspace, type VisibilityMode, type FeatureEntry } from "@/lib/feature-visibility";
import { getDemoVisitCount } from "@/lib/demo-tracking";
import { RolesListTab, PermissionsTab } from "@/components/settings/roles/simple-roles";


/* ─── User category — groups roles into the four People buckets ──────────
   Management · Sales Agent · Technicians · Accounts. A user's category is
   derived from their ROLE (never stored separately), so adding a user with
   any of these roles files them under the right bucket automatically. Custom
   roles fall back to their workspaces / permission shape. */
type UserCategory = "management" | "sales" | "technician" | "accounts";

const ROLE_CATEGORY: Record<string, UserCategory> = {
  platform_owner: "management",
  developer_admin: "management",
  master_shop_owner: "management",
  shop_owner_branch_manager: "management",
  reception: "management",
  read_only_user: "management",
  sales_agent: "sales",
  sales_executive: "sales",
  technician: "technician",
  senior_technician: "technician",
  field_manager: "technician",
  ninja: "technician",
  cashier_accounts: "accounts",
  inventory_manager: "accounts",
};

/** Resolve the bucket for a role. Known roles use the map above; unknown
 *  (custom) roles are classified from their permission shape so a newly
 *  created role still lands in a sensible bucket. */
function categoryForRole(role: RoleDef | undefined, roleId: string): UserCategory {
  if (ROLE_CATEGORY[roleId]) return ROLE_CATEGORY[roleId];
  const perms = role?.permissions;
  const has = (k: string) =>
    perms === "all" || (Array.isArray(perms) && perms.includes(k as PermissionKey));
  // Management: can administer users / roles / branches, or full access.
  if (perms === "all" || has("manage_users") || has("manage_roles") || has("add_user") || has("full_access"))
    return "management";
  // Accounts: billing / ledger / inventory ownership.
  if (has("post_to_ledger") || has("manage_payments") || has("view_ledger") || has("manage_inventory") || has("manage_refunds"))
    return "accounts";
  // Sales: lead / sales ownership.
  if (has("leads_sales_agent") || has("manage_sales") || has("route_leads") || has("leads_view"))
    return "sales";
  // Technician: repair / field work.
  if (has("update_repair_status") || has("assign_technician") || has("manage_field_jobs") || has("update_pickup") || has("view_field_jobs"))
    return "technician";
  return "management";
}

const USER_CATEGORY_TABS: { value: UserCategory; label: string }[] = [
  { value: "management", label: "Management" },
  { value: "sales", label: "Sales Agent" },
  { value: "technician", label: "Technicians" },
  { value: "accounts", label: "Accounts" },
];

const STATUS_TONE: Record<TeamMember["status"], "success" | "warning" | "danger"> = {
  active: "success", invited: "warning", suspended: "danger",
};
const STATUS_LABEL: Record<TeamMember["status"], string> = {
  active: "Active", invited: "Invited", suspended: "Suspended",
};

type TabId = "roles" | "permissions" | "users" | "visibility";
const TABS: { id: TabId; label: string }[] = [
  { id: "roles", label: "Roles" },
  { id: "permissions", label: "Permissions" },
  { id: "users", label: "Users" },
  { id: "visibility", label: "Feature Visibility" },
];

export default function RolesPermissionsPage() {
  // Route-level guard: visible ONLY to users who can manage roles. The server
  // + RLS remain the real enforcement.
  return (
    <RequireCapability anyOf={CAP.admin.manageRoles}>
      <RolesPermissionsInner />
    </RequireCapability>
  );
}

function RolesPermissionsInner() {
  const {
    allRoles, getRoleById, team, setMemberRole, setMemberStore, deleteMember,
    resetPassword, setStaffStatus, toggleLogin,
    featureVisibility, setFeatureVisibility, setFeatureVisibilityBulk,
    adminRoleId, demoRoleIds, toggleDemoRole, resetDemo,
  } = usePermissions();

  const [tab, setTab] = useState<TabId>("roles");
  const [activeRoleId, setActiveRoleId] = useState(allRoles[0].id);
  const [createdToast, setCreatedToast] = useState(false);

  // Coming back from the Add Staff form — jump to the Users tab and confirm.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("created") === "1") {
      setTab("users");
      setCreatedToast(true);
      window.history.replaceState(null, "", "/settings/roles-permissions");
      const t = setTimeout(() => setCreatedToast(false), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  const canSeeVisibility = adminRoleId === "platform_owner" || adminRoleId === "master_shop_owner";
  const tabs = TABS.filter((t) => t.id !== "visibility" || canSeeVisibility);

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
        <span>Employees</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
        <span className="text-foreground">Roles, Access and Permissions</span>
      </nav>

      <h1 className="font-display text-xl font-extrabold tracking-tight">Roles, Access and Permissions</h1>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="mb-5 flex items-center gap-6 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px border-b-2 px-1 pb-2.5 text-[14px] font-semibold transition-colors",
                t.id === tab ? "border-[#4361EE] text-[#4361EE]" : "border-transparent text-zinc-500 hover:text-zinc-800"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "roles" && (
          <RolesListTab
            onEditPermissions={(id) => { setActiveRoleId(id); setTab("permissions"); }}
            onOpenUsers={() => setTab("users")}
          />
        )}
        {tab === "permissions" && (
          <PermissionsTab roleId={activeRoleId} onRoleChange={setActiveRoleId} />
        )}
        {tab === "users" && (
          <UsersTab
            team={team}
            allRoles={allRoles}
            getRoleById={getRoleById}
            setMemberRole={setMemberRole}
            setMemberStore={setMemberStore}
            deleteMember={deleteMember}
            resetPassword={resetPassword}
            setStaffStatus={setStaffStatus}
            toggleLogin={toggleLogin}
          />
        )}
        {tab === "visibility" && (
          <FeatureVisibilityTab
            allRoles={allRoles}
            featureVisibility={featureVisibility}
            setFeatureVisibility={setFeatureVisibility}
            setFeatureVisibilityBulk={setFeatureVisibilityBulk}
            activeRoleId={activeRoleId}
            setActiveRoleId={setActiveRoleId}
            demoRoleIds={demoRoleIds}
            toggleDemoRole={toggleDemoRole}
            resetDemo={resetDemo}
          />
        )}
      </div>

      {createdToast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2.5 text-[12.5px] font-medium text-emerald-700 shadow-[0_12px_40px_-12px_rgba(20,30,80,0.25)]">
          <CheckCircle2 className="h-4 w-4" />
          Staff member created and login account is ready.
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TAB 3 — Users & Assignment
   Every login, their assigned role, workspace access and branch — with
   change-role and remove actions. Ported from the old settings/users page.
   ───────────────────────────────────────────────────────────────────────── */
function UsersTab({
  team, allRoles, getRoleById, setMemberRole, setMemberStore, deleteMember,
  resetPassword, setStaffStatus, toggleLogin,
}: {
  team: TeamMember[];
  allRoles: RoleDef[];
  getRoleById: ReturnType<typeof usePermissions>["getRoleById"];
  setMemberRole: ReturnType<typeof usePermissions>["setMemberRole"];
  setMemberStore: ReturnType<typeof usePermissions>["setMemberStore"];
  deleteMember: ReturnType<typeof usePermissions>["deleteMember"];
  resetPassword: ReturnType<typeof usePermissions>["resetPassword"];
  setStaffStatus: ReturnType<typeof usePermissions>["setStaffStatus"];
  toggleLogin: ReturnType<typeof usePermissions>["toggleLogin"];
}) {
  const { currentUser } = usePermissions();
  const { stores } = useStoreContext();
  const selfEmail = currentUser?.email ?? "";

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | UserCategory>("all");
  const [viewing, setViewing] = useState<TeamMember | null>(null);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [changingStore, setChangingStore] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [resetting, setResetting] = useState<TeamMember | null>(null);
  const [resettingMode, setResettingMode] = useState<"reset" | "enable">("reset");
  const [suspending, setSuspending] = useState<TeamMember | null>(null);

  // Each user's category is DERIVED from their role (never stored). Adding a
  // user with any role files them under the matching bucket automatically.
  const categoryOf = useMemo(() => {
    const m = new Map<string, UserCategory>();
    for (const t of team) m.set(t.email, categoryForRole(getRoleById(t.roleId), t.roleId));
    return m;
  }, [team, getRoleById]);

  const categoryCounts = useMemo(() => {
    const c: Record<UserCategory, number> = { management: 0, sales: 0, technician: 0, accounts: 0 };
    for (const t of team) c[categoryOf.get(t.email) ?? "management"]++;
    return c;
  }, [team, categoryOf]);

  const rows = team.filter((t) => {
    const okQuery = (t.name + t.email + t.roleId).toLowerCase().includes(query.toLowerCase());
    const okCategory = category === "all" || categoryOf.get(t.email) === category;
    return okQuery && okCategory;
  });

  function changeRole(email: string, roleId: string) {
    setMemberRole(email, roleId);
    setEditing(null);
  }

  function confirmRemove() {
    if (!removing) return;
    deleteMember(removing.email);
    setRemoving(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          iconLeft={<Search className="h-4 w-4" />}
          placeholder="Search by name, email or role..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 max-w-sm"
        />
        <Can permission="manage_users">
          <Link href="/settings/roles-permissions/add-user">
            <Button size="md" className="gap-1.5 rounded-full">
              <Plus className="h-4 w-4" /> Add staff
            </Button>
          </Link>
        </Can>
      </div>

      {/* Category filter strip — Management · Sales Agent · Technicians · Accounts */}
      <div className="max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <SegmentedTabs
          size="sm"
          value={category}
          onChange={(v) => setCategory(v as "all" | UserCategory)}
          options={[
            { label: `All (${team.length})`, value: "all" },
            ...USER_CATEGORY_TABS.map((c) => ({
              label: `${c.label} (${categoryCounts[c.value]})`,
              value: c.value,
            })),
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border-2 border-zinc-300 bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead className="bg-[#EEF1FD]">
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[#4361EE]">
                <th className="px-6 py-3.5">Member</th>
                <th className="px-3 py-3.5">Role &amp; Access</th>
                <th className="w-[150px] px-3 py-3.5">Modules</th>
                <th className="px-3 py-3.5 pl-6">Branch</th>
                <th className="px-3 py-3.5">Status</th>
                <th className="w-[80px] px-3 py-3.5 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const role = getRoleById(t.roleId);
                const isSelf = t.email === selfEmail;
                const moduleCount = role?.workspaces.length ?? 0;
                return (
                  <motion.tr
                    key={t.email}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 * i }}
                    className="h-[84px] border-t border-zinc-500/60 align-middle transition-colors hover:bg-[#F7F8FE]"
                  >
                    <td className="px-6 py-5">
                      <button
                        type="button"
                        onClick={() => setViewing(t)}
                        title="View full user details"
                        className="group flex w-full items-center gap-3 text-left"
                      >
                        <Avatar name={t.name} size={40} className="shrink-0 ring-2 ring-[#4361EE]/10" />
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-[15px] font-semibold leading-none text-[#2B3A9E] group-hover:underline">
                            {t.name}
                            {isSelf && <span className="ml-1.5 align-middle text-[11px] font-medium text-muted-foreground">(you)</span>}
                          </p>
                          <p className="flex items-center gap-1.5 truncate text-[12.5px] leading-none text-muted-foreground">
                            <Mail className="h-3.5 w-3.5 shrink-0 opacity-70" /> {t.email}
                          </p>
                          {t.phone && (
                            <p className="flex items-center gap-1.5 truncate text-[12.5px] leading-none text-muted-foreground">
                              <Phone className="h-3.5 w-3.5 shrink-0 opacity-70" /> {t.phone}
                            </p>
                          )}
                        </div>
                      </button>
                    </td>
                    <td className="px-3 py-5">
                      <div className="flex flex-col gap-1">
                        <span className="text-[14px] font-semibold leading-none text-foreground">{role?.label ?? t.roleId}</span>
                        <span className="text-[12px] leading-none text-muted-foreground">
                          {moduleCount === 0 ? "No modules" : `${moduleCount} module${moduleCount === 1 ? "" : "s"}`}
                        </span>
                      </div>
                    </td>
                    <td className="w-[150px] px-3 py-5">
                      <div className="flex flex-nowrap items-center gap-1.5">
                        {role?.workspaces.length ? role.workspaces.map((w) => {
                          const wd = WORKSPACE_MAP[w as WorkspaceId];
                          return (
                            <span
                              key={w}
                              title={wd.label}
                              className={cn(
                                "inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ring-current/15",
                                wd.bg, wd.color
                              )}
                            >
                              {wd.short}
                            </span>
                          );
                        }) : <span className="text-[13px] text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-5 pl-6 whitespace-nowrap text-[13.5px] font-medium text-foreground/80">{t.branch}</td>
                    <td className="px-3 py-5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS_TONE[t.status]} dot={t.status === "active"}>{STATUS_LABEL[t.status]}</Badge>
                        {!t.loginEnabled && <Badge tone="neutral">No login</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-5 pr-6 text-right">
                      <Can permission="manage_users">
                        <div className="flex justify-end">
                          <Dropdown
                            align="right"
                            width="w-52"
                            trigger={({ toggle }) => (
                              <button
                                onClick={toggle}
                                aria-label="Manage staff member"
                                className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#3347D6]"
                              >
                                <MoreHorizontal className="h-[18px] w-[18px]" />
                              </button>
                            )}
                          >
                            {(close) => (
                              <>
                                <MenuLabel>Manage access</MenuLabel>
                                <MenuItem icon={CircleUser} onClick={() => { setViewing(t); close(); }}>
                                  View details
                                </MenuItem>
                                <MenuItem icon={UserCog} onClick={() => { setEditing(t); close(); }}>
                                  Change role
                                </MenuItem>
                                <MenuItem icon={KeyRound} onClick={() => { setResettingMode("reset"); setResetting(t); close(); }}>
                                  Reset password
                                </MenuItem>
                                {t.loginEnabled ? (
                                  <MenuItem icon={Power} onClick={() => { toggleLogin(t.id, false); close(); }}>
                                    Disable login
                                  </MenuItem>
                                ) : (
                                  <MenuItem icon={Power} onClick={() => { setResettingMode("enable"); setResetting(t); close(); }}>
                                    Enable login…
                                  </MenuItem>
                                )}
                                {t.status === "suspended" ? (
                                  <MenuItem icon={CheckCircle2} onClick={() => { setStaffStatus(t.id, "active"); close(); }}>
                                    Activate access
                                  </MenuItem>
                                ) : (
                                  <MenuItem icon={Ban} onClick={() => { setSuspending(t); close(); }}>
                                    Suspend access
                                  </MenuItem>
                                )}
                                {!isSelf && (
                                  <>
                                    <div className="my-1 h-px bg-border" />
                                    <MenuItem icon={Trash2} danger onClick={() => { setRemoving(t); close(); }}>
                                      Remove account
                                    </MenuItem>
                                  </>
                                )}
                              </>
                            )}
                          </Dropdown>
                        </div>
                      </Can>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-zinc-500/60 px-6 py-3.5">
          <p className="text-[13px] font-medium text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{rows.length}</span> of <span className="font-semibold text-foreground">{team.length}</span> staff members
          </p>
        </div>
      </div>

      <UserDetailsDrawer
        open={!!viewing}
        member={viewing}
        roles={allRoles}
        onClose={() => setViewing(null)}
        onChangeRole={(m) => { setViewing(null); setEditing(m); }}
        onChangeStore={(m) => { setViewing(null); setChangingStore(m); }}
        onResetPassword={(m, mode) => { setViewing(null); setResettingMode(mode ?? "reset"); setResetting(m); }}
        onToggleLogin={(id, enabled) => toggleLogin(id, enabled)}
        onSuspend={(m) => { setViewing(null); setSuspending(m); }}
        onActivate={(id) => setStaffStatus(id, "active")}
      />

      <ChangeRoleDrawer
        open={!!editing}
        onClose={() => setEditing(null)}
        memberName={editing?.name ?? ""}
        currentRoleId={editing?.roleId ?? allRoles[0].id}
        roles={allRoles}
        onConfirm={(roleId) => editing && changeRole(editing.email, roleId)}
      />

      <ChangeStoreDrawer
        open={!!changingStore}
        onClose={() => setChangingStore(null)}
        memberName={changingStore?.name ?? ""}
        currentStoreId={changingStore?.branchId ?? null}
        currentStoreName={changingStore?.branch ?? null}
        stores={stores}
        onConfirm={(storeId) => { if (changingStore) setMemberStore(changingStore.id, storeId); setChangingStore(null); }}
      />

      <ResetPasswordDrawer
        open={!!resetting}
        onClose={() => setResetting(null)}
        memberName={resetting?.name ?? ""}
        mode={resettingMode}
        email={resetting?.email}
        onConfirm={(password, opts) => {
          if (resetting) resetPassword(resetting.id, password, opts);
          setResetting(null);
        }}
      />

      <ConfirmDialog
        open={!!suspending}
        onClose={() => setSuspending(null)}
        title="Suspend this staff member?"
        description={`${suspending?.name ?? "They"} will lose access immediately and won't be able to log in until reactivated.`}
        confirmLabel="Suspend"
        onConfirm={() => {
          if (suspending) setStaffStatus(suspending.id, "suspended");
          setSuspending(null);
        }}
      />

      <DeleteMemberDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        member={removing}
        onConfirm={confirmRemove}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TAB 4 — Feature Visibility
   Control which modules/pages are visible, shown as "Coming Soon", or
   completely hidden for each role. Only accessible to Platform Owner and
   Master Shop Owner.
   ───────────────────────────────────────────────────────────────────────── */

const VISIBILITY_OPTIONS: { mode: VisibilityMode; label: string; emoji: string; color: string; bg: string }[] = [
  { mode: "visible", label: "Visible", emoji: "✓", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200 ring-emerald-200" },
  { mode: "coming_soon", label: "Coming Soon", emoji: "🚀", color: "text-amber-700", bg: "bg-amber-50 border-amber-200 ring-amber-200" },
  { mode: "hidden", label: "Hidden", emoji: "🔒", color: "text-zinc-500", bg: "bg-zinc-50 border-zinc-200 ring-zinc-200" },
];

function FeatureVisibilityTab({
  allRoles, featureVisibility, setFeatureVisibility, setFeatureVisibilityBulk,
  activeRoleId, setActiveRoleId, demoRoleIds, toggleDemoRole, resetDemo,
}: {
  allRoles: RoleDef[];
  featureVisibility: ReturnType<typeof usePermissions>["featureVisibility"];
  setFeatureVisibility: ReturnType<typeof usePermissions>["setFeatureVisibility"];
  setFeatureVisibilityBulk: ReturnType<typeof usePermissions>["setFeatureVisibilityBulk"];
  activeRoleId: string;
  setActiveRoleId: (id: string) => void;
  demoRoleIds: string[];
  toggleDemoRole: (roleId: string, enabled: boolean) => void;
  resetDemo: () => void;
}) {
  const [query, setQuery] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [visitCount, setVisitCount] = useState<number | null>(null);

  // Load demo visit count
  useEffect(() => {
    getDemoVisitCount().then(setVisitCount);
  }, []);

  const activeRole = allRoles.find((r) => r.id === activeRoleId) ?? allRoles[0];
  const grouped = featuresByWorkspace();
  const roleVisibility = featureVisibility[activeRoleId] ?? {};

  // Don't allow modifying platform_owner visibility (they always see everything)
  const isPlatformOwner = activeRoleId === "platform_owner";

  function getMode(featureId: string): VisibilityMode {
    return roleVisibility[featureId] ?? "visible";
  }

  function handleSetMode(featureId: string, mode: VisibilityMode) {
    if (isPlatformOwner) return;
    setFeatureVisibility(activeRoleId, featureId, mode);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1600);
  }

  function setAllInWorkspace(workspace: WorkspaceId, mode: VisibilityMode) {
    if (isPlatformOwner) return;
    const features = grouped[workspace];
    const updates: Record<string, VisibilityMode> = {};
    for (const f of features) updates[f.id] = mode;
    setFeatureVisibilityBulk(activeRoleId, updates);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1600);
  }

  const filteredGrouped = useMemo(() => {
    if (!query.trim()) return grouped;
    const q = query.toLowerCase();
    const result: Record<WorkspaceId, FeatureEntry[]> = { shop: [], leads: [], operations: [] };
    for (const [ws, features] of Object.entries(grouped) as [WorkspaceId, FeatureEntry[]][]) {
      result[ws] = features.filter((f) => f.label.toLowerCase().includes(q) || f.href.toLowerCase().includes(q));
    }
    return result;
  }, [query, grouped]);

  // Stats
  const totalFeatures = FEATURE_REGISTRY.length;
  const hiddenCount = Object.values(roleVisibility).filter((m) => m === "hidden").length;
  const comingSoonCount = Object.values(roleVisibility).filter((m) => m === "coming_soon").length;
  const visibleCount = totalFeatures - hiddenCount - comingSoonCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] text-muted-foreground">
            Control which features are visible, shown as &quot;Coming Soon&quot;, or completely hidden for each role.
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Changes apply immediately to all users with the selected role.
          </p>
        </div>
      </div>

      {/* Saved confirmation */}
      <motion.div
        initial={false}
        animate={{ opacity: justSaved ? 1 : 0, y: justSaved ? 0 : -6 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12.5px] font-medium text-emerald-700",
          !justSaved && "pointer-events-none"
        )}
        style={{ display: justSaved ? "flex" : "none" }}
      >
        <CheckCircle2 className="h-4 w-4" />
        Feature visibility updated. Changes are active immediately.
      </motion.div>

      {/* Role selector */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full items-center gap-1 rounded-full border border-border bg-muted p-1">
          {allRoles.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveRoleId(r.id)}
              className={cn(
                "relative whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                r.id === activeRoleId ? "bg-[#4361EE] text-white shadow-[0_6px_20px_-8px_rgba(67,97,238,0.5)]" : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Feature visibility matrix */}
        <div className="space-y-5">
          {/* Search */}
          <Input
            iconLeft={<Search className="h-4 w-4" />}
            placeholder="Search features..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 max-w-xs"
          />

          {isPlatformOwner && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] font-medium text-amber-700">
              <Info className="h-4 w-4 shrink-0" />
              Platform Owner always has full access to every feature. Select another role to configure visibility.
            </div>
          )}

          {/* Workspace groups */}
          {(["shop", "leads", "operations"] as const).map((wsId) => {
            const features = filteredGrouped[wsId];
            if (features.length === 0) return null;
            const ws = WORKSPACE_MAP[wsId];
            const wsHidden = features.filter((f) => getMode(f.id) === "hidden").length;
            const wsComingSoon = features.filter((f) => getMode(f.id) === "coming_soon").length;
            const wsVisible = features.length - wsHidden - wsComingSoon;

            return (
              <motion.div
                key={wsId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="rounded-2xl border border-border bg-card shadow-card overflow-hidden"
              >
                {/* Workspace header */}
                <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold", ws.bg, ws.color)}>
                      {ws.short}
                    </span>
                    <div>
                      <p className="text-[13.5px] font-semibold">{ws.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {features.length} features · {wsVisible} visible · {wsComingSoon} coming soon · {wsHidden} hidden
                      </p>
                    </div>
                  </div>
                  {!isPlatformOwner && (
                    <div className="flex items-center gap-1.5">
                      {VISIBILITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.mode}
                          onClick={() => setAllInWorkspace(wsId, opt.mode)}
                          title={`Set all to ${opt.label}`}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors hover:ring-1",
                            opt.bg, opt.color
                          )}
                        >
                          <span>{opt.emoji}</span>
                          All
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Feature rows */}
                <div className="divide-y divide-border">
                  {features.map((feature, i) => {
                    const mode = getMode(feature.id);
                    return (
                      <motion.div
                        key={feature.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.015 * i }}
                        className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-zinc-800">{feature.label}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{feature.href}</p>
                        </div>
                        {/* Visibility toggle buttons */}
                        <div className="flex items-center gap-1">
                          {VISIBILITY_OPTIONS.map((opt) => {
                            const isActive = mode === opt.mode;
                            return (
                              <button
                                key={opt.mode}
                                onClick={() => handleSetMode(feature.id, opt.mode)}
                                disabled={isPlatformOwner}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold transition-all",
                                  isActive
                                    ? cn(opt.bg, opt.color, "ring-1", opt.mode === "visible" ? "ring-emerald-300" : opt.mode === "coming_soon" ? "ring-amber-300" : "ring-zinc-300")
                                    : "border-border bg-card text-zinc-400 hover:text-zinc-600 hover:border-zinc-300",
                                  isPlatformOwner && "cursor-not-allowed opacity-50"
                                )}
                              >
                                <span className="text-[10px]">{opt.emoji}</span>
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Summary sidebar */}
        <div className="space-y-4 lg:sticky lg:top-[72px] lg:self-start">
          {/* Role summary */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg brand-gradient text-white shadow-glow">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold leading-tight">{activeRole.label}</p>
                <p className="text-[11px] text-muted-foreground">Feature visibility config</p>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[12px] text-zinc-600">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Visible
                </span>
                <span className="text-[12px] font-semibold text-zinc-800">{visibleCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[12px] text-zinc-600">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Coming Soon
                </span>
                <span className="text-[12px] font-semibold text-zinc-800">{comingSoonCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[12px] text-zinc-600">
                  <span className="inline-block h-2 w-2 rounded-full bg-zinc-400" />
                  Hidden
                </span>
                <span className="text-[12px] font-semibold text-zinc-800">{hiddenCount}</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${(visibleCount / totalFeatures) * 100}%` }} />
              <div className="bg-amber-400 transition-all duration-300" style={{ width: `${(comingSoonCount / totalFeatures) * 100}%` }} />
              <div className="bg-zinc-300 transition-all duration-300" style={{ width: `${(hiddenCount / totalFeatures) * 100}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{totalFeatures} total features</p>
          </div>

          {/* Info panel */}
          <div className="rounded-2xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-4">
            <p className="text-[13px] font-semibold text-[#3347D6]">How it works</p>
            <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-[#3347D6]/70">
              <p><span className="font-semibold">✓ Visible</span> — Feature opens normally.</p>
              <p><span className="font-semibold">🚀 Coming Soon</span> — Sidebar shows the item, but clicking it shows a branded &quot;Coming Soon&quot; page.</p>
              <p><span className="font-semibold">🔒 Hidden</span> — Completely removed from sidebar and navigation.</p>
            </div>
          </div>

          {/* Use cases */}
          <div className="rounded-2xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-4">
            <p className="text-[13px] font-semibold text-[#3347D6]">Use cases</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-[#3347D6]/70">
              <li>• Demo accounts — show what&apos;s coming</li>
              <li>• Trial accounts — limit feature access</li>
              <li>• Beta features — controlled rollout</li>
              <li>• Subscription tiers — plan-based access</li>
            </ul>
          </div>

          {/* Demo Workspace */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-violet-100 text-violet-600">
                <Eye className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold leading-tight">Demo Workspace</p>
                <p className="text-[11px] text-muted-foreground">Sandbox for demo accounts</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
              Mark roles as &quot;Demo&quot; to give them full access with isolated data. Demo users share a sandbox that never touches production.
            </p>

            {/* Visit count */}
            {visitCount !== null && visitCount > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2">
                <span className="text-[18px] font-bold text-violet-700">{visitCount}</span>
                <span className="text-[11px] text-violet-600">unique device{visitCount !== 1 ? "s" : ""} visited demo</span>
              </div>
            )}

            {/* Demo role toggles */}
            <div className="mt-4 space-y-2">
              {allRoles.filter((r) => r.id !== "platform_owner").map((r) => {
                const isDemo = demoRoleIds.includes(r.id);
                return (
                  <label
                    key={r.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[12px] font-medium transition",
                      isDemo ? "border-violet-300 bg-violet-50 text-violet-700" : "border-border hover:bg-muted text-zinc-600"
                    )}
                  >
                    <Checkbox
                      checked={isDemo}
                      onChange={(next) => toggleDemoRole(r.id, next)}
                      aria-label={`Mark ${r.label} as demo role`}
                    />
                    <span className="flex-1 truncate">{r.label}</span>
                    {isDemo && (
                      <span className="inline-flex items-center rounded-full bg-violet-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-700">
                        Demo
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Reset demo data */}
            {demoRoleIds.length > 0 && (
              <>
                <p className="mt-3 flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" />
                  Demo roles saved automatically
                </p>
                <button
                  onClick={resetDemo}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset Demo Data
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
