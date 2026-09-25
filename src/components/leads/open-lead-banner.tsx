"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — "OPEN LEAD FOUND" banner (attribution safety net)

   Shown in the Walk-In and Ticket creation flows. When the customer's phone /
   email / Customer Master id matches an OPEN lead, this surfaces:

       OPEN LEAD FOUND
       Lead:   LM-26: 0107-03
       Customer: Suraj
       Assigned Agent: Arjun
       [ Link to Lead ]   [ Continue Without Link ]

   Attribution uses Customer id → phone → email (never name alone). A confident
   single match is highlighted; multiple candidates are listed. Linking here
   sets the originating lead on the draft record (pre-create) so the created
   Walk-In / Ticket carries `linkedLeadId` — sales attribution survives the
   handoff without any manual message/Excel. The customer identity always comes
   from the Customer Master.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Link2, X, UserCheck, Target } from "lucide-react";
import { useLeads } from "@/lib/leads-context";
import { findOpenLeadMatches, type Lead } from "@/lib/leads-data";

export function OpenLeadBanner({
  phone, email, customerId, linkedLeadId, onLink, onDismiss,
}: {
  phone?: string;
  email?: string;
  customerId?: string;
  /** The lead already linked to this draft (if any) — hides the banner. */
  linkedLeadId?: string;
  /** Called when the user links a lead. Receives the chosen lead. */
  onLink: (lead: Lead) => void;
  /** Called when the user chooses "Continue Without Link" (dismiss this session). */
  onDismiss?: () => void;
}) {
  const { leads } = useLeads();
  const [dismissed, setDismissed] = useState(false);

  const matches = useMemo(
    () => findOpenLeadMatches(leads, { phone, email, customerId }),
    [leads, phone, email, customerId],
  );

  // Already linked, dismissed, or nothing to match → render nothing.
  if (linkedLeadId || dismissed || matches.length === 0) return null;

  const top = matches[0];
  const multiple = matches.length > 1;

  return (
    <div className="rounded-xl border border-[#4361EE]/40 bg-[#EEF1FD] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#3347D6]">
          <Target className="h-3.5 w-3.5" /> Open Lead Found
        </p>
        <button
          onClick={() => { setDismissed(true); onDismiss?.(); }}
          className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 hover:bg-white hover:text-zinc-600"
          title="Continue without linking"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Single confident match — preselected */}
      {!multiple ? (
        <MatchRow lead={top.lead} matchedOn={top.matchedOn} onLink={() => onLink(top.lead)} />
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-zinc-500">{matches.length} possible matches — pick the right lead:</p>
          {matches.slice(0, 4).map((m) => (
            <MatchRow key={m.lead.id} lead={m.lead} matchedOn={m.matchedOn} onLink={() => onLink(m.lead)} />
          ))}
        </div>
      )}

      <button
        onClick={() => { setDismissed(true); onDismiss?.(); }}
        className="mt-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-700 hover:underline"
      >
        Continue without linking
      </button>
    </div>
  );
}

function MatchRow({ lead, matchedOn, onLink }: { lead: Lead; matchedOn: string; onLink: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-inset ring-[#B3BFF6]/50">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-zinc-900">
          {lead.leadNo}
          <span className="ml-1.5 font-normal text-zinc-500">· {lead.name || "Unnamed"}</span>
        </p>
        <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-zinc-500">
          <UserCheck className="h-3 w-3" /> {lead.assignedToName || lead.agent || "Unassigned"}
          <span className="ml-1 rounded-full bg-[#EEF1FD] px-1.5 py-px text-[10px] font-medium text-[#4361EE]">{matchedOn} match</span>
        </p>
      </div>
      <button
        onClick={onLink}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4361EE] px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#3347D6]"
      >
        <Link2 className="h-3.5 w-3.5" /> Link to Lead
      </button>
    </div>
  );
}
