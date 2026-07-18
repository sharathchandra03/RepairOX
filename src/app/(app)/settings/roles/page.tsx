"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ShieldCheck, Users, ChevronRight, Building2,
  Wrench, Package, TrendingUp, Wallet, Eye, Crown, Code2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { WORKSPACE_MAP, PERMISSION_GROUPS, ALL_PERMISSIONS } from "@/lib/permissions";
import { usePermissions, resolveGrantedKeys } from "@/lib/permissions-context";
import { cn } from "@/lib/utils";

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

export default function RolesPage() {
  const { grants, allRoles } = usePermissions();
  const [activeId, setActiveId] = useState(allRoles[2]?.id ?? allRoles[0].id); // Master Shop Owner by default
  const active = allRoles.find((r) => r.id === activeId) ?? allRoles[0];
  const totalPermissions = ALL_PERMISSIONS.length;
  const activeGranted = resolveGrantedKeys(grants, active.id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings / Roles"
        title="Roles & Responsibilities"
        subtitle="Every role available on RepairOX and what it's built to do."
        actions={
          <Link
            href="/settings/permissions"
            className="inline-flex items-center gap-1.5 rounded-full brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-glow transition hover:scale-[1.02] active:scale-95"
          >
            Open permission matrix <ChevronRight className="h-4 w-4" />
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        {/* Role list */}
        <ul className="grid gap-1.5">
          {allRoles.map((r, i) => {
            const Icon = ROLE_ICON[r.id] ?? Users;
            const isActive = r.id === activeId;
            return (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * i }}
              >
                <button
                  onClick={() => setActiveId(r.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition",
                    isActive
                      ? "border-[#B3BFF6] ring-1 ring-[#B3BFF6] bg-[#F5F7FF]"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                    isActive ? "brand-gradient text-white shadow-glow" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">{r.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {r.workspaces.length === 3 ? "All modules" : r.workspaces.map((w) => WORKSPACE_MAP[w].label).join(" · ")}
                    </p>
                  </div>
                  <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", isActive ? "text-[#4361EE] translate-x-0.5" : "text-zinc-300")} />
                </button>
              </motion.li>
            );
          })}
        </ul>

        {/* Detail panel */}
        <motion.div
          key={active.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7"
        >
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
            <Badge tone="brand">
              {activeGranted.size} / {totalPermissions} capabilities
            </Badge>
          </div>

          {/* Module access */}
          <div className="mt-6">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Module access</p>
            <div className="flex flex-wrap gap-2">
              {(["shop", "leads", "operations"] as const).map((wid) => {
                const w = WORKSPACE_MAP[wid];
                const has = active.workspaces.includes(wid);
                return (
                  <span
                    key={wid}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 ring-inset",
                      has ? cn(w.bg, w.color, "ring-current/20") : "bg-zinc-50 text-zinc-400 ring-zinc-200"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", has ? "bg-current" : "bg-zinc-300")} />
                    {w.label}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Permission groups */}
          <div className="mt-6 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">What they can do</p>
            {PERMISSION_GROUPS.map((g) => {
              const granted = g.permissions.filter((p) => activeGranted.has(p.key));
              if (granted.length === 0) return null;
              return (
                <div key={g.id} className="rounded-xl border border-border bg-background/60 p-4">
                  <p className="text-[12px] font-semibold">{g.label}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {granted.map((p) => (
                      <Badge key={p.key} tone="success">{p.label}</Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
