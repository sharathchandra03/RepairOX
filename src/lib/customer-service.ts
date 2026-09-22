/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Central Customer Service
   
   Single source of truth for customer creation, deduplication, and
   lifecycle management. All modules must use this service to ensure
   ONE canonical customer identity across Ticket, Walk-In, Invoice, Field,
   Warranty, and Leads.
   
   Key responsibilities:
   1. Find or create customers (deduplication via phone/email)
   2. Maintain customer source/origin provenance
   3. Automatic customer group assignment (High Value, Frequent, etc.)
   4. Loyalty ledger transactions and tier management
   5. Cross-module customer references
   ────────────────────────────────────────────────────────────────────────── */

import type { Customer, CustomerGroup, DuplicateMatch } from "@/lib/customer-data";
import { findDuplicates, createCustomer, searchCustomers, generateCustomerId } from "@/lib/customer-data";

/* ──────────────────────────────────────────────────────────────────────────
   Loyalty Ledger — immutable transaction record
   ────────────────────────────────────────────────────────────────────────── */

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export const LOYALTY_TIERS: LoyaltyTier[] = ["bronze", "silver", "gold", "platinum"];

export const LOYALTY_TIER_THRESHOLDS: Record<LoyaltyTier, number> = {
  bronze: 0,
  silver: 1000,
  gold: 5000,
  platinum: 10000,
};

export type LoyaltyTransactionType = "earn" | "redeem" | "adjustment" | "tier_change";

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  type: LoyaltyTransactionType;
  pointsChange: number; // positive for earn, negative for redeem
  pointsBalance: number; // cumulative after this transaction
  tier?: LoyaltyTier; // if tier_change
  sourceType?: "invoice" | "adjustment" | "admin"; // how points were earned
  sourceId?: string; // e.g. invoice ID for earning
  description: string;
  createdAt: string;
  createdBy?: string; // staff ID
}

export interface LoyaltyAccount {
  customerId: string;
  pointsBalance: number;
  tier: LoyaltyTier;
  transactions: LoyaltyTransaction[];
  enrolledAt: string;
  lastTransactionAt?: string;
}

/**
 * Calculate which tier a customer should be in based on lifetime value.
 * Business logic: the tier is determined by total points balance.
 */
export function tierForLifetimeValue(pointsBalance: number): LoyaltyTier {
  if (pointsBalance >= LOYALTY_TIER_THRESHOLDS.platinum) return "platinum";
  if (pointsBalance >= LOYALTY_TIER_THRESHOLDS.gold) return "gold";
  if (pointsBalance >= LOYALTY_TIER_THRESHOLDS.silver) return "silver";
  return "bronze";
}

/**
 * Award loyalty points from a finalized invoice.
 * Use: 1 point per ₹100 (or configured rate).
 * Do NOT award from Estimate/Proforma/Draft.
 */
export function pointsFromInvoiceAmount(amount: number, rate: number = 100): number {
  if (!amount || amount <= 0) return 0;
  return Math.floor(amount / rate);
}

/**
 * Create a loyalty ledger transaction. Returns the new balance.
 */
export function recordLoyaltyTransaction(
  account: LoyaltyAccount | null,
  transaction: Omit<LoyaltyTransaction, "id" | "pointsBalance" | "createdAt">
): LoyaltyTransaction {
  const currentBalance = account?.pointsBalance ?? 0;
  const newBalance = Math.max(0, currentBalance + transaction.pointsChange);
  const now = new Date().toISOString();

  const tx: LoyaltyTransaction = {
    ...transaction,
    id: `LTX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 9)}`,
    pointsBalance: newBalance,
    createdAt: now,
  };

  return tx;
}

/* ──────────────────────────────────────────────────────────────────────────
   Customer Grouping — automatic and manual classification
   ────────────────────────────────────────────────────────────────────────── */

export interface GroupingRuleContext {
  customer: Customer;
  lifetimeValue: number;
  totalTickets: number;
  totalVisits: number;
  daysSinceLastActivity: number;
  loyaltyTier?: LoyaltyTier;
}

/**
 * Automatic grouping rules. Returns group IDs to assign (not replace existing).
 * Rules are evaluated fresh every time to keep grouping up-to-date.
 */
