"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Search, Plus, Phone, Mail, Building2, ChevronDown, ChevronUp, ShieldCheck, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Can } from "@/components/common/can";
import { usePermissions } from "@/lib/permissions-context";
import { SALARY_TYPE_LABEL } from "@/lib/auth";
import type { TeamMember, StaffStatus } from "@/lib/mock-data";
import { cn, formatINR } from "@/lib/utils";

/* ─── Status tone ────────────────────────────────────────────────────── */

const STATUS_TONE: Record<StaffStatus, string> = {
  active: "bg-success/10 text-emerald-700 ring-success/30",
  invited: "bg-warning/10 text-amber-700 ring-warning/30",
  suspended: "bg-rose-50 text-rose-700 ring-rose-200",
};
const STATUS_LABEL: Record<StaffStatus, string> = {
  active: "Active",
  invited: "Invited",
  suspended: "Suspended",
};

/* ─── Page ────────────────────────────────────────────────────────────── */

export default function EmployeeDirectoryPage() {
  // Single source of truth — the same staff directory the login/roles system
  // uses. Adding staff here or in Roles & Permissions reflects everywhere.
  const { team, getRoleById } = usePermissions();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const deptOf = (e: TeamMember) => e.department || getRoleById(e.roleId)?.label || "General";
  const departments = Array.from(new Set(team.map(deptOf)));

  let filtered = team;
  if (query.trim().length >= 2) {
    const q = query.toLowerCase();
    filtered = filtered.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        (e.phone ?? "").includes(q) ||
        e.id.toLowerCase().includes(q)
    );
  }
  if (deptFilter !== "all") {
    filtered = filtered.filter((e) => deptOf(e) === deptFilter);
  }

  const activeCount = team.filter((e) => e.status === "active").length;
  const withLogin = team.filter((e) => e.loginEnabled).length;
  const totalSalary = team.reduce((s, e) => s + (e.salaryAmount ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Employees"
        title="Employee Directory"
        subtitle="Every staff member — profile, role, branch, login access and salary, all in one place."
        actions={
          <Can permission={["manage_users", "assign_technicians"]}>
            <Link href="/roles-permissions/add-user">
              <Button size="md"><Plus className="h-4 w-4" /> Add staff</Button>
            </Link>
          </Can>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Staff" value={String(team.length)} />
        <StatCard label="Active" value={String(activeCount)} />
        <StatCard label="With Login" value={String(withLogin)} />
        <StatCard label="Monthly Payroll" value={formatINR(totalSalary)} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Input
            value={query}
            onChange={(e: any) => setQuery(e.target.value)}
            placeholder="Search by name, email, phone or ID…"
            iconLeft={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setDeptFilter("all")}
            className={cn(
              "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all",
              deptFilter === "all" ? "bg-[#4361EE] text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-slate-200"
            )}
          >
            All ({team.length})
          </button>
          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => setDeptFilter(dept)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all",
                deptFilter === dept ? "bg-[#4361EE] text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-slate-200"
              )}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* Employee List */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-[1fr_140px_140px_110px_100px] gap-2 px-5 py-2.5 border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Employee</div>
          <div>Role</div>
          <div>Branch</div>
          <div>Status</div>
          <div className="text-right">Salary</div>
        </div>

        <div className="divide-y divide-border">
          {filtered.length > 0 ? filtered.map((emp) => {
            const roleLabel = getRoleById(emp.roleId)?.label ?? emp.roleId;
            return (
            <div key={emp.id}>
              <div
                className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition cursor-pointer"
                onClick={() => setExpandedId(expandedId === emp.id ? null : emp.id)}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EEF1FD] text-xs font-bold text-[#4361EE]">
                  {emp.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
                <div className="flex-1 min-w-0 sm:grid sm:grid-cols-[1fr_140px_140px_110px_100px] sm:gap-2 sm:items-center">
                  <div>
                    <p className="text-sm font-medium truncate">{emp.name}</p>
                    <p className="text-[10px] text-muted-foreground">{emp.id} · {emp.designation || roleLabel}</p>
                  </div>
                  <div className="hidden sm:block text-[12px] truncate">{roleLabel}</div>
                  <div className="hidden sm:block text-[12px] truncate">{emp.branch}</div>
                  <div className="hidden sm:flex sm:items-center sm:gap-1.5">
                    <Badge className={cn("text-[10px]", STATUS_TONE[emp.status])}>
                      {STATUS_LABEL[emp.status]}
                    </Badge>
                  </div>
                  <div className="hidden sm:block text-right text-[12px] font-medium tabular-nums">{formatINR(emp.salaryAmount ?? 0)}</div>
                </div>
                {expandedId === emp.id ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
              </div>

              {expandedId === emp.id && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t border-border bg-muted/20 px-5 py-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</p>
                      <div className="space-y-1.5 text-[13px]">
                        <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {emp.phone || "—"}</div>
                        <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {emp.email}</div>
                        <div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {emp.branch}</div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Access</p>
                      <div className="space-y-1.5 text-[13px]">
                        <p className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" /> {roleLabel}</p>
                        <p className="flex items-center gap-2">
                          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                          {emp.loginEnabled ? "Login enabled" : "No login access"}
                        </p>
                        {emp.joiningDate && (
                          <p><span className="text-muted-foreground">Joined:</span> {new Date(emp.joiningDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Salary</p>
                      <p className="text-lg font-bold tabular-nums">{formatINR(emp.salaryAmount ?? 0)}
                        <span className="text-[11px] font-normal text-muted-foreground"> · {SALARY_TYPE_LABEL[emp.salaryType ?? "monthly"]}</span>
                      </p>
                      <Can permission="manage_users">
                        <Link href="/roles-permissions">
                          <Button size="sm" variant="outline"><ShieldCheck className="h-3.5 w-3.5" /> Manage access</Button>
                        </Link>
                      </Can>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
            );
          }) : (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {query ? `No staff match "${query}"` : "No staff found."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
