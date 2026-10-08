"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Detail / View page shared primitives (the "premium" view system).

   ONE source of truth for the look of every single-record VIEW page (View Lead,
   View Ticket, View Invoice, and every future "View <entity>"). It encodes the
   view-detail-pages standard so the three pages stay uniform instead of each
   hand-rolling its own section/field markup:

     • <DetailSection> — the section card: a visible outer border + soft 3D
       shadow, a left colour-ACCENT strip + tinted icon chip (semantic per
       section), a divided header with an optional action (e.g. a
       <SectionEditButton>), scroll-reveal entrance (<Reveal>), and a hover lift.
     • <DetailField>  — a label/value pair. Default = its own thin-bordered box
       (reads as a distinct cell). `flat` = a lighter row (no box) for DENSE
       sections with many fields, where a box-per-field looks cluttered.
     • <SummaryCard>  — a header KPI card (bordered + subtle shadow).
     • <SectionEditButton> — the canonical blue "Edit" header affordance that
       opens a QuickEditDrawer (lightweight section edit; full edit stays in the
       wizard / header Edit action).
     • <DetailHero>   — the premium page HEADER shell: the blue-tinted gradient
       surface + soft brand glow + strong 3D shadow (the View Lead hero). Wrap
       the page's identity + pills + actions + summary KPI row in it.
     • ACCENT        — the restrained semantic palette (strip + chip only; never
       floods the card body).

   Motion respects prefers-reduced-motion (via <Reveal>). Colour is carried ONLY
   by the accent strip + icon chip + status pills — the card surface stays
   white/neutral so the page reads professional.
   ────────────────────────────────────────────────────────────────────────── */

import type { ReactNode } from "react";
import { Pencil, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/common/reveal";
import { cn } from "@/lib/utils";

/* ─── Section colour-accent system ──────────────────────────────────────────
   Each major section gets a left accent strip + a tinted icon chip in a
   semantic colour so it has its own identity. Colour lives ONLY on the accent
   strip + chip — never flooded across the card body. */
export type Accent =
  | "blue" | "green" | "indigo" | "violet" | "amber" | "emerald"
  | "sky" | "rose" | "teal" | "neutral";

export const ACCENT: Record<Accent, { bar: string; chip: string }> = {
  blue:    { bar: "bg-[#4361EE]",   chip: "bg-[#EEF1FD] text-[#4361EE]" },
  green:   { bar: "bg-green-500",   chip: "bg-green-50 text-green-600" },
  indigo:  { bar: "bg-indigo-500",  chip: "bg-indigo-50 text-indigo-600" },
  violet:  { bar: "bg-violet-500",  chip: "bg-violet-50 text-violet-600" },
  amber:   { bar: "bg-amber-500",   chip: "bg-amber-50 text-amber-600" },
  emerald: { bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-600" },
  sky:     { bar: "bg-sky-500",     chip: "bg-sky-50 text-sky-600" },
  rose:    { bar: "bg-rose-500",    chip: "bg-rose-50 text-rose-600" },
  teal:    { bar: "bg-teal-500",    chip: "bg-teal-50 text-teal-600" },
  neutral: { bar: "bg-zinc-300",    chip: "bg-zinc-100 text-zinc-500" },
};

/* The section card. `delay` staggers the reveal; `id` enables deep-link
   anchors (scroll-mt-28 clears the sticky topbar). */
export function DetailSection({
  icon: Icon, title, action, children, id, accent = "blue", delay = 0, className,
}: {
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  accent?: Accent;
  delay?: number;
  className?: string;
}) {
  const a = ACCENT[accent];
  return (
    <Reveal delay={delay}>
      <section
        id={id}
        className={cn(
          "group relative scroll-mt-28 overflow-hidden rounded-2xl border-[1.5px] border-border bg-card p-5 sm:p-6",
          // Soft 3D shadow + a lift on hover (the premium feel).
          "shadow-[0_1px_2px_rgba(20,30,80,0.04),0_10px_30px_-18px_rgba(20,30,80,0.22)]",
          "transition-shadow hover:shadow-[0_2px_4px_rgba(20,30,80,0.05),0_18px_44px_-22px_rgba(20,30,80,0.3)]",
          className,
        )}
      >
        {/* Left accent strip — the section's colour identity. */}
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", a.bar)} />
        <div className="mb-5 flex items-center justify-between gap-2.5 border-b border-border/70 pb-4">
          <div className="flex items-center gap-2.5">
            <span className={cn("grid h-8 w-8 place-items-center rounded-lg", a.chip)}><Icon className="h-4 w-4" /></span>
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
          </div>
          {action}
        </div>
        {children}
      </section>
    </Reveal>
  );
}

/* The canonical blue "Edit" header affordance. Opens a QuickEditDrawer in the
   consuming page; the FULL create/edit still routes to the wizard. */
export function SectionEditButton({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] transition hover:underline">
      <Pencil className="h-3 w-3" /> {label}
    </button>
  );
}

/* A label/value pair.
   • default → its own thin-bordered cell (distinct boxes — great for sparse
     sections like Customer / Device).
   • flat    → a lighter row with only a bottom hairline (great for DENSE
     sections with many fields, e.g. Lead Information / Billing, where a box
     per field looks cluttered).
   `0` / `₹0` are VALID data and are never dimmed. */
export function DetailField({
  label, value, highlight, flat,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
  flat?: boolean;
}) {
  const empty = value === "" || value == null || value === "—";
  return (
    <div className={cn(flat ? "border-b border-border/60 pb-2.5" : "rounded-xl border border-border bg-card/60 px-3.5 py-2.5")}>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-medium", highlight ? "font-bold text-foreground" : "text-foreground", empty && "text-zinc-300")}>
        {empty ? "—" : value}
      </p>
    </div>
  );
}

/* A compact header KPI card (bordered + subtle shadow). */
export function SummaryCard({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm transition hover:border-[#4361EE]/30">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-bold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

/* The premium page HEADER shell — the View Lead hero, now shared so every view
   page (Lead / Ticket / Invoice / future) gets the SAME anchor:
     • a blue-tinted gradient surface (from-white via-#F3F6FF to-#E8EDFF),
     • a soft brand glow in the top-right corner,
     • a strong 3D shadow + a hairline brand border.
   Children (identity + pills + actions + the summary KPI row) are rendered in a
   `relative` wrapper so they layer above the glow. Wrapped in <Reveal> so the
   hero fades/lifts in on load (reduced-motion safe). Compose the inner layout
   however the entity needs — this only owns the premium shell. */
export function DetailHero({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Reveal>
      <div className={cn("relative overflow-hidden rounded-2xl border border-[#4361EE]/15 bg-gradient-to-br from-white via-[#F3F6FF] to-[#E8EDFF] p-5 shadow-[0_18px_50px_-30px_rgba(67,97,238,0.5)] sm:p-6", className)}>
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[#4361EE]/10 blur-3xl" />
        <div className="relative">{children}</div>
      </div>
    </Reveal>
  );
}
