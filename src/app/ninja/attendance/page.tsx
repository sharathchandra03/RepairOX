"use client";
/* Ninja → My Attendance. Everything here is derived from what the Ninja already does in the app:
   punch in / out = their shift, km = odometer readings, fuel = km x the company rate,
   leave = requests a manager approves. Nothing is typed in a sheet. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarPlus, Fuel, Route, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/toaster";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreSettings } from "@/lib/store-settings";
import { localDateKey } from "@/lib/work-session";
import { formatClock } from "@/lib/time-format";
import { track } from "@/lib/ninja/activity";
import { fetchOwnRange, ymRange } from "@/lib/field-attendance-data";
import { DEFAULT_PLAN } from "@/lib/field-incentives";
import { buildNinjaMonth, casualBalance, festivalBalance, MARK_LABEL, STATUS_LABEL, type DayCell, type DayStatus, type Mark, type MarkKind } from "@/lib/field-attendance";
import { Btn, Card, FormLabel, Pill, SectionTitle, Sheet, Skeleton, inputCls } from "@/components/ninja/ui";
import type { Tone } from "@/lib/ninja/model";

const TONE: Record<DayStatus, Tone> = { present: "green", half_day: "amber", absent: "rose", week_off: "slate", casual_leave: "violet", festival_leave: "sky", requested: "amber", pending: "blue", future: "slate" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shiftYm = (ym: string, d: number) => { const [y, m] = ym.split("-").map(Number); const x = new Date(y, m - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
const dayLabel = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AttendancePage() {
  const { currentUser } = usePermissions();
  const { settings } = useStoreSettings();
  const tz = settings.timeZone;
  const staffId = currentUser?.id ?? "";
  const todayKey = localDateKey(Date.now(), tz);
  const [ym, setYm] = useState(todayKey.slice(0, 7));
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchOwnRange>> | null>(null);
  const [yearMarks, setYearMarks] = useState<Mark[]>([]);
  const [sheet, setSheet] = useState(false);

  const load = useCallback(async () => {
    if (!staffId) return;
    const r = ymRange(ym);
    const [d, y] = await Promise.all([
      fetchOwnRange(staffId, r.from, r.to),
      supabase ? supabase.from("field_attendance_marks").select("id,staff_id,day,kind,status,reason").eq("staff_id", staffId).gte("day", `${ym.slice(0, 4)}-01-01`).lte("day", `${ym.slice(0, 4)}-12-31`) : Promise.resolve({ data: [] as any[] }),
    ]);
    setData(d);
    setYearMarks((y.data ?? []).map((m: any) => ({ id: m.id, staffId: m.staff_id, day: String(m.day).slice(0, 10), kind: m.kind, status: m.status, reason: m.reason })));
  }, [staffId, ym]);
  useEffect(() => { setData(null); void load(); }, [load]);

  const month = useMemo(() => data && staffId ? buildNinjaMonth({
    staffId, ym, tz, nowMs: Date.now(), sessions: data.sessions, logs: data.logs, marks: data.marks,
    weeklyOff: data.weeklyOff.get(staffId) ?? null, policy: data.policy,
  }) : null, [data, staffId, ym, tz]);
  const fest = data ? festivalBalance(yearMarks, staffId, Number(ym.slice(0, 4)), data.policy) : null;
  const cas = data ? casualBalance(yearMarks, staffId, ym, data.policy) : null;
  const pending = yearMarks.filter((m) => m.status === "requested" && m.day >= todayKey).sort((a, b) => a.day.localeCompare(b.day));

  const rows: DayCell[] = useMemo(() => (month?.days ?? []).filter((d) => d.status !== "future" || d.markKind).slice().reverse(), [month]);
  const s = month?.summary;
  const tile = (label: string, value: string | number, sub?: string) => (
    <Card className="p-3.5"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-[24px] font-extrabold tabular-nums leading-none">{value}</p>{sub ? <p className="mt-1 text-[11.5px] font-medium text-slate-500">{sub}</p> : null}</Card>
  );
  async function cancel(id?: string) {
    if (!supabase || !id) return;
    const { error } = await supabase.from("field_attendance_marks").delete().eq("id", id);
    if (error) toast.error("Could not cancel the request."); else { toast.success("Request cancelled."); void load(); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setYm(shiftYm(ym, -1))} aria-label="Previous month" className="grid h-11 w-11 place-items-center rounded-2xl bg-white ring-1 ring-slate-200 active:scale-95"><ChevronLeft className="h-5 w-5" /></button>
        <h1 className="text-[18px] font-extrabold">{MONTHS[Number(ym.slice(5)) - 1]} {ym.slice(0, 4)}</h1>
        <button onClick={() => setYm(shiftYm(ym, 1))} disabled={ym >= todayKey.slice(0, 7)} aria-label="Next month" className="grid h-11 w-11 place-items-center rounded-2xl bg-white ring-1 ring-slate-200 active:scale-95 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
      </div>

      {!s || !data ? <Skeleton className="h-[220px] w-full" /> : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card className="col-span-2 flex items-center gap-4 bg-gradient-to-br from-[#2F46C4] to-[#4361EE] p-4 text-white">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15"><Route className="h-6 w-6" /></span>
              <div className="min-w-0 flex-1"><p className="text-[12px] font-bold uppercase tracking-wide text-white/70">Distance this month</p><p className="text-[28px] font-extrabold tabular-nums leading-tight">{s.totalKm.toLocaleString("en-IN")} km</p></div>
              <div className="text-right"><p className="flex items-center justify-end gap-1 text-[12px] font-bold uppercase tracking-wide text-white/70"><Fuel className="h-3.5 w-3.5" />Fuel</p><p className="text-[22px] font-extrabold tabular-nums">{rupees(s.fuel)}</p><p className="text-[11px] font-medium text-white/70">₹{data.policy.fuelRatePerKm} / km</p></div>
            </Card>
            {tile("Present", s.present, s.halfDay ? `+ ${s.halfDay} half day${s.halfDay > 1 ? "s" : ""}` : undefined)}
            {tile("Absent", s.absent)}
            {tile("Week off", s.weekOff)}
            {tile("Leave taken", s.casualLeave + s.festivalLeave, `${s.casualLeave} casual · ${s.festivalLeave} festival`)}
          </div>

          {s.missingReadings > 0 ? <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-900 ring-1 ring-amber-200">{s.missingReadings} working day{s.missingReadings > 1 ? "s have" : " has"} no odometer reading. Those days earn no fuel until your manager adds them.</p> : null}

          <SectionTitle action={<button onClick={() => setSheet(true)} className="flex items-center gap-1.5 rounded-full bg-[#4361EE] px-3.5 py-2 text-[12px] font-extrabold text-white active:scale-95"><CalendarPlus className="h-3.5 w-3.5" />Request leave</button>}>Leave balance</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3.5"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Festival leave</p><p className="mt-1 text-[22px] font-extrabold tabular-nums">{fest!.available}<span className="text-[13px] font-bold text-slate-400"> left of {fest!.applicable}</span></p><p className="text-[11.5px] font-medium text-slate-500">{fest!.taken} taken this year{fest!.requested ? ` · ${fest!.requested} pending` : ""}</p></Card>
            <Card className="p-3.5"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Casual leave</p><p className="mt-1 text-[22px] font-extrabold tabular-nums">{cas!.available}<span className="text-[13px] font-bold text-slate-400"> left of {cas!.applicable}</span></p><p className="text-[11.5px] font-medium text-slate-500">This month</p></Card>
          </div>
          {pending.length ? (
            <Card className="divide-y divide-slate-100">
              {pending.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1"><p className="text-[14px] font-extrabold">{MARK_LABEL[m.kind]} · {dayLabel(m.day)}</p><p className="text-[12px] font-medium text-amber-700">Waiting for your manager</p></div>
                  <button onClick={() => void cancel(m.id)} aria-label="Cancel request" className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600 active:scale-90"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </Card>
          ) : null}

          <SectionTitle>Day by day</SectionTitle>
          <Card className="divide-y divide-slate-100">
            {rows.length === 0 ? <p className="p-5 text-center text-[13px] text-slate-500">Nothing recorded yet this month.</p> : rows.map((d) => (
              <div key={d.date} className="flex items-center gap-3 px-4 py-3">
                <div className="w-[88px] shrink-0"><p className="text-[14px] font-extrabold">{dayLabel(d.date)}</p></div>
                <div className="min-w-0 flex-1">
                  <Pill tone={TONE[d.status]}>{STATUS_LABEL[d.status]}</Pill>
                  {d.punchIn ? <p className="mt-1 text-[12px] font-medium text-slate-500">{formatClock(d.punchIn, { timeZone: tz })} – {d.punchOut ? formatClock(d.punchOut, { timeZone: tz }) : "on duty"}</p> : null}
                </div>
                <div className="text-right">
                  {d.km != null ? <p className="text-[14px] font-extrabold tabular-nums">{d.km} km</p> : d.missingReading ? <p className="text-[12px] font-bold text-amber-700">No reading</p> : null}
                  {d.km != null ? <p className="text-[11px] font-medium text-slate-500">{rupees(d.km * data.policy.fuelRatePerKm)}</p> : null}
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
      <LeaveSheet open={sheet} onClose={() => setSheet(false)} todayKey={todayKey} taken={new Set(yearMarks.filter((m) => m.status !== "rejected").map((m) => m.day))}
        festLeft={fest?.available ?? 0} casLeft={cas?.available ?? 0} onDone={() => { setSheet(false); void load(); }} staffId={staffId} />
    </div>
  );
}

function LeaveSheet({ open, onClose, todayKey, taken, festLeft, casLeft, onDone, staffId }: {
  open: boolean; onClose: () => void; todayKey: string; taken: Set<string>; festLeft: number; casLeft: number; onDone: () => void; staffId: string;
}) {
  const [kind, setKind] = useState<MarkKind>("casual_leave");
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setKind("casual_leave"); setDay(""); setReason(""); } }, [open]);
  const days = useMemo(() => {
    const [y, m, d] = todayKey.split("-").map(Number);
    return Array.from({ length: 21 }, (_, i) => { const x = new Date(y, m - 1, d + i); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; });
  }, [todayKey]);
  const left = kind === "festival_leave" ? festLeft : casLeft;
  async function submit() {
    if (!supabase || !day) return;
    setBusy(true);
    const { error } = await supabase.from("field_attendance_marks").insert({ staff_id: staffId, day, kind, reason: reason.trim() || null });
    setBusy(false);
    if (error) { toast.error(error.code === "23505" ? "You already have a mark on that day." : "Could not send the request."); return; }
    track({ kind: "leave_requested", screen: "attendance", payload: { day, kind } });
    toast.success("Leave requested. Your manager will approve it.");
    onDone();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Request leave" footer={<Btn className="w-full" disabled={!day} loading={busy} onClick={submit}>Send request</Btn>}>
      <FormLabel>Type</FormLabel>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {([["casual_leave", "Casual leave"], ["festival_leave", "Festival leave"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={`min-h-[52px] rounded-2xl text-[14px] font-extrabold ring-1 ring-inset ${kind === k ? "bg-[#4361EE] text-white ring-[#4361EE]" : "bg-white text-slate-700 ring-slate-300"}`}>{l}</button>
        ))}
      </div>
      <p className={`mt-2 text-[12.5px] font-semibold ${left > 0 ? "text-slate-500" : "text-amber-700"}`}>{left > 0 ? `${left} left` : "No balance left — your manager can still approve it."}</p>
      <div className="mt-4"><FormLabel>Day</FormLabel></div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {days.map((d, i) => (
          <button key={d} disabled={taken.has(d)} onClick={() => setDay(d)}
            className={`min-h-[56px] rounded-2xl px-1 text-center ring-1 ring-inset disabled:opacity-35 ${day === d ? "bg-[#4361EE] text-white ring-[#4361EE]" : "bg-white text-slate-700 ring-slate-300"}`}>
            <span className="block text-[10.5px] font-bold uppercase opacity-70">{i === 0 ? "Today" : i === 1 ? "Tmrw" : new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })}</span>
            <span className="block text-[15px] font-extrabold tabular-nums">{Number(d.slice(8))}</span>
          </button>
        ))}
      </div>
      {kind === "casual_leave" && day && days.indexOf(day) < DEFAULT_PLAN.casualNoticeDays ? (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900">Casual leave needs {DEFAULT_PLAN.casualNoticeDays} days' notice. Your manager may decline this one.</p>
      ) : null}
      <div className="mt-4"><FormLabel>Reason (optional)</FormLabel></div>
      <input className={`${inputCls} mt-2`} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family function" />
    </Sheet>
  );
}
