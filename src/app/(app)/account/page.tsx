"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — My Account (global personal account workspace)

   Reachable from the top-right profile menu by EVERY authenticated user, even
   those without any Settings permission. It manages ONLY the signed-in user's
   own account — Profile & Personal Information, Active Sessions, and (when
   authorized) Billing / Subscription. It reuses the exact same section
   components and backend routes as the legacy Settings → Account pages, so
   there is a single implementation of each with no duplicate profile store.

   UNIFORMITY: this page is built from the SHARED view-page primitives
   (`common/detail-page` — DetailHero + DetailSection + the semantic ACCENT
   palette), the SAME ones View Ticket / View Invoice / View Lead use, so it
   looks like one product and the theme colours come for free. See the
   `my-account` + `view-detail-pages` steering standards.
   ────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { User, ShieldCheck, CreditCard } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { DetailHero } from "@/components/common/detail-page";
import { usePermissions } from "@/lib/permissions-context";
import { allow } from "@/lib/capabilities";
import { CAP } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import { AccountProfileSection } from "@/components/account/account-profile-section";
import { AccountSessionsSection } from "@/components/account/account-sessions-section";
import { AccountBillingSection } from "@/components/account/account-billing-section";

type TabId = "profile" | "sessions" | "billing";

export default function MyAccountPage() {
  const { currentUser, getRoleById, can } = usePermissions();
  const searchParams = useSearchParams();
  const canBilling = allow(can, CAP.account.billing);

  // Default tab, honouring an optional ?tab= deep link (used by the legacy
  // Settings → Account redirects so Active Sessions / Billing land in place).
  const requested = (searchParams.get("tab") as TabId | null) ?? "profile";
  const initialTab: TabId =
    requested === "sessions" ? "sessions"
    : requested === "billing" && canBilling ? "billing"
    : "profile";
  const [tab, setTab] = useState<TabId>(initialTab);

  const roleLabel = currentUser ? getRoleById(currentUser.roleId)?.label ?? currentUser.roleId : "";
  const displayName = currentUser?.name ?? "Your account";
  const displayEmail = currentUser?.email ?? "";

  const tabs: { id: TabId; label: string; icon: typeof User }[] = [
    { id: "profile", label: "Profile", icon: User },
    { id: "sessions", label: "Active Sessions", icon: ShieldCheck },
    ...(canBilling ? [{ id: "billing" as const, label: "Billing", icon: CreditCard }] : []),
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      {/* ── Hero: breadcrumb + identity + inline tab bar (shared DetailHero) ── */}
      <DetailHero>
        <nav className="text-[11px] font-medium text-[#4361EE]/70" aria-label="Breadcrumb">
          <span>Account</span>
          <span className="px-1.5 text-[#4361EE]/30">/</span>
          <span className="text-[#4361EE]">My Account</span>
        </nav>

        <div className="mt-3 flex items-center gap-4">
          <div className="relative shrink-0">
            <span className="absolute inset-0 rounded-full bg-[#4361EE]/20 blur-md" aria-hidden />
            <span className="relative inline-flex rounded-full ring-2 ring-white">
              <Avatar name={displayName} src={currentUser?.avatarUrl} size={60} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-xl font-bold tracking-tight text-zinc-900">{displayName}</h1>
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
              {displayEmail}
              {roleLabel && <span className="text-zinc-400"> · {roleLabel}</span>}
            </p>
          </div>
        </div>

        {/* Inline tab bar — segmented pills over the hero wash (brand blue) */}
        <div className="mt-5 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all active:scale-95",
                  active
                    ? "bg-[#4361EE] text-white shadow-[0_6px_16px_-6px_rgba(67,97,238,0.6)]"
                    : "bg-white/70 text-muted-foreground ring-1 ring-inset ring-[#4361EE]/15 hover:bg-white hover:text-[#4361EE]"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>
      </DetailHero>

      {/* ── Active section (shared DetailSection primitives) ── */}
      {tab === "profile" && <AccountProfileSection />}
      {tab === "sessions" && <AccountSessionsSection />}
      {tab === "billing" && canBilling && <AccountBillingSection />}
    </div>
  );
}
