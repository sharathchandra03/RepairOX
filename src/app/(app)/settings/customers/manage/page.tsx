"use client";

/* The Customer Master moved out of Settings into a full standalone page at
   /customers (Shop workspace). This legacy route redirects there so existing
   links/bookmarks keep working. Groups + Loyalty CONFIG remain under Settings. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CustomerMasterRedirect() {
  const router = useRouter();
  useEffect(() => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    router.replace(`/customers${qs}`);
  }, [router]);

  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
      Redirecting to Customers…
    </div>
  );
}
