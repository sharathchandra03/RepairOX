"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Monitor, Smartphone, Tablet, MapPin, LogOut, RefreshCw, AlertCircle, ShieldCheck,
} from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePermissions } from "@/lib/permissions-context";
import { getSessionToken } from "@/lib/use-session-tracker";
import { isSupabaseConfigured } from "@/lib/supabase";

interface SessionRow {
  id: string;
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  deviceType: "desktop" | "mobile" | "tablet" | null;
  ipAddress: string | null;
  location: string | null;
  loginAt: string;
  lastActivity: string;
  isCurrent: boolean;
}

/* Human-friendly relative time driven by REAL last_activity timestamps. */
function relativeTime(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Math.max(0, nowMs - then);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "Just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/* "Aug 7, 2026 6:42 PM" — matches the reference login-time format. */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function deviceLabel(s: SessionRow): string {
  const browser = s.browser && s.browser !== "Unknown" ? s.browser : "Browser";
  const version = s.browserVersion ? ` ${s.browserVersion}` : "";
  const os = s.os && s.os !== "Unknown" ? s.os : "Unknown device";
  return `${browser}${version} | ${os}`;
}

function DeviceIcon({ type }: { type: SessionRow["deviceType"] }) {
  const cls = "h-4 w-4";
  if (type === "mobile") return <Smartphone className={cls} />;
  if (type === "tablet") return <Tablet className={cls} />;
  return <Monitor className={cls} />;
}

type Note = { kind: "ok" | "err"; text: string } | null;

export default function ActiveSessionsPage() {
  const { apiFetch } = usePermissions();

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setError(null);
    const token = getSessionToken();
    const res = await apiFetch(`/api/account/sessions?current=${encodeURIComponent(token)}`, { method: "GET" });
    if (res.ok && res.json?.ok) {
      setSessions(res.json.sessions ?? []);
    } else {
      setError(res.json?.error ?? "Couldn't load your sessions.");
    }
    setLoading(false);
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  // Refresh relative-time display each second (using REAL timestamps).
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  function flash(kind: "ok" | "err", text: string) {
    setNote({ kind, text });
    window.setTimeout(() => setNote(null), 3400);
  }

  async function revoke(id: string) {
    setRevoking(id);
    const res = await apiFetch("/api/account/sessions", { method: "DELETE", body: JSON.stringify({ id }) });
    setRevoking(null);
    if (res.ok && res.json?.ok) {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      flash("ok", "Session signed out.");
    } else {
      flash("err", res.json?.error ?? "Couldn't sign out that session.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(sessions.length / pageSize));
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sessions.slice(start, start + pageSize);
  }, [sessions, page, pageSize]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return (
    <SettingsPage
      breadcrumbs={[{ label: "Account", href: "/settings/account/profile" }, { label: "Active Sessions" }]}
      title="Active Sessions"
      description="Devices currently signed in to your account. Sign out any you don't recognise."
    >
      <SettingsSection
        title="Signed-in devices"
        description="Each row is a real session recorded when a device signs in."
        icon={ShieldCheck}
      >
        <div className="mb-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={"h-3.5 w-3.5" + (loading ? " animate-spin" : "")} /> Refresh
          </Button>
        </div>

        {!isSupabaseConfigured ? (
          <div className="rounded-xl border border-border bg-muted/30 p-6 text-center text-[13px] text-muted-foreground">
            Session tracking is available when the app is connected to its database.
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading your sessions…
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-700">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            No active sessions found.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-2xl border border-border bg-card shadow-card md:block">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-[#EEF1FD]">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/70">
                    <th className="px-4 py-3">Browser &amp; Device</th>
                    <th className="px-4 py-3">IP Address</th>
                    <th className="px-4 py-3">Login Time</th>
                    <th className="px-4 py-3">Last Activity</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((s) => (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                            <DeviceIcon type={s.deviceType} />
                          </span>
                          <span className="font-medium text-foreground">{deviceLabel(s)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-foreground">{s.ipAddress ?? "—"}</div>
                        {s.location && (
                          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <MapPin className="h-3 w-3" /> {s.location}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground">{formatDateTime(s.loginAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{relativeTime(s.lastActivity, nowMs)}</td>
                      <td className="px-4 py-3 text-right">
                        {s.isCurrent ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                            Current
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => setConfirmId(s.id)}
                            disabled={revoking === s.id}
                          >
                            <LogOut className="h-3.5 w-3.5" /> {revoking === s.id ? "Signing out…" : "Sign out"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="grid gap-3 md:hidden">
              {paged.map((s) => (
                <div key={s.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                        <DeviceIcon type={s.deviceType} />
                      </span>
                      <span className="font-medium text-foreground">{deviceLabel(s)}</span>
                    </div>
                    {s.isCurrent && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        Current
                      </span>
                    )}
                  </div>
                  <dl className="mt-3 space-y-1.5 text-[13px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">IP Address</dt>
                      <dd className="text-right text-foreground">
                        {s.ipAddress ?? "—"}
                        {s.location && <div className="text-[11px] text-muted-foreground">{s.location}</div>}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Login Time</dt>
                      <dd className="text-right text-foreground">{formatDateTime(s.loginAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Last Activity</dt>
                      <dd className="text-right text-muted-foreground">{relativeTime(s.lastActivity, nowMs)}</dd>
                    </div>
                  </dl>
                  {!s.isCurrent && (
                    <div className="mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => setConfirmId(s.id)}
                        disabled={revoking === s.id}
                      >
                        <LogOut className="h-3.5 w-3.5" /> {revoking === s.id ? "Signing out…" : "Sign out"}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination footer — reuses the shared component */}
            <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={sessions.length}
                pageSize={pageSize}
                pageSizeOptions={[10, 25, 50, 100]}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                itemLabel="session"
              />
            </div>
          </>
        )}
      </SettingsSection>

      <ConfirmDialog
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={() => { if (confirmId) revoke(confirmId); }}
        title="Sign out this session?"
        description="The device will be signed out and can no longer use this session. It will need to sign in again."
        confirmLabel="Sign out"
        danger
      />

      {note && (
        <div
          className={
            "fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2.5 text-[12.5px] font-medium shadow-[0_12px_40px_-12px_rgba(20,30,80,0.25)] " +
            (note.kind === "ok"
              ? "border-emerald-200 bg-white text-emerald-700"
              : "border-rose-200 bg-white text-rose-700")
          }
        >
          {note.kind === "ok" ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {note.text}
        </div>
      )}
    </SettingsPage>
  );
}
