"use client";
/* RepairOX — the five Field dashboards as gradient cards (hub page + Field overview). */
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFieldDashboard } from "@/components/field/dashboard/use-field-dashboard";

const TONE = {
  sky: "from-sky-100 via-sky-50 to-white border-sky-200/80",
  teal: "from-teal-100 via-emerald-50 to-white border-teal-200/80",
  violet: "from-violet-100 via-violet-50 to-white border-violet-200/80",
  amber: "from-amber-100 via-amber-50 to-white border-amber-200/80",
  emerald: "from-emerald-100 via-emerald-50 to-white border-emerald-200/80",
} as const;
const TILE = {
  sky: "from-sky-400 to-blue-600", teal: "from-teal-400 to-emerald-600", violet: "from-violet-400 to-indigo-600",
  amber: "from-amber-400 to-orange-500", emerald: "from-emerald-400 to-green-600",
} as const;

/* Compact tiles in an auto-fill grid: adding a dashboard just adds a tile, and the
   grid reflows (1 → 2 → 3 columns) instead of stretching each card. */
export function FieldDashboardCards({ columns = "", preview }: { columns?: string; preview?: Record<string, string> }) {
  const router = useRouter();
  const { available } = useFieldDashboard();
  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", columns)}>
      {available.map((d) => (
        <button key={d.id} onClick={() => router.push(d.href)}
          className={cn("group relative flex w-full items-start gap-4 overflow-hidden rounded-2xl border bg-gradient-to-br p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4361EE]/40", TONE[d.tone])}>
          <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-[0_6px_14px_-6px_rgba(0,0,0,0.45)] ring-1 ring-white/40", TILE[d.tone])}><d.Icon className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <h3 className="truncate font-display text-[16px] font-bold text-foreground">{d.name}</h3>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#4361EE] transition group-hover:translate-x-0.5" />
            </span>
            <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-zinc-600" title={d.purpose}>{d.purpose}</p>
            {preview?.[d.id] && <span className="mt-2.5 inline-flex max-w-full rounded-full bg-white/70 px-2.5 py-1 text-[11.5px] font-semibold tabular-nums text-zinc-700 ring-1 ring-inset ring-black/5"><span className="truncate">{preview[d.id]}</span></span>}
          </span>
        </button>
      ))}
    </div>
  );
}
