"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Plus, Search, Mail, ShieldCheck, UserCog, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Can } from "@/components/common/can";
import { ChangeRoleDrawer } from "@/components/settings/change-role-drawer";
import { DeleteMemberDialog } from "@/components/settings/delete-member-dialog";
import { usePermissions } from "@/lib/permissions-context";
import { WORKSPACE_MAP, CURRENT_USER, type WorkspaceId } from "@/lib/permissions";
import type { TeamMember } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<TeamMember["status"], "success" | "warning" | "danger"> = {
  active: "success", invited: "warning", suspended: "danger",
};
const STATUS_LABEL: Record<TeamMember["status"], string> = {
  active: "Active", invited: "Invited", suspended: "Suspended",
};

export default function UsersPage() {
  const { allRoles, getRoleById, team, setMemberRole, deleteMember } = usePermissions();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const rows = team.filter((t) =>
    (t.name + t.email + t.roleId).toLowerCase().includes(query.toLowerCase())
  );

  function changeRole(email: string, roleId: string) {
    setMemberRole(email, roleId);
    setEditing(null);
  }

  function confirmRemove() {
    if (!removing) return;
    deleteMember(removing.email); // fails silently for CURRENT_USER — menu item is hidden for that row anyway
    setRemoving(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings / Users"
        title="Team Members"
        subtitle="Everyone with a RepairOX login, their assigned role and which branch they belong to."
        actions={
          <Can permission="manage_users">
            <Link href="/settings/users/add">
              <Button size="md" className="gap-1.5 rounded-full">
                <Plus className="h-4 w-4" /> Invite user
              </Button>
            </Link>
          </Can>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          iconLeft={<Search className="h-4 w-4" />}
          placeholder="Search by name, email or role..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 max-w-sm"
        />
        <Link href="/settings/permissions" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#4361EE] hover:underline">
          <ShieldCheck className="h-4 w-4" /> Manage roles & permissions
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3">Member</th>
                <th className="py-3">Role</th>
                <th className="py-3">Workspaces</th>
                <th className="py-3">Branch</th>
                <th className="py-3">Status</th>
                <th className="w-[110px] py-3 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const role = getRoleById(t.roleId);
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
                          <p className="truncate text-[13.5px] font-semibold leading-tight">{t.name}</p>
                          <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            <Mail className="h-3 w-3" /> {t.email}
                          </p>
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
                      <Badge tone={STATUS_TONE[t.status]} dot={t.status === "active"}>{STATUS_LABEL[t.status]}</Badge>
                    </td>
                    <td className="py-3 pr-5 text-right">
                      <Can permission="manage_users">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditing(t)}
                            title="Change role"
                            aria-label="Change role"
                            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          >
                            <UserCog className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setRemoving(t)}
                            disabled={t.email === CURRENT_USER.email}
                            title={t.email === CURRENT_USER.email ? "You can't remove your own account" : "Remove user"}
                            aria-label="Remove user"
                            className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
          <p className="text-xs text-muted-foreground">Showing {rows.length} of {team.length} team members</p>
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

      <DeleteMemberDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        member={removing}
        onConfirm={confirmRemove}
      />
    </div>
  );
}
