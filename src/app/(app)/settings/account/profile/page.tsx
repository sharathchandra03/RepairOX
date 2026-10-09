"use client";

/* Personal Account management has moved to the global My Account page (/account),
   reachable from the top-right profile menu by every authenticated user. This
   legacy Settings → Account → Profile route redirects there for backward
   compatibility. The actual UI lives in the shared AccountProfileSection. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyAccountProfileRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/account?tab=profile"); }, [router]);
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
      Taking you to My Account…
    </div>
  );
}
