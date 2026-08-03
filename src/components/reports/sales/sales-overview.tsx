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

export function SalesOverview() {
  return (
    <div className="space-y-5">
      <ModulePreviewBanner moduleLabel="Sales Management" />

      {/* Section 1 — Executive Summary */}
      <ExecutiveSummary cards={salesExecutiveCards} comparisonLabel="previous period" />

      {/* Section 2 — Business Performance */}
      <BusinessPerformance
        trend={salesPipelineTrend}
        split={salesPipelineSplit}
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
        data={salesCollections}
        title="Revenue Status"
        subtitle="Won, in-progress and at-risk pipeline value"
        segmentLabels={["Won", "In Progress", "At Risk"]}
        drillHref="/leads/deals"
        drillLabel="View deals →"
        emptyTitle="No deals exist for this period"
      />

      {/* Section 4 — Operations → Pipeline health */}
      <OperationsHealth
        cards={salesOperationsCards}
        title="Pipeline Health"
        subtitle="How the sales pipeline is moving right now"
      />

      {/* Section 5 — Financial Health */}
      <FinancialHealth
        cards={salesFinancialCards}
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
        primaryLeaderboard={salesTopCampaigns}
        primaryEmptyTitle="No campaign activity"
        primaryEmptyDetail="Deals linked to a campaign will appear here."
        secondaryLeaderboardTitle="Revenue by Channel"
        secondaryLeaderboard={salesTopChannels}
        secondaryEmptyTitle="No channel data"
        secondaryEmptyDetail="Revenue by lead source will populate this leaderboard."
        secondaryCurrency
        watchlistLabel={`At Risk — ${salesAtRiskDeals.length} deal${salesAtRiskDeals.length > 1 ? "s" : ""} stalled`}
        watchlist={salesAtRiskDeals}
        watchlistTone="rose"
      />

      {/* Section 7 — Business Insights */}
      <InsightsPanel insights={salesInsights} />

      {/* Section 8 — Top Performers */}
      <PerformersLeaderboardPanel dimensions={salesPerformerDimensions} emptyIcon="target" />
    </div>
  );
}
