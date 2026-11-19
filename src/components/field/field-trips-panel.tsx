"use client";
/* CRM view of the Ninja execution layer for ONE Field Service Job: every trip
   (pickup / drop / on-site), its Ninja, live location freshness, chain-of-custody
   proofs and assignment history. Same rows the Ninja app writes (RLS-scoped).
   Used on View Field Job and View Lead. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, Timer, FileText, History, Link2, Radio, Route as RouteIcon, UserCheck } from "lucide-react";
import { DetailSection } from "@/components/common/detail-page";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { STATUS_META, TRACKING_STATUSES, TYPE_LABEL, ago, freshness, type TripStatus, type TripType } from "@/lib/ninja/model";
import { cn } from "@/lib/utils";
import { LiveTrackMap } from "@/components/field/live-track-map";
import { AcceptTicket } from "@/components/ninja/accept-ticket";
import { TripStageStrip, useTripEvents } from "@/components/field/trip-stage-strip";
import { TripActionBar } from "@/components/field/trip-action-bar";
import { isRejectBlinking, type JobLive } from "@/lib/field-live";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/time-format";

const LIVE_STATES: TripStatus[] = ["en_route_customer", "en_route_store", "device_received_by_ninja"];
const CLOSED: TripStatus[] = ["completed", "cancelled", "rescheduled", "failed_attempt", "customer_unavailable", "return_to_store"];

interface Trip { id: string; trip_no: string | null; trip_type: TripType; status: TripStatus; ninja_id: string | null; scheduled_at: string | null; assigned_at: string | null; accepted_at: string | null; accept_deadline_at: string | null; journey_started_at: string | null; arrived_at: string | null; completed_at: string | null; failure_reason: string | null; created_at: string; dest_lat: number | null; dest_lng: number | null }
interface Hand { id: string; trip_id: string; kind: string; status: string; created_at: string; reject_reason: string | null; evidence: { photos?: string[] } | null }
interface Asg { id: string; trip_id: string; ninja_id: string; outcome: string; assigned_at: string; reject_reason: string | null; responded_at: string | null }
interface Ses { trip_id: string; staff_id?: string; last_point_at: string | null; last_lat: number | null; last_lng: number | null }

const TONE: Record<string, string> = {
  blue: "bg-[#EEF1FD] text-[#3450D8] ring-[#4361EE]/20", amber: "bg-amber-50 text-amber-800 ring-amber-300/60", green: "bg-emerald-50 text-emerald-800 ring-emerald-300/60",
  rose: "bg-rose-50 text-rose-800 ring-rose-300/60", slate: "bg-slate-100 text-slate-700 ring-slate-300/70", violet: "bg-violet-50 text-violet-800 ring-violet-300/60", sky: "bg-sky-50 text-sky-800 ring-sky-300/60",
};
const HAND: Record<string, string> = { customer_to_ninja: "Pickup receipt", ninja_to_store: "Store handover", store_to_ninja: "Store release", ninja_to_customer: "Delivery confirmation" };
const fmt = (iso: string | null) => (iso ? formatDateTime(iso) : "—");

/** Strip wrapper (own events subscription per trip). */
function StripFor({ trip, jobId, rejected }: { trip: Trip; jobId: string; rejected: JobLive["rejected"] }) {
  const events = useTripEvents(trip.id);
  const live: JobLive = { ...trip, job_id: jobId, organization_id: undefined as never, accept_deadline_at: trip.accept_deadline_at, updated_at: trip.created_at, rejected } as unknown as JobLive;
  return <div className="mt-4 rounded-xl border border-border bg-muted/10 px-3 py-5"><TripStageStrip live={live} events={events} /></div>;
}
/** Blinking (1 min) then steady rose banner at the top of View Assignment when a Ninja rejected the open trip. */
export function RejectedBanner({ jobId }: { jobId: string }) {
  const { team } = usePermissions();
  const [info, setInfo] = useState<{ at: string; reason: string | null; ninjaId: string | null; tripNo: string | null } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!supabase || !jobId) return;
    let off = false;
    const load = async () => {
      const { data: t } = await supabase!.from("field_trips").select("id,trip_no,status,created_at").eq("job_id", jobId).eq("status", "awaiting_assignment").order("created_at", { ascending: false }).limit(1);
      const trip = (t ?? [])[0] as { id: string; trip_no: string | null } | undefined;
      if (!trip) { if (!off) setInfo(null); return; }
      const { data: a } = await supabase!.from("field_assignments").select("ninja_id,outcome,reject_reason,responded_at,assigned_at").eq("trip_id", trip.id).eq("outcome", "rejected").order("assigned_at", { ascending: false }).limit(1);
      const r = (a ?? [])[0] as { ninja_id: string | null; reject_reason: string | null; responded_at: string | null; assigned_at: string } | undefined;
      if (!off) setInfo(r ? { at: r.responded_at ?? r.assigned_at, reason: r.reject_reason, ninjaId: r.ninja_id, tripNo: trip.trip_no } : null);
    };
    void load();
    const ch = supabase.channel(`rej-${jobId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "field_trips", filter: `job_id=eq.${jobId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "field_assignments" }, () => void load())
      .subscribe();
    return () => { off = true; supabase?.removeChannel(ch); };
  }, [jobId]);
  const blinking = !!info && now - new Date(info.at).getTime() < 60_000;
  useEffect(() => { if (!blinking) return; const iv = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(iv); }, [blinking]);
  if (!info) return null;
  const who = team.find((m) => m.id === info.ninjaId)?.name ?? "The Ninja";
  return (
    <div role="alert" className={cn("flex flex-wrap items-center gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-5 py-3.5 text-rose-800", blinking && "motion-safe:animate-pulse")}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-500 text-white"><Radio className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-extrabold">{who} rejected this assignment{info.tripNo ? ` (${info.tripNo})` : ""} · {fmt(info.at)}</p>
        <p className="text-[12.5px]">{info.reason ? `Reason: “${info.reason}”. ` : ""}Assign another Ninja below. This stays highlighted until the trip is assigned again.</p>
      </div>
    </div>
  );
}

