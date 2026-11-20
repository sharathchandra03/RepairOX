/* Data access for Field Engineer pay (salary, plans, trips, reviews, inputs). Shared by the CRM pay
   table and the Ninja "My earnings" page; RLS scopes it: a Ninja gets only their own rows, a manager
   with field_pay_view gets everyone in their stores. Math lives in field-incentives.ts. */
import { supabase } from "@/lib/supabase";
import { localDateKey } from "@/lib/work-session";
import { monthDays } from "@/lib/field-attendance";
import { haversineKm, type Adjustment, type DeviceListRow, type PayReview, type PayTrip, type PlanRow, type SalaryRow, type PayPlan } from "@/lib/field-incentives";

export const rowToPlan = (r: any): PlanRow => ({ id: r.id, staffId: r.staff_id ?? null, effectiveFrom: String(r.effective_from).slice(0, 10), config: (r.config ?? {}) as Partial<PayPlan>, note: r.note ?? null });
export const rowToSalary = (r: any): SalaryRow => ({ id: r.id, staffId: r.staff_id, effectiveFrom: String(r.effective_from).slice(0, 10), monthlySalary: Number(r.monthly_salary), note: r.note ?? null });
export const rowToDeviceList = (r: any): DeviceListRow => ({ id: r.id, kind: r.kind, pattern: r.pattern, validFrom: String(r.valid_from).slice(0, 10), validUntil: String(r.valid_until).slice(0, 10) });

export interface PayContext { plans: PlanRow[]; salaries: SalaryRow[]; deviceLists: DeviceListRow[] }
export async function fetchPayContext(): Promise<PayContext> {
  if (!supabase) return { plans: [], salaries: [], deviceLists: [] };
  const [p, s, d] = await Promise.all([
    supabase.from("field_incentive_plans").select("id,staff_id,effective_from,config,note").order("effective_from", { ascending: true }).limit(2000),
    supabase.from("field_pay_salary").select("id,staff_id,effective_from,monthly_salary,note").order("effective_from", { ascending: true }).limit(5000),
    supabase.from("field_incentive_device_lists").select("id,kind,pattern,valid_from,valid_until").limit(2000),
  ]);
  return { plans: (p.data ?? []).map(rowToPlan), salaries: (s.data ?? []).map(rowToSalary), deviceLists: (d.data ?? []).map(rowToDeviceList) };
}

