import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { resolveStaff, type AdminLike } from "@/lib/work-session-server";
import { TRASH_KINDS, TRASH_KIND_META, type TrashCounts, type TrashItem, type TrashKind } from "@/lib/trash";

export const dynamic = "force-dynamic";

/* ──────────────────────────────────────────────────────────────────────────
   /api/trash — the Settings → Trash Bin.

   GET   list soft-deleted Tickets / Invoices / Walk-Ins / Leads (one kind per
         request, plus the count for every kind), with who created and who
         deleted each record.
   POST  restore one or more records ({ kind, ids }).

   Authorization (UI = server = data):
     • GET  needs settings_trash_view  (or settings_trash_restore)
     • POST needs settings_trash_restore
     • Both are OFF by default for every role (owners hold them via
       full_access). Keys are granular only — no coarse fallback.

   The route uses the service-role client (it must read rows the normal
   client filters out), which BYPASSES RLS — so it reproduces the same scope
   by hand: caller's organization AND the stores the caller may see
   (staff_store_ids, same resolver as the lead/store RLS helpers; rows with no
   branch are org-wide and visible, exactly like auth_branch_visible).
   ────────────────────────────────────────────────────────────────────────── */

const VIEW_KEYS = ["settings_trash_view", "settings_trash_restore"];
const RESTORE_KEYS = ["settings_trash_restore"];
const ADMIN_ROLE_IDS = ["master_shop_owner", "platform_owner", "developer_admin"];
const MAX_PAGE_SIZE = 100;
const MAX_RESTORE = 200;

function isKind(v: unknown): v is TrashKind {
  return typeof v === "string" && v in TRASH_KIND_META;
}

