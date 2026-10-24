"use client";

import { useCallback, useEffect, useState } from "react";
import {
  UserCog, Mail, Phone, ShieldCheck, Store, Home, KeyRound, Clock,
  CircleUser, CheckCircle2, AlertTriangle, Lock, Ban, Power, Pencil,
  Loader2, Fingerprint, Building2, ArrowRight,
} from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input, Label } from "@/components/ui/input";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { allow, CAP } from "@/lib/capabilities";
import { isValidEmail } from "@/lib/leads-data";
import type { TeamMember } from "@/lib/mock-data";
import type { RoleDef } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────
   User Details drawer — the complete account view for a staff member.

   Opened from Users & Assignment (and, later, View Store → People With
   Access). Shows EVERYTHING an authorized administrator needs:
     • identity (name / email / phone / role)
     • which store(s) the user is assigned to
     • account status + created + last login
     • CREDENTIAL STATUS — password set / last changed / must-reset
       (NEVER the plaintext password — that does not exist to show)
     • credential-management actions (edit name, change role, reset password,
       set temporary password + force change, enable/disable login, suspend)

   Security: passwords are hashed by Supabase Auth. There is deliberately no
   "view current password" — the owner may RESET a password but can never
   RETRIEVE one. This mirrors the RepairOX authorization + credential rules.
   ───────────────────────────────────────────────────────────────────────── */

interface UserStore {
  id: string;
  name: string;
  code: string | null;
  isDefault: boolean;
  roleId: string | null;
  isHome: boolean;
}

interface CredentialStatus {
  hasLogin: boolean;
  passwordSet: boolean;
  lastPasswordChangedAt: string | null;
  passwordResetRequired: boolean;
  disabledAt: string | null;
}

/** One recorded store relocation (from the audit trail). */
interface StoreChange {
  from: string | null;
  to: string | null;
  by: string | null;
  at: string | null;
}

