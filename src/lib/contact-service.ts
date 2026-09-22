import type { Contact } from "@/lib/leads-data";

export interface ContactSeed {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  companyId?: string;
  designation?: string;
  department?: string;
  role?: string;
  source?: string;
  owner?: string;
  address?: string;
  city?: string;
  notes?: string;
}

export interface ContactMatch {
  contact: Contact;
  matchedOn: "Mobile Number" | "Email";
}

export function normalizeContactMobile(value?: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function normalizeContactEmail(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

export function findContactMatches(contacts: Contact[], seed: Pick<ContactSeed, "phone" | "email">): ContactMatch[] {
  const mobile = normalizeContactMobile(seed.phone);
  const email = normalizeContactEmail(seed.email);
  const matches: ContactMatch[] = [];
  for (const contact of contacts) {
    const contactMobile = normalizeContactMobile(contact.mobile || contact.phone);
    if (mobile && contactMobile && mobile === contactMobile) {
      matches.push({ contact, matchedOn: "Mobile Number" });
      continue;
    }
    const contactEmail = normalizeContactEmail(contact.email);
    if (email && contactEmail && email === contactEmail) {
      matches.push({ contact, matchedOn: "Email" });
    }
  }
  return matches;
}

function splitName(seed: ContactSeed): { firstName: string; lastName: string; fullName: string } {
  const supplied = (seed.fullName ?? "").trim();
  const parts = supplied.split(/\s+/).filter(Boolean);
  const firstName = (seed.firstName ?? parts[0] ?? "Prospect").trim();
  const lastName = (seed.lastName ?? parts.slice(1).join(" ")).trim();
  return { firstName, lastName, fullName: `${firstName} ${lastName}`.trim() };
}

export function createProspectContact(seed: ContactSeed): Contact {
  const now = new Date().toISOString();
  const name = splitName(seed);
  return {
    id: `CON-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    ...name,
    email: normalizeContactEmail(seed.email) || undefined,
    phone: seed.phone?.trim() || undefined,
    mobile: seed.phone?.trim() || undefined,
    companyId: seed.companyId,
    designation: seed.designation,
    department: seed.department,
    role: seed.role,
    source: seed.source,
    status: "active",
    owner: seed.owner,
    address: seed.address,
    city: seed.city,
    notes: seed.notes,
    createdAt: now,
    updatedAt: now,
  };
}

/** Resolve a prospect identity without creating a Customer Master record. */
export function resolveContact(contacts: Contact[], seed: ContactSeed): { contact: Contact; created: boolean } {
  const match = findContactMatches(contacts, seed)[0];
  if (match) return { contact: match.contact, created: false };
  return { contact: createProspectContact(seed), created: true };
}
