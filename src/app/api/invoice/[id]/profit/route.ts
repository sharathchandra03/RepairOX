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

   Invoice profitability aggregate (FEAT-005 / inv-design §7.1, with the
   STRICT-boundary override of §7.1 approved in the review loop — SYS-1/SYS-3).

   AUTHORIZATION (conjunctive — SYS-3):
     The caller MUST hold an INVOICE-VIEW key AND (a PROFIT-VIEW key OR a COST
     key). Invoice-view alone, or a cost/profit key WITHOUT invoice-view, is
     rejected — so a cost-only caller can never read an invoice's profit without
     also being entitled to see that invoice, and the normal invoice RLS
     org/branch predicate is reproduced here (service-role bypasses RLS).

   WHAT EACH TIER RECEIVES (SYS-1 derivation side-channel closed):
     • Cost-capable caller (holds a cost key) → the FULL aggregate: per-bucket
       revenue + bucket GP + combined GP + margin. They are already entitled to
       the raw cost, so bucket figures reveal nothing new.
     • Profit-only caller (holds view_profit_margin / view_financial_reports but
       NO cost key) → ONLY combinedGP + grossMargin + costPartial. Per-bucket
       revenue and bucket GP are WITHHELD, because a profit-only viewer who also
       sees the invoice subtotal/discount could otherwise derive bucketCost =
       bucketNet − bucketGP (exact for a single-line bucket). Withholding the
       bucket figures closes that arithmetic side-channel (AC-21: a real
       server-side boundary, not a hidden button).

   COST SOURCE (SYS-1 relocation):
     The resolved per-line cost snapshot no longer lives in the broadly-readable
     invoices JSON. It is read here from the cost-scoped `invoice_line_costs`
     table via the service-role client. `kind`/`qty`/`total` still come from the
     invoice's own device/line JSON (non-sensitive).
   ────────────────────────────────────────────────────────────────────────── */

interface InvoiceLineRow {
  id?: string;
  kind?: "part" | "service";
  qty?: number;
  total?: number;
}

interface InvoiceDeviceRow {
  parts?: InvoiceLineRow[];
  repairCost?: number;
}

