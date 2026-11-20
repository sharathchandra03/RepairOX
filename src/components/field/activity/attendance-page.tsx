"use client";
/* Field Activity → Attendance. Four views over the same month, one table at a time:
   Summary (counts + weekly off) · Day by day (calendar grid) · Leave requests (approve / reject) · Festival leave.
   Source: shifts (punch in/out), approved leave marks, weekly off — lib/field-attendance.ts. */
import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck2, CheckCircle2, ClipboardList, Settings2, UserX, XCircle } from "lucide-react";
import { useActivity, useRegisterSheets } from "@/components/field/activity/activity-shell";
import { useAttendance } from "@/components/field/activity/use-attendance";
import { C, DataTable, Dash, FootName, KpiStrip, LoadError, Unavailable, ViewBar, usePaged } from "@/components/field/activity/kit";
import { CHIP, DayDialog, PolicyDialog } from "@/components/field/insights/attendance-section";
import { NameCell } from "@/components/field/dashboard/dashboard-table";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { formatClock } from "@/lib/time-format";
import { formatHm, localDateKey } from "@/lib/work-session";
import { cn } from "@/lib/utils";
import { casualBalance, festivalBalance, MARK_LABEL, STATUS_LABEL, type DayCell, type DayStatus, type Mark } from "@/lib/field-attendance";
import { DEFAULT_PLAN, planFor } from "@/lib/field-incentives";
import type { RosterNinja } from "@/lib/field-attendance-data";

type View = "summary" | "grid" | "requests" | "festival";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayLabel = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }); };
const FZ = { ["--rox-frozen-offset" as string]: "0px" } as React.CSSProperties;

