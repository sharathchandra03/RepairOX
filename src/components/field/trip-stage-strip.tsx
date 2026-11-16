"use client";
/* Horizontal, colourful, realtime journey tracker for ONE trip.
   Assigned → Accepted → … → Done. Reached stages are green with their time, the
   stage the Ninja is in right now blinks green, and an unaccepted assignment
   shows amber "waiting" (or rose when the Ninja rejected it). Used by the
   Pickup & Drop table overlay and by View Assignment. */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clock, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { STATUS_META, assignedStamp, type TripStatus, type TripType } from "@/lib/ninja/model";
import { stagesFor, statusRank, type JobLive } from "@/lib/field-live";
import { formatDateTime } from "@/lib/time-format";

export interface TripEventLite { new_status: string | null; occurred_at: string; event_type: string; note: string | null; actor_name: string | null }

export function useTripEvents(tripId: string | null | undefined): TripEventLite[] {
  const [ev, setEv] = useState<TripEventLite[]>([]);
  useEffect(() => {
    if (!supabase || !tripId) { setEv([]); return; }
    let off = false;
    const load = async () => {
      const { data } = await supabase!.from("field_trip_events").select("new_status,occurred_at,event_type,note,actor_name").eq("trip_id", tripId).order("occurred_at", { ascending: true }).limit(200);
      if (!off) setEv((data ?? []) as TripEventLite[]);
    };
    void load();
    const ch = supabase.channel(`trip-ev-${tripId}`).on("postgres_changes", { event: "*", schema: "public", table: "field_trip_events", filter: `trip_id=eq.${tripId}` }, () => void load()).subscribe();
    return () => { off = true; supabase?.removeChannel(ch); };
  }, [tripId]);
  return ev;
}

const fmtTime = (iso?: string | null) => (iso ? formatDateTime(iso) : "");
const CLOSED_BAD: TripStatus[] = ["failed_attempt", "customer_unavailable", "rescheduled", "return_to_store", "cancelled"];

export function TripStageStrip({ live, events, className }: { live: JobLive; events: TripEventLite[]; className?: string }) {
  const stages = useMemo(() => stagesFor(live.trip_type), [live.trip_type]);
  const rejected = !!live.rejected;
  const bad = CLOSED_BAD.includes(live.status);
  const maxRank = useMemo(() => {
    let m = statusRank(live.status);
    for (const e of events) if (e.new_status) m = Math.max(m, statusRank(e.new_status as TripStatus));
    return m;
  }, [live.status, events]);
  const timeOf = (key: TripStatus): string | null => {
    if (key === "assigned") return live.assigned_at;
    if (key === "accepted") return live.accepted_at;
    if (key === "completed") return live.completed_at ?? events.find((e) => e.new_status === key)?.occurred_at ?? null;
    return events.find((e) => e.new_status === key)?.occurred_at ?? null;
  };
  const reached = (key: TripStatus) => !rejected && statusRank(key) <= maxRank && maxRank >= 0;
  let curIdx = -1;
  stages.forEach((s, i) => { if (reached(s.key)) curIdx = i; });
  const finished = live.status === "completed";
  return (
    <div className={cn("overflow-x-auto pb-1", className)} role="list" aria-label="Trip progress">
      <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => {
          const rej = rejected && i === 0;
          const isReached = reached(s.key);
          const isNow = i === curIdx && !finished && !bad;
          const waiting = isNow && s.key === "assigned";
          const isDone = isReached && !isNow;
          const t = timeOf(s.key);
          const prevOn = i > 0 && reached(s.key);                       // line coming in is green once THIS stage is reached
          const nextOn = i < stages.length - 1 && reached(stages[i + 1].key);
          const circle = rej ? "bg-rose-500 text-white shadow-[0_10px_24px_-10px_rgba(244,63,94,0.9)]"
            : waiting ? "bg-amber-500 text-white shadow-[0_10px_24px_-10px_rgba(245,158,11,0.9)]"
            : isNow ? "bg-emerald-500 text-white shadow-[0_12px_28px_-10px_rgba(16,185,129,0.95)] ring-4 ring-emerald-200"
            : isDone ? "bg-emerald-500 text-white"
            : "bg-slate-100 text-slate-400 ring-1 ring-inset ring-slate-200";
          return (
            <div key={s.key} role="listitem" className="relative flex flex-col items-center px-1 pb-1 pt-1 text-center">
              {i > 0 ? <span aria-hidden className={cn("absolute left-0 top-[29px] h-[3px] w-1/2 rounded-full", prevOn ? "bg-emerald-400" : "bg-slate-200")} /> : null}
              {i < stages.length - 1 ? <span aria-hidden className={cn("absolute right-0 top-[29px] h-[3px] w-1/2 rounded-full", nextOn ? "bg-emerald-400" : "bg-slate-200")} /> : null}
              <span className="relative z-10 grid h-14 w-14 place-items-center">
                {(isNow || waiting) && !rej ? <span aria-hidden className={cn("absolute h-11 w-11 rounded-full opacity-50 motion-safe:animate-ping", waiting ? "bg-amber-400" : "bg-emerald-400")} /> : null}
                <span className={cn("relative grid h-11 w-11 place-items-center rounded-full text-[13px] font-extrabold transition", circle)}>
                  {rej ? <X className="h-5 w-5" strokeWidth={3} /> : waiting ? <Clock className="h-5 w-5" /> : isReached ? <Check className="h-5 w-5" strokeWidth={3} /> : i + 1}
                </span>
              </span>
              <span className={cn("mt-2.5 text-[12.5px] font-extrabold leading-tight", rej ? "text-rose-700" : waiting ? "text-amber-700" : isNow ? "text-emerald-700" : isDone ? "text-slate-800" : "text-slate-400")}>
                {rej ? "Rejected" : s.label}
              </span>
              {isNow && !waiting ? <span className="mt-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-white">Now</span>
                : waiting ? <span className="mt-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-amber-800">Waiting</span> : null}
              <span className={cn("mt-1 text-[11px] font-medium leading-tight tabular-nums", isReached || rej ? "text-slate-500" : "text-slate-300")}>
                {rej ? fmtTime(live.rejected!.at) : t ? fmtTime(t) : isReached ? "" : "—"}
              </span>
            </div>
          );
        })}
      </div>
      {bad ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />{STATUS_META[live.status].label}{live.failure_reason ? ` — ${live.failure_reason}` : ""}</p>
      ) : null}
    </div>
  );
}
export { assignedStamp };
