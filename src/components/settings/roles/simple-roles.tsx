"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Simple Roles & Permissions
   Two screens, one idea:
     • Roles tab        — a plain list of roles (search, create, edit, copy, …).
     • Permissions tab  — pick a role, then one row per module with three
                          checkboxes: View · Update · Manage. Expand a row to
                          fine-tune individual permissions.
   Persistence is unchanged: the draft is the same flat PermissionKey[] that
   `saveGrants` already stores. The checkboxes are just a friendlier face on the
   existing PERMISSION_MODULES tiers (view / work / manage / full):
     View   → tier "view"
     Update → tier "work"
     Manage → tier "manage"   (delete, approve, assign, configure)
     "full" tier keys (void, reconcile, …) are individual toggles in the
     expanded list only.
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Copy, Crown, Eye, MoreHorizontal, Pencil, Plus, RotateCcw, Save, Search, Trash2, Users, Lock, CheckCircle2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select, Label } from "@/components/ui/input";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { RoxTableCard, RoxTableHead, RoxHeadRow, RoxTableRow, RoxTableCell } from "@/components/ui/rox-table";
import { AddRoleDrawer } from "@/components/settings/add-role-drawer";
import { DeleteRoleDialog } from "@/components/settings/delete-role-dialog";
import { Can } from "@/components/common/can";
import { CAP, allow } from "@/lib/capabilities";
import { PERMISSION_GROUPS, WORKSPACES, type PermissionKey, type RoleDef, type WorkspaceId } from "@/lib/permissions";
import { usePermissions, resolveGrantedKeys } from "@/lib/permissions-context";
import { PERMISSION_MODULES, allModuleKeys, type ModuleDef } from "@/lib/permission-levels";
import { cn } from "@/lib/utils";

const KEY_LABEL: Record<string, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.label]))
);

type Tier = "view" | "update" | "manage";
const TIERS: { id: Tier; label: string; hint: string }[] = [
  { id: "view", label: "View", hint: "See records and reports" },
  { id: "update", label: "Update", hint: "Create and edit records" },
  { id: "manage", label: "Manage", hint: "Delete, approve, assign and configure" },
];

function tierKeys(m: ModuleDef, t: Tier): PermissionKey[] {
  const lv = t === "view" ? m.levels.view : t === "update" ? m.levels.work : m.levels.manage;
  return lv ?? [];
}
function specialKeys(m: ModuleDef): PermissionKey[] {
  return m.levels.full ?? [];
}
/** Tier + everything below it (View ⊂ Update ⊂ Manage). */
function tiersAtOrBelow(t: Tier): Tier[] {
  return t === "view" ? ["view"] : t === "update" ? ["view", "update"] : ["view", "update", "manage"];
}
function tiersAtOrAbove(t: Tier): Tier[] {
  return t === "manage" ? ["manage"] : t === "update" ? ["update", "manage"] : ["view", "update", "manage"];
}
function tierState(m: ModuleDef, t: Tier, g: Set<PermissionKey>): "on" | "some" | "off" | "none" {
  const keys = tierKeys(m, t);
  if (keys.length === 0) return "none";
  const n = keys.filter((k) => g.has(k)).length;
  return n === 0 ? "off" : n === keys.length ? "on" : "some";
}
function tierOfKey(m: ModuleDef, k: PermissionKey): string {
  for (const t of TIERS) if (tierKeys(m, t.id).includes(k)) return t.label;
  return "Special";
}

/** Keys that never belong on a non-owner role (DB rejects them too). */
const OWNER_ONLY: PermissionKey[] = ["full_access"];
function isOwnerRoleId(id: string) {
  return id === "master_shop_owner" || id === "platform_owner";
}
function isSuperuser(granted: Set<PermissionKey>) {
  if (granted.has("full_access")) return true;
  return PERMISSION_MODULES.every((m) => {
    const ks = allModuleKeys(m);
    return ks.length > 0 && ks.every((k) => granted.has(k));
  });
}

