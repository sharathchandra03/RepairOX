"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Store Management — the central place to create, edit, activate/deactivate
   and open stores, and to create a store login (Store Manager) in one flow.

   Single source of truth: reads/writes the SAME `branches` (store) records used
   by the global store selector, Owner Dashboard, and every store-scoped module,
   via /api/owner/stores. Refreshes the header store selector after changes.

   Rendered inside Settings → Store → Store Configuration.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Plus, MapPin, Users, Ticket, ArrowRight, Power, Search, Pencil, UserCog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input, Label, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { cn } from "@/lib/utils";

type StoreEnvironment = "demo" | "live";

interface StoreRow {
  id: string; name: string; code: string | null; address: string | null;
  isActive: boolean; environment: StoreEnvironment; createdAt?: string; staffCount: number; ticketCount: number;
  manager?: string | null;
}

/** The preferred default role for a store's first login, IF it exists in the
 *  organization's Roles & Permissions. We never invent it — if it's absent we
 *  fall back to the first available role and require an explicit choice. */
const PREFERRED_MANAGER_ROLE = "shop_owner_branch_manager";

const TIMEZONES = [
  { label: "Asia/Kolkata (IST)", value: "Asia/Kolkata" },
  { label: "Asia/Dubai (GST)", value: "Asia/Dubai" },
  { label: "America/New_York (EST)", value: "America/New_York" },
  { label: "Europe/London (GMT)", value: "Europe/London" },
];

const emptyForm = { name: "", code: "", address: "", city: "", state: "", postalCode: "", country: "India", phone: "", email: "", timezone: "Asia/Kolkata", isActive: true, environment: "live" as StoreEnvironment };

