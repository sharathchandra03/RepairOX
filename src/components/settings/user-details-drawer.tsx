"use client";

import { useCallback, useEffect, useState } from "react";
import {
  UserCog, Mail, Phone, ShieldCheck, Store, Home, KeyRound, Clock,
  CircleUser, CheckCircle2, AlertTriangle, Lock, Ban, Power, Pencil,
  Loader2, Fingerprint, Building2,
} from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input, Label } from "@/components/ui/input";
import { usePermissions } from "@/lib/permissions-context";
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

interface UserDetail {
  member: TeamMember;
  stores: UserStore[];
  credential: CredentialStatus;
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
  /** Open the Reset Password drawer for this member. */
  onResetPassword: (m: TeamMember) => void;
  /** Enable/disable login. */
  onToggleLogin: (id: string, enabled: boolean) => void;
  /** Suspend the account. */
  onSuspend: (m: TeamMember) => void;
  /** Re-activate a suspended account. */
  onActivate: (id: string) => void;
}) {
  const { apiFetch, can, currentUser, updateStaff } = usePermissions();

  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<UserDetail | null>(null);

  // Inline name edit.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

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
      setEditingName(false);
      setNameDraft(member.name);
      load();
    }
  }, [open, member, load]);

  if (!member) return null;

  const d = detail?.member ?? member;
  const cred = detail?.credential;
  const stores = detail?.stores ?? [];
  const role = roles.find((r) => r.id === d.roleId);
  const isSelf = detail?.isSelf ?? (d.email === (currentUser?.email ?? ""));

  const statusTone: "success" | "warning" | "danger" =
    d.status === "active" ? "success" : d.status === "suspended" ? "danger" : "warning";
  const statusLabel = d.status === "active" ? "Active" : d.status === "suspended" ? "Suspended" : "Invited";

  async function saveName() {
    const next = nameDraft.trim();
    if (!next || next === d.name) { setEditingName(false); return; }
    setSavingName(true);
    updateStaff(d.id, { name: next });
    setSavingName(false);
    setEditingName(false);
    // Reflect immediately, then re-sync from the server.
    setDetail((prev) => (prev ? { ...prev, member: { ...prev.member, name: next } } : prev));
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
              {editingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    className="h-8"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                  />
                  <Button size="sm" onClick={saveName} loading={savingName}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="truncate text-[15px] font-bold leading-tight">
                    {d.name}
                    {isSelf && <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">(you)</span>}
                  </p>
                  {canManage && (
                    <button
                      onClick={() => { setNameDraft(d.name); setEditingName(true); }}
                      title="Edit name"
                      className="text-[#4361EE] hover:underline"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
              <p className="mt-1 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
                <Mail className="h-3.5 w-3.5 shrink-0" /> {d.email || "—"}
              </p>
              {d.phone && (
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" /> {d.phone}
                </p>
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

          {/* ── Assigned stores ── */}
          <Section icon={Store} title={`Assigned Store${stores.length === 1 ? "" : "s"}`}>
            {stores.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">No store assigned.</p>
            ) : (
              <div className="space-y-2">
                {stores.map((s) => {
                  const sRole = s.roleId ? roles.find((r) => r.id === s.roleId) : null;
                  return (
                    <div key={s.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[10px] font-bold text-[#4361EE]">
                        {(s.code || s.name).slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold leading-tight">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {sRole ? `${sRole.label} · this store` : "Uses primary role"}
                        </p>
                      </div>
                      {s.isHome && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-semibold text-[#4361EE]">
                          <Home className="h-3 w-3" /> Home
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

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
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onResetPassword(d)}>
                  <KeyRound className="h-3.5 w-3.5" /> Reset password
                </Button>
                {d.loginEnabled ? (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onToggleLogin(d.id, false)} disabled={isSelf}>
                    <Ban className="h-3.5 w-3.5" /> Disable login
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onResetPassword(d)}>
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
  icon: Icon, title, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-foreground">{title}</h3>
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
