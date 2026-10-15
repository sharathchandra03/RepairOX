import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { orgIdForAuthUser } from "@/lib/tenant";
import {
  computeInvoiceProfitability,
  type CostingInvoiceLike,
  type CostingLineLike,
} from "@/lib/inventory-costing";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/invoice/[id]/profit

   Cost-FREE invoice profitability aggregate (FEAT-005 / inv-design §7.1,
   MEDIUM-1 option (a)).

   Why a server route:
     A PROFIT-ONLY viewer (holds `view_profit_margin` but NOT any cost key) must
     be able to see Gross Profit / Gross Margin WITHOUT their client ever
     receiving a raw per-unit cost. Per inv-design §2.1a their client gets NO
     cost rows from RLS, so they cannot compute GP/margin in-memory. This route
     computes the aggregates SERVER-SIDE (where the service-role client
     legitimately reads the invoice's own cost snapshot) and returns ONLY the
     derived aggregate numbers — never a per-unit CP / labour figure.

   Guard: the broad "may see profitability OR cost" set, so a cost-capable user
   can also hit it, matching inv-design §7.1. The payload is identical either
   way — aggregates only, so a role with only `view_profit_margin` can never
   obtain a raw cost from any surface (AC-21: a server-side boundary, not a
   hidden button). Everything is constrained to the caller's own organization.
   ────────────────────────────────────────────────────────────────────────── */

interface InvoiceLineRow {
  kind?: "part" | "service";
  qty?: number;
  total?: number;
  cost?: number;
  costState?: "resolved" | "cp" | "not_configured";
}

interface InvoiceDeviceRow {
  parts?: InvoiceLineRow[];
  repairCost?: number;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Allow any viewer who may see profitability OR cost (inv-design §7.1 /
  // FEAT-005). Resolved live from role_permissions — hiding the UI is backed by
  // real server enforcement.
  const guard = await requirePermission(req, [
    "view_profit_margin",
    "view_financial_reports",
    "inventory_view_cost",
    "manage_inventory",
    "manage_purchases",
  ]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "Missing invoice id." }, { status: 400 });

  // Constrain to the caller's own organization — a user can never pull another
  // organization's invoice by tampering with the id.
  const orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) return NextResponse.json({ ok: false, error: "No organization." }, { status: 400 });

  const { data: row, error } = await admin
    .from("invoices")
    .select("id, status, subtotal, discount, total, items, devices")
    .eq("id", id)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!row) return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });

  // Reconstruct the costing-engine input from the stored invoice. The invoice's
  // own `cost`/`costState` line snapshot (stamped at line-creation by a
  // cost-authorized user — FEAT-004) is the historical cost source, consistent
  // with the in-memory path. `devices` is a JSONB envelope { records, meta } or
  // a legacy array; the flat `items` is the legacy single-device fallback.
  const rawDevices = row.devices ?? {};
  const isLegacyArray = Array.isArray(rawDevices);
  const meta = isLegacyArray ? {} : (rawDevices as Record<string, unknown>);
  const deviceRecords: InvoiceDeviceRow[] = (
    isLegacyArray ? rawDevices : ((rawDevices as any).records ?? [])
  ) as InvoiceDeviceRow[];

  const lines: CostingLineLike[] = [];
  const devices: { repairCost?: number }[] = [];
  if (deviceRecords.length > 0) {
    for (const d of deviceRecords) {
      for (const p of d.parts ?? []) {
        lines.push({
          kind: p.kind,
          qty: Number(p.qty ?? 0),
          total: Number(p.total ?? 0),
          cost: p.cost,
          costState: p.costState,
        });
      }
      devices.push({ repairCost: Number(d.repairCost ?? 0) });
    }
  } else {
    // Legacy flat invoice — wrap `items` as part lines (no device repairCost).
    const items = (row.items ?? []) as InvoiceLineRow[];
    for (const p of items) {
      lines.push({
        kind: p.kind,
        qty: Number(p.qty ?? 0),
        total: Number(p.total ?? 0),
        cost: p.cost,
        costState: p.costState,
      });
    }
  }

  const docType = (meta as any)?.documentType as "invoice" | "proforma" | null | undefined;
  const inv: CostingInvoiceLike = {
    id: row.id,
    status: row.status ?? "draft",
    documentType: docType ?? "invoice",
    subtotal: Number(row.subtotal ?? 0),
    discount: Number(row.discount ?? 0),
    total: Number(row.total ?? 0),
    lines,
    devices,
  };

  const p = computeInvoiceProfitability(inv);

  // Return ONLY derived aggregates — never a per-unit CP / labour cost. (The
  // raw `partsCost`/`labourCost`/`breakdown[].cost` are deliberately omitted so
  // a profit-only viewer can never reconstruct a per-unit cost from this
  // payload — inv-design §7.1 / AC-21.)
  return NextResponse.json({
    ok: true,
    aggregate: {
      partsRevenue: p.partsRevenue,
      serviceRevenue: p.serviceRevenue,
      eligibleNetRevenue: p.eligibleNetRevenue,
      partsGP: p.partsGP,
      serviceGP: p.serviceGP,
      combinedGP: p.combinedGP,
      grossMargin: p.grossMargin,
      costPartial: p.costPartial,
    },
  });
}
