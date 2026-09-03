"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Roles & Permissions moved to its own dedicated Administration workspace.
 *  This legacy route just forwards to it so old links keep working. */
export default function RolesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/roles-permissions");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="h-6 w-6 rounded-full border-2 border-[#4361EE] border-r-transparent animate-spin" />
    </div>
  );
}
