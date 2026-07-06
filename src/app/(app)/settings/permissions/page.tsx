"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ShieldCheck, ChevronRight, Search, RotateCcw, Save, Info, Eye, CheckCircle2, UserPlus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { AddRoleDrawer } from "@/components/settings/add-role-drawer";
import { DeleteRoleDialog } from "@/components/settings/delete-role-dialog";
import {
  PERMISSION_GROUPS, ALL_PERMISSIONS, type PermissionKey, type RoleDef, type WorkspaceId,
} from "@/lib/permissions";
import { usePermissions, resolveGrantedKeys } from "@/lib/permissions-context";
import { cn } from "@/lib/utils";

/** Local, editable draft of the permission grants — mirrors what the Super
 *  Admin / Master Shop Owner would save back to the backend. Seeded from the
 *  *shared* permissions context (not the static role catalogue) so this page
 *  always starts in sync with whatever was last saved — including by a
 *  previous visit to this page in the same session. */
function draftFromContext(
  grants: ReturnType<typeof usePermissions>["grants"],
  roles: RoleDef[]
): Record<string, Set<PermissionKey>> {
  const map: Record<string, Set<PermissionKey>> = {};
  for (const r of roles) map[r.id] = resolveGrantedKeys(grants, r.id);
  return map;
}

export default function PermissionsPage() {
  const {
    grants: savedGrants, saveGrants, enterPreview, allRoles, addRole,
    isCustomRole, canDeleteRole, deleteRole, membersInRole,
  } = usePermissions();
  const [grants, setGrants] = useState<Record<string, Set<PermissionKey>>>(() => draftFromContext(savedGrants, allRoles));
  const [activeRoleId, setActiveRoleId] = useState(allRoles[2]?.id ?? allRoles[0].id); // Master Shop Owner
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletedToast, setDeletedToast] = useState<string | null>(null);

  // A role created elsewhere in the session (or by this page) may not have a
  // draft entry yet — backfill without clobbering in-progress edits.
  useEffect(() => {
    setGrants((prev) => {
      const missing = allRoles.filter((r) => !(r.id in prev));
      if (missing.length === 0) return prev;
      const next = { ...prev };
      for (const r of missing) next[r.id] = resolveGrantedKeys(savedGrants, r.id);
      return next;
    });
  }, [allRoles, savedGrants]);

  const activeRole = allRoles.find((r) => r.id === activeRoleId) as RoleDef;
  const isPlatformOwner = activeRole.id === "platform_owner"; // always full access, non-editable by design

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
    if (!result.ok) return; // dialog already surfaces the reason; nothing to do here
    const deletedLabel = activeRole.label;
    setGrants((prev) => {
      const next = { ...prev };
      delete next[activeRoleId];
      return next;
    });
    // Land back on a role that still exists (Master Shop Owner, or whatever's first).
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

  /** Persist this role's draft grants to the shared context — this is what the
   *  rest of the CRM (sidebar, dashboards, buttons, Preview Mode) reads from. */
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
      <PageHeader
        eyebrow="Settings / Permissions"
        title="Roles & Permissions Matrix"
        subtitle="Assign exactly what each role can see and do. Changes apply the moment you save."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/settings/roles"
              className="inline-flex items-center whitespace-nowrap gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium text-zinc-600 transition hover:bg-muted"
            >
              Role responsibilities
            </Link>
            <Button
              variant="outline"
              size="md"
              className="gap-1.5 whitespace-nowrap rounded-full"
              onClick={() => setAddRoleOpen(true)}
            >
              <UserPlus className="h-4 w-4" /> Add Role
            </Button>
            <Button
              variant="outline"
              size="md"
              className="gap-1.5 whitespace-nowrap rounded-full"
              onClick={() => enterPreview(activeRoleId)}
              title="Rebuild the entire CRM using this role's currently saved permissions"
            >
              <Eye className="h-4 w-4" /> Preview Current Role
            </Button>
            <Button size="md" className="gap-1.5 whitespace-nowrap rounded-full" disabled={!dirty} onClick={saveChanges}>
              <Save className="h-4 w-4" /> Save changes
            </Button>
          </div>
        }
      />

      {/* Saved confirmation — subtle, self-dismissing, no layout shift */}
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
        Saved. Click &quot;Preview Current Role&quot; to see {activeRole.label} exactly as they will.
      </motion.div>

      {/* Role selector — segmented, horizontally scrollable */}
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
        <div className="space-y-4">
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

          <Link
            href="/settings/roles"
            className="group flex items-center justify-between rounded-2xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-4 transition hover:bg-[#E5E9FA]"
          >
            <div>
              <p className="text-[13px] font-semibold text-[#3347D6]">Role responsibilities</p>
              <p className="text-[11px] text-[#3347D6]/70">See what each role is meant to do, in plain language</p>
            </div>
            <ChevronRight className="h-4 w-4 text-[#4361EE] transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      <AddRoleDrawer
        open={addRoleOpen}
        onClose={() => setAddRoleOpen(false)}
        onCreate={handleCreateRole}
      />

      <DeleteRoleDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        role={activeRole}
        isBuiltIn={!isCustomRole(activeRoleId)}
        affectedMembers={affectedMembers}
        otherRoles={reassignCandidates}
        onConfirm={handleDeleteRole}
      />

      {/* Deleted confirmation — same self-dismissing pattern as the Save toast */}
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
