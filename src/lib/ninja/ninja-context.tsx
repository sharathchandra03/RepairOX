"use client";
/* Ninja app state: trips (RLS-scoped to the signed-in Ninja), realtime,
   offline outbox replay, proofs upload and active-trip GPS sharing.
   Everything writes to the SAME RepairOX tables the manager website uses. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/use-session";
import { toast } from "@/components/ui/toaster";
import { nativeBackgroundAvailable, watchLocation } from "./native-location";
import {
  type NinjaTrip, type TripStatus, TRIP_SELECT, TRACKING_STATUSES, isClosed, statusRank,
} from "./model";
import {
  type OutboxItem, enqueue, readOutbox, removeItem, subscribeOutbox, updateItem, isNetworkError, uid,
} from "./outbox";

export interface GeoState {
  permission: "unknown" | "granted" | "denied" | "prompt" | "unsupported";
  sharing: boolean;
  lastSentAt: string | null;
  accuracy: number | null;
  lastFix: { lat: number; lng: number } | null;
  error: string | null;
  /** true in the installed app (background tracking); false in a browser (foreground only). */
  background: boolean;
}

export interface HandoverInput {
  kind: "customer_to_ninja" | "ninja_to_store" | "store_to_ninja" | "ninja_to_customer";
  status: "pending" | "accepted";
  deviceIdentity?: string;
  accessories?: string;
  conditionNotes?: string;
  ackMethod?: "signature" | "otp" | "store_confirm";
  evidence?: Record<string, unknown>;
  photos?: string[];       // data URLs, uploaded to field-proofs
  signature?: string;      // data URL
}

export interface NinjaNotice { id: string; kind: string; title: string; body: string | null; href: string | null; read: boolean; created_at: string }

export interface PastAssignment { tripId: string; tripNo: string | null; type: NinjaTrip["trip_type"]; customer: string | null; device: string | null; outcome: string; reason: string | null; at: string }

interface Ctx {
  staffId: string | null;
  past: PastAssignment[];
  notices: NinjaNotice[];
  unread: number;
  markAllRead: () => Promise<void>;
  trips: NinjaTrip[];
  loading: boolean;
  error: string | null;
  online: boolean;
  outbox: OutboxItem[];
  syncing: boolean;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
  accept: (t: NinjaTrip) => Promise<boolean>;
  reject: (t: NinjaTrip, reason: string) => Promise<boolean>;
  transition: (t: NinjaTrip, to: TripStatus, opts?: { reason?: string; note?: string }) => Promise<boolean>;
  handover: (t: NinjaTrip, h: HandoverInput) => Promise<boolean>;
  reportProblem: (t: NinjaTrip, problemId: string, label: string, note: string, status?: TripStatus) => Promise<boolean>;
  addNote: (t: NinjaTrip, note: string) => Promise<boolean>;
}

const NinjaCtx = createContext<Ctx | null>(null);
const GeoCtx = createContext<GeoState | null>(null);
/** GPS state lives in its own context so a location fix never re-renders job lists. */
export function useNinjaGeo(): GeoState {
  const g = useContext(GeoCtx);
  if (!g) throw new Error("useNinjaGeo must be used inside NinjaProvider");
  return g;
}
export function useNinja(): Ctx {
  const c = useContext(NinjaCtx);
  if (!c) throw new Error("useNinja must be used inside NinjaProvider");
  return c;
}

async function dataUrlToBlob(u: string): Promise<Blob> { return (await fetch(u)).blob(); }

