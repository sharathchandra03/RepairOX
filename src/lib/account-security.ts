import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Account & Security server helpers (SERVER ONLY).

   Shared by the self-service Account routes:
     • requireUser  — verify ANY signed-in user's bearer token (not admin-only).
     • Access PIN   — salted SHA-256 hashing / verification (never plaintext).
     • parseUserAgent — turn a raw UA string into { browser, version, os, … }.
     • extractIp    — best-effort client IP from proxy headers.
   ────────────────────────────────────────────────────────────────────────── */

/* ── Auth ─────────────────────────────────────────────────────────────────── */

export type UserGuard =
  | { ok: true; admin: SupabaseClient; user: User }
  | { ok: false; status: number; error: string };

/** Verify the caller's session and return a service-role client + the user.
 *  Unlike requireAdmin, this allows ANY authenticated user through — used for
 *  self-service actions that are scoped to the caller's own record. */
export async function requireUser(req: Request): Promise<UserGuard> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
  if (!token) return { ok: false, status: 401, error: "Not signed in." };

  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch (e: any) {
    return { ok: false, status: 500, error: e?.message ?? "Server not configured." };
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: "Invalid session." };

  return { ok: true, admin, user: data.user };
}

/* ── Access PIN (salted SHA-256) ────────────────────────────────────────────
   PINs are short, so a plain hash would be brute-forceable; we still avoid ever
   storing/returning plaintext. A per-row random salt is combined with the PIN
   before hashing. This mirrors the app's existing "server hashes, browser never
   sees the hash" approach and keeps the PIN masked end to end. */

export function hashPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(salt + ":" + pin).digest("hex");
  return { hash, salt };
}

export function verifyPin(pin: string, hash: string | null, salt: string | null): boolean {
  if (!hash || !salt) return false;
  const candidate = createHash("sha256").update(salt + ":" + pin).digest("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** A masked, non-reversible placeholder the UI can show for an existing PIN.
 *  We never send the real PIN (or its hash) to the browser. */
export const PIN_MASK = "••••";

/* ── User-Agent parsing (no external deps) ──────────────────────────────────
   Deliberately small: extracts the common browser + version + OS so the
   Active Sessions table can show "Chrome 152.0.0.0 | Mac". Not exhaustive. */

export interface ParsedUA {
  browser: string;
  browserVersion: string;
  os: string;
  deviceType: "desktop" | "mobile" | "tablet";
}

export function parseUserAgent(ua: string | null | undefined): ParsedUA {
  const s = ua ?? "";
  let browser = "Unknown";
  let browserVersion = "";

  // Order matters: Edge/Opera/Brave masquerade as Chrome, so check them first.
  const match = (re: RegExp) => {
    const m = s.match(re);
    return m ? m[1] : null;
  };

  if (/Edg\//.test(s)) {
    browser = "Edge";
    browserVersion = match(/Edg\/([\d.]+)/) ?? "";
  } else if (/OPR\/|Opera/.test(s)) {
    browser = "Opera";
    browserVersion = match(/(?:OPR|Opera)\/([\d.]+)/) ?? "";
  } else if (/Firefox\//.test(s)) {
    browser = "Firefox";
    browserVersion = match(/Firefox\/([\d.]+)/) ?? "";
  } else if (/Chrome\//.test(s)) {
    browser = "Chrome";
    browserVersion = match(/Chrome\/([\d.]+)/) ?? "";
  } else if (/Version\/[\d.]+ .*Safari/.test(s) || /Safari\//.test(s)) {
    browser = "Safari";
    browserVersion = match(/Version\/([\d.]+)/) ?? "";
  }

  // OS / device family.
  let os = "Unknown";
  let deviceType: ParsedUA["deviceType"] = "desktop";
  if (/iPhone/.test(s)) { os = "iPhone"; deviceType = "mobile"; }
  else if (/iPad/.test(s)) { os = "iPad"; deviceType = "tablet"; }
  else if (/Android/.test(s)) { os = "Android"; deviceType = /Mobile/.test(s) ? "mobile" : "tablet"; }
  else if (/Macintosh|Mac OS X/.test(s)) { os = "Mac"; deviceType = "desktop"; }
  else if (/Windows/.test(s)) { os = "Windows"; deviceType = "desktop"; }
  else if (/Linux/.test(s)) { os = "Linux"; deviceType = "desktop"; }

  return { browser, browserVersion, os, deviceType };
}

/** Best-effort client IP from common proxy headers. Never invents a value —
 *  returns null when nothing legitimate is available. */
export function extractIp(req: Request): string | null {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return normalizeIp(first);
  }
  const real = h.get("x-real-ip");
  if (real) return normalizeIp(real.trim());
  return null;
}

function normalizeIp(ip: string): string {
  // Collapse the IPv6-mapped IPv4 form (::ffff:1.2.3.4) and loopback.
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}
