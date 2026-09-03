"use client";

/* Invoice settings now live in the central Settings area (single source of
   truth via organization_settings). This legacy route redirects there so no
   duplicate configuration remains inside the Invoice module. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function InvoiceSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/invoice/general");
  }, [router]);

  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
      Redirecting to Settings → Invoice…
    </div>
  );
}
