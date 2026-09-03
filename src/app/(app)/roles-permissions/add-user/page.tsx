"use client";

/* Legacy route — redirects to Settings → Roles & Permissions → Add User. */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AddUserRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/roles-permissions/add-user");
  }, [router]);

  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
      Redirecting…
    </div>
  );
}