const ADD_PRESETS = [5, 10, 15, 30, 60];
/** Field manager: give THIS assignment a different time to accept ("N minutes from now"). */
function AcceptTimeDialog({ trip, ninja, onClose, onSaved }: { trip: Trip | null; ninja: string; onClose: () => void; onSaved: () => void }) {
  const [mins, setMins] = useState("15");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (trip) setMins("15"); }, [trip]);
  const n = Number(mins);
  const invalid = mins.trim() === "" || !Number.isInteger(n) || n < 1 || n > 1440;
  async function save(deadline: string | null) {
    if (!supabase || !trip) return;
    setBusy(true);
    const { error } = await supabase.from("field_trips").update({ accept_deadline_at: deadline }).eq("id", trip.id).eq("status", "assigned");
    setBusy(false);
    if (error) { toast.error(error.message.includes("not_assigned") ? "This assignment was already accepted." : "Could not change the time."); return; }
    toast.success(deadline ? `${ninja} now has ${n} minute${n === 1 ? "" : "s"} to accept.` : "Accept time reset to the default.");
    onSaved(); onClose();
  }
  return (
    <RoxCenteredForm open={!!trip} onClose={onClose} title="Change time to accept" subtitle={trip ? `${trip.trip_no ?? ""} · ${ninja}` : ""} icon={Timer} width="max-w-md"
      footer={<div className="flex w-full items-center justify-between gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void save(null)}>Reset to default</Button>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} disabled={invalid} onClick={() => void save(new Date(Date.now() + n * 60_000).toISOString())}>Save</Button></div>
      </div>}>
      <p className="text-[12.5px] text-muted-foreground">Sets how long {ninja} has to accept this assignment, counted from now. The Ninja app updates immediately. Other assignments keep the default.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {ADD_PRESETS.map((m) => (
          <button key={m} type="button" onClick={() => setMins(String(m))}
            className={cn("h-8 rounded-full border px-3.5 text-[12.5px] font-semibold transition", n === m ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-input bg-card hover:border-[#4361EE]/50")}>{m} min</button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="w-32"><Input type="number" min={1} max={1440} inputMode="numeric" value={mins} invalid={invalid} aria-label="Minutes from now" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMins(e.target.value)} /></div>
        <span className="text-[12px] text-muted-foreground">minutes from now (1 – 1440)</span>
      </div>
    </RoxCenteredForm>
  );
}

export function FieldTripsPanel({ jobId, compact }: { jobId: string; compact?: boolean }) {
  const { team, can, apiFetch } = usePermissions();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hands, setHands] = useState<Hand[]>([]);
  const [asg, setAsg] = useState<Asg[]>([]);
  const [ses, setSes] = useState<Record<string, Ses>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [linking, setLinking] = useState(false);
  const [editTime, setEditTime] = useState<Trip | null>(null);
  const canAssign = can("manage_field_jobs") || can("assign_ninja") || can("full_access");
  const [, setTick] = useState(0);
  const idsRef = useRef<string[]>([]);
  const ninjasRef = useRef<string[]>([]);
  const [byNinja, setByNinja] = useState<Record<string, Ses>>({});
  const name = (id: string | null) => (id ? team.find((m) => m.id === id)?.name ?? "Ninja" : "—");

  const load = useCallback(async () => {
    if (!supabase || !jobId) return;
    const { data: t } = await supabase.from("field_trips").select("id,trip_no,trip_type,status,ninja_id,scheduled_at,assigned_at,accepted_at,accept_deadline_at,journey_started_at,arrived_at,completed_at,failure_reason,created_at,dest_lat,dest_lng").eq("job_id", jobId).order("created_at");
    const list = (t ?? []) as Trip[];
    setTrips(list);
    const ids = list.map((x) => x.id);
    idsRef.current = ids;
    const ninjaIds = [...new Set(list.map((x) => x.ninja_id).filter(Boolean) as string[])];
    ninjasRef.current = ninjaIds;
    if (ids.length) {
      const [h, a, s, sn] = await Promise.all([
        supabase.from("field_handovers").select("id,trip_id,kind,status,created_at,reject_reason,evidence").in("trip_id", ids).order("created_at"),
        supabase.from("field_assignments").select("id,trip_id,ninja_id,outcome,assigned_at,reject_reason,responded_at").in("trip_id", ids).order("assigned_at", { ascending: false }),
        supabase.from("field_tracking_sessions").select("trip_id,staff_id,last_point_at,last_lat,last_lng").in("trip_id", ids).is("ended_at", null),
        ninjaIds.length ? supabase.from("field_tracking_sessions").select("trip_id,staff_id,last_point_at,last_lat,last_lng").in("staff_id", ninjaIds).is("ended_at", null) : Promise.resolve({ data: [] as Ses[] }),
      ]);
      // The Ninja's freshest open session (they may be tracking a different accepted trip).
      const fresh: Record<string, Ses> = {};
      for (const x of (sn.data ?? []) as Ses[]) { const k = x.staff_id as string; if (!fresh[k] || (x.last_point_at ?? "") > (fresh[k].last_point_at ?? "")) fresh[k] = x; }
      setByNinja(fresh);
      const hs = (h.data ?? []) as Hand[];
      setHands(hs); setAsg((a.data ?? []) as Asg[]);
      setSes(Object.fromEntries(((s.data ?? []) as Ses[]).map((x) => [x.trip_id, x])));
      const first = hs.flatMap((x) => (x.evidence?.photos ?? []).slice(0, 1).map((p) => [x.id, p] as const));
      const out: Record<string, string> = {};
      for (const [hid, path] of first) { const { data } = await supabase.storage.from("field-proofs").createSignedUrl(path, 3600); if (data?.signedUrl) out[hid] = data.signedUrl; }
      setThumbs(out);
    }
    setLoaded(true);
  }, [jobId]);

  useEffect(() => {
    void load();
    if (!supabase) return;
    const ch = supabase.channel(`job-trips-${jobId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "field_trips", filter: `job_id=eq.${jobId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "field_handovers", filter: `job_id=eq.${jobId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "field_tracking_sessions" }, (p) => {
        const tid = (p.new as { trip_id?: string } | null)?.trip_id ?? (p.old as { trip_id?: string } | null)?.trip_id;
        const sid = (p.new as { staff_id?: string } | null)?.staff_id;
        if ((tid && idsRef.current.includes(tid)) || (sid && ninjasRef.current.includes(sid))) void load();
      })
      .subscribe();
    // Fallback poll + a light tick so "x s ago" / freshness stay truthful.
    const iv = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    const tk = setInterval(() => setTick((n) => n + 1), 10000);
    return () => { supabase?.removeChannel(ch); clearInterval(iv); clearInterval(tk); };
  }, [jobId, load]);

  async function copyLink() {
    setLinking(true);
    const r = await apiFetch("/api/field/tracking-link", { method: "POST", body: JSON.stringify({ jobId }) });
    setLinking(false);
    if (!r.ok || !r.json?.ok) { toast.error(r.json?.error ?? "Could not create the tracking link."); return; }
    try { await navigator.clipboard.writeText(r.json.url); toast.success("Customer tracking link copied (valid 14 days)."); }
    catch { window.prompt("Copy the customer tracking link:", r.json.url); }
  }

  if (!loaded || trips.length === 0) return null;
  const canShare = can("view_field_jobs") || can("manage_field_jobs") || can("route_leads") || can("manage_sales") || can("full_access");

  return (
    <DetailSection icon={RouteIcon} title={`Ninja Trips · ${trips.length}`} accent="violet"
      action={<div className="flex items-center gap-2">
        {canShare ? <Button size="sm" variant="outline" className="gap-1.5" loading={linking} onClick={() => void copyLink()}><Link2 className="h-3.5 w-3.5" />Customer tracking link</Button> : null}
      </div>}>
      <div className="space-y-3">
        {trips.map((t) => {
          const m = STATUS_META[t.status]; const live = ses[t.id] ?? (t.ninja_id ? byNinja[t.ninja_id] : undefined); const fr = freshness(live?.last_point_at);
          const th = hands.filter((h) => h.trip_id === t.id); const ta = asg.filter((a) => a.trip_id === t.id);
          return (
            <div key={t.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 min-w-6 place-items-center rounded-md bg-indigo-100 px-1.5 text-[10px] font-bold text-indigo-700">{TYPE_LABEL[t.trip_type]}</span>
                  <span className="text-sm font-bold">{t.trip_no}</span>
                </div>
                <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", TONE[m.tone])}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{m.label}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-4">
                <div><p className="text-[11px] font-medium text-muted-foreground">Ninja</p><p className="font-semibold">{name(t.ninja_id)}</p></div>
                <div><p className="text-[11px] font-medium text-muted-foreground">Scheduled</p><p className="font-semibold">{fmt(t.scheduled_at)}</p></div>
                <div><p className="text-[11px] font-medium text-muted-foreground">Accepted</p><p className="font-semibold">{fmt(t.accepted_at)}</p></div>
                <div><p className="text-[11px] font-medium text-muted-foreground">{t.completed_at ? "Closed" : "Arrived"}</p><p className="font-semibold">{fmt(t.completed_at ?? t.arrived_at)}</p></div>
              </div>
              <StripFor trip={t} jobId={jobId} rejected={t.status === "awaiting_assignment" ? ((): JobLive["rejected"] => { const r = ta.find((a) => a.outcome === "rejected"); return r ? { at: r.responded_at ?? r.assigned_at, reason: r.reject_reason, ninjaId: r.ninja_id } : null; })() : null} />
              {!compact ? <TripActionBar trip={{ id: t.id, trip_no: t.trip_no, trip_type: t.trip_type, status: t.status, job_id: jobId, scheduled_at: t.scheduled_at }} onChanged={() => void load()} className="mt-3" /> : null}
              {t.failure_reason ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">{t.failure_reason}</p> : null}
              {t.status === "assigned" ? (
                <div className="mt-3 space-y-1.5">
                  <AcceptTicket t={{ assigned_at: t.assigned_at, accept_deadline_at: t.accept_deadline_at, created_at: t.created_at }} compact />
                  <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">
                    <span>Waiting for {name(t.ninja_id)} to accept{t.accept_deadline_at ? " · custom time" : ""}</span>
                    {canAssign ? <button type="button" onClick={() => setEditTime(t)} className="inline-flex items-center gap-1 font-semibold text-[#4361EE] hover:underline"><Timer className="h-3.5 w-3.5" />Change time</button> : null}
                  </div>
                </div>
              ) : null}
              {!compact && !CLOSED.includes(t.status) && t.status !== "awaiting_assignment" ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-border">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-muted/30 px-3 py-2 text-[12px]">
                    <span className="flex items-center gap-1.5 font-bold"><Radio className={cn("h-3.5 w-3.5", live ? "text-emerald-600" : "text-muted-foreground")} />Live status</span>
                    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", TONE[m.tone])}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{m.label}</span>
                    {live ? <span className={cn("ml-auto font-bold", fr.tone === "green" ? "text-emerald-700" : fr.tone === "rose" ? "text-rose-600" : "text-amber-700")}>{fr.label} · {ago(live.last_point_at)}</span>
                      : <span className="ml-auto text-muted-foreground">{TRACKING_STATUSES.includes(t.status) ? "Waiting for first location…" : "Location starts once the Ninja accepts"}</span>}
                  </div>
                  {TRACKING_STATUSES.includes(t.status) ? (
                    <LiveTrackMap tripId={t.id} ninjaName={name(t.ninja_id)} stageLabel={m.label} session={live ?? null}
                      dest={t.dest_lat != null && t.dest_lng != null ? { lat: t.dest_lat, lng: t.dest_lng } : null} className="rounded-none border-0 border-t" />
                  ) : null}
                </div>
              ) : null}
              {th.length > 0 && !compact ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {th.map((h) => (
                    <a key={h.id} href={`/ninja/receipt/${t.id}?h=${h.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-semibold hover:border-[#4361EE]/40">
                      {thumbs[h.id] ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={thumbs[h.id]} alt="" className="h-7 w-7 rounded object-cover" /> : <FileText className="h-4 w-4 text-[#4361EE]" />}
                      {HAND[h.kind] ?? h.kind}
                      <span className={cn("rounded-full px-1.5 text-[10px] font-bold", h.status === "accepted" ? "bg-emerald-100 text-emerald-700" : h.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{h.status}</span>
                    </a>
                  ))}
                </div>
              ) : null}
              {ta.length > 0 && !compact ? (
                <details className="mt-3 text-[12px]">
                  <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-muted-foreground"><History className="h-3.5 w-3.5" />Assignment history ({ta.length})</summary>
                  <ul className="mt-2 space-y-1.5 pl-5">
                    {ta.map((a) => <li key={a.id} className="flex items-center gap-2"><UserCheck className="h-3.5 w-3.5 text-violet-500" /><b>{name(a.ninja_id)}</b> · {a.outcome}{a.reject_reason ? ` (“${a.reject_reason}”)` : ""} · {fmt(a.assigned_at)}</li>)}
                  </ul>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
      <AcceptTimeDialog trip={editTime} ninja={name(editTime?.ninja_id ?? null)} onClose={() => setEditTime(null)} onSaved={() => void load()} />
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Copy className="h-3 w-3" />Trips update live from the Ninja app. Location is visible only while a trip is travelling.</p>
    </DetailSection>
  );
}
