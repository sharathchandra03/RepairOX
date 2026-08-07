"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Coming Soon route.

   This page is rendered when a user navigates to a feature marked as
   "coming_soon" in the Feature Visibility configuration. The `from` query
   parameter tells us which feature they tried to access, and we generate
   dynamic, contextual content accordingly.
   ────────────────────────────────────────────────────────────────────────── */

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ComingSoonPage } from "@/components/common/coming-soon";
import { getComingSoonContentByHref } from "@/lib/feature-visibility";

function ComingSoonContent() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";
  const content = getComingSoonContentByHref(from);

  return <ComingSoonPage content={content} />;
}

export default function ComingSoonRoute() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#4361EE] border-t-transparent" /></div>}>
      <ComingSoonContent />
    </Suspense>
  );
}
