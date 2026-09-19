import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { orgIdForAuthUser } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/owner/summary?from=ISO&to=ISO

   Server-side consolidated metrics for the Owner / Master dashboard.

   Why a server route (not client aggregation):
     • Requirement: never load every store's full dataset into the browser to
       filter it. This route aggregates in the database layer and returns only
       compact per-store rows + totals.
     • Security: access is verified server-side (admin/owner only), and every
       query is constrained to the caller's OWN organization — a user can never
       pull another organization's data by tampering with params.

   The metrics mirror the definitions the store-level dashboard/list pages use
   (counts of live rows, sum of invoice totals & paid amounts, outstanding =
   total − paid, stock value = current_stock × price) so Owner numbers stay
   consistent with per-store numbers.
   ────────────────────────────────────────────────────────────────────────── */

type Row = Record<string, any>;

function inRange(iso: string | null | undefined, from?: string | null, to?: string | null): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime()) return false;
  return true;
}

export async function GET(req: Request) {
  // Consolidated multi-store metrics — require the multi-store / owner-dashboard
  // capability (permission-based, resolved live from role_permissions), so
  // hiding the UI is backed by real server enforcement (§ backend enforcement).
  const guard = await requirePermission(req, ["multi_store_access", "owner_dashboard_view"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  // Constrain everything to the caller's own organization.
  const orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) return NextResponse.json({ ok: false, error: "No organization." }, { status: 400 });

  // Stores in this org.
  const { data: branches, error: bErr } = await admin
    .from("branches")
    .select("id, name, code, address, is_active, environment, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (bErr) return NextResponse.json({ ok: false, error: bErr.message }, { status: 400 });

  const branchList = branches ?? [];
  const branchIds = branchList.map((b) => b.id);

  // Pull the compact fields we need per table, scoped to this org. We select
  // only the columns required for the metrics to keep payloads small.
  const [tix, invs, wis, inv] = await Promise.all([
    admin.from("tickets")
      // `devices` carries the recordType meta envelope — needed to EXCLUDE
      // Warranty records from the consolidated ticket COUNT (they are ₹0
      // service events, not billable repair tickets, spec §65/§66).
      .select("branch_id, status, created_at, deleted_at, source, devices")
      .eq("organization_id", orgId).is("deleted_at", null),
    admin.from("invoices")
      // `devices` carries the documentType meta envelope — needed to EXCLUDE
      // proformas from consolidated financial totals (they are non-revenue).
      .select("branch_id, status, total, paid_amount, created_at, deleted_at, devices")
      .eq("organization_id", orgId).is("deleted_at", null),
    admin.from("walk_ins")
      .select("branch_id, status, created_at, deleted_at")
      .eq("organization_id", orgId).is("deleted_at", null),
    admin.from("inventory_items")
      .select("branch_id, current_stock, regular_selling_price, default_price, deleted_at")
      .eq("organization_id", orgId).is("deleted_at", null),
  ]);

  // Initialise a per-store accumulator.
  const acc = new Map<string, {
    tickets: number; walkIns: number; invoices: number;
    totalSales: number; paymentReceived: number; outstanding: number;
    stockValue: number; pickup: number; onsite: number;
  }>();
  for (const id of branchIds) {
    acc.set(id, { tickets: 0, walkIns: 0, invoices: 0, totalSales: 0, paymentReceived: 0, outstanding: 0, stockValue: 0, pickup: 0, onsite: 0 });
  }
  const bump = (id: string | null | undefined, fn: (a: NonNullable<ReturnType<typeof acc.get>>) => void) => {
    if (!id) return; const a = acc.get(id); if (a) fn(a);
  };

  for (const r of (tix.data ?? []) as Row[]) {
    if (!inRange(r.created_at, from, to)) continue;
    // Resolve recordType from the `devices` JSONB envelope (there is no
    // record_type column). Warranty records are excluded from ticket counts.
    const devMeta = r.devices;
    const recordType = devMeta && !Array.isArray(devMeta) && typeof devMeta === "object" ? devMeta.recordType : undefined;
    if (recordType === "warranty") continue;
    bump(r.branch_id, (a) => {
      a.tickets += 1;
      const src = String(r.source ?? "").toLowerCase();
      if (src.includes("pickup")) a.pickup += 1;
      else if (src.includes("onsite") || src.includes("on-site") || src.includes("field")) a.onsite += 1;
    });
  }
  for (const r of (wis.data ?? []) as Row[]) {
    if (!inRange(r.created_at, from, to)) continue;
    bump(r.branch_id, (a) => { a.walkIns += 1; });
  }
  for (const r of (invs.data ?? []) as Row[]) {
    if (!inRange(r.created_at, from, to)) continue;
    // Proformas are NON-revenue commercial documents — never fold them into the
    // Owner consolidated financial totals (Total Sales / Payment Received /
    // Outstanding / Avg per Day). documentType is packed in the `devices` JSONB
    // meta envelope (not a top-level array). Absent → normal invoice.
    const devMeta = r.devices;
    const docType = devMeta && !Array.isArray(devMeta) && typeof devMeta === "object" ? devMeta.documentType : undefined;
    if (docType === "proforma") continue;
    bump(r.branch_id, (a) => {
      a.invoices += 1;
      const total = Number(r.total ?? 0);
      const paid = Number(r.paid_amount ?? 0);
      a.totalSales += total;
      a.paymentReceived += paid;
      a.outstanding += Math.max(0, total - paid);
    });
  }
  // Inventory stock value is a snapshot (not date-filtered).
  for (const r of (inv.data ?? []) as Row[]) {
    bump(r.branch_id, (a) => {
      const price = Number(r.regular_selling_price ?? r.default_price ?? 0);
      a.stockValue += Number(r.current_stock ?? 0) * price;
    });
  }

  // Average per day over the selected window (min 1 day) for the AVG/DAY column.
  const days = (() => {
    if (!from || !to) return 30;
    const d = Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
    return Math.max(1, d);
  })();

  const stores = branchList.map((b) => {
    const a = acc.get(b.id)!;
    return {
      id: b.id,
      name: b.name,
      code: b.code,
      address: b.address,
      isActive: b.is_active,
      environment: (b.environment ?? "live") as "demo" | "live",
      tickets: a.tickets,
      walkIns: a.walkIns,
      invoices: a.invoices,
      pickup: a.pickup,
      onsite: a.onsite,
      totalSales: a.totalSales,
      paymentReceived: a.paymentReceived,
      outstanding: a.outstanding,
      stockValue: a.stockValue,
      avgPerDay: Math.round(a.totalSales / days),
    };
  });

  const totals = stores.reduce(
    (t, s) => ({
      tickets: t.tickets + s.tickets,
      walkIns: t.walkIns + s.walkIns,
      invoices: t.invoices + s.invoices,
      pickup: t.pickup + s.pickup,
      onsite: t.onsite + s.onsite,
      totalSales: t.totalSales + s.totalSales,
      paymentReceived: t.paymentReceived + s.paymentReceived,
      outstanding: t.outstanding + s.outstanding,
      stockValue: t.stockValue + s.stockValue,
      avgPerDay: t.avgPerDay + s.avgPerDay,
    }),
    { tickets: 0, walkIns: 0, invoices: 0, pickup: 0, onsite: 0, totalSales: 0, paymentReceived: 0, outstanding: 0, stockValue: 0, avgPerDay: 0 }
  );

  return NextResponse.json({ ok: true, stores, totals, days });
}
