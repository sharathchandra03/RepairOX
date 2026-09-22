"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ShieldCheck, ChevronRight, ChevronDown, Search, RotateCcw, Save, Info, Eye,
  CheckCircle2, UserPlus, Trash2, Users, Building2, Wrench, Package,
  TrendingUp, Wallet, Crown, Code2, LayoutGrid, SlidersHorizontal,
  Mail, UserCog, Plus, MapPin, KeyRound, MoreHorizontal, Power, Ban, Phone,
  Sparkles, Home, Ticket, FileText, Footprints, ClipboardList, Truck,
  BookUser, UsersRound, IndianRupee, BarChart3, Settings, Lock, Pencil,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Can } from "@/components/common/can";
import { RequireCapability } from "@/components/common/require-capability";
import { CAP } from "@/lib/capabilities";
import { AddRoleDrawer } from "@/components/settings/add-role-drawer";
import { DeleteRoleDialog } from "@/components/settings/delete-role-dialog";
import { ChangeRoleDrawer } from "@/components/settings/change-role-drawer";
import { DeleteMemberDialog } from "@/components/settings/delete-member-dialog";
import { ResetPasswordDrawer } from "@/components/settings/reset-password-drawer";
import {
  PERMISSION_GROUPS, ALL_PERMISSIONS, WORKSPACE_MAP, WORKSPACES,
  type PermissionKey, type RoleDef, type WorkspaceId,
} from "@/lib/permissions";
import { usePermissions, resolveGrantedKeys } from "@/lib/permissions-context";
import {
  PERMISSION_MODULES, ACCESS_LEVELS, ROLE_PRESETS,
  levelToKeys, allModuleKeys, supportedLevels, keysToLevel, presetToKeys,
  type AccessLevel, type ModuleDef,
} from "@/lib/permission-levels";
import type { TeamMember } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  FEATURE_REGISTRY, featuresByWorkspace,
  type VisibilityMode, type FeatureEntry,
} from "@/lib/feature-visibility";
import { getDemoVisitCount } from "@/lib/demo-tracking";

/* ─── Icon per role — keeps the role list scannable ──────────────────── */
const ROLE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  platform_owner: Crown,
  developer_admin: Code2,
  master_shop_owner: ShieldCheck,
  shop_owner_branch_manager: Building2,
  reception: Users,
  technician: Wrench,
  senior_technician: Wrench,
  inventory_manager: Package,
  sales_executive: TrendingUp,
  cashier_accounts: Wallet,
  read_only_user: Eye,
};

const STATUS_TONE: Record<TeamMember["status"], "success" | "warning" | "danger"> = {
  active: "success", invited: "warning", suspended: "danger",
};
const STATUS_LABEL: Record<TeamMember["status"], string> = {
  active: "Active", invited: "Invited", suspended: "Suspended",
};

type TabId = "roles" | "matrix" | "users" | "visibility";
const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "roles", label: "Roles & Access", icon: ShieldCheck },
  { id: "matrix", label: "Permission Matrix", icon: SlidersHorizontal },
  { id: "users", label: "Users & Assignment", icon: Users },
  { id: "visibility", label: "Feature Visibility", icon: Sparkles },
];

/** Seed the editable matrix draft from the shared context (not the static
 *  catalogue) so it always opens in sync with whatever was last saved. */
function draftFromContext(
  grants: ReturnType<typeof usePermissions>["grants"],
  roles: RoleDef[]
): Record<string, Set<PermissionKey>> {
  const map: Record<string, Set<PermissionKey>> = {};
  for (const r of roles) map[r.id] = resolveGrantedKeys(grants, r.id);
  return map;
}

export default function RolesPermissionsPage() {
  // Route-level guard: the entire Roles & Permissions surface (including the
  // Permission Matrix) is visible ONLY to users who can manage roles. The
  // server + RLS remain the real enforcement; this refuses to render the
  // management UI to anyone without `manage_roles`.
  return (
    <RequireCapability anyOf={CAP.admin.manageRoles}>
      <RolesPermissionsInner />
    </RequireCapability>
  );
}