export function evaluateAutomaticGroups(
  context: GroupingRuleContext,
  availableGroups: CustomerGroup[]
): string[] {
  const assigned: string[] = [];

  const groupByName = new Map(availableGroups.map((g) => [g.name.toLowerCase(), g]));

  // Rule: Lifetime value > ₹50,000 → "High Value"
  if (context.lifetimeValue > 50000) {
    const hvGroup = groupByName.get("high value");
    if (hvGroup) assigned.push(hvGroup.id);
  }

  // Rule: 5+ completed tickets → "Frequent Customer"
  if (context.totalTickets >= 5) {
    const fcGroup = groupByName.get("frequent customer");
    if (fcGroup) assigned.push(fcGroup.id);
  }

  // Rule: No activity for 180 days → "Inactive"
  if (context.daysSinceLastActivity > 180) {
    const inactGroup = groupByName.get("inactive");
    if (inactGroup) assigned.push(inactGroup.id);
  }

  // Rule: Platinum loyalty tier → "VIP"
  if (context.loyaltyTier === "platinum") {
    const vipGroup = groupByName.get("vip");
    if (vipGroup) assigned.push(vipGroup.id);
  }

  return assigned;
}

/* ──────────────────────────────────────────────────────────────────────────
   Customer Creation Workflow
   ────────────────────────────────────────────────────────────────────────── */

export interface FindOrCreateInput {
  firstName: string;
  lastName: string;
  mobile: string;
  email?: string;
  type?: "personal" | "business";
  source?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  /**
   * Bypass deduplication and always create a new customer record, even if
   * findDuplicates() would otherwise match an existing one. Used by the
   * explicit "Create Anyway" confirmation step after a duplicate warning
   * has already been shown to the user — never set this on the initial
   * lookup. Requires the caller to already hold create_customer permission;
   * this function does not check permissions itself.
   */
  forceCreate?: boolean;
}

export interface FindOrCreateResult {
  customer: Customer;
  created: boolean;
  duplicateMatches: DuplicateMatch[];
}

/**
 * Core customer creation workflow: find existing or create new.
 *
 * IMPORTANT: This function is the single entry point for customer identity.
 * All modules (Ticket, Walk-In, Invoice, Field, Leads) must call this
 * to maintain ONE canonical customer identity.
 *
 * Process:
 * 1. Search for existing customer by phone/email
 * 2. If found, return existing (duplicateMatches will be populated)
 * 3. If not found, create new with deduplication check
 * 4. Never silently create duplicates
 */
