"use client";
/* Action of Trip → live status box. Same modal language as the Lead "Device &
   Issue Details" overlay (dimmed backdrop, white card, thin indigo ring), but the
   body is a REALTIME horizontal journey tracker fed by the Ninja app. */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, UserPlus, UserRound, Clock, CheckCircle2, Radio, ExternalLink, AlertTriangle, Timer } from "lucide-react";
import { ModalPortal } from "@/components/ui/modal-portal";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { AcceptTicket } from "@/components/ninja/accept-ticket";
import { TripStageStrip, useTripEvents } from "@/components/field/trip-stage-strip";
import { STATUS_META, TYPE_LABEL, ago, freshness } from "@/lib/ninja/model";
import type { JobLive } from "@/lib/field-live";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/time-format";

const fmt = (iso?: string | null) => (iso ? formatDateTime(iso) : "—");

function Box({ icon: Icon, label, value, tone }: { icon: typeof Clock; label: string; value: string; tone: string }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5", tone)}>
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider opacity-70"><Icon className="h-3 w-3" />{label}</p>
      <p className="mt-0.5 truncate text-[13.5px] font-extrabold" title={value}>{value}</p>
    </div>
  );
}

export function TripLiveOverlay({ open, onClose, live, jobNo, customer, ninjaName, rejectedByName, onReassign }: {
  open: boolean; onClose: () => void; live: JobLive | null; jobNo: string; customer: string;
  ninjaName: string; rejectedByName?: string; onReassign?: () => void;
}) {
  const events = useTripEvents(open ? live?.id : null);
  const [, tick] = useState(0);
  const [ses, setSes] = useState<{ last_point_at: string | null; last_lat: number | null; last_lng: number | null } | null>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    const iv = setInterval(() => tick((n) => n + 1), 10000);
    return () => { document.removeEventListener("keydown", k); clearInterval(iv); };
  }, [open, onClose]);
  useEffect(() => {
    if (!open || !supabase || !live?.id) { setSes(null); return; }
    let off = false;
    const tripId = live.id;
    const load = async () => {
      const { data } = await supabase!.from("field_tracking_sessions").select("last_point_at,last_lat,last_lng").eq("trip_id", tripId).is("ended_at", null).maybeSingle();
      if (!off) setSes((data as typeof ses) ?? null);
    };
    void load();
    const ch = supabase.channel(`trip-ses-${tripId}`).on("postgres_changes", { event: "*", schema: "public", table: "field_tracking_sessions", filter: `trip_id=eq.${tripId}` }, () => void load()).subscribe();
    return () => { off = true; supabase?.removeChannel(ch); };
  }, [open, live?.id]);

  const rej = live?.rejected ?? null;
  const meta = live ? STATUS_META[live.status] : null;
  const fr = freshness(ses?.last_point_at);
  return (
    <ModalPortal>
      <AnimatePresence>
        {open && live && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
            className="fixed inset-0 z-[9998] grid place-items-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-[3px]">
            <motion.div initial={{ scale: 0.96, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 12 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }} onClick={(e) => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-labelledby="trip-live-title"
              className="relative my-auto flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-inset ring-[#4361EE]/25">
              <div className="flex items-start gap-3 border-b border-border px-5 py-4">
                <div className="min-w-0 flex-1">
                  <h3 id="trip-live-title" className="flex items-center gap-2 font-display text-base font-bold tracking-tight">
                    Trip Live Status
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200"><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70 motion-safe:animate-ping" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>LIVE</span>
                  </h3>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">{live.trip_no ?? jobNo} · {TYPE_LABEL[live.trip_type]} · {customer}</p>
                </div>
                <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex-1 space-y-5 overflow-y-auto bg-indigo-50/20 p-6">
                {rej ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-rose-800"><AlertTriangle className="h-4 w-4" />{rejectedByName || "The Ninja"} rejected this assignment · {fmt(rej.at)}</p>
                      <p className="mt-0.5 text-[12.5px] text-rose-700">{rej.reason ? `Reason: “${rej.reason}”` : "No reason given."} It needs a new Ninja.</p>
                    </div>
                    {onReassign ? <Button size="sm" onClick={onReassign}>Reassign Ninja</Button> : null}
                  </div>
                ) : null}
                {!rej && (live.status === "awaiting_assignment" || live.status === "assigned" || live.status === "accepted") && onReassign ? (
                  <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3",
                    live.status === "awaiting_assignment" ? "border-[#4361EE]/30 bg-[#EEF1FD]/70" : "border-border bg-card")}>
                    <p className="text-[13px] font-semibold text-foreground">
                      {live.status === "awaiting_assignment" ? "No Ninja is assigned to this trip yet." : "Need a different Ninja or a new time?"}
                    </p>
                    <Button size="sm" variant={live.status === "awaiting_assignment" ? "primary" : "outline"} className="gap-1.5" onClick={onReassign}>
                      <UserPlus className="h-3.5 w-3.5" />{live.status === "awaiting_assignment" ? "Assign Ninja" : "Reassign / reschedule"}
                    </Button>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                  <Box icon={UserRound} label="Ninja" value={rej ? "Unassigned" : ninjaName || "—"} tone={rej ? "border-rose-200 bg-rose-50 text-rose-800" : "border-violet-200 bg-violet-50 text-violet-800"} />
                  <Box icon={Clock} label="Assigned" value={fmt(live.assigned_at)} tone="border-amber-200 bg-amber-50 text-amber-900" />
                  <Box icon={CheckCircle2} label="Accepted" value={live.accepted_at ? fmt(live.accepted_at) : rej ? "Rejected" : "Not yet"} tone={live.accepted_at ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"} />
                  <Box icon={Radio} label="Current stage" value={rej ? "Needs reassignment" : meta?.label ?? "—"} tone={rej ? "border-rose-200 bg-rose-50 text-rose-800" : "border-sky-200 bg-sky-50 text-sky-800"} />
                </div>
                {live.status === "assigned" ? (
                  <div className="mx-auto max-w-md space-y-1.5">
                    <AcceptTicket t={{ assigned_at: live.assigned_at, accept_deadline_at: live.accept_deadline_at, created_at: live.created_at }} />
                    <p className="flex items-center justify-center gap-1.5 text-[11.5px] font-medium text-muted-foreground"><Timer className="h-3.5 w-3.5" />Waiting for {ninjaName || "the Ninja"} to accept{live.accept_deadline_at ? " · custom time" : ""}</p>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-border bg-card px-5 py-6"><TripStageStrip live={live} events={events} /></div>
                {ses ? (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 text-[12.5px]">
                    <span className="flex items-center gap-1.5 font-extrabold text-emerald-700"><Radio className="h-4 w-4" />{fr.label}</span>
                    <span className="text-muted-foreground">Last location {ago(ses.last_point_at)}</span>
                    {ses.last_lat != null ? <a className="ml-auto inline-flex items-center gap-1 font-semibold text-[#4361EE]" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${ses.last_lat},${ses.last_lng}`}><ExternalLink className="h-3.5 w-3.5" />Open map</a> : null}
                  </div>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}
