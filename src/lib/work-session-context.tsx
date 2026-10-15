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
import { demoKey } from "@/lib/demo-mode";
import { toast } from "@/components/ui/toaster";
import { STALE_MS, type WorkSessionRecord } from "@/lib/work-session";

export type WorkStatus = "working" | "on_break" | "logged_out" | "interrupted";

/** Client heartbeat cadence — mirrors use-session-tracker's HEARTBEAT_MS. */
const HEARTBEAT_MS = 60_000;

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
        setOpenSession((res.json.session as WorkSessionRecord) ?? null);
        await fetchCurrent();
      }
      return;
    }
    // Local: idempotent — resume an existing open session.
    const all = readLocal(sid);
    if (all.some((s) => s.endedAt === null)) {
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
  }, [useSupabase, apiFetch, fetchCurrent, refreshLocal]);

  const startBreak = useCallback(async () => {
    const sid = staffIdRef.current;
    if (!sid) return;
    if (useSupabase) {
      const res = await apiFetch("/api/work-session/break/start", { method: "POST" });
      if (res.ok && res.json?.ok) setOpenSession((res.json.session as WorkSessionRecord) ?? null);
      else mapError(res.json?.error);
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
  }, [useSupabase, apiFetch, mapError, refreshLocal]);

  const endBreak = useCallback(async () => {
    const sid = staffIdRef.current;
    if (!sid) return;
    if (useSupabase) {
      const res = await apiFetch("/api/work-session/break/end", { method: "POST" });
      if (res.ok && res.json?.ok) setOpenSession((res.json.session as WorkSessionRecord) ?? null);
      else mapError(res.json?.error);
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
  }, [useSupabase, apiFetch, mapError, refreshLocal]);

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
export function useWorkSessionAutoStart() {
  const { authReady, currentUser } = usePermissions();
  const { startWork, touch, openSession, hydrated } = useWorkSession();
  const startedRef = useRef(false);

  // Auto-start once per auth session.
  useEffect(() => {
    if (!authReady || !currentUser?.id || !hydrated) return;
    if (startedRef.current) return;
    startedRef.current = true;
    void startWork();
  }, [authReady, currentUser?.id, hydrated, startWork]);

  // Reset the single-flight guard if the signed-in user changes (logout/login).
  useEffect(() => {
    startedRef.current = false;
  }, [currentUser?.id]);

  // Heartbeat: keep last_seen_at fresh while a session is open.
  useEffect(() => {
    if (!authReady || !currentUser?.id) return;
    const t = window.setInterval(() => {
      if (openSession) void touch();
    }, HEARTBEAT_MS);
    return () => window.clearInterval(t);
  }, [authReady, currentUser?.id, openSession, touch]);
}
