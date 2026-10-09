"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Sales Agent presence (who is online / actively working).

   One SHARED presence roster for the whole organization: every client (owner
   and every individual Sales Agent) joins the SAME Supabase Realtime Presence
   channel ("sales-agents-presence"), tracks itself, and reads the combined
   presence state. So everyone sees the same live online/offline picture.

   "Online" basis (option C — app-wide + idle timeout):
     • Tracked once APP-WIDE (mounted in the app shell), so a user is online
       whenever they have ANY RepairOX page open — not just one screen.
     • A user is marked ONLINE while their session is connected AND they have
       interacted (mouse/keyboard/scroll/touch/visible tab) within the idle
       window. After IDLE_MS of no activity the client UNTRACKS → everyone sees
       them flip to offline, even with the tab still open. Any activity (or the
       tab regaining focus) re-tracks them instantly.

   Dual-mode (mirrors the rest of the app):
     • Supabase configured → Realtime Presence channel (truly shared, live).
     • Local/demo mode      → a localStorage heartbeat so the UI still works
                              (single-browser, but functional and consistent).

   This is a lightweight PRESENCE layer only — it never stores lead data, never
   changes permissions, and never affects any metric.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/** A single presence meta row tracked by a connected client. */
export interface PresenceMeta {
  /** staff.id — same id space as SalesAgent.id / useSession().id. */
  id: string;
  name: string;
  /** ISO timestamp of when this client came online (for "active since"). */
  onlineAt: string;
}

const CHANNEL = "sales-agents-presence";

/* ──────────────────────────────────────────────────────────────────────────
   SHARED CHANNEL MANAGER

   Supabase Realtime keys channels by topic, so `supabase.channel(CHANNEL)`
   returns the SAME underlying instance everywhere in one browser tab. The
   tracker and the roster both need this topic (to share presence across
   clients), but they are two separate React hooks that each want to attach
   `.on('presence', …)` handlers. If the second hook attaches a handler AFTER
   the first already called `.subscribe()`, supabase-js throws:
     "cannot add `presence` callbacks … after `subscribe()`".

   To avoid that race entirely we create ONE channel per topic, register ALL
   presence handlers up front, call `.subscribe()` exactly once, and
   reference-count the hooks that use it. The channel is torn down only when
   the last user unsubscribes. `onSync` listeners (the roster) are added/removed
   independently of the single underlying subscription.
   ────────────────────────────────────────────────────────────────────────── */

interface SharedChannel {
  channel: RealtimeChannel;
  refCount: number;
  subscribed: boolean;
  syncListeners: Set<() => void>;
}

const sharedChannels = new Map<string, SharedChannel>();

