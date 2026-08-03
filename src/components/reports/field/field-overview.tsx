"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Field Management · Overview (UI flow only)
   ──────────────────────────────────────────────────────────────────────────
   Mirrors the exact section order and components used by the live Shop
   Management overview (see reports-cockpit.tsx), but reads from static sample
   data (./mock-data.ts) instead of the real lib/reports engine. Every section
   component here is the SAME component Shop uses — only the data source and
   copy differ — so wiring in real Field data later is a drop-in replacement.
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
  fieldExecutiveCards, fieldVisitTrend, fieldRevenueSplit, fieldCollections,
  fieldOperationsCards, fieldFinancialCards, fieldTopPartsUsed, fieldFastMovingVanStock,
  fieldLowStockVans, fieldInsights, fieldPerformerDimensions,
} from "./mock-data";

export function FieldOverview() {
  return (
    <div className="space-y-5">
      <ModulePreviewBanner moduleLabel="Field Management" />

      {/* Section 1 — Executive Summary */}
      <ExecutiveSummary cards={fieldExecutiveCards} comparisonLabel="previous period" />

      {/* Section 2 — Business Performance */}
      <BusinessPerformance
        trend={fieldVisitTrend}
        split={fieldRevenueSplit}
        rangeLabel="Last 30 days"
        trendTitle="On-Site Revenue Trend"
        trendSubtitle="Billed revenue from field visits over time"
        splitTitle="Revenue Split"
        splitSubtitle="Where this field revenue came from"
        splitCenterLabel="Total billed"
        trendEmptyTitle="No field revenue has been generated"
        splitEmptyTitle="No visits in this period"
        splitEmptyDetail="Composition appears once field visits are billed."
      />

      {/* Section 3 — Collections → Settled / Pending / Overdue */}
      <CollectionsPanel
        data={fieldCollections}
        title="Field Collections"
        subtitle="Settled, pending and overdue revenue from on-site visits"
        segmentLabels={["Settled", "Pending", "Overdue"]}
        drillHref="/operations"
        drillLabel="View field ops →"
        emptyTitle="No field visits exist for this period"
      />

      {/* Section 4 — Operations → Field jobs health */}
      <OperationsHealth
        cards={fieldOperationsCards}
        title="Field Operations Health"
        subtitle="How on-site visits and routes are performing right now"
      />

      {/* Section 5 — Financial Health */}
      <FinancialHealth
        cards={fieldFinancialCards}
        title="Field Financial Health"
        subtitle="Travel cost, on-site collections and margin"
      />

      {/* Section 6 — Impact Panel → Parts Used On-Site */}
      <ImpactPanel
        title="Field Inventory Impact"
        subtitle="Parts consumption behind this period's on-site visits"
        tone="inventory"
        drillHref="/operations/vendors"
        drillLabel="View vendors →"
        stats={[
          { label: "Parts Used", value: "56" },
          { label: "Value Consumed", value: "₹1,42,000" },
          { label: "Van Stock Value", value: "₹3,86,000" },
        ]}
        primaryLeaderboardTitle="Top Parts Used On-Site"
        primaryLeaderboard={fieldTopPartsUsed}
        primaryEmptyTitle="No parts consumed"
        primaryEmptyDetail="Parts used during field visits will appear here."
        secondaryLeaderboardTitle="Fast-Moving Van Stock"
        secondaryLeaderboard={fieldFastMovingVanStock}
        secondaryEmptyTitle="No van stock velocity data"
        secondaryEmptyDetail="Units used per van will populate this leaderboard."
        watchlistLabel={`Low Stock — ${fieldLowStockVans.length} van${fieldLowStockVans.length > 1 ? "s" : ""} need restocking`}
        watchlist={fieldLowStockVans}
        watchlistTone="amber"
      />

      {/* Section 7 — Business Insights */}
      <InsightsPanel insights={fieldInsights} />

      {/* Section 8 — Top Performers */}
      <PerformersLeaderboardPanel dimensions={fieldPerformerDimensions} emptyIcon="route" />
    </div>
  );
}
