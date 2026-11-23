/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead reassignment access (pure rules, shared by UI + tests).
   ONE permission (`leads_reassign_access`, Roles & Permissions → "Lead
   Reassignment") governs EVERY way of handing work to another agent:
     • changing the owner of a lead that already has one;
     • giving a follow-up to an agent other than yourself.
   First-time assignment of an unowned lead (and creating a lead for yourself)
   is NOT reassignment and is unaffected. Managers / owners hold the key by
   default; Sales Agents do not — they still SEE the controls, locked.
   The database mirrors these rules (migration 0122) — this file is the client
   mirror so the UI can show the lock instead of failing on save.
   ────────────────────────────────────────────────────────────────────────── */
export const REASSIGN_LOCK_HINT =
  "You don't have access to reassign leads or hand follow-ups to other agents. Ask a manager or the owner.";

/** May the user change the owner of a lead that currently has `currentOwnerId`? */
export function mayChangeOwner(hasAccess: boolean, currentOwnerId?: string | null): boolean {
  // An unowned lead can always be given its FIRST owner (that is assignment, not reassignment).
  if (!currentOwnerId) return true;
  return hasAccess;
}

/**
 * May the user hand a follow-up to `agentId`? Without the access key a follow-up
 * may only stay with people ALREADY responsible for the lead — yourself, the
 * lead's owner, its current follow-up agent, or whoever held a previous
 * follow-up — never a new person.
 */
export function mayGiveFollowUpTo(args: {
  hasAccess: boolean;
  meId: string;
  agentId: string | null | undefined;
  ownerId?: string | null;
  leadFollowUpAgentId?: string | null;
  priorFollowUpUserIds?: string[];
}): boolean {
  const { hasAccess, meId, agentId } = args;
  if (hasAccess || !agentId) return true;
  if (agentId === meId) return true;
  if (agentId === args.ownerId || agentId === args.leadFollowUpAgentId) return true;
  return (args.priorFollowUpUserIds ?? []).includes(agentId);
}
