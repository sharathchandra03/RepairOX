"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { LeadIntelligenceView } from "@/components/leads/intelligence/lead-intelligence-view";
import { NoPermission } from "@/components/common/no-permission";
import { PageHeader } from "@/components/layout/page-header";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useLeads } from "@/lib/leads-context";
import { useStoreContext } from "@/lib/store-context";
import { agentsForStore } from "@/lib/sales-agents";
import { allow, CAP } from "@/lib/capabilities";
import { intelligenceFilterParams, parseIntelligenceFilters } from "@/lib/lead-intelligence-url";

export default function SelectedAgentIntelligencePage() {
  // Read the route param via useParams() — version-safe on Next 14 (where
  // `params` is a plain object, so `use(params)` throws "unsupported type")
  // and forward-compatible.
  const routeParams = useParams();
  const encoded = Array.isArray(routeParams.agentId) ? routeParams.agentId[0] : (routeParams.agentId ?? "");
  const agentId = decodeURIComponent(encoded);
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const session = useSession();
  const { salesAgents, salesAgentsReady, loadErrors } = useLeads();
  const { activeStoreId } = useStoreContext();
  const canAll = allow(can, CAP.lead.performanceAll);
  const canOwn = allow(can, CAP.lead.performanceOwn);
  const isSelf = !!session.id && session.id === agentId;
  const filters = useMemo(() => parseIntelligenceFilters(searchParams), [searchParams]);
  const backQuery = intelligenceFilterParams(filters).toString();

  if (!canAll && !(canOwn && isSelf)) return <NoPermission title="Agent Intelligence is restricted" subtitle="Viewing another Sales Agent requires the all-agent performance permission. Your session identity has not changed." />;
  if (!salesAgentsReady) return <div className="space-y-5"><PageHeader eyebrow="Agent Intelligence" title="Loading agent analysis…" /><div className="h-72 animate-pulse rounded-2xl border border-border bg-muted/25" /></div>;
  if (loadErrors.includes("salesAgents")) return <div className="space-y-5"><PageHeader eyebrow="Agent Intelligence" title="Analysis temporarily unavailable" /><div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-8 text-center"><h2 className="text-base font-bold">Sales Agent directory did not load</h2><p className="mx-auto mt-1 max-w-lg text-[12px] text-muted-foreground">RepairOX will not treat a directory failure as an authorization or store-scope decision.</p><button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-[#4361EE] px-4 py-2 text-[12px] font-semibold text-white">Retry</button></div></div>;

  const scopedAgents = agentsForStore(salesAgents, activeStoreId ?? undefined);
  // Resolve the selected agent. Prefer the store-scoped directory, but an owner
  // (canAll) may analyze ANY agent in their authorized org — so fall back to the
  // full salesAgents directory rather than dead-ending on "unavailable" when a
  // specific store is active and the agent's membership is in another store.
  const agent = scopedAgents.find((item) => item.id === agentId)
    ?? (canAll ? salesAgents.find((item) => item.id === agentId) : undefined)
    ?? (isSelf && session.id ? { id: session.id, name: session.name, avatarUrl: session.avatarUrl, roleLabel: "Sales Agent" } : undefined);
  if (!agent) return <NoPermission title="Agent is unavailable" subtitle="This Sales Agent is outside your authorized organization or store scope." />;

  return <LeadIntelligenceView agent={agent} initialFilters={filters} ownerContext={!isSelf} backHref={`/leads/intelligence/agents${backQuery ? `?${backQuery}` : ""}`} />;
}
