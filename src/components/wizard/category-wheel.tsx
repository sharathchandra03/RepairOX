"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone, Laptop, Tablet, Watch, Monitor, MonitorSmartphone, Boxes,
  ChevronLeft, ChevronRight, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Cat = {
  id: string;
  label: string;
  icon: typeof Smartphone;
  tint: string;
  glow: string;
  image?: string;
};

const ICON_MAP: Record<string, typeof Smartphone> = {
  iphone: Smartphone, macbook: Laptop, ipad: Tablet, iwatch: Watch,
  imac: Monitor, android: MonitorSmartphone, windows: Laptop, others: Boxes,
};

const TINT_MAP: Record<string, string> = {
  iphone: "from-indigo-700 via-indigo-900 to-black",
  macbook: "from-zinc-600 via-zinc-800 to-black",
  ipad: "from-zinc-500 via-zinc-700 to-zinc-900",
  iwatch: "from-zinc-600 via-zinc-800 to-zinc-900",
  imac: "from-zinc-400 via-zinc-600 to-zinc-800",
  android: "from-emerald-700 via-zinc-800 to-black",
  windows: "from-sky-700 via-zinc-800 to-black",
  others: "from-violet-700 via-zinc-800 to-zinc-900",
};

const CATS_STORAGE_KEY = "repairox-device-categories";

function loadCats(): Cat[] {
  if (typeof window === "undefined") return getDefaultCats();
  try {
    const raw = localStorage.getItem(CATS_STORAGE_KEY);
    if (!raw) return getDefaultCats();
    const saved: { id: string; label: string; image?: string }[] = JSON.parse(raw);
    return saved.map((c) => ({
      id: c.id,
      label: c.label,
      icon: ICON_MAP[c.id] || Boxes,
      tint: TINT_MAP[c.id] || "from-zinc-600 via-zinc-800 to-black",
      glow: "rgba(79,70,229,0.5)",
      image: c.image,
    }));
  } catch { return getDefaultCats(); }
}

function getDefaultCats(): Cat[] {
  return [
    { id: "macbook", label: "MacBook", icon: Laptop, tint: "from-zinc-600 via-zinc-800 to-black", glow: "rgba(79,70,229,0.5)" },
    { id: "ipad", label: "iPad", icon: Tablet, tint: "from-zinc-500 via-zinc-700 to-zinc-900", glow: "rgba(79,70,229,0.5)" },
    { id: "iwatch", label: "iWatch", icon: Watch, tint: "from-zinc-600 via-zinc-800 to-zinc-900", glow: "rgba(79,70,229,0.5)" },
    { id: "iphone", label: "iPhone", icon: Smartphone, tint: "from-indigo-700 via-indigo-900 to-black", glow: "rgba(79,70,229,0.6)" },
    { id: "imac", label: "iMac", icon: Monitor, tint: "from-zinc-400 via-zinc-600 to-zinc-800", glow: "rgba(79,70,229,0.5)" },
    { id: "android", label: "Android", icon: MonitorSmartphone, tint: "from-emerald-700 via-zinc-800 to-black", glow: "rgba(79,70,229,0.5)" },
    { id: "windows", label: "Windows", icon: Laptop, tint: "from-sky-700 via-zinc-800 to-black", glow: "rgba(79,70,229,0.5)" },
    { id: "others", label: "Others", icon: Boxes, tint: "from-violet-700 via-zinc-800 to-zinc-900", glow: "rgba(79,70,229,0.5)" },
  ];
}