const INVOICE_VIEW_KEYS = ["manage_invoices", "manage_payments", "view_financial_reports", "manage_sales"];
const PROFIT_KEYS = ["view_profit_margin", "view_financial_reports"];
const COST_KEYS = ["inventory_view_cost", "inventory_edit_cost", "manage_inventory", "manage_purchases"];

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  // Single auth call over the UNION of every key that could matter, then derive
  // the granular tier below. (requirePermission already admits admin / '*' /
  // full_access.)
  const guard = await requirePermission(req, [...INVOICE_VIEW_KEYS, ...PROFIT_KEYS, ...COST_KEYS]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user, roleId, permissions } = guard;

  // Universal authority (owner roles / '*' / full_access) satisfies every tier.
  const isSuper =
    permissions.has("*") || permissions.has("full_access") || roleId === "platform_owner" || roleId === "master_shop_owner" || roleId === "developer" || roleId === "admin";
  const hasAny = (keys: string[]) => isSuper || keys.some((k) => permissions.has(k));

  const canViewInvoice = hasAny(INVOICE_VIEW_KEYS);
  const hasProfit = hasAny(PROFIT_KEYS);
  const hasCost = hasAny(COST_KEYS);

  // Conjunctive requirement (SYS-3): invoice-view AND (profit OR cost).
  if (!canViewInvoice || !(hasProfit || hasCost)) {
    return NextResponse.json({ ok: false, error: "You don't have permission to view this invoice's profitability." }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "Missing invoice id." }, { status: 400 });

  const orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) return NextResponse.json({ ok: false, error: "No organization." }, { status: 400 });

  // Reproduce the invoice RLS org + store predicate (SYS-3). The service-role
  // client bypasses RLS, so we constrain org here AND re-check branch
  // visibility against the caller's authorized branches below.
  const { data: row, error } = await admin
    .from("invoices")
    .select("id, status, subtotal, discount, total, items, devices, branch_id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!row) return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });

  // Branch visibility (review finding #3) — reproduce the EXACT auth_branch_visible
  // contract the invoice RLS would apply, since the service-role client bypasses
  // RLS. The real contract (migrations 0034/0039) is:
  //   • a NULL invoice branch is org-wide → visible to any org member;
  //   • otherwise the branch must be in the caller's authorized store set
  //     (auth_store_ids = home staff.branch_id + active user_stores grants);
  //   • a caller who can cross branches sees every branch in the org, and
  //     cross-branch is gated on multi_store_access (NOT manage_branches, which
  //     is store administration, and NOT a hard-coded role id). full_access is
  //     action-wide but store-scoped per 0039, so it does NOT by itself grant
  //     cross-store — only platform/master owner (true admin) + multi_store_access.
  // auth_can_cross_branch() ≡ multi_store_access; is_admin() ≡ the built-in
  // admin role set (platform_owner / master_shop_owner / developer / admin). '*'
  // / full_access are action-wide but store-scoped (0039) and do NOT, on their
  // own, cross branches — so they are deliberately NOT in this test.
  const IS_ADMIN_ROLES = ["platform_owner", "master_shop_owner", "developer", "admin"];
  const canCrossBranch = IS_ADMIN_ROLES.includes(roleId) || permissions.has("multi_store_access");

  if (!canCrossBranch && row.branch_id != null) {
    // auth_store_ids() for a non-cross-branch caller = home staff.branch_id +
    // active user_stores grants (keyed by staff_id). Resolve the caller's staff
    // id first, then both its home branch and its active grants.
    const { data: staffRow } = await admin
      .from("staff")
      .select("id, branch_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const authorizedBranches = new Set<string>();
    if (staffRow?.branch_id) authorizedBranches.add(staffRow.branch_id as string);
    if (staffRow?.id) {
      const { data: grants } = await admin
        .from("user_stores")
        .select("branch_id")
        .eq("staff_id", staffRow.id)
        .eq("status", "active");
      for (const g of (grants ?? []) as any[]) if (g.branch_id) authorizedBranches.add(g.branch_id as string);
    }

    if (!authorizedBranches.has(row.branch_id as string)) {
      return NextResponse.json({ ok: false, error: "You don't have permission to view this invoice's profitability." }, { status: 403 });
    }
  }

  // Cost snapshot — read from the cost-scoped table (SYS-1), NOT the invoice
  // JSON. One read, keyed by line id.
  const { data: costRows } = await admin
    .from("invoice_line_costs")
    .select("line_id, cost, cost_state")
    .eq("invoice_id", id)
    .eq("organization_id", orgId);
  const costByLine = new Map<string, { cost: number | null; cost_state: string | null }>();
  for (const c of (costRows ?? []) as any[]) costByLine.set(c.line_id, { cost: c.cost, cost_state: c.cost_state });

  // Reconstruct the costing-engine input: kind/qty/total from the invoice JSON
  // (non-sensitive), cost/costState from the cost-scoped snapshot.
  const rawDevices = row.devices ?? {};
  const isLegacyArray = Array.isArray(rawDevices);
  const meta = isLegacyArray ? {} : (rawDevices as Record<string, unknown>);
  const deviceRecords: InvoiceDeviceRow[] = (
    isLegacyArray ? rawDevices : ((rawDevices as any).records ?? [])
  ) as InvoiceDeviceRow[];

  const lines: CostingLineLike[] = [];
  const devices: { repairCost?: number }[] = [];
  const toLine = (p: InvoiceLineRow): CostingLineLike => {
    const snap = p.id ? costByLine.get(p.id) : undefined;
    return {
      kind: p.kind,
      qty: Number(p.qty ?? 0),
      total: Number(p.total ?? 0),
      cost: snap?.cost ?? undefined,
      costState: (snap?.cost_state ?? undefined) as any,
    };
  };
  if (deviceRecords.length > 0) {
    for (const d of deviceRecords) {
      for (const p of d.parts ?? []) lines.push(toLine(p));
      devices.push({ repairCost: Number(d.repairCost ?? 0) });
    }
  } else {
    const items = (row.items ?? []) as InvoiceLineRow[];
    for (const p of items) lines.push(toLine(p));
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

  // TIERED PAYLOAD (SYS-1): a cost-capable caller gets the full bucket
  // breakdown; a profit-only caller gets ONLY combined GP + margin + the
  // partial flag, so no bucket-level figure (and therefore no derivable
  // per-unit cost) ever reaches a non-cost viewer.
  if (hasCost) {
    return NextResponse.json({
      ok: true,
      tier: "cost",
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

  return NextResponse.json({
    ok: true,
    tier: "profit",
    aggregate: {
      combinedGP: p.combinedGP,
      grossMargin: p.grossMargin,
      costPartial: p.costPartial,
    },
  });
}