function acquireChannel(topic: string): SharedChannel | null {
  if (!isSupabaseConfigured || !supabase) return null;

  let shared = sharedChannels.get(topic);
  if (!shared) {
    // A stable presence key per browser tab; actual tracking is opt-in via
    // channel.track(), so merely joining does not make this client "online".
    const key = `rx-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(topic, { config: { presence: { key } } });

    shared = { channel, refCount: 0, subscribed: false, syncListeners: new Set() };

    const fire = () => shared!.syncListeners.forEach((fn) => fn());
    // All handlers are registered BEFORE subscribe() — never after.
    channel
      .on("presence", { event: "sync" }, fire)
      .on("presence", { event: "join" }, fire)
      .on("presence", { event: "leave" }, fire);

    sharedChannels.set(topic, shared);
  }

  shared.refCount += 1;
  if (!shared.subscribed) {
    shared.subscribed = true;
    shared.channel.subscribe();
  }
  return shared;
}

function releaseChannel(topic: string) {
  const shared = sharedChannels.get(topic);
  if (!shared) return;
  shared.refCount -= 1;
  if (shared.refCount <= 0) {
    sharedChannels.delete(topic);
    try {
      void shared.channel.untrack();
    } catch {
      /* ignore */
    }
    supabase?.removeChannel(shared.channel);
  }
}

/** Mark a user "away" (offline) after this long with no interaction. */
const IDLE_MS = 5 * 60_000; // 5 minutes

/* Local-mode heartbeat store (shared within one browser across tabs). */
const LOCAL_KEY = "repairox-sales-presence";
const LOCAL_TTL_MS = 20_000; // a local heartbeat older than this = offline
const LOCAL_BEAT_MS = 8_000;

type LocalBeat = { id: string; name: string; onlineAt: string; at: number };

function readLocalBeats(): LocalBeat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    const list: LocalBeat[] = raw ? JSON.parse(raw) : [];
    const now = Date.now();
    return list.filter((b) => now - b.at < LOCAL_TTL_MS);
  } catch {
    return [];
  }
}

function writeLocalBeat(me: LocalBeat | null, selfId: string) {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const others = readLocalBeats().filter((b) => b.id !== (selfId || "__none__"));
    const next = me ? [...others, { ...me, at: now }] : others;
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota/parse errors */
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   TRACKER — mount this ONCE, app-wide (in the app shell), for the signed-in
   user. It publishes the user's presence with an idle timeout. It does not
   return a roster; use useSalesPresenceRoster() to read who's online.
   ────────────────────────────────────────────────────────────────────────── */
export function useSalesPresenceTracker(me: { id?: string; name?: string }) {
  const meRef = useRef(me);
  meRef.current = me;

  useEffect(() => {
    const myId = me.id || "";
    if (!myId) return;
    if (typeof window === "undefined") return;

    const onlineAt = new Date().toISOString();
    let lastActivity = Date.now();
    let isActive = true;

    // ── Supabase Realtime Presence path (shared channel) ──
    const useDb = isSupabaseConfigured && !!supabase;
    const shared = useDb ? acquireChannel(CHANNEL) : null;
    const channel = shared?.channel ?? null;

    const track = () => {
      if (channel) {
        void channel.track({ id: myId, name: meRef.current.name || "", onlineAt } satisfies PresenceMeta);
      } else {
        writeLocalBeat({ id: myId, name: meRef.current.name || "", onlineAt, at: Date.now() }, myId);
      }
    };
    const untrack = () => {
      if (channel) void channel.untrack();
      else writeLocalBeat(null, myId);
    };

    if (channel) {
      // The shared channel subscribes once in acquireChannel(). Track as soon
      // as it is joined; if it's already subscribed, track immediately.
      if (channel.state === "joined") {
        if (isActive) track();
      } else {
        // Observe join via the shared sync listeners (fires on sync/join/leave).
        const onJoined = () => {
          if (channel.state === "joined" && isActive) {
            track();
            shared?.syncListeners.delete(onJoined);
          }
        };
        shared?.syncListeners.add(onJoined);
      }
    } else {
      track();
    }

    // ── Activity + idle detection ──
    const markActivity = () => {
      lastActivity = Date.now();
      if (!isActive) {
        isActive = true;
        track(); // came back from idle → online again
      }
    };
    const checkIdle = () => {
      const idleFor = Date.now() - lastActivity;
      if (isActive && idleFor >= IDLE_MS) {
        isActive = false;
        untrack(); // gone idle → offline for everyone
      } else if (isActive) {
        // Local mode needs a periodic re-beat to stay "fresh".
        if (!channel) track();
      }
    };

    const activityEvents = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"];
    activityEvents.forEach((ev) => window.addEventListener(ev, markActivity, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState === "visible") markActivity();
    };
    document.addEventListener("visibilitychange", onVisible);
    const onLeave = () => untrack();
    window.addEventListener("beforeunload", onLeave);

    const idleTimer = window.setInterval(checkIdle, Math.min(IDLE_MS, LOCAL_BEAT_MS));

    return () => {
      activityEvents.forEach((ev) => window.removeEventListener(ev, markActivity));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeunload", onLeave);
      window.clearInterval(idleTimer);
      untrack();
      if (shared) releaseChannel(CHANNEL);
    };
  }, [me.id, me.name]);
}

/* ──────────────────────────────────────────────────────────────────────────
   ROSTER — read-only. Join the channel (without tracking) and expose the live
   set of online user ids + their meta. Use this in any UI that displays who's
   online (e.g. the header pill).
   ────────────────────────────────────────────────────────────────────────── */
export function useSalesPresenceRoster() {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [metaById, setMetaById] = useState<Record<string, PresenceMeta>>({});

  const apply = useCallback((metas: PresenceMeta[]) => {
    const ids = new Set<string>();
    const map: Record<string, PresenceMeta> = {};
    for (const m of metas) {
      if (!m?.id) continue;
      ids.add(m.id);
      const prev = map[m.id];
      if (!prev || (m.onlineAt && m.onlineAt < prev.onlineAt)) map[m.id] = m;
    }
    setOnlineIds(ids);
    setMetaById(map);
  }, []);

  /* ── Supabase Realtime Presence (shared, live) ── */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    // Join the ONE shared channel for this topic. Presence handlers are already
    // registered on it (before subscribe), so we only attach a sync listener —
    // never a late `.on('presence', …)` that would throw.
    const shared = acquireChannel(CHANNEL);
    if (!shared) return;

    const sync = () => {
      const state = shared.channel.presenceState() as Record<string, PresenceMeta[]>;
      const metas: PresenceMeta[] = [];
      for (const key of Object.keys(state)) {
        for (const entry of state[key]) {
          if (entry?.id) metas.push(entry);
        }
      }
      apply(metas);
    };

    shared.syncListeners.add(sync);
    sync(); // seed with current state if already joined

    return () => {
      shared.syncListeners.delete(sync);
      releaseChannel(CHANNEL);
    };
  }, [apply]);

  /* ── Local/demo mode fallback (poll localStorage heartbeats) ── */
  useEffect(() => {
    if (isSupabaseConfigured && supabase) return;
    if (typeof window === "undefined") return;

    const read = () =>
      apply(readLocalBeats().map((b) => ({ id: b.id, name: b.name, onlineAt: b.onlineAt })));

    read();
    const timer = window.setInterval(read, 4_000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_KEY) read();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [apply]);

  return { onlineIds, metaById };
}
