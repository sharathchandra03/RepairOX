"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Internal Invoice Profitability Breakdown (FEAT-005 / inv-design §7.1).

   An INTERNAL-ONLY panel rendered on the invoice detail surface, wrapped in
   `<Can permission={CAP.sensitive.viewProfit}>`. It NEVER appears on a customer
   document (print safety, §7.2) — the costing figures it shows are the invoice's
   own internal `line.cost` / `line.costState` snapshot plus the device
   `repairCost` labour charge, run through the pure FEAT-002 engine.

   Two viewer tiers (inv-design §7.1, MEDIUM-1 option (a)):
     • Cost-capable viewer (CAP.sensitive.viewCost) — their client received the
       cost rows from RLS, so the engine runs fully in-memory and the panel shows
       the per-line / parts / labour COST columns AND Gross Profit / Gross Margin.
     • Profit-only viewer (CAP.sensitive.viewProfit but NOT any cost key) — per
       inv-design §2.1a their client received NO raw cost rows from RLS, so the
       cost columns render MASKED (a locked •••• treatment, never "₹0") and the
       aggregated GP / Gross Margin come from the COST-FREE server route
       `getInvoiceProfitAggregate` (which reads the cost tables server-side and
       returns only derived aggregates — never a raw per-unit cost).

   Margin shows "—" (never 0 / NaN) when eligible net revenue is 0 (AC-14); a
   line with no resolved cost shows "Cost not configured" (never ₹0 / 100%
   margin — AC-15).
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { Lock, TrendingUp } from "lucide-react";
import { Can } from "@/components/common/can";
import { DetailSection } from "@/components/common/detail-page";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { formatINR, cn } from "@/lib/utils";
import {
  computeInvoiceProfitability,
  type CostingInvoiceLike,
  type CostingLineLike,
  type InvoiceProfitability,
} from "@/lib/inventory-costing";
import { getInvoiceDevices, isProforma, type Invoice } from "@/lib/mock-data";

/* ─── Invoice → costing-engine adapter ─────────────────────────────────────
   Flattens the invoice's billed lines (device parts for multi-device invoices,
   else the flat `invoice.items`) into the engine's `CostingLineLike[]`, and
   passes each device's `repairCost` so the engine folds it into service
   revenue (HIGH-2). The internal `cost`/`costState` already live on each line
   (stamped at line-creation time by FEAT-004); legacy lines without them are
   tolerated by the engine (treated as an unconfigured part). */
function toCostingInvoice(invoice: Invoice): CostingInvoiceLike {
  const devices = getInvoiceDevices(invoice);
  const lines: CostingLineLike[] = [];
  for (const d of devices) {
    for (const p of d.parts) {
      lines.push({ kind: p.kind, qty: p.qty, total: p.total, cost: p.cost, costState: p.costState });
    }
  }
  return {
    id: invoice.id,
    status: invoice.status,
    documentType: invoice.documentType ?? "invoice",
    subtotal: invoice.subtotal,
    discount: invoice.discount,
    total: invoice.total,
    lines,
    devices: devices.map((d) => ({ repairCost: d.repairCost ?? 0 })),
  };
}

/* ─── Server aggregate shape ────────────────────────────────────────────────
   The payload returned by GET /api/invoice/[id]/profit. For a PROFIT-ONLY caller
   the server returns ONLY combinedGP + grossMargin + costPartial (SYS-1): the
   per-bucket revenue / bucket GP are WITHHELD so they can't be used to derive a
   per-unit cost. The bucket fields are therefore optional here. */
interface ProfitAggregate {
  partsRevenue?: number;
  serviceRevenue?: number;
  eligibleNetRevenue?: number;
  partsGP?: number;
  serviceGP?: number;
  combinedGP: number;
  grossMargin: number | null;
  costPartial: boolean;
}