export function NinjaProvider({ children }: { children: React.ReactNode }) {
  const { id: staffId } = useSession();
  const [trips, setTrips] = useState<NinjaTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [notices, setNotices] = useState<NinjaNotice[]>([]);
  const [past, setPast] = useState<PastAssignment[]>([]);
  const [geo, setGeo] = useState<GeoState>({ permission: "unknown", sharing: false, lastSentAt: null, accuracy: null, lastFix: null, error: null, background: false });
  useEffect(() => { setGeo((g) => ({ ...g, background: nativeBackgroundAvailable() })); }, []);
  const tripsRef = useRef<NinjaTrip[]>([]);
  tripsRef.current = trips;
  const seenAssigned = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);
  const syncingRef = useRef(false);

  /* ── load ── */
  const refresh = useCallback(async () => {
    if (!supabase || !staffId) return;
    const { data, error: err } = await supabase
      .from("field_trips").select(TRIP_SELECT)
      .eq("ninja_id", staffId).order("scheduled_at", { ascending: true, nullsFirst: false }).limit(300);
    if (err) { setError(err.message); setLoading(false); return; }
    setError(null);
    const rows = (data ?? []) as unknown as NinjaTrip[];
    // Announce brand-new assignments (not on first load).
    for (const t of rows) {
      if (t.status === "assigned" && !seenAssigned.current.has(t.id)) {
        seenAssigned.current.add(t.id);
      }
    }
    firstLoad.current = false;
    // Keep optimistic (queued) statuses visible until the server catches up.
    const pend = readOutbox().filter((i) => i.kind === "transition" && i.state === "pending");
    const merged = rows.map((t) => {
      const last = [...pend].reverse().find((i) => i.tripId === t.id);
      return last ? { ...t, status: last.payload.to as TripStatus } : t;
    });
    // Jobs the Ninja rejected / was moved off (kept as their own history; read-only).
    const { data: hist } = await supabase.from("field_assignments").select("trip_id,outcome,reject_reason,responded_at,assigned_at")
      .eq("ninja_id", staffId).in("outcome", ["rejected", "reassigned"]).order("assigned_at", { ascending: false }).limit(50);
    const hrows = (hist ?? []) as { trip_id: string; outcome: string; reject_reason: string | null; responded_at: string | null; assigned_at: string }[];
    const hid = [...new Set(hrows.map((h) => h.trip_id))];
    if (hid.length) {
      const { data: ht } = await supabase.from("field_trips").select("id,trip_no,trip_type,job:field_jobs(customer,device)").in("id", hid);
      const by = new Map(((ht ?? []) as unknown as { id: string; trip_no: string | null; trip_type: NinjaTrip["trip_type"]; job: { customer: string | null; device: string | null } | null }[]).map((x) => [x.id, x]));
      setPast(hrows.filter((h) => by.has(h.trip_id)).map((h) => { const x = by.get(h.trip_id)!; return { tripId: h.trip_id, tripNo: x.trip_no, type: x.trip_type, customer: x.job?.customer ?? null, device: x.job?.device ?? null, outcome: h.outcome, reason: h.reject_reason, at: h.responded_at ?? h.assigned_at }; }));
    } else setPast([]);
    setTrips((prev) => {
      const sig = (a: NinjaTrip[]) => a.map((t) => `${t.id}|${t.status}|${t.updated_at}|${t.ninja_id}|${t.scheduled_at}|${t.instructions}`).join("~");
      return sig(prev) === sig(merged) ? prev : merged;   // identical data => no re-render, no flicker
    });
    setLoading(false);
  }, [staffId]);

  useEffect(() => { void refresh(); }, [refresh]);

  /* ── DB notifications addressed to this Ninja (written by field_trips triggers) ── */
  const loadNotices = useCallback(async () => {
    if (!supabase || !staffId) return;
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data } = await supabase.from("notifications").select("id,kind,title,body,href,read,created_at")
      .eq("recipient_id", staffId).gte("created_at", since).order("created_at", { ascending: false }).limit(40);
    setNotices((data ?? []) as NinjaNotice[]);
  }, [staffId]);
  useEffect(() => { void loadNotices(); }, [loadNotices]);
  const markAllRead = useCallback(async () => {
    if (!supabase || !staffId) return;
    const ids = notices.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) return;
    setNotices((p) => p.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true, read_at: new Date().toISOString() }).in("id", ids);
  }, [notices, staffId]);
  useEffect(() => {
    if (!supabase || !staffId) return;
    const ch = supabase.channel(`ninja-notices-${staffId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${staffId}` }, (payload) => {
        const n = payload.new as NinjaNotice;
        setNotices((p) => (p.some((x) => x.id === n.id) ? p : [n, ...p].slice(0, 40)));
        toast.info(n.title);
        try { navigator.vibrate?.([120, 60, 120]); } catch { /* ignore */ }
        try {
          if (document.visibilityState !== "visible" && typeof Notification !== "undefined" && Notification.permission === "granted")
            new Notification(n.title, { body: n.body ?? "", tag: n.id });
        } catch { /* ignore */ }
        void refresh();
      })
      .subscribe();
    return () => { supabase?.removeChannel(ch); };
  }, [staffId, refresh]);

  /* ── online + outbox state ── */
  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    setOutbox(readOutbox());
    const on = () => { setOnline(true); void syncNow(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const unsub = subscribeOutbox(() => setOutbox(readOutbox()));
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── realtime (own trips only) + safety poll + focus refresh ── */
  useEffect(() => {
    if (!supabase || !staffId) return;
    const ch = supabase.channel(`ninja-trips-${staffId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "field_trips", filter: `ninja_id=eq.${staffId}` }, () => { void refresh(); })
      .subscribe();
    const poll = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30000);
    const vis = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", vis);
    return () => { supabase?.removeChannel(ch); clearInterval(poll); document.removeEventListener("visibilitychange", vis); };
  }, [staffId, refresh]);

  /* ── low-level executors (each returns ok | conflict | network | error) ── */
  type Res = "ok" | "conflict" | "network" | "error";

  const execTransition = useCallback(async (item: Pick<OutboxItem, "id" | "tripId" | "payload">): Promise<Res> => {
    if (!supabase) return "error";
    const { to, from, reason } = item.payload as { to: TripStatus; from: TripStatus; reason?: string };
    const patch: Record<string, unknown> = { status: to };
    if (reason) patch.failure_reason = reason;
    const { error: err, count } = await supabase.from("field_trips").update(patch, { count: "exact" }).eq("id", item.tripId).eq("status", from);
    if (err) {
      if (isNetworkError(err)) return "network";
      if (/invalid_transition|not_assignee|forbidden|store_action/.test(err.message)) return "conflict";
      return "error";
    }
    if ((count ?? 0) === 0) {
      // Already applied (retry) or the server moved on (conflict).
      const { data } = await supabase.from("field_trips").select("status").eq("id", item.tripId).maybeSingle();
      return data?.status === to ? "ok" : "conflict";
    }
    return "ok";
  }, []);

  const execEvent = useCallback(async (item: Pick<OutboxItem, "id" | "tripId" | "payload" | "createdAt">): Promise<Res> => {
    if (!supabase || !staffId) return "error";
    const trip = tripsRef.current.find((t) => t.id === item.tripId);
    const p = item.payload as { event_type: string; note?: string; payload?: unknown; location?: unknown };
    const { error: err } = await supabase.from("field_trip_events").insert({
      organization_id: trip?.organization_id, branch_id: trip?.branch_id ?? null, job_id: trip?.job_id, trip_id: item.tripId,
      lead_id: trip?.lead_id ?? null, event_type: p.event_type, note: p.note ?? null, payload: p.payload ?? null,
      location: p.location ?? null, actor_staff_id: staffId, idempotency_key: item.id, device_at: item.createdAt,
    });
    if (err) {
      if (err.code === "23505") return "ok";
      return isNetworkError(err) ? "network" : "error";
    }
    return "ok";
  }, [staffId]);

  const execHandover = useCallback(async (item: Pick<OutboxItem, "id" | "tripId" | "payload">): Promise<Res> => {
    if (!supabase || !staffId) return "error";
    const trip = tripsRef.current.find((t) => t.id === item.tripId);
    if (!trip) return "error";
    const h = item.payload as unknown as HandoverInput;
    try {
      const base = `${trip.organization_id}/${trip.id}`;
      const photoPaths: string[] = [];
      let i = 0;
      for (const ph of h.photos ?? []) {
        const path = `${base}/${item.id}-p${i++}.jpg`;
        const up = await supabase.storage.from("field-proofs").upload(path, await dataUrlToBlob(ph), { contentType: "image/jpeg", upsert: false });
        if (up.error && !/exists|duplicate/i.test(up.error.message)) throw up.error;
        photoPaths.push(path);
      }
      let sigPath: string | null = null;
      if (h.signature) {
        sigPath = `${base}/${item.id}-sig.png`;
        const up = await supabase.storage.from("field-proofs").upload(sigPath, await dataUrlToBlob(h.signature), { contentType: "image/png", upsert: false });
        if (up.error && !/exists|duplicate/i.test(up.error.message)) throw up.error;
      }
      const { error: err } = await supabase.from("field_handovers").insert({
        organization_id: trip.organization_id, branch_id: trip.branch_id, trip_id: trip.id, job_id: trip.job_id,
        kind: h.kind, status: h.status, from_staff_id: h.kind === "customer_to_ninja" || h.kind === "ninja_to_store" || h.kind === "ninja_to_customer" ? staffId : null,
        to_staff_id: h.kind === "store_to_ninja" ? staffId : null,
        device_identity: h.deviceIdentity ?? null, accessories: h.accessories ?? null, condition_notes: h.conditionNotes ?? null,
        ack_method: h.ackMethod ?? null, ack_at: h.ackMethod ? new Date().toISOString() : null,
        evidence: { ...(h.evidence ?? {}), photos: photoPaths, signature: sigPath }, idempotency_key: item.id,
      });
      if (err) {
        if (err.code === "23505") return "ok";
        return isNetworkError(err) ? "network" : "error";
      }
      return "ok";
    } catch (e) {
      return isNetworkError(e) ? "network" : "error";
    }
  }, [staffId]);

  const run = useCallback(async (item: OutboxItem): Promise<Res> => {
    if (item.kind === "transition") return execTransition(item);
    if (item.kind === "event") return execEvent(item);
    return execHandover(item);
  }, [execTransition, execEvent, execHandover]);

  /* ── outbox replay (ordered) ── */
  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true; setSyncing(true);
    try {
      for (const item of readOutbox().filter((i) => i.state === "pending")) {
        updateItem(item.id, { attempts: item.attempts + 1 });
        const r = await run(item);
        if (r === "ok") removeItem(item.id);
        else if (r === "conflict") { updateItem(item.id, { state: "conflict", error: "The job changed on the server while you were offline." }); toast.error("An offline action conflicted with the latest job state."); }
        else if (r === "error") updateItem(item.id, { state: "failed", error: "The server rejected this action." });
        else break; // still offline: stop, keep order
      }
    } finally { syncingRef.current = false; setSyncing(false); await refresh(); }
  }, [run, refresh]);

  useEffect(() => { const t = setInterval(() => { if (navigator.onLine && readOutbox().some((i) => i.state === "pending")) void syncNow(); }, 20000); return () => clearInterval(t); }, [syncNow]);

  /* ── submit helper: try now, queue on network failure ── */
  const submit = useCallback(async (kind: OutboxItem["kind"], tripId: string, payload: Record<string, unknown>, optimistic?: () => void): Promise<boolean> => {
    // Preserve ordering: if earlier items are still queued, queue this one too.
    const hasPending = readOutbox().some((i) => i.state === "pending");
    const draft: OutboxItem = { id: uid(), kind, tripId, createdAt: new Date().toISOString(), attempts: 0, state: "pending", payload };
    if (!hasPending && (typeof navigator === "undefined" || navigator.onLine)) {
      const r = await run(draft);
      if (r === "ok") return true;
      if (r === "conflict") { toast.error("This job was updated by someone else. Refreshed."); await refresh(); return false; }
      if (r === "error") { toast.error("Could not save. Please try again."); return false; }
    }
    enqueue({ id: draft.id, kind, tripId, payload });
    optimistic?.();
    toast.info("Saved on this phone. It will sync when you're online.");
    return true;
  }, [run, refresh]);

  const optimisticStatus = useCallback((tripId: string, to: TripStatus) => {
    setTrips((prev) => prev.map((t) => (t.id === tripId ? { ...t, status: to } : t)));
  }, []);

  /* ── public actions ── */
  const transition: Ctx["transition"] = useCallback(async (t, to, opts) => {
    const ok = await submit("transition", t.id, { from: t.status, to, reason: opts?.reason }, () => optimisticStatus(t.id, to));
    if (ok) { optimisticStatus(t.id, to); try { navigator.vibrate?.(25); } catch { /* ignore */ } }
    if (ok && opts?.note) await submit("event", t.id, { event_type: "comment", note: opts.note });
    await refresh();
    return ok;
  }, [submit, optimisticStatus, refresh]);

  const accept: Ctx["accept"] = useCallback((t) => transition(t, "accepted"), [transition]);

  const reject: Ctx["reject"] = useCallback(async (t, reason) => {
    const ok = await submit("transition", t.id, { from: t.status, to: "awaiting_assignment", reason },
      () => setTrips((prev) => prev.filter((x) => x.id !== t.id)));
    await refresh();
    return ok;
  }, [submit, refresh]);

  const handover: Ctx["handover"] = useCallback((t, h) => submit("handover", t.id, h as unknown as Record<string, unknown>), [submit]);

  const addNote: Ctx["addNote"] = useCallback((t, note) => submit("event", t.id, { event_type: "comment", note }), [submit]);

  const reportProblem: Ctx["reportProblem"] = useCallback(async (t, problemId, label, note, status) => {
    const loc = geoRef.current.lastFix;
    const ok = await submit("event", t.id, { event_type: "problem_reported", note: `${label}${note ? ` — ${note}` : ""}`, payload: { problem: problemId }, location: loc });
    if (ok && status) {
      // Move the trip only where the state machine allows it; otherwise the manager sees the event.
      const allowed = status === "rescheduled" ? ["assigned", "accepted"].includes(t.status)
        : ["en_route_customer", "arrived_customer", "pickup_in_progress", "delivery_in_progress", "service_in_progress"].includes(t.status);
      if (allowed) await submit("transition", t.id, { from: t.status, to: status, reason: label }, () => optimisticStatus(t.id, status));
    }
    await refresh();
    return ok;
  }, [submit, optimisticStatus, refresh]);

  /* ── GPS sharing: ONLY while a trip is in an en-route state ── */
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const trackTrip = useMemo(() => trips.find((t) => TRACKING_STATUSES.includes(t.status) && !isClosed(t)) ?? null, [trips]);
  const trackId = trackTrip?.id ?? null;

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) { setGeo((g) => ({ ...g, permission: "unsupported" })); return; }
    try { navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((p) => { setGeo((g) => ({ ...g, permission: p.state as GeoState["permission"] })); p.onchange = () => setGeo((g) => ({ ...g, permission: p.state as GeoState["permission"] })); }); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!trackId || !supabase || !staffId) { setGeo((g) => (g.sharing ? { ...g, sharing: false } : g)); return; }
    const trip = tripsRef.current.find((t) => t.id === trackId);
    if (!trip) return;
    let cancelled = false;
    let stopWatch: (() => void) | null = null;
    let wake: { release?: () => Promise<void> } | null = null;
    let sessionId: string | null = null;
    let lastSeq = 0;
    let lastSent = 0;
    let lastPos: { lat: number; lng: number } | null = null;
    const buffer: Record<string, unknown>[] = [];

    const flush = async () => {
      if (!sessionId || !buffer.length || !supabase) return;
      const batch = buffer.splice(0, buffer.length);
      const { error: err } = await supabase.from("field_location_points").insert(batch);
      if (err) { if (err.code !== "23505") buffer.unshift(...batch); }
      else setGeo((g) => ({ ...g, lastSentAt: new Date().toISOString(), error: null }));
    };

    const start = async () => {
      let { data: s } = await supabase!.from("field_tracking_sessions").select("id").eq("trip_id", trip.id).is("ended_at", null).maybeSingle();
      if (!s) {
        const ins = await supabase!.from("field_tracking_sessions").insert({ organization_id: trip.organization_id, branch_id: trip.branch_id, trip_id: trip.id, staff_id: staffId }).select("id").single();
        if (ins.error) { setGeo((g) => ({ ...g, error: "Could not start location sharing." })); return; }
        s = ins.data;
      }
      if (cancelled || !s) return;
      sessionId = s.id as string;
      setGeo((g) => ({ ...g, sharing: true, error: null }));
      try { wake = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* optional */ }
      stopWatch = await watchLocation(
        (f) => {
          const { lat, lng, accuracy, speed, heading } = f;
          setGeo((g) => ({ ...g, lastFix: { lat, lng }, accuracy, permission: "granted", error: null }));
          const now = Date.now();
          const moved = lastPos ? distanceM(lastPos, { lat, lng }) : Infinity;
          const due = moved > 25 ? now - lastSent > 10000 : now - lastSent > 45000; // adaptive: moving vs heartbeat
          if (!due || accuracy > 500) return;
          lastSent = now; lastPos = { lat, lng };
          lastSeq = Math.max(lastSeq + 1, Math.floor(now / 1000));
          buffer.push({ organization_id: trip.organization_id, session_id: sessionId, trip_id: trip.id, staff_id: staffId, seq: lastSeq, lat, lng, accuracy, speed, heading, source: nativeBackgroundAvailable() ? "gps_background" : "gps", device_at: new Date(f.at).toISOString() });
          void flush();
        },
        (code, message) => setGeo((g) => ({ ...g, error: message, permission: code === "denied" ? "denied" : g.permission })),
        trip.trip_no ?? "your trip",
      );
      if (cancelled) stopWatch();
    };
    void start();
    const retry = setInterval(() => { void flush(); }, 15000);
    return () => {
      cancelled = true; clearInterval(retry);
      stopWatch?.();
      void wake?.release?.();
      setGeo((g) => ({ ...g, sharing: false }));
    };
  }, [trackId, staffId]);

  const value = useMemo<Ctx>(() => ({
    staffId: staffId ?? null, past, notices, unread: notices.filter((n) => !n.read).length, markAllRead, trips, loading, error, online, outbox, syncing,
    refresh, syncNow, accept, reject, transition, handover, reportProblem, addNote,
  }), [staffId, past, notices, markAllRead, trips, loading, error, online, outbox, syncing, refresh, syncNow, accept, reject, transition, handover, reportProblem, addNote]);

  return <NinjaCtx.Provider value={value}><GeoCtx.Provider value={geo}>{children}</GeoCtx.Provider></NinjaCtx.Provider>;
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export { statusRank };