/* ═════════════════════════════ ROLES TAB ═════════════════════════════════ */
export function RolesListTab({
  onEditPermissions, onOpenUsers,
}: {
  onEditPermissions: (roleId: string) => void;
  onOpenUsers: () => void;
}) {
  const {
    allRoles, grants, addRole, membersInRole, can, enterPreview,
    isCustomRole, canDeleteRole, deleteRole, updateRoleMeta,
  } = usePermissions();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [renaming, setRenaming] = useState<RoleDef | null>(null);
  const [renameDraft, setRenameDraft] = useState({ label: "", summary: "" });
  const [deleting, setDeleting] = useState<RoleDef | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allRoles.filter((r) => r.label.toLowerCase().includes(q)) : allRoles;
  }, [allRoles, query]);
  useEffect(() => { setPage(1); }, [query, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  function duplicate(r: RoleDef) {
    const keys = Array.from(resolveGrantedKeys(grants, r.id)).filter((k) => !OWNER_ONLY.includes(k) && (k as string) !== "*");
    addRole({ label: `${r.label} (copy)`, summary: r.summary, workspaces: r.workspaces, permissions: keys });
    flash(`"${r.label}" duplicated.`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          iconLeft={<Search className="h-4 w-4" />}
          placeholder="Search role name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 w-full sm:w-80"
        />
        <Can permission={CAP.admin.manageRoles}>
          <Button size="md" className="gap-1.5 rounded-full" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create Role
          </Button>
        </Can>
      </div>

      <RoxTableCard>
        <colgroup>
          <col />
          <col className="w-[140px]" />
          <col className="w-[150px]" />
        </colgroup>
        <RoxTableHead top={0}>
          <RoxHeadRow>
            <th className="px-4 py-4">Role</th>
            <th className="px-3 py-4">Users</th>
            <th className="px-3 py-4 text-right">Actions</th>
          </RoxHeadRow>
        </RoxTableHead>
        <tbody>
          {paged.map((r) => {
            const members = membersInRole(r.id);
            const sup = isSuperuser(resolveGrantedKeys(grants, r.id));
            return (
              <RoxTableRow key={r.id} className="cursor-pointer" onClick={() => onEditPermissions(r.id)}>
                <RoxTableCell className="px-4">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[14px] font-semibold" title={r.label}>{r.label}</span>
                    {sup && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                        <Crown className="h-3 w-3" /> Superuser
                      </span>
                    )}
                    {!isCustomRole(r.id) && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Built-in</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground" title={r.summary}>{r.summary}</p>
                </RoxTableCell>
                <RoxTableCell className="px-3 text-[13px] tabular-nums">
                  {members.length} {members.length === 1 ? "user" : "users"}
                </RoxTableCell>
                <RoxTableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn label="Edit permissions" onClick={() => onEditPermissions(r.id)}><Pencil className="h-4 w-4" /></IconBtn>
                    <Can permission={CAP.admin.manageRoles}>
                      <IconBtn label="Duplicate role" onClick={() => duplicate(r)}><Copy className="h-4 w-4" /></IconBtn>
                    </Can>
                    <Dropdown
                      width="w-52"
                      trigger={({ toggle }) => (
                        <IconBtn label="More actions" onClick={toggle}><MoreHorizontal className="h-4 w-4" /></IconBtn>
                      )}
                    >
                      {(close) => (
                        <div className="p-1">
                          {r.id !== "platform_owner" && (
                            <MenuItem icon={Pencil} onClick={() => { close(); setRenameDraft({ label: r.label, summary: r.summary }); setRenaming(r); }}>Rename</MenuItem>
                          )}
                          <MenuItem icon={Users} onClick={() => { close(); onOpenUsers(); }}>View users</MenuItem>
                          {allow(can, ["roles_preview", "manage_roles"]) && (
                            <MenuItem icon={Eye} onClick={() => { close(); enterPreview(r.id); }}>Preview as this role</MenuItem>
                          )}
                          {canDeleteRole(r.id) && allow(can, CAP.admin.deleteRole) && (
                            <MenuItem icon={Trash2} danger onClick={() => { close(); setDeleting(r); }}>Delete role</MenuItem>
                          )}
                        </div>
                      )}
                    </Dropdown>
                  </div>
                </RoxTableCell>
              </RoxTableRow>
            );
          })}
          {paged.length === 0 && (
            <tr><td colSpan={3} className="px-4 py-12 text-center text-[13px] text-muted-foreground">No roles match &ldquo;{query}&rdquo;.</td></tr>
          )}
        </tbody>
      </RoxTableCard>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filtered.length}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        itemLabel="role"
      />

      <AddRoleDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(input: { label: string; summary: string; workspaces: WorkspaceId[] }) => {
          const id = addRole({ ...input, permissions: [] });
          setCreateOpen(false);
          onEditPermissions(id);
        }}
      />

      <RoxCenteredForm
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename role"
        subtitle="Change the name or description. Permissions stay the same."
        icon={Pencil}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button
              disabled={!renameDraft.label.trim()}
              onClick={() => {
                if (renaming) updateRoleMeta(renaming.id, { label: renameDraft.label.trim(), summary: renameDraft.summary.trim() });
                setRenaming(null);
              }}
            >Save</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Role name</Label>
            <Input value={renameDraft.label} onChange={(e) => setRenameDraft((p) => ({ ...p, label: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={renameDraft.summary} onChange={(e) => setRenameDraft((p) => ({ ...p, summary: e.target.value }))} />
          </div>
        </div>
      </RoxCenteredForm>

      {deleting && (
        <DeleteRoleDialog
          open
          onClose={() => setDeleting(null)}
          role={deleting}
          isBuiltIn={!isCustomRole(deleting.id)}
          affectedMembers={membersInRole(deleting.id)}
          otherRoles={allRoles.filter((r) => r.id !== deleting.id)}
          onConfirm={(reassignTo?: string) => {
            const res = deleteRole(deleting.id, reassignTo);
            if (res.ok) flash(`"${deleting.label}" was deleted.`);
            setDeleting(null);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-zinc-200 bg-white px-4 py-2.5 text-[12.5px] font-medium text-zinc-700 shadow-[0_12px_40px_-12px_rgba(20,30,80,0.25)]">
          {toast}
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════ PERMISSIONS TAB ═════════════════════════════ */
export function PermissionsTab({
  roleId, onRoleChange,
}: {
  roleId: string;
  onRoleChange: (id: string) => void;
}) {
  const { allRoles, grants: saved, saveGrants, updateRoleWorkspaces } = usePermissions();
  const role = allRoles.find((r) => r.id === roleId) ?? allRoles[0];
  const locked = role.id === "platform_owner";

  const [draft, setDraft] = useState<Set<PermissionKey>>(() => resolveGrantedKeys(saved, role.id));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pendingRole, setPendingRole] = useState<string | null>(null);

  // Re-seed whenever the role changes, or saved grants change while clean.
  useEffect(() => {
    if (!dirty) setDraft(resolveGrantedKeys(saved, role.id));
  }, [saved, role.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDraft(resolveGrantedKeys(saved, role.id));
    setDirty(false);
    setError(null);
  }, [role.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function mutate(fn: (s: Set<PermissionKey>) => void) {
    if (locked) return;
    setDraft((prev) => { const n = new Set(prev); fn(n); return n; });
    setDirty(true);
    setJustSaved(false);
  }
  function setTier(m: ModuleDef, t: Tier, on: boolean) {
    mutate((s) => {
      if (on) {
        for (const x of tiersAtOrBelow(t)) tierKeys(m, x).forEach((k) => s.add(k));
      } else {
        for (const x of tiersAtOrAbove(t)) tierKeys(m, x).forEach((k) => s.delete(k));
        // Turning View off removes the whole module, special keys included.
        if (t === "view") specialKeys(m).forEach((k) => s.delete(k));
      }
    });
  }
  function setTierAll(t: Tier, on: boolean) {
    for (const m of PERMISSION_MODULES) setTier(m, t, on);
  }
  function toggleKey(k: PermissionKey) {
    mutate((s) => { if (s.has(k)) s.delete(k); else s.add(k); });
  }
  function setSuperuser(on: boolean) {
    mutate((s) => {
      s.clear();
      if (!on) return;
      if (isOwnerRoleId(role.id)) s.add("full_access");
      for (const m of PERMISSION_MODULES) allModuleKeys(m).forEach((k) => s.add(k));
    });
  }
  function reset() {
    setDraft(resolveGrantedKeys(saved, role.id));
    setDirty(false);
    setError(null);
  }
  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveGrants(role.id, Array.from(draft));
    setSaving(false);
    if (!res.ok) { setError(res.error ?? "Could not save. Please try again."); return; }
    setDirty(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  }
  function requestRole(id: string) {
    if (id === role.id) return;
    if (dirty) setPendingRole(id);
    else onRoleChange(id);
  }

  const q = query.trim().toLowerCase();
  const rows = useMemo(() => {
    return PERMISSION_MODULES.map((m) => {
      const keys = allModuleKeys(m);
      if (!q) return { m, keys, matched: null as PermissionKey[] | null };
      if (m.label.toLowerCase().includes(q)) return { m, keys, matched: null };
      const matched = keys.filter((k) => (KEY_LABEL[k] ?? k).toLowerCase().includes(q));
      return matched.length ? { m, keys, matched } : null;
    }).filter(Boolean) as { m: ModuleDef; keys: PermissionKey[]; matched: PermissionKey[] | null }[];
  }, [q]);

  const headerState = (t: Tier) => {
    const states = PERMISSION_MODULES.map((m) => tierState(m, t, draft)).filter((s) => s !== "none");
    if (states.length === 0) return { checked: false, indeterminate: false };
    const all = states.every((s) => s === "on");
    const any = states.some((s) => s !== "off");
    return { checked: all, indeterminate: any && !all };
  };
  const superuser = isSuperuser(draft);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold">Select a role to assign permissions</p>
          <p className="text-[12.5px] text-muted-foreground">Control what each role can access. Protect sensitive data and limit access to the right tools.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="h-[38px] w-60"
            value={role.id}
            onChange={(e) => requestRole(e.target.value)}
            options={allRoles.map((r) => ({ label: r.label, value: r.id }))}
          />
          <Can permission={CAP.admin.manageRoles}>
            <Button variant="outline" size="md" className="gap-1.5 rounded-full" disabled={!dirty || saving} onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <Button size="md" className="gap-1.5 rounded-full" disabled={!dirty || saving || locked} loading={saving} onClick={save}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Changes"}
            </Button>
          </Can>
        </div>
      </div>

      {justSaved && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12.5px] font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Saved. Changes apply to everyone with the {role.label} role.
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[12.5px] font-medium text-rose-700">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" /> Couldn&apos;t save changes: {error}
        </div>
      )}
      {locked && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] font-medium text-amber-700">
          <Lock className="h-4 w-4" /> Platform Owner always has full access and can&apos;t be edited.
        </div>
      )}

      {/* Where this role can go */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border bg-card px-4 py-3">
        <span className="text-[12.5px] font-semibold text-zinc-700">Can open</span>
        {WORKSPACES.map((w) => {
          const checked = role.workspaces.includes(w.id);
          return (
            <label key={w.id} className={cn("flex items-center gap-2 text-[13px]", locked ? "opacity-60" : "cursor-pointer")}>
              <Checkbox
                checked={checked}
                disabled={locked}
                aria-label={w.label}
                onChange={() => {
                  const next = checked ? role.workspaces.filter((id) => id !== w.id) : [...role.workspaces, w.id];
                  if (next.length === 0) return;
                  updateRoleWorkspaces(role.id, next);
                }}
              />
              {w.label}
            </label>
          );
        })}
        <span className="ml-auto flex items-center gap-2 text-[13px]">
          <Checkbox checked={superuser} disabled={locked} aria-label="Superuser" onChange={setSuperuser} />
          <span className="font-medium">Superuser</span>
          <span className="hidden text-[12px] text-muted-foreground md:inline">every permission on</span>
        </span>
      </div>

      {/* Search + master checkboxes */}
      <div className="grid grid-cols-[1fr_repeat(3,84px)_32px] items-center gap-x-2 px-4">
        <Input
          iconLeft={<Search className="h-4 w-4" />}
          placeholder="Search permissions (e.g. inventory, discount, refund)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 max-w-md"
        />
        {TIERS.map((t) => {
          const s = headerState(t.id);
          return (
            <label key={t.id} title={`${t.hint} (all modules)`} className="flex cursor-pointer items-center justify-center gap-1.5 text-[13px] font-semibold">
              <Checkbox checked={s.checked} indeterminate={s.indeterminate} disabled={locked} aria-label={`${t.label} all modules`} onChange={(v) => setTierAll(t.id, v)} />
              {t.label}
            </label>
          );
        })}
        <span />
      </div>

      <div className="space-y-2">
        {rows.map(({ m, keys, matched }) => {
          const expanded = open.has(m.id) || !!matched;
          const shown = matched ?? keys;
          return (
            <div key={m.id} className="rounded-xl border border-border bg-card shadow-sm">
              <div
                className="grid cursor-pointer grid-cols-[1fr_repeat(3,84px)_32px] items-center gap-x-2 px-4 py-3"
                onClick={() => setOpen((p) => { const n = new Set(p); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{m.label}</p>
                </div>
                {TIERS.map((t) => {
                  const s = tierState(m, t.id, draft);
                  return (
                    <div key={t.id} className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                      {s !== "none" && (
                        <Checkbox
                          checked={s === "on"}
                          indeterminate={s === "some"}
                          disabled={locked}
                          aria-label={`${m.label} ${t.label}`}
                          onChange={(v) => setTier(m, t.id, v)}
                        />
                      )}
                    </div>
                  );
                })}
                <ChevronDown className={cn("h-4 w-4 justify-self-center text-zinc-400 transition-transform", expanded && "rotate-180")} />
              </div>
              {expanded && (
                <div className="border-t border-border">
                  <p className="px-4 pt-2.5 text-[12px] text-muted-foreground">{m.blurb}</p>
                  <ul className="py-1">
                    {shown.map((k) => (
                      <li key={k} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40">
                        <label className={cn("flex min-w-0 flex-1 items-center gap-3 text-[13.5px]", !locked && "cursor-pointer")}>
                          <Checkbox checked={draft.has(k)} disabled={locked} aria-label={KEY_LABEL[k] ?? k} onChange={() => toggleKey(k)} />
                          <span className="truncate">{KEY_LABEL[k] ?? k}</span>
                        </label>
                        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{tierOfKey(m, k)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-zinc-300 bg-card px-5 py-10 text-center text-[13px] text-muted-foreground">
            Nothing matches &ldquo;{query}&rdquo;.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingRole}
        onClose={() => setPendingRole(null)}
        title="Discard unsaved changes?"
        description={`You changed permissions for ${role.label} but haven't saved. Switching role will discard them.`}
        confirmLabel="Discard & switch"
        onConfirm={() => { if (pendingRole) onRoleChange(pendingRole); setPendingRole(null); }}
      />
    </div>
  );
}
