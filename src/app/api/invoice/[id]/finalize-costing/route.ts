import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { orgIdForAuthUser } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/invoice/[id]/finalize-costing

   SERVER-OWNED costing finalization for an invoice (review findings #5, #6, #8).

   Replaces the former browser-side `invoice_line_costs` upsert, which only
   worked for a cost-capable creator (a non-cost creator got no cost rows under
   RLS and the upsert was silently swallowed, permanently corrupting profit by
   who created the invoice). This route runs under the service role, so:

     • COST SNAPSHOT (findings #5, #6) — it resolves each part line's cost from
       the AUTHORITATIVE records server-side (branch-scoped weighted-average over
       remaining stock layers via inventory_weighted_avg_cost, else the org-level
       default CP from inventory_item_costs, else "not configured") REGARDLESS of
       the invoice creator's read grants, and upserts the cost-scoped
       invoice_line_costs snapshot. The snapshot has no end-user write policy, so
       it is immutable from any client and parent-stamped (org/branch) by the DB
       scope guard. Service lines snapshot their standard labour cost.

     • IDEMPOTENT SALES CONSUMPTION (finding #8 / FR-12) — for a DIRECT invoice
       (no linked ticket) it deducts each part line's stock EXACTLY ONCE through
       consume_invoice_line_stock, protected by a unique fulfilment key, so a
       retry / concurrent finalize is a no-op. For a TICKET-LINKED invoice the
       ticket flow (deductPartsForTicket) remains the authority; this route marks
       those lines consumed (mark_ticket_line_consumed) so a later direct-sale
       finalize can never double-deduct them.

   AUTHORIZATION: the caller must hold an invoice-edit/create key (they are
   finalizing their own invoice). Cost is never returned — the response carries
   only non-sensitive confirmation counts.
   ────────────────────────────────────────────────────────────────────────── */

const INVOICE_EDIT_KEYS = ["manage_invoices", "manage_payments", "manage_sales", "use_pos"];

interface LineRow {
  id?: string;
  kind?: "part" | "service";
  sku?: string;
  qty?: number;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, INVOICE_EDIT_KEYS);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const { admin, user } = guard;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ ok: false, error: "Missing invoice id." }, { status: 400 });

  const orgId = await orgIdForAuthUser(admin, user.id);
  if (!orgId) return NextResponse.json({ ok: false, error: "No organization." }, { status: 400 });

  // Load the invoice within the caller's org (service role bypasses RLS; org is
  // the authoritative tenant boundary here).
  const { data: row, error } = await admin
    .from("invoices")
    .select("id, organization_id, branch_id, ticket_id, items, devices")
    .eq("id", id)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (!row) return NextResponse.json({ ok: false, error: "Invoice not found." }, { status: 404 });

  const hasTicket = !!(row as any).ticket_id;

  // Flatten the part/service lines from the invoice JSON (items + device parts).
  const rawDevices = (row as any).devices ?? {};
  const isLegacyArray = Array.isArray(rawDevices);
  const deviceRecords: { parts?: LineRow[] }[] = (
    isLegacyArray ? rawDevices : ((rawDevices as any).records ?? [])
  ) as { parts?: LineRow[] }[];

  const lines: LineRow[] = [];
  if (deviceRecords.length > 0) {
    for (const d of deviceRecords) for (const p of d.parts ?? []) lines.push(p);
  } else {
    for (const p of ((row as any).items ?? []) as LineRow[]) lines.push(p);
  }

  // Resolve + snapshot each line's cost server-side.
  const costRows: Record<string, unknown>[] = [];
  let consumed = 0;
  let marked = 0;

  for (const line of lines) {
    const lineId = line.id;
    if (!lineId) continue;
    const kind = line.kind === "service" ? "service" : "part";
    const qty = Number(line.qty ?? 0);

    if (kind === "service") {
      // Service line → snapshot its standard labour cost from the cost table
      // (resolved by SKU/item id when the service came from the catalogue).
      let labour: number | null = null;
      let state = "not_configured";
      if (line.sku) {
        const { data: c } = await admin
          .from("inventory_item_costs")
          .select("standard_labour_cost, cost_configured")
          .eq("item_id", line.sku)
          .maybeSingle();
        if (c && (c as any).cost_configured) {
          labour = Number((c as any).standard_labour_cost ?? 0);
          state = "cp";
        }
      }
      costRows.push({
        invoice_id: id, line_id: lineId, kind: "service", qty,
        cost: labour, cost_state: state,
      });
      continue;
    }

    // Part line → weighted-average over remaining layers, else org CP, else n/c.
    let cost: number | null = null;
    let state = "not_configured";
    if (line.sku) {
      const { data: wac } = await admin.rpc("inventory_weighted_avg_cost", { p_item_id: line.sku });
      if (wac != null) {
        cost = Number(wac);
        state = "resolved";
      } else {
        const { data: c } = await admin
          .from("inventory_item_costs")
          .select("cost_price, cost_configured")
          .eq("item_id", line.sku)
          .maybeSingle();
        if (c && (c as any).cost_configured) {
          cost = Number((c as any).cost_price ?? 0);
          state = "cp";
        }
      }
    }
    costRows.push({ invoice_id: id, line_id: lineId, kind: "part", qty, cost, cost_state: state });

    // Idempotent stock consumption for a trackable part with a known item id.
    if (line.sku && qty > 0) {
      if (hasTicket) {
        // Ticket owns consumption; record it so a later finalize won't re-deduct.
        const { error: mErr } = await admin.rpc("mark_ticket_line_consumed", {
          p_invoice_id: id, p_line_id: lineId, p_item_id: line.sku, p_qty: qty,
        });
        if (!mErr) marked += 1;
      } else {
        // Direct invoice → deduct once (fulfilment-key idempotent).
        const { data: didConsume, error: cErr } = await admin.rpc("consume_invoice_line_stock", {
          p_invoice_id: id, p_line_id: lineId, p_item_id: line.sku, p_qty: qty,
        });
        if (!cErr && didConsume === true) consumed += 1;
      }
    }
  }

  if (costRows.length > 0) {
    // Service role bypasses RLS; the scope guard stamps org/branch from the
    // parent invoice and rejects any mismatch. Immutable from the client.
    const { error: upErr } = await admin
      .from("invoice_line_costs")
      .upsert(costRows, { onConflict: "invoice_id,line_id" });
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, snapshotLines: costRows.length, consumed, marked });
}
