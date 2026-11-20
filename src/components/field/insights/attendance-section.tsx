"use client";
/* ──────────────────────────────────────────────────────────────────────────
   Attendance dialogs shared by Field Activity: the day detail (punch times, odometer + photos, GPS check,
   mark leave / decide a request, correct a reading with a reason) and the attendance & fuel rules.
   The pages themselves live in components/field/activity/*.
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect, useState } from "react";
import { CalendarCheck2, Settings2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { toast } from "@/components/ui/toaster";
import { supabase } from "@/lib/supabase";
import { formatClock } from "@/lib/time-format";
import { formatHm } from "@/lib/work-session";
import { cn } from "@/lib/utils";
import type { RosterNinja } from "@/lib/field-attendance-data";
import { MARK_LABEL, STATUS_LABEL, KM_CHECK_LABEL, type DayCell, type DayStatus, type Mark, type MarkKind, type Policy } from "@/lib/field-attendance";
export const CHIP: Record<DayStatus, { t: string; c: string }> = {
  present: { t: "P", c: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  half_day: { t: "½", c: "bg-amber-50 text-amber-700 ring-amber-200" },
  absent: { t: "A", c: "bg-rose-50 text-rose-700 ring-rose-200" },
  week_off: { t: "WO", c: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  casual_leave: { t: "CL", c: "bg-violet-50 text-violet-700 ring-violet-200" },
  festival_leave: { t: "FL", c: "bg-sky-50 text-sky-700 ring-sky-200" },
  requested: { t: "R", c: "bg-amber-100 text-amber-800 ring-amber-300" },
  pending: { t: "·", c: "bg-blue-50 text-blue-600 ring-blue-200" },
  future: { t: "", c: "text-zinc-300 ring-transparent" },
};
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dayLabel = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };


export function DayDialog({ ninja, cell, tz, policy, canManage, mark, onClose, onMark, onDecide, onSaved }: {
  ninja: RosterNinja; cell: DayCell; tz: string; policy: Policy; canManage: boolean; mark?: Mark; onClose: () => void;
  onMark: (k: MarkKind | null, existing?: Mark) => void; onDecide: (m: Mark, approve: boolean) => void; onSaved: () => void;
}) {
  const [start, setStart] = useState(cell.startReading != null ? String(cell.startReading) : "");
  const [end, setEnd] = useState(cell.endReading != null ? String(cell.endReading) : "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const km = start && end ? Number(end) - Number(start) : null;
  async function saveReading() {
    if (!supabase) return;
    const s = Number(start), e = end === "" ? null : Number(end);
    if (!Number.isInteger(s) || s < 0 || (e != null && (!Number.isInteger(e) || e < s))) { toast.error("Enter valid readings (end cannot be below start)."); return; }
    if (!reason.trim()) { toast.error("A reason is required for a correction."); return; }
    setBusy(true);
    const body = { start_reading: s, end_reading: e, correction_reason: reason.trim() };
    const { error } = cell.startReading != null
      ? await supabase.from("ninja_day_logs").update(body).eq("staff_id", ninja.id).eq("day", cell.date)
      : await supabase.from("ninja_day_logs").insert({ staff_id: ninja.id, day: cell.date, ...body });
    setBusy(false);
    if (error) toast.error("Could not save the reading."); else { toast.success("Reading saved."); onSaved(); }
  }
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 py-1.5 text-[13.5px]"><span className="text-muted-foreground">{k}</span><span className="font-semibold">{v}</span></div>;
  return (
    <RoxCenteredForm open onClose={onClose} width="max-w-md" icon={CalendarCheck2} title={`${ninja.name} · ${dayLabel(cell.date)}`} subtitle={STATUS_LABEL[cell.status]}
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="divide-y divide-border">
        {row("Punch in", cell.punchIn ? formatClock(cell.punchIn, { timeZone: tz }) : "—")}
        {row("Punch out", cell.punchOut ? formatClock(cell.punchOut, { timeZone: tz }) : cell.punchIn ? "On duty" : "—")}
        {row("Time worked", cell.netMs ? `${formatHm(cell.netMs)}${cell.estimated ? " (estimated)" : ""}` : "—")}
        {row("Odometer", cell.startReading != null ? `${cell.startReading} → ${cell.endReading ?? "…"}` : "No reading")}
        {row("Distance · fuel", cell.km != null ? `${cell.km} km · ${inr(cell.km * policy.fuelRatePerKm)}` : "—")}
        {row("GPS-tracked", cell.gpsKm != null ? `${cell.gpsKm} km` : "Not tracked")}
        {cell.workedOnOff && row("Note", "Worked on a planned leave day")}
      </div>
      {cell.kmCheck && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-[12.5px] font-semibold text-rose-800">{KM_CHECK_LABEL[cell.kmCheck]} GPS only covers the time between accepting a job and handover, so it is normally lower than the odometer.</p>}
      <Photos start={cell.startPhoto} end={cell.endPhoto} required={policy.odometerPhotoRequired} hasLog={cell.startReading != null} />
      {canManage && (
        <div className="mt-5 space-y-5">
          {mark?.status === "requested" && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3">
              <p className="flex-1 text-[13px] font-semibold text-amber-900">{MARK_LABEL[mark.kind]} requested{mark.reason ? ` — ${mark.reason}` : ""}</p>
              <Button size="sm" onClick={() => onDecide(mark, true)}>Approve</Button><Button size="sm" variant="outline" onClick={() => onDecide(mark, false)}>Reject</Button>
            </div>
          )}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Mark this day</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(MARK_LABEL) as MarkKind[]).map((k) => (
                <Button key={k} size="sm" variant={mark?.status === "approved" && mark.kind === k ? "primary" : "outline"} onClick={() => onMark(k, mark)}>{MARK_LABEL[k]}</Button>
              ))}
              {mark && <Button size="sm" variant="outline" className="gap-1" onClick={() => onMark(null, mark)}><X className="h-3.5 w-3.5" />Clear</Button>}
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">If the Ninja has a shift that day they still count as Present.</p>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Correct odometer reading</p>
            <div className="grid grid-cols-2 gap-3">
              <Input inputMode="numeric" placeholder="Start" value={start} onChange={(e) => setStart(e.target.value.replace(/\D/g, ""))} />
              <Input inputMode="numeric" placeholder="End" value={end} onChange={(e) => setEnd(e.target.value.replace(/\D/g, ""))} />
            </div>
            <Input className="mt-3" placeholder="Reason for the correction (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="mt-3 flex items-center gap-3"><Button size="sm" disabled={busy || !start} onClick={() => void saveReading()}>Save reading</Button>{km != null && km >= 0 && <span className="text-[12.5px] font-semibold text-muted-foreground">{km} km</span>}</div>
          </div>
        </div>
      )}
    </RoxCenteredForm>
  );
}

export function PolicyDialog({ policy, onClose, onSaved }: { policy: Policy; onClose: () => void; onSaved: () => void }) {
  const [photo, setPhoto] = useState(policy.odometerPhotoRequired);
  const [v, setV] = useState({ fuel: String(policy.fuelRatePerKm), fest: String(policy.festivalLeavePerYear), cas: String(policy.casualLeavePerMonth), wo: String(policy.weekOffPerMonth), half: String(policy.halfDayHours) });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!supabase) return;
    setBusy(true);
    const { data: auth } = await supabase.from("field_policy").select("organization_id").maybeSingle();
    const row = { fuel_rate_per_km: Number(v.fuel), festival_leave_per_year: Number(v.fest), casual_leave_per_month: Number(v.cas), week_off_per_month: Number(v.wo), half_day_hours: Number(v.half), odometer_photo_required: photo };
    const { error } = auth ? await supabase.from("field_policy").update(row).eq("organization_id", auth.organization_id) : await supabase.from("field_policy").insert(row);
    setBusy(false);
    if (error) toast.error("Could not save. Check the numbers."); else { toast.success("Rules saved."); onSaved(); }
  }
  const f = (label: string, k: keyof typeof v, hint: string) => (
    <label className="block"><span className="mb-1 flex items-center gap-1 text-[12px] font-semibold">{label}<InfoHint content={hint} /></span>
      <Input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^\d.]/g, "") })} /></label>
  );
  return (
    <RoxCenteredForm open onClose={onClose} width="max-w-md" icon={Settings2} title="Attendance & fuel rules" subtitle="Applies to every Ninja"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={() => void save()}>Save rules</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        {f("Fuel rate (₹ per km)", "fuel", "Fuel amount = distance × this rate. Your sheet used 3.5.")}
        {f("Festival leave per year", "fest", "Shown as Applicable / Taken / Available.")}
        {f("Casual leave per month", "cas", "Used to show the balance on a leave request.")}
        {f("Week offs per month", "wo", "Reference only; weekly off days are set per Ninja.")}
        {f("Half day below (hours)", "half", "A shift shorter than this counts as a Half Day.")}
      </div>
      <label className="mt-5 flex items-start gap-3 rounded-xl border border-border p-3">
        <input type="checkbox" className="mt-1 h-4 w-4" checked={photo} onChange={(e) => setPhoto(e.target.checked)} />
        <span><span className="block text-[13px] font-semibold">Odometer photo is required</span><span className="block text-[12px] text-muted-foreground">The Ninja must take a photo of the meter with every start and end reading.</span></span>
      </label>
    </RoxCenteredForm>
  );
}

/** Start / end odometer photos (private bucket, short-lived signed links). */
function Photos({ start, end, required, hasLog }: { start: string | null; end: string | null; required: boolean; hasLog: boolean }) {
  const [urls, setUrls] = useState<{ start?: string; end?: string }>({});
  useEffect(() => {
    if (!supabase) return;
    let off = false;
    (async () => {
      const out: { start?: string; end?: string } = {};
      for (const [k, p] of [["start", start], ["end", end]] as const) {
        if (!p) continue;
        const { data } = await supabase!.storage.from("ninja-odometer").createSignedUrl(p, 600);
        if (data?.signedUrl) out[k] = data.signedUrl;
      }
      if (!off) setUrls(out);
    })();
    return () => { off = true; };
  }, [start, end]);
  if (!hasLog) return null;
  const tile = (label: string, url?: string, path?: string | null) => (
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${label} odometer`} className="h-32 w-full object-cover" />
        </a>
      ) : <div className={cn("grid h-32 place-items-center rounded-xl border border-dashed text-[12px] font-semibold", path ? "text-muted-foreground" : required ? "border-amber-300 bg-amber-50 text-amber-800" : "text-muted-foreground")}>{path ? "Loading…" : "No photo"}</div>}
    </div>
  );
  return <div className="mt-4 grid grid-cols-2 gap-3">{tile("Start meter", urls.start, start)}{tile("End meter", urls.end, end)}</div>;
}
