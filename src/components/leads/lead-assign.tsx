"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead assignment UI helpers.

   • AssignBadge   — compact assignee display (avatar + name, or "Unassigned").
   • AssignMenu    — a searchable staff picker that reassigns a lead. Only
                     rendered for users who can assign (owners/managers); the
                     assignable users come straight from the existing staff
                     directory (usePermissions().team) — no separate lead-user DB.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Search, Check, UserPlus, ChevronDown, UserX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Dropdown } from "@/components/ui/dropdown";
import { usePermissions } from "@/lib/permissions-context";
import { useLeads } from "@/lib/leads-context";
import { canAssignLeads, type Lead } from "@/lib/leads-data";
import { cn } from "@/lib/utils";

/** Whether the current user is allowed to (re)assign leads. */
export function useCanAssignLeads(): boolean {
  const { can } = usePermissions();
  return canAssignLeads(can);
}

/** Compact assignee display used in the list and detail. */
export function AssignBadge({ lead, size = 22 }: { lead: Lead; size?: number }) {
  if (!lead.assignedToName) {
    return <span className="text-[12px] text-muted-foreground">Unassigned</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar name={lead.assignedToName} size={size} />
      <span className="truncate text-[12px] font-medium text-zinc-700">{lead.assignedToName}</span>
    </span>
  );
}

/**
 * Searchable staff picker. Renders as a small trigger; opens a dropdown of
 * active staff. Selecting a person reassigns the lead (DB-backed + notifies).
 * `compact` renders just an icon-ish trigger for dense table rows.
 */
export function AssignMenu({ lead, compact }: { lead: Lead; compact?: boolean }) {
  const { team } = usePermissions();
  const { assignLead } = useLeads();
  const [query, setQuery] = useState("");

  const staff = useMemo(
    () => team.filter((m) => m.status === "active" && m.name).map((m) => ({ id: m.id, name: m.name })),
    [team],
  );
  const filtered = query.trim()
    ? staff.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
    : staff;

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
    <div onClick={(e) => e.stopPropagation()}>
      <Dropdown
        align="right"
        width="w-56"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card text-[12px] font-medium text-zinc-600 transition hover:border-[#4361EE]/40 hover:text-[#4361EE]",
              compact ? "px-1.5 py-1" : "px-2.5 py-1.5",
            )}
            title={lead.assignedToName ? `Assigned to ${lead.assignedToName}` : "Assign lead"}
          >
            {lead.assignedToName ? (
              <>
                <Avatar name={lead.assignedToName} size={18} />
                {!compact && <span className="max-w-[110px] truncate">{lead.assignedToName}</span>}
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5" />
                {!compact && <span>Assign</span>}
              </>
            )}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        )}
      >
        {(close) => (
          <>
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search staff…"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-56 overflow-y-auto p-1">
              {lead.assignedTo && (
                <button onClick={() => clear(close)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-rose-600 hover:bg-rose-50">
                  <UserX className="h-3.5 w-3.5" /> Unassign
                </button>
              )}
              {filtered.length === 0 && <p className="px-2.5 py-3 text-center text-[12px] text-muted-foreground">No staff found.</p>}
              {filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => pick(s.id, s.name, close)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition",
                    s.id === lead.assignedTo ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60",
                  )}
                >
                  <Avatar name={s.name} size={22} />
                  <span className="flex-1 truncate">{s.name}</span>
                  {s.id === lead.assignedTo && <Check className="h-3.5 w-3.5 text-[#4361EE]" />}
                </button>
              ))}
            </div>
          </>
        )}
      </Dropdown>
    </div>
  );
}
