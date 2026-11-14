"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MotionConfig, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Bell, Briefcase, CloudOff, FileCheck2, Home, Loader2, Navigation, RefreshCw, User, Wifi } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";
import { NinjaProvider, useNinja, useNinjaGeo } from "@/lib/ninja/ninja-context";
import { inProgress, isNew, ago } from "@/lib/ninja/model";
import { Sheet } from "@/components/ninja/ui";
import { useShiftHeartbeat } from "@/components/ninja/shift";

const TABS = [
  { href: "/ninja", label: "Home", icon: Home },
  { href: "/ninja/jobs", label: "My Jobs", icon: Briefcase },
  { href: "/ninja/active", label: "Active", icon: Navigation },
  { href: "/ninja/proof", label: "Proof", icon: FileCheck2 },
  { href: "/ninja/profile", label: "Profile", icon: User },
];

/** Pull-to-refresh on the single content scroller (only when already at the top). */
function usePullToRefresh(ref: React.RefObject<HTMLElement>, onRefresh: () => Promise<void>) {
  const y = useMotionValue(0);
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startY = 0, pulling = false;
    const start = (e: TouchEvent) => { if (el.scrollTop <= 0 && !spinning) { startY = e.touches[0].clientY; pulling = true; } };
    const move = (e: TouchEvent) => {
      if (!pulling) return;
      const d = e.touches[0].clientY - startY;
      if (d <= 0 || el.scrollTop > 0) { y.set(0); return; }
      y.set(Math.min(90, d * 0.45));
    };
    const end = async () => {
      if (!pulling) return;
      pulling = false;
      if (y.get() > 60) {
        setSpinning(true); animate(y, 48, { duration: 0.15 });
        try { await onRefresh(); } finally { setSpinning(false); animate(y, 0, { type: "spring", stiffness: 380, damping: 32 }); }
      } else animate(y, 0, { type: "spring", stiffness: 420, damping: 32 });
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: true });
    el.addEventListener("touchend", end);
    return () => { el.removeEventListener("touchstart", start); el.removeEventListener("touchmove", move); el.removeEventListener("touchend", end); };
  }, [ref, onRefresh, spinning, y]);
  return { y, spinning };
}

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { trips, online, outbox, syncing, syncNow, refresh, notices, unread, markAllRead } = useNinja();
  const geo = useNinjaGeo();
  const { currentUser } = usePermissions();
  const scroller = useRef<HTMLElement>(null);
  const [bell, setBell] = useState(false);
  useShiftHeartbeat();
  const pending = outbox.filter((o) => o.state === "pending").length;
  const attention = outbox.filter((o) => o.state !== "pending").length;
  const active = trips.some((t) => inProgress(t));
  const fresh = trips.filter(isNew).length;
  const hideChrome = /^\/ninja\/receipt\//.test(path);
  const initial = (currentUser?.name ?? "N").slice(0, 1).toUpperCase();
  const { y, spinning } = usePullToRefresh(scroller, async () => { await Promise.all([refresh(), syncNow()]); });
  const ind = useTransform(y, [0, 60], [0, 1]);
  const rot = useTransform(y, [0, 90], [0, 270]);

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [path]);
  // Offline app shell (production only: the dev server's hot reload must not be cached).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/ninja-sw.js").catch(() => {});
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="fixed inset-0 select-none bg-[#E9EDF8] bg-[radial-gradient(1200px_500px_at_50%_-10%,rgba(67,97,238,0.22),transparent)] [-webkit-tap-highlight-color:transparent] [touch-action:manipulation] lg:grid lg:place-items-center print:static print:h-auto">
        <div className="relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#F4F6FB] text-slate-900 lg:h-[min(920px,calc(100dvh-3rem))] lg:rounded-[2.5rem] lg:shadow-[0_40px_80px_-30px_rgba(30,45,120,0.45)] lg:ring-1 lg:ring-slate-300/60 print:h-auto print:max-w-none print:overflow-visible print:bg-white print:shadow-none">
          {!hideChrome ? (
            <header className="relative z-30 shrink-0 bg-gradient-to-b from-[#3B55E0] to-[#4361EE] pt-[env(safe-area-inset-top)] text-white shadow-[0_8px_24px_-12px_rgba(40,60,200,0.7)]">
              <div className="flex h-[60px] items-center justify-between gap-2 px-4">
                <Link href="/ninja" className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[16px] font-extrabold text-[#4361EE] shadow-md">R</span>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate font-display text-[15px] font-extrabold tracking-tight">RepairOX Ninja</p>
                    <p className="truncate text-[10.5px] font-semibold text-white/70">{currentUser?.branch || "Field operations"}</p>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!online ? (
                    <span className="flex items-center gap-1 rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-bold"><CloudOff className="h-3.5 w-3.5" />Offline</span>
                  ) : pending > 0 || syncing ? (
                    <button onClick={() => void syncNow()} className="flex items-center gap-1 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-amber-950">
                      {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{pending} to sync
                    </button>
                  ) : geo.sharing ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold ring-1 ring-white/25"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />Live</span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold ring-1 ring-white/25"><Wifi className="h-3.5 w-3.5" />Online</span>
                  )}
                  <button onClick={() => setBell(true)} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative grid h-10 w-10 place-items-center rounded-full bg-white/15 ring-1 ring-white/25 transition active:scale-90">
                    <Bell className="h-5 w-5" />
                    {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold ring-2 ring-[#4361EE]">{unread > 9 ? "9+" : unread}</span> : null}
                  </button>
                  <Link href="/ninja/profile" aria-label="Profile" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[14px] font-extrabold text-[#4361EE] transition active:scale-90">{initial}</Link>
                </div>
              </div>
              {attention > 0 ? (
                <Link href="/ninja/proof" className="block bg-rose-600 px-4 py-1.5 text-center text-[12px] font-bold">{attention} action{attention > 1 ? "s" : ""} need attention · tap to review</Link>
              ) : null}
            </header>
          ) : null}

          <main ref={scroller} id="ninja-scroll" className="relative min-h-0 flex-1 select-text overflow-y-auto overscroll-contain px-4 pb-6 pt-4 [-webkit-overflow-scrolling:touch] print:overflow-visible">
            <motion.div style={{ height: y }} className="-mt-4 flex items-end justify-center overflow-hidden">
              <motion.span style={{ opacity: ind, rotate: spinning ? undefined : rot }} className={`mb-2 grid h-8 w-8 place-items-center rounded-full bg-white text-[#4361EE] shadow ${spinning ? "animate-spin" : ""}`}><RefreshCw className="h-4 w-4" /></motion.span>
            </motion.div>
            {children}
          </main>

          {!hideChrome ? (
            <nav aria-label="Primary" className="relative z-30 shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgba(20,30,80,0.25)]">
              <ul className="grid grid-cols-5 px-1">
                {TABS.map((t) => {
                  const on = t.href === "/ninja" ? path === "/ninja" : path.startsWith(t.href);
                  const Icon = t.icon;
                  const badge = t.href === "/ninja/jobs" ? fresh : t.href === "/ninja/active" && active ? -1 : 0;
                  return (
                    <li key={t.href}>
                      <Link href={t.href} prefetch aria-current={on ? "page" : undefined}
                        className={`relative flex min-h-[62px] flex-col items-center justify-center gap-0.5 text-[10.5px] font-bold transition-colors ${on ? "text-[#4361EE]" : "text-slate-400"}`}>
                        {on ? <motion.span layoutId="ninja-nav-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} className="absolute inset-x-2 inset-y-1.5 rounded-2xl bg-[#EEF1FD]" /> : null}
                        <span className="relative">
                          <Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.6 : 2} />
                          {badge > 0 ? <span className="absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-extrabold text-white ring-2 ring-white">{badge}</span> : null}
                          {badge === -1 ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500 ring-2 ring-white" /> : null}
                        </span>
                        <span className="relative">{t.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}
        </div>
      </div>

      <Sheet open={bell} onClose={() => { setBell(false); void markAllRead(); }} title="Notifications">
        {notices.length === 0 ? <p className="py-10 text-center text-[13px] text-slate-400">No notifications in the last 7 days.</p> : (
          <ul className="divide-y divide-slate-100">
            {notices.map((n) => (
              <li key={n.id}>
                <button onClick={() => { setBell(false); void markAllRead(); if (n.href) router.push(n.href); }} className="flex w-full items-start gap-3 py-3 text-left">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.read ? "bg-slate-200" : "bg-[#4361EE]"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-slate-900">{n.title}</span>
                    {n.body ? <span className="block text-[12.5px] text-slate-500">{n.body}</span> : null}
                    <span className="block text-[11px] text-slate-400">{ago(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      {/* Keep toasts above the bottom tab bar inside the Ninja app. */}
      <style>{`.rox-toaster{bottom:calc(84px + env(safe-area-inset-bottom)) !important}`}</style>
    </MotionConfig>
  );
}

export default function NinjaLayout({ children }: { children: React.ReactNode }) {
  const { authReady, currentUser } = usePermissions();
  const router = useRouter();
  const [grace, setGrace] = useState(false);

  // Session restore can lag the hydration flag; give it a moment before bouncing to login.
  useEffect(() => { if (!authReady) return; const t = setTimeout(() => setGrace(true), 1800); return () => clearTimeout(t); }, [authReady]);
  useEffect(() => { if (grace && !currentUser) router.replace("/login"); }, [grace, currentUser, router]);

  if (!currentUser) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[#F4F6FB]">
        <div className="flex flex-col items-center gap-3 text-slate-500"><Loader2 className="h-7 w-7 animate-spin text-[#4361EE]" /><p className="text-[13px] font-semibold">Opening Ninja app…</p></div>
      </div>
    );
  }
  return <NinjaProvider><Shell>{children}</Shell></NinjaProvider>;
}
