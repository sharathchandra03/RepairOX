"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Sales Management · Overview (UI flow only)
   ──────────────────────────────────────────────────────────────────────────
   Mirrors the exact section order and components used by the live Shop
   Management overview (see reports-cockpit.tsx), but reads from static sample
   data (./mock-data.ts) instead of the real lib/reports engine. Every section
   component here is the SAME component Shop uses — only the data source and
   copy differ — so wiring in real Sales data later is a drop-in replacement.
   ────────────────────────────────────────────────────────────────────────── */

import { ModulePreviewBanner } from "../module-preview-banner";
import { ExecutiveSummary } from "../exec-summary";
import { BusinessPerformance } from "../business-performance";
import { CollectionsPanel } from "../collections-panel";
import { OperationsHealth } from "../operations-health";
import { FinancialHealth } from "../financial-health";
import { ImpactPanel } from "../inventory-impact";
import { PerformersLeaderboardPanel } from "../top-performers";
import { InsightsPanel } from "../insights-panel";

import {
  salesExecutiveCards, salesPipelineTrend, salesPipelineSplit, salesCollections,
  salesOperationsCards, salesFinancialCards, salesTopCampaigns, salesTopChannels,
  salesAtRiskDeals, salesInsights, salesPerformerDimensions,
} from "./mock-data";
import { usePermissions } from "@/lib/permissions-context";
import type { MetricCard } from "../selectors";
import type { SeriesPoint } from "@/lib/reports/types";

/** Zero out all values for demo mode — keeps labels/structure intact */
function zeroCards(cards: MetricCard[]): MetricCard[] {
  return cards.map((c) => ({ ...c, value: 0, previous: 0, deltaPct: 0, sparkline: [] }));
}
function zeroSeries(data: SeriesPoint[]): SeriesPoint[] {
  return data.map((d) => ({ ...d, value: 0 }));
}

export function SalesOverview() {
  const { isDemoMode } = usePermissions();

  const cards = isDemoMode ? zeroCards(salesExecutiveCards) : salesExecutiveCards;
  const trend = isDemoMode ? zeroSeries(salesPipelineTrend) : salesPipelineTrend;
  const split = isDemoMode ? zeroSeries(salesPipelineSplit) : salesPipelineSplit;
  const collections = isDemoMode ? { collected: 0, pending: 0, overdue: 0, total: 0 } : salesCollections;
  const opsCards = isDemoMode ? zeroCards(salesOperationsCards) : salesOperationsCards;
  const finCards = isDemoMode ? zeroCards(salesFinancialCards) : salesFinancialCards;
  const campaigns = isDemoMode ? [] : salesTopCampaigns;
  const channels = isDemoMode ? [] : salesTopChannels;
  const atRisk = isDemoMode ? [] : salesAtRiskDeals;
  const insights = isDemoMode ? [] : salesInsights;
  const performers = isDemoMode ? salesPerformerDimensions.map((d) => ({ ...d, data: [] })) : salesPerformerDimensions;

  return (
    <div className="space-y-5">
      {!isDemoMode && <ModulePreviewBanner moduleLabel="Sales Management" />}

      {/* Section 1 — Executive Summary */}
      <ExecutiveSummary cards={cards} comparisonLabel="previous period" />

      {/* Section 2 — Business Performance */}
      <BusinessPerformance
        trend={trend}
        split={split}
        rangeLabel="Last 30 days"
        trendTitle="Pipeline Trend"
        trendSubtitle="New pipeline value created over time"
        splitTitle="Pipeline Split"
        splitSubtitle="Where this pipeline value came from"
        splitCenterLabel="Total pipeline"
        trendEmptyTitle="No pipeline activity yet"
        splitEmptyTitle="No deals in this period"
        splitEmptyDetail="Composition appears once deals are created."
      />

      {/* Section 3 — Collections → Won / In Progress / At Risk */}
      <CollectionsPanel
        data={collections}
        title="Revenue Status"
        subtitle="Won, in-progress and at-risk pipeline value"
        segmentLabels={["Won", "In Progress", "At Risk"]}
        drillHref="/leads/deals"
        drillLabel="View deals →"
        emptyTitle="No deals exist for this period"
      />

      {/* Section 4 — Operations → Pipeline health */}
      <OperationsHealth
        cards={opsCards}
        title="Pipeline Health"
        subtitle="How the sales pipeline is moving right now"
      />

      {/* Section 5 — Financial Health */}
      <FinancialHealth
        cards={finCards}
        title="Sales Financial Health"
        subtitle="Acquisition cost, commissions and margin"
      />

      {/* Section 6 — Impact Panel → Campaign / Channel Impact */}
      <ImpactPanel
        title="Campaign Impact"
        subtitle="Which campaigns and channels are driving this period's deals"
        tone="collection"
        drillHref="/leads/campaigns"
        drillLabel="View campaigns →"
        stats={[
          { label: "Active Campaigns", value: "5" },
          { label: "Deals Attributed", value: "67" },
          { label: "Attributed Revenue", value: "₹6,92,000" },
        ]}
        primaryLeaderboardTitle="Top Campaigns"
        primaryLeaderboard={campaigns}
        primaryEmptyTitle="No campaign activity"
        primaryEmptyDetail="Deals linked to a campaign will appear here."
        secondaryLeaderboardTitle="Revenue by Channel"
        secondaryLeaderboard={channels}
        secondaryEmptyTitle="No channel data"
        secondaryEmptyDetail="Revenue by lead source will populate this leaderboard."
        secondaryCurrency
        watchlistLabel={`At Risk — ${atRisk.length} deal${atRisk.length > 1 ? "s" : ""} stalled`}
        watchlist={atRisk}
        watchlistTone="rose"
      />

      {/* Section 7 — Business Insights */}
      <InsightsPanel insights={insights} />

      {/* Section 8 — Top Performers */}
      <PerformersLeaderboardPanel dimensions={performers} emptyIcon="target" />
    </div>
  );
}
