"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In Follow-Up View

   Two focused sub-views, switched by an Active / History toggle:

     • ACTIVE  — "who needs action NOW?" Only walk-ins with an ACTIVE scheduled
                 follow-up (not completed, not converted / terminal), ordered
                 overdue → today → upcoming, nearest due first.
     • HISTORY — "what happened with this customer?" Walk-ins that have at least
                 one COMPLETED follow-up attempt. Nothing is deleted on
                 completion, so this is the permanent audit trail.

   Both reuse the exact table shell / header / row treatment of the main Walk-In
   table (spec §28 columns): DATE · ID · CUSTOMER · CONTACT · MODEL · ISSUE ·
   FOLLOW-UP · FINAL STATUS · ACTION. The FOLLOW-UP cell is the SAME interactive
   pill used in the main table, so the multi-stage lifecycle is managed
   identically from either place. Clicking a row opens the existing Edit Walk-In.
   ────────────────────────────────────────────────────────────────────────── */

import { motion } from "framer-motion";
import { Pencil, History as HistoryIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type WalkIn, type WalkInStatus, WALKIN_TYPE_BAR, FOLLOWUP_OUTCOME_LABEL,
} from "@/lib/mock-data";
import { pendingFollowUps, walkInDisplayId, ordinal } from "@/lib/walk-in-data";
import { EmptyStateCharacter } from "@/components/common/empty-state-character";
import { WalkInFollowUpCell } from "@/components/walk-in/walk-in-followup-cell";

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

export function WalkInFollowUpView({
  mode,
  onModeChange,
  rows,
  activeCount,
  historyCount,
  currentUserId,
  currentUserName,
  statusLabel,
  statusTone,
  onOpen,
  onUpdate,
  onConvert,
}: {
  mode: "active" | "history";
  onModeChange: (m: "active" | "history") => void;
  /** Pre-filtered rows for the current sub-view. */
  rows: WalkIn[];
  activeCount: number;
  historyCount: number;
  currentUserId?: string;
  currentUserName?: string;
  statusLabel: Record<WalkInStatus, string>;
  statusTone: Record<WalkInStatus, string>;
  onOpen: (w: WalkIn) => void;
  onUpdate: (w: WalkIn, patch: Partial<WalkIn>) => void;
  onConvert: (w: WalkIn) => void;
}) {
  const now = new Date();
  // Active view orders by urgency; history view keeps the caller's recency order.
  const list = mode === "active" ? pendingFollowUps(rows, now) : rows;

  return (
    <div className="-mt-5 space-y-3">
      {/* Active / History sub-toggle — keeps the actionable queue clean while
          making the full audit trail retrievable (never deletes data). */}
      <div className="flex items-center gap-1 rounded-full bg-muted p-1 w-fit">
        <SubTab label="Active" count={activeCount} active={mode === "active"} onClick={() => onModeChange("active")} />
        <SubTab label="History" count={historyCount} active={mode === "history"} onClick={() => onModeChange("history")} icon={HistoryIcon} />
      </div>

      <div className="border-2 border-zinc-200 bg-card shadow-card">
        <div className="[overflow-x:clip]">
          <table className="w-full table-fixed text-[14px]">
            <colgroup>
              <col className="w-[104px]" />{/* Date */}
              <col className="w-[92px]" />{/* ID */}
              <col className="w-[16%]" />{/* Customer */}
              <col className="w-[124px]" />{/* Contact */}
              <col className="w-[13%]" />{/* Model */}
              <col className="w-[15%]" />{/* Issue */}
              <col className="w-[184px]" />{/* Follow-Up / Last Outcome */}
              <col className="w-[128px]" />{/* Final Status */}
              <col className="w-[96px]" />{/* Action */}
            </colgroup>
            <thead className="bg-[#D6DDFB] border-b-2 border-[#4361EE]/25">
              <tr className="text-left text-[12px] font-bold uppercase tracking-wider text-[#4361EE]">
                <th className="py-4"><span className="inline-block pl-5">Date</span></th>
                <th className="py-4">ID</th>
                <th className="pl-4 py-4">Customer</th>
                <th className="pl-4 py-4">Contact</th>
                <th className="pl-4 py-4">Model</th>
                <th className="pl-4 py-4">Issue</th>
                <th className="pl-4 py-4">{mode === "history" ? "Last Outcome" : "Follow-Up"}</th>
                <th className="pl-4 py-4">Final Status</th>
                <th className="px-4 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((w, i) => {
                const last = w.followUpHistory?.[w.followUpHistory.length - 1];
                return (
                  <motion.tr
                    key={w.id}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(0.015 * i, 0.2) }}
                    onClick={() => onOpen(w)}
                    className="group h-[68px] cursor-pointer border-t border-border align-middle transition hover:bg-muted/40"
                  >
                    <td className="py-4 pl-5 pr-4 whitespace-nowrap text-[13px] text-muted-foreground">{fmtDate(w.date)}</td>
                    <td className="py-4 pr-4 whitespace-nowrap">
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
                    <td className="pl-4 py-4 pr-4" onClick={(e) => e.stopPropagation()}>
                      {mode === "history" && last ? (
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-semibold">{ordinal(last.attempt)} · {FOLLOWUP_OUTCOME_LABEL[last.outcome]}</p>
                          <p className="text-[11px] text-muted-foreground">{w.followUpHistory!.length} attempt{w.followUpHistory!.length !== 1 ? "s" : ""}</p>
                        </div>
                      ) : (
                        <WalkInFollowUpCell
                          walkIn={w}
                          currentUserId={currentUserId}
                          currentUserName={currentUserName}
                          onUpdate={(patch) => onUpdate(w, patch)}
                          onConvert={onConvert}
                        />
                      )}
                    </td>
                    <td className="pl-4 py-4 pr-4">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap", statusTone[w.status])}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {statusLabel[w.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onOpen(w)}
                          title="Open Walk-In"
                          aria-label={`Open walk-in ${walkInDisplayId(w)}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
                        >
                          <Pencil className="h-4 w-4" />
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
            <p className="font-semibold">{mode === "active" ? "No pending follow-ups" : "No follow-up history yet"}</p>
            <p className="text-sm text-muted-foreground">
              {mode === "active"
                ? "Walk-ins with a scheduled follow-up will appear here, ordered by what needs attention first."
                : "Completed follow-up attempts will appear here so you can review the full customer journey."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SubTab({ label, count, active, onClick, icon: Icon }: { label: string; count: number; active: boolean; onClick: () => void; icon?: any }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition",
        active ? "bg-card text-[#4361EE] shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
      {count > 0 && (
        <span
          className={cn(
            // Fixed height + centred content so a single digit is a clean circle,
            // never squished or pressed against the label.
            "inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold leading-none tabular-nums",
            active ? "bg-[#4361EE] text-white" : "bg-zinc-200 text-zinc-600",
          )}
          style={{ minWidth: 18 }}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