export interface PayMonthData {
  trips: PayTrip[]; reviews: PayReview[];
  leads: Map<string, number>;                 // organic billed leads entered for the month, per Ninja
  adjustments: Map<string, (Adjustment & { id: string; createdAt: string })[]>;
}
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export async function fetchPayMonth(ym: string, tz: string): Promise<PayMonthData> {
  const empty: PayMonthData = { trips: [], reviews: [], leads: new Map(), adjustments: new Map() };
  if (!supabase) return empty;
  const days = monthDays(ym), from = days[0], to = days[days.length - 1];
  const lo = new Date(new Date(`${from}T00:00:00`).getTime() - 864e5).toISOString();
  const hi = new Date(new Date(`${to}T00:00:00`).getTime() + 2 * 864e5).toISOString();
  const [t, b, rv, inp, adj] = await Promise.all([
    supabase.from("field_trips").select("id,ninja_id,trip_type,completed_at,branch_id,dest_lat,dest_lng,ticket_id,job:field_jobs(device,devices)")
      .eq("status", "completed").not("ninja_id", "is", null).gte("completed_at", lo).lt("completed_at", hi).limit(20000),
    supabase.from("branches").select("id,latitude,longitude"),
    supabase.from("field_trip_reviews").select("trip_id,ninja_id,rating,channel,created_at").gte("created_at", lo).lt("created_at", hi).limit(20000),
    supabase.from("field_incentive_inputs").select("staff_id,value").eq("month", ym).eq("key", "organic_leads"),
    supabase.from("field_incentive_adjustments").select("id,staff_id,amount,reason,created_at").eq("month", ym).order("created_at", { ascending: true }),
  ]);
  const coords = new Map((b.data ?? []).map((x: any) => [x.id as string, x.latitude != null && x.longitude != null ? { lat: x.latitude as number, lng: x.longitude as number } : null]));
  const trips: PayTrip[] = (t.data ?? []).flatMap((r: any) => {
    const date = localDateKey(new Date(r.completed_at).getTime(), tz);
    if (date < from || date > to) return [];
    const job = (Array.isArray(r.job) ? r.job[0] : r.job) as { device?: string; devices?: { label?: string }[] | null } | null;
    const labels = (job?.devices ?? []).map((d) => d?.label).filter((x): x is string => !!x);
    if (!labels.length && job?.device) labels.push(job.device);
    const store = r.branch_id ? coords.get(r.branch_id) : null;
    const crowKm = store && r.dest_lat != null && r.dest_lng != null ? haversineKm(store, { lat: r.dest_lat, lng: r.dest_lng }) : null;
    const type = r.trip_type === "drop" ? "drop" : r.trip_type === "onsite" ? "onsite" : "pickup";
    return [{ id: r.id, staffId: r.ninja_id, date, type, crowKm, devices: labels } as PayTrip];
  });
  // verified review = 5 stars, from the customer (or a manager), on a trip that has a ticket
  const revRows = (rv.data ?? []) as { trip_id: string; ninja_id: string; rating: number; channel: string; created_at: string }[];
  const ticketOf = new Map<string, string | null>((t.data ?? []).map((r: any) => [r.id, r.ticket_id ?? null]));
  const missing = revRows.map((r) => r.trip_id).filter((id) => !ticketOf.has(id));
  for (const ids of chunk(missing, 200)) {
    const { data } = await supabase.from("field_trips").select("id,ticket_id").in("id", ids);
    for (const x of (data ?? []) as { id: string; ticket_id: string | null }[]) ticketOf.set(x.id, x.ticket_id);
  }
  const reviews: PayReview[] = revRows.map((r) => ({
    staffId: r.ninja_id, date: localDateKey(new Date(r.created_at).getTime(), tz), rating: r.rating,
    verified: r.rating === 5 && r.channel !== "ninja_app" && !!ticketOf.get(r.trip_id),
  })).filter((r) => r.date >= from && r.date <= to);
  const leads = new Map<string, number>(); for (const x of (inp.data ?? []) as any[]) leads.set(x.staff_id, Number(x.value));
  const adjustments = new Map<string, (Adjustment & { id: string; createdAt: string })[]>();
  for (const x of (adj.data ?? []) as any[]) { const a = adjustments.get(x.staff_id) ?? []; a.push({ id: x.id, amount: Number(x.amount), reason: x.reason, createdAt: x.created_at }); adjustments.set(x.staff_id, a); }
  return { trips, reviews, leads, adjustments };
}

/* ─── Month close (migration 0117) ─────────────────────────────────── */
export interface ClosedLine { staffId: string; total: number; summary: Record<string, any> }
export interface ClosedMonth { closedAt: string; closedBy: string | null; note: string | null; lines: Map<string, ClosedLine> }
/** The frozen payslips for a month, or null when it is still open. RLS: a Ninja gets only their own line. */
export async function fetchClosedMonth(ym: string): Promise<ClosedMonth | null> {
  if (!supabase) return null;
  const { data: head } = await supabase.from("field_payroll_months").select("month,note,closed_by,closed_at").eq("month", ym).maybeSingle();
  if (!head) return null;
  const { data } = await supabase.from("field_payroll_lines").select("staff_id,total,summary").eq("month", ym).limit(2000);
  return {
    closedAt: (head as any).closed_at, closedBy: (head as any).closed_by ?? null, note: (head as any).note ?? null,
    lines: new Map(((data ?? []) as any[]).map((l) => [l.staff_id as string, { staffId: l.staff_id, total: Number(l.total), summary: l.summary ?? {} }])),
  };
}
/** Adjustments added after the month was closed: paid on top of the frozen payslip. */
export const postCloseAdjustments = (adj: { amount: number; createdAt: string }[], closedAt: string) =>
  adj.filter((a) => new Date(a.createdAt).getTime() > new Date(closedAt).getTime()).reduce((t, a) => t + a.amount, 0);
