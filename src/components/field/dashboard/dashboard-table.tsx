"use client";
import { useRef } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollEdges } from "@/hooks/use-scroll-edges";
import { TRIP_GROUP_LABEL, newCount, type GroupMoney, type TripGroup, type Bucket } from "@/lib/field-dashboard";

export const inr = (n: number | null | undefined) => (n == null ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`);
export const GROUPS: TripGroup[] = ["onsite", "pickup", "drop"];

/** Bounded scroll frame with the shared grid look (thin border, scroll-edge shadows). */
export function Frame({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollEdges(ref);
  return <div ref={ref} className="rox-table-card rox-grid-scroll overflow-auto shadow-card">{children}</div>;
}

const FZ = { ["--rox-frozen-offset" as string]: "0px" } as React.CSSProperties;

export function Head({ cols, firstWidth }: { cols: string[]; firstWidth?: number }) {
  return (
    <thead className="rox-table-head sticky top-0 z-[6] [&_.rox-frozen]:!bg-[#5368D4] [&_th]:!text-white"
      style={{ background: "#5368D4", color: "#fff", borderBottom: "2px solid rgba(255,255,255,0.35)" }}>
      <tr className="text-[12px] font-bold uppercase tracking-wider">
        {cols.map((c, i) => (
          <th key={c} className={cn("px-3 py-4", i === 0 ? "rox-frozen rox-frozen-left rox-frozen-left-edge text-left" : "text-center")}
            style={i === 0 ? { ...FZ, minWidth: firstWidth } : undefined}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

/** First (frozen) cell: the row name with its Report 🔍 action underneath. */
export function NameCell({ label, sub, onReport, reportLabel = "Report" }: { label: string; sub?: string; onReport?: () => void; reportLabel?: string }) {
  return (
    <td className="rox-frozen rox-frozen-left rox-frozen-left-edge px-4 py-3 text-left align-middle" style={FZ}>
      <p className="truncate text-[13px] font-bold uppercase tracking-wide text-foreground" title={label}>{label}</p>
      {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      {onReport && (
        <button onClick={onReport} className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#4361EE]/40 bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4361EE] transition hover:bg-[#4361EE] hover:text-white">
          {reportLabel} <Search className="h-3 w-3" />
        </button>
      )}
    </td>
  );
}

/** Empty value — always centred in its (centred) column. */
export const Dash = () => <span className="block text-center text-zinc-300">—</span>;

export type StatTone = "sky" | "emerald" | "violet" | "amber" | "rose" | "zinc";
const TONE_TXT: Record<StatTone, string> = { sky: "text-sky-800", emerald: "text-emerald-700", violet: "text-violet-700", amber: "text-amber-700", rose: "text-rose-700", zinc: "text-zinc-600" };
export interface Stat { label: string; value: React.ReactNode; tone?: StatTone }

/** Label-left / value-right rows in a fixed-width block centred in the column, so every
 *  row's numbers line up vertically down the table. Zero is real data and stays visible. */
export function StatBlock({ stats, onOpen, title = "Open these trips", footer, bar, strong }: {
  stats: Stat[]; onOpen?: () => void; title?: string; footer?: React.ReactNode; bar?: number | null; strong?: boolean;
}) {
  const body = (
    <>
      {stats.map((st) => (
        <span key={st.label} className="flex items-baseline justify-between gap-3 leading-[1.5]">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{st.label}</span>
          <span className={cn("text-[13.5px] font-bold tabular-nums", TONE_TXT[st.tone ?? "zinc"])}>{st.value}</span>
        </span>
      ))}
      {bar != null && <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-emerald-100" aria-hidden><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, bar)}%` }} /></span>}
      {footer && <span className="mt-1.5 block border-t border-border/70 pt-1 text-center text-[10px] font-semibold uppercase tabular-nums tracking-wide text-zinc-500">{footer}</span>}
    </>
  );
  const cls = cn("mx-auto block w-full max-w-[168px] rounded-lg px-2.5 py-1.5 text-left", strong && "bg-muted/40");
  return onOpen
    ? <button onClick={onOpen} title={title} className={cn(cls, "transition hover:bg-[#EEF1FD]")}>{body}</button>
    : <div className={cls}>{body}</div>;
}

/** Business: big total centred, with the per-group breakup as aligned rows. */
export function BusinessCell({ total, money }: { total: number | null; money: GroupMoney }) {
  const parts = GROUPS.filter((g) => money[g] != null);
  return (
    <div className="mx-auto w-full max-w-[168px]">
      <p className={cn("text-center text-[17px] font-extrabold tabular-nums", total == null ? "text-zinc-300" : "text-emerald-700")}>{total == null ? "—" : inr(total)}</p>
      {parts.length > 1 && (
        <div className="mt-1 space-y-0.5 px-2.5">
          {parts.map((g) => (
            <span key={g} className="flex items-baseline justify-between gap-3 text-[10.5px]">
              <span className="font-semibold uppercase tracking-wide text-muted-foreground">{TRIP_GROUP_LABEL[g]}</span>
              <span className="font-bold tabular-nums text-zinc-700">{inr(money[g])}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Assigned / Completed (+ completion bar) and New · Warranty, aligned. */
export function GroupCell({ b, onOpen }: { b: Bucket; onOpen: () => void }) {
  if (b.total === 0) return <Dash />;
  return (
    <StatBlock onOpen={onOpen} bar={b.assigned ? Math.round((b.completed / b.assigned) * 100) : 0}
      stats={[{ label: "Assigned", value: b.assigned, tone: "sky" }, { label: "Completed", value: b.completed, tone: "emerald" }]}
      footer={`New ${newCount(b)} · Warranty ${b.warranty}`} />
  );
}

/** Lead → Trip → Ticket → Invoice: how many trips trace back to a Lead and how far they got. */
export function LeadSyncCell({ r, onOpen }: { r: { totalTrips: number; leadTrips: number; ticketed: number; invoiced: number }; onOpen?: () => void }) {
  if (r.totalTrips === 0) return <Dash />;
  return (
    <StatBlock onOpen={onOpen} title="Open these trips"
      stats={[{ label: "From leads", value: r.leadTrips, tone: "violet" }, { label: "Ticketed", value: r.ticketed, tone: "sky" }, { label: "Invoiced", value: r.invoiced, tone: "emerald" }]}
      footer={`${r.totalTrips - r.leadTrips} direct`} />
  );
}

export function EmptyRows({ text }: { text: string }) {
  return <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>;
}
