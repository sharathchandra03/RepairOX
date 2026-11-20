/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field Activity: the "Team today" cards and the "Needs attention" inbox (pure, tested).
   Everything is derived from the attendance / pay engines; nothing is stored here.
   ────────────────────────────────────────────────────────────────────────── */
import { MARK_LABEL, type DayCell, type Mark, type NinjaMonth } from "@/lib/field-attendance";
import { KM_CHECK_LABEL } from "@/lib/field-attendance";

export type Tone = "green" | "slate" | "amber" | "violet" | "rose" | "sky";
export interface TodayState { label: string; tone: Tone }
/** Where a Ninja stands right now, from today's cell. */
export function todayState(cell: DayCell | undefined): TodayState {
  if (!cell) return { label: "—", tone: "slate" };
  switch (cell.status) {
    case "present": return cell.punchIn && cell.punchOut == null ? { label: "On duty", tone: "green" } : { label: "Shift ended", tone: "sky" };
    case "half_day": return { label: "Half day", tone: "amber" };
    case "pending": return { label: "Not started", tone: "slate" };
    case "week_off": return { label: "Week off", tone: "slate" };
    case "casual_leave": case "festival_leave": return { label: "On leave", tone: "violet" };
    case "requested": return { label: "Leave requested", tone: "amber" };
    case "absent": return { label: "Absent", tone: "rose" };
    default: return { label: "—", tone: "slate" };
  }
}

/** Trips the Ninja is heading for by month end at the current rate. */
export const projectedTrips = (trips: number, elapsedDays: number, daysInMonth: number): number =>
  elapsedDays <= 0 ? 0 : Math.round((trips / elapsedDays) * daysInMonth);
/** Behind pace = a running month, a week or more in, and the current rate would miss the monthly target. */
export function isBehindPace(p: { trips: number; gate: number; elapsedDays: number; daysInMonth: number; running: boolean }): boolean {
  if (!p.running || p.gate <= 0 || p.elapsedDays < 7 || p.trips >= p.gate) return false;
  return projectedTrips(p.trips, p.elapsedDays, p.daysInMonth) < p.gate;
}

export type AttentionKind = "leave_request" | "no_shift" | "missing_reading" | "missing_photo" | "gps_check" | "behind_pace" | "close_month";
export interface AttentionItem { id: string; kind: AttentionKind; severity: 1 | 2 | 3; staffId: string; name: string; text: string; day?: string; href: string; pay?: boolean }
export interface AttentionInput {
  staffId: string; name: string; month: NinjaMonth; trips: number; gate: number; casualNoticeDays: number;
  requests: Mark[];
}
const dayShort = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }); };
export function buildAttention(inputs: AttentionInput[], o: { today: string; ym: string; hourNow: number; running: boolean; elapsedDays: number; daysInMonth: number }): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const i of inputs) {
    const profile = `/field/activity/${i.staffId}`;
    for (const m of i.requests) {
      const ahead = m.requestedAt ? Math.round((new Date(`${m.day}T00:00:00`).getTime() - new Date(`${m.requestedAt.slice(0, 10)}T00:00:00`).getTime()) / 864e5) : null;
      const short = m.kind === "casual_leave" && ahead != null && ahead < i.casualNoticeDays;
      const soon = Math.round((new Date(`${m.day}T00:00:00`).getTime() - new Date(`${o.today}T00:00:00`).getTime()) / 864e5) <= 2;
      out.push({ id: `lr-${m.id ?? m.day}-${i.staffId}`, kind: "leave_request", severity: soon || short ? 2 : 3, staffId: i.staffId, name: i.name, day: m.day,
        text: `${MARK_LABEL[m.kind]} requested for ${dayShort(m.day)}${short ? ` — short notice (${Math.max(0, ahead!)} day${ahead === 1 ? "" : "s"})` : ""}`, href: "/field/activity/attendance" });
    }
    const today = i.month.days.find((d) => d.date === o.today);
    if (o.running && today?.status === "pending" && o.hourNow >= 12)
      out.push({ id: `ns-${i.staffId}`, kind: "no_shift", severity: 2, staffId: i.staffId, name: i.name, day: o.today, text: "Has not started the shift today", href: profile });
    const sm = i.month.summary;
    if (sm.kmChecks > 0) {
      const d = i.month.days.find((x) => x.kmCheck);
      out.push({ id: `gps-${i.staffId}`, kind: "gps_check", severity: 1, staffId: i.staffId, name: i.name, day: d?.date,
        text: `${sm.kmChecks} day${sm.kmChecks === 1 ? "" : "s"} where the odometer and GPS disagree${d?.kmCheck ? ` — e.g. ${dayShort(d.date)}: ${KM_CHECK_LABEL[d.kmCheck].split(" — ")[0].toLowerCase()}` : ""}`, href: "/field/activity/distance" });
    }
    if (sm.missingReadings > 0) {
      const d = i.month.days.find((x) => x.missingReading);
      out.push({ id: `mr-${i.staffId}`, kind: "missing_reading", severity: 2, staffId: i.staffId, name: i.name, day: d?.date, text: `${sm.missingReadings} working day${sm.missingReadings === 1 ? "" : "s"} without an odometer reading (fuel is not paid for them)`, href: "/field/activity/distance" });
    }
    if (sm.missingPhotos > 0)
      out.push({ id: `mp-${i.staffId}`, kind: "missing_photo", severity: 3, staffId: i.staffId, name: i.name, text: `${sm.missingPhotos} reading${sm.missingPhotos === 1 ? "" : "s"} without an odometer photo`, href: "/field/activity/distance" });
    if (isBehindPace({ trips: i.trips, gate: i.gate, elapsedDays: o.elapsedDays, daysInMonth: o.daysInMonth, running: o.running }))
      out.push({ id: `bp-${i.staffId}`, kind: "behind_pace", severity: 2, staffId: i.staffId, name: i.name, text: `On pace for about ${projectedTrips(i.trips, o.elapsedDays, o.daysInMonth)} trips; the monthly target is ${i.gate}`, href: profile });
  }
  return out.sort((a, b) => a.severity - b.severity || a.name.localeCompare(b.name));
}
export const SEVERITY_LABEL: Record<1 | 2 | 3, string> = { 1: "Check now", 2: "Soon", 3: "When you can" };
