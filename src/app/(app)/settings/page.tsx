"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Building2, User, Shield, CreditCard, Plug, Bell, Users, ShieldCheck,
  MapPin, LayoutGrid, ChevronRight, Sliders,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { CURRENT_USER, type PermissionKey } from "@/lib/permissions";
import { usePermissions } from "@/lib/permissions-context";

const SECTIONS = [
  { id: "shop",        icon: Building2,   label: "Shop",              desc: "Business identity, GSTIN, address", href: "/settings" },
  { id: "dashboard",   icon: Sliders,     label: "Dashboard",         desc: "Card resize & layout preferences", href: "/settings/dashboard" },
  { id: "users",       icon: Users,       label: "Users",             desc: "Team members & their logins",       href: "/settings/users", permission: "manage_users" as PermissionKey },
  { id: "roles",       icon: Shield,      label: "Roles",             desc: "Responsibilities per role",         href: "/settings/roles", permission: "manage_roles" as PermissionKey },
  { id: "permissions", icon: ShieldCheck, label: "Roles & Permissions", desc: "Capability matrix per role",      href: "/settings/permissions", permission: "manage_roles" as PermissionKey },
  { id: "branches",    icon: MapPin,      label: "Branches",         desc: "Locations under this organisation",  href: "/settings/branches", permission: "manage_branches" as PermissionKey },
  { id: "workspace",   icon: LayoutGrid,  label: "Module Access",     desc: "Enable Shop / Sales / Field",       href: "/settings/module-access", permission: "manage_branches" as PermissionKey },
  { id: "billing",     icon: CreditCard,  label: "Billing",           desc: "Plan, invoices, taxes",             href: "/settings", permission: "manage_subscription" as PermissionKey },
  { id: "integ",       icon: Plug,        label: "Integrations",      desc: "Razorpay, Tally, WhatsApp",         href: "/settings", permission: "access_api" as PermissionKey },
  { id: "notif",       icon: Bell,        label: "Notifications",     desc: "Email, SMS & push channels",        href: "/settings" },
];

export default function Settings() {
  const { role, can } = usePermissions();
  const sections = SECTIONS.filter((s) => !s.permission || can(s.permission));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Configure"
        title="Settings"
        subtitle="Manage your shop, team, roles and integrations from one polished console."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* Vertical nav — sections only show up when the active role can manage them */}
        <ul className="grid gap-1">
          <AnimatePresence initial={false}>
            {sections.map((s, i) => (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ delay: 0.04 * i }}
              >
                <Link
                  href={s.href}
                  className={`group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition hover:bg-muted ${i === 0 ? "ring-1 ring-indigo-200" : ""}`}
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${i === 0 ? "brand-gradient text-white shadow-glow" : "bg-muted text-muted-foreground"}`}>
                    <s.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">{s.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{s.desc}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        {/* Profile card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={CURRENT_USER.name} size={56} />
              <div>
                <p className="text-lg font-bold">{CURRENT_USER.name}</p>
                <p className="text-sm text-muted-foreground">{CURRENT_USER.email}</p>
                <Badge tone="brand" className="mt-1.5">{role.label}</Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">Cancel</Button>
              <Button>Save changes</Button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Shop name</Label><Input defaultValue={CURRENT_USER.organization} /></div>
            <div className="space-y-1.5"><Label>GSTIN</Label><Input defaultValue="29AABCU9603R1ZP" /></div>
            <div className="space-y-1.5"><Label>Phone</Label><Input defaultValue="+91 91089 55544" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input defaultValue={CURRENT_USER.email} /></div>
            <div className="md:col-span-2 space-y-1.5"><Label>Address</Label><Input defaultValue="2nd Floor, 100ft Road, Bengaluru 560076" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
