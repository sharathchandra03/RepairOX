import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/api-auth";

const POINTS_PER_RUPEE = 100; // 1 pt per ₹100 (default rate)

function tierForPoints(pts: number): string {
  if (pts >= 10000) return "platinum";
  if (pts >= 5000)  return "gold";
  if (pts >= 1000)  return "silver";
  return "bronze";
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, ["manage_loyalty"]);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Supabase not configured" }, { status: 500 });
  }

  // Service-role client bypasses RLS — needed to read all org invoices and
  // write loyalty rows on behalf of the system (not the calling user).
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  try {
    // 1. Load all paid invoices that have no earn transaction yet.
    const { data: invoices, error: invErr } = await db
      .from("invoices")
      .select("id, customer_id, organization_id, branch_id, total, created_at")
      .eq("status", "paid")
      .is("deleted_at", null)
      .not("customer_id", "is", null)
      .gt("total", 0);

    if (invErr) throw new Error(`Failed to load invoices: ${invErr.message}`);
    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ ok: true, invoicesProcessed: 0, accountsUpdated: 0 });
    }

    // 2. Load existing earn transaction source_ids to skip already-awarded invoices.
    const { data: existingTx, error: txErr } = await db
      .from("loyalty_transactions")
      .select("source_id")
      .eq("type", "earn")
      .eq("source_type", "invoice");

    if (txErr) throw new Error(`Failed to load existing transactions: ${txErr.message}`);

    const awarded = new Set((existingTx ?? []).map((r: { source_id: string | null }) => r.source_id));

    const eligible = invoices.filter(
      (inv: { id: string }) => !awarded.has(inv.id)
    );

    if (eligible.length === 0) {
      return NextResponse.json({ ok: true, invoicesProcessed: 0, accountsUpdated: 0 });
    }

    // 3. Group by customer, sort by created_at, compute running balances.
    type InvRow = { id: string; customer_id: string; organization_id: string; branch_id: string | null; total: number; created_at: string };
    const byCustomer = new Map<string, InvRow[]>();
    for (const inv of eligible as InvRow[]) {
      const arr = byCustomer.get(inv.customer_id) ?? [];
      arr.push(inv);
      byCustomer.set(inv.customer_id, arr);
    }

    // Load existing balances so running total starts from the right base.
    const customerIds = Array.from(byCustomer.keys());
    const { data: existingAccts } = await db
      .from("loyalty_accounts")
      .select("customer_id, points_balance")
      .in("customer_id", customerIds);

    const baseBalance = new Map<string, number>(
      (existingAccts ?? []).map((a: { customer_id: string; points_balance: number }) => [a.customer_id, a.points_balance])
    );

    // 4. Build ledger rows.
    const ledgerRows: object[] = [];
    const finalBalances = new Map<string, { points: number; orgId: string; lastTx: string }>();

    for (const [customerId, invs] of byCustomer) {
      invs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      let running = baseBalance.get(customerId) ?? 0;
      for (const inv of invs) {
        const pts = Math.floor(inv.total / POINTS_PER_RUPEE);
        if (pts <= 0) continue;
        running += pts;
        ledgerRows.push({
          id: `BF-${inv.id}`,
          organization_id: inv.organization_id,
          branch_id: inv.branch_id,
          customer_id: customerId,
          type: "earn",
          points_change: pts,
          points_balance: running,
          source_type: "invoice",
          source_id: inv.id,
          description: "Backfilled from paid invoice",
          created_at: inv.created_at,
        });
        finalBalances.set(customerId, {
          points: running,
          orgId: inv.organization_id,
          lastTx: inv.created_at,
        });
      }
    }

    // 5. Insert ledger rows in batches of 200.
    let invoicesProcessed = 0;
    const BATCH = 200;
    for (let i = 0; i < ledgerRows.length; i += BATCH) {
      const batch = ledgerRows.slice(i, i + BATCH);
      const { error: insertErr } = await db
        .from("loyalty_transactions")
        .upsert(batch, { onConflict: "id", ignoreDuplicates: true });
      if (insertErr) throw new Error(`Ledger insert failed: ${insertErr.message}`);
      invoicesProcessed += batch.length;
    }

    // 6. Upsert loyalty_accounts.
    const accountRows = Array.from(finalBalances.entries()).map(([customerId, val]) => ({
      customer_id: customerId,
      organization_id: val.orgId,
      points_balance: val.points,
      tier: tierForPoints(val.points),
      last_transaction_at: val.lastTx,
    }));

    let accountsUpdated = 0;
    for (let i = 0; i < accountRows.length; i += BATCH) {
      const batch = accountRows.slice(i, i + BATCH);
      const { error: acctErr } = await db
        .from("loyalty_accounts")
        .upsert(batch, { onConflict: "customer_id" });
      if (acctErr) throw new Error(`Account upsert failed: ${acctErr.message}`);
      accountsUpdated += batch.length;
    }

    return NextResponse.json({ ok: true, invoicesProcessed, accountsUpdated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[loyalty/backfill]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
