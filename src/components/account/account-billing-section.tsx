"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Billing / Subscription (permission-controlled)

   Unlike Profile and Active Sessions (which every authenticated user manages
   for their OWN account), Billing exposes ORGANIZATION-level subscription
   information. It is therefore gated on `CAP.account.billing`
   (`manage_subscription`, coarse `manage_settings` fallback). A user without
   that capability does NOT see this section at all — the My Account page omits
   it. This component assumes the caller has already checked the capability.

   Uses the shared DetailSection primitive (emerald/commercial accent) for
   uniformity with every other view page. No billing backend exists yet, so it
   shows a clear authorized placeholder (never fabricated plan/payment data).
   ────────────────────────────────────────────────────────────────────────── */

import { CreditCard, ShieldCheck, Receipt, Wallet } from "lucide-react";
import { DetailSection } from "@/components/common/detail-page";

export function AccountBillingSection() {
  return (
    <DetailSection
      icon={CreditCard}
      title="Billing & Subscription"
      accent="emerald"
      action={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" /> Billing access
        </span>
      }
    >
      <p className="-mt-1 mb-4 text-[12px] text-muted-foreground">
        Your organization&apos;s plan, payment methods and billing history.
      </p>

      {/* Three preview tiles — use the width without inventing data */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Wallet, title: "Current Plan", body: "Your active subscription plan will appear here." },
          { icon: CreditCard, title: "Payment Method", body: "Saved cards and payment details will appear here." },
          { icon: Receipt, title: "Billing History", body: "Past invoices and receipts will appear here." },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.title} className="rounded-xl border border-border bg-muted/20 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-[13px] font-semibold text-foreground">{t.title}</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{t.body}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-emerald-300/60 bg-emerald-50/40 px-5 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-emerald-600 shadow-sm">
          <CreditCard className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[13px] font-semibold text-foreground">Subscription management is coming soon</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Billing is an organization-level setting controlled by authorized administrators.
          </p>
        </div>
      </div>
    </DetailSection>
  );
}
