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
export function NameCell({ label, onReport, reportLabel = "Report" }: { label: string; onReport?: () => void; reportLabel?: string }) {
  return (
    <td className="rox-frozen rox-frozen-left rox-frozen-left-edge px-3 py-2.5 text-left align-middle" style={FZ}>
      <p className="text-[13px] font-bold uppercase tracking-wide text-foreground">{label}</p>
      {onReport && (
        <button onClick={onReport} className="mt-1 inline-flex items-center gap-1 rounded-full border border-[#4361EE]/40 bg-[#EEF1FD] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4361EE] transition hover:bg-[#4361EE] hover:text-white">
          {reportLabel} <Search className="h-3 w-3" />
        </button>
      )}
    </td>
  );
}

/** "DROP ₹15,000 · ON-SITE ₹20,000" — only the groups that have finalized business. */
export function MoneyBreakup({ money, className }: { money: GroupMoney; className?: string }) {
  const parts = GROUPS.filter((g) => money[g] != null);
  if (parts.length === 0) return null;
  return (
    <p className={cn("text-[10.5px] font-semibold uppercase leading-snug tracking-wide text-zinc-500", className)}>
      {parts.map((g) => `${TRIP_GROUP_LABEL[g]} ${inr(money[g])}`).join(" · ")}
    </p>
  );
}

/** ASSIGN – n / COMPLETED – n / NEW – n / WARRANTY – n  (click = open these trips). */
export function GroupCell({ b, onOpen }: { b: Bucket; onOpen: () => void }) {
  if (b.total === 0) return <span className="text-zinc-300">—</span>;
  return (
    <button onClick={onOpen} title="Open these trips" className="w-full rounded-lg px-2 py-0.5 text-left leading-[1.25] transition hover:bg-[#EEF1FD]">
      <span className="block text-[12px] font-bold uppercase tabular-nums text-sky-800">Assign – {b.assigned}</span>
      <span className="block text-[12px] font-bold uppercase tabular-nums text-emerald-700">Completed – {b.completed}</span>
      <span className="block text-[10px] font-semibold uppercase tabular-nums text-zinc-500">New – {newCount(b)} / Warranty – {b.warranty}</span>
    </button>
  );
}

export function EmptyRows({ text }: { text: string }) {
  return <div className="p-12 text-center text-sm text-muted-foreground">{text}</div>;
}
