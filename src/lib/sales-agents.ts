/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Sales Agent identity helpers (Lead Management Phase 1).

   A SALES AGENT is a real user (staff.id) whose ROLE holds the exact
   permission key `leads_sales_agent`. Identity is always the user id — two
   users on the Sales Agent role are two different agents. The role governs
   PERMISSION; the user id governs OWNERSHIP; store scope governs WHERE.

   Source of truth (DB mode): the store-scoped RPC `lead_sales_agents()`
   (migration 0049), which also resolves each agent's authorized stores
   (home store + user_stores / multi-store). The same eligibility predicate
   (`lead_agent_eligible`) is enforced by the leads triggers, so the pickers
   and the database always agree. In local/demo mode the list is derived from
   the in-memory team + role grants.
   ────────────────────────────────────────────────────────────────────────── */

import type { GrantMap } from "@/lib/permissions-context";
import type { TeamMember } from "@/lib/mock-data";

/** The permission key that makes a role's users eligible lead owners. */
export const SALES_AGENT_KEY = "leads_sales_agent" as const;

export interface SalesAgent {
  /** staff.id — THE identity stored on the lead (assigned_user_id / follow_up_agent_id). */
  id: string;
  /** Display name (presentation only — never stored as identity). */
  name: string;
  avatarUrl?: string;
  roleId: string;
  roleLabel: string;
  homeBranchId: string | null;
  /** Stores this agent may work (intersected with the caller's own stores). */
  storeIds: string[];
  /** Local/demo mode: no store model → eligible for every store. */
  anyStore?: boolean;
}

/** Exact-key role check. `full_access` / `*` ("all") do NOT make a role a
 *  Sales Agent — an owner is not a Sales Agent merely because they can do
 *  everything. Mirrors the DB's lead_agent_eligible(). */
export function roleIsSalesAgent(grants: GrantMap, roleId: string): boolean {
  const g = grants[roleId];
  if (!g || g === "all") return false;
  return (g as string[]).includes(SALES_AGENT_KEY);
}

/** Local/demo mode directory: active team members on a Sales Agent role. */
export function computeLocalSalesAgents(
  team: TeamMember[],
  grants: GrantMap,
  roleLabel: (roleId: string) => string,
): SalesAgent[] {
  return team
    .filter((m) => m.status === "active" && m.name && roleIsSalesAgent(grants, m.roleId))
    .map((m) => ({
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl,
      roleId: m.roleId,
      roleLabel: roleLabel(m.roleId),
      homeBranchId: m.branchId ?? null,
      storeIds: m.branchId ? [m.branchId] : [],
      anyStore: true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Map a lead_sales_agents() RPC row. */
export function rowToSalesAgent(r: any): SalesAgent {
  return {
    id: r.staff_id,
    name: r.name ?? "",
    avatarUrl: r.avatar_url ?? undefined,
    roleId: r.role_id ?? "",
    roleLabel: r.role_label ?? "",
    homeBranchId: r.home_branch_id ?? null,
    storeIds: Array.isArray(r.store_ids) ? r.store_ids : [],
  };
}

/** Agents eligible for a lead in `storeId` ("" / null = org-wide lead → all). */
export function agentsForStore(agents: SalesAgent[], storeId?: string | null): SalesAgent[] {
  if (!storeId) return agents;
  return agents.filter((a) => a.anyStore || a.storeIds.includes(storeId));
}

/** Is `userId` an eligible Sales Agent for a lead in `storeId`? */
export function isAgentEligible(agents: SalesAgent[], userId: string, storeId?: string | null): boolean {
  if (!userId) return false;
  return agentsForStore(agents, storeId).some((a) => a.id === userId);
}

/** Turn a DB ownership-guard error (migration 0049) into a user-facing message.
 *  Returns null when the error isn't one of ours. */
export function friendlyLeadOwnershipError(message?: string | null): string | null {
  const m = message ?? "";
  if (/lead_owner_not_eligible/.test(m)) return "The lead owner must be an active Sales Agent who can work this store.";
  if (/lead_followup_agent_not_eligible/.test(m)) return "The follow-up agent must be an active Sales Agent who can work this store.";
  if (/lead_assign_forbidden/.test(m)) return "You can only create leads owned by yourself. Ask a manager to assign it to another agent.";
  if (/lead_reassign_forbidden/.test(m)) return "You don't have permission to change the owner of this lead.";
  if (/lead_delete_forbidden/.test(m)) return "You don't have permission to delete leads.";
  if (/lead_followup_closed/.test(m)) return "A completed or cancelled follow-up can't be reassigned.";
  if (/row-level security/i.test(m)) return "You don't have access to this lead.";
  return null;
}