function RolesPermissionsInner() {
  const {
    grants: savedGrants, saveGrants, enterPreview, allRoles, addRole,
    isCustomRole, canDeleteRole, deleteRole, membersInRole,
    getRoleById, team, setMemberRole, deleteMember,
    resetPassword, setStaffStatus, toggleLogin, updateRoleWorkspaces,
    featureVisibility, setFeatureVisibility, setFeatureVisibilityBulk,
    adminRoleId, demoRoleIds, toggleDemoRole, resetDemo,
  } = usePermissions();

  const [tab, setTab] = useState<TabId>("roles");
  // Shared active role — the Roles and Matrix tabs both focus one role at a time.
  const [activeRoleId, setActiveRoleId] = useState(allRoles[2]?.id ?? allRoles[0].id); // Master Shop Owner
  const [createdToast, setCreatedToast] = useState(false);

  const activeRole = allRoles.find((r) => r.id === activeRoleId) ?? allRoles[0];

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

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
        <span>Administration</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
        {tab === "roles" || tab === "matrix" ? (
          <button
            onClick={() => setTab("roles")}
            className="transition hover:text-[#4361EE]"
          >
            Roles &amp; Permissions
          </button>
        ) : (
          <span className="text-foreground">Roles &amp; Permissions</span>
        )}
        {(tab === "roles" || tab === "matrix") && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="text-foreground">{activeRole.label}</span>
          </>
        )}
        {tab === "visibility" && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            <span className="text-foreground">Feature Visibility</span>
          </>
        )}
      </nav>

      <PageHeader
        eyebrow="Administration"
        title="Roles & Permissions"
        subtitle="One workspace to manage who can access RepairOX, what they can do, and where. Changes apply the moment you save."
      />

      {/* Tab strip */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full items-center gap-1 rounded-full border border-border bg-muted p-1">
          {TABS.filter((t) => {
            // Feature Visibility tab only visible to platform_owner and master_shop_owner
            if (t.id === "visibility") {
              return adminRoleId === "platform_owner" || adminRoleId === "master_shop_owner";
            }
            return true;
          }).map((t) => {
            const Icon = t.icon;
            const isActive = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
                  isActive
                    ? "bg-[#4361EE] text-white shadow-[0_6px_20px_-8px_rgba(67,97,238,0.5)]"
                    : "text-zinc-500 hover:text-zinc-800"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "roles" && (
            <RolesTab
              allRoles={allRoles}
              activeRoleId={activeRoleId}
              setActiveRoleId={setActiveRoleId}
              membersInRole={membersInRole}
              onEditPermissions={() => setTab("matrix")}
              onAddRole={addRole}
              setMemberRole={setMemberRole}
              deleteMember={deleteMember}
              resetPassword={resetPassword}
              setStaffStatus={setStaffStatus}
              toggleLogin={toggleLogin}
            />
          )}
          {tab === "matrix" && (
            <MatrixTab
              savedGrants={savedGrants}
              saveGrants={saveGrants}
              enterPreview={enterPreview}
              allRoles={allRoles}
              addRole={addRole}
              isCustomRole={isCustomRole}
              canDeleteRole={canDeleteRole}
              deleteRole={deleteRole}
              membersInRole={membersInRole}
              activeRoleId={activeRoleId}
              setActiveRoleId={setActiveRoleId}
              updateRoleWorkspaces={updateRoleWorkspaces}
            />
          )}
          {tab === "users" && (
            <UsersTab
              team={team}
              allRoles={allRoles}
              getRoleById={getRoleById}
              setMemberRole={setMemberRole}
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
        </motion.div>
      </AnimatePresence>

      {/* Created confirmation */}
      <motion.div
        initial={false}
        animate={{ opacity: createdToast ? 1 : 0, y: createdToast ? 0 : -6 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2.5 text-[12.5px] font-medium text-emerald-700 shadow-[0_12px_40px_-12px_rgba(20,30,80,0.25)]",
          !createdToast && "pointer-events-none"
        )}
        style={{ display: createdToast ? "flex" : "none" }}
      >
        <CheckCircle2 className="h-4 w-4" />
        Staff member created and login account is ready.
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TAB 1 — Roles & Access
   Role catalogue + a read-only detail panel that spells out module scope,
   branch scope and access level in plain language.
   ───────────────────────────────────────────────────────────────────────── */
function RolesTab({
  allRoles, activeRoleId, setActiveRoleId, membersInRole, onEditPermissions, onAddRole,
  setMemberRole, deleteMember, resetPassword, setStaffStatus, toggleLogin,
}: {
  allRoles: RoleDef[];
  activeRoleId: string;
  setActiveRoleId: (id: string) => void;
  membersInRole: (roleId: string) => TeamMember[];
  onEditPermissions: () => void;
  onAddRole: ReturnType<typeof usePermissions>["addRole"];
  setMemberRole: ReturnType<typeof usePermissions>["setMemberRole"];
  deleteMember: ReturnType<typeof usePermissions>["deleteMember"];
  resetPassword: ReturnType<typeof usePermissions>["resetPassword"];
  setStaffStatus: ReturnType<typeof usePermissions>["setStaffStatus"];
  toggleLogin: ReturnType<typeof usePermissions>["toggleLogin"];
}) {
  const { grants, currentUser } = usePermissions();
  const selfEmail = currentUser?.email ?? "";
  const [addOpen, setAddOpen] = useState(false);
  const [detailView, setDetailView] = useState<"members" | "permissions">("members");
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [removingMember, setRemovingMember] = useState<TeamMember | null>(null);
  const [resettingMember, setResettingMember] = useState<TeamMember | null>(null);
  const [suspendingMember, setSuspendingMember] = useState<TeamMember | null>(null);
  const active = allRoles.find((r) => r.id === activeRoleId) ?? allRoles[0];
  const totalPermissions = ALL_PERMISSIONS.length;
  const granted = resolveGrantedKeys(grants, active.id);
  const isFullAccess = granted.has("full_access") || granted.size >= totalPermissions;

  // Branch scope is derived from who is actually assigned to this role.
  const members = membersInRole(active.id);
  const branches = Array.from(new Set(members.map((m) => m.branch)));

  function handleCreate(input: { label: string; summary: string; workspaces: WorkspaceId[] }) {
    const id = onAddRole({ label: input.label, summary: input.summary, workspaces: input.workspaces, permissions: [] });
    setActiveRoleId(id);
    setAddOpen(false);
  }

  function handleChangeRole(email: string, roleId: string) {
    setMemberRole(email, roleId);
    setEditingMember(null);
  }

  function handleRemoveMember() {
    if (!removingMember) return;
    deleteMember(removingMember.email);
    setRemovingMember(null);
  }

  const totalMembers = allRoles.reduce((sum, r) => sum + membersInRole(r.id).length, 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr] lg:items-start">
      {/* Role list — a single cohesive panel that stays pinned while the detail
          panel on the right scrolls, and stretches to the bottom of the view. */}
      <aside className="lg:sticky lg:top-[72px] lg:h-[calc(100vh-92px)]">
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          {/* Panel header */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Roles</p>
              <p className="mt-0.5 text-[12px] text-zinc-600">
                {allRoles.length} roles · {totalMembers} {totalMembers === 1 ? "member" : "members"}
              </p>
            </div>
            <Can permission="manage_roles">
              <button
                onClick={() => setAddOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1.5 text-[12px] font-semibold text-[#3347D6] ring-1 ring-inset ring-[#B3BFF6]/60 transition hover:bg-[#E2E8FB]"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add role
              </button>
            </Can>
          </div>

          {/* Scrollable role list */}
          <ul className="flex-1 space-y-1 overflow-y-auto p-2.5">
            {allRoles.map((r, i) => {
              const Icon = ROLE_ICON[r.id] ?? Users;
              const isActive = r.id === activeRoleId;
              const count = membersInRole(r.id).length;
              return (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.015 * i }}
                >
                  <button
                    onClick={() => setActiveRoleId(r.id)}
                    className={cn(
                      "group relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                      isActive ? "bg-[#EEF1FD]" : "hover:bg-[#EEF1FD]/60"
                    )}
                  >
                    {/* Active accent bar */}
                    <span
                      className={cn(
                        "absolute inset-y-2.5 left-0 w-1 rounded-full bg-[#4361EE] transition-opacity",
                        isActive ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className={cn(
                      "grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors",
                      isActive
                        ? "brand-gradient text-white shadow-glow"
                        : "bg-muted text-muted-foreground group-hover:bg-white group-hover:text-[#4361EE]"
                    )}>
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        "truncate text-[14px] font-semibold leading-tight",
                        isActive ? "text-[#3347D6]" : "text-zinc-800"
                      )}>
                        {r.label}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                        {count} {count === 1 ? "member" : "members"}
                      </p>
                    </div>
                    <ChevronRight className={cn(
                      "h-4 w-4 shrink-0 transition-transform",
                      isActive ? "text-[#4361EE] translate-x-0.5" : "text-zinc-300 group-hover:text-[#4361EE]"
                    )} />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Detail panel */}
      <motion.div
        key={active.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="space-y-6"
      >
        {/* Role header card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-glow">
                {(() => { const Icon = ROLE_ICON[active.id] ?? Users; return <Icon className="h-5 w-5" />; })()}
              </span>
              <div>
                <h2 className="font-display text-xl font-extrabold tracking-tight">{active.label}</h2>
                <p className="mt-1 max-w-lg text-sm text-zinc-600">{active.summary}</p>
              </div>
            </div>
            <Can permission="manage_roles">
              <Button size="md" className="shrink-0 gap-1.5 rounded-full" onClick={onEditPermissions}>
                <SlidersHorizontal className="h-4 w-4" /> Edit permissions
              </Button>
            </Can>
          </div>

          {/* Access + scope summary cards */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ScopeCard icon={KeyRound} label="Access level" value={isFullAccess ? "Full access" : "Limited access"} hint={`${granted.size} / ${totalPermissions} capabilities`} />
            <ScopeCard icon={LayoutGrid} label="Module scope" value={active.workspaces.length === 3 ? "All modules" : `${active.workspaces.length} module${active.workspaces.length === 1 ? "" : "s"}`} hint={active.workspaces.map((w) => WORKSPACE_MAP[w].label).join(" · ")} />
            <ScopeCard icon={MapPin} label="Branch scope" value={branches.length === 0 ? "Unassigned" : branches.length === 1 ? "1 branch" : `${branches.length} branches`} hint={branches.length === 0 ? "No members assigned yet" : branches.join(" · ")} />
          </div>

          {/* Module access chips */}
          <div className="mt-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Module access</p>
            <div className="flex flex-wrap gap-2">
              {(["shop", "leads", "operations"] as const).map((wid) => {
                const w = WORKSPACE_MAP[wid];
                const has = active.workspaces.includes(wid);
                return (
                  <span key={wid} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 ring-inset", has ? cn(w.bg, w.color, "ring-current/20") : "bg-zinc-50 text-zinc-400 ring-zinc-200")}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", has ? "bg-current" : "bg-zinc-300")} />
                    {w.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Detail sub-tabs: Members / Permissions */}
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1">
          <button onClick={() => setDetailView("members")} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors", detailView === "members" ? "bg-[#4361EE] text-white shadow-[0_6px_20px_-8px_rgba(67,97,238,0.5)]" : "text-zinc-500 hover:text-zinc-800")}>
            <Users className="h-4 w-4" /> Members ({members.length})
          </button>
          <button onClick={() => setDetailView("permissions")} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-colors", detailView === "permissions" ? "bg-[#4361EE] text-white shadow-[0_6px_20px_-8px_rgba(67,97,238,0.5)]" : "text-zinc-500 hover:text-zinc-800")}>
            <ShieldCheck className="h-4 w-4" /> Permissions ({granted.size})
          </button>
        </div>

        {/* Members panel */}
        {detailView === "members" && (
          <RoleMembersPanel
            members={members}
            active={active}
            selfEmail={selfEmail}
            toggleLogin={toggleLogin}
            setStaffStatus={setStaffStatus}
            setEditingMember={setEditingMember}
            setRemovingMember={setRemovingMember}
            setResettingMember={setResettingMember}
            setSuspendingMember={setSuspendingMember}
          />
        )}

        {/* Permissions summary panel */}
        {detailView === "permissions" && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            {PERMISSION_GROUPS.map((g) => {
              const inGroup = g.permissions.filter((p) => granted.has(p.key));
              if (inGroup.length === 0) return null;
              return (
                <div key={g.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <p className="text-[12.5px] font-semibold">{g.label}</p>
                    <Badge tone="brand">{inGroup.length}/{g.permissions.length}</Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{g.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {inGroup.map((p) => (<Badge key={p.key} tone="success">{p.label}</Badge>))}
                  </div>
                </div>
              );
            })}
            {PERMISSION_GROUPS.every((g) => g.permissions.filter((p) => granted.has(p.key)).length === 0) && (
              <div className="flex flex-col items-center justify-center px-6 py-12 text-center rounded-2xl border border-border bg-card">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#EEF1FD] text-[#4361EE]"><ShieldCheck className="h-6 w-6" /></span>
                <p className="mt-4 text-sm font-semibold text-zinc-700">No permissions granted</p>
                <p className="mt-1 max-w-xs text-[12.5px] text-muted-foreground">This role has no capabilities yet. Use the Permission Matrix tab to configure access.</p>
              </div>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Drawers and dialogs */}
      <AddRoleDrawer open={addOpen} onClose={() => setAddOpen(false)} onCreate={handleCreate} />
      <ChangeRoleDrawer open={!!editingMember} onClose={() => setEditingMember(null)} memberName={editingMember?.name ?? ""} currentRoleId={editingMember?.roleId ?? allRoles[0].id} roles={allRoles} onConfirm={(roleId) => editingMember && handleChangeRole(editingMember.email, roleId)} />
      <ResetPasswordDrawer open={!!resettingMember} onClose={() => setResettingMember(null)} memberName={resettingMember?.name ?? ""} onConfirm={(password) => { if (resettingMember) resetPassword(resettingMember.id, password); setResettingMember(null); }} />
      <ConfirmDialog open={!!suspendingMember} onClose={() => setSuspendingMember(null)} title="Suspend this staff member?" description={`${suspendingMember?.name ?? "They"} will lose access immediately and won't be able to log in until reactivated.`} confirmLabel="Suspend" onConfirm={() => { if (suspendingMember) setStaffStatus(suspendingMember.id, "suspended"); setSuspendingMember(null); }} />
      <DeleteMemberDialog open={!!removingMember} onClose={() => setRemovingMember(null)} member={removingMember} onConfirm={handleRemoveMember} />
    </div>
  );
}

function ScopeCard({ icon: Icon, label, value, hint }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <p className="text-[11px] font-semibold uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-1.5 text-sm font-bold">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={hint}>{hint}</p>
    </div>
  );
}

/* ─── Role Members Panel — the member list shown inside the Roles tab ─── */
function RoleMembersPanel({
  members, active, selfEmail, toggleLogin, setStaffStatus,
  setEditingMember, setRemovingMember, setResettingMember, setSuspendingMember,
}: {
  members: TeamMember[];
  active: RoleDef;
  selfEmail: string;
  toggleLogin: ReturnType<typeof usePermissions>["toggleLogin"];
  setStaffStatus: ReturnType<typeof usePermissions>["setStaffStatus"];
  setEditingMember: (m: TeamMember | null) => void;
  setRemovingMember: (m: TeamMember | null) => void;
  setResettingMember: (m: TeamMember | null) => void;
  setSuspendingMember: (m: TeamMember | null) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-border bg-card shadow-card"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-[13.5px] font-semibold">Role Members</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {members.length} {members.length === 1 ? "person" : "people"} assigned to {active.label}
          </p>
        </div>
        <Can permission="manage_users">
          <Link href="/settings/roles-permissions/add-user">
            <button className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF1FD] px-3 py-1.5 text-[12px] font-semibold text-[#3347D6] ring-1 ring-inset ring-[#B3BFF6]/60 transition hover:bg-[#E2E8FB]">
              <Plus className="h-3.5 w-3.5" /> Add member
            </button>
          </Link>
        </Can>
      </div>

      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#EEF1FD] text-[#4361EE]">
            <Users className="h-6 w-6" />
          </span>
          <p className="mt-4 text-sm font-semibold text-zinc-700">No members yet</p>
          <p className="mt-1 max-w-xs text-[12.5px] text-muted-foreground">
            No one is assigned to the {active.label} role. Add a staff member or move someone from another role.
          </p>
          <Can permission="manage_users">
            <Link href="/settings/roles-permissions/add-user">
              <Button size="md" className="mt-4 gap-1.5 rounded-full">
                <Plus className="h-4 w-4" /> Add staff member
              </Button>
            </Link>
          </Can>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {members.map((m, i) => {
            const isSelf = m.email === selfEmail;
            return (
              <motion.div
                key={m.email}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.025 * i }}
                className="flex items-center gap-3.5 px-5 py-3.5 transition hover:bg-muted/40"
              >
                <Avatar name={m.name} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold leading-tight">
                    {m.name}
                    {isSelf && <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">(you)</span>}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Mail className="h-3 w-3" /> {m.email}
                    </span>
                    {m.phone && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Phone className="h-3 w-3" /> {m.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Building2 className="h-3 w-3" /> {m.branch}
                    </span>
                  </div>
                </div>
                <Badge tone={STATUS_TONE[m.status]} dot={m.status === "active"}>{STATUS_LABEL[m.status]}</Badge>
                <Can permission="manage_users">
                  <Dropdown
                    align="right"
                    width="w-52"
                    trigger={({ toggle }) => (
                      <button
                        onClick={toggle}
                        aria-label="Member actions"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuLabel>Member actions</MenuLabel>
                        <MenuItem icon={UserCog} onClick={() => { setEditingMember(m); close(); }}>
                          Change role
                        </MenuItem>
                        <MenuItem icon={KeyRound} onClick={() => { setResettingMember(m); close(); }}>
                          Reset password
                        </MenuItem>
                        {m.loginEnabled ? (
                          <MenuItem icon={Power} onClick={() => { toggleLogin(m.id, false); close(); }}>
                            Disable login
                          </MenuItem>
                        ) : (
                          <MenuItem icon={Power} onClick={() => { setResettingMember(m); close(); }}>
                            Enable login…
                          </MenuItem>
                        )}
                        {m.status === "suspended" ? (
                          <MenuItem icon={CheckCircle2} onClick={() => { setStaffStatus(m.id, "active"); close(); }}>
                            Activate access
                          </MenuItem>
                        ) : (
                          <MenuItem icon={Ban} onClick={() => { setSuspendingMember(m); close(); }}>
                            Suspend access
                          </MenuItem>
                        )}
                        {!isSelf && (
                          <>
                            <div className="my-1 h-px bg-border" />
                            <MenuItem icon={Trash2} danger onClick={() => { setRemovingMember(m); close(); }}>
                              Remove from role
                            </MenuItem>
                          </>
                        )}
                      </>
                    )}
                  </Dropdown>
                </Can>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TAB 2 — Permission Matrix
   The editable grid where an administrator grants exactly what each role can
   see and do, then saves. Redesigned as a 3-level experience:
     1. Pick a template (preset).
     2. Set an access LEVEL per module (None → View → Work → Manage → Full).
     3. Open "Advanced" for exact per-capability toggles.
   ───────────────────────────────────────────────────────────────────────── */

/** Icon per preset (by the icon name stored on the preset). */
const PRESET_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Crown, Store: Building2, Footprints, Wrench, TrendingUp, Package, Truck, Wallet, Eye,
};

/** Icon per module (by the icon name on the module def). */
const MODULE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Home, Ticket, FileText, Footprints, Users, Truck, Package, ClipboardList,
  BookUser, UsersRound, IndianRupee, BarChart3, Building2, ShieldCheck, Settings, UserCog,
};

/** Icon shown inside each access-level option button (icon-only, tooltip on hover). */
const LEVEL_ICON: Record<AccessLevel, React.ComponentType<{ className?: string }>> = {
  full: CheckCircle2,
  none: Ban,
  view: Eye,
  work: Pencil,
  manage: Settings, // retained for typing/back-compat; not shown as an option
};

/** Options shown per row, in order. "Manage" is intentionally omitted — for
 *  most modules it equals Full, which was confusing. Full covers everything. */
const LEVEL_OPTION_ORDER: AccessLevel[] = ["full", "none", "view", "work"];

/** Soft tint per module icon tile — keeps the list colourful & scannable
 *  like the reference, without leaving the RepairOX palette. */
const MODULE_TILE_TINT: Record<string, string> = {
  dashboard: "bg-[#EEF1FD] text-[#4361EE]",
  tickets: "bg-violet-100 text-violet-600",
  invoices: "bg-emerald-100 text-emerald-600",
  walkin: "bg-amber-100 text-amber-600",
  leads: "bg-sky-100 text-sky-600",
  field: "bg-teal-100 text-teal-600",
  inventory: "bg-indigo-100 text-indigo-600",
  catalog: "bg-rose-100 text-rose-600",
  customers: "bg-cyan-100 text-cyan-600",
  employees: "bg-fuchsia-100 text-fuchsia-600",
  accounts: "bg-lime-100 text-lime-700",
  reports: "bg-orange-100 text-orange-600",
  stores: "bg-blue-100 text-blue-600",
  employees_admin: "bg-purple-100 text-purple-600",
  settings: "bg-slate-100 text-slate-600",
  account: "bg-zinc-100 text-zinc-600",
};

/** Right-hand status chip descriptor for a resolved level. */
function statusChip(level: AccessLevel | "custom"): { label: string; dot: string; text: string; bg: string } {
  switch (level) {
    case "full": return { label: "Full Access", dot: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" };
    case "manage": return { label: "Full Access", dot: "bg-emerald-500", text: "text-emerald-600", bg: "bg-emerald-50" };
    case "work": return { label: "Work Access", dot: "bg-[#4361EE]", text: "text-[#3347D6]", bg: "bg-[#EEF1FD]" };
    case "view": return { label: "View Only", dot: "bg-[#4361EE]", text: "text-[#3347D6]", bg: "bg-[#EEF1FD]" };
    case "custom": return { label: "Custom", dot: "bg-amber-500", text: "text-amber-600", bg: "bg-amber-50" };
    default: return { label: "No Access", dot: "bg-zinc-300", text: "text-zinc-400", bg: "bg-muted" };
  }
}

/* ─── Reusable pill switch (design-system blue) ─────────────────────────── */
function FullAccessToggle({
  checked, onChange, ariaLabel, disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-[#4361EE]" : "bg-zinc-300",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/* ─── One module row: label + level segmented control + Advanced drawer ─── */
function ModuleAccessRow({
  module, granted, disabled, expanded, onToggleExpanded, onSetLevel, onToggleKey,
}: {
  module: ModuleDef;
  granted: Set<PermissionKey>;
  disabled: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSetLevel: (level: AccessLevel) => void;
  onToggleKey: (key: PermissionKey) => void;
}) {
  const Icon = MODULE_ICON[module.icon] ?? SlidersHorizontal;
  const levels = supportedLevels(module);
  const current = keysToLevel(module, granted);
  const moduleKeys = allModuleKeys(module);
  const grantedInModule = moduleKeys.filter((k) => granted.has(k)).length;

  // The individual capabilities of this module, grouped for the Advanced view.
  const advancedGroups = useMemo(() => {
    const keySet = new Set(moduleKeys);
    return PERMISSION_GROUPS
      .map((g) => ({ ...g, permissions: g.permissions.filter((p) => keySet.has(p.key)) }))
      .filter((g) => g.permissions.length > 0);
  }, [module.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Full" means EVERY capability in this module is granted — regardless of
  // whether the module defines a distinct `full` tier. This makes the Full
  // option meaningful and highlighted for every row.
  const isFullGranted = moduleKeys.length > 0 && grantedInModule === moduleKeys.length;
  // The level to render as selected. Full wins when everything is granted.
  // "manage" is not a shown option, so any non-full manage-level state is
  // surfaced as "custom" rather than silently matching no button.
  const resolved = isFullGranted ? "full" : current;
  const effective: AccessLevel | "custom" = resolved === "manage" ? "custom" : resolved;

  // Always offer Full + No Access, then View/Work if the module supports them.
  // "Manage" is intentionally excluded (it equals Full for most modules).
  const options: AccessLevel[] = LEVEL_OPTION_ORDER.filter(
    (l) => l === "full" || l === "none" || levels.includes(l)
  );
  const chip = statusChip(effective);
  const tileTint = MODULE_TILE_TINT[module.id] ?? "bg-[#EEF1FD] text-[#4361EE]";

  return (
    <div className="rounded-2xl border-2 border-zinc-300 bg-card shadow-card">
      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: icon tile + label + blurb */}
        <div className="flex items-start gap-3 lg:w-[240px] lg:shrink-0">
          <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", tileTint)}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold leading-tight">{module.label}</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{module.blurb}</p>
          </div>
        </div>

        {/* Middle: round icon-only option buttons + Advanced beneath */}
        <div className={cn("flex-1", disabled && "opacity-60 pointer-events-none")}>
          <div className="flex items-center gap-2">
            {options.map((lvl) => {
              const meta = ACCESS_LEVELS.find((a) => a.id === lvl)!;
              const OptIcon = LEVEL_ICON[lvl];
              const isActive = effective === lvl;
              return (
                <button
                  key={lvl}
                  onClick={() => onSetLevel(lvl)}
                  title={`${meta.label} — ${meta.hint}`}
                  aria-label={meta.label}
                  aria-pressed={isActive}
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-full border transition",
                    isActive
                      ? "border-[#4361EE] bg-[#4361EE] text-white shadow-[0_6px_18px_-8px_rgba(67,97,238,0.7)]"
                      : "border-zinc-300 bg-card text-zinc-400 hover:border-[#B3BFF6] hover:text-zinc-700"
                  )}
                >
                  <OptIcon className="h-4 w-4" />
                </button>
              );
            })}
          </div>

          {/* Advanced + Custom indicator on their own line beneath. */}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={onToggleExpanded}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition",
                expanded ? "border-[#B3BFF6] bg-[#EEF1FD] text-[#3347D6]" : "border-zinc-300 text-zinc-500 hover:bg-muted"
              )}
              title="Show every individual capability in this module"
            >
              Advanced
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
            </button>
            {current === "custom" && !isFullGranted && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-[11.5px] font-semibold text-amber-700">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Custom mix
              </span>
            )}
          </div>
        </div>

        {/* Right: status chip + divider (matches the reference) */}
        <div className="flex items-center gap-4 lg:w-[170px] lg:shrink-0 lg:justify-end">
          <span className="hidden h-10 w-px bg-zinc-200 lg:block" />
          <span className={cn(
            "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold",
            chip.bg, chip.text
          )}>
            <span className={cn("h-2 w-2 rounded-full", chip.dot)} />
            {chip.label}
          </span>
        </div>
      </div>

      {/* LEVEL 3 — Advanced fine-grained toggles */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-500/40 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Individual capabilities
                </p>
                <Badge tone={grantedInModule > 0 ? "brand" : "neutral"}>
                  {grantedInModule}/{moduleKeys.length}
                </Badge>
              </div>
              {advancedGroups.map((g) => (
                <div key={g.id} className="mb-3 last:mb-0">
                  <p className="mb-1 text-[11.5px] font-semibold text-zinc-500">{g.label}</p>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {g.permissions.map((p) => {
                      const checked = granted.has(p.key);
                      return (
                        <label
                          key={p.key}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition",
                            disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted",
                            checked && !disabled && "bg-[#F5F7FF]"
                          )}
                        >
                          <Checkbox checked={checked} onChange={() => !disabled && onToggleKey(p.key)} aria-label={p.label} />
                          <span className={cn("font-medium", checked ? "text-zinc-900" : "text-zinc-600")}>{p.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MatrixTab({
  savedGrants, saveGrants, enterPreview, allRoles, addRole,
  isCustomRole, canDeleteRole, deleteRole, membersInRole, activeRoleId, setActiveRoleId,
  updateRoleWorkspaces,
}: {
  savedGrants: ReturnType<typeof usePermissions>["grants"];
  saveGrants: ReturnType<typeof usePermissions>["saveGrants"];
  enterPreview: ReturnType<typeof usePermissions>["enterPreview"];
  allRoles: RoleDef[];
  addRole: ReturnType<typeof usePermissions>["addRole"];
  isCustomRole: ReturnType<typeof usePermissions>["isCustomRole"];
  canDeleteRole: ReturnType<typeof usePermissions>["canDeleteRole"];
  deleteRole: ReturnType<typeof usePermissions>["deleteRole"];
  membersInRole: ReturnType<typeof usePermissions>["membersInRole"];
  activeRoleId: string;
  setActiveRoleId: (id: string) => void;
  updateRoleWorkspaces: ReturnType<typeof usePermissions>["updateRoleWorkspaces"];
}) {
  const [grants, setGrants] = useState<Record<string, Set<PermissionKey>>>(() => draftFromContext(savedGrants, allRoles));
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletedToast, setDeletedToast] = useState<string | null>(null);
  /** Which module rows have their Advanced fine-grained toggles expanded. */
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  /** Which preset (if any) was last applied — purely cosmetic highlight. */
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);

  // Backfill drafts for any role created elsewhere without clobbering edits.
  useEffect(() => {
    setGrants((prev) => {
      const missing = allRoles.filter((r) => !(r.id in prev));
      if (missing.length === 0) return prev;
      const next = { ...prev };
      for (const r of missing) next[r.id] = resolveGrantedKeys(savedGrants, r.id);
      return next;
    });
  }, [allRoles, savedGrants]);

  const activeRole = allRoles.find((r) => r.id === activeRoleId) ?? allRoles[0];
  const isPlatformOwner = activeRole.id === "platform_owner";

  function handleCreateRole(input: { label: string; summary: string; workspaces: WorkspaceId[] }) {
    const newId = addRole({ label: input.label, summary: input.summary, workspaces: input.workspaces, permissions: [] });
    setGrants((prev) => ({ ...prev, [newId]: new Set<PermissionKey>() }));
    setActiveRoleId(newId);
    setAddRoleOpen(false);
    setDirty(false);
  }

  const affectedMembers = membersInRole(activeRoleId);
  const reassignCandidates = allRoles.filter((r) => r.id !== activeRoleId);

  function handleDeleteRole(reassignTo?: string) {
    const result = deleteRole(activeRoleId, reassignTo);
    if (!result.ok) return;
    const deletedLabel = activeRole.label;
    setGrants((prev) => {
      const next = { ...prev };
      delete next[activeRoleId];
      return next;
    });
    setActiveRoleId(allRoles.find((r) => r.id !== activeRoleId)?.id ?? allRoles[0].id);
    setDeleteOpen(false);
    setDirty(false);
    setDeletedToast(`"${deletedLabel}" was deleted.`);
    setTimeout(() => setDeletedToast(null), 2600);
  }

  function toggle(key: PermissionKey) {
    if (isPlatformOwner) return;
    setGrants((prev) => {
      const next = { ...prev, [activeRoleId]: new Set(prev[activeRoleId]) };
      if (next[activeRoleId].has(key)) next[activeRoleId].delete(key);
      else next[activeRoleId].add(key);
      return next;
    });
    setDirty(true);
  }

  function toggleGroup(groupKeys: PermissionKey[], nextChecked: boolean) {
    if (isPlatformOwner) return;
    setGrants((prev) => {
      const next = { ...prev, [activeRoleId]: new Set(prev[activeRoleId]) };
      for (const k of groupKeys) {
        if (nextChecked) next[activeRoleId].add(k);
        else next[activeRoleId].delete(k);
      }
      return next;
    });
    setDirty(true);
  }

  /** Set a whole module to an access level: clears the module's keys, then adds
   *  the cumulative bundle for the chosen level. Keeps everything else intact. */
  function setModuleLevel(mod: ModuleDef, level: AccessLevel) {
    if (isPlatformOwner) return;
    const moduleKeys = allModuleKeys(mod);
    const grantKeys = levelToKeys(mod, level);
    setGrants((prev) => {
      const nextSet = new Set(prev[activeRoleId]);
      for (const k of moduleKeys) nextSet.delete(k);
      for (const k of grantKeys) nextSet.add(k);
      return { ...prev, [activeRoleId]: nextSet };
    });
    setAppliedPreset(null);
    setDirty(true);
  }

  /** Master switch — grant or revoke EVERY capability across ALL modules.
   *  IMPORTANT: the wildcard `full_access` god-key (which BYPASSES the matrix)
   *  is reserved for owner roles only. For any other role, "Full" grants every
   *  individual module capability explicitly — so the role is fully capable but
   *  still governed by the matrix (never a silent bypass). The DB enforces this
   *  too (migration 0036), so a non-owner can never hold full_access. */
  function setAllFull(nextFull: boolean) {
    if (isPlatformOwner) return;
    const isOwnerRole = activeRoleId === "master_shop_owner" || activeRoleId === "platform_owner";
    setGrants((prev) => {
      if (!nextFull) return { ...prev, [activeRoleId]: new Set<PermissionKey>() };
      const everything = new Set<PermissionKey>();
      if (isOwnerRole) everything.add("full_access");
      for (const mod of PERMISSION_MODULES) {
        for (const k of allModuleKeys(mod)) everything.add(k);
      }
      return { ...prev, [activeRoleId]: everything };
    });
    setAppliedPreset(null);
    setDirty(true);
  }

  /** Apply a ready-made preset — replaces the whole role's grant set. */
  function applyPreset(presetId: string) {
    if (isPlatformOwner) return;
    const preset = ROLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setGrants((prev) => ({ ...prev, [activeRoleId]: new Set(presetToKeys(preset.levels)) }));
    setAppliedPreset(presetId);
    setDirty(true);
  }

  function toggleExpanded(moduleId: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  function resetRole() {
    setGrants((prev) => ({
      ...prev,
      [activeRoleId]: new Set(
        activeRole.permissions === "all" ? ALL_PERMISSIONS.map((p) => p.key) : activeRole.permissions
      ),
    }));
    setDirty(false);
  }

  async function saveChanges() {
    setSaving(true);
    setSaveError(null);
    const result = await saveGrants(activeRoleId, Array.from(grants[activeRoleId] ?? []));
    setSaving(false);
    if (!result.ok) {
      // Keep the form dirty so the user can retry; surface why it didn't save.
      setSaveError(result.error ?? "Could not save. Please try again.");
      return;
    }
    setDirty(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  }

  const grantedSet = grants[activeRoleId] ?? new Set<PermissionKey>();
  const grantedCount = grantedSet.size;

  // True when EVERY capability of EVERY module is granted (drives the master
  // toggle). Same definition as each row's per-section "Full" switch.
  const allModulesFull = useMemo(
    () => PERMISSION_MODULES.every((m) => {
      const keys = allModuleKeys(m);
      return keys.length > 0 && keys.every((k) => grantedSet.has(k));
    }),
    [grantedSet]
  );

  // Which modules match the search (by module label OR any capability label).
  const visibleModules = useMemo(() => {
    if (!query.trim()) return PERMISSION_MODULES;
    const q = query.toLowerCase();
    return PERMISSION_MODULES.filter((m) => {
      if (m.label.toLowerCase().includes(q) || m.blurb.toLowerCase().includes(q)) return true;
      const moduleKeys = new Set(allModuleKeys(m));
      const labels = PERMISSION_GROUPS.flatMap((g) => g.permissions)
        .filter((p) => moduleKeys.has(p.key))
        .map((p) => p.label.toLowerCase());
      return labels.some((l) => l.includes(q));
    });
  }, [query]);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-zinc-700">
            What can <span className="font-bold text-[#3347D6]">{activeRole.label}</span> do?
          </p>
          <p className="text-[12px] text-muted-foreground">
            Pick a starting template, then fine-tune each area. Simple by default — open &ldquo;Advanced&rdquo; for exact control.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Can permission="manage_roles">
            <Button variant="outline" size="md" className="gap-1.5 whitespace-nowrap rounded-full" onClick={() => setAddRoleOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add Role
            </Button>
          </Can>
          <Can permission={["roles_preview", "manage_roles"]}>
            <Button
              variant="outline"
              size="md"
              className="gap-1.5 whitespace-nowrap rounded-full"
              onClick={() => enterPreview(activeRoleId)}
              title="Rebuild the entire CRM using this role's currently saved permissions"
            >
              <Eye className="h-4 w-4" /> Preview
            </Button>
          </Can>
          <Can permission="manage_roles">
            <Button size="md" className="gap-1.5 whitespace-nowrap rounded-full" disabled={!dirty || saving} loading={saving} onClick={saveChanges}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
            </Button>
          </Can>
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
        Saved. Click &quot;Preview&quot; to experience the app exactly as {activeRole.label}.
      </motion.div>

      {/* Save error — kept visible until the next successful save so a failed
          write is never mistaken for a successful one. */}
      {saveError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[12.5px] font-medium text-rose-700">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Couldn&apos;t save changes: {saveError}</span>
        </div>
      )}

      {/* Role selector */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex min-w-full items-center gap-1 rounded-full border border-border bg-muted p-1">
          {allRoles.map((r) => (
            <button
              key={r.id}
              onClick={() => { setActiveRoleId(r.id); setAppliedPreset(null); }}
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

      {isPlatformOwner && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] font-medium text-amber-700">
          <Lock className="h-4 w-4" /> Platform Owner always has full access — its permissions can&apos;t be edited.
        </div>
      )}

      {/* ── LEVEL 1 — Start from a template ─────────────────────────────── */}
      {!isPlatformOwner && (
        <section className="rounded-2xl border-2 border-zinc-300 bg-card p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#4361EE]" />
            <h3 className="text-[13.5px] font-bold">Start from a template</h3>
            <span className="text-[11px] text-muted-foreground">One click sets sensible access — then adjust below.</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {ROLE_PRESETS.map((p) => {
              const Icon = PRESET_ICON[p.icon] ?? ShieldCheck;
              const active = appliedPreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  title={p.summary}
                  className={cn(
                    "group flex flex-col items-start gap-1.5 rounded-xl border px-3 py-3 text-left transition",
                    active
                      ? "border-[#4361EE] bg-[#EEF1FD] shadow-[0_0_0_1px_rgba(67,97,238,0.25)]"
                      : "border-zinc-200 bg-card hover:border-[#B3BFF6] hover:bg-[#F5F7FF]/60"
                  )}
                >
                  <span className={cn(
                    "grid h-8 w-8 place-items-center rounded-lg",
                    active ? "bg-[#4361EE] text-white" : "bg-[#EEF1FD] text-[#4361EE]"
                  )}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[12.5px] font-semibold leading-tight">{p.label}</span>
                  <span className="line-clamp-2 text-[10.5px] leading-snug text-muted-foreground">{p.summary}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── MASTER TOGGLE — full access to every section at once ────────── */}
      {!isPlatformOwner && (
        <div className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border-2 px-5 py-4 shadow-card transition",
          allModulesFull ? "border-[#4361EE] bg-[#EEF1FD]" : "border-zinc-300 bg-card"
        )}>
          <div className="flex items-center gap-3">
            <span className={cn(
              "grid h-9 w-9 place-items-center rounded-lg",
              allModulesFull ? "bg-[#4361EE] text-white" : "bg-muted text-zinc-500"
            )}>
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13.5px] font-bold leading-tight">Full access to everything</p>
              <p className="text-[11.5px] text-muted-foreground">Turn on to grant this role every capability in every section.</p>
            </div>
          </div>
          <FullAccessToggle checked={allModulesFull} onChange={setAllFull} ariaLabel="Grant full access to all sections" />
        </div>
      )}

      {/* Search */}
      <div className="flex items-center justify-between gap-3">
        <Input
          iconLeft={<Search className="h-4 w-4" />}
          placeholder="Search a module or capability…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 max-w-sm"
        />
        <span className="hidden text-[12px] text-muted-foreground sm:inline">
          {grantedCount} capabilit{grantedCount === 1 ? "y" : "ies"} granted
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* ── LEVEL 2 + 3 — per-module access level, with Advanced drawer ── */}
        <div className="space-y-3">
          {visibleModules.map((mod) => (
            <ModuleAccessRow
              key={mod.id}
              module={mod}
              granted={grantedSet}
              disabled={isPlatformOwner}
              expanded={expandedModules.has(mod.id)}
              onToggleExpanded={() => toggleExpanded(mod.id)}
              onSetLevel={(lvl) => setModuleLevel(mod, lvl)}
              onToggleKey={(k) => toggle(k)}
            />
          ))}
          {visibleModules.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-card px-5 py-10 text-center text-[13px] text-muted-foreground">
              No modules or capabilities match &ldquo;{query}&rdquo;.
            </div>
          )}
        </div>

        {/* Summary sidebar */}
        <div className="space-y-4 lg:sticky lg:top-[72px] lg:self-start">
          <div className="rounded-2xl border-2 border-zinc-300 bg-card p-5 shadow-card">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg brand-gradient text-white shadow-glow">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold leading-tight">{activeRole.label}</p>
                <p className="text-[11px] text-muted-foreground">{grantedCount} capabilities granted</p>
              </div>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-600">{activeRole.summary}</p>

            {/* Plain-English summary of what this role can do, by module. */}
            <div className="mt-4 border-t border-zinc-200 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">In plain English</p>
              <ul className="mt-2 space-y-1">
                {PERMISSION_MODULES.map((mod) => {
                  const lvl = keysToLevel(mod, grantedSet);
                  if (lvl === "none") return null;
                  const label = lvl === "custom" ? "Custom" : ACCESS_LEVELS.find((a) => a.id === lvl)?.label ?? lvl;
                  return (
                    <li key={mod.id} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="text-zinc-600">{mod.label}</span>
                      <span className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                        lvl === "custom" ? "bg-amber-100 text-amber-700" : "bg-[#EEF1FD] text-[#3347D6]"
                      )}>{label}</span>
                    </li>
                  );
                })}
                {PERMISSION_MODULES.every((m) => keysToLevel(m, grantedSet) === "none") && (
                  <li className="text-[12px] text-muted-foreground">No access granted yet.</li>
                )}
              </ul>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-zinc-200 pt-3">
              <button
                onClick={resetRole}
                disabled={isPlatformOwner}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-zinc-500 hover:text-zinc-800 disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset to default
              </button>
              {canDeleteRole(activeRoleId) && (
                <button
                  onClick={() => setDeleteOpen(true)}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-rose-600 hover:text-rose-700"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete role
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-4">
            <p className="text-[13px] font-semibold text-[#3347D6]">Workspace access</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#3347D6]/70">
              Which top-level workspaces this role can reach. Saves immediately.
            </p>
            <div className="mt-3 space-y-1.5">
              {WORKSPACES.map((w) => {
                const checked = activeRole.workspaces.includes(w.id);
                return (
                  <label
                    key={w.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition",
                      checked ? "border-[#B3BFF6] bg-white" : "border-border hover:bg-white/60",
                      isPlatformOwner && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => {
                        if (isPlatformOwner) return;
                        const next = checked
                          ? activeRole.workspaces.filter((id) => id !== w.id)
                          : [...activeRole.workspaces, w.id];
                        if (next.length === 0) return;
                        updateRoleWorkspaces(activeRoleId, next);
                      }}
                      aria-label={w.label}
                    />
                    <span className={cn("font-medium", checked ? "text-zinc-900" : "text-zinc-500")}>{w.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <AddRoleDrawer open={addRoleOpen} onClose={() => setAddRoleOpen(false)} onCreate={handleCreateRole} />

      <DeleteRoleDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        role={activeRole}
        isBuiltIn={!isCustomRole(activeRoleId)}
        affectedMembers={affectedMembers}
        otherRoles={reassignCandidates}
        onConfirm={handleDeleteRole}
      />

      {/* Deleted confirmation */}
      <motion.div
        initial={false}
        animate={{ opacity: deletedToast ? 1 : 0, y: deletedToast ? 0 : -6 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-[12.5px] font-medium text-zinc-700 shadow-[0_12px_40px_-12px_rgba(20,30,80,0.25)]",
          !deletedToast && "pointer-events-none"
        )}
        style={{ display: deletedToast ? "flex" : "none" }}
      >
        <Trash2 className="h-4 w-4 text-rose-500" />
        {deletedToast}
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TAB 3 — Users & Assignment
   Every login, their assigned role, workspace access and branch — with
   change-role and remove actions. Ported from the old settings/users page.
   ───────────────────────────────────────────────────────────────────────── */
function UsersTab({
  team, allRoles, getRoleById, setMemberRole, deleteMember,
  resetPassword, setStaffStatus, toggleLogin,
}: {
  team: TeamMember[];
  allRoles: RoleDef[];
  getRoleById: ReturnType<typeof usePermissions>["getRoleById"];
  setMemberRole: ReturnType<typeof usePermissions>["setMemberRole"];
  deleteMember: ReturnType<typeof usePermissions>["deleteMember"];
  resetPassword: ReturnType<typeof usePermissions>["resetPassword"];
  setStaffStatus: ReturnType<typeof usePermissions>["setStaffStatus"];
  toggleLogin: ReturnType<typeof usePermissions>["toggleLogin"];
}) {
  const { currentUser } = usePermissions();
  const selfEmail = currentUser?.email ?? "";

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [resetting, setResetting] = useState<TeamMember | null>(null);
  const [suspending, setSuspending] = useState<TeamMember | null>(null);
  const rows = team.filter((t) =>
    (t.name + t.email + t.roleId).toLowerCase().includes(query.toLowerCase())
  );

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

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#EEF1FD]">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/70">
                <th className="px-5 py-3">Member</th>
                <th className="py-3">Role</th>
                <th className="py-3">Modules</th>
                <th className="py-3">Branch</th>
                <th className="py-3">Status</th>
                <th className="w-[70px] py-3 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const role = getRoleById(t.roleId);
                const isSelf = t.email === selfEmail;
                return (
                  <motion.tr
                    key={t.email}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 * i }}
                    className="border-t border-border transition hover:bg-muted/40"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={t.name} size={32} />
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-semibold leading-tight">
                            {t.name}
                            {isSelf && <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">(you)</span>}
                          </p>
                          <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            <Mail className="h-3 w-3" /> {t.email}
                          </p>
                          {t.phone && (
                            <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                              <Phone className="h-3 w-3" /> {t.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge tone="brand">{role?.label ?? t.roleId}</Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1">
                        {role?.workspaces.map((w) => {
                          const wd = WORKSPACE_MAP[w as WorkspaceId];
                          return (
                            <span key={w} className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold", wd.bg, wd.color)}>
                              {wd.short}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3 whitespace-nowrap text-muted-foreground">{t.branch}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS_TONE[t.status]} dot={t.status === "active"}>{STATUS_LABEL[t.status]}</Badge>
                        {!t.loginEnabled && <Badge tone="neutral">No login</Badge>}
                      </div>
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <Can permission="manage_users">
                        <div className="flex justify-end">
                          <Dropdown
                            align="right"
                            width="w-52"
                            trigger={({ toggle }) => (
                              <button
                                onClick={toggle}
                                aria-label="Manage staff member"
                                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            )}
                          >
                            {(close) => (
                              <>
                                <MenuLabel>Manage access</MenuLabel>
                                <MenuItem icon={UserCog} onClick={() => { setEditing(t); close(); }}>
                                  Change role
                                </MenuItem>
                                <MenuItem icon={KeyRound} onClick={() => { setResetting(t); close(); }}>
                                  Reset password
                                </MenuItem>
                                {t.loginEnabled ? (
                                  <MenuItem icon={Power} onClick={() => { toggleLogin(t.id, false); close(); }}>
                                    Disable login
                                  </MenuItem>
                                ) : (
                                  <MenuItem icon={Power} onClick={() => { setResetting(t); close(); }}>
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
        <div className="flex items-center justify-between border-t border-border p-4">
          <p className="text-xs text-muted-foreground">Showing {rows.length} of {team.length} staff members</p>
        </div>
      </div>

      <ChangeRoleDrawer
        open={!!editing}
        onClose={() => setEditing(null)}
        memberName={editing?.name ?? ""}
        currentRoleId={editing?.roleId ?? allRoles[0].id}
        roles={allRoles}
        onConfirm={(roleId) => editing && changeRole(editing.email, roleId)}
      />

      <ResetPasswordDrawer
        open={!!resetting}
        onClose={() => setResetting(null)}
        memberName={resetting?.name ?? ""}
        onConfirm={(password) => {
          if (resetting) resetPassword(resetting.id, password);
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
                    <input
                      type="checkbox"
                      checked={isDemo}
                      onChange={(e) => toggleDemoRole(r.id, e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
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
