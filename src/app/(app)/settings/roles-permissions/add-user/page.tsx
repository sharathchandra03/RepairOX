"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Mail, Phone, ShieldCheck, Building2, UserPlus, Check,
  Lock, Eye, EyeOff, KeyRound, Wallet, AlertCircle, MapPin,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, NumericInput } from "@/components/ui/input";
import { WORKSPACE_MAP } from "@/lib/permissions";
import { usePermissions } from "@/lib/permissions-context";
import {
  BRANCHES, SALARY_TYPES, validatePassword, PASSWORD_MIN_LENGTH,
} from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function AddStaffPage() {
  const router = useRouter();
  const { allRoles, addStaff, landingForRole } = usePermissions();

  // Reception is a sensible default for a first hire.
  const defaultRole = allRoles.find((r) => r.id === "reception")?.id ?? allRoles[0].id;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [hasLogin, setHasLogin] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [roleId, setRoleId] = useState(defaultRole);
  const [branch, setBranch] = useState<string>(BRANCHES[0]);
  const [salaryType, setSalaryType] = useState<string>("monthly");
  const [salaryAmount, setSalaryAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const role = allRoles.find((r) => r.id === roleId) ?? allRoles[0];
  const landingLabel = useMemo(() => {
    const dest = landingForRole(roleId);
    if (dest === "/workspaces") return "Module selection screen (has all modules)";
    const w = Object.values(WORKSPACE_MAP).find((x) => x.homeHref === dest);
    return w ? `Straight to ${w.label}` : "Their permitted dashboard";
  }, [roleId, landingForRole]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please enter the staff member's full name.");
      return;
    }
    if (hasLogin) {
      if (!email.trim()) {
        setError("Email is required to create a login account.");
        return;
      }
      const pw = validatePassword(password, confirm);
      if (!pw.ok) {
        setError(pw.message!);
        return;
      }
    }

    setLoading(true);
    const result = await addStaff({
      name,
      phone,
      email,
      hasLogin,
      password: hasLogin ? password : undefined,
      roleId,
      branch,
      salaryType: salaryType as any,
      salaryAmount,
    });

    if (!result.ok) {
      setLoading(false);
      if (result.reason === "duplicate_email") setError("A staff member with this email already exists.");
      else if (result.reason === "missing_password") setError("A password is required for login access.");
      else if (result.reason === "missing_email") setError("Email is required to create a login account.");
      else setError("Something went wrong creating the staff member. Please try again.");
      return;
    }

    router.push("/settings/roles-permissions?created=1");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration / Roles & Permissions"
        title="Add staff member"
        subtitle="Create the employee's profile and their RepairOX login in one step. You choose their role — they never choose it themselves."
        actions={
          <Button variant="outline" size="md" className="gap-1.5 rounded-full" onClick={() => router.push("/settings/roles-permissions")}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-card sm:p-7">
          {/* ── Profile ── */}
          <section className="space-y-4">
            <SectionTitle icon={UserPlus} title="Profile" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Menon" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" iconLeft={<Phone className="h-4 w-4" />} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address {hasLogin && <span className="text-rose-500">*</span>}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" iconLeft={<Mail className="h-4 w-4" />} />
              {hasLogin && <p className="text-[11px] text-muted-foreground">This email becomes their login username.</p>}
            </div>
          </section>

          {/* ── Login credentials ── */}
          <section className="space-y-4">
            <SectionTitle icon={KeyRound} title="Login access" />
            <div className="space-y-1.5">
              <Label>Staff member need login credentials?</Label>
              <div className="ml-[3px] inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1">
                {[
                  { v: true, label: "Yes" },
                  { v: false, label: "No" },
                ].map((opt) => (
                  <button
                    key={String(opt.v)}
                    type="button"
                    onClick={() => setHasLogin(opt.v)}
                    className={cn(
                      "rounded-full px-3.5 py-1 text-xs font-semibold transition-colors",
                      hasLogin === opt.v ? "bg-[#4361EE] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {hasLogin
                  ? "A real login account will be created. They can sign in with the email and password below."
                  : "Only a staff profile is created — no login account, no dashboard access."}
              </p>
            </div>

            {hasLogin && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Login password</Label>
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                    iconLeft={<Lock className="h-4 w-4" />}
                    iconRight={
                      <button type="button" onClick={() => setShowPw(!showPw)} aria-label="Toggle password" className="text-muted-foreground hover:text-foreground">
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type={showPw ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    iconLeft={<Lock className="h-4 w-4" />}
                  />
                </div>
              </div>
            )}
          </section>

          {/* ── Role & branch ── */}
          <section className="space-y-4">
            <SectionTitle icon={ShieldCheck} title="Role & branch" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="role">Assign role</Label>
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
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  options={BRANCHES.map((b) => ({ label: b, value: b }))}
                />
              </div>
            </div>
          </section>

          {/* ── Salary ── */}
          <section className="space-y-4">
            <SectionTitle icon={Wallet} title="Salary" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="salary-type">Salary type</Label>
                <Select
                  id="salary-type"
                  value={salaryType}
                  onChange={(e) => setSalaryType(e.target.value)}
                  options={SALARY_TYPES.map((s) => ({ label: s.label, value: s.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salary-amount">
                  {salaryType === "monthly" ? "Monthly salary amount" : "Salary amount"} (₹)
                </Label>
                <NumericInput id="salary-amount" value={salaryAmount} onChange={setSalaryAmount} min={0} placeholder="0" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Saved to the staff profile and made available to Payroll &amp; Accounts.
            </p>
          </section>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" size="lg" loading={loading} className="gap-1.5 rounded-full">
              <Check className="h-4 w-4" /> Create staff member
            </Button>
            <Button type="button" variant="outline" size="lg" className="rounded-full" onClick={() => router.push("/settings/roles-permissions")}>
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
                <p className="text-[11px] text-muted-foreground">What this role can access</p>
              </div>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-zinc-600">{role.summary}</p>

            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Module access</p>
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

            <div className="mt-4 flex items-start gap-2 rounded-xl bg-muted/50 px-3 py-2.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4361EE]" />
              <p className="text-[11.5px] leading-relaxed text-zinc-600">
                After login: <span className="font-semibold text-zinc-800">{landingLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 rounded-2xl border border-dashed border-[#B3BFF6] bg-[#EEF1FD] p-4">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4361EE]" />
            <p className="text-[12px] leading-relaxed text-[#3347D6]">
              Fine-tune exactly what this role can do any time from the Permission Matrix tab — every login picks up the change on refresh.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
    </div>
  );
}