export function ProfitabilityBreakdown({ invoice }: { invoice: Invoice }) {
  const { can, apiFetch } = usePermissions();
  // Proforma / non-finalized documents are not realized revenue — the panel
  // still PREVIEWS the figures but is clearly labelled "preview — not realized".
  const proforma = isProforma(invoice);
  const realized = !proforma && invoice.status === "paid";
  const canViewCost = allow(can, CAP.sensitive.viewCost);

  // Cost-capable viewers compute everything in-memory from the invoice's own
  // internal cost snapshot (no N+1, no server round-trip).
  const inMemory = useMemo<InvoiceProfitability>(() => computeInvoiceProfitability(toCostingInvoice(invoice)), [invoice]);

  // Profit-only viewers (no cost key) fetch the cost-free aggregate from the
  // server, which legitimately reads the cost tables and returns only derived
  // numbers — never a raw per-unit cost.
  const [aggregate, setAggregate] = useState<ProfitAggregate | null>(null);
  const [aggError, setAggError] = useState<string | null>(null);
  useEffect(() => {
    if (canViewCost) return; // in-memory path covers it
    let cancelled = false;
    setAggregate(null);
    setAggError(null);
    (async () => {
      try {
        const { ok, json } = await apiFetch(`/api/invoice/${encodeURIComponent(invoice.id)}/profit`);
        if (cancelled) return;
        if (!ok || !json?.ok) {
          setAggError(json?.error ?? "Could not load profitability.");
          return;
        }
        setAggregate(json.aggregate as ProfitAggregate);
      } catch {
        if (!cancelled) setAggError("Could not load profitability.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewCost, invoice.id, apiFetch]);

  // The headline numbers come from whichever authorized source applies. A
  // cost-capable viewer computes everything in-memory; a profit-only viewer
  // receives ONLY combinedGP + margin + costPartial from the server (bucket
  // figures withheld — SYS-1).
  const headline: ProfitAggregate | null = canViewCost
    ? {
        partsRevenue: inMemory.partsRevenue,
        serviceRevenue: inMemory.serviceRevenue,
        eligibleNetRevenue: inMemory.eligibleNetRevenue,
        partsGP: inMemory.partsGP,
        serviceGP: inMemory.serviceGP,
        combinedGP: inMemory.combinedGP,
        grossMargin: inMemory.grossMargin,
        costPartial: inMemory.costPartial,
      }
    : aggregate;

  return (
    <Can permission={CAP.sensitive.viewProfit}>
      <DetailSection title="Profitability (Internal)" icon={TrendingUp} accent="emerald">
        {!realized && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] font-medium text-amber-700">
            {proforma
              ? "Preview — a proforma is not realized revenue."
              : "Preview — not yet finalized (realized only when the invoice is paid)."}
          </div>
        )}

        {/* Per-bucket revenue, the per-line breakdown and the raw cost columns
            are shown ONLY to a cost-capable viewer. For a profit-only viewer
            they are WITHHELD entirely (not masked tiles) so no bucket-level
            figure is on screen to combine with the server GP into a per-unit
            cost (SYS-1). A profit-only viewer sees only Gross Profit + Margin. */}
        {canViewCost ? (
          <>
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <Metric label="Parts Revenue" value={formatINR(inMemory.partsRevenue)} />
              <Metric label="Service Revenue" value={formatINR(inMemory.serviceRevenue)} />
            </div>

            {/* Per-line breakdown with repair/labour sub-lines. */}
            <div className="mt-4 overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-muted/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {inMemory.breakdown.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-3 text-center text-muted-foreground">
                        No billable lines.
                      </td>
                    </tr>
                  ) : (
                    inMemory.breakdown.map((l, idx) => (
                      <tr key={idx} className="border-t border-border">
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                              l.kind === "service"
                                ? "bg-violet-50 text-violet-700 ring-violet-200"
                                : "bg-sky-50 text-sky-700 ring-sky-200",
                            )}
                          >
                            {l.kind === "service" ? "Service / Labour" : "Part"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(l.revenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <CostCell notConfigured={l.notConfigured} cost={l.cost} canViewCost={canViewCost} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Gross Profit and Gross Margin only. Per-line and per-bucket cost
            figures require the cost-view permission.
          </p>
        )}

        {/* Cost / GP / Margin summary. Parts/Labour cost rows are cost-only. */}
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          {canViewCost && <Metric label="Parts Cost" value={formatINR(inMemory.partsCost)} />}
          {canViewCost && <Metric label="Labour Cost" value={formatINR(inMemory.labourCost)} />}
          {canViewCost && inMemory.otherDirectCost > 0 && (
            <Metric label="Other Direct Costs" value={formatINR(inMemory.otherDirectCost)} />
          )}
          <Metric
            label="Gross Profit"
            value={headline ? formatINR(headline.combinedGP) : aggError ? "—" : "…"}
            strong
          />
          <Metric
            label="Gross Margin"
            value={headline ? formatMargin(headline.grossMargin) : aggError ? "—" : "…"}
            strong
          />
        </div>

        {headline?.costPartial && (
          <p className="mt-3 text-[11px] text-amber-700">
            * Some line costs are not configured — profit shown is partial.
          </p>
        )}
        {!canViewCost && aggError && (
          <p className="mt-3 text-[11px] text-rose-600">{aggError}</p>
        )}
      </DetailSection>
    </Can>
  );
}

/* ─── Pieces ────────────────────────────────────────────────────────────── */

function Metric({
  label,
  value,
  strong,
  masked,
}: {
  label: string;
  value: string | null;
  strong?: boolean;
  masked?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/60 px-3.5 py-2.5">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      {masked ? (
        <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-400">
          <Lock className="h-3.5 w-3.5" /> ••••
        </p>
      ) : (
        <p className={cn("mt-0.5 text-sm", strong ? "font-bold text-foreground" : "font-medium text-foreground")}>
          {value}
        </p>
      )}
    </div>
  );
}

/** A per-line cost cell: "Cost not configured" when unresolved, a locked mask
 *  for a profit-only viewer, else the resolved extended cost. Never ₹0 for an
 *  unconfigured line. */
function CostCell({
  notConfigured,
  cost,
  canViewCost,
}: {
  notConfigured: boolean;
  cost: number | null;
  canViewCost: boolean;
}) {
  if (!canViewCost) {
    return (
      <span className="inline-flex items-center gap-1 text-zinc-400">
        <Lock className="h-3 w-3" /> ••••
      </span>
    );
  }
  if (notConfigured || cost == null) {
    return <span className="text-[11px] font-medium text-amber-700">Cost not configured</span>;
  }
  return <span>{formatINR(cost)}</span>;
}

function formatMargin(margin: number | null): string {
  if (margin == null) return "—";
  return `${margin.toFixed(1)}%`;
}
