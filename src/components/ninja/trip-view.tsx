"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Check, CheckCircle2, Clock, ExternalLink, FileText, Hash, MapPin, MessageSquareText, Navigation, Phone,
  Radio, ShieldCheck, Smartphone, Store, User, XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { useWorkSession } from "@/lib/work-session-context";
import { toast } from "@/components/ui/toaster";
import { useNinja, useNinjaGeo } from "@/lib/ninja/ninja-context";
import {
  type NinjaTrip, TRACKING_STATUSES, TYPE_LABEL, STATUS_META, ago, distanceKm, freshness, mapsLink, navLink, nextStep, stepperFor,
  statusRank, whenLabel,
} from "@/lib/ninja/model";
import { motion } from "framer-motion";
import { Btn, Card, Pill, Row, SectionTitle, StatusPill, SwipeConfirm, TONE } from "./ui";
import { TYPE_STYLE } from "./trip-card";
import { CollectSheet, DeliverSheet, ProblemSheet, ReceiveStoreSheet, RejectSheet, ServiceSheet, SubmitStoreSheet } from "./flows";

interface EventRow { id: string; event_type: string; previous_status: string | null; new_status: string | null; note: string | null; actor_name: string | null; occurred_at: string }
interface HandoverRow { id: string; kind: string; status: string; created_at: string }

const HAND_LABEL: Record<string, string> = {
  customer_to_ninja: "Pickup receipt", ninja_to_store: "Store handover", store_to_ninja: "Store release", ninja_to_customer: "Delivery confirmation",
};

