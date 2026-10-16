"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/* The owner "Agent Intelligence" list page is now CONSOLIDATED into the single
   permission-aware Sales Book (/leads/sales-book), which auto-switches to the
   owner roster + agent picker when the caller holds performanceAll. This thin
   client redirect preserves old links / bookmarks (and the back-link from the
   diagnostic agent detail page) without a second copy of the UI. The evidence
   analysis detail at /leads/intelligence/agents/[agentId] is unaffected. */

export default function AgentIntelligenceRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const query = params.toString();
    router.replace(`/leads/sales-book${query ? `?${query}` : ""}`);
  }, [router, params]);

  return (
    <div className="flex items-center justify-center py-24 text-[13px] text-muted-foreground">
      Opening the Sales Book…
    </div>
  );
}
