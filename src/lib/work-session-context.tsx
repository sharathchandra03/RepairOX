"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Work Session context (dual-mode: Supabase / localStorage).

   The single client surface for Work Status + the signed-in user's work
   records. Supabase mode writes through the self-scoped /api/work-session/*
   routes (server-authoritative now()); local/demo mode replicates the state
   machine in localStorage and stamps timestamps from the client clock (the ONE
   documented exception to "server owns time" — Supabase mode only).

   Three concepts stay strictly separate: Online Presence (use-sales-presence),
   Work Status (derived here from the open session), Work Session (records).
   ────────────────────────────────────────────────────────────────────────── */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useStoreSettings } from "@/lib/store-settings";
import { demoKey } from "@/lib/demo-mode";
import { toast } from "@/components/ui/toaster";
import { STALE_MS, type WorkSessionRecord } from "@/lib/work-session";

export type WorkStatus = "working" | "on_break" | "logged_out" | "interrupted";

/** Client heartbeat cadence — mirrors use-session-tracker's HEARTBEAT_MS. */
const HEARTBEAT_MS = 60_000;

/** Fallback break-reminder threshold (minutes) when the org setting is absent
 *  or invalid. The live value is admin-configurable in Settings → Lead
 *  Management → Productivity (`productivityConfig.breakReminderMinutes`); break
 *  time is NOT productive time, so a forgotten break inflates the break total
 *  and shrinks net productive time — the reminder keeps the day accurate. */
const DEFAULT_BREAK_REMINDER_MINUTES = 5;

/** The break reminder only fires when the agent is ACTIVELY using RepairOX
 *  (real mouse/keyboard/scroll/touch within this window) — the whole signal is
 *  "you're clearly back at work but still marked on break". If they're truly
 *  away (no activity), stay silent instead of nagging into an empty room. */
const BREAK_ACTIVITY_WINDOW_MS = 30_000; // 30 seconds

/** Interaction events that count as "actively working" (mirrors the presence
 *  tracker's event set — kept local so Work Session never reads presence). */
const BREAK_ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel"] as const;

export interface UseWorkSession {
  hydrated: boolean;
  status: WorkStatus;
  openSession: WorkSessionRecord | null;
  todaySessions: WorkSessionRecord[];
  startWork: () => Promise<void>;
  startBreak: () => Promise<void>;
  endBreak: () => Promise<void>;
  endWork: (reason?: "logout") => Promise<void>;
  touch: () => Promise<void>;
  /** Best-effort final liveness stamp on tab hide / close (keepalive). */
  flushBeacon: () => void;
  rangeSessions: (fromISO: string, toISO: string) => Promise<WorkSessionRecord[]>;
}

const WorkSessionContext = createContext<UseWorkSession | null>(null);

/* ── Local-mode store ──────────────────────────────────────────────────────
   An array of WorkSessionRecord persisted per staff id, replicating the guard
   invariants (one open session, one open break). All ops are synchronous. */

function localStoreKey(staffId: string): string {
  return demoKey(`repairox-work-session::${staffId}`);
}

