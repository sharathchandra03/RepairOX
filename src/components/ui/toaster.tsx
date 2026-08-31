"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, X, Info } from "lucide-react";

/* ─── Global Toast System ─────────────────────────────────────────────────
 * A tiny app-wide toast channel. Any module (including the non-React store)
 * can fire a toast via `toast.error(...)` / `toast.success(...)`. A single
 * <Toaster /> mounted at the app root renders them.
 *
 * This exists so background failures — like a Supabase insert failing inside
 * the store — surface to the user instead of failing silently.
 * ───────────────────────────────────────────────────────────────────────── */

export type ToastVariant = "success" | "error" | "info";

/** Optional call-to-action rendered inside the toast (e.g. "View Lead"). */
export type ToastAction = { label: string; onClick: () => void };

export type ToastMessage = {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  /** Auto-dismiss delay in ms. Errors linger longer so they aren't missed. */
  duration: number;
  /** Optional action button shown at the bottom of the toast. */
  action?: ToastAction;
};

type Listener = (toast: ToastMessage) => void;

const listeners = new Set<Listener>();

type ToastOpts = { description?: string; duration?: number; action?: ToastAction };

function emit(variant: ToastVariant, title: string, opts?: ToastOpts) {
  const message: ToastMessage = {
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    variant,
    title,
    description: opts?.description,
    duration: opts?.duration ?? (variant === "error" ? 6000 : 3000),
    action: opts?.action,
  };
  listeners.forEach((l) => l(message));
}

/** Fire toasts from anywhere (components or plain modules like the store). */
export const toast = {
  success: (title: string, opts?: ToastOpts) => emit("success", title, opts),
  error: (title: string, opts?: ToastOpts) => emit("error", title, opts),
  info: (title: string, opts?: ToastOpts) => emit("info", title, opts),
};

const VARIANT_STYLES: Record<ToastVariant, { ring: string; icon: string; Icon: typeof CheckCircle2 }> = {
  success: { ring: "ring-emerald-200", icon: "text-emerald-600", Icon: CheckCircle2 },
  error: { ring: "ring-rose-200", icon: "text-rose-600", Icon: AlertTriangle },
  info: { ring: "ring-indigo-200", icon: "text-[#4361EE]", Icon: Info },
};

export function Toaster() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const listener: Listener = (message) => {
      setToasts((prev) => [...prev, message]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== message.id));
      }, message.duration);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex w-full max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 sm:max-w-md">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const style = VARIANT_STYLES[t.variant];
          const Icon = style.Icon;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
              className={`pointer-events-auto flex w-full items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-[0_12px_40px_-12px_rgba(20,30,80,0.35)] ring-1 ring-inset ${style.ring}`}
              role="status"
              aria-live={t.variant === "error" ? "assertive" : "polite"}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.icon}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug text-foreground">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{t.description}</p>
                )}
                {t.action && (
                  <button
                    onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                    className="mt-2 inline-flex items-center rounded-lg bg-[#4361EE] px-2.5 py-1 text-[12px] font-semibold text-white transition hover:brightness-105"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
