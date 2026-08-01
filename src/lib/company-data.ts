/* ─── Company Master ──────────────────────────────────────────────── */

export type CompanyStatus = "active" | "prospect" | "inactive";
export type CompanyType = "pvt_ltd" | "llp" | "proprietorship" | "partnership" | "public_ltd" | "ngo" | "government" | "other";
export type BusinessSize = "micro" | "small" | "medium" | "large" | "enterprise";

export type PhoneEntry = {
  id: number;
  type: "Mobile" | "Office" | "Reception" | "Support" | "WhatsApp";
  number: string;
  isPrimary: boolean;
};

export type EmailEntry = {
  id: number;
  type: "Business" | "Support" | "Sales" | "Accounts" | "General";
  address: string;
  isPrimary: boolean;
};

export type CommunicationPreferences = {
  email: boolean;
  phone: boolean;
  whatsapp: boolean;
};

export type CompanyAddress = {
  addressLine1: string;
  addressLine2: string;
  area: string;
  city: string;
  district: string;
  state: string;
  country: string;
  pinCode: string;
  landmark: string;
  googleMapsUrl: string;
  gpsLocation: string;
};

export type CompanySocialLinks = {
  facebook: string;
  instagram: string;
  linkedin: string;
  twitter: string;
  youtube: string;
  website: string;
};

export type CompanyBusinessDetails = {
  registrationNumber: string;
  gstin: string;
  pan: string;
  taxType: string;
  billingCycle: string;
  creditLimit: number;
  paymentTerms: string;
  preferredPaymentMode: string;
  currency: string;
  businessSince: string;
  annualTurnover: string;
  description: string;
};

export type Company = {
  id: string;
  name: string;
  companyType: CompanyType;
  industry: string;
  businessCategory: string;
  businessSize: BusinessSize;
  numberOfEmployees: string;
  annualRevenue: string;
  gstNumber: string;
  panNumber: string;
  website: string;
  owner: string;
  branch: string;
  assignedEmployee: string;
  status: CompanyStatus;

  phones: PhoneEntry[];
  emails: EmailEntry[];
  communicationPreferences: CommunicationPreferences;

  address: CompanyAddress;
  businessDetails: CompanyBusinessDetails;
  socialLinks: CompanySocialLinks;

  notes: string;

  // Relationship counts (computed/tracked)
  totalContacts: number;
  totalDeals: number;
  totalTickets: number;
  totalInvoices: number;
  lifetimeValue: number;

  // Audit fields
  workspace: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

/* ─── ID Generation ──────────────────────────────────────────────── */

let _companyCounter = 2000;

export function generateCompanyId(): string {
  _companyCounter += 1;
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  const seq = String(_companyCounter).padStart(4, "0");
  return `CMP-${ts}${seq}`;
}

/* ─── Factory: create a new company with defaults ────────────────── */

export function createCompany(
  data: Pick<Company, "name"> &
    Partial<Omit<Company, "id" | "totalContacts" | "totalDeals" | "totalTickets" | "totalInvoices" | "lifetimeValue" | "createdAt" | "updatedAt">>
): Company {
  const now = new Date().toISOString();
  return {
    id: generateCompanyId(),
    name: data.name,
    companyType: data.companyType || "pvt_ltd",
    industry: data.industry || "",
    businessCategory: data.businessCategory || "",
    businessSize: data.businessSize || "small",
    numberOfEmployees: data.numberOfEmployees || "",
    annualRevenue: data.annualRevenue || "",
    gstNumber: data.gstNumber || "",
    panNumber: data.panNumber || "",
    website: data.website || "",
    owner: data.owner || "",
    branch: data.branch || "",
    assignedEmployee: data.assignedEmployee || "",
    status: data.status || "active",

    phones: data.phones || [{ id: 1, type: "Office", number: "", isPrimary: true }],
    emails: data.emails || [{ id: 1, type: "Business", address: "", isPrimary: true }],
    communicationPreferences: data.communicationPreferences || { email: true, phone: true, whatsapp: false },

    address: data.address || {
      addressLine1: "", addressLine2: "", area: "", city: "",
      district: "", state: "", country: "India", pinCode: "",
      landmark: "", googleMapsUrl: "", gpsLocation: "",
    },

    businessDetails: data.businessDetails || {
      registrationNumber: "", gstin: "", pan: "", taxType: "",
      billingCycle: "", creditLimit: 0, paymentTerms: "",
      preferredPaymentMode: "", currency: "INR", businessSince: "",
      annualTurnover: "", description: "",
    },

    socialLinks: data.socialLinks || {
      facebook: "", instagram: "", linkedin: "",
      twitter: "", youtube: "", website: "",
    },

    notes: data.notes || "",

    totalContacts: 0,
    totalDeals: 0,
    totalTickets: 0,
    totalInvoices: 0,
    lifetimeValue: 0,

    workspace: data.workspace || "leads",
    createdBy: data.createdBy || "",
    updatedBy: data.updatedBy || "",
    createdAt: now,
    updatedAt: now,
  };
}

/* ─── Duplicate Detection ────────────────────────────────────────── */

export type CompanyDuplicateMatch = {
  company: Company;
  matchedOn: string;
  confidence: "high" | "medium";
};

export function findCompanyDuplicates(
  companies: Company[],
  data: { name?: string; gstNumber?: string; panNumber?: string }
): CompanyDuplicateMatch[] {
  const matches: CompanyDuplicateMatch[] = [];

  for (const c of companies) {
    // Primary: GST Number match (high confidence)
    if (data.gstNumber && c.gstNumber && data.gstNumber.toUpperCase() === c.gstNumber.toUpperCase()) {
      matches.push({ company: c, matchedOn: "GST Number", confidence: "high" });
      continue;
    }

    // Secondary: PAN Number match (high confidence)
    if (data.panNumber && c.panNumber && data.panNumber.toUpperCase() === c.panNumber.toUpperCase()) {
      matches.push({ company: c, matchedOn: "PAN Number", confidence: "high" });
      continue;
    }

    // Tertiary: Company Name match (medium confidence)
    if (data.name && c.name && data.name.toLowerCase().trim() === c.name.toLowerCase().trim()) {
      matches.push({ company: c, matchedOn: "Company Name", confidence: "medium" });
    }
  }

  return matches;
}

/* ─── Search ─────────────────────────────────────────────────────── */

export function searchCompanies(companies: Company[], query: string): Company[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return companies.filter((c) => {
    if (c.id.toLowerCase().includes(q)) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.industry.toLowerCase().includes(q)) return true;
    if (c.address.city.toLowerCase().includes(q)) return true;
    if (c.gstNumber.toLowerCase().includes(q)) return true;
    if (c.owner.toLowerCase().includes(q)) return true;
    return false;
  });
}

/* ─── Seed Data (empty — real companies live in Supabase) ────────── */

export const seedCompanies: Company[] = [];
