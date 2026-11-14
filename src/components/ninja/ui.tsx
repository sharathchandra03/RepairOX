"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { ChevronsRight } from "lucide-react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { STATUS_META, type Tone, type TripStatus } from "@/lib/ninja/model";

export const TONE: Record<Tone, string> = {
  blue: "bg-[#EEF1FD] text-[#3450D8] ring-[#4361EE]/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-300/50",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-300/50",
  rose: "bg-rose-50 text-rose-800 ring-rose-300/50",
  slate: "bg-slate-100 text-slate-700 ring-slate-300/60",
  violet: "bg-violet-50 text-violet-800 ring-violet-300/50",
  sky: "bg-sky-50 text-sky-800 ring-sky-300/50",
};

export function Pill({ tone = "slate", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ring-1 ring-inset ${TONE[tone]} ${className}`}>{children}</span>;
}

export function StatusPill({ status }: { status: TripStatus }) {
  const m = STATUS_META[status] ?? { label: status, tone: "slate" as Tone };
  return <Pill tone={m.tone}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" /><span className="truncate">{m.label}</span></Pill>;
}

export function Card({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const base = `rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(20,30,80,0.04),0_8px_24px_-16px_rgba(20,30,80,0.18)] ${className}`;
  return onClick
    ? <button type="button" onClick={onClick} className={`${base} block w-full text-left transition active:scale-[0.99]`}>{children}</button>
    : <div className={base}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between px-1 first:mt-0">
      <h2 className="text-[12px] font-bold uppercase tracking-wider text-slate-500">{children}</h2>
      {action}
    </div>
  );
}

type BtnProps = { children: ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean; tone?: "primary" | "ghost" | "danger" | "success" | "dark"; className?: string; type?: "button" | "submit"; href?: string };
export function Btn({ children, onClick, disabled, loading, tone = "primary", className = "", type = "button", href }: BtnProps) {
  const t = {
    primary: "bg-[#4361EE] text-white shadow-[0_8px_20px_-8px_rgba(67,97,238,0.7)] active:bg-[#3450D8]",
    success: "bg-emerald-600 text-white shadow-[0_8px_20px_-8px_rgba(5,150,105,0.6)] active:bg-emerald-700",
    danger: "bg-rose-600 text-white active:bg-rose-700",
    dark: "bg-slate-900 text-white active:bg-slate-800",
    ghost: "bg-white text-slate-800 ring-1 ring-inset ring-slate-300 active:bg-slate-50",
  }[tone];
  const cls = `inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-bold transition disabled:opacity-50 ${t} ${className}`;
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a>;
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={cls}>
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const sc = document.getElementById("ninja-scroll") ?? document.body;
    const prev = sc.style.overflow;
    sc.style.overflow = "hidden";
    return () => { sc.style.overflow = prev; };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] [-webkit-tap-highlight-color:transparent] sm:items-center" onClick={onClose}>
      <motion.div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        initial={{ y: 60, opacity: 0.6 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 36 }}
        className="flex max-h-[92dvh] w-full max-w-[430px] select-text flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h3 className="text-[17px] font-extrabold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer ? <div className="border-t border-slate-100 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">{footer}</div> : null}
      </motion.div>
    </div>,
    document.body,
  );
}

export function Row({ icon, label, value, onClick }: { icon?: ReactNode; label: string; value: ReactNode; onClick?: () => void }) {
  const inner = (
    <div className="flex items-start gap-3 py-2.5">
      {icon ? <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE]">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <div className="mt-0.5 break-words text-[14.5px] font-semibold text-slate-900">{value || <span className="text-slate-400">—</span>}</div>
      </div>
    </div>
  );
  return onClick ? <button type="button" onClick={onClick} className="block w-full text-left">{inner}</button> : inner;
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#EEF1FD] text-[#4361EE]">{icon}</div>
      <p className="mt-4 text-[16px] font-extrabold text-slate-900">{title}</p>
      {body ? <p className="mt-1 max-w-[260px] text-[13px] text-slate-500">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/70 ${className}`} />;
}

/** Swipe-to-confirm: prevents accidental taps on status changes, feels like a native field app. */
export function SwipeConfirm({ label, onConfirm, loading, tone = "primary", disabled }: { label: string; onConfirm: () => void | Promise<void>; loading?: boolean; tone?: "primary" | "success"; disabled?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [max, setMax] = useState(240);
  const [done, setDone] = useState(false);
  const fade = useTransform(x, [0, max * 0.6], [1, 0]);
  const fill = useTransform(x, (v) => v + 56);
  useEffect(() => { const m = () => setMax(Math.max(120, (track.current?.clientWidth ?? 300) - 60)); m(); window.addEventListener("resize", m); return () => window.removeEventListener("resize", m); }, []);
  const bg = tone === "success" ? "bg-emerald-600" : "bg-[#4361EE]";
  async function end() {
    if (x.get() > max * 0.82 && !disabled && !loading) {
      setDone(true);
      try { navigator.vibrate?.(30); } catch { /* ignore */ }
      animate(x, max, { duration: 0.12 });
      try { await onConfirm(); } finally { setDone(false); animate(x, 0, { type: "spring", stiffness: 380, damping: 32 }); }
    } else animate(x, 0, { type: "spring", stiffness: 420, damping: 30 });
  }
  return (
    <div ref={track} role="button" tabIndex={0} aria-label={label} aria-disabled={disabled}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled && !loading) { e.preventDefault(); void onConfirm(); } }}
      className={`relative h-[60px] select-none overflow-hidden rounded-full ${disabled ? "opacity-50" : ""} bg-slate-200/80 ring-1 ring-inset ring-slate-300/70`}>
      <motion.div style={{ width: fill }} className={`absolute inset-y-0 left-0 rounded-full ${bg}`} />
      <motion.span style={{ opacity: fade }} className="absolute inset-0 flex items-center justify-center truncate pl-16 pr-5 text-[14.5px] font-extrabold text-slate-600">{loading || done ? "Updating…" : label}</motion.span>
      <motion.div drag={disabled || loading ? false : "x"} dragConstraints={{ left: 0, right: max }} dragElastic={0} dragMomentum={false}
        style={{ x }} onDragEnd={() => void end()}
        className={`absolute left-1 top-1 grid h-[52px] w-[52px] cursor-grab place-items-center rounded-full bg-white text-[#4361EE] shadow-[0_6px_16px_-4px_rgba(20,30,80,0.45)] active:cursor-grabbing`}>
        {loading || done ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ChevronsRight className="h-6 w-6" />}
      </motion.div>
    </div>
  );
}

export function Stagger({ children, i = 0 }: { children: ReactNode; i?: number }) {
  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.045, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}