export function CategoryWheel({
  value,
  onChange,
  onNext,
  isEdit,
}: {
  value?: string;
  onChange: (id: string) => void;
  onNext: () => void;
  isEdit?: boolean;
}) {
  const [CATS] = useState<Cat[]>(() => loadCats());
  const initial = value ? CATS.findIndex((c) => c.id === value) : Math.min(3, CATS.length - 1);
  const [active, setActive] = useState(initial >= 0 ? initial : 0);
  const cur = CATS[active] || CATS[0];

  // Sync external value if it changes (e.g. via dot navigation upstream)
  useEffect(() => {
    onChange(cur.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setActive((a) => Math.max(0, a - 1));
      if (e.key === "ArrowRight") setActive((a) => Math.min(CATS.length - 1, a + 1));
      if (e.key === "Enter") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext]);

  const pos = (i: number) => {
    const dist = i - active;
    const abs = Math.abs(dist);
    const sign = Math.sign(dist);
    // x offsets per ring distance - tighter on mobile via CSS transforms below
    const xs = [0, 150, 270, 370, 460];
    const ys = [0, 14, 28, 38, 46];
    const scales = [1.45, 0.95, 0.72, 0.56, 0.48];
    const opacities = [1, 0.9, 0.55, 0.22, 0];
    const blurs = [0, 0, 1.2, 2.5, 6];
    const idx = Math.min(abs, 4);
    return {
      x: sign * xs[idx],
      y: ys[idx],
      scale: scales[idx],
      opacity: opacities[idx],
      blur: blurs[idx],
    };
  };

  const goPrev = () => setActive((a) => Math.max(0, a - 1));
  const goFwd = () => setActive((a) => Math.min(CATS.length - 1, a + 1));

  return (
    <div className="relative">
      {/* ---------- Wheel stage ---------- */}
      <div className="relative h-[280px] overflow-hidden rounded-[28px] sm:h-[320px]">
        {/* Brand wash background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-200/50 via-indigo-100/30 to-violet-200/40" />
        {/* Wave grid */}
        <div className="pointer-events-none absolute inset-0 bg-grid-faint opacity-30 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]" />

        {/* Radial brand glow behind centre */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute left-1/2 top-1/2 h-[440px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: "radial-gradient(closest-side, rgba(79,70,229,0.45), rgba(99,102,241,0) 70%)" }}
          />
        </div>

        {/* Concentric rings around active item */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
              style={{
                width: 200 + i * 70,
                height: 200 + i * 70,
                borderColor: "rgba(99,102,241,0.35)",
              }}
              animate={{
                opacity: [0.55, 0.15, 0.55],
                scale: [1, 1.04, 1],
              }}
              transition={{
                duration: 2.6 + i * 0.4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.2,
              }}
            />
          ))}
        </div>

        {/* Wheel viewport - items absolutely positioned, animated transforms */}
        <div className="absolute inset-0 grid place-items-center [perspective:1100px]">
          {/* Mobile-first: scale the whole wheel down on small screens */}
          <div className="relative h-full w-full origin-center scale-[0.65] sm:scale-[0.8] lg:scale-90">
            <div className="absolute inset-0 grid place-items-center">
              {CATS.map((c, i) => {
                const p = pos(i);
                const isActive = i === active;
                const Icon = c.icon;
                return (
                  <motion.button
                    key={c.id}
                    type="button"
                    onClick={() => (isActive ? onNext() : setActive(i))}
                    animate={{
                      x: p.x,
                      y: p.y,
                      scale: p.scale,
                      opacity: p.opacity,
                      filter: `blur(${p.blur}px)`,
                    }}
                    transition={{ type: "spring", stiffness: 220, damping: 26 }}
                    style={{ zIndex: 50 - Math.abs(i - active) }}
                    className="group absolute flex flex-col items-center gap-3 outline-none"
                    aria-label={c.label}
                    aria-pressed={isActive}
                  >
                    <motion.div
                      animate={{ y: [0, -7, 0] }}
                      transition={{
                        duration: 3 + (i % 3) * 0.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="relative"
                    >
                      <div
                        className={cn(
                          "relative grid h-24 w-24 place-items-center rounded-[20px] bg-gradient-to-b ring-1 ring-zinc-900/10 transition-shadow",
                          c.tint
                        )}
                        style={{
                          boxShadow: isActive
                            ? `0 24px 60px -12px ${c.glow}, 0 8px 22px -8px rgba(0,0,0,0.4)`
                            : "0 14px 30px -16px rgba(0,0,0,0.35)",
                        }}
                      >
                        {c.image ? (
                          <img src={c.image} alt={c.label} className="h-12 w-12 rounded-lg object-cover" />
                        ) : (
                          <Icon className="h-10 w-10 text-white/95" strokeWidth={1.4} />
                        )}
                        {/* Specular highlight */}
                        <div className="pointer-events-none absolute inset-x-3 top-2 h-7 rounded-full bg-white/15 blur-md" />
                        {/* Active accent ring */}
                        {isActive && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="pointer-events-none absolute -inset-1 rounded-[30px] ring-2 ring-indigo-400/70"
                          />
                        )}
                      </div>
                    </motion.div>
                    <span
                      className={cn(
                        "whitespace-nowrap text-sm font-semibold tracking-tight transition",
                        isActive ? "text-zinc-900" : "text-zinc-700"
                      )}
                    >
                      {c.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Side arrows */}
        <button
          onClick={goPrev}
          disabled={active === 0}
          aria-label="Previous"
          className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-zinc-700 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] ring-1 ring-zinc-200 backdrop-blur transition hover:bg-white disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          onClick={goFwd}
          disabled={active === CATS.length - 1}
          aria-label="Next"
          className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-zinc-700 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] ring-1 ring-zinc-200 backdrop-blur transition hover:bg-white disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* ---------- Hero label ---------- */}
      <div className="mt-2 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={cur.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="font-display text-2xl font-extrabold tracking-tight brand-gradient-text"
          >
            {cur.label}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* ---------- Dots ---------- */}
      <div className="mt-2 flex items-center justify-center gap-1.5">
        {CATS.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === active ? "w-6 brand-gradient" : "w-1.5 bg-zinc-300 hover:bg-zinc-400"
            )}
          />
        ))}
      </div>

      {/* ---------- Bottom CTAs ---------- */}
      {!isEdit && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <Button variant="outline" size="lg" onClick={goPrev} disabled={active === 0}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <Button size="lg" onClick={onNext} className="min-w-[140px]">
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
