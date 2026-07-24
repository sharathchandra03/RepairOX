/* ─── Customer Master ─────────────────────────────────────────────── */

export type CustomerType = "personal" | "business";
export type CustomerStatus = "active" | "inactive";

export type Customer = {
  id: string;
  type: CustomerType;
  firstName: string;
  lastName: string;
  fullName: string; // computed: firstName + lastName
  mobile: string;
  email: string;
  company: string;
  gstNumber: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  lastVisit: string;
  totalTickets: number;
  totalInvoices: number;
  totalRepairs: number;
  lifetimeValue: number;
  status: CustomerStatus;
};

/* ─── ID Generation ──────────────────────────────────────────────── */

let _counter = 1000;

export function generateCustomerId(): string {
  _counter += 1;
  const ts = Date.now().toString(36).slice(-4).toUpperCase();
  const seq = String(_counter).padStart(4, "0");
  return `CUS-${ts}${seq}`;
}

/* ─── Factory: create a new customer with defaults ───────────────── */

export function createCustomer(
  data: Pick<Customer, "firstName" | "lastName" | "mobile"> &
    Partial<Omit<Customer, "id" | "fullName" | "createdAt" | "updatedAt" | "lastVisit" | "totalTickets" | "totalInvoices" | "totalRepairs" | "lifetimeValue" | "status">>
): Customer {
  const now = new Date().toISOString();
  return {
    id: generateCustomerId(),
    type: data.type || "personal",
    firstName: data.firstName,
    lastName: data.lastName,
    fullName: `${data.firstName} ${data.lastName}`.trim(),
    mobile: data.mobile,
    email: data.email || "",
    company: data.company || "",
    gstNumber: data.gstNumber || "",
    address: data.address || "",
    city: data.city || "",
    state: data.state || "",
    postalCode: data.postalCode || "",
    notes: data.notes || "",
    createdAt: now,
    updatedAt: now,
    lastVisit: now,
    totalTickets: 0,
    totalInvoices: 0,
    totalRepairs: 0,
    lifetimeValue: 0,
    status: "active",
  };
}

/* ─── Duplicate Detection ────────────────────────────────────────── */

export type DuplicateMatch = {
  customer: Customer;
  matchedOn: string; // e.g. "Mobile Number", "Email", "Name + Company"
  confidence: "high" | "medium";
};

export function findDuplicates(
  customers: Customer[],
  data: { mobile: string; email?: string; firstName?: string; lastName?: string; company?: string }
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];
  const mobile = data.mobile.replace(/[\s\-\(\)]/g, "");

  for (const c of customers) {
    const cMobile = c.mobile.replace(/[\s\-\(\)]/g, "");

    // Primary: Mobile number match (high confidence)
    if (mobile && cMobile && mobile === cMobile) {
      matches.push({ customer: c, matchedOn: "Mobile Number", confidence: "high" });
      continue;
    }

    // Secondary: Email match (high confidence)
    if (data.email && c.email && data.email.toLowerCase() === c.email.toLowerCase()) {
      matches.push({ customer: c, matchedOn: "Email", confidence: "high" });
      continue;
    }

    // Tertiary: Name + Company match (medium confidence)
    if (data.firstName && data.lastName && c.firstName && c.lastName) {
      const nameMatch =
        data.firstName.toLowerCase() === c.firstName.toLowerCase() &&
        data.lastName.toLowerCase() === c.lastName.toLowerCase();
      if (nameMatch && data.company && c.company && data.company.toLowerCase() === c.company.toLowerCase()) {
        matches.push({ customer: c, matchedOn: "Name + Company", confidence: "medium" });
      }
    }
  }

  return matches;
}

/* ─── Search ─────────────────────────────────────────────────────── */

