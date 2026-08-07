"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ShieldCheck, ChevronRight, Search, RotateCcw, Save, Info, Eye,
  CheckCircle2, UserPlus, Trash2, Users, Building2, Wrench, Package,
  TrendingUp, Wallet, Crown, Code2, LayoutGrid, SlidersHorizontal,
  Mail, UserCog, Plus, MapPin, KeyRound, MoreHorizontal, Power, Ban, Phone,
  Sparkles,
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
import type { TeamMember } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  FEATURE_REGISTRY, featuresByWorkspace,
  type VisibilityMode, type FeatureEntry,
} from "@/lib/feature-visibility";

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
      window.history.replaceState(null, "", "/roles-permissions");
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
          <Link href="/roles-permissions/add-user">
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
            <Link href="/roles-permissions/add-user">
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
   see and do, then saves. Ported from the old settings/permissions page.
   ───────────────────────────────────────────────────────────────────────── */
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
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletedToast, setDeletedToast] = useState<string | null>(null);

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

  const filteredGroups = useMemo(() => {
    if (!query.trim()) return PERMISSION_GROUPS;
    const q = query.toLowerCase();
    return PERMISSION_GROUPS
      .map((g) => ({ ...g, permissions: g.permissions.filter((p) => p.label.toLowerCase().includes(q)) }))
      .filter((g) => g.permissions.length > 0);
  }, [query]);

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

  function resetRole() {
    setGrants((prev) => ({
      ...prev,
      [activeRoleId]: new Set(
        activeRole.permissions === "all" ? ALL_PERMISSIONS.map((p) => p.key) : activeRole.permissions
      ),
    }));
    setDirty(false);
  }

  function saveChanges() {
    saveGrants(activeRoleId, Array.from(grants[activeRoleId] ?? []));
    setDirty(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  }

  const grantedSet = grants[activeRoleId] ?? new Set<PermissionKey>();
  const grantedCount = grantedSet.size;

  return (
    <div className="space-y-6">
      {/* Matrix toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          Assign exactly what each role can see and do.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Can permission="manage_roles">
            <Button variant="outline" size="md" className="gap-1.5 whitespace-nowrap rounded-full" onClick={() => setAddRoleOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add Role
            </Button>
          </Can>
          <Button
            variant="outline"
            size="md"
            className="gap-1.5 whitespace-nowrap rounded-full"
            onClick={() => enterPreview(activeRoleId)}
            title="Rebuild the entire CRM using this role's currently saved permissions"
          >
            <Eye className="h-4 w-4" /> Preview Role
          </Button>
          <Can permission="manage_roles">
            <Button size="md" className="gap-1.5 whitespace-nowrap rounded-full" disabled={!dirty} onClick={saveChanges}>
              <Save className="h-4 w-4" /> Save changes
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
        Saved. Click &quot;Preview Role&quot; to see {activeRole.label} exactly as they will.
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Permission groups */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Input
              iconLeft={<Search className="h-4 w-4" />}
              placeholder="Search capabilities..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-10 max-w-xs"
            />
            {isPlatformOwner && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-amber-700">
                <Info className="h-3.5 w-3.5" /> Platform Owner always has full access
              </span>
            )}
          </div>

          {/* Grant Full Access toggle */}
          {!isPlatformOwner && (
            <label className={cn(
              "flex cursor-pointer items-center gap-3 rounded-2xl border px-5 py-4 transition",
              grantedCount === ALL_PERMISSIONS.length
                ? "border-[#4361EE] bg-[#F5F7FF] shadow-[0_0_0_1px_rgba(67,97,238,0.2)]"
                : "border-border bg-card hover:border-[#B3BFF6] hover:bg-[#F5F7FF]/50"
            )}>
              <Checkbox
                checked={grantedCount === ALL_PERMISSIONS.length}
                indeterminate={grantedCount > 0 && grantedCount < ALL_PERMISSIONS.length}
                onChange={(next) => {
                  setGrants((prev) => ({
                    ...prev,
                    [activeRoleId]: next
                      ? new Set(ALL_PERMISSIONS.map((p) => p.key))
                      : new Set<PermissionKey>(),
                  }));
                  setDirty(true);
                }}
                aria-label="Grant full access"
              />
              <div>
                <p className="text-[13.5px] font-semibold leading-tight">Grant Full Access</p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">Select all {ALL_PERMISSIONS.length} capabilities at once</p>
              </div>
            </label>
          )}

          {filteredGroups.map((g, gi) => {
            const groupKeys = g.permissions.map((p) => p.key);
            const groupGrantedCount = groupKeys.filter((k) => grantedSet.has(k)).length;
            const allChecked = groupGrantedCount === groupKeys.length;
            const someChecked = groupGrantedCount > 0 && !allChecked;

            return (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.03 * gi }}
                className="rounded-2xl border border-border bg-card shadow-card"
              >
                <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={allChecked}
                      indeterminate={someChecked}
                      onChange={(next) => toggleGroup(groupKeys, next)}
                      aria-label={`Toggle all ${g.label}`}
                      className={isPlatformOwner ? "opacity-50 pointer-events-none" : ""}
                    />
                    <div>
                      <p className="text-[13.5px] font-semibold leading-tight">{g.label}</p>
                      <p className="text-[11px] text-muted-foreground">{g.description}</p>
                    </div>
                  </div>
                  <Badge tone={groupGrantedCount > 0 ? "brand" : "neutral"}>
                    {groupGrantedCount}/{groupKeys.length}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-1 p-3 sm:grid-cols-2">
                  {g.permissions.map((p) => {
                    const checked = grantedSet.has(p.key);
                    return (
                      <label
                        key={p.key}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition",
                          isPlatformOwner ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted",
                          checked && !isPlatformOwner && "bg-[#F5F7FF]"
                        )}
                      >
                        <Checkbox checked={checked} onChange={() => toggle(p.key)} aria-label={p.label} />
                        <span className={cn("font-medium", checked ? "text-zinc-900" : "text-zinc-600")}>{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Summary sidebar */}
        <div className="space-y-4 lg:sticky lg:top-[72px] lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg brand-gradient text-white shadow-glow">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold leading-tight">{activeRole.label}</p>
                <p className="text-[11px] text-muted-foreground">{grantedCount}/{ALL_PERMISSIONS.length} capabilities granted</p>
              </div>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-600">{activeRole.summary}</p>

            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-[linear-gradient(90deg,#4361EE,#3B54E8)]"
                initial={{ width: 0 }}
                animate={{ width: `${(grantedCount / ALL_PERMISSIONS.length) * 100}%` }}
                transition={{ type: "spring", stiffness: 90, damping: 22 }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between">
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

          <div className="mt-6 rounded-2xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-4">
            <p className="text-[13px] font-semibold text-[#3347D6]">Workspace access</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#3347D6]/70">
              Which modules this role can reach. Changes save immediately.
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

          <div className="mt-2 rounded-2xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-4">
            <p className="text-[13px] font-semibold text-[#3347D6]">Access levels</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#3347D6]/70">
              View, Create, Edit, Delete, Assign, Approve and Export sit under the
              Access Levels group above and apply across every module this role can reach.
            </p>
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
          <Link href="/roles-permissions/add-user">
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
              <button
                onClick={resetDemo}
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Demo Data
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
