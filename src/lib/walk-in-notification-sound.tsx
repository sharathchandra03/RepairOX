"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Notification Sound

   A small, self-contained system for the OPTIONAL sound that plays when a NEW
   walk-in follow-up notification becomes due. It intentionally reuses the same
   persistence philosophy as the rest of RepairOX:

     • Per-user preference, keyed in localStorage by the current user, and
       mirrored to Supabase (via the existing /api/dashboard-preferences route)
       so the choice survives refresh / logout / different sessions.

   Built-in sounds are SYNTHESIZED with the Web Audio API (no binary assets to
   ship) and are deliberately short, soft and professional — a gentle chime, a
   soft bell, a light pop and a soft alert. A user may also upload a custom
   sound; the uploaded audio is stored as a data URL in the preference so it
   persists exactly like the built-in choice.
   ────────────────────────────────────────────────────────────────────────── */

import {
  createContext, useContext, useState, useEffect, useCallback, useRef, useMemo, type ReactNode,
} from "react";
import { usePermissions } from "@/lib/permissions-context";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

/* ─── Built-in sound catalogue ───────────────────────────────────────────── */

export type WalkInSoundId = "soft-chime" | "gentle-bell" | "light-pop" | "soft-alert" | "custom";

export interface WalkInSoundOption {
  id: WalkInSoundId;
  label: string;
}

/** Small, intentional catalogue of professional sounds. */
export const BUILT_IN_WALKIN_SOUNDS: WalkInSoundOption[] = [
  { id: "soft-chime", label: "Soft Chime" },
  { id: "gentle-bell", label: "Gentle Bell" },
  { id: "light-pop", label: "Light Pop" },
  { id: "soft-alert", label: "Soft Alert" },
];

export const DEFAULT_WALKIN_SOUND: WalkInSoundId = "soft-chime";

/* ─── Web Audio synthesis of the built-in sounds ─────────────────────────── */

let sharedCtx: AudioContext | null = null;
let unlockBound = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!sharedCtx) sharedCtx = new Ctor();
    if (sharedCtx.state === "suspended") sharedCtx.resume().catch(() => {});
    return sharedCtx;
  } catch {
    return null;
  }
}

/* Browsers block audio until the user has interacted with the page. Bind a
   one-time set of gesture listeners that create + resume the AudioContext so a
   follow-up sound that fires later (e.g. from a background timer) can actually
   play. Safe to call multiple times. */
export function unlockWalkInAudio(): void {
  if (typeof window === "undefined" || unlockBound) return;
  unlockBound = true;
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
  events.forEach((e) => window.addEventListener(e, unlock, { once: false, passive: true }));
}

