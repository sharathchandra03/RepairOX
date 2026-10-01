"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { LeadIntelligenceView } from "@/components/leads/intelligence/lead-intelligence-view";
import { NoPermission } from "@/components/common/no-permission";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useLeads } from "@/lib/leads-context";
import { allow, CAP } from "@/lib/capabilities";
import { parseIntelligenceFilters } from "@/lib/lead-intelligence-url";

export default function MyLeadIntelligencePage() {
  const params = useSearchParams();
  const { can } = usePermissions();
  const session = useSession();
  const { salesAgents } = useLeads();
  const canOwn = allow(can, CAP.lead.performanceOwn);
  const filters = useMemo(() => parseIntelligenceFilters(params), [params]);

  if (!canOwn) return <NoPermission title="Lead Intelligence is restricted" subtitle="Your role needs the own Lead Performance permission to analyze your leads." />;
  if (!session.id) return <NoPermission title="No staff identity is available" subtitle="Sign in with a RepairOX staff account to open personal Lead Intelligence." />;

  const agent = salesAgents.find((item) => item.id === session.id) ?? {
    id: session.id,
    name: session.name,
    avatarUrl: session.avatarUrl,
    roleLabel: "Sales Agent",
  };
  return <LeadIntelligenceView agent={agent} initialFilters={filters} />;
}
