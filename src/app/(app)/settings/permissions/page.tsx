"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Roles & Permissions now lives in its own dedicated Administration
 *  workspace — no longer inside Settings. This route is kept only so any
 *  old bookmark or deep link lands in the right place. */
export default function PermissionsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/roles-permissions");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="h-6 w-6 rounded-full border-2 border-[#4361EE] border-r-transparent animate-spin" />
    </div>
  );
}
