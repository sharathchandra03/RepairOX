/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Unified Customer Candidate search

   The operational creation flows (Ticket, Invoice, Walk-In) let the user
   FETCH an identity to transact against. Two identity stores exist:

     • Customer Master  (useStore().customers)  — real customers, keep stats.
     • CRM Contacts      (useLeads().contacts)   — prospects captured via the
                                                   "Add Contact" quick-capture.

   A prospect who was captured but never transacted only lives in `contacts`,
   so it never used to appear when picking a customer for a ticket/invoice/
   walk-in. This helper merges BOTH stores into one searchable candidate list
   so a captured contact is fetchable everywhere — WITHOUT creating a second
   Customer Master record up front. A contact-candidate is a lightweight,
   virtual `Customer`-shaped row flagged `isContact`. When the user actually
   saves the transaction, the existing `findOrCreateCustomer` promotion path
   turns it into a real Customer (single canonical identity — no duplicate
   customer list).

   Lifecycle classification (New vs Existing) is derived from the transactional
   counters, so a contact-candidate (and any customer with zero
   tickets/invoices/repairs) reads as "New", and an established customer reads
   as "Existing".
   ────────────────────────────────────────────────────────────────────────── */

import type { Customer } from "@/lib/customer-data";
import { searchCustomers } from "@/lib/customer-data";
import type { Contact } from "@/lib/leads-data";
import { normalizeContactMobile, normalizeContactEmail } from "@/lib/contact-service";

/**
 * A pickable identity. Either a real Customer Master record, or a virtual
 * candidate derived from a CRM Contact that has not yet been promoted.
 *
 * `isContact` marks the virtual ones; `sourceContactId` keeps the originating
 * Contact id so callers can reference it. A candidate always carries the full
 * `Customer` shape (counters zeroed for contacts) so every picker can treat
 * the merged list uniformly.
 */
export type CustomerCandidate = Customer & {
  /** True when this row is a not-yet-promoted CRM contact, not a real customer. */
  isContact?: boolean;
  /** The originating Contact id when `isContact` is true. */
  sourceContactId?: string;
};

/** Build a virtual Customer-shaped candidate from a CRM Contact. */
export function contactToCandidate(contact: Contact): CustomerCandidate {
  const now = contact.createdAt || new Date().toISOString();
  const mobile = contact.mobile || contact.phone || "";
  return {
    id: `contact:${contact.id}`,
    isContact: true,
    sourceContactId: contact.id,
    type: "personal",
    source: undefined,
    captureSource: "manual",
    groupIds: [],
    companyId: contact.companyId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    fullName: contact.fullName || `${contact.firstName} ${contact.lastName}`.trim(),
    mobile,
    altMobile: "",
    email: contact.email || "",
    company: "",
    gstNumber: "",
    address: contact.address || "",
    city: contact.city || "",
    state: "",
    postalCode: "",
    notes: contact.notes || "",
    createdAt: now,
    updatedAt: contact.updatedAt || now,
    lastVisit: now,
    totalTickets: 0,
    totalInvoices: 0,
    totalRepairs: 0,
    lifetimeValue: 0,
    status: "active",
  };
}

/**
 * Merge Customer Master customers with CRM contacts into ONE candidate list.
 *
 * Contacts already promoted to a Customer are dropped:
 *   • linked (`contact.customerId` matches a customer), OR
 *   • the same phone/email as an existing customer.
 * This guarantees a person shows up exactly once (as the real Customer when
 * one exists, otherwise as a New contact-candidate).
 */
