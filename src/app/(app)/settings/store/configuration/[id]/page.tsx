"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Store, Building2, MapPin, Phone, Mail, Power, Pencil, Users,
  ShieldCheck, KeyRound, Clock, Ticket, FileText, Footprints, Truck, BookUser,
  Package, IndianRupee, UserCog, CircleUser, Hash, CheckCircle2, AlertTriangle,
  Trash2, Home, Loader2, Crown, ArrowRight, BarChart3,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Select } from "@/components/ui/input";
import { PinnedRail } from "@/components/common/pinned-rail";
import { RequireCapability } from "@/components/common/require-capability";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CAP } from "@/lib/capabilities";
import { usePermissions } from "@/lib/permissions-context";
import { allow } from "@/lib/capabilities";
import { UserDetailsDrawer } from "@/components/settings/user-details-drawer";
import { ChangeRoleDrawer } from "@/components/settings/change-role-drawer";
import { ResetPasswordDrawer } from "@/components/settings/reset-password-drawer";
import { ArchiveStoreDialog } from "@/components/settings/archive-store-dialog";
import type { TeamMember } from "@/lib/mock-data";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

/* ── Types mirroring GET /api/owner/stores/[id] ── */
interface StoreMember {
  id: string; name: string; email: string; phone: string | null;
  roleId: string; perStoreRoleId: string | null; status: string;
  loginEnabled: boolean; lastLogin: string | null; isHome: boolean;
  accessOrigin: "manager" | "owner" | "inherited"; accessOriginBy: string | null;
  credential: { hasLogin: boolean; passwordSet: boolean; lastPasswordChangedAt: string | null; passwordResetRequired: boolean };
}
interface StoreDetail {
  store: {
    id: string; name: string; code: string | null; address: string | null;
    isActive: boolean; environment: "demo" | "live"; createdAt: string | null;
    updatedAt: string | null; managerStaffId: string | null;
  };
  manager: { id: string; name: string; email: string } | null;
  members: StoreMember[];
  summary: { total: number; active: number; pending: number };
  data: Record<string, number> | null;
  prefixes: Record<string, string | null>;
}