export function StoreManagement() {
  const router = useRouter();
  const { apiFetch, authReady, can, allRoles } = usePermissions();
  const { setActiveStore, refreshStores } = useStoreContext();

  const canManage = can("manage_branches") || can("full_access");

  // Role options come straight from the organization's Roles & Permissions
  // (Settings → Roles & Permissions) — the single source of truth. We never
  // hardcode a duplicate list here. `allRoles` already merges built-in and
  // custom roles for the current org.
  const roleOptions = useMemo(
    () => allRoles.map((r) => ({ label: r.label, value: r.id })),
    [allRoles]
  );
  // Default to Store Manager only if that role actually exists; otherwise the
  // first available role (and we require the owner to confirm the choice).
  const defaultRoleId = useMemo(() => {
    if (allRoles.some((r) => r.id === PREFERRED_MANAGER_ROLE)) return PREFERRED_MANAGER_ROLE;
    return allRoles[0]?.id ?? "";
  }, [allRoles]);
  const hasRoles = roleOptions.length > 0;

  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Drawer state — shared for create + edit.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  // Optional store login (only on create).
  const [createLogin, setCreateLogin] = useState(false);
  const [mgr, setMgr] = useState({ name: "", email: "", password: "", roleId: "" });

  // Dedicated "add login to an existing store" drawer.
  const [loginDrawerStore, setLoginDrawerStore] = useState<StoreRow | null>(null);
  const [loginSaving, setLoginSaving] = useState(false);
  const [loginForm, setLoginForm] = useState({ name: "", email: "", password: "", roleId: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch("/api/owner/stores");
    if (res.ok && res.json?.ok) setStores(res.json.stores as StoreRow[]);
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { if (authReady) load(); }, [authReady, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) =>
      s.name.toLowerCase().includes(q) ||
      (s.code ?? "").toLowerCase().includes(q) ||
      (s.manager ?? "").toLowerCase().includes(q)
    );
  }, [stores, query]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setCreateLogin(false);
    setMgr({ name: "", email: "", password: "", roleId: defaultRoleId });
    setDrawerOpen(true);
  }

  function openEdit(s: StoreRow) {
    setEditingId(s.id);
    setForm({
      ...emptyForm,
      name: s.name,
      code: s.code ?? "",
      address: s.address ?? "",
      isActive: s.isActive,
      environment: s.environment ?? "live",
    });
    setCreateLogin(false);
    setDrawerOpen(true);
  }

  async function submit() {
    if (!form.name.trim()) { toast.error("Store name is required"); return; }
    if (!form.code.trim()) { toast.error("Store code is required"); return; }

    // ── Edit existing store ──
    if (editingId) {
      setSaving(true);
      const res = await apiFetch(`/api/owner/stores/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: form.name.trim(), code: form.code.trim(), address: form.address.trim(), isActive: form.isActive, environment: form.environment }),
      });
      setSaving(false);
      if (!res.ok || !res.json?.ok) { toast.error(res.json?.error ?? "Could not update store"); return; }
      toast.success(`${form.name.trim()} updated`);
      setDrawerOpen(false);
      await load();
      await refreshStores();
      return;
    }

    // ── Create new store (+ optional manager login) ──
    if (createLogin) {
      if (!hasRoles) { toast.error("No roles available. Create a role in Roles & Permissions first."); return; }
      if (!mgr.name.trim()) { toast.error("Store manager name is required"); return; }
      if (!mgr.email.trim()) { toast.error("Store manager email is required"); return; }
      if (mgr.password.trim().length < 6) { toast.error("Manager password must be at least 6 characters"); return; }
      if (!mgr.roleId || !allRoles.some((r) => r.id === mgr.roleId)) { toast.error("Select a valid role for the store login"); return; }
    }

    setSaving(true);
    const res = await apiFetch("/api/owner/stores", { method: "POST", body: JSON.stringify(form) });
    if (!res.ok || !res.json?.ok) {
      setSaving(false);
      toast.error(res.json?.reason === "duplicate_name" ? "A store with that name already exists" : "Could not create store");
      return;
    }

    const newStoreId: string | undefined = res.json?.store?.id;

    if (createLogin) {
      const staffRes = await apiFetch("/api/staff", {
        method: "POST",
        body: JSON.stringify({
          name: mgr.name.trim(), email: mgr.email.trim(), hasLogin: true,
          password: mgr.password, roleId: mgr.roleId,
          // Bind by the real store id (robust) AND the name (client match).
          storeId: newStoreId, branch: form.name.trim(),
        }),
      });
      setSaving(false);
      if (!staffRes.ok || !staffRes.json?.ok) {
        const reason = staffRes.json?.reason;
        toast.error(
          reason === "duplicate_email" ? "Store created, but that manager email is already in use"
          : reason === "forbidden_role" ? "Store created, but you're not allowed to assign that role"
          : reason === "invalid_role" ? "Store created, but the selected role no longer exists"
          : "Store created, but the manager login could not be created"
        );
        setDrawerOpen(false);
        await load(); await refreshStores();
        return;
      }
      toast.success(`Store "${form.name.trim()}" + manager login created`);
    } else {
      setSaving(false);
      toast.success(`Store "${form.name.trim()}" created`);
    }

    setDrawerOpen(false);
    await load();
    await refreshStores();
  }

  async function toggleActive(s: StoreRow) {
    const res = await apiFetch(`/api/owner/stores/${s.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !s.isActive }) });
    if (!res.ok || !res.json?.ok) { toast.error("Could not update store"); return; }
    toast.success(`${s.name} ${s.isActive ? "deactivated" : "activated"}`);
    await load(); await refreshStores();
  }

  function openStore(s: StoreRow) {
    setActiveStore(s.id);
    router.push("/dashboard");
  }

  function openLoginDrawer(s: StoreRow) {
    setLoginDrawerStore(s);
    setLoginForm({ name: "", email: "", password: "", roleId: defaultRoleId });
  }

  async function submitLogin() {
    const s = loginDrawerStore;
    if (!s) return;
    if (!hasRoles) { toast.error("No roles available. Create a role in Roles & Permissions first."); return; }
    if (!loginForm.name.trim()) { toast.error("User name is required"); return; }
    if (!loginForm.email.trim()) { toast.error("Login email is required"); return; }
    if (loginForm.password.trim().length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (!loginForm.roleId || !allRoles.some((r) => r.id === loginForm.roleId)) { toast.error("Select a valid role"); return; }

    setLoginSaving(true);
    const res = await apiFetch("/api/staff", {
      method: "POST",
      body: JSON.stringify({
        name: loginForm.name.trim(),
        email: loginForm.email.trim(),
        hasLogin: true,
        password: loginForm.password,
        roleId: loginForm.roleId,
        // Bind explicitly to THIS store (branch id) + its exact name.
        storeId: s.id,
        branch: s.name,
      }),
    });
    setLoginSaving(false);

    if (!res.ok || !res.json?.ok) {
      const reason = res.json?.reason;
      toast.error(
        reason === "duplicate_email" ? "That login email is already in use"
        : reason === "forbidden_role" ? "You're not allowed to assign that role"
        : reason === "invalid_role" ? "The selected role no longer exists"
        : (res.json?.error ?? "Could not create the store login")
      );
      return;
    }
    toast.success(`Login created for ${s.name}. They'll land directly in this store.`);
    setLoginDrawerStore(null);
    await load();
    await refreshStores();
  }

  if (!canManage) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
        You don&apos;t have permission to manage stores. Ask an owner for access.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stores, code, manager…"
            className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-[13px] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15"
          />
        </div>
        <Button size="md" className="gap-1.5 rounded-full shrink-0" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Create store
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl border border-border bg-muted/40" />)}
        </div>
      ) : stores.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-semibold">No stores created yet.</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Create your first store to start managing multi-store RepairOX.</p>
          <Button size="md" className="mt-4 gap-1.5 rounded-full" onClick={openCreate}><Plus className="h-4 w-4" /> Create store</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
          No stores match “{query}”.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i }}
              className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[10px] font-bold text-[#4361EE]">
                    {(b.code || b.name).slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-bold leading-tight">{b.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {b.isActive
                        ? <Badge tone="success" dot>Active</Badge>
                        : <Badge tone="warning" dot>Inactive</Badge>}
                      {b.environment === "demo" && <Badge tone="warning">Demo</Badge>}
                      {b.code && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{b.code}</span>}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => toggleActive(b)}
                  title={b.isActive ? "Deactivate store" : "Activate store"}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Power className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-1 text-[12.5px] text-zinc-600">
                <p className="inline-flex items-start gap-1.5">
                  <UserCog className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {b.manager ? <span>Manager: <span className="font-medium">{b.manager}</span></span> : <span className="text-muted-foreground/70">No manager assigned</span>}
                </p>
                {b.address && (
                  <p className="inline-flex items-start gap-1.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />{b.address}</p>
                )}
              </div>

              <div className="mt-3 flex items-center gap-4 border-t border-border pt-3 text-[12px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {b.staffCount} staff</span>
                <span className="inline-flex items-center gap-1.5"><Ticket className="h-3.5 w-3.5" /> {b.ticketCount} tickets</span>
              </div>

              <div className="mt-4 flex items-center gap-2">
                {/* Primary action fills the row; secondary actions are compact,
                    equal-size icon buttons with tooltips so nothing wraps. */}
                <button
                  onClick={() => openStore(b)}
                  className="group inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#E5E9F8] bg-[#F5F7FF] px-3 text-[12px] font-semibold text-[#3A4DBB] transition hover:border-[#B3BFF6]"
                >
                  Open store <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </button>
                <button
                  onClick={() => openEdit(b)}
                  title="Edit store details"
                  aria-label="Edit store details"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-zinc-600 transition hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openLoginDrawer(b)}
                  title="Create a login for this store"
                  aria-label="Create a login for this store"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-zinc-600 transition hover:bg-muted hover:text-foreground"
                >
                  <UserCog className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Create / Edit drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingId ? "Edit store" : "Create store"}
        subtitle={editingId ? "Update this store's details." : "Creates a fresh RepairOX workspace inside your organization."}
        icon={editingId ? Pencil : Plus}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{editingId ? "Save changes" : "Create store"}</Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Store information */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Store information</p>
            <div>
              <Label htmlFor="s-name">Store name *</Label>
              <Input id="s-name" value={form.name} placeholder="e.g. Koramangala"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="s-code">Store code *</Label>
                <Input id="s-code" value={form.code} placeholder="e.g. KOR"
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) }))} />
              </div>
              <div>
                <Label htmlFor="s-tz">Timezone</Label>
                <Select id="s-tz" value={form.timezone} options={TIMEZONES}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="s-addr">Address</Label>
              <Input id="s-addr" value={form.address} placeholder="Street, area"
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label htmlFor="s-city">City</Label><Input id="s-city" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></div>
              <div><Label htmlFor="s-state">State</Label><Input id="s-state" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} /></div>
              <div><Label htmlFor="s-pin">Postal</Label><Input id="s-pin" value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="s-phone">Phone</Label><Input id="s-phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              <div><Label htmlFor="s-email">Email</Label><Input id="s-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            </div>
          </section>

          {/* Access — create login (create mode only) */}
          {!editingId && (
            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Access</p>
              <div className="rounded-xl border border-border p-3">
                <label className="flex cursor-pointer items-start gap-2.5">
                  <input type="checkbox" checked={createLogin} onChange={(e) => setCreateLogin(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#4361EE]" />
                  <span>
                    <span className="block text-[13px] font-semibold">Create a store login</span>
                    <span className="block text-[12px] text-muted-foreground">Add a Store Manager who logs in and lands directly in this store.</span>
                  </span>
                </label>
                {createLogin && (
                  <div className="mt-3 space-y-3 border-t border-border pt-3">
                    <div><Label htmlFor="m-name">Store Manager name *</Label><Input id="m-name" value={mgr.name} placeholder="e.g. Rahul Sharma" onChange={(e) => setMgr((m) => ({ ...m, name: e.target.value }))} /></div>
                    <div><Label htmlFor="m-email">Login email *</Label><Input id="m-email" type="email" value={mgr.email} placeholder="koramangala@repairox.com" onChange={(e) => setMgr((m) => ({ ...m, email: e.target.value }))} /></div>
                    <div>
                      <Label htmlFor="m-role">Role *</Label>
                      {hasRoles ? (
                        <Select id="m-role" value={mgr.roleId} placeholder="Select a role"
                          onChange={(e) => setMgr((m) => ({ ...m, roleId: e.target.value }))}
                          options={roleOptions}
                          className="h-[34px] px-3 text-[13px]" />
                      ) : (
                        <div className="mt-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
                          No roles available.{" "}
                          <button type="button" onClick={() => router.push("/settings/roles-permissions")} className="font-semibold text-[#4361EE] hover:underline">
                            Create a role in Roles &amp; Permissions
                          </button>{" "}first.
                        </div>
                      )}
                      {hasRoles && (
                        <p className="mt-1 text-[11px] text-muted-foreground">The role defines what this user can do; their access is scoped to this store.</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="m-pass">Temporary password *</Label>
                      <Input id="m-pass" type="text" value={mgr.password} placeholder="At least 6 characters" onChange={(e) => setMgr((m) => ({ ...m, password: e.target.value }))} />
                      <p className="mt-1 text-[11px] text-muted-foreground">Share this with the manager; they can change it after first login.</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Environment (DEMO | LIVE) — the store's kind. Distinct from the
              operational Active/Inactive status. A real branch defaults to
              Live; a demonstration/test store is Demo. */}
          <section className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Environment</p>
            <div className="flex items-center gap-2">
              {(["demo", "live"] as const).map((env) => {
                const active = form.environment === env;
                return (
                  <button
                    key={env}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, environment: env }))}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize transition",
                      active ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-border bg-card text-zinc-600 hover:bg-muted"
                    )}
                  >
                    {env}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Status (ACTIVE | INACTIVE) — operational activation. Shown only in
              edit mode, where a store can be deactivated; new stores are created
              active by default. */}
          {editingId && (
            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
              <div className="flex items-center gap-2">
                {(["active", "inactive"] as const).map((st) => {
                  const active = form.isActive === (st === "active");
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, isActive: st === "active" }))}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize transition",
                        active ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-border bg-card text-zinc-600 hover:bg-muted"
                      )}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </Drawer>

      {/* Add-login drawer (for an existing store) */}
      <Drawer
        open={loginDrawerStore !== null}
        onClose={() => setLoginDrawerStore(null)}
        title="Create store login"
        subtitle={loginDrawerStore ? `This login will have access to ${loginDrawerStore.name} only.` : ""}
        icon={UserCog}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setLoginDrawerStore(null)}>Cancel</Button>
            <Button onClick={submitLogin} loading={loginSaving}>Create login</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-[#EEF1FD] px-3 py-2 text-[12px] text-[#3A4DBB]">
            The user signs in with these credentials and lands directly in
            <span className="font-semibold"> {loginDrawerStore?.name}</span>. They can only see and act in this store.
          </div>
          <div>
            <Label htmlFor="l-name">User name *</Label>
            <Input id="l-name" value={loginForm.name} placeholder="e.g. Rahul Sharma"
              onChange={(e) => setLoginForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="l-email">Login email *</Label>
            <Input id="l-email" type="email" value={loginForm.email} placeholder="store@repairox.com"
              onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="l-pass">Password *</Label>
            <Input id="l-pass" type="text" value={loginForm.password} placeholder="At least 6 characters"
              onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))} />
            <p className="mt-1 text-[11px] text-muted-foreground">Share this with the user; they can change it after first login.</p>
          </div>
          <div>
            <Label htmlFor="l-role">Role *</Label>
            {hasRoles ? (
              <Select id="l-role" value={loginForm.roleId} placeholder="Select a role"
                onChange={(e) => setLoginForm((f) => ({ ...f, roleId: e.target.value }))}
                options={roleOptions}
                className="h-[34px] px-3 text-[13px]"
              />
            ) : (
              <div className="mt-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
                No roles available.{" "}
                <button type="button" onClick={() => router.push("/settings/roles-permissions")} className="font-semibold text-[#4361EE] hover:underline">
                  Create a role in Roles &amp; Permissions
                </button>{" "}first.
              </div>
            )}
            {hasRoles && (
              <p className="mt-1 text-[11px] text-muted-foreground">Roles come from Roles &amp; Permissions. Access is scoped to this store.</p>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
