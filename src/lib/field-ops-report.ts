/* Field Operations report engine (pure, tested: field-ops-report.test.ts).
   Inputs are RLS-scoped rows already loaded by the page. Every number is derived
   from real trip / assignment / event rows; missing timestamps are EXCLUDED from
   durations (never treated as zero). Revenue = finalized (paid, non-proforma)
   invoices only and stays separate from trip counts. */

export interface RTrip {
  id: string; job_id: string; trip_type: string; status: string; ninja_id: string | null; branch_id: string | null;
  assigned_at: string | null; accepted_at: string | null; journey_started_at: string | null; arrived_at: string | null;
  completed_at: string | null; created_at: string;
}
export interface RAssignment { trip_id: string; ninja_id: string; outcome: string; assigned_at: string; responded_at: string | null }
export interface REvent { trip_id: string; new_status: string | null; occurred_at: string }
export interface RJob { id: string; branch_id: string | null; linked_ticket_id: string | null }
export interface RInvoice { id: string; ticketId?: string; total: number; status: string; documentType?: string }

export const FAILED = ["failed_attempt", "customer_unavailable"];
const DONE = ["completed"];
const OPEN_EXCL = ["completed", "cancelled", "rescheduled", "failed_attempt", "customer_unavailable", "return_to_store"];

const ms = (a: string | null | undefined, b: string | null | undefined): number | null => {
  if (!a || !b) return null;
  const d = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(d) && d >= 0 ? d : null;
};
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export const isFinalized = (inv: RInvoice) => (inv.documentType ?? "invoice") !== "proforma" && inv.status === "paid";

export interface NinjaRow {
  ninjaId: string; assignments: number; accepted: number; rejected: number; completed: number;
  pickups: number; drops: number; onsite: number; failed: number; reassigned: number;
  completionRate: number; medianAcceptMs: number | null; medianTripMs: number | null;
}
export function ninjaRows(trips: RTrip[], asg: RAssignment[]): NinjaRow[] {
  const ids = new Set<string>([...asg.map((a) => a.ninja_id), ...trips.filter((t) => t.ninja_id).map((t) => t.ninja_id!)]);
  return [...ids].map((id) => {
    const a = asg.filter((x) => x.ninja_id === id);
    const mine = trips.filter((t) => t.ninja_id === id);
    const done = mine.filter((t) => DONE.includes(t.status));
    const acceptMs = a.filter((x) => x.outcome === "accepted").map((x) => ms(x.assigned_at, x.responded_at)).filter((v): v is number => v != null);
    const tripMs = done.map((t) => ms(t.journey_started_at ?? t.accepted_at, t.completed_at)).filter((v): v is number => v != null);
    const decided = a.filter((x) => x.outcome === "accepted" || x.outcome === "rejected").length;
    return {
      ninjaId: id,
      assignments: a.length,
      accepted: a.filter((x) => x.outcome === "accepted").length,
      rejected: a.filter((x) => x.outcome === "rejected").length,
      reassigned: a.filter((x) => x.outcome === "reassigned").length,
      completed: done.length,
      pickups: done.filter((t) => t.trip_type === "pickup" || t.trip_type === "warranty_pickup").length,
      drops: done.filter((t) => t.trip_type === "drop").length,
      onsite: done.filter((t) => t.trip_type === "onsite").length,
      failed: mine.filter((t) => FAILED.includes(t.status)).length,
      completionRate: decided ? done.length / Math.max(1, a.filter((x) => x.outcome === "accepted").length) : 0,
      medianAcceptMs: median(acceptMs),
      medianTripMs: median(tripMs),
    };
  }).sort((x, y) => y.completed - x.completed || y.assignments - x.assignments);
}

