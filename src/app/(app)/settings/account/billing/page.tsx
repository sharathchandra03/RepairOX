"use client";

/* Billing has moved to the global My Account page (/account → Billing),
   reachable from the top-right profile menu (visible only to users with
   billing access). This legacy route redirects there for backward
   compatibility. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyAccountBillingRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/account?tab=billing"); }, [router]);
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
      Taking you to My Account…
    </div>
  );
}
