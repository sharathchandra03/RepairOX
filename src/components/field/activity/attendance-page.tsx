"use client";
/* Field Activity → Attendance. Four views over the same month, one table at a time:
   Summary (counts + weekly off) · Day by day (calendar grid) · Leave requests (approve / reject) · Festival leave.
   Source: shifts (punch in/out), approved leave marks, weekly off — lib/field-attendance.ts. */
import { useMemo, useState } from "react";
import { CalendarCheck2, CheckCircle2, ClipboardList, Settings2, UserX, XCircle } from "lucide-react";
import { useActivity, useRegisterSheets } from "@/components/field/activity/activity-shell";
import { useAttendance } from "@/components/field/activity/use-attendance";
import { KpiStrip, LoadError, Unavailable, ViewBar, usePaged } from "@/components/field/activity/kit";
import { Dash, FieldGrid, FootLabel, NameText, Sub, useFieldGrid, type FCol } from "@/components/field/grid";
import { CHIP, DayDialog, PolicyDialog } from "@/components/field/insights/attendance-section";
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

  const shortNotice = (m: Mark) => {
    if (m.kind !== "casual_leave" || !m.requestedAt) return null;
    const need = planFor(att.plans, m.staffId, m.day).casualNoticeDays ?? DEFAULT_PLAN.casualNoticeDays;
    const ahead = Math.round((new Date(`${m.day}T00:00:00`).getTime() - new Date(`${localDateKey(new Date(m.requestedAt).getTime(), a.tz)}T00:00:00`).getTime()) / 864e5);
    return ahead < need ? Math.max(0, ahead) : null;
  };  type MR = (typeof months)[number];
  const cnt = (k: "present" | "halfDay" | "absent" | "weekOff" | "casualLeave" | "festivalLeave", label: string, cls?: (r: MR) => string | false): FCol<MR> =>
    ({ key: k, label, width: 130, render: ({ m }) => m.summary[k] || (k === "present" ? 0 : <Dash />), foot: sum(k), cellClass: cls });
  const sumGrid = useFieldGrid<MR>("activity_attendance_summary", [
    { key: "ninja", label: "Ninja", width: 240, anchor: true, render: ({ n }) => <NameText label={n.name} href={`/field/activity/${n.id}?tab=attendance`} />, foot: <FootLabel sub={`${months.length} Ninjas`} /> },
    cnt("present", "Present", () => "font-semibold text-emerald-700"), cnt("halfDay", "Half day"), cnt("absent", "Absent", ({ m }) => m.summary.absent > 0 && "font-semibold text-rose-700"),
    cnt("weekOff", "Week off"), cnt("casualLeave", "Casual leave"), cnt("festivalLeave", "Festival leave"),
    { key: "weekly", label: "Weekly off day", width: 190, render: ({ n }) => canManage
      ? <div onClick={(e) => e.stopPropagation()}><Select className="mx-auto h-[38px] w-[160px]" value={att.data?.weeklyOff.has(n.id) ? String(att.data.weeklyOff.get(n.id)) : ""} onChange={(e) => void att.setWeeklyOff(n.id, e.target.value)}
          options={[{ label: "None", value: "" }, ...WEEKDAYS.map((w, i) => ({ label: w, value: String(i) }))]} /></div>
      : (att.data?.weeklyOff.has(n.id) ? WEEKDAYS[att.data.weeklyOff.get(n.id)!] : <Dash />) },
  ]);
  const gridGrid = useFieldGrid<MR>("activity_attendance_days", [
    { key: "ninja", label: "Ninja", width: 220, anchor: true, render: ({ n, m }) => <NameText label={n.name} sub={`${m.summary.present} present · ${m.summary.absent} absent`} href={`/field/activity/${n.id}?tab=attendance`} /> },
    ...days.map((d, i): FCol<MR> => ({ key: `d${i + 1}`, label: String(i + 1), title: dayLabel(d.date), width: 50,
      cellClass: () => cn("!px-0.5", d.date === today && "!bg-[#EEF1FD]"),
      render: ({ n, m }) => { const c = m.days[i]; if (!c) return null;
        const tip = `${dayLabel(c.date)} · ${STATUS_LABEL[c.status]}${c.punchIn ? ` · ${formatClock(c.punchIn, { timeZone: a.tz })} – ${c.punchOut ? formatClock(c.punchOut, { timeZone: a.tz }) : "on duty"}` : ""}${c.netMs ? ` · ${formatHm(c.netMs)}` : ""}`;
        return <button title={tip} disabled={c.status === "future" && !canManage} onClick={() => setOpen({ ninja: n, cell: c })}
          className={cn("inline-grid h-9 w-10 place-items-center rounded-md text-[12.5px] font-bold ring-1 ring-inset transition hover:scale-110", CHIP[c.status].c)}>{CHIP[c.status].t}</button>; } })),
  ]);
  const reqGrid = useFieldGrid<Mark>("activity_attendance_requests", [
    { key: "ninja", label: "Ninja", width: 230, anchor: true, render: (m) => <NameText label={nameOf(m.staffId)} href={`/field/activity/${m.staffId}?tab=attendance`} /> },
    { key: "type", label: "Type", width: 160, render: (m) => MARK_LABEL[m.kind] },
    { key: "day", label: "Day", width: 170, render: (m) => { const sn = shortNotice(m); return <>{dayLabel(m.day)}{sn != null && <Sub className="font-bold text-rose-700">Short notice · {sn}d</Sub>}</>; } },
    { key: "reason", label: "Reason", width: 260, align: "left", cellClass: () => "truncate text-muted-foreground", render: (m) => m.reason || "—" },
    { key: "balance", label: "Balance", width: 150, render: (m) => { const left = m.kind === "festival_leave" ? festivalBalance(yearMarks, m.staffId, year, policy).available : casualBalance(yearMarks, m.staffId, m.day.slice(0, 7), policy).available;
      return <span className={left > 0 ? "text-muted-foreground" : "font-semibold text-rose-600"}>{left > 0 ? `${left} left` : "No balance"}</span>; } },
    { key: "act", label: "Decide", width: 250, actions: true, render: (m) => canManage ? <div className="flex justify-center gap-2">
      <Button size="sm" className="gap-1" onClick={() => void att.decide(m, true)}><CheckCircle2 className="h-3.5 w-3.5" />Approve</Button>
      <Button size="sm" variant="outline" className="gap-1" onClick={() => void att.decide(m, false)}><XCircle className="h-3.5 w-3.5" />Reject</Button></div> : <span className="text-muted-foreground">Waiting</span> },
  ]);
  const festGrid = useFieldGrid<MR>("activity_attendance_festival", [
    { key: "ninja", label: "Ninja", width: 240, anchor: true, render: ({ n }) => <NameText label={n.name} href={`/field/activity/${n.id}?tab=attendance`} /> },
    { key: "app", label: "Applicable", width: 140, render: ({ n }) => festivalBalance(yearMarks, n.id, year, policy).applicable },
    { key: "taken", label: "Taken", width: 140, render: ({ n }) => festivalBalance(yearMarks, n.id, year, policy).taken },
    { key: "pend", label: "Pending", width: 140, render: ({ n }) => { const f = festivalBalance(yearMarks, n.id, year, policy); return f.requested ? <span className="text-amber-700">{f.requested}</span> : <Dash />; } },
    { key: "avail", label: "Available", width: 140, render: ({ n }) => { const f = festivalBalance(yearMarks, n.id, year, policy); return <b className={f.available === 0 ? "text-rose-600" : ""}>{f.available}</b>; } },
  ]);
  const curGrid = view === "summary" ? sumGrid : view === "grid" ? gridGrid : view === "requests" ? reqGrid : festGrid;
  if (!supabase) return <Unavailable text="Attendance is available when RepairOX is connected to the database." />;
  if (err) return <LoadError what="attendance" err={err} />;
  const empty = loading ? "Loading…" : months.length === 0 ? "No Ninjas found for the stores and search you chose." : null;


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
        {view === "grid" && <span className="hidden flex-wrap gap-1.5 text-[12px] 2xl:flex">{(["present", "half_day", "absent", "week_off", "casual_leave", "festival_leave", "requested"] as DayStatus[]).map((s) => <span key={s} className={cn("rounded px-1.5 py-0.5 font-bold ring-1 ring-inset", CHIP[s].c)}>{CHIP[s].t} {STATUS_LABEL[s]}</span>)}</span>}
        {curGrid.menus}
        {canManage && <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPolicyOpen(true)}><Settings2 className="h-3.5 w-3.5" />Rules</Button>}
      </ViewBar>

      {view === "requests"
        ? <FieldGrid grid={reqGrid} rows={pagedReq.slice} rowKey={(m) => m.id ?? `${m.staffId}-${m.day}`} empty={loading ? "Loading…" : requests.length ? null : "No leave requests waiting."} />
        : <FieldGrid grid={curGrid as typeof sumGrid} rows={pagedNinjas.slice} rowKey={(r) => r.n.id} foot={view === "summary"} empty={empty} />}
      {view === "requests" ? pagedReq.footer("request") : pagedNinjas.footer("Ninja")}

      {open && <DayDialog ninja={open.ninja} cell={open.cell} tz={a.tz} policy={policy} canManage={canManage}
        mark={yearMarks.find((m) => m.staffId === open.ninja.id && m.day === open.cell.date)} onClose={() => setOpen(null)}
        onMark={(k, ex) => void att.setMark(open.ninja.id, open.cell.date, k, ex).then((ok) => ok && setOpen(null))}
        onDecide={(m, ok) => void att.decide(m, ok).then((r) => r && setOpen(null))} onSaved={() => { setOpen(null); void att.load(); }} />}
      {policyOpen && <PolicyDialog policy={policy} onClose={() => setPolicyOpen(false)} onSaved={() => { setPolicyOpen(false); void att.load(); }} />}
    </div>
  );
}