function readLocal(staffId: string): WorkSessionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localStoreKey(staffId));
    const arr = raw ? (JSON.parse(raw) as WorkSessionRecord[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocal(staffId: string, records: WorkSessionRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localStoreKey(staffId), JSON.stringify(records));
  } catch {
    /* ignore quota errors */
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isSameLocalDay(aISO: string, bISO: string): boolean {
  return aISO.slice(0, 10) === bISO.slice(0, 10);
}

/* ── Status derivation ─────────────────────────────────────────────────────── */

function deriveStatus(open: WorkSessionRecord | null, nowMs: number): WorkStatus {
  if (!open) return "logged_out";
  // Interrupted = open & stale (derived, read-time).
  if (nowMs - new Date(open.lastSeenAt).getTime() > STALE_MS) return "interrupted";
  const onBreak = open.breaks.some((b) => b.endedAt === null);
  return onBreak ? "on_break" : "working";
}

/* ── Provider ────────────────────────────────────────────────────────────── */

export function WorkSessionProvider({ children }: { children: ReactNode }) {
  const { apiFetch, authReady } = usePermissions();
  const { id: staffId } = useSession();

  const [hydrated, setHydrated] = useState(false);
  const [openSession, setOpenSession] = useState<WorkSessionRecord | null>(null);
  const [todaySessions, setTodaySessions] = useState<WorkSessionRecord[]>([]);
  const [, forceTick] = useState(0);

  const useSupabase = isSupabaseConfigured && !!supabase;
  const staffIdRef = useRef<string | undefined>(staffId);
  staffIdRef.current = staffId;

  /* A ticking "now" so the derived status (interrupted) and the live UI stay
     fresh without any persisted write. */
  useEffect(() => {
    const t = window.setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  /* ── Supabase helpers ── */
  const fetchCurrent = useCallback(async () => {
    if (!useSupabase) return;
    const res = await apiFetch("/api/work-session");
    if (res.ok && res.json?.ok) {
      setOpenSession((res.json.openSession as WorkSessionRecord | null) ?? null);
      setTodaySessions((res.json.todaySessions as WorkSessionRecord[]) ?? []);
    }
  }, [apiFetch, useSupabase]);

  /* ── Local helpers ── */
  const refreshLocal = useCallback(() => {
    const sid = staffIdRef.current;
    if (!sid) return;
    const all = readLocal(sid);
    const open = all.find((s) => s.endedAt === null) ?? null;
    const nowISO = new Date().toISOString();
    const today = all.filter((s) => isSameLocalDay(s.startedAt, nowISO));
    setOpenSession(open);
    setTodaySessions(today);
  }, []);

  /* ── Hydration ── */
  useEffect(() => {
    if (!authReady) return;
    let active = true;
    (async () => {
      if (useSupabase) {
        await fetchCurrent();
      } else {
        refreshLocal();
      }
      if (active) setHydrated(true);
    })();
    return () => {
      active = false;
    };
  }, [authReady, useSupabase, fetchCurrent, refreshLocal]);

  /* ── Realtime (Supabase) — own rows only, SEPARATE from the presence channel.
     Heartbeat-only (last_seen_at / updated_at) changes are suppressed: patch
     locally, never refetch. ── */
  useEffect(() => {
    if (!useSupabase || !supabase || !staffId) return;
    const db = supabase;
    const channel = db.channel(`work-session-${staffId}`);
    const onChange = (payload: any) => {
      const oldRow = payload.old ?? {};
      const newRow = payload.new ?? {};
      // Suppress heartbeat-only updates: when ONLY last_seen_at / updated_at
      // changed, patch last_seen_at locally without a refetch.
      if (payload.eventType === "UPDATE" && newRow && oldRow) {
        const changedKeys = Object.keys(newRow).filter(
          (k) => JSON.stringify(newRow[k]) !== JSON.stringify(oldRow[k]),
        );
        const onlyHeartbeat =
          changedKeys.length > 0 &&
          changedKeys.every((k) => k === "last_seen_at" || k === "updated_at");
        if (onlyHeartbeat) {
          setOpenSession((prev) =>
            prev && prev.id === newRow.id ? { ...prev, lastSeenAt: newRow.last_seen_at } : prev,
          );
          return;
        }
      }
      void fetchCurrent();
    };
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "work_sessions", filter: `staff_id=eq.${staffId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_session_breaks", filter: `staff_id=eq.${staffId}` }, () => void fetchCurrent())
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [useSupabase, staffId, fetchCurrent]);

  /* ── Local-mode cross-tab sync ── */
  useEffect(() => {
    if (useSupabase || !staffId) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === localStoreKey(staffId)) refreshLocal();
    };
    window.addEventListener("storage", onStorage);
    const poll = window.setInterval(refreshLocal, 5_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(poll);
    };
  }, [useSupabase, staffId, refreshLocal]);

  /* ── Error mapping ── */
  const mapError = useCallback((code: string | undefined) => {
    switch (code) {
      case "work_break_no_open_session":
        toast.error("Start work before taking a break.");
        break;
      case "work_break_already_open":
        toast.error("You're already on a break.");
        break;
      case "work_break_not_active":
        toast.error("No active break to end.");
        break;
      case "work_session_locked":
        toast.error("This session is completed and can't be changed.");
        break;
      default:
        if (code) toast.error("Something went wrong. Please try again.");
    }
  }, []);

  /* ── Operations ── */

  const startWork = useCallback(async () => {
    const sid = staffIdRef.current;
    if (!sid) return;
    if (useSupabase) {
      const res = await apiFetch("/api/work-session/start", { method: "POST" });
      if (res.ok && res.json?.ok) {
        // The /start route stamps a fresh last_seen_at on resume, so the
        // returned session already reads as "working". Set it directly — no
        // second blocking GET (that round-trip was the switching lag). Force
        // the session live locally as a belt-and-braces guard so the chip can
        // never flash back to "interrupted" on resume.
        const session = res.json.session as WorkSessionRecord | null;
        setOpenSession(
          session
            ? { ...session, lastSeenAt: new Date().toISOString(), status: "open" }
            : null,
        );
      }
      return;
    }
    // Local: idempotent — resume an existing open session (refresh liveness so
    // a stale/interrupted local session reads as working again).
    const all = readLocal(sid);
    const existingOpen = all.find((s) => s.endedAt === null);
    if (existingOpen) {
      existingOpen.lastSeenAt = new Date().toISOString();
      existingOpen.status = "open";
      writeLocal(sid, all);
      refreshLocal();
      return;
    }
    const nowISO = new Date().toISOString();
    all.push({
      id: uuid(),
      staffId: sid,
      branchId: null,
      startedAt: nowISO,
      endedAt: null,
      status: "open",
      breaks: [],
      lastSeenAt: nowISO,
    });
    writeLocal(sid, all);
    refreshLocal();
  }, [useSupabase, apiFetch, refreshLocal]);

  const startBreak = useCallback(async () => {
    const sid = staffIdRef.current;
    if (!sid) return;
    if (useSupabase) {
      // Optimistic: flip to on_break immediately so the chip responds without
      // waiting for the round-trip; reconcile with the authoritative row.
      const nowISO = new Date().toISOString();
      const prev = openSession;
      if (prev && !prev.breaks.some((b) => b.endedAt === null)) {
        setOpenSession({
          ...prev,
          lastSeenAt: nowISO,
          breaks: [...prev.breaks, { startedAt: nowISO, endedAt: null }],
        });
      }
      const res = await apiFetch("/api/work-session/break/start", { method: "POST" });
      if (res.ok && res.json?.ok) setOpenSession((res.json.session as WorkSessionRecord) ?? null);
      else {
        setOpenSession(prev); // revert the optimistic change
        mapError(res.json?.error);
      }
      return;
    }
    const all = readLocal(sid);
    const open = all.find((s) => s.endedAt === null);
    if (!open) {
      mapError("work_break_no_open_session");
      return;
    }
    if (open.breaks.some((b) => b.endedAt === null)) {
      mapError("work_break_already_open");
      return;
    }
    open.breaks.push({ startedAt: new Date().toISOString(), endedAt: null });
    writeLocal(sid, all);
    refreshLocal();
  }, [useSupabase, apiFetch, mapError, refreshLocal, openSession]);

  const endBreak = useCallback(async () => {
    const sid = staffIdRef.current;
    if (!sid) return;
    if (useSupabase) {
      // Optimistic: close the open break locally so the chip flips back to
      // working immediately; reconcile with the authoritative row.
      const nowISO = new Date().toISOString();
      const prev = openSession;
      if (prev && prev.breaks.some((b) => b.endedAt === null)) {
        setOpenSession({
          ...prev,
          lastSeenAt: nowISO,
          breaks: prev.breaks.map((b) => (b.endedAt === null ? { ...b, endedAt: nowISO } : b)),
        });
      }
      const res = await apiFetch("/api/work-session/break/end", { method: "POST" });
      if (res.ok && res.json?.ok) setOpenSession((res.json.session as WorkSessionRecord) ?? null);
      else {
        setOpenSession(prev); // revert the optimistic change
        mapError(res.json?.error);
      }
      return;
    }
    const all = readLocal(sid);
    const open = all.find((s) => s.endedAt === null);
    const active = open?.breaks.find((b) => b.endedAt === null);
    if (!open || !active) {
      mapError("work_break_not_active");
      return;
    }
    active.endedAt = new Date().toISOString();
    writeLocal(sid, all);
    refreshLocal();
  }, [useSupabase, apiFetch, mapError, refreshLocal, openSession]);

  const endWork = useCallback(
    async (_reason: "logout" = "logout") => {
      const sid = staffIdRef.current;
      if (!sid) return;
      if (useSupabase) {
        const res = await apiFetch("/api/work-session/end", { method: "POST" });
        if (res.ok && res.json?.ok) setOpenSession(null);
        return;
      }
      // Local: close synchronously (flushed before logout clears identity).
      const all = readLocal(sid);
      const open = all.find((s) => s.endedAt === null);
      if (!open) {
        refreshLocal();
        return;
      }
      const nowISO = new Date().toISOString();
      for (const b of open.breaks) if (b.endedAt === null) b.endedAt = nowISO;
      open.endedAt = nowISO;
      open.status = "completed";
      writeLocal(sid, all);
      refreshLocal();
    },
    [useSupabase, apiFetch, refreshLocal],
  );

  const touch = useCallback(async () => {
    const sid = staffIdRef.current;
    if (!sid) return;
    if (useSupabase) {
      await apiFetch("/api/work-session/touch", { method: "POST" });
      return;
    }
    const all = readLocal(sid);
    const open = all.find((s) => s.endedAt === null);
    if (!open) return;
    open.lastSeenAt = new Date().toISOString();
    writeLocal(sid, all);
    // No full refresh needed — patch the open session's lastSeenAt locally.
    setOpenSession((prev) => (prev && prev.id === open.id ? { ...prev, lastSeenAt: open.lastSeenAt } : prev));
  }, [useSupabase, apiFetch]);

  /* Best-effort FINAL liveness stamp when the tab is backgrounded or closed
     (user shuts down / closes the tab without logging out). A normal fetch is
     cancelled during unload, so this uses `keepalive: true` which survives the
     page teardown and can still carry the bearer token (unlike sendBeacon,
     which can't set the Authorization header). Stamping last_seen_at at the
     TRUE moment the user left means an abandoned session's elapsed/net is
     capped at that instant (via the pure engine) instead of counting toward
     `now` until the 30-min stale threshold trips — so the work time reflects
     reality, never fabricated "working" minutes after they've gone. Fire-and-
     forget: never awaited, never blocks teardown. */
  const flushBeacon = useCallback(() => {
    const sid = staffIdRef.current;
    if (!sid) return;
    if (useSupabase) {
      if (!supabase) return;
      void (async () => {
        try {
          const token = (await supabase.auth.getSession()).data.session?.access_token;
          // getSession resolves synchronously from the in-memory session during
          // a normal hide; if the tab is already torn down this just no-ops.
          void fetch("/api/work-session/touch", {
            method: "POST",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }).catch(() => {});
        } catch {
          /* unload in progress — nothing more we can do */
        }
      })();
      return;
    }
    // Local mode: stamp synchronously (survives teardown — it's just a write).
    const all = readLocal(sid);
    const open = all.find((s) => s.endedAt === null);
    if (!open) return;
    open.lastSeenAt = new Date().toISOString();
    writeLocal(sid, all);
  }, [useSupabase]);

  const rangeSessions = useCallback(
    async (fromISO: string, toISO: string): Promise<WorkSessionRecord[]> => {
      const sid = staffIdRef.current;
      if (!sid) return [];
      if (useSupabase) {
        const res = await apiFetch(
          `/api/work-session/range?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`,
        );
        if (res.ok && res.json?.ok) return (res.json.sessions as WorkSessionRecord[]) ?? [];
        return [];
      }
      const all = readLocal(sid);
      const fromMs = new Date(fromISO).getTime();
      const toMs = new Date(toISO).getTime();
      return all.filter((s) => {
        const start = new Date(s.startedAt).getTime();
        const end = s.endedAt ? new Date(s.endedAt).getTime() : Date.now();
        return end >= fromMs && start <= toMs;
      });
    },
    [useSupabase, apiFetch],
  );

  const status = deriveStatus(openSession, Date.now());

  const value: UseWorkSession = {
    hydrated,
    status,
    openSession,
    todaySessions,
    startWork,
    startBreak,
    endBreak,
    endWork,
    touch,
    flushBeacon,
    rangeSessions,
  };

  return <WorkSessionContext.Provider value={value}>{children}</WorkSessionContext.Provider>;
}

export function useWorkSession(): UseWorkSession {
  const ctx = useContext(WorkSessionContext);
  if (!ctx) {
    throw new Error("useWorkSession must be used within a WorkSessionProvider");
  }
  return ctx;
}

/* ── App-wide auto-start + heartbeat hook (mount ONCE in app-shell) ──────────
   Idempotent auto-start: in-tab single-flight ref → server open-session SELECT
   → DB partial unique index resume. Heartbeat touches last_seen_at while a
   session is open, debounced to HEARTBEAT_MS. Does NOT create a session per
   render. ── */
/**
 * @param enabled Only auto-start / heartbeat a work session when the signed-in
 *   user is an eligible Sales Agent. An owner (or any non-Sales-Agent role) is
 *   NOT tracked — Work Session is employee-time tracking for Sales Agents this
 *   phase, so the owner never gets a session, status chip, or Start Work. The
 *   caller resolves eligibility (app-shell is inside LeadsProvider); defaults
 *   to false so a session is never created before eligibility is known.
 */
export function useWorkSessionAutoStart(enabled: boolean = false) {
  const { authReady, currentUser } = usePermissions();
  const { startWork, endBreak, touch, flushBeacon, openSession, status, hydrated } = useWorkSession();
  const { settings } = useStoreSettings();
  const startedRef = useRef(false);
  // Which open break (by its startedAt) we've already reminded about, so the
  // reminder fires exactly ONCE per break and re-arms for the next one.
  const remindedBreakRef = useRef<string | null>(null);
  // Timestamp of the agent's most recent real interaction with RepairOX. The
  // break reminder only fires when this is recent (they're actively working),
  // never when they're idle/away.
  const lastActivityRef = useRef<number>(Date.now());

  // Admin-configurable break-reminder threshold (minutes). 0 (or invalid) =
  // never remind. Settings → Lead Management → Productivity.
  const reminderMinutes = (() => {
    const m = settings.productivityConfig?.breakReminderMinutes;
    return typeof m === "number" && m >= 0 ? m : DEFAULT_BREAK_REMINDER_MINUTES;
  })();

  // Auto-start once per auth session — only for eligible Sales Agents.
  useEffect(() => {
    if (!enabled || !authReady || !currentUser?.id || !hydrated) return;
    if (startedRef.current) return;
    startedRef.current = true;
    void startWork();
  }, [enabled, authReady, currentUser?.id, hydrated, startWork]);

  // Reset the single-flight guard if the signed-in user changes (logout/login).
  useEffect(() => {
    startedRef.current = false;
  }, [currentUser?.id]);

  // Heartbeat: keep last_seen_at fresh while a session is open (Sales Agents only).
  useEffect(() => {
    if (!enabled || !authReady || !currentUser?.id) return;
    const t = window.setInterval(() => {
      if (openSession) void touch();
    }, HEARTBEAT_MS);
    return () => window.clearInterval(t);
  }, [enabled, authReady, currentUser?.id, openSession, touch]);

  // Final liveness stamp when the user LEAVES without logging out (closes the
  // tab, shuts down, backgrounds the app). Without this, last_seen_at is only
  // as fresh as the last 60s heartbeat, so an abandoned session keeps counting
  // toward `now` as "working" until the 30-min stale threshold trips. Stamping
  // on hide/close records the TRUE last-active moment, so the pure engine caps
  // the abandoned session's elapsed/net at that instant — the counted work
  // time reflects reality. `pagehide` is the reliable close/navigate-away
  // signal; `visibilitychange→hidden` covers tab switches and mobile
  // backgrounding (where `pagehide`/`beforeunload` are unreliable).
  useEffect(() => {
    if (!enabled || !authReady || !currentUser?.id) return;
    const onHide = () => {
      if (openSession) flushBeacon();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && openSession) flushBeacon();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, authReady, currentUser?.id, openSession, flushBeacon]);

  // Track genuine interaction with RepairOX so the break reminder only fires
  // when the agent is ACTIVELY working. Mirrors the presence tracker's events
  // but stays local to Work Session (Online ≠ Working — never read presence).
  useEffect(() => {
    if (!enabled || !authReady || !currentUser?.id) return;
    const mark = () => { lastActivityRef.current = Date.now(); };
    const onVisible = () => { if (document.visibilityState === "visible") mark(); };
    BREAK_ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, mark, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      BREAK_ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, mark));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, authReady, currentUser?.id]);

  // Forgot-to-resume reminder: when the agent has been ON BREAK longer than the
  // admin-configured threshold AND is ACTIVELY using RepairOX (recent mouse /
  // keyboard / scroll activity, tab visible), nudge them to resume work so
  // break time doesn't eat into the day's productive total. It never fires
  // while they're idle/away — the whole point is "you're clearly working but
  // still on break". Checks on the heartbeat cadence; fires once per break,
  // but re-arms if they go idle and come back still on the same break.
  useEffect(() => {
    // reminderMinutes <= 0 means the admin disabled the reminder entirely.
    if (!enabled || !authReady || !currentUser?.id || reminderMinutes <= 0) {
      remindedBreakRef.current = null;
      return;
    }
    // No open break → clear the guard so the NEXT break can remind afresh.
    if (status !== "on_break" || !openSession) {
      remindedBreakRef.current = null;
      return;
    }
    const openBreak = openSession.breaks.find((b) => b.endedAt === null);
    if (!openBreak) {
      remindedBreakRef.current = null;
      return;
    }

    const thresholdMs = reminderMinutes * 60 * 1000;
    const check = () => {
      const now = Date.now();
      // Only when actively working: real interaction within the activity window
      // AND the tab is in the foreground. Idle/away → stay silent (and re-arm so
      // the reminder can fire once they come back, still on the same break).
      const active =
        now - lastActivityRef.current <= BREAK_ACTIVITY_WINDOW_MS &&
        (typeof document === "undefined" || document.visibilityState === "visible");
      if (!active) {
        if (remindedBreakRef.current === openBreak.startedAt) remindedBreakRef.current = null;
        return;
      }
      // Already reminded about THIS break (while active)? (keyed by its start)
      if (remindedBreakRef.current === openBreak.startedAt) return;
      const breakMs = now - new Date(openBreak.startedAt).getTime();
      if (breakMs < thresholdMs) return;
      remindedBreakRef.current = openBreak.startedAt;
      const unit = reminderMinutes === 1 ? "minute" : "minutes";
      toast.info("Still on break?", {
        description: `You've been on break for over ${reminderMinutes} ${unit} and you're active. Resume work so your productivity is counted correctly.`,
        duration: 10_000,
        action: { label: "Resume Work", onClick: () => void endBreak() },
      });
    };

    check(); // fire immediately if already past the threshold AND active
    const t = window.setInterval(check, HEARTBEAT_MS);
    return () => window.clearInterval(t);
  }, [enabled, authReady, currentUser?.id, reminderMinutes, status, openSession, endBreak]);
}