export function buildCustomerCandidates(
  customers: Customer[],
  contacts: Contact[]
): CustomerCandidate[] {
  const customerPhones = new Set<string>();
  const customerEmails = new Set<string>();
  const customerIds = new Set<string>();
  for (const c of customers) {
    customerIds.add(c.id);
    const m = normalizeContactMobile(c.mobile);
    if (m) customerPhones.add(m);
    const am = normalizeContactMobile(c.altMobile);
    if (am) customerPhones.add(am);
    const e = normalizeContactEmail(c.email);
    if (e) customerEmails.add(e);
  }

  const candidates: CustomerCandidate[] = customers.map((c) => c as CustomerCandidate);

  for (const contact of contacts) {
    // Already promoted / linked to a real customer → skip (the customer wins).
    if (contact.customerId && customerIds.has(contact.customerId)) continue;
    const m = normalizeContactMobile(contact.mobile || contact.phone);
    if (m && customerPhones.has(m)) continue;
    const e = normalizeContactEmail(contact.email);
    if (e && customerEmails.has(e)) continue;
    // Skip empty/unusable contacts (no name AND no phone).
    const hasName = (contact.fullName || contact.firstName || "").trim().length > 0;
    if (!hasName && !m) continue;
    candidates.push(contactToCandidate(contact));
  }

  return candidates;
}

/**
 * Search the unified candidate list (customers + un-promoted contacts).
 * Reuses the canonical `searchCustomers` ranking; contact-candidates carry the
 * full Customer shape so they rank identically.
 */
export function searchCustomerCandidates(
  customers: Customer[],
  contacts: Contact[],
  query: string
): CustomerCandidate[] {
  const merged = buildCustomerCandidates(customers, contacts);
  // searchCustomers is generic over the Customer shape; candidates satisfy it.
  return searchCustomers(merged, query) as CustomerCandidate[];
}

/**
 * The CRM contacts that are still genuine PROSPECTS — i.e. NOT yet promoted to
 * a Customer Master record. A contact is considered promoted (and excluded)
 * when it is linked (`customerId`) OR its phone/email already matches an
 * existing customer. This second check reconciles historical contacts whose
 * `customerId` was never back-filled, so the same person never shows in both
 * the Customers and CRM Contacts tabs.
 */
export function unpromotedContacts(
  contacts: Contact[],
  customers: Customer[]
): Contact[] {
  const customerIds = new Set(customers.map((c) => c.id));
  const customerPhones = new Set<string>();
  const customerEmails = new Set<string>();
  for (const c of customers) {
    const m = normalizeContactMobile(c.mobile);
    if (m) customerPhones.add(m);
    const am = normalizeContactMobile(c.altMobile);
    if (am) customerPhones.add(am);
    const e = normalizeContactEmail(c.email);
    if (e) customerEmails.add(e);
  }
  return contacts.filter((ct) => {
    if (ct.customerId && customerIds.has(ct.customerId)) return false;
    const m = normalizeContactMobile(ct.mobile || ct.phone);
    if (m && customerPhones.has(m)) return false;
    const e = normalizeContactEmail(ct.email);
    if (e && customerEmails.has(e)) return false;
    return true;
  });
}

/**
 * CRM-visible contacts — the list for the CRM Contacts surface.
 *
 * RepairOX rule: a person who originated from a LEAD stays in CRM Contacts for
 * the full relationship record, EVEN AFTER they become a Customer (dual
 * presence — they appear in both Customers and CRM). This is deliberate so the
 * sales team keeps the complete contact/opportunity trail. Only contacts that
 * did NOT come from a lead collapse into the Customer Master once promoted
 * (so a plain Add-Customer person isn't double-listed).
 *
 * A contact is lead-origin when a Lead references it (by `contactId`, or by the
 * shared `customerId` once promoted). Each returned row carries `promoted`
 * (linked/duplicated into the Customer Master) so the UI can badge it.
 */
export type CrmContact = Contact & {
  /** True when this contact is also a Customer Master record (promoted). */
  promoted?: boolean;
  /** True when a Lead references this contact (origin = Sales/Lead). */
  fromLead?: boolean;
};