function fmtDay(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ViewStorePage() {
  return (
    <RequireCapability
      anyOf={CAP.store.listView}
      title="Store administration is restricted"
      description="Your role can't view store administration. Ask an owner to grant it in Settings → Roles & Permissions."
    >
      <ViewStoreInner />
    </RequireCapability>
  );
}

function ViewStoreInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const storeId = params?.id;
  const { apiFetch, can, allRoles, setMemberRole, resetPassword, toggleLogin, setStaffStatus } = usePermissions();

  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<StoreDetail | null>(null);

  // Drawers / dialogs.
  const [viewingMember, setViewingMember] = useState<TeamMember | null>(null);
  const [changingRole, setChangingRole] = useState<TeamMember | null>(null);
  const [resetting, setResetting] = useState<TeamMember | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [changingMgr, setChangingMgr] = useState(false);

  const canEdit = allow(can, CAP.store.edit);
  const canDeactivate = allow(can, CAP.store.deactivate);
  const canManageCreds = allow(can, CAP.store.manageCredentials);
  const canAssignUsers = allow(can, CAP.store.assignUsers);
  const canReports = allow(can, CAP.store.reportsView);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const res = await apiFetch(`/api/owner/stores/${storeId}`);
    if (res.ok && res.json?.ok) setDetail(res.json as StoreDetail);
    setLoading(false);
  }, [storeId, apiFetch]);

  useEffect(() => { load(); }, [load]);

  const roleLabel = useCallback(
    (id: string | null) => (id ? (allRoles.find((r) => r.id === id)?.label ?? id) : "—"),
    [allRoles]
  );

  // A StoreMember → TeamMember-ish shape for the shared drawers.
  const asTeamMember = useCallback((m: StoreMember): TeamMember => ({
    id: m.id, name: m.name, email: m.email, phone: m.phone ?? undefined,
    roleId: m.roleId, branch: detail?.store.name ?? "", branchId: detail?.store.id ?? null,
    status: m.status as TeamMember["status"], loginEnabled: m.loginEnabled,
    lastLogin: m.lastLogin ?? undefined,
    lastPasswordChangedAt: m.credential.lastPasswordChangedAt ?? undefined,
    passwordResetRequired: m.credential.passwordResetRequired,
  }), [detail?.store.name, detail?.store.id]);

  async function toggleStoreActive() {
    if (!detail) return;
    const res = await apiFetch(`/api/owner/stores/${detail.store.id}`, {
      method: "PATCH", body: JSON.stringify({ isActive: !detail.store.isActive }),
    });
    if (!res.ok || !res.json?.ok) { toast.error("Could not update store"); return; }
    toast.success(`${detail.store.name} ${detail.store.isActive ? "deactivated" : "activated"}`);
    load();
  }

  async function saveManager(staffId: string | null) {
    if (!detail) return;
    const res = await apiFetch(`/api/owner/stores/${detail.store.id}`, {
      method: "PATCH", body: JSON.stringify({ managerStaffId: staffId }),
    });
    if (!res.ok || !res.json?.ok) { toast.error(res.json?.error ?? "Could not update manager"); return; }
    toast.success("Store manager updated");
    setChangingMgr(false);
    load();
  }

  if (loading && !detail) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="md" className="gap-1.5 rounded-full" onClick={() => router.push("/settings/store/configuration")}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
          Store not found or you don&apos;t have access to it.
        </div>
      </div>
    );
  }

  const s = detail.store;
  const data = detail.data ?? {};

  const summaryCards: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }[] = [
    { label: "People", value: detail.summary.total, icon: Users },
    { label: "Active", value: detail.summary.active, icon: CheckCircle2 },
    { label: "Pending", value: detail.summary.pending, icon: AlertTriangle },
    { label: "Tickets", value: data.tickets ?? 0, icon: Ticket },
    { label: "Invoices", value: data.invoices ?? 0, icon: FileText },
    { label: "Walk-Ins", value: data.walkins ?? 0, icon: Footprints },
  ];

  const dataRows: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }[] = [
    { label: "Tickets", value: data.tickets ?? 0, icon: Ticket },
    { label: "Invoices", value: data.invoices ?? 0, icon: FileText },
    { label: "Walk-Ins", value: data.walkins ?? 0, icon: Footprints },
    { label: "Field Jobs", value: data.field ?? 0, icon: Truck },
    { label: "Customers", value: data.customers ?? 0, icon: BookUser },
    { label: "Inventory", value: data.inventory ?? 0, icon: Package },
    { label: "Payments", value: data.payments ?? 0, icon: IndianRupee },
  ];

  const eligibleManagers = detail.members;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <PageHeader
        eyebrow="Settings / Store / Store Configuration"
        title={s.name}
        subtitle="Store administration — identity, access, credentials and data."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="md" className="gap-1.5 rounded-full" onClick={() => router.push("/settings/store/configuration")}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {canDeactivate && (
              <Button variant="outline" size="md" className="gap-1.5 rounded-full" onClick={toggleStoreActive}>
                <Power className="h-4 w-4" /> {s.isActive ? "Deactivate" : "Activate"}
              </Button>
            )}
          </div>
        }
      />

      {/* Identity strip */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[13px] font-bold text-[#4361EE]">
          {(s.code || s.name).slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[16px] font-bold leading-tight">{s.name}</p>
            {s.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge tone="warning" dot>Inactive</Badge>}
            {s.environment === "demo" && <Badge tone="warning">Demo</Badge>}
            {s.code && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{s.code}</span>}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <UserCog className="h-3.5 w-3.5" />
            {detail.manager ? <>Manager: <span className="font-medium text-foreground">{detail.manager.name}</span></> : <span>No manager assigned</span>}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map((c) => (
          <div key={c.label} className="rounded-xl border border-border/70 bg-card/80 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <c.icon className="h-3.5 w-3.5" /> {c.label}
            </div>
            <p className="mt-1 text-[18px] font-bold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Store Information */}
          <DetailSection icon={Building2} title="Store Information" action={
            canEdit ? <SectionLink onClick={() => router.push("/settings/store/configuration")}>Edit</SectionLink> : undefined
          }>
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Store Name" value={s.name} />
              <DetailField label="Store Code" value={s.code ?? "—"} />
              <DetailField label="Status" value={s.isActive ? "Active" : "Inactive"} />
              <DetailField label="Environment" value={s.environment === "demo" ? "Demo" : "Live"} />
              <DetailField label="Address" value={s.address ?? "—"} />
              <DetailField label="Created" value={fmtDay(s.createdAt)} />
              <DetailField label="Last Updated" value={fmtDay(s.updatedAt)} />
            </div>
          </DetailSection>

          {/* Manager / Access */}
          <DetailSection icon={Crown} title="Manager & Access" action={
            canEdit ? <SectionLink onClick={() => setChangingMgr((v) => !v)}>{changingMgr ? "Close" : "Change Manager"}</SectionLink> : undefined
          }>
            {detail.manager ? (
              <div className="flex items-center gap-2.5">
                <Avatar name={detail.manager.name} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold">{detail.manager.name}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{detail.manager.email}</p>
                </div>
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-semibold text-[#4361EE]">
                  <Crown className="h-3 w-3" /> Primary Manager
                </span>
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">No primary manager assigned.</p>
            )}
            {changingMgr && (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Set primary manager</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={s.managerStaffId ?? ""}
                    onChange={(e) => saveManager(e.target.value || null)}
                    options={[{ label: "— No manager —", value: "" }, ...eligibleManagers.map((m) => ({ label: `${m.name} · ${roleLabel(m.roleId)}`, value: m.id }))]}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  The manager pointer marks who runs this store. Their actual permissions still come from their role.
                </p>
              </div>
            )}
          </DetailSection>

          {/* Store Data Summary */}
          <DetailSection icon={BarChart3} title="Store Data" action={
            canReports ? <SectionLink onClick={() => router.push("/reports")}>View Reports</SectionLink> : undefined
          }>
            <p className="mb-3 text-[12px] text-muted-foreground">
              This is <span className="font-medium text-foreground">{s.name}</span>&apos;s own operational data — not combined organization data.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {dataRows.map((d) => (
                <div key={d.label} className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <d.icon className="h-3.5 w-3.5" /> {d.label}
                  </div>
                  <p className="mt-1 text-[17px] font-bold tabular-nums">{d.value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </DetailSection>

          {/* Numbering prefixes */}
          <DetailSection icon={Hash} title="Document Prefixes">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Ticket Prefix" value={detail.prefixes.ticket ?? "—"} />
              <DetailField label="Invoice Prefix" value={detail.prefixes.invoice ?? "—"} />
              <DetailField label="Walk-In Prefix" value={detail.prefixes.walkin ?? "—"} />
              <DetailField label="Field Prefix" value={detail.prefixes.field ?? "—"} />
            </div>
          </DetailSection>
        </div>

        {/* Right rail */}
        <PinnedRail>
          {/* Quick Actions */}
          <RailCard title="Quick Actions">
            <div className="space-y-2">
              {canDeactivate && (
                <RailAction icon={Power} title={s.isActive ? "Deactivate store" : "Activate store"} subtitle={s.isActive ? "Stop normal operation, keep data" : "Reopen this store"} onClick={toggleStoreActive} />
              )}
              {canReports && (
                <RailAction icon={BarChart3} title="View store reports" subtitle="Open reporting for this store" onClick={() => router.push("/reports")} />
              )}
              {canDeactivate && (
                <RailAction icon={Trash2} title="Archive / delete store" subtitle="Safe, confirmed removal" danger onClick={() => setArchiving(true)} />
              )}
            </div>
          </RailCard>

          {/* People With Access */}
          <RailCard title={`People With Access (${detail.members.length})`}>
            {detail.members.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">No users assigned to this store yet.</p>
            ) : (
              <div className="space-y-1.5">
                {detail.members.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setViewingMember(asTeamMember(m))}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 text-left transition hover:bg-muted/40"
                  >
                    <Avatar name={m.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold leading-tight">{m.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{roleLabel(m.perStoreRoleId ?? m.roleId)}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <Badge tone={m.status === "active" ? "success" : m.status === "suspended" ? "danger" : "warning"} dot={m.status === "active"}>
                          {m.status === "active" ? "Active" : m.status === "suspended" ? "Suspended" : "Invited"}
                        </Badge>
                        {!m.loginEnabled && <Badge tone="neutral">No login</Badge>}
                        {m.isHome && <span className="inline-flex items-center gap-0.5 text-[9.5px] font-semibold text-[#4361EE]"><Home className="h-2.5 w-2.5" /> Home</span>}
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/80">{accessOriginLabel(m)}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </RailCard>
        </PinnedRail>
      </div>

      {/* ── Drawers & dialogs ── */}
      <UserDetailsDrawer
        open={!!viewingMember}
        member={viewingMember}
        roles={allRoles}
        onClose={() => setViewingMember(null)}
        onChangeRole={(m) => { setViewingMember(null); setChangingRole(m); }}
        onResetPassword={(m) => { setViewingMember(null); setResetting(m); }}
        onToggleLogin={(id, enabled) => { toggleLogin(id, enabled); setTimeout(load, 400); }}
        onSuspend={(m) => { setStaffStatus(m.id, "suspended"); setViewingMember(null); setTimeout(load, 400); }}
        onActivate={(id) => { setStaffStatus(id, "active"); setTimeout(load, 400); }}
      />

      <ChangeRoleDrawer
        open={!!changingRole}
        onClose={() => setChangingRole(null)}
        memberName={changingRole?.name ?? ""}
        currentRoleId={changingRole?.roleId ?? allRoles[0].id}
        roles={allRoles}
        onConfirm={(roleId) => { if (changingRole) { setMemberRole(changingRole.email, roleId); } setChangingRole(null); setTimeout(load, 400); }}
      />

      <ResetPasswordDrawer
        open={!!resetting}
        onClose={() => setResetting(null)}
        memberName={resetting?.name ?? ""}
        onConfirm={(password, opts) => { if (resetting) resetPassword(resetting.id, password, opts); setResetting(null); setTimeout(load, 400); }}
      />

      <ArchiveStoreDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        storeName={s.name}
        storeId={s.id}
        canHardDelete={allow(can, CAP.store.delete)}
        onDone={(mode) => { setArchiving(false); if (mode === "deleted") router.push("/settings/store/configuration"); else load(); }}
      />
    </div>
  );
}

function accessOriginLabel(m: StoreMember): string {
  if (m.accessOrigin === "manager") return `Assigned by ${m.accessOriginBy ?? "Store Manager"}`;
  if (m.accessOrigin === "owner") return "Directly assigned";
  return "Home store member";
}

/* ── Shared detail sub-components (per view-detail-pages steering) ── */
function DetailSection({
  icon: Icon, title, action, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-2.5 border-b border-border/70 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function SectionLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline">
      <Pencil className="h-3 w-3" /> {children}
    </button>
  );
}
function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
function RailAction({
  icon: Icon, title, subtitle, onClick, danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; subtitle: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:bg-muted/40",
        danger && "hover:border-rose-200 hover:bg-rose-50"
      )}
    >
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]", danger && "bg-rose-50 text-rose-600")}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[13px] font-semibold leading-tight", danger && "text-rose-600")}>{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}
