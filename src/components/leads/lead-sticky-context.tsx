"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead sticky context bar (View Lead).

   A compact bar that slides in once the Lead HERO scrolls out of view, so the
   user always knows which lead they're reading while deep inside the page:
     L-018 · SRIKAR   [Warm]   Ahmed            [Edit Lead]

   • Driven by an IntersectionObserver on a sentinel placed just below the hero
     (no scroll-position math, no layout thrash).
   • Appears with a short fade + slide-down; hides smoothly on return to top.
   • Respects prefers-reduced-motion (snaps in/out, no transform).
   • Pinned under the app topbar (top: 60px) so it never covers the chrome.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pencil, Phone } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { temperatureLevel, temperatureTone, temperatureGlyph } from "@/lib/lead-temperature";
import type { Lead } from "@/lib/leads-data";

export function LeadStickyContext({
  lead,
  canEdit,
}: {
  lead: Lead;
  canEdit: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0, rootMargin: "-64px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const tLevel = temperatureLevel(lead.leadNature || "");

  return (
    <>
      {/* Sentinel sits where the hero ends; observed to toggle the bar. */}
      <div ref={sentinelRef} aria-hidden className="pointer-events-none h-px w-full" />

      <AnimatePresence>
        {show && (
          <motion.div
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="sticky top-[60px] z-30 -mx-1"
          >
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/90 px-4 py-2.5 shadow-[0_10px_30px_-18px_rgba(20,30,80,0.4)] backdrop-blur-md">
              <Avatar name={lead.name || lead.leadNo} size={30} />
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]">{lead.leadNo}</span>
                <span className="truncate text-[14px] font-bold tracking-tight text-foreground">{lead.name || "Unnamed lead"}</span>
              </div>
              <span className={cn("hidden shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset sm:inline-flex", temperatureTone(tLevel))}>
                <span>{temperatureGlyph(tLevel)}</span> {lead.leadNature || "No temperature"}
              </span>
              <span className="hidden min-w-0 shrink items-center gap-1.5 text-[12px] text-muted-foreground md:inline-flex">
                <span className="truncate">{lead.assignedToName || lead.agent || "Unassigned"}</span>
              </span>

              <div className="ml-auto flex shrink-0 items-center gap-2">
                {lead.number && (
                  <a href={`tel:${lead.number}`} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-zinc-600 transition hover:border-green-300 hover:bg-green-50 hover:text-green-700" aria-label={`Call ${lead.number}`}>
                    <Phone className="h-3.5 w-3.5" />
                  </a>
                )}
                {canEdit && (
                  <Link href={`/leads/list?lead=${lead.id}&action=edit`} className="inline-flex items-center gap-1.5 rounded-lg bg-[linear-gradient(180deg,#4361EE_0%,#3B54E8_100%)] px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(67,97,238,0.6)] transition hover:brightness-105">
                    <Pencil className="h-3.5 w-3.5" /> Edit Lead
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