export function findOrCreateCustomer(
  input: FindOrCreateInput,
  existingCustomers: Customer[]
): FindOrCreateResult {
  // Step 1: Search for duplicates
  const duplicateMatches = findDuplicates(existingCustomers, {
    mobile: input.mobile,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    company: input.company,
  });

  // Step 2: If we found a match and the caller hasn't explicitly opted to
  // force-create, return the existing customer (don't create a duplicate).
  if (duplicateMatches.length > 0 && !input.forceCreate) {
    return {
      customer: duplicateMatches[0].customer,
      created: false,
      duplicateMatches,
    };
  }

  // Step 3: Create new customer
  const newCustomer = createCustomer({
    firstName: input.firstName,
    lastName: input.lastName,
    mobile: input.mobile,
    email: input.email,
    type: input.type,
    source: (input.source as any) ?? undefined,
    company: input.company,
    address: input.address,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
  });

  return {
    customer: newCustomer,
    created: true,
    duplicateMatches: [],
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Customer Search
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Search customers by name, phone, email, ID, or company.
 * Returns relevance-ranked results (best matches first).
 */
export function searchForCustomer(
  query: string,
  customers: Customer[]
): Customer[] {
  return searchCustomers(customers, query);
}

/* ──────────────────────────────────────────────────────────────────────────
   Customer Merge (Deduplication Cleanup)
   ────────────────────────────────────────────────────────────────────────── */

export interface MergeResult {
  success: boolean;
  error?: string;
  mergedCustomerId?: string;
}

/**
 * Validate a merge request BEFORE performing it.
 *
 * This is validation only — it does NOT touch the database and does NOT
 * perform the merge. The real implementation is `mergeCustomersAction` in
 * `store.tsx` (it needs access to `db`/`shouldUseDb`/live state for
 * tickets, invoices, walk-ins, loyalty and customer groups, which this
 * pure/no-React module doesn't have). Call this first to fail fast on
 * obviously invalid input, then call `mergeCustomersAction` to perform it.
 */
export function validateMergeRequest(
  primaryId: string,
  secondaryId: string
): MergeResult {
  if (!primaryId || !secondaryId) {
    return { success: false, error: "Both customer IDs are required" };
  }

  if (primaryId === secondaryId) {
    return { success: false, error: "Cannot merge a customer with itself" };
  }

  return { success: true, mergedCustomerId: primaryId };
}

/* ──────────────────────────────────────────────────────────────────────────
   Customer Lifecycle Events
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Record a customer activity/source when they interact with a module.
 * Use: when a Walk-In is created, Ticket is created, Invoice is created, etc.
 * This helps track the customer journey without duplicating the customer.
 */
export interface CustomerActivityRecord {
  customerId: string;
  activityType: "walk_in" | "ticket" | "invoice" | "field" | "warranty" | "lead_contact";
  recordId: string; // the walk-in ID, ticket ID, etc.
  recordDate: string;
  recordAmount?: number; // for invoices
}

/**
 * When a module creates a transaction for a customer, it should record
 * this activity. The store layer will consolidate these into customer
 * stats (totalTickets, totalInvoices, lastVisit, lifetimeValue).
 *
 * This is a placeholder for the actual activity log implementation.
 */
export function recordCustomerActivity(
  _activity: CustomerActivityRecord
): void {
  // TODO: Persist to customer_activities table or similar
  // This allows for:
  // - Customer timeline view (all activities in order)
  // - Stats recalculation (totalTickets, totalInvoices, lifetime value)
  // - Last activity timestamp
}

/* ──────────────────────────────────────────────────────────────────────────
   Customer Stats Recalculation
   ────────────────────────────────────────────────────────────────────────── */

export interface CustomerStatsUpdate {
  totalTickets: number;
  totalInvoices: number;
  totalRepairs: number;
  lifetimeValue: number;
  lastVisit: string;
}

/**
 * Recalculate customer stats from all their transactions.
 * Called after major events (invoice finalized, ticket completed, etc.).
 * This ensures stats stay accurate without manual intervention.
 */
export function recalculateCustomerStats(
  customerId: string,
  tickets: Array<{ id: string; status: string }>,
  invoices: Array<{ id: string; total: number; status: string }>,
  walkIns: Array<{ id: string; date: string }>,
  repairs: Array<{ id: string; date: string }>
): CustomerStatsUpdate {
  // Real TicketStatus terminal values are "repaired_collected" and
  // "return_collected" — there is no "completed"/"closed" status.
  const completedTickets = tickets.filter(
    (t) => t.status === "repaired_collected" || t.status === "return_collected"
  ).length;

  // "Finalized" = fully paid. InvoiceStatus is
  // "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled" — there
  // is no separate "finalized"/"completed" status in this codebase. Loyalty
  // points and lifetime value must only count invoices that have actually
  // been paid in full; partial/overdue/draft/cancelled never count.
  const finalizedInvoices = invoices.filter((i) => i.status === "paid");
  const totalInvoiceAmount = finalizedInvoices.reduce((sum, i) => sum + (i.total || 0), 0);

  const allDates = [
    ...tickets.map((t) => t.id),
    ...walkIns.map((w) => w.date),
    ...repairs.map((r) => r.date),
  ];
  const lastActivityDate =
    allDates.length > 0
      ? new Date(Math.max(...allDates.map((d) => (typeof d === "string" ? new Date(d).getTime() : 0))))
          .toISOString()
      : new Date().toISOString();

  return {
    totalTickets: completedTickets,
    totalInvoices: finalizedInvoices.length,
    totalRepairs: repairs.length,
    lifetimeValue: totalInvoiceAmount,
    lastVisit: lastActivityDate,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Helpers: Customer Identity & Display
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Format customer name for display.
 */
export function formatCustomerName(customer: Customer): string {
  if (customer.fullName) return customer.fullName;
  return `${customer.firstName} ${customer.lastName}`.trim();
}

/**
 * Get a short identifier for a customer (for tables, badges, etc.).
 */
export function customerShortName(customer: Customer): string {
  const name = formatCustomerName(customer);
  if (name.length <= 20) return name;
  const parts = name.split(" ");
  if (parts.length >= 2) return `${parts[0]} ${parts[1]?.[0]}.`;
  return name.substring(0, 20) + "…";
}

/**
 * Format customer phone for display (e.g., "+91 XXXXX XXXXX").
 */
export function formatPhone(phone: string): string {
  if (!phone) return "";
  const clean = phone.replace(/\D/g, "");
  if (clean.length >= 10) {
    const last10 = clean.slice(-10);
    return `+91 ${last10.slice(0, 5)} ${last10.slice(5)}`;
  }
  return phone;
}
