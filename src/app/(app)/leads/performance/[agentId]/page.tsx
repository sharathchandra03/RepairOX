"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Agent Performance drill-down (legacy route).

   The owner leaderboard now opens an agent's Individual view IN-PLACE on
   /leads/performance (no navigation, no impersonation). This path-param route
   is kept only for backward-compatible deep links: it redirects to the
   canonical page with the agent preselected (?agent=<id>&view=individual),
   where ONE component renders the full Individual workspace and the
   permission/scope gating lives in a single place.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AgentReportRedirect() {
  const router = useRouter();
  const params = useParams();
  const raw = Array.isArray(params.agentId) ? params.agentId[0] : (params.agentId ?? "");
  const agentId = decodeURIComponent(raw);

  useEffect(() => {
    const qs = agentId ? `?agent=${encodeURIComponent(agentId)}&view=individual` : "?view=individual";
    router.replace(`/leads/performance${qs}`);
  }, [agentId, router]);

  return null;
}
