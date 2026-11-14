"use client";
/* CRM view of the Ninja execution layer for ONE Field Service Job: every trip
   (pickup / drop / on-site), its Ninja, live location freshness, chain-of-custody
   proofs and assignment history. Same rows the Ninja app writes (RLS-scoped).
   Used on View Field Job and View Lead. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, FileText, History, Link2, Radio, Route as RouteIcon, Truck, UserCheck } from "lucide-react";
import { DetailSection } from "@/components/common/detail-page";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { STATUS_META, TYPE_LABEL, ago, freshness, type TripStatus, type TripType } from "@/lib/ninja/model";
import { cn } from "@/lib/utils";

interface Trip { id: string; trip_no: string | null; trip_type: TripType; status: TripStatus; ninja_id: string | null; scheduled_at: string | null; assigned_at: string | null; accepted_at: string | null; journey_started_at: string | null; arrived_at: string | null; completed_at: string | null; failure_reason: string | null; created_at: string }
interface Hand { id: string; trip_id: string; kind: string; status: string; created_at: string; reject_reason: string | null; evidence: { photos?: string[] } | null }
interface Asg { id: string; trip_id: string; ninja_id: string; outcome: string; assigned_at: string; reject_reason: string | null }
interface Ses { trip_id: string; last_point_at: string | null; last_lat: number | null; last_lng: number | null }

const TONE: Record<string, string> = {
  blue: "bg-[#EEF1FD] text-[#3450D8] ring-[#4361EE]/20", amber: "bg-amber-50 text-amber-800 ring-amber-300/60", green: "bg-emerald-50 text-emerald-800 ring-emerald-300/60",
  rose: "bg-rose-50 text-rose-800 ring-rose-300/60", slate: "bg-slate-100 text-slate-700 ring-slate-300/70", violet: "bg-violet-50 text-violet-800 ring-violet-300/60", sky: "bg-sky-50 text-sky-800 ring-sky-300/60",
};
const HAND: Record<string, string> = { customer_to_ninja: "Pickup receipt", ninja_to_store: "Store handover", store_to_ninja: "Store release", ninja_to_customer: "Delivery confirmation" };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

export function FieldTripsPanel({ jobId, compact }: { jobId: string; compact?: boolean }) {
  const { team, can, apiFetch } = usePermissions();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hands, setHands] = useState<Hand[]>([]);
  const [asg, setAsg] = useState<Asg[]>([]);
  const [ses, setSes] = useState<Record<string, Ses>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [linking, setLinking] = useState(false);
  const name = (id: string | null) => (id ? team.find((m) => m.id === id)?.name ?? "Ninja" : "—");

  const load = useCallback(async () => {
    if (!supabase || !jobId) return;
    const { data: t } = await supabase.from("field_trips").select("id,trip_no,trip_type,status,ninja_id,scheduled_at,assigned_at,accepted_at,journey_started_at,arrived_at,completed_at,failure_reason,created_at").eq("job_id", jobId).order("created_at");
    const list = (t ?? []) as Trip[];
    setTrips(list);
    const ids = list.map((x) => x.id);
    if (ids.length) {
      const [h, a, s] = await Promise.all([
        supabase.from("field_handovers").select("id,trip_id,kind,status,created_at,reject_reason,evidence").in("trip_id", ids).order("created_at"),
        supabase.from("field_assignments").select("id,trip_id,ninja_id,outcome,assigned_at,reject_reason").in("trip_id", ids).order("assigned_at", { ascending: false }),
        supabase.from("field_tracking_sessions").select("trip_id,last_point_at,last_lat,last_lng").in("trip_id", ids).is("ended_at", null),
      ]);
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
      .subscribe();
    const iv = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30000);
    return () => { supabase?.removeChannel(ch); clearInterval(iv); };
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
        <Link href="/field/dispatch" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#4361EE] hover:bg-[#EEF1FD]"><Truck className="h-3.5 w-3.5" />Dispatch</Link>
      </div>}>
      <div className="space-y-3">
        {trips.map((t) => {
          const m = STATUS_META[t.status]; const live = ses[t.id]; const fr = freshness(live?.last_point_at);
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
              {t.failure_reason ? <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700">{t.failure_reason}</p> : null}
              {live ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50/60 px-3 py-2 text-[12px]">
                  <span className="flex items-center gap-1.5 font-bold text-emerald-700"><Radio className="h-3.5 w-3.5" />{fr.label}</span>
                  <span className="text-muted-foreground">Last location {ago(live.last_point_at)}</span>
                  {live.last_lat != null ? <a className="ml-auto inline-flex items-center gap-1 font-semibold text-[#4361EE]" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${live.last_lat},${live.last_lng}`}><ExternalLink className="h-3.5 w-3.5" />Open map</a> : null}
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
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Copy className="h-3 w-3" />Trips update live from the Ninja app. Location is visible only while a trip is travelling.</p>
    </DetailSection>
  );
}