/** Strip characters that would break a PostgREST `or()` filter / ilike pattern. */
function cleanQuery(q: string): string {
  return q.replace(/[,()*%\\"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

const SEARCH_COLUMNS: Record<TrashKind, string[]> = {
  ticket:  ["id", "ticket_no", "customer", "phone", "device", "model"],
  invoice: ["id", "reference", "customer", "phone"],
  walkin:  ["id", "customer", "phone", "model", "category"],
  lead:    ["lead_no", "name", "number", "device"],
};

interface Caller {
  staffId: string;
  orgId: string;
  /** null = unrestricted store scope (owner / wildcard). */
  storeIds: string[] | null;
}

async function resolveCaller(
  admin: AdminLike, userId: string, roleId: string, permissions: Set<string>,
): Promise<Caller | null> {
  const staff = await resolveStaff(admin, userId);
  if (!staff?.organization_id) return null;

  const unrestricted = ADMIN_ROLE_IDS.includes(roleId) || permissions.has("*");
  if (unrestricted) return { staffId: staff.id, orgId: staff.organization_id, storeIds: null };

  // Same resolver the DB helpers use: home store + active grants, constrained
  // by multi_store_access. Falls back to the home store if the RPC is missing.
  let ids: string[] = [];
  const { data, error } = await admin.rpc("staff_store_ids", { p_staff_id: staff.id });
  if (!error && Array.isArray(data)) ids = data as string[];
  else if (staff.branch_id) ids = [staff.branch_id];
  return { staffId: staff.id, orgId: staff.organization_id, storeIds: ids };
}

/** Apply org + store scope (+ optional single-store filter) to a query. */
function scoped(q: any, caller: Caller, storeFilter: string | null) {
  q = q.eq("organization_id", caller.orgId).not("deleted_at", "is", null);
  if (caller.storeIds) {
    const list = caller.storeIds.length ? caller.storeIds.join(",") : "00000000-0000-0000-0000-000000000000";
    q = q.or(`branch_id.in.(${list}),branch_id.is.null`);
  }
  if (storeFilter) q = q.eq("branch_id", storeFilter);
  return q;
}

/** Parse an ISO bound from the query string; invalid / empty = no bound. */
function isoBound(v: string | null): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/* Walk-in numbers (WK-001) and several other business fields are stored in a
   JSON envelope inside `notes` (see store.tsx encodeWalkInNotes). Mirror its
   marker so the Trash Bin shows the SAME number the Walk-In table shows. */
const WALKIN_META_MARKER = "\n\u241F::walkin-meta::";
function walkInMeta(notes: string | null | undefined): { walkInNumber?: string; customerName?: string } {
  if (!notes) return {};
  const idx = notes.indexOf(WALKIN_META_MARKER);
  if (idx === -1) return {};
  try {
    const meta = JSON.parse(notes.slice(idx + WALKIN_META_MARKER.length));
    return meta && typeof meta === "object" ? meta : {};
  } catch {
    return {};
  }
}

function rowToItem(kind: TrashKind, r: any): Omit<TrashItem, "storeName" | "createdByName" | "deletedByName"> {
  const base = {
    kind, id: String(r.id), branchId: r.branch_id ?? null,
    createdAt: r.created_at ?? null, deletedAt: r.deleted_at as string,
  };
  switch (kind) {
    case "ticket":
      return { ...base, ref: r.ticket_no || String(r.id), title: r.customer || "—",
        subtitle: [r.model || r.device, r.phone].filter(Boolean).join(" · "),
        status: r.status ?? "", amount: r.amount == null ? null : Number(r.amount) };
    case "invoice":
      return { ...base, ref: r.reference || String(r.id), title: r.customer || "—",
        subtitle: r.phone || "", status: r.status ?? "", amount: r.total == null ? null : Number(r.total) };
    case "walkin":
      return { ...base, ref: r.walkin_number || walkInMeta(r.notes).walkInNumber || String(r.id), title: r.customer || "—",
        subtitle: [r.model || r.category, r.phone].filter(Boolean).join(" · "),
        status: r.status ?? "", amount: null };
    default:
      return { ...base, ref: r.lead_no || String(r.id), title: r.name || "—",
        subtitle: [r.device, r.number].filter(Boolean).join(" · "),
        status: r.status ?? "", amount: r.estimate == null ? null : Number(r.estimate) };
  }
}

export async function GET(req: Request) {
  const guard = await requirePermission(req, VIEW_KEYS);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const admin = guard.admin as AdminLike;

  const caller = await resolveCaller(admin, guard.user.id, guard.roleId, guard.permissions);
  if (!caller) return NextResponse.json({ ok: false, error: "No profile for this account." }, { status: 404 });

  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const kind: TrashKind = isKind(kindParam) ? kindParam : "ticket";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));
  const q = cleanQuery(url.searchParams.get("q") ?? "");
  const storeFilter = url.searchParams.get("store") || null;
  const from = isoBound(url.searchParams.get("from"));
  const to = isoBound(url.searchParams.get("to"));

  // A store filter may only narrow the caller's own scope, never widen it.
  if (storeFilter && caller.storeIds && !caller.storeIds.includes(storeFilter)) {
    return NextResponse.json({ ok: false, error: "That store is outside your access." }, { status: 403 });
  }

  const meta = TRASH_KIND_META[kind];

  const wantCounts = url.searchParams.get("counts") !== "0";

  // Every independent query runs at once (counts, the page of rows, stores).
  const countsPromise = wantCounts
    ? Promise.all(
        TRASH_KINDS.map(async (k) => {
          let cq = admin.from(k.table).select("id", { count: "exact", head: true });
          cq = scoped(cq, caller, storeFilter);
          if (from) cq = cq.gte("deleted_at", from);
          if (to) cq = cq.lte("deleted_at", to);
          const { count } = await cq;
          return [k.kind, count ?? 0] as const;
        }),
      )
    : Promise.resolve(null);

  let lq = admin.from(meta.table).select("*", { count: "exact" });
  lq = scoped(lq, caller, storeFilter);
  if (from) lq = lq.gte("deleted_at", from);
  if (to) lq = lq.lte("deleted_at", to);
  if (q) lq = lq.or(SEARCH_COLUMNS[kind].map((c) => `${c}.ilike.%${q}%`).join(","));
  lq = lq.order("deleted_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);

  const [countEntries, listRes, branchRes] = await Promise.all([
    countsPromise,
    lq,
    admin.from("branches").select("id, name").eq("organization_id", caller.orgId),
  ]);
  const { data: rows, count: total, error } = listRes;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const counts = countEntries
    ? (Object.fromEntries(countEntries) as unknown as TrashCounts)
    : undefined;
  const branchRows = branchRes.data;

  const list = (rows ?? []) as any[];

  // Resolve names: creator + deleter from staff, and — for records deleted
  // before `deleted_by` was stamped — the actor recorded in the audit trail.
  const staffIds = Array.from(new Set(list.flatMap((r) => [r.created_by, r.deleted_by]).filter(Boolean))) as string[];
  const unknownDeleter = list.filter((r) => !r.deleted_by).map((r) => String(r.id));
  const [staffRes, auditRes] = await Promise.all([
    staffIds.length ? admin.from("staff").select("id, name").in("id", staffIds) : Promise.resolve({ data: [] as any[] }),
    unknownDeleter.length
      ? admin
          .from("audit_log")
          .select("record_id, actor, created_at")
          .eq("entity_type", meta.table)
          .in("record_id", unknownDeleter)
          .not("new_value->>deleted_at", "is", null)
          .is("previous_value->>deleted_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const staffName: Record<string, string> = {};
  for (const s of staffRes.data ?? []) staffName[s.id] = s.name;
  const auditActor: Record<string, string> = {};
  for (const a of auditRes.data ?? []) {
    if (a.record_id && a.actor && !(a.record_id in auditActor)) auditActor[a.record_id] = a.actor;
  }

  const storeNameById: Record<string, string> = {};
  for (const b of branchRows ?? []) storeNameById[b.id] = b.name;
  const stores = (branchRows ?? [])
    .filter((b: any) => !caller.storeIds || caller.storeIds.includes(b.id))
    .map((b: any) => ({ id: b.id as string, name: b.name as string }));

  const items: TrashItem[] = list.map((r) => {
    const base = rowToItem(kind, r);
    return {
      ...base,
      storeName: base.branchId ? storeNameById[base.branchId] ?? null : null,
      createdByName: r.created_by ? staffName[r.created_by] ?? null : null,
      deletedByName: (r.deleted_by && staffName[r.deleted_by]) || auditActor[String(r.id)] || null,
    };
  });

  return NextResponse.json({ ok: true, kind, items, total: total ?? 0, page, pageSize, counts, stores });
}

export async function POST(req: Request) {
  const guard = await requirePermission(req, RESTORE_KEYS);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  const admin = guard.admin as AdminLike;

  const caller = await resolveCaller(admin, guard.user.id, guard.roleId, guard.permissions);
  if (!caller) return NextResponse.json({ ok: false, error: "No profile for this account." }, { status: 404 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const kind = body.kind;
  if (!isKind(kind)) return NextResponse.json({ ok: false, error: "Unknown record type." }, { status: 400 });
  const ids = Array.isArray(body.ids)
    ? Array.from(new Set((body.ids as unknown[]).filter((x): x is string => typeof x === "string" && !!x)))
    : [];
  if (!ids.length) return NextResponse.json({ ok: false, error: "Nothing selected." }, { status: 400 });
  if (ids.length > MAX_RESTORE) {
    return NextResponse.json({ ok: false, error: `Restore up to ${MAX_RESTORE} records at a time.` }, { status: 400 });
  }

  const meta = TRASH_KIND_META[kind];

  // Only rows that are in this caller's scope AND actually in the trash.
  let sq = admin.from(meta.table).select("id").in("id", ids);
  sq = scoped(sq, caller, null);
  const { data: eligible, error: selErr } = await sq;
  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  const eligibleIds = (eligible ?? []).map((r: any) => String(r.id));
  if (!eligibleIds.length) {
    return NextResponse.json({ ok: false, error: "Those records aren't in your Trash Bin." }, { status: 404 });
  }

  // updated_by records WHO restored (the audit trigger names them from it).
  const { data: restored, error: updErr } = await admin
    .from(meta.table)
    .update({ deleted_at: null, deleted_by: null, updated_by: caller.staffId })
    .in("id", eligibleIds)
    .select("id");
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  const restoredIds = (restored ?? []).map((r: any) => String(r.id));
  return NextResponse.json({
    ok: true,
    restored: restoredIds,
    skipped: ids.filter((id) => !restoredIds.includes(id)),
  });
}
