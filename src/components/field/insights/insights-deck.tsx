"use client";
/* RepairOX — Field Insights selector deck (sticky, expandable).
   Collapsed: a frosted capsule that reads the current selection at a glance
   ("Period · This Month | Stores · All | View by · Store | Compare · Trips, Business").
   Pressing any segment (or "Adjust") morphs the capsule into the full selector
   with a spring — every row is a connected segmented control whose pill slides
   to the choice. Below it a section rail jumps to any table and follows the
   scroll, so the whole report is explorable without going back up.
   Selections live in the page; the deck only presents them (no data logic).
   Honours prefers-reduced-motion. */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { SlidersHorizontal, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DeckItem {
  key: string;
  label: string;
  /** Short text shown in the collapsed capsule. */
  summary: React.ReactNode;
  /** The full control shown when expanded. */
  control: React.ReactNode;
  hint?: React.ReactNode;
}
export interface DeckSection { id: string; label: string }

const SPRING = { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.9 };

export function InsightsDeck({ items, sections, right }: { items: DeckItem[]; sections: DeckSection[]; right?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const reduce = useReducedMotion();
  const t = reduce ? { duration: 0 } : SPRING;
  const ref = useRef<HTMLDivElement>(null);

  // Escape closes. Outside clicks don't: the pickers inside (store, calendar,
  // dropdowns) are portalled to <body>, and closing under them would lose a pick.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const openAt = (k: string | null) => { setFocus(k); setOpen(true); };

  return (
    <div ref={ref} className="sticky top-[60px] z-[15] -mx-1 -mt-3 px-1 pb-3 pt-1">
      {/* Solid base behind the selector AND the section strip, so content scrolling
          underneath never shows through; a soft fade below eases the edge. */}
      <div aria-hidden className="pointer-events-none absolute -inset-x-3 -top-3 bottom-0 bg-background shadow-[0_10px_18px_-14px_rgba(20,30,80,0.25)]" />
      <div aria-hidden className="pointer-events-none absolute -inset-x-3 top-full h-3 bg-gradient-to-b from-background to-background/0" />
      <LayoutGroup>
        <motion.div layout transition={t}
          className={cn(
            "relative overflow-hidden border-[1.5px] border-[#4361EE]/45 bg-gradient-to-r from-[#EEF1FD] via-[#F6F8FF] to-[#E3E9FF] backdrop-blur-xl",
            "ring-4 ring-[#4361EE]/[0.07] shadow-[0_2px_4px_rgba(67,97,238,0.08),0_20px_44px_-22px_rgba(67,97,238,0.6)]",
            open ? "rounded-[28px]" : "rounded-full",
          )}
          style={{ borderRadius: open ? 28 : 999 }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {!open ? (
              <motion.div key="capsule" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.16 }}
                className="flex items-stretch">
                <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {items.map((it, i) => (
                    <button key={it.key} type="button" onClick={() => openAt(it.key)}
                      className={cn("group flex min-w-[120px] flex-1 flex-col justify-center px-4 py-2 text-left transition hover:bg-white/70 focus:outline-none focus-visible:bg-white/80",
                        i > 0 && "border-l border-[#4361EE]/20")}>
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#4361EE]/75 group-hover:text-[#4361EE]">{it.label}</span>
                      <span className="mt-0.5 truncate text-[13px] font-semibold text-foreground" title={typeof it.summary === "string" ? it.summary : undefined}>{it.summary}</span>
                    </button>
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-2 py-1 pl-2 pr-1">
                  {right}
                  <button type="button" onClick={() => openAt(null)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#4361EE] px-4 text-[13px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(67,97,238,0.8)] transition hover:bg-[#3450D8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40">
                    <SlidersHorizontal className="h-4 w-4" /> Adjust
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="panel" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.18, delay: reduce ? 0 : 0.05 }}>
                <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3">
                  <p className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.14em] text-[#4361EE]"><SlidersHorizontal className="h-3.5 w-3.5" /> Choose what to analyse</p>
                  <button type="button" onClick={() => setOpen(false)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#4361EE] px-4 text-[12.5px] font-semibold text-white transition hover:bg-[#3450D8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40">
                    <Check className="h-3.5 w-3.5" /> Done
                  </button>
                </div>
                <div className="divide-y divide-[#4361EE]/15 px-5">
                  {items.map((it, i) => (
                    <motion.div key={it.key} initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: reduce ? 0 : 0.22, delay: reduce ? 0 : 0.04 * i + 0.06, ease: [0.22, 1, 0.36, 1] }}
                      className={cn("grid grid-cols-1 items-center gap-2 py-3 sm:grid-cols-[150px_1fr]", focus === it.key && "relative")}>
                      {focus === it.key && <motion.span layoutId="deck-focus" aria-hidden className="absolute -left-5 top-3 bottom-3 w-[3px] rounded-r-full bg-[#4361EE]" transition={t} />}
                      <div>
                        <p className={cn("text-[11px] font-bold uppercase tracking-[0.12em]", focus === it.key ? "text-[#4361EE]" : "text-muted-foreground")}>{it.label}</p>
                        {it.hint && <p className="text-[11px] text-muted-foreground">{it.hint}</p>}
                      </div>
                      <div className="min-w-0 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{it.control}</div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </LayoutGroup>
      <SectionRail sections={sections} />
    </div>
  );
}

/* Jump rail — scroll-spy over the page sections; the active pill slides. */
function SectionRail({ sections }: { sections: DeckSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);
  const reduce = useReducedMotion();
  useEffect(() => {
    const els = sections.map((s) => document.getElementById(s.id)).filter((x): x is HTMLElement => !!x);
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-200px 0px -55% 0px", threshold: 0 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [sections]);
  const go = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  return (
    <div className="relative mt-5 flex max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <nav aria-label="Report sections" className="flex w-full min-w-[820px] items-center gap-0.5 rounded-full border border-[#4361EE]/60 bg-muted/90 p-1 backdrop-blur">
        {sections.map((s) => (
          <button key={s.id} type="button" onClick={() => go(s.id)} aria-current={active === s.id ? "true" : undefined}
            className={cn("relative flex-1 whitespace-nowrap rounded-full px-4 py-2 text-[14px] font-semibold transition-colors", active === s.id ? "text-white" : "text-muted-foreground hover:text-foreground")}>
            {active === s.id && <motion.span layoutId="insights-rail" className="absolute inset-0 rounded-full bg-[#4361EE] shadow-[0_6px_20px_-8px_rgba(67,97,238,0.5)]" transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }} />}
            <span className="relative">{s.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Multi-choice chip row (Apple-style toggles) — used for "Compare" metrics. */
export function ChipToggle<T extends string>({ options, value, onChange, max }: {
  options: { value: T; label: string; color?: string }[]; value: T[]; onChange: (v: T[]) => void; max?: number;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        const blocked = !on && max != null && value.length >= max;
        return (
          <button key={o.value} type="button" disabled={blocked} aria-pressed={on}
            title={blocked ? `Pick up to ${max}` : undefined}
            onClick={() => onChange(on ? (value.length > 1 ? value.filter((x) => x !== o.value) : value) : [...value, o.value])}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition",
              on ? "border-transparent bg-[#4361EE] text-white shadow-[0_6px_16px_-8px_rgba(67,97,238,0.7)]" : "border-input bg-card text-foreground hover:border-[#4361EE]/40",
              blocked && "cursor-not-allowed opacity-40")}>
            {o.color && <span className="h-2 w-2 rounded-full" style={{ background: on ? "#fff" : o.color }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
