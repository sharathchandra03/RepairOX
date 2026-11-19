"use client";
/* Field Dashboards, Field Reports and Ninja Operations were merged into ONE
   page — Field Insights (/field/insights). The old routes redirect
   there (to the matching section) so bookmarks and stored links keep working. */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function InsightsRedirect({ section }: { section?: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(`/field/insights${section ? `#${section}` : ""}`); }, [router, section]);
  return <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">Opening Field Insights…</div>;
}
