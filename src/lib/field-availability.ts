/* RepairOX — Ninja availability vocabulary for the assigning Field Manager.
   Built from the DB function field_ninja_availability (duty from the shared Work
   Session + open trips). Plain words, one glance: who should I assign? */
export interface NinjaAvailabilityRow { staff_id: string; duty: "on_duty" | "on_break" | "off_duty"; last_seen_at: string | null; open_trips: number; moving: number; on_job: number; waiting: number }
export type AvailTone = "green" | "sky" | "violet" | "amber" | "slate";
export interface AvailabilityInfo { label: string; detail: string; tone: AvailTone; /** 0 = best to assign */ rank: number }

export function describeAvailability(a: NinjaAvailabilityRow | undefined | null): AvailabilityInfo | null {
  if (!a) return null;
  if (a.duty === "off_duty") return { label: "Off duty", detail: "Not logged in to a work shift", tone: "slate", rank: 5 };
  if (a.duty === "on_break") return { label: "On break", detail: "On duty but on a break right now", tone: "amber", rank: 4 };
  if (a.moving > 0) return { label: "In trip", detail: `Travelling now${a.open_trips > 1 ? ` · ${a.open_trips} open trips` : ""}`, tone: "violet", rank: 3 };
  if (a.on_job > 0) return { label: "On a job", detail: `At a customer / store now${a.open_trips > 1 ? ` · ${a.open_trips} open trips` : ""}`, tone: "violet", rank: 2 };
  if (a.open_trips > 0) return { label: `Available · ${a.open_trips} booked`, detail: `${a.open_trips} trip${a.open_trips > 1 ? "s" : ""} accepted or waiting, not started yet`, tone: "sky", rank: 1 };
  return { label: "Available", detail: "On duty with no open trips", tone: "green", rank: 0 };
}
export const AVAIL_CHIP: Record<AvailTone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  slate: "bg-slate-100 text-slate-500 ring-slate-200",
};
export const AVAIL_DOT: Record<AvailTone, string> = { green: "bg-emerald-500", sky: "bg-sky-500", violet: "bg-violet-500", amber: "bg-amber-500", slate: "bg-slate-400" };
