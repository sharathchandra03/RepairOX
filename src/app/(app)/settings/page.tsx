"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* Settings landing page — redirects to Store Information (the default) */
export default function SettingsIndex() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/store");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="h-6 w-6 rounded-full border-2 border-[#4361EE] border-r-transparent animate-spin" />
    </div>
  );
}
