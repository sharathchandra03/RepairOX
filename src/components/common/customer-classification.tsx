"use client";

/**
 * Shared, subtle badges for the three INDEPENDENT customer-classification
 * dimensions. Kept in one place so Customer Master, tickets, invoices, walk-ins,
 * search and selectors stay visually consistent and never conflate the axes:
 *
 *   • Customer Type   — Personal / Business  ("WHAT KIND of customer?")
 *   • Customer Source — Walk-In / Sales / …  ("HOW did they come to us?")
 *   • Customer Groups — VIP / Corporate / …  ("HOW do we segment them?")
 *
 * These are three separate things: e.g. a customer can be [Business] [Walk-In]
 * and still be tagged [VIP]. Nothing here ever replaces the customer's type.
 */

import { cn } from "@/lib/utils";
import {
  CUSTOMER_SOURCE_BADGE,
  groupToneClasses,
  type Customer,
  type CustomerType,
  type CustomerSource,
  type CustomerGroup,
} from "@/lib/customer-data";

const PILL = "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset whitespace-nowrap";

/**
 * Customer LIFECYCLE — has this identity done any real business with us yet?
 *
 *   • New       — freshly captured (a CRM prospect/contact, or a customer with
 *                 zero tickets/invoices/repairs). They exist as an identity but
 *                 haven't started a service/commercial relationship.
 *   • Existing  — an established customer with at least one real transaction.
 *
 * This is a SEPARATE axis from Type / Source / Groups. Derived purely from the
 * transactional counters so it can never disagree with the data.
 */
export type CustomerLifecycle = "new" | "existing";

/** Whether a customer has any real transactional history yet. */
export function isNewCustomer(
  c: Pick<Customer, "totalTickets" | "totalInvoices" | "totalRepairs"> & { isContact?: boolean }
): boolean {
  // A virtual CRM-contact candidate is always "new" (never transacted).
  if ((c as { isContact?: boolean }).isContact) return true;
  return (
    (c.totalTickets ?? 0) === 0 &&
    (c.totalInvoices ?? 0) === 0 &&
    (c.totalRepairs ?? 0) === 0
  );
}

export function customerLifecycle(
  c: Pick<Customer, "totalTickets" | "totalInvoices" | "totalRepairs"> & { isContact?: boolean }
): CustomerLifecycle {
  return isNewCustomer(c) ? "new" : "existing";
}

/** New (amber) vs Existing (indigo) lifecycle pill. */
export function CustomerLifecycleBadge({
  lifecycle,
  className,
}: {
  lifecycle: CustomerLifecycle;
  className?: string;
}) {
  return (
    <span
      className={cn(
        PILL,
        lifecycle === "new"
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-[#EEF1FD] text-[#4361EE] ring-[#4361EE]/20",
        className
      )}
    >
      {lifecycle === "new" ? "New" : "Existing"}
    </span>
  );
}

/** Customer Type badge — Personal (sky) / Business (violet). */
export function CustomerTypeBadge({ type, className }: { type: CustomerType; className?: string }) {
  return (
    <span
      className={cn(
        PILL,
        type === "business"
          ? "bg-violet-50 text-violet-700 ring-violet-200"
          : "bg-sky-50 text-sky-700 ring-sky-200",
        className
      )}
    >
      {type === "business" ? "Business" : "Personal"}
    </span>
  );
}

/** Customer Source / origin badge — subtle emerald tint, distinct from Type. */
export function CustomerSourceBadge({ source, className }: { source?: CustomerSource; className?: string }) {
  if (!source) return null;
  return (
    <span className={cn(PILL, "bg-emerald-50 text-emerald-700 ring-emerald-200", className)}>
      {CUSTOMER_SOURCE_BADGE[source]}
    </span>
  );
}

/** A single group tag using the group's configured colour token. */
export function CustomerGroupBadge({ group, className }: { group: Pick<CustomerGroup, "name" | "color">; className?: string }) {
  return (
    <span className={cn(PILL, groupToneClasses(group.color), "normal-case", className)}>
      {group.name}
    </span>
  );
}

/**
 * Resolve a customer's group ids → group objects (active first, preserving the
 * configured display order). Archived groups still render for existing members.
 */
export function resolveGroups(groupIds: string[] | undefined, allGroups: CustomerGroup[]): CustomerGroup[] {
  if (!groupIds || groupIds.length === 0) return [];
  const byId = new Map(allGroups.map((g) => [g.id, g]));
  return groupIds
    .map((id) => byId.get(id))
    .filter((g): g is CustomerGroup => Boolean(g))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Compact classification row: [Type] [Source] [Group…]. Use `maxGroups` to cap
 * how many group tags render inline (the rest collapse into a "+N" chip) so
 * dense tables don't overcrowd.
 */
export function CustomerBadges({
  type,
  source,
  groups,
  lifecycle,
  maxGroups = 2,
  showSource = true,
  className,
}: {
  type: CustomerType;
  source?: CustomerSource;
  groups?: CustomerGroup[];
  /** When provided, renders a leading New/Existing lifecycle pill. */
  lifecycle?: CustomerLifecycle;
  maxGroups?: number;
  showSource?: boolean;
  className?: string;
}) {
  const shown = (groups ?? []).slice(0, maxGroups);
  const extra = (groups ?? []).length - shown.length;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {lifecycle && <CustomerLifecycleBadge lifecycle={lifecycle} />}
      <CustomerTypeBadge type={type} />
      {showSource && <CustomerSourceBadge source={source} />}
      {shown.map((g) => (
        <CustomerGroupBadge key={g.id} group={g} />
      ))}
      {extra > 0 && (
        <span className={cn(PILL, "bg-slate-50 text-slate-500 ring-slate-200")}>+{extra}</span>
      )}
    </span>
  );
}
