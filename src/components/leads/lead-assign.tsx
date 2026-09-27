"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead assignment UI helpers.

   • AssignBadge   — compact owner display (avatar + name, or "Unassigned"),
                     flagging an owner who is no longer an eligible Sales Agent.
   • AssignMenu    — a searchable SALES AGENT picker that (re)assigns a lead.
                     Options come ONLY from the Sales Agent directory
                     (useLeads().salesAgentsFor(lead.branchId)): active users
                     whose role holds `leads_sales_agent`, authorized for the
                     lead's store. Never the whole staff list. Gated by
                     CAP.lead.assign (no owner yet) / CAP.lead.reassign (change
                     owner). The DB ownership guard (migration 0049) enforces
                     eligibility + permission and writes the history row.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Search, Check, UserPlus, ChevronDown, UserX, AlertTriangle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown } from "@/components/ui/dropdown";
import { usePermissions } from "@/lib/permissions-context";
import { useLeads } from "@/lib/leads-context";
import { canAssignLeads, type Lead } from "@/lib/leads-data";
import { SalesAgentEmptyState } from "@/components/leads/lead-form-fields";
import { cn } from "@/lib/utils";

/** Whether the current user may assign (no owner yet) or reassign leads. */
export function useCanAssignLeads(): boolean {
  const { can } = usePermissions();
  return canAssignLeads(can);
}

/** True when the lead's current owner is no longer an eligible Sales Agent
 *  for its store (role removed / deactivated / lost store access). */
function useOwnerIneligible(lead: Lead): boolean {
  const { isEligibleSalesAgent, salesAgentsReady } = useLeads();
  return !!lead.assignedTo && salesAgentsReady && !isEligibleSalesAgent(lead.assignedTo, lead.branchId || null);
}

/** Compact owner display used in the list and detail. */
export function AssignBadge({ lead, size = 22 }: { lead: Lead; size?: number }) {
  const ineligible = useOwnerIneligible(lead);
  if (!lead.assignedToName) {
    return <span className="text-[12px] text-muted-foreground">Unassigned</span>;
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={ineligible ? "No longer an active Sales Agent — reassign this lead" : undefined}>
      <Avatar name={lead.assignedToName} size={size} />
      <span className="truncate text-[12px] font-medium text-zinc-700">{lead.assignedToName}</span>
      {ineligible && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Owner is no longer an active Sales Agent" />}
    </span>
  );
}

/**
 * Searchable Sales Agent picker. Renders as a small trigger; opens a dropdown
 * of eligible Sales Agents for the lead's store. Selecting one (re)assigns the
 * lead (DB-validated + history + notification).
 * `compact` renders a denser trigger for table rows.
 */
export function AssignMenu({ lead, compact }: { lead: Lead; compact?: boolean }) {
  const { assignLead, salesAgentsFor, salesAgentsReady, canChangeLeadOwner } = useLeads();
  const [query, setQuery] = useState("");
  const ineligible = useOwnerIneligible(lead);

  // Mirrors the DB guard: reassign-level keys → any visible lead; leads_assign
  // → leads you own/created (or any lead with a see-all key).
  const canChange = canChangeLeadOwner(lead);

  const agents = useMemo(() => salesAgentsFor(lead.branchId || null), [salesAgentsFor, lead.branchId]);
  const q = query.trim().toLowerCase();
  const filtered = q ? agents.filter((a) => a.name.toLowerCase().includes(q)) : agents;

  // Without the capability, show the owner read-only (never a dead dropdown).
  if (!canChange) return <AssignBadge lead={lead} size={compact ? 20 : 24} />;

  const pick = (id: string, name: string, close: () => void) => {
    if (id !== lead.assignedTo) void assignLead(lead.id, id, name);
    close();
    setQuery("");
  };
  const clear = (close: () => void) => {
    if (lead.assignedTo) void assignLead(lead.id, "", "");
    close();
    setQuery("");
  };

  return (
    <div className="w-full" onClick={(e) => e.stopPropagation()}>
      <Dropdown
        className="w-full"
        align="right"
        width="w-64"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            className={cn(
              // Fill the cell so long agent names get the full column width.
              "inline-flex w-full max-w-full items-center gap-1.5 rounded-lg border bg-card text-[12.5px] font-medium text-zinc-700 transition hover:border-[#4361EE]/40 hover:text-[#4361EE]",
              ineligible ? "border-amber-300" : "border-border",
              compact ? "px-2 py-1" : "px-2.5 py-1.5",
            )}
            title={
              ineligible ? `${lead.assignedToName} is no longer an active Sales Agent — reassign`
                : lead.assignedToName ? `Owner: ${lead.assignedToName}` : "Assign a Sales Agent"
            }
            aria-label={lead.assignedToName ? `Change owner (currently ${lead.assignedToName})` : "Assign a Sales Agent"}
          >
            {lead.assignedToName ? (
              <>
                <Avatar name={lead.assignedToName} size={18} />
                {/* Always show the name (name is the point of the Agent column);
                    truncates only if it genuinely overflows the cell. */}
                <span className="min-w-0 flex-1 truncate text-left">{lead.assignedToName}</span>
                {ineligible && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left text-zinc-500">Assign</span>
              </>
            )}
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </button>
        )}
      >
        {(close) => (
          <>
            {ineligible && (
              <div className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><span className="font-semibold">{lead.assignedToName}</span> is no longer an active Sales Agent for this store. Reassign to keep this lead moving — history is kept.</span>
              </div>
            )}
            {agents.length > 0 && (
              <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search sales agents…"
                  aria-label="Search sales agents"
                  className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}
            <div className="max-h-56 overflow-y-auto p-1">
              {lead.assignedTo && (
                <button onClick={() => clear(close)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-rose-600 hover:bg-rose-50">
                  <UserX className="h-3.5 w-3.5" /> Unassign
                </button>
              )}
              {!salesAgentsReady ? (
                <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">Loading sales agents…</p>
              ) : agents.length === 0 ? (
                <SalesAgentEmptyState storeScoped={!!lead.branchId} />
              ) : filtered.length === 0 ? (
                <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No sales agent matches “{query.trim()}”.</p>
              ) : (
                filtered.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => pick(a.id, a.name, close)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition",
                      a.id === lead.assignedTo ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60",
                    )}
                  >
                    <Avatar name={a.name} src={a.avatarUrl} size={22} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{a.name}</span>
                      {a.roleLabel && <span className="block truncate text-[10.5px] font-normal text-muted-foreground">{a.roleLabel}</span>}
                    </span>
                    {a.id === lead.assignedTo && <Check className="h-3.5 w-3.5 shrink-0 text-[#4361EE]" />}
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </Dropdown>
    </div>
  );
}
