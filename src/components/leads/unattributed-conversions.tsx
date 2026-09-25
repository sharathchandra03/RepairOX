"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Unattributed / Possible Lead Match (attribution safety net)

   Operational records (Walk-Ins, Tickets) can be created without a Lead link —
   e.g. a customer walks in and the store makes a Ticket directly, or the open-
   lead banner was dismissed. This surface finds such records that STILL match an
   OPEN lead by customer identity (Customer id → phone → email, never name) and
   lets an authorized user attribute them — so sales credit is never permanently
   lost. Linking reuses the SAME linkOperationalRecord choke point (which writes
   the lead's linked_* id + a conversion event and guards duplicate attribution).
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Link2, AlertTriangle, ShoppingBag, Ticket as TicketIcon } from "lucide-react";
import { useLeads } from "@/lib/leads-context";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { findOpenLeadMatches, type Lead } from "@/lib/leads-data";
import { walkInDisplayId } from "@/lib/walk-in-data";
import { cn } from "@/lib/utils";

type Candidate = {
  kind: "walk_in" | "ticket";
  id: string;
  label: string;
  customer: string;
  phone?: string;
  email?: string;
  customerId?: string;
  matches: { lead: Lead; matchedOn: string; confidence: string }[];
};

export function UnattributedConversions() {
  const { leads, linkOperationalRecord } = useLeads();
  const { walkIns, tickets } = useStore();
  const { can } = usePermissions();
  // Attributing a record to a lead is an assignment-tier action.
  const canAttribute = allow(can, CAP.lead.assign) || allow(can, CAP.lead.reassign);
  const [linking, setLinking] = useState<string | null>(null);

  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = [];

    for (const w of walkIns) {
      if (w.linkedLeadId) continue;               // already attributed
      const ident = { phone: w.phone, email: w.email, customerId: w.customerId };
      if (!ident.phone && !ident.email && !ident.customerId) continue;
      const matches = findOpenLeadMatches(leads, ident);
      if (matches.length === 0) continue;
      out.push({
        kind: "walk_in", id: w.id, label: walkInDisplayId(w),
        customer: w.customer || "—", phone: w.phone, email: w.email, customerId: w.customerId,
        matches,
      });
    }

    for (const t of tickets) {
      if ((t as any).linkedLeadId) continue;
      const phone = (t as any).phone as string | undefined;
      const email = (t as any).email as string | undefined;
      const customerId = (t as any).customerId as string | undefined;
      if (!phone && !email && !customerId) continue;
      const matches = findOpenLeadMatches(leads, { phone, email, customerId });
      if (matches.length === 0) continue;
      out.push({
        kind: "ticket", id: t.id, label: (t as any).ticketNo || t.id,
        customer: (t as any).customer || "—", phone, email, customerId,
        matches,
      });
    }
    return out;
  }, [walkIns, tickets, leads]);

  const link = async (c: Candidate, lead: Lead) => {
    setLinking(c.id);
    try { await linkOperationalRecord(lead.id, c.kind, c.id, c.label); }
    finally { setLinking(null); }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-2.5 border-b border-border/70 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-50 text-amber-600"><AlertTriangle className="h-4 w-4" /></span>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Unattributed / Possible Lead Match</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Operational records with no lead link that match an open lead.</p>
          </div>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-zinc-600">{candidates.length}</span>
      </div>

      {candidates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-[13px] text-muted-foreground">
          Nothing to attribute — every operational record that matches an open lead is already linked.
        </p>
      ) : (
        <ul className="space-y-3">
          {candidates.map((c) => {
            const top = c.matches[0];
            return (
              <li key={`${c.kind}:${c.id}`} className="rounded-xl border border-border p-3.5">
                <div className="flex items-center gap-2">
                  <span className={cn("grid h-7 w-7 place-items-center rounded-lg", c.kind === "walk_in" ? "bg-amber-50 text-amber-600" : "bg-indigo-50 text-indigo-600")}>
                    {c.kind === "walk_in" ? <ShoppingBag className="h-3.5 w-3.5" /> : <TicketIcon className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-zinc-900">
                      {c.label} <span className="font-normal text-zinc-500">· {c.customer}</span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">{c.phone || c.email || "—"}</p>
                  </div>
                </div>

                <div className="mt-2.5 space-y-1.5 border-t border-border pt-2.5">
                  {c.matches.slice(0, 3).map((m) => (
                    <div key={m.lead.id} className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[12px] text-zinc-700">
                        <span className="font-semibold">{m.lead.leadNo}</span>
                        <span className="text-zinc-500"> · {m.lead.name || "Unnamed"} · {m.lead.assignedToName || m.lead.agent || "Unassigned"}</span>
                        <span className="ml-1.5 rounded-full bg-[#EEF1FD] px-1.5 py-px text-[10px] font-medium text-[#4361EE]">{m.matchedOn}</span>
                      </p>
                      {canAttribute && (
                        <button
                          onClick={() => link(c, m.lead)}
                          disabled={linking === c.id}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#4361EE]/40 bg-[#EEF1FD] px-2.5 py-1 text-[12px] font-semibold text-[#4361EE] transition hover:bg-[#E0E6FC] disabled:opacity-50"
                        >
                          <Link2 className="h-3.5 w-3.5" /> Link
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {!canAttribute && <p className="mt-2 text-[10px] text-muted-foreground">You don't have permission to attribute leads.</p>}
                {top && <span className="sr-only">Top match {top.lead.leadNo}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