export interface StoreRow { branchId: string | null; total: number; pickup: number; drop: number; onsite: number; completed: number; failed: number; active: number; pending: number; business: number; invoices: number }
export function storeRows(trips: RTrip[], jobs: RJob[], invoices: RInvoice[]): StoreRow[] {
  const by = new Map<string | null, StoreRow>();
  const row = (b: string | null) => by.get(b) ?? by.set(b, { branchId: b, total: 0, pickup: 0, drop: 0, onsite: 0, completed: 0, failed: 0, active: 0, pending: 0, business: 0, invoices: 0 }).get(b)!;
  for (const t of trips) {
    const r = row(t.branch_id);
    r.total++;
    if (t.trip_type === "drop") r.drop++; else if (t.trip_type === "onsite") r.onsite++; else r.pickup++;
    if (DONE.includes(t.status)) r.completed++;
    if (FAILED.includes(t.status)) r.failed++;
    if (t.status === "awaiting_assignment") r.pending++;
    else if (!OPEN_EXCL.includes(t.status) && t.status !== "assigned") r.active++;
  }
  // Business: each JOB counted once, finalized invoice on its linked ticket.
  const jobIds = new Set(trips.map((t) => t.job_id));
  for (const j of jobs.filter((x) => jobIds.has(x.id) && x.linked_ticket_id)) {
    const inv = invoices.filter((i) => i.ticketId === j.linked_ticket_id && isFinalized(i));
    if (!inv.length) continue;
    const r = row(j.branch_id);
    r.business += inv.reduce((s, i) => s + (Number(i.total) || 0), 0);
    r.invoices += inv.length;
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}

export interface Turnaround { key: string; label: string; medianMs: number | null; samples: number }
/** Median durations between real milestones. Only trips that reached BOTH points count. */
export function turnaround(trips: RTrip[], events: REvent[]): Turnaround[] {
  const first = new Map<string, Map<string, string>>();
  for (const e of [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))) {
    if (!e.new_status) continue;
    const m = first.get(e.trip_id) ?? first.set(e.trip_id, new Map()).get(e.trip_id)!;
    if (!m.has(e.new_status)) m.set(e.new_status, e.occurred_at);
  }
  const at = (t: RTrip, s: string) => first.get(t.id)?.get(s) ?? null;
  const pick = (types: string[]) => trips.filter((t) => types.includes(t.trip_type));
  const P = pick(["pickup", "warranty_pickup"]), D = pick(["drop"]), ALL = trips;
  const spec: [string, string, RTrip[], (t: RTrip) => string | null, (t: RTrip) => string | null][] = [
    ["create_assign", "Created → Ninja assigned", ALL, (t) => t.created_at, (t) => at(t, "assigned")],
    ["assign_accept", "Assigned → accepted", ALL, (t) => at(t, "assigned"), (t) => at(t, "accepted")],
    ["accept_start", "Accepted → journey started", [...P, ...pick(["onsite"])], (t) => at(t, "accepted"), (t) => at(t, "en_route_customer")],
    ["to_customer", "Journey → arrived at customer", [...P, ...pick(["onsite"])], (t) => at(t, "en_route_customer"), (t) => at(t, "arrived_customer")],
    ["pickup_dur", "Pickup at customer", P, (t) => at(t, "arrived_customer"), (t) => at(t, "device_collected")],
    ["to_store", "Collected → arrived at store", P, (t) => at(t, "device_collected"), (t) => at(t, "arrived_store")],
    ["handover", "Store handover delay", P, (t) => at(t, "handover_pending"), (t) => at(t, "store_received")],
    ["drop_release", "Drop: at store → device released", D, (t) => at(t, "arrived_store"), (t) => at(t, "store_dispatch_confirmed")],
    ["to_delivery", "Out for delivery → delivered", D, (t) => at(t, "en_route_customer"), (t) => at(t, "delivered")],
    ["onsite_dur", "On-site service duration", pick(["onsite"]), (t) => at(t, "service_in_progress"), (t) => at(t, "service_completed") ?? at(t, "service_not_completed")],
  ];
  return spec.map(([key, label, set, a, b]) => {
    const xs = set.map((t) => ms(a(t), b(t))).filter((v): v is number => v != null);
    return { key, label, medianMs: median(xs), samples: xs.length };
  });
}

/** Repair turnaround per JOB: pickup store_received → drop trip created (ready for drop). */
export function repairTurnaround(trips: RTrip[], events: REvent[]): Turnaround {
  const recv = new Map<string, string>();
  for (const e of events) if (e.new_status === "store_received") {
    const t = trips.find((x) => x.id === e.trip_id);
    if (t && (!recv.has(t.job_id) || e.occurred_at < recv.get(t.job_id)!)) recv.set(t.job_id, e.occurred_at);
  }
  const xs: number[] = [];
  for (const d of trips.filter((t) => t.trip_type === "drop")) { const v = ms(recv.get(d.job_id), d.created_at); if (v != null) xs.push(v); }
  return { key: "repair", label: "Store received → ready for drop", medianMs: median(xs), samples: xs.length };
}

export function fmtDur(v: number | null): string {
  if (v == null) return "—";
  const m = Math.round(v / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.round(h / 24)} days`;
}