/** A single soft tone with a gentle attack/decay envelope. */
function tone(ctx: AudioContext, freq: number, startAt: number, duration: number, gain = 0.14, type: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  env.gain.setValueAtTime(0.0001, startAt);
  env.gain.exponentialRampToValueAtTime(gain, startAt + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** Play one of the built-in synthesized sounds. Returns false if audio is unavailable. */
function playBuiltIn(id: WalkInSoundId): boolean {
  const ctx = getAudioContext();
  if (!ctx) return false;
  const t = ctx.currentTime + 0.01;
  switch (id) {
    case "gentle-bell":
      // A rounded two-note bell (perfect fifth), soft and warm.
      tone(ctx, 784, t, 0.5, 0.12);            // G5
      tone(ctx, 1175, t + 0.08, 0.45, 0.08);   // D6 overtone
      break;
    case "light-pop":
      // A single quick, dry pop — barely-there and non-intrusive.
      tone(ctx, 660, t, 0.14, 0.16, "triangle");
      break;
    case "soft-alert":
      // Two ascending soft blips — recognisable but calm.
      tone(ctx, 587, t, 0.16, 0.12, "sine");        // D5
      tone(ctx, 880, t + 0.14, 0.22, 0.12, "sine"); // A5
      break;
    case "soft-chime":
    default:
      // A pleasant rising three-note chime — the friendly default.
      tone(ctx, 659, t, 0.32, 0.11);          // E5
      tone(ctx, 880, t + 0.10, 0.34, 0.11);   // A5
      tone(ctx, 1319, t + 0.20, 0.4, 0.09);   // E6
      break;
  }
  return true;
}

/** Play a custom uploaded sound from a data/blob URL. */
function playCustom(url: string) {
  if (typeof window === "undefined" || !url) return;
  try {
    const audio = new Audio(url);
    audio.volume = 0.7;
    audio.play().catch(() => {});
  } catch { /* ignore */ }
}

/* ─── Preference shape + persistence (localStorage + Supabase) ───────────── */

const LOCAL_KEY_PREFIX = "repairox-walkin-sound-";

export interface WalkInSoundPrefs {
  /** Master on/off for the walk-in notification sound. */
  enabled: boolean;
  /** Selected sound id (built-in or "custom"). */
  sound: WalkInSoundId;
  /** Custom sound as a data URL (only when a custom sound was uploaded). */
  customUrl?: string;
  /** Original file name of the uploaded custom sound (for display). */
  customName?: string;
}

const DEFAULT_PREFS: WalkInSoundPrefs = { enabled: true, sound: DEFAULT_WALKIN_SOUND };

function coerce(parsed: any): WalkInSoundPrefs {
  const valid: WalkInSoundId[] = ["soft-chime", "gentle-bell", "light-pop", "soft-alert", "custom"];
  const sound: WalkInSoundId = valid.includes(parsed?.sound) ? parsed.sound : DEFAULT_WALKIN_SOUND;
  return {
    enabled: parsed?.enabled !== false,
    sound: sound === "custom" && !parsed?.customUrl ? DEFAULT_WALKIN_SOUND : sound,
    customUrl: typeof parsed?.customUrl === "string" ? parsed.customUrl : undefined,
    customName: typeof parsed?.customName === "string" ? parsed.customName : undefined,
  };
}

function readLocal(key: string): WalkInSoundPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return coerce(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocal(key: string, prefs: WalkInSoundPrefs) {
  try { localStorage.setItem(key, JSON.stringify(prefs)); } catch { /* quota */ }
}

/* ─── Standalone player (used by the bell, no context needed) ─────────────── */

/** Play the sound described by a preference object. Respects the enabled flag. */
export function playWalkInSound(prefs: WalkInSoundPrefs): void {
  if (!prefs.enabled) return;
  if (prefs.sound === "custom" && prefs.customUrl) {
    playCustom(prefs.customUrl);
    return;
  }
  playBuiltIn(prefs.sound);
}

/** Preview any sound regardless of the enabled flag (used in Settings). */
export function previewWalkInSound(sound: WalkInSoundId, customUrl?: string): void {
  if (sound === "custom" && customUrl) { playCustom(customUrl); return; }
  playBuiltIn(sound);
}

/* ─── React context / hook ───────────────────────────────────────────────── */

interface WalkInSoundContextValue {
  prefs: WalkInSoundPrefs;
  hydrated: boolean;
  isSaving: boolean;
  setEnabled: (v: boolean) => void;
  setSound: (id: WalkInSoundId) => void;
  setCustomSound: (dataUrl: string, name: string) => void;
  removeCustomSound: () => void;
  /** Persist the current preference to localStorage + Supabase. */
  save: () => Promise<void>;
  /** Preview the currently-selected sound. */
  preview: () => void;
}

const WalkInSoundContext = createContext<WalkInSoundContextValue>({
  prefs: DEFAULT_PREFS,
  hydrated: false,
  isSaving: false,
  setEnabled: () => {},
  setSound: () => {},
  setCustomSound: () => {},
  removeCustomSound: () => {},
  save: async () => {},
  preview: () => {},
});

export function WalkInSoundProvider({ children }: { children: ReactNode }) {
  const { currentUser } = usePermissions();
  const userKey = currentUser?.email || currentUser?.id || "_default";
  const localKey = `${LOCAL_KEY_PREFIX}${userKey}`;

  const [prefs, setPrefs] = useState<WalkInSoundPrefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  // Hydrate from localStorage when the user becomes known + prime audio unlock.
  useEffect(() => {
    const saved = readLocal(localKey);
    setPrefs(saved ?? DEFAULT_PREFS);
    setHydrated(true);
    unlockWalkInAudio();
  }, [localKey]);

  // Background sync from Supabase (overrides local when present).
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: session } = await supabase!.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) return;
        const res = await fetch("/api/dashboard-preferences?section=walkin_sound", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const stored = json?.preferences?.cardOrder?.[0];
        if (json.ok && typeof stored === "string") {
          const fromDb = coerce(JSON.parse(stored));
          setPrefs(fromDb);
          writeLocal(localKey, fromDb);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [localKey]);

  // Any change writes through to localStorage immediately so an unsaved refresh
  // still keeps the choice; the explicit save() also pushes to Supabase.
  const update = useCallback((patch: Partial<WalkInSoundPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      writeLocal(localKey, next);
      return next;
    });
  }, [localKey]);

  const setEnabled = useCallback((v: boolean) => update({ enabled: v }), [update]);
  const setSound = useCallback((id: WalkInSoundId) => update({ sound: id }), [update]);
  const setCustomSound = useCallback((dataUrl: string, name: string) => {
    update({ customUrl: dataUrl, customName: name, sound: "custom" });
  }, [update]);
  const removeCustomSound = useCallback(() => {
    setPrefs((prev) => {
      const next: WalkInSoundPrefs = {
        ...prev,
        customUrl: undefined,
        customName: undefined,
        // Fall back to the default sound if custom was active.
        sound: prev.sound === "custom" ? DEFAULT_WALKIN_SOUND : prev.sound,
      };
      writeLocal(localKey, next);
      return next;
    });
  }, [localKey]);

  const save = useCallback(async () => {
    const current = prefsRef.current;
    setIsSaving(true);
    writeLocal(localKey, current);
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (token) {
          await fetch("/api/dashboard-preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ section: "walkin_sound", cardOrder: [JSON.stringify(current)] }),
          });
        }
      } catch { /* ignore */ }
    }
    setIsSaving(false);
  }, [localKey]);

  const preview = useCallback(() => {
    previewWalkInSound(prefsRef.current.sound, prefsRef.current.customUrl);
  }, []);

  const value = useMemo<WalkInSoundContextValue>(() => ({
    prefs, hydrated, isSaving, setEnabled, setSound, setCustomSound, removeCustomSound, save, preview,
  }), [prefs, hydrated, isSaving, setEnabled, setSound, setCustomSound, removeCustomSound, save, preview]);

  return <WalkInSoundContext.Provider value={value}>{children}</WalkInSoundContext.Provider>;
}

export function useWalkInSound() {
  return useContext(WalkInSoundContext);
}