function Stepper({ t }: { t: NinjaTrip }) {
  const steps = stepperFor(t);
  const cur = statusRank(t.status);
  return (
    <ol className="flex items-start justify-between gap-1" aria-label="Trip progress">
      {steps.map((s, i) => {
        const done = statusRank(s.key) <= cur && cur >= 0, here = s.key === t.status;
        return (
          <li key={s.key} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {i > 0 ? <span className={`absolute right-1/2 top-[11px] h-[2px] w-full ${done ? "bg-white" : "bg-white/25"}`} /> : null}
            <span className={`relative z-10 grid h-6 w-6 place-items-center rounded-full text-[10px] font-extrabold ring-4 ring-[#2F46C4] ${done ? "bg-white text-[#2F46C4]" : "bg-white/20 text-white/60"} ${here ? "scale-125 shadow-[0_0_0_5px_rgba(255,255,255,0.25)]" : ""} transition-transform`}>
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`mt-1.5 text-[9.5px] font-bold leading-tight ${done ? "text-white" : "text-white/50"}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function TripView({ t }: { t: NinjaTrip }) {
  const { accept, transition } = useNinja();
  const { apiFetch } = usePermissions();
  const { openSession, startWork } = useWorkSession();
  const [sharing, setSharing] = useState(false);
  const geo = useNinjaGeo();
  const [sheet, setSheet] = useState<null | "collect" | "submit" | "receive" | "deliver" | "service" | "problem" | "reject">(null);
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [hands, setHands] = useState<HandoverRow[]>([]);
  const step = nextStep(t);
  const closed = ["completed", "cancelled", "rescheduled", "failed_attempt", "customer_unavailable", "return_to_store"].includes(t.status);
  const tracking = TRACKING_STATUSES.includes(t.status);

  useEffect(() => {
    if (!supabase) return;
    let off = false;
    (async () => {
      const [e, h] = await Promise.all([
        supabase!.from("field_trip_events").select("id,event_type,previous_status,new_status,note,actor_name,occurred_at").eq("trip_id", t.id).order("occurred_at", { ascending: false }).limit(40),
        supabase!.from("field_handovers").select("id,kind,status,created_at").eq("trip_id", t.id).order("created_at", { ascending: true }),
      ]);
      if (off) return;
      setEvents((e.data ?? []) as EventRow[]);
      setHands((h.data ?? []) as HandoverRow[]);
    })();
    return () => { off = true; };
  }, [t.id, t.status]);


  const dist = useMemo(() => (geo.lastFix && t.dest_lat != null && t.dest_lng != null ? distanceKm(geo.lastFix, { lat: t.dest_lat, lng: t.dest_lng }) : null), [geo.lastFix, t.dest_lat, t.dest_lng]);
  const fr = freshness(geo.lastSentAt);
  const phone = t.job?.phone?.replace(/\s/g, "");
  const hasCoords = t.dest_lat != null && t.dest_lng != null;
  const mapSrc = hasCoords ? `https://www.openstreetmap.org/export/embed.html?bbox=${t.dest_lng! - 0.006},${t.dest_lat! - 0.004},${t.dest_lng! + 0.006},${t.dest_lat! + 0.004}&layer=mapnik&marker=${t.dest_lat},${t.dest_lng}` : null;

  async function shareTracking() {
    setSharing(true);
    const r = await apiFetch("/api/field/tracking-link", { method: "POST", body: JSON.stringify({ jobId: t.job_id }) });
    setSharing(false);
    if (!r.ok || !r.json?.ok) { toast.error(r.json?.error ?? "Could not create tracking link."); return; }
    const first = (t.job?.customer ?? "").replace(/^\[TEST\]\s*/, "").split(" ")[0];
    const msg = `Hi ${first || "there"}, this is your RepairOX ${t.trip_type === "drop" ? "delivery" : t.trip_type === "onsite" ? "service" : "pickup"} partner. Track your service live here: ${r.json.url}`;
    const d = (phone ?? "").replace(/\D/g, "");
    const wa = d ? `https://wa.me/${d.length === 10 ? "91" + d : d}?text=${encodeURIComponent(msg)}` : null;
    if (wa) window.open(wa, "_blank", "noopener");
    else if (navigator.share) { try { await navigator.share({ text: msg }); } catch { /* cancelled */ } }
    else { await navigator.clipboard.writeText(msg); toast.success("Tracking message copied."); }
  }

  async function primary() {
    if (!step) return;
    if (step.kind === "transition" && step.to) {
      setBusy(true);
      // Starting a journey puts the Ninja on duty (idempotent shared Work Session).
      if (!openSession && ["en_route_customer", "en_route_store", "arrived_store"].includes(step.to)) { try { await startWork(); } catch { /* non-blocking */ } }
      await transition(t, step.to);
      setBusy(false);
    }
    else if (step.kind === "collect") setSheet("collect");
    else if (step.kind === "submit_store") setSheet("submit");
    else if (step.kind === "receive_store") setSheet("receive");
    else if (step.kind === "deliver") setSheet("deliver");
    else if (step.kind === "service_outcome") setSheet("service");
  }

  const canProblem = !closed && t.status !== "assigned";
  const TypeIcon = TYPE_STYLE[t.trip_type].icon;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1E2A78] via-[#2F46C4] to-[#4361EE] p-5 text-white shadow-[0_24px_50px_-24px_rgba(47,70,196,0.9)]">
        <div className="pointer-events-none absolute -right-12 -top-14 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <span className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-white/15 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider ring-1 ring-white/25"><TypeIcon className="h-3.5 w-3.5" />{TYPE_LABEL[t.trip_type]}</span>
            <span className="text-[12px] font-bold tabular-nums text-white/70">{t.trip_no}</span>
          </div>
          <h1 className="mt-4 font-display text-[26px] font-extrabold leading-tight tracking-tight">{t.job?.customer || "Customer"}</h1>
          <p className="mt-1 flex items-center gap-2 text-[14px] font-semibold text-white/80"><Smartphone className="h-4 w-4" />{t.job?.device || "Device"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[12px] font-extrabold text-[#2F46C4]"><span className="h-2 w-2 rounded-full bg-[#4361EE]" />{STATUS_META[t.status].label}</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-bold ring-1 ring-white/20"><Clock className="h-3.5 w-3.5" />{whenLabel(t.scheduled_at, t.scheduled_window)}</span>
          </div>
          {!["assigned", "awaiting_assignment"].includes(t.status) && !closed ? <div className="mt-6 rounded-2xl bg-black/15 px-2 pb-3 pt-4"><Stepper t={t} /></div> : null}
        </div>
      </motion.div>

      {/* Accept / Reject */}
      {t.status === "assigned" ? (
        <Card className="p-4">
          <p className="text-[15px] font-extrabold">New assignment</p>
          <p className="mt-1 text-[13px] text-slate-500">Review the details below, then accept or reject. A reason is required to reject.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Btn tone="ghost" onClick={() => setSheet("reject")}><XCircle className="h-5 w-5" />Reject</Btn>
            <Btn tone="success" loading={busy} onClick={async () => { setBusy(true); await accept(t); setBusy(false); }}><CheckCircle2 className="h-5 w-5" />Accept</Btn>
          </div>
        </Card>
      ) : null}

      {/* Primary next action */}
      {step && step.kind !== "wait" ? (
        <Card className="border-[#4361EE]/25 p-4">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#4361EE]">Next step</p>
          <p className="mt-1 text-[17px] font-extrabold leading-tight">{step.label}</p>
          {step.hint ? <p className="mt-1 text-[13px] text-slate-500">{step.hint}</p> : null}
          <div className="mt-4">
            {step.kind === "transition" ? <SwipeConfirm label={`Slide to ${step.label.toLowerCase()}`} loading={busy} tone={step.to === "completed" ? "success" : "primary"} onConfirm={primary} />
              : <Btn className="w-full text-[16px]" loading={busy} onClick={primary}>{step.label}</Btn>}
          </div>
        </Card>
      ) : null}
      {step?.kind === "wait" ? (
        <Card className="flex items-start gap-3 bg-amber-50/70 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><Store className="h-5 w-5" /></span>
          <div><p className="text-[15px] font-extrabold text-amber-900">{step.label}</p><p className="mt-0.5 text-[13px] text-amber-800">{step.waitingOn}</p></div>
        </Card>
      ) : null}
      {closed ? (
        <Card className={`p-4 ${t.status === "completed" ? "bg-emerald-50/70" : "bg-slate-50"}`}>
          <p className="text-[15px] font-extrabold">{t.status === "completed" ? "Trip completed" : STATUS_META[t.status].label}</p>
          {t.failure_reason ? <p className="mt-1 text-[13px] text-slate-600">{t.failure_reason}</p> : null}
        </Card>
      ) : null}

      {/* Quick actions */}
      {t.status !== "awaiting_assignment" ? (
        <div className="grid grid-cols-3 gap-3">
          <a href={navLink(t)} target="_blank" rel="noreferrer" className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-3xl bg-white text-[12px] font-extrabold text-slate-700 shadow-[0_10px_24px_-18px_rgba(20,30,80,0.5)] ring-1 ring-slate-200/80 transition active:scale-95"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#EEF1FD] text-[#4361EE]"><Navigation className="h-5 w-5" /></span>Navigate</a>
          {phone ? <a href={`tel:${phone}`} className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-3xl bg-white text-[12px] font-extrabold text-slate-700 shadow-[0_10px_24px_-18px_rgba(20,30,80,0.5)] ring-1 ring-slate-200/80 transition active:scale-95"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Phone className="h-5 w-5" /></span>Call</a>
            : <span className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-3xl bg-slate-50 text-[12px] font-bold text-slate-300 ring-1 ring-slate-200"><Phone className="h-6 w-6" />Call</span>}
          <button disabled={!canProblem} onClick={() => setSheet("problem")} className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-3xl bg-white text-[12px] font-extrabold text-slate-700 shadow-[0_10px_24px_-18px_rgba(20,30,80,0.5)] ring-1 ring-slate-200/80 transition active:scale-95 disabled:opacity-40"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-rose-50 text-rose-500"><AlertTriangle className="h-5 w-5" /></span>Problem</button>
        </div>
      ) : null}

      {!closed && t.status !== "assigned" && t.status !== "awaiting_assignment" ? (
        <button onClick={() => void shareTracking()} disabled={sharing}
          className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[14.5px] font-extrabold text-white shadow-[0_10px_24px_-12px_rgba(5,150,105,0.8)] transition active:scale-[0.98] disabled:opacity-60">
          {sharing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <MessageSquareText className="h-5 w-5" />}
          Send live tracking to customer
        </button>
      ) : null}

      {/* Location sharing */}
      {tracking ? (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[14px] font-extrabold"><Radio className={`h-5 w-5 ${geo.sharing ? "text-emerald-600" : "text-slate-400"}`} />Location sharing</p>
            <Pill tone={geo.sharing ? fr.tone : "slate"}>{geo.sharing ? fr.label : "Off"}</Pill>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] font-bold uppercase text-slate-400">Last sync</p><p className="mt-0.5 text-[13px] font-extrabold">{geo.lastSentAt ? ago(geo.lastSentAt) : "—"}</p></div>
            <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] font-bold uppercase text-slate-400">Accuracy</p><p className="mt-0.5 text-[13px] font-extrabold">{geo.accuracy != null ? `${Math.round(geo.accuracy)} m` : "—"}</p></div>
            <div className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] font-bold uppercase text-slate-400">To go</p><p className="mt-0.5 text-[13px] font-extrabold">{dist != null ? `${dist.toFixed(1)} km` : "—"}</p></div>
          </div>
          {geo.error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[12.5px] font-semibold text-rose-700">{geo.error}</p> : null}
          <p className="mt-3 text-[12px] leading-snug text-slate-400">Your location is shared with your manager (and the customer's tracking page) only while this journey is active. {geo.background ? "Sharing continues in the background until you arrive." : "In the browser, keep this screen open while travelling. The installed Ninja app keeps sharing in the background."}</p>
        </Card>
      ) : null}

      {/* Map */}
      {mapSrc ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <MapFrame src={mapSrc} />
          <a href={mapsLink(t)} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 py-3 text-[13px] font-bold text-[#4361EE]"><ExternalLink className="h-4 w-4" />Open in Google Maps</a>
        </div>
      ) : null}

      {/* Details */}
      <SectionTitle>Job details</SectionTitle>
      <Card className="divide-y divide-slate-100 px-4">
        <Row icon={<User className="h-4 w-4" />} label="Customer" value={t.job?.customer} />
        <Row icon={<Phone className="h-4 w-4" />} label="Mobile" value={t.job?.phone ? <a className="text-[#4361EE]" href={`tel:${phone}`}>{t.job.phone}</a> : null} />
        <Row icon={<MapPin className="h-4 w-4" />} label={t.trip_type === "drop" ? "Delivery address" : "Address"} value={[t.dest_address, t.job?.pincode].filter(Boolean).join(" · ")} />
        <Row icon={<MapPin className="h-4 w-4" />} label="Landmark" value={t.job?.landmark} />
        <Row icon={<MessageSquareText className="h-4 w-4" />} label="Instructions" value={t.instructions || t.job?.location_instructions} />
        <Row icon={<Smartphone className="h-4 w-4" />} label="Device" value={t.job?.device} />
        <Row icon={<AlertTriangle className="h-4 w-4" />} label="Issue" value={t.job?.issue} />
        <Row icon={<Hash className="h-4 w-4" />} label="IMEI / Serial" value={t.job?.imei} />
        <Row icon={<Store className="h-4 w-4" />} label="Store" value={t.job?.branch} />
        <Row icon={<ShieldCheck className="h-4 w-4" />} label="Job reference" value={t.job?.job_no} />
      </Card>

      {/* Documents */}
      {hands.length > 0 ? (
        <>
          <SectionTitle>Proof & documents</SectionTitle>
          <div className="space-y-2">
            {hands.map((h) => (
              <Link key={h.id} href={`/ninja/receipt/${t.id}?h=${h.id}`} className="block">
                <Card className="flex items-center gap-3 p-3.5 active:scale-[0.99]">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]"><FileText className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-extrabold">{HAND_LABEL[h.kind] ?? h.kind}</p><p className="text-[12px] text-slate-500">{new Date(h.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p></div>
                  <Pill tone={h.status === "accepted" ? "green" : h.status === "rejected" ? "rose" : "amber"}>{h.status}</Pill>
                </Card>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {/* Timeline */}
      <SectionTitle>Activity</SectionTitle>
      <Card className="p-4">
        {events.length === 0 ? <p className="text-[13px] text-slate-400">No activity yet.</p> : (
          <ol className="space-y-4">
            {events.map((e, i) => (
              <li key={e.id} className="relative flex gap-3">
                {i < events.length - 1 ? <span className="absolute left-[11px] top-6 h-[calc(100%+4px)] w-px bg-slate-200" /> : null}
                <span className={`relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ring-4 ring-[#2F46C4] ${e.event_type === "problem_reported" ? "bg-rose-100 text-rose-600" : "bg-[#EEF1FD] text-[#4361EE]"}`}><span className="h-2 w-2 rounded-full bg-current" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold text-slate-800">
                    {e.event_type === "status_changed" && e.new_status ? (STATUS_META[e.new_status as keyof typeof STATUS_META]?.label ?? e.new_status)
                      : e.event_type === "created" ? "Trip created" : e.event_type === "problem_reported" ? "Problem reported" : "Note"}
                  </p>
                  {e.note ? <p className="text-[12.5px] text-slate-600">{e.note}</p> : null}
                  <p className="text-[11px] text-slate-400">{e.actor_name ? `${e.actor_name} · ` : ""}{new Date(e.occurred_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <CollectSheet t={t} open={sheet === "collect"} onClose={() => setSheet(null)} />
      <SubmitStoreSheet t={t} open={sheet === "submit"} onClose={() => setSheet(null)} />
      <ReceiveStoreSheet t={t} open={sheet === "receive"} onClose={() => setSheet(null)} />
      <DeliverSheet t={t} open={sheet === "deliver"} onClose={() => setSheet(null)} />
      <ServiceSheet t={t} open={sheet === "service"} onClose={() => setSheet(null)} />
      <ProblemSheet t={t} open={sheet === "problem"} onClose={() => setSheet(null)} />
      <RejectSheet t={t} open={sheet === "reject"} onClose={() => setSheet(null)} />
      <span className="hidden">{Object.keys(TONE).length}</span>
    </div>
  );
}

function MapFrame({ src }: { src: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="relative h-48 w-full bg-slate-100">
      {!ok ? <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 to-slate-200" /> : null}
      <iframe title="Destination map" src={src} loading="lazy" tabIndex={-1} onLoad={() => setOk(true)} className={`pointer-events-none h-full w-full transition-opacity duration-500 ${ok ? "opacity-100" : "opacity-0"}`} />
    </div>
  );
}
