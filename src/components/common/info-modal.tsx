"use client";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ModalPortal } from "@/components/ui/modal-portal";

export interface ModuleFeature {
  icon: any;
  label: string;
  desc: string;
}

export function InfoModal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  features,
  statusBadge,
  image,
  href,
  activeIndex,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  description: string;
  features: ModuleFeature[];
  statusBadge?: { label: string; tone: "live" | "preview" };
  /** Optional module photo shown on the header's right edge. */
  image?: string;
  /** Optional CTA that opens the module. */
  href?: string;
  /** Feature to spotlight (when opened by clicking one of its icons). */
  activeIndex?: number | null;
}) {
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onEsc);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onEsc);
    };
  }, [open, onClose]);

  // bring the spotlighted feature into view once the modal has animated in
  useEffect(() => {
    if (!open || activeIndex == null) return;
    const t = setTimeout(() => activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 380);
    return () => clearTimeout(t);
  }, [open, activeIndex]);

  return (
    <ModalPortal>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] grid place-items-center bg-[#0F1640]/60 p-4 backdrop-blur-md"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 28, rotateX: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0, rotateX: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              style={{ transformPerspective: 1200 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="modal-title"
              className="relative w-full max-w-2xl overflow-hidden rounded-3xl border-2 border-[#4361EE]/25 bg-card shadow-[0_40px_90px_-30px_rgba(30,45,140,0.7)]"
            >
              {/* close */}
              <button
                onClick={onClose}
                aria-label="Close"
                className="group absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-zinc-700 shadow-card ring-1 ring-zinc-200 transition duration-200 hover:rotate-90 hover:bg-white hover:text-[#4361EE]"
              >
                <X className="h-4 w-4" />
              </button>

              {/* header */}
              <div className="relative overflow-hidden bg-[linear-gradient(135deg,#4361EE_0%,#2F45C4_100%)] px-8 pb-7 pt-8 text-white">
                {image && (
                  <>
                    <img
                      src={image}
                      alt=""
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 right-0 h-full w-[48%] object-cover opacity-50 [mask-image:linear-gradient(to_left,black_20%,transparent)]"
                    />
                  </>
                )}
                <div className="relative">
                  {eyebrow && (
                    <motion.p
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-white/75"
                    >
                      {eyebrow}
                    </motion.p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <motion.h2
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      id="modal-title"
                      className="font-display text-3xl font-extrabold tracking-tight md:text-[34px]"
                    >
                      {title}
                    </motion.h2>
                    {statusBadge && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                          statusBadge.tone === "live"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-amber-50 text-amber-700 ring-amber-200"
                        )}
                      >
                        {statusBadge.label}
                      </span>
                    )}
                  </div>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.25 }}
                    className="mt-2.5 max-w-md text-[14.5px] leading-relaxed text-white/85"
                  >
                    {description}
                  </motion.p>
                </div>
              </div>

              {/* features */}
              <div className="max-h-[52vh] overflow-y-auto px-7 pb-5 pt-6">
                <div className="mb-4 flex items-center gap-3">
                  <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-zinc-600">
                    What&apos;s inside
                  </p>
                  <span className="h-px flex-1 bg-gradient-to-r from-zinc-300 to-transparent" />
                  <span className="text-[11.5px] font-semibold text-[#4361EE]">{features.length} features</span>
                </div>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {features.map((f, i) => {
                    const Icon = f.icon;
                    const active = activeIndex === i;
                    return (
                      <motion.li
                        key={i}
                        ref={active ? activeRef : undefined}
                        initial={{ opacity: 0, y: 18, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.2 + 0.05 * i, type: "spring", stiffness: 260, damping: 22 }}
                        className={cn(
                          "lg-sweep group relative flex cursor-default items-start gap-3.5 rounded-2xl border-2 bg-white p-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-[#4361EE]/60 hover:shadow-[0_14px_28px_-16px_rgba(67,97,238,0.6)]",
                          active ? "border-[#4361EE] shadow-[0_0_0_4px_rgba(67,97,238,0.14)]" : "border-zinc-200"
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 transition duration-200 group-hover:-rotate-6 group-hover:scale-110 group-hover:bg-[#4361EE] group-hover:text-white group-hover:ring-[#4361EE]",
                            active ? "bg-[#4361EE] text-white ring-[#4361EE]" : "bg-brand-50 text-brand-700 ring-brand-200"
                          )}
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold leading-tight transition-colors group-hover:text-[#4361EE]">{f.label}</p>
                          <p className="mt-1 text-[12.5px] leading-snug text-zinc-600">{f.desc}</p>
                        </div>
                        <span className="text-[11px] font-bold tabular-nums text-zinc-300 transition-colors group-hover:text-[#4361EE]/70">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>

              {/* footer CTA */}
              {href && (
                <div className="flex items-center justify-between gap-4 border-t border-zinc-200 bg-[#F6F8FF] px-7 py-4">
                  <p className="text-[13px] font-medium text-zinc-600">Ready to jump in?</p>
                  <Link
                    href={href}
                    className="group inline-flex items-center gap-2 rounded-full brand-gradient px-5 py-2 text-sm font-semibold text-white shadow-glow transition hover:shadow-[0_10px_26px_-8px_rgba(67,97,238,0.8)] active:scale-95"
                  >
                    Open {title}
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}
