"use client";

/* Roles & Permissions now lives under Settings → Roles & Permissions.
   This legacy route redirects there so existing links keep working while the
   module has a single home. Query params (e.g. ?created=1) are preserved. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RolesPermissionsRedirect() {
  const router = useRouter();
  useEffect(() => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    router.replace(`/settings/roles-permissions${qs}`);
  }, [router]);

  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
      Redirecting to Settings → Roles &amp; Permissions…
    </div>
  );
}
