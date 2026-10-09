"use client";

/* Active Sessions has moved to the global My Account page (/account → Active
   Sessions), reachable from the top-right profile menu. This legacy route
   redirects there for backward compatibility. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyAccountSessionsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/account?tab=sessions"); }, [router]);
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
      Taking you to My Account…
    </div>
  );
}
