"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Redirect to the unified Reports → Builder tab.
 * The standalone Sales report builder is deprecated in favour of
 * the centralized Reporting Engine which dynamically loads Sales
 * datasets when the scope is set to Sales Management.
 */
export default function Page() {
  const router = useRouter();
  useEffect(() => { router.replace("/reports"); }, [router]);
  return null;
}
