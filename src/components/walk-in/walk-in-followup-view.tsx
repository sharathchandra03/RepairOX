"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Follow-Up View

   A focused list answering "who needs to be followed up?". It shows ONLY
   walk-ins that have a follow-up scheduled that is still pending, ordered
   intelligently (overdue → today → upcoming, nearest due first). It reuses the
   exact table shell / header / row treatment of the main Walk-In table so it
   feels native — it is NOT a new table design. Clicking a row (or the ID,
   customer or model) opens the existing Edit Walk-In experience.

   All data comes from the real walk-in records passed in; nothing is derived
   from a parallel store. Completing / rescheduling / removing a follow-up on
   the record automatically changes what appears here.
   ────────────────────────────────────────────────────────────────────────── */

import { motion } from "framer-motion";
import { Pencil, CheckCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type WalkIn,
  WALKIN_TYPE_BAR,
  followUpDueAt,
} from "@/lib/mock-data";
import {
  type FollowUpState, pendingFollowUps, followUpState, walkInDisplayId,
} from "@/lib/walk-in-data";
import { EmptyStateCharacter } from "@/components/common/empty-state-character";

const STATE_LABEL: Record<FollowUpState, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  completed: "Completed",
};

/* Reuse RepairOX semantic tones — rose (overdue), indigo/brand (today),
   slate (upcoming). Same pill shape/ring treatment as the Final Status pill. */
const STATE_TONE: Record<FollowUpState, string> = {
  overdue: "bg-rose-50 text-rose-600 ring-rose-200",
  today: "bg-[#EEF1FD] text-[#4361EE] ring-[#B3BFF6]",
  upcoming: "bg-slate-100 text-slate-600 ring-slate-200",
  completed: "bg-emerald-50 text-emerald-600 ring-emerald-200",
};

function fmtFollowUp(w: WalkIn): string {
  const due = followUpDueAt(w);
  if (!due) return "—";
  return due.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtFollowUpTime(w: WalkIn): string {
  if (!w.followUpTime) return "—";
  const due = followUpDueAt(w);
  if (!due) return "—";
  return due.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function WalkInFollowUpView({
  rows,
  onOpen,
  onComplete,
}: {
  /** The already date/type/source/status/search-filtered rows. */
  rows: WalkIn[];
  /** Open the existing Edit Walk-In for this record. */
  onOpen: (w: WalkIn) => void;
  /** Mark this follow-up complete (preserves history). */
  onComplete: (w: WalkIn) => void;
}) {
  const now = new Date();
  const list = pendingFollowUps(rows, now);

  return (
    <div className="-mt-5 border-2 border-zinc-200 bg-card shadow-card">
      <div className="[overflow-x:clip]">
        <table className="w-full table-fixed text-[14px]">
          <colgroup>
            <col className="w-[92px]" />{/* ID */}
            <col className="w-[20%]" />{/* Customer */}
            <col className="w-[124px]" />{/* Contact */}
            <col className="w-[16%]" />{/* Model */}
            <col className="w-[22%]" />{/* Issue */}
            <col className="w-[132px]" />{/* Follow-Up date/time */}
            <col className="w-[120px]" />{/* Assigned */}
            <col className="w-[116px]" />{/* State */}
            <col className="w-[120px]" />{/* Action */}
          </colgroup>
          <thead className="bg-[#D6DDFB] border-b-2 border-[#4361EE]/25">
            <tr className="text-left text-[12px] font-bold uppercase tracking-wider text-[#4361EE]">
              <th className="py-4"><span className="inline-block pl-5">ID</span></th>
              <th className="pl-4 py-4">Customer</th>
              <th className="pl-4 py-4">Contact</th>
              <th className="pl-4 py-4">Model</th>
              <th className="pl-4 py-4">Issue</th>
              <th className="pl-4 py-4">Follow-Up</th>
              <th className="pl-4 py-4">Assigned</th>
              <th className="pl-4 py-4">Status</th>
              <th className="px-4 py-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.map((w, i) => {
              const state = followUpState(w, now) ?? "upcoming";
              return (
                <motion.tr
                  key={w.id}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(0.015 * i, 0.2) }}
                  onClick={() => onOpen(w)}
                  className="group h-[68px] cursor-pointer border-t border-border align-middle transition hover:bg-muted/40"
                >
                  <td className="py-4 pl-5 pr-4 whitespace-nowrap">
                    <span className="text-[14px] font-semibold text-foreground transition-colors group-hover:text-[#4361EE]">
                      {walkInDisplayId(w)}
                    </span>
                  </td>
                  <td className="pl-4 py-4 pr-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={cn("h-8 w-1 shrink-0 rounded-full", WALKIN_TYPE_BAR[w.type ?? "direct"])} />
                      <span className="truncate text-[14px] font-medium">{w.customer || "—"}</span>
                    </div>
                  </td>
                  <td className="pl-4 py-4 pr-4 text-[13px] whitespace-nowrap tabular-nums">{w.phone || "—"}</td>
                  <td className="pl-4 py-4 pr-4 text-[13px] truncate max-w-[150px]">{w.model || "—"}</td>
                  <td className="pl-4 py-4 pr-4 text-[13px] text-muted-foreground truncate max-w-[190px]" title={w.issue || (w.reasons || []).join(", ")}>
                    {w.issue || (w.reasons || []).join(", ") || "—"}
                  </td>
                  <td className="pl-4 py-4 pr-4 text-[13px] whitespace-nowrap">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <Clock className="h-3.5 w-3.5 text-[#4361EE]" />
                      {fmtFollowUp(w)}
                    </div>
                    <p className="mt-0.5 pl-5 text-[11px] text-muted-foreground">{fmtFollowUpTime(w)}</p>
                  </td>
                  <td className="pl-4 py-4 pr-4 text-[13px] truncate max-w-[120px]" title={w.salesPersonName || ""}>
                    {w.salesPersonName || "—"}
                  </td>
                  <td className="pl-4 py-4 pr-4">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium ring-1 ring-inset whitespace-nowrap", STATE_TONE[state])}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {STATE_LABEL[state]}
                    </span>
                  </td>
                  <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onOpen(w)}
                        title="Edit Walk-In"
                        aria-label={`Edit walk-in ${walkInDisplayId(w)}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onComplete(w)}
                        title="Mark follow-up complete"
                        aria-label={`Complete follow-up for ${walkInDisplayId(w)}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-50"
                      >
                        <CheckCheck className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {list.length === 0 && (
        <div className="flex flex-col items-center gap-2 p-12 text-center">
          <EmptyStateCharacter variant="walkin" />
          <p className="font-semibold">No pending follow-ups</p>
          <p className="text-sm text-muted-foreground">
            Walk-ins with a scheduled follow-up will appear here, ordered by what needs attention first.
          </p>
        </div>
      )}
    </div>
  );
}
