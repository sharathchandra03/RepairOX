"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Team member / user management now lives in the dedicated Administration >
 *  Roles & Permissions workspace (Users & Assignment tab). This route only
 *  redirects old links there. */
export default function UsersRedirectPage() {
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
