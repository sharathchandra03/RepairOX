"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, ShieldCheck, Building2, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { WORKSPACE_MAP } from "@/lib/permissions";
import { usePermissions } from "@/lib/permissions-context";

export default function AddUserPage() {
  const router = useRouter();
  const { allRoles } = usePermissions();
  const [roleId, setRoleId] = useState(allRoles[4]?.id ?? allRoles[0].id); // Reception, a sensible default invite
  const role = allRoles.find((r) => r.id === roleId)!;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push("/settings/users");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings / Users"
        title="Invite a team member"
        subtitle="They'll receive a login. You choose their role — they never choose it themselves."
        actions={
          <Button variant="outline" size="md" className="gap-1.5 rounded-full" onClick={() => router.push("/settings/users")}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" required placeholder="e.g. Priya Menon" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required placeholder="name@company.com" iconLeft={<Mail className="h-4 w-4" />} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <Select
                id="role"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                options={allRoles.map((r) => ({ label: r.label, value: r.id }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch">Branch</Label>
              <Select
                id="branch"
                defaultValue="btm"
                options={[
                  { label: "BTM Layout (HQ)", value: "btm" },
                  { label: "Koramangala", value: "kor" },
                  { label: "HSR Layout", value: "hsr" },
                  { label: "Warehouse A", value: "wha" },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" size="lg" className="gap-1.5 rounded-full">
              <Send className="h-4 w-4" /> Send invite
            </Button>
            <Button type="button" variant="outline" size="lg" className="rounded-full" onClick={() => router.push("/settings/users")}>
              Cancel
            </Button>
          </div>
        </form>

        {/* Live role preview */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg brand-gradient text-white shadow-glow">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-bold leading-tight">{role.label}</p>
                <p className="text-[11px] text-muted-foreground">Preview of what this role will see</p>
              </div>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-600">{role.summary}</p>

            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace access</p>
            <div className="flex flex-wrap gap-1.5">
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

          <div className="flex items-start gap-2.5 rounded-2xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-4">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
            <p className="text-[12px] leading-relaxed text-[#3347D6]">
              Fine-tune exact capabilities any time from Settings → Permissions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
