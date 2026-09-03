"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Employee access & security controls moved out of Settings into the
 *  dedicated Administration > Roles & Permissions workspace. This legacy
 *  route just forwards there. */
export default function EmployeeSecurityRedirectPage() {
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