export function crmVisibleContacts(
  contacts: Contact[],
  customers: Customer[],
  leads: LeadLike[],
): CrmContact[] {
  const customerIds = new Set(customers.map((c) => c.id));
  const customerPhones = new Set<string>();
  const customerEmails = new Set<string>();
  for (const c of customers) {
    const m = normalizeContactMobile(c.mobile);
    if (m) customerPhones.add(m);
    const am = normalizeContactMobile(c.altMobile);
    if (am) customerPhones.add(am);
    const e = normalizeContactEmail(c.email);
    if (e) customerEmails.add(e);
  }
  // Index lead-origin by contact id, customer id, and normalized phone/email so
  // a lead-origin person is recognised however the lead references them.
  const leadContactIds = new Set<string>();
  const leadCustomerIds = new Set<string>();
  const leadPhones = new Set<string>();
  const leadEmails = new Set<string>();
  for (const l of leads) {
    if (l.contactId) leadContactIds.add(l.contactId);
    if (l.customerId) leadCustomerIds.add(l.customerId);
    const lp = normalizeContactMobile(l.number);
    if (lp) leadPhones.add(lp);
    const le = normalizeContactEmail(l.email);
    if (le) leadEmails.add(le);
  }

  const out: CrmContact[] = [];
  for (const ct of contacts) {
    const m = normalizeContactMobile(ct.mobile || ct.phone);
    const e = normalizeContactEmail(ct.email);
    const promoted =
      (!!ct.customerId && customerIds.has(ct.customerId)) ||
      (!!m && customerPhones.has(m)) ||
      (!!e && customerEmails.has(e));
    const fromLead =
      leadContactIds.has(ct.id) ||
      (!!ct.customerId && leadCustomerIds.has(ct.customerId)) ||
      (!!m && leadPhones.has(m)) ||
      (!!e && leadEmails.has(e));
    // Keep it if it's still an unpromoted prospect, OR it originated from a
    // lead (dual presence). Drop only NON-lead contacts that have collapsed
    // into the Customer Master.
    if (!promoted || fromLead) out.push({ ...ct, promoted, fromLead });
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────────────
   Promotion origin — the "did this person come from Sales/a Lead?" resolver
   ────────────────────────────────────────────────────────────────────────── */

/** Minimal lead shape this module needs (avoids importing the full Lead type). */
type LeadLike = {
  contactId?: string;
  customerId?: string;
  number?: string;
  email?: string;
};

export interface PromotionOrigin {
  /** True when the person being promoted originated from a Lead (Sales). */
  fromLead: boolean;
  /** The matching CRM contact id, if any — set so the caller can link it
   *  (`updateContact(contactId, { customerId })`) and stop the duplicate. */
  contactId?: string;
}

/**
 * Resolve where a person being promoted to a Customer came from, using the
 * CRM contacts + leads already loaded in context.
 *
 * Two-logic rule (RepairOX): a customer is "Sales" ONLY when it originated
 * from a LEAD; created individually (Add Customer / Ticket / Invoice /
 * Walk-In) is "Manual". We detect lead-origin by finding the matching CRM
 * contact (by phone/email) and checking whether any Lead references that
 * contact (or the same phone/email). The returned `contactId` lets the caller
 * link the contact to the new customer so it stops showing as an unpromoted
 * prospect.
 */
export function resolvePromotionOrigin(
  input: { mobile?: string; email?: string },
  contacts: Contact[],
  leads: LeadLike[]
): PromotionOrigin {
  const phone = normalizeContactMobile(input.mobile);
  const email = normalizeContactEmail(input.email);

  const contact = contacts.find((ct) => {
    const cp = normalizeContactMobile(ct.mobile || ct.phone);
    const ce = normalizeContactEmail(ct.email);
    return (phone && cp && phone === cp) || (email && ce && email === ce);
  });

  // Is this person referenced by a Lead? (by the matched contact id, or by the
  // same phone/email carried on the lead itself)
  const fromLead = leads.some((l) => {
    if (contact && l.contactId && l.contactId === contact.id) return true;
    const lp = normalizeContactMobile(l.number);
    const le = normalizeContactEmail(l.email);
    return (phone && lp && phone === lp) || (email && le && email === le);
  });

  return { fromLead, contactId: contact?.id };
}