export function AttendancePage() {
  const a = useActivity();
  const { can } = usePermissions();
  const canManage = allow(can, CAP.field.edit);
  const att = useAttendance(a.ym, a.tz, a.storeSel, a.multiStore, a.q);
  const { months, policy, requests, yearMarks, year, loading, err, nameOf } = att;
  const [view, setView] = useState<View>("summary");
  const [open, setOpen] = useState<{ ninja: RosterNinja; cell: DayCell } | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const days = months[0]?.m.days ?? [];
  const sum = (k: "present" | "absent" | "weekOff" | "casualLeave" | "festivalLeave" | "halfDay") => months.reduce((t, x) => t + x.m.summary[k], 0);
  const today = localDateKey(Date.now(), a.tz);
  const onLeaveToday = months.filter(({ m }) => ["casual_leave", "festival_leave"].includes(m.days.find((d) => d.date === today)?.status ?? "")).length;
  const key = `${view}|${a.ym}|${a.q}|${a.storeSel.join(",")}`;
  const pagedNinjas = usePaged(months, key);
  const pagedReq = usePaged(requests, key);

  useRegisterSheets(useMemo(() => loading ? null : [
    { name: "Attendance summary", headers: ["Ninja", "Present", "Absent", "Week Off", "Casual Leave", "Festival Leave", "Half Day"], rows: months.map(({ n, m }) => [n.name, m.summary.present, m.summary.absent, m.summary.weekOff, m.summary.casualLeave, m.summary.festivalLeave, m.summary.halfDay]) },
    { name: "Attendance grid", headers: ["Ninja", "Detail", ...days.map((d) => `${Number(d.date.slice(8))} ${MONTHS[Number(d.date.slice(5, 7)) - 1]}`)],
      rows: months.flatMap(({ n, m }) => [
        [n.name, "Availability", ...m.days.map((d) => (d.status === "future" ? "" : STATUS_LABEL[d.status]))],
        [n.name, "Punch-in", ...m.days.map((d) => (d.punchIn ? formatClock(d.punchIn, { timeZone: a.tz }) : ""))],
        [n.name, "Punch-out", ...m.days.map((d) => (d.punchOut ? formatClock(d.punchOut, { timeZone: a.tz }) : ""))],
      ]) },
    { name: "Leave requests", headers: ["Ninja", "Type", "Day", "Reason"], rows: requests.map((m) => [nameOf(m.staffId), MARK_LABEL[m.kind], m.day, m.reason ?? ""]) },
    { name: "Festival leave", headers: ["Ninja", "Applicable", "Taken", "Pending", "Available"], rows: months.map(({ n }) => { const f = festivalBalance(yearMarks, n.id, year, policy); return [n.name, f.applicable, f.taken, f.requested, f.available]; }) },
  ], [loading, months, requests, yearMarks, year, policy, days, a.tz, nameOf]));

  if (!supabase) return <Unavailable text="Attendance is available when RepairOX is connected to the database." />;
  if (err) return <LoadError what="attendance" err={err} />;
  const empty = loading ? "Loading…" : months.length === 0 ? "No Ninjas found for the stores and search you chose." : null;
  const shortNotice = (m: Mark) => {
    if (m.kind !== "casual_leave" || !m.requestedAt) return null;
    const need = planFor(att.plans, m.staffId, m.day).casualNoticeDays ?? DEFAULT_PLAN.casualNoticeDays;
    const ahead = Math.round((new Date(`${m.day}T00:00:00`).getTime() - new Date(`${localDateKey(new Date(m.requestedAt).getTime(), a.tz)}T00:00:00`).getTime()) / 864e5);
    return ahead < need ? Math.max(0, ahead) : null;
  };

  return (
    <div className="rox-lock-fill space-y-4">
      <KpiStrip loading={loading} items={[
        { label: "Days present", value: sum("present"), sub: `${sum("halfDay")} half days · ${months.length} Ninjas`, icon: CalendarCheck2, tone: "good" },
        { label: "Absent days", value: sum("absent"), sub: "no shift, no approved leave", icon: UserX, tone: sum("absent") ? "bad" : "default" },
        { label: "Leave taken", value: sum("casualLeave") + sum("festivalLeave"), sub: `${sum("casualLeave")} casual · ${sum("festivalLeave")} festival${a.ym === today.slice(0, 7) ? ` · ${onLeaveToday} today` : ""}` },
        { label: "Requests waiting", value: requests.length, sub: requests.length ? "approve or reject them" : "nothing to decide", icon: ClipboardList, tone: requests.length ? "warn" : "default" },
      ]} />
      <ViewBar value={view} onChange={setView}
        options={[{ label: "Summary", value: "summary" }, { label: "Day by day", value: "grid" }, { label: `Leave requests${requests.length ? ` (${requests.length})` : ""}`, value: "requests" }, { label: "Festival leave", value: "festival" }]}
        info={`A past day with no shift, no approved leave and no weekly off counts as Absent. A shift under ${policy.halfDayHours} hours is a Half Day. Click a Ninja's day in "Day by day" to see the punch times or mark leave.`}>
        {view === "grid" && <span className="hidden flex-wrap gap-1.5 text-[11px] xl:flex">{(["present", "half_day", "absent", "week_off", "casual_leave", "festival_leave", "requested"] as DayStatus[]).map((s) => <span key={s} className={cn("rounded px-1.5 py-0.5 font-bold ring-1 ring-inset", CHIP[s].c)}>{CHIP[s].t} {STATUS_LABEL[s]}</span>)}</span>}
        {canManage && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPolicyOpen(true)}><Settings2 className="h-3.5 w-3.5" />Rules</Button>}
      </ViewBar>

      {view === "summary" && <>
        <DataTable cols={["Ninja", "Present", "Half day", "Absent", "Week off", "Casual leave", "Festival leave", "Weekly off day"]} minWidth={1000} widths={[undefined, undefined, undefined, undefined, undefined, undefined, 170]} empty={empty}
          foot={<tr className="align-middle"><FootName sub={`${months.length} Ninjas`} />{(["present", "halfDay", "absent", "weekOff", "casualLeave", "festivalLeave"] as const).map((k) => <td key={k} className={C}>{sum(k)}</td>)}<td className={C} /></tr>}>
          {pagedNinjas.slice.map(({ n, m }) => (
            <tr key={n.id} className="rox-table-row align-middle hover:bg-muted/40">
              <td className="rox-frozen rox-frozen-left rox-frozen-left-edge px-4 py-3 text-left" style={FZ}><Link href={`/field/activity/${n.id}?tab=attendance`} className="block truncate text-[13px] font-bold uppercase tracking-wide text-foreground hover:text-[#4361EE]">{n.name}</Link></td>
              <td className={cn(C, "font-semibold text-emerald-700")}>{m.summary.present}</td>
              <td className={C}>{m.summary.halfDay || <Dash />}</td>
              <td className={cn(C, m.summary.absent > 0 && "font-semibold text-rose-700")}>{m.summary.absent || <Dash />}</td>
              <td className={C}>{m.summary.weekOff || <Dash />}</td><td className={C}>{m.summary.casualLeave || <Dash />}</td><td className={C}>{m.summary.festivalLeave || <Dash />}</td>
              <td className="px-3 py-3 text-center">
                {canManage ? <Select className="mx-auto h-[34px] w-[140px]" value={att.data?.weeklyOff.has(n.id) ? String(att.data.weeklyOff.get(n.id)) : ""} onChange={(e) => void att.setWeeklyOff(n.id, e.target.value)}
                  options={[{ label: "None", value: "" }, ...WEEKDAYS.map((w, i) => ({ label: w, value: String(i) }))]} />
                  : <span className="text-[13px]">{att.data?.weeklyOff.has(n.id) ? WEEKDAYS[att.data.weeklyOff.get(n.id)!] : "—"}</span>}
              </td>
            </tr>
          ))}
        </DataTable>
        {pagedNinjas.footer("Ninja")}
      </>}

      {view === "grid" && <>
        <DataTable cols={["Ninja", ...days.map((d) => String(Number(d.date.slice(8))))]} first={190} minWidth={190 + days.length * 42} widths={days.map(() => 42)} empty={empty}>
          {pagedNinjas.slice.map(({ n, m }) => (
            <tr key={n.id} className="rox-table-row align-middle hover:bg-muted/30">
              <NameCell label={n.name} sub={`${m.summary.present} present · ${m.summary.absent} absent`} />
              {m.days.map((d) => {
                const tip = `${dayLabel(d.date)} · ${STATUS_LABEL[d.status]}${d.punchIn ? ` · ${formatClock(d.punchIn, { timeZone: a.tz })} – ${d.punchOut ? formatClock(d.punchOut, { timeZone: a.tz }) : "on duty"}` : ""}${d.netMs ? ` · ${formatHm(d.netMs)}` : ""}`;
                return (
                  <td key={d.date} className={cn("px-0.5 py-3 text-center", d.date === today && "bg-[#EEF1FD]/70")}>
                    <button title={tip} disabled={d.status === "future" && !canManage} onClick={() => setOpen({ ninja: n, cell: d })}
                      className={cn("inline-grid h-8 w-9 place-items-center rounded-md text-[11px] font-bold ring-1 ring-inset transition hover:scale-110", CHIP[d.status].c)}>{CHIP[d.status].t}</button>
                  </td>
                );
              })}
            </tr>
          ))}
        </DataTable>
        {pagedNinjas.footer("Ninja")}
      </>}

      {view === "requests" && <>
        <DataTable cols={["Ninja", "Type", "Day", "Reason", "Balance", ""]} minWidth={960} widths={[150, 170, undefined, 150, 230]} empty={loading ? "Loading…" : requests.length ? null : "No leave requests waiting."}>
          {pagedReq.slice.map((m) => {
            const left = m.kind === "festival_leave" ? festivalBalance(yearMarks, m.staffId, year, policy).available : casualBalance(yearMarks, m.staffId, m.day.slice(0, 7), policy).available;
            const sn = shortNotice(m);
            return (
              <tr key={m.id} className="rox-table-row align-middle hover:bg-muted/40">
                <NameCell label={nameOf(m.staffId)} />
                <td className={C}>{MARK_LABEL[m.kind]}</td>
                <td className={C}>{dayLabel(m.day)}{sn != null && <span className="mt-0.5 block text-[10.5px] font-bold text-rose-700">Short notice · {sn}d</span>}</td>
                <td className="truncate px-3 py-4 text-[13px] text-muted-foreground" title={m.reason ?? ""}>{m.reason || "—"}</td>
                <td className={cn(C, left > 0 ? "text-muted-foreground" : "font-semibold text-rose-600")}>{left > 0 ? `${left} left` : "No balance"}</td>
                <td className="px-3 py-3 text-right">{canManage ? <div className="flex justify-end gap-2">
                  <Button size="sm" className="gap-1" onClick={() => void att.decide(m, true)}><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button>
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => void att.decide(m, false)}><XCircle className="h-3.5 w-3.5" />Reject</Button></div> : <span className="text-[12px] text-muted-foreground">Waiting</span>}</td>
              </tr>
            );
          })}
        </DataTable>
        {pagedReq.footer("request")}
      </>}

      {view === "festival" && <>
        <DataTable cols={["Ninja", "Applicable", "Taken", "Pending", "Available"]} minWidth={760} empty={empty}>
          {pagedNinjas.slice.map(({ n }) => { const f = festivalBalance(yearMarks, n.id, year, policy); return (
            <tr key={n.id} className="rox-table-row align-middle hover:bg-muted/40">
              <NameCell label={n.name} />
              <td className={C}>{f.applicable}</td><td className={C}>{f.taken}</td><td className={cn(C, f.requested && "text-amber-700")}>{f.requested || <Dash />}</td>
              <td className={cn(C, "font-bold", f.available === 0 && "text-rose-600")}>{f.available}</td>
            </tr>); })}
        </DataTable>
        {pagedNinjas.footer("Ninja")}
      </>}

      {open && <DayDialog ninja={open.ninja} cell={open.cell} tz={a.tz} policy={policy} canManage={canManage}
        mark={yearMarks.find((m) => m.staffId === open.ninja.id && m.day === open.cell.date)} onClose={() => setOpen(null)}
        onMark={(k, ex) => void att.setMark(open.ninja.id, open.cell.date, k, ex).then((ok) => ok && setOpen(null))}
        onDecide={(m, ok) => void att.decide(m, ok).then((r) => r && setOpen(null))} onSaved={() => { setOpen(null); void att.load(); }} />}
      {policyOpen && <PolicyDialog policy={policy} onClose={() => setPolicyOpen(false)} onSaved={() => { setPolicyOpen(false); void att.load(); }} />}
    </div>
  );
}