interface UserDetail {
  member: TeamMember;
  stores: UserStore[];
  credential: CredentialStatus;
  storeHistory?: StoreChange[];
  isSelf: boolean;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDay(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function UserDetailsDrawer({
  open,
  member,
  roles,
  onClose,
  onChangeRole,
  onChangeStore,
  onResetPassword,
  onToggleLogin,
  onSuspend,
  onActivate,
}: {
  open: boolean;
  /** The list-row member; the drawer fetches full detail on open. */
  member: TeamMember | null;
  roles: RoleDef[];
  onClose: () => void;
  /** Open the Change Role drawer for this member. */
  onChangeRole: (m: TeamMember) => void;
  /** Open the Change Store drawer for this member (home-store relocation). */
  onChangeStore?: (m: TeamMember) => void;
  /** Open the Reset Password drawer for this member. `mode` distinguishes
   *  resetting an existing login from creating the first password to enable it. */
  onResetPassword: (m: TeamMember, mode?: "reset" | "enable") => void;
  /** Enable/disable login. */
  onToggleLogin: (id: string, enabled: boolean) => void;
  /** Suspend the account. */
  onSuspend: (m: TeamMember) => void;
  /** Re-activate a suspended account. */
  onActivate: (id: string) => void;
}) {
  const { apiFetch, can, currentUser, updateStaff } = usePermissions();
  const { stores: allStores, canViewAllShops } = useStoreContext();

  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<UserDetail | null>(null);

  // Inline identity edit (name / email / phone).
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [identityDraft, setIdentityDraft] = useState({ name: "", email: "", phone: "" });
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityErr, setIdentityErr] = useState<string | null>(null);

  // Additional-store access management (multi-store).
  const [savingStoreId, setSavingStoreId] = useState<string | null>(null);

  const canManage = can("manage_users") || can("edit_users") || can("full_access");

  const load = useCallback(async () => {
    if (!member) return;
    setLoading(true);
    const res = await apiFetch(`/api/staff/${member.id}`);
    if (res.ok && res.json?.ok) {
      setDetail(res.json as UserDetail);
    } else {
      // Fall back to the row we already have (local/demo mode or missing route).
      setDetail({
        member,
        stores: member.branch
          ? [{ id: member.branchId ?? "home", name: member.branch, code: null, isDefault: true, roleId: member.roleId, isHome: true }]
          : [],
        credential: {
          hasLogin: member.loginEnabled,
          passwordSet: member.loginEnabled,
          lastPasswordChangedAt: member.lastPasswordChangedAt ?? null,
          passwordResetRequired: Boolean(member.passwordResetRequired),
          disabledAt: member.disabledAt ?? null,
        },
        isSelf: member.email === (currentUser?.email ?? ""),
      });
    }
    setLoading(false);
  }, [member, apiFetch, currentUser?.email]);

  useEffect(() => {
    if (open && member) {
      setEditingIdentity(false);
      setIdentityErr(null);
      load();
    }
  }, [open, member, load]);

  if (!member) return null;

  const d = detail?.member ?? member;
  const cred = detail?.credential;
  const stores = detail?.stores ?? [];
  const storeHistory = detail?.storeHistory ?? [];
  const homeStore = stores.find((s) => s.isHome) ?? null;
  const role = roles.find((r) => r.id === d.roleId);
  const isSelf = detail?.isSelf ?? (d.email === (currentUser?.email ?? ""));
  const canChangeStore = canManage && !isSelf && !!onChangeStore && allow(can, CAP.store.assignUsers);
  // Managing ADDITIONAL store access needs the store-user-assign capability AND
  // a multi-store org (more than one store the admin can see). Independent of
  // the home-store relocation ("Change store") control.
  const canManageStoreAccess = canManage && allow(can, CAP.store.assignUsers) && canViewAllShops && allStores.length > 1;
  // The set of stores the user already has access to (home + grants).
  const assignedStoreIds = new Set(stores.map((s) => s.id));

  const statusTone: "success" | "warning" | "danger" =
    d.status === "active" ? "success" : d.status === "suspended" ? "danger" : "warning";
  const statusLabel = d.status === "active" ? "Active" : d.status === "suspended" ? "Suspended" : "Invited";

  async function saveIdentity() {
    const name = identityDraft.name.trim();
    const email = identityDraft.email.trim();
    const phone = identityDraft.phone.trim();
    if (!name) { setIdentityErr("Name is required."); return; }
    if (email && !isValidEmail(email)) { setIdentityErr("Enter a valid email address."); return; }
    setIdentityErr(null);
    // No-op if nothing changed.
    if (name === d.name && email === (d.email ?? "") && phone === (d.phone ?? "")) {
      setEditingIdentity(false); return;
    }
    setSavingIdentity(true);
    // Empty string clears the field (matches other save paths: route maps "" -> null).
    updateStaff(d.id, { name, email, phone });
    setSavingIdentity(false);
    setEditingIdentity(false);
    // Reflect immediately, then re-sync from the server.
    setDetail((prev) => (prev ? { ...prev, member: { ...prev.member, name, email, phone } } : prev));
    load();
  }

  /** Toggle access to a store: ticking grants an additional (non-home)
   *  user_stores grant, unticking revokes it. The HOME store can never be
   *  toggled off here (relocate it via "Change store" instead). */
  async function toggleStore(storeId: string, nextGranted: boolean) {
    setSavingStoreId(storeId);
    await apiFetch(`/api/staff/${d.id}`, {
      method: "PATCH",
      body: JSON.stringify(nextGranted ? { addStoreIds: [storeId] } : { removeStoreIds: [storeId] }),
    });
    setSavingStoreId(null);
    load();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={CircleUser}
      title="User details"
      subtitle={d.name}
      width="max-w-xl"
    >
      {loading && !detail ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Identity header ── */}
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
            <Avatar name={d.name} size={48} />
            <div className="min-w-0 flex-1">
              {editingIdentity ? (
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="idn-name">Name</Label>
                    <Input
                      id="idn-name"
                      value={identityDraft.name}
                      autoFocus
                      onChange={(e) => setIdentityDraft((p) => ({ ...p, name: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveIdentity(); if (e.key === "Escape") { setEditingIdentity(false); setIdentityErr(null); } }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="idn-email">Email</Label>
                    <Input
                      id="idn-email"
                      type="email"
                      value={identityDraft.email}
                      placeholder="name@example.com"
                      onChange={(e) => setIdentityDraft((p) => ({ ...p, email: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveIdentity(); if (e.key === "Escape") { setEditingIdentity(false); setIdentityErr(null); } }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="idn-phone">Phone</Label>
                    <Input
                      id="idn-phone"
                      value={identityDraft.phone}
                      placeholder="Optional"
                      onChange={(e) => setIdentityDraft((p) => ({ ...p, phone: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveIdentity(); if (e.key === "Escape") { setEditingIdentity(false); setIdentityErr(null); } }}
                    />
                  </div>
                  {identityErr && <p className="text-[11.5px] font-medium text-rose-600">{identityErr}</p>}
                  <div className="flex items-center gap-2 pt-0.5">
                    <Button size="sm" onClick={saveIdentity} loading={savingIdentity}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingIdentity(false); setIdentityErr(null); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[15px] font-bold leading-tight">
                      {d.name}
                      {isSelf && <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">(you)</span>}
                    </p>
                    {canManage && (
                      <button
                        onClick={() => { setIdentityDraft({ name: d.name, email: d.email ?? "", phone: d.phone ?? "" }); setIdentityErr(null); setEditingIdentity(true); }}
                        title="Edit profile"
                        className="text-[#4361EE] hover:underline"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> {d.email || "—"}
                  </p>
                  {d.phone && (
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" /> {d.phone}
                    </p>
                  )}
                </>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="brand">{role?.label ?? d.roleId}</Badge>
                <Badge tone={statusTone} dot={d.status === "active"}>{statusLabel}</Badge>
                {!d.loginEnabled && <Badge tone="neutral">No login</Badge>}
              </div>
            </div>
          </div>

          {/* ── Role & access ── */}
          <Section icon={ShieldCheck} title="Role & Access">
            <FieldRow label="Role" value={role?.label ?? d.roleId} />
            {role?.summary && <p className="text-[12px] leading-relaxed text-muted-foreground">{role.summary}</p>}
            {canManage && !isSelf && (
              <button
                onClick={() => onChangeRole(d)}
                className="text-[12px] font-medium text-[#4361EE] hover:underline"
              >
                Change role
              </button>
            )}
          </Section>

          {/* ── Store Access ──────────────────────────────────────────────
              A check/uncheck list of EVERY store: ticked = this user can work
              in that store. The HOME store is always ticked + locked (relocate
              it via "Change store"). Ticking grants a user_stores row; unticking
              revokes it. This is how you give "full access, but only these
              stores" without granting all-shops. */}
          <Section
            icon={Store}
            title="Store Access"
            action={canChangeStore ? (
              <button
                onClick={() => onChangeStore!(d)}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[#4361EE] hover:underline"
              >
                <Pencil className="h-3 w-3" /> Change home store
              </button>
            ) : undefined}
          >
            {!canManageStoreAccess ? (
              // Read-only view (single-store org, or no store-assign authority).
              stores.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">No store assigned.</p>
              ) : (
                <div className="space-y-2">
                  {stores.map((s) => (
                    <div key={s.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[10px] font-bold text-[#4361EE]">
                        {(s.code || s.name).slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold leading-tight">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground">{s.isHome ? "Home store" : "Additional access"}</p>
                      </div>
                      {s.isHome && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-semibold text-[#4361EE]">
                          <Home className="h-3 w-3" /> Home
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : (
              <>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Tick the stores {isSelf ? "you" : d.name.split(" ")[0]} can work in. The home store is always
                  included — relocate it with &ldquo;Change home store&rdquo;.
                </p>
                <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-0.5">
                  {allStores.map((s) => {
                    const granted = assignedStoreIds.has(s.id);
                    const isHome = homeStore?.id === s.id;
                    const busy = savingStoreId === s.id;
                    // Home store is locked on; self can't revoke their own access.
                    const locked = isHome || (isSelf && granted);
                    return (
                      <label
                        key={s.id}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition",
                          locked ? "cursor-default" : "cursor-pointer",
                          granted ? "border-[#B3BFF6] bg-[#F5F7FF]" : "border-border hover:bg-muted/50",
                          busy && "opacity-60"
                        )}
                      >
                        <Checkbox
                          checked={granted}
                          disabled={locked || busy}
                          onChange={() => { if (!locked && !busy) toggleStore(s.id, !granted); }}
                          aria-label={`${granted ? "Remove" : "Grant"} access to ${s.name}`}
                        />
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[10px] font-bold text-[#4361EE]">
                          {(s.code || s.name).slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold leading-tight">{s.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {isHome ? "Home store · always included" : granted ? "Has access" : "No access"}
                          </p>
                        </div>
                        {busy ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#4361EE]" />
                        ) : isHome ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-semibold text-[#4361EE]">
                            <Home className="h-3 w-3" /> Home
                          </span>
                        ) : !s.isActive ? (
                          <span className="shrink-0 text-[10px] font-medium text-amber-600">Inactive</span>
                        ) : null}
                      </label>
                    );
                  })}
                  {allStores.length === 0 && (
                    <p className="text-[12.5px] text-muted-foreground">No stores available.</p>
                  )}
                </div>
              </>
            )}
          </Section>

          {/* ── Store history (relocations — from the audit trail) ── */}
          {storeHistory.length > 0 && (
            <Section icon={Building2} title="Store History">
              <div className="space-y-2">
                {storeHistory.map((h, i) => (
                  <div key={i} className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[12.5px] font-medium">
                      <span className="text-muted-foreground">{h.from || "—"}</span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="text-foreground">{h.to || "—"}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {h.by ? `Changed by ${h.by}` : "Changed"}{h.at ? ` · ${fmtDate(h.at)}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Credential status (NEVER the password) ── */}
          <Section icon={KeyRound} title="Credentials">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <StatusField
                label="Password"
                value={cred?.passwordSet ? "Set" : "Not set"}
                tone={cred?.passwordSet ? "ok" : "muted"}
                icon={cred?.passwordSet ? CheckCircle2 : Lock}
              />
              <StatusField
                label="Login"
                value={cred?.hasLogin ? "Enabled" : "Disabled"}
                tone={cred?.hasLogin ? "ok" : "muted"}
                icon={cred?.hasLogin ? Power : Ban}
              />
              <FieldRow label="Last password change" value={fmtDate(cred?.lastPasswordChangedAt)} />
              <FieldRow label="Last login" value={fmtDate(d.lastLogin)} />
            </div>

            {cred?.passwordResetRequired && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Must change password at next login (temporary password issued).
              </div>
            )}

            <p className="flex items-start gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
              <Fingerprint className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              The current password can never be viewed — it's securely hashed by
              the authentication system. You can reset it or issue a temporary
              one instead.
            </p>

            {canManage && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onResetPassword(d, "reset")}>
                  <KeyRound className="h-3.5 w-3.5" /> Reset password
                </Button>
                {d.loginEnabled ? (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onToggleLogin(d.id, false)} disabled={isSelf}>
                    <Ban className="h-3.5 w-3.5" /> Disable login
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onResetPassword(d, "enable")}>
                    <Power className="h-3.5 w-3.5" /> Enable login…
                  </Button>
                )}
                {d.status === "suspended" ? (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onActivate(d.id)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Activate
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1.5 text-rose-600" onClick={() => onSuspend(d)} disabled={isSelf}>
                    <Ban className="h-3.5 w-3.5" /> Suspend
                  </Button>
                )}
              </div>
            )}
          </Section>

          {/* ── Account meta ── */}
          <Section icon={Clock} title="Account">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <FieldRow label="Created" value={fmtDay(d.createdAt)} />
              <FieldRow label="Created by" value={d.createdBy ?? "—"} />
              {d.department && <FieldRow label="Department" value={d.department} />}
              {d.designation && <FieldRow label="Designation" value={d.designation} />}
            </div>
          </Section>
        </div>
      )}
    </Drawer>
  );
}

/* ── Small building blocks ── */

function Section({
  icon: Icon, title, action, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-[12px] font-bold uppercase tracking-wider text-foreground">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[13px] font-medium text-foreground">{value}</p>
    </div>
  );
}

function StatusField({
  label, value, tone, icon: Icon,
}: {
  label: string;
  value: string;
  tone: "ok" | "muted";
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div>
      <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-0.5 inline-flex items-center gap-1.5 text-[13px] font-semibold",
        tone === "ok" ? "text-emerald-600" : "text-muted-foreground"
      )}>
        <Icon className="h-3.5 w-3.5" /> {value}
      </p>
    </div>
  );
}
