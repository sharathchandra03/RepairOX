/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Field / fulfilment linking helpers (pure, no React).

   Shared logic used by the routing dialog, the Field module and the ticket
   conversion so that ONE customer, ONE lead and ONE device catalog are reused
   across Lead → Walk-In / Field Job → Ticket. Keeps master-data resolution in
   one place instead of duplicating it per call-site.
   ────────────────────────────────────────────────────────────────────────── */

import type { Customer } from "@/lib/customer-data";
import { createCustomer, findDuplicates } from "@/lib/customer-data";
import type { TeamMember } from "@/lib/mock-data";

/** Split a free-text full name into first / last parts. */
export function splitName(full: string): { first: string; last: string } {
  const parts = (full || "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.slice(1).join(" ") || "" };
}

/** A minimal contact shape gathered from a Lead. */
export interface ContactSeed {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  source?: string;
  existingCustomerId?: string;
}

export interface ResolvedCustomer {
  customerId: string;
  /** A newly-created customer that the caller must persist via addCustomer(),
   *  or null when an existing Customer Master record was matched. */
  created: Customer | null;
}

/**
 * Resolve a Customer Master record for a contact WITHOUT creating duplicates.
 * Order: explicit id → existing duplicate match (mobile/email/name) → create.
 * The caller persists `created` when non-null. This is the single choke point
 * that guarantees "one customer" across Lead / Walk-In / Field Job / Ticket.
 */
export function resolveCustomer(
  customers: Customer[],
  seed: ContactSeed,
): ResolvedCustomer {
  if (seed.existingCustomerId) {
    const found = customers.find((c) => c.id === seed.existingCustomerId);
    if (found) return { customerId: found.id, created: null };
  }
  const dupes = findDuplicates(customers, {
    mobile: seed.phone,
    email: seed.email,
    firstName: splitName(seed.name).first,
    lastName: splitName(seed.name).last,
  });
  if (dupes.length > 0) return { customerId: dupes[0].customer.id, created: null };

  // No match — create a fresh Customer Master record.
  if (!seed.name && !seed.phone) return { customerId: "", created: null };
  const { first, last } = splitName(seed.name);
  const created = createCustomer({
    firstName: first || seed.name || "Customer",
    lastName: last,
    mobile: seed.phone || "",
    email: seed.email || "",
    source: (seed.source as any) || "sales",
    address: seed.address || "",
  });
  return { customerId: created.id, created };
}

/** Active staff members holding one of the given role ids, sorted by name. */
export function staffByRole(team: TeamMember[], roleIds: string[]): TeamMember[] {
  const set = new Set(roleIds);
  return team
    .filter((m) => set.has(m.roleId) && m.status === "active")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Count of a ninja's currently-active field jobs (for the picker subtitle). */
export function activeJobCountFor(
  ninjaId: string,
  jobs: { ninjaId: string; dropNinjaId: string; status: string }[],
): number {
  return jobs.filter(
    (j) =>
      (j.ninjaId === ninjaId || j.dropNinjaId === ninjaId) &&
      j.status !== "completed" &&
      j.status !== "cancelled",
  ).length;
}