export function searchCustomers(customers: Customer[], query: string): Customer[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Normalize mobile for comparison (strip spaces, dashes, parens)
  const qMobile = q.replace(/[\s\-\(\)\+]/g, "");

  return customers.filter((c) => {
    // By Customer ID
    if (c.id.toLowerCase().includes(q)) return true;
    // By full name
    if (c.fullName.toLowerCase().includes(q)) return true;
    // By mobile (normalized)
    const cMobile = c.mobile.replace(/[\s\-\(\)\+]/g, "");
    if (qMobile.length >= 3 && cMobile.includes(qMobile)) return true;
    // By email
    if (c.email && c.email.toLowerCase().includes(q)) return true;
    // By company
    if (c.company && c.company.toLowerCase().includes(q)) return true;
    return false;
  });
}

/* ─── Seed Data ──────────────────────────────────────────────────── */

export const seedCustomers: Customer[] = [
  {
    id: "CUS-A001",
    type: "business",
    firstName: "Rahul",
    lastName: "Kapoor",
    fullName: "Rahul Kapoor",
    mobile: "+91 98456 12345",
    email: "rahul@kapoorelectronics.in",
    company: "Kapoor Electronics",
    gstNumber: "29AABCK1234F1ZP",
    address: "12, MG Road, Indiranagar",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560038",
    notes: "VIP client. Bulk repairs for retail shop.",
    createdAt: "2025-03-12T08:30:00.000Z",
    updatedAt: "2026-07-20T14:00:00.000Z",
    lastVisit: "2026-07-20T14:00:00.000Z",
    totalTickets: 14,
    totalInvoices: 9,
    totalRepairs: 14,
    lifetimeValue: 187500,
    status: "active",
  },
  {
    id: "CUS-A002",
    type: "personal",
    firstName: "Manoj",
    lastName: "S.",
    fullName: "Manoj S.",
    mobile: "+91 90876 54321",
    email: "manoj.s@gmail.com",
    company: "",
    gstNumber: "",
    address: "45, 2nd Cross, Jayanagar",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560041",
    notes: "",
    createdAt: "2025-08-22T10:15:00.000Z",
    updatedAt: "2026-07-18T09:30:00.000Z",
    lastVisit: "2026-07-18T09:30:00.000Z",
    totalTickets: 3,
    totalInvoices: 2,
    totalRepairs: 3,
    lifetimeValue: 24500,
    status: "active",
  },
  {
    id: "CUS-A003",
    type: "personal",
    firstName: "Ajay",
    lastName: "Verma",
    fullName: "Ajay Verma",
    mobile: "+91 87654 32100",
    email: "ajay.verma@outlook.com",
    company: "Verma & Sons",
    gstNumber: "29AABCV5678G1ZR",
    address: "78, Residency Road",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560025",
    notes: "Regular customer. MacBook specialist referrals.",
    createdAt: "2025-05-10T12:00:00.000Z",
    updatedAt: "2026-07-19T16:45:00.000Z",
    lastVisit: "2026-07-19T16:45:00.000Z",
    totalTickets: 6,
    totalInvoices: 5,
    totalRepairs: 6,
    lifetimeValue: 78000,
    status: "active",
  },
  {
    id: "CUS-A004",
    type: "personal",
    firstName: "Radha",
    lastName: "Iyer",
    fullName: "Radha Iyer",
    mobile: "+91 76543 21098",
    email: "radha.iyer@yahoo.com",
    company: "",
    gstNumber: "",
    address: "22, HSR Layout, Sector 2",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560102",
    notes: "",
    createdAt: "2026-01-08T09:00:00.000Z",
    updatedAt: "2026-07-21T11:20:00.000Z",
    lastVisit: "2026-07-21T11:20:00.000Z",
    totalTickets: 2,
    totalInvoices: 2,
    totalRepairs: 2,
    lifetimeValue: 12998,
    status: "active",
  },
  {
    id: "CUS-A005",
    type: "business",
    firstName: "Ravindu",
    lastName: "Toyota",
    fullName: "Ravindu Toyota",
    mobile: "+91 99000 56190",
    email: "ravindu@ifixindia.com",
    company: "iFix India - Koramangala",
    gstNumber: "29AABCI9012H1ZT",
    address: "101, 5th Block, Koramangala",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560095",
    notes: "B2B client. Bulk iPad repairs for retail chain.",
    createdAt: "2025-06-15T08:00:00.000Z",
    updatedAt: "2026-07-20T10:00:00.000Z",
    lastVisit: "2026-07-20T10:00:00.000Z",
    totalTickets: 22,
    totalInvoices: 15,
    totalRepairs: 22,
    lifetimeValue: 440000,
    status: "active",
  },
  {
    id: "CUS-A006",
    type: "business",
    firstName: "Vikas",
    lastName: "Nair",
    fullName: "Vikas Nair",
    mobile: "+91 65432 10987",
    email: "vikas@nairtech.in",
    company: "NairTech Solutions",
    gstNumber: "29AABCN3456J1ZQ",
    address: "55, Electronic City Phase 1",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560100",
    notes: "IT firm. Corporate device maintenance contract.",
    createdAt: "2025-09-20T14:30:00.000Z",
    updatedAt: "2026-07-17T08:45:00.000Z",
    lastVisit: "2026-07-17T08:45:00.000Z",
    totalTickets: 8,
    totalInvoices: 6,
    totalRepairs: 8,
    lifetimeValue: 96000,
    status: "active",
  },
  {
    id: "CUS-A007",
    type: "personal",
    firstName: "Sneha",
    lastName: "P.",
    fullName: "Sneha P.",
    mobile: "+91 54321 09876",
    email: "sneha.p@gmail.com",
    company: "",
    gstNumber: "",
    address: "33, Whitefield Main Road",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560066",
    notes: "",
    createdAt: "2026-02-14T11:00:00.000Z",
    updatedAt: "2026-07-21T15:30:00.000Z",
    lastVisit: "2026-07-21T15:30:00.000Z",
    totalTickets: 1,
    totalInvoices: 1,
    totalRepairs: 1,
    lifetimeValue: 3499,
    status: "active",
  },
  {
    id: "CUS-A008",
    type: "business",
    firstName: "Imran",
    lastName: "Khan",
    fullName: "Imran Khan",
    mobile: "+91 43210 98765",
    email: "imran@khanmobilehub.com",
    company: "Khan Mobile Hub",
    gstNumber: "29AABCK7890L1ZM",
    address: "88, Commercial Street",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    notes: "Wholesale mobile accessories dealer.",
    createdAt: "2025-04-05T10:00:00.000Z",
    updatedAt: "2026-07-20T13:15:00.000Z",
    lastVisit: "2026-07-20T13:15:00.000Z",
    totalTickets: 5,
    totalInvoices: 4,
    totalRepairs: 5,
    lifetimeValue: 45000,
    status: "active",
  },
  {
    id: "CUS-A009",
    type: "personal",
    firstName: "Anjali",
    lastName: "R.",
    fullName: "Anjali R.",
    mobile: "+91 32109 87654",
    email: "anjali.r@protonmail.com",
    company: "",
    gstNumber: "",
    address: "67, Marathahalli Bridge Road",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560037",
    notes: "Referred by Rahul Kapoor.",
    createdAt: "2026-03-22T16:00:00.000Z",
    updatedAt: "2026-07-19T09:00:00.000Z",
    lastVisit: "2026-07-19T09:00:00.000Z",
    totalTickets: 2,
    totalInvoices: 2,
    totalRepairs: 2,
    lifetimeValue: 14999,
    status: "active",
  },
  {
    id: "CUS-A010",
    type: "personal",
    firstName: "Priya",
    lastName: "Mehta",
    fullName: "Priya Mehta",
    mobile: "+91 88001 22334",
    email: "priya.mehta@gmail.com",
    company: "",
    gstNumber: "",
    address: "9, Lavelle Road, Ashok Nagar",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    notes: "Repeat customer. Apple ecosystem.",
    createdAt: "2025-11-01T09:30:00.000Z",
    updatedAt: "2026-06-28T12:00:00.000Z",
    lastVisit: "2026-06-28T12:00:00.000Z",
    totalTickets: 4,
    totalInvoices: 3,
    totalRepairs: 4,
    lifetimeValue: 52000,
    status: "active",
  },
];
