"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, Check } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { WORKSPACE_MAP, type RoleDef } from "@/lib/permissions";

/** "Change role" drawer — reassigns a team member to a different role.
 *  Mirrors the live-preview pattern already used on the Invite User page so
 *  an administrator sees exactly what they're granting before confirming. */
export function ChangeRoleDrawer({
  open,
  onClose,
  memberName,
  currentRoleId,
  roles,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  memberName: string;
  currentRoleId: string;
  roles: RoleDef[];
  onConfirm: (roleId: string) => void;
}) {
  const [roleId, setRoleId] = useState(currentRoleId);

  // Re-seed the draft selection whenever a different member's drawer opens.
  useEffect(() => {
    if (open) setRoleId(currentRoleId);
  }, [open, currentRoleId]);

  const role = roles.find((r) => r.id === roleId) ?? roles[0];
  const changed = roleId !== currentRoleId;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={ShieldCheck}
      title="Change Role"
      subtitle={memberName}
      footer={
        <Button className="w-full gap-1.5" disabled={!changed} onClick={() => onConfirm(roleId)}>
          <Check className="h-4 w-4" /> Update role
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="change-role-select">Assign role</Label>
          <Select
            id="change-role-select"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            options={roles.map((r) => ({ label: r.label, value: r.id }))}
          />
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[13px] font-semibold leading-tight">{role.label}</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{role.summary}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {role.workspaces.map((w) => {
              const wd = WORKSPACE_MAP[w];
              return (
                <span key={w} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${wd.bg} ${wd.color}`}>
                  {wd.label}
                </span>
              );
            })}
          </div>
        </div>

        <p className="rounded-xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD]/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#3347D6]">
          This takes effect immediately — the sidebar, dashboard and every action button {memberName} sees will update to match the new role's permissions.
        </p>
      </div>
    </Drawer>
  );
}
