/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Customer Master CSV import / export / template.

   The Customer Master is the single hub for every person the business has
   captured (walk-ins, leads, prospects, manual). This module powers:
     • Export  — the whole customer list to a marketing-ready CSV.
     • Template — a blank CSV with the canonical headers + one example row,
                  so an imported file in this exact format lands cleanly.
     • Import  — parse an uploaded CSV into FindOrCreateInput rows (deduped by
                 the caller via findOrCreateCustomer), stamped captureSource
                 "import".

   Built on the shared csv-utils primitives (parseCSV / toCSV / downloadCSV).
   ────────────────────────────────────────────────────────────────────────── */

import { parseCSV, toCSV, downloadXLSX } from "@/lib/csv-utils";
import {
  CUSTOMER_SOURCE_LABEL, CAPTURE_SOURCE_LABEL,
  type Customer, type CustomerSource,
} from "@/lib/customer-data";
import { pointsFromInvoiceAmount, tierForLifetimeValue, type FindOrCreateInput } from "@/lib/customer-service";

/** Canonical import/export columns, in order. */
export const CUSTOMER_CSV_COLUMNS = [
  "First Name",
  "Last Name",
  "Mobile",
  "Email",
  "Type",           // personal | business
  "Company",
  "GST Number",
  "Address",
  "City",
  "State",
  "Postal Code",
  "Source",         // marketing channel (walk-in/sales/referral/gmb/meta/other)
  "Notes",
] as const;

/** Header → normalized key, tolerant of case/spacing/underscores. */
const HEADER_KEY: Record<string, keyof CustomerCsvRow> = {
  firstname: "firstName", first_name: "firstName", first: "firstName", name: "firstName",
  lastname: "lastName", last_name: "lastName", last: "lastName", surname: "lastName",
  mobile: "mobile", phone: "mobile", phonenumber: "mobile", contact: "mobile", mobilenumber: "mobile",
  email: "email", emailaddress: "email",
  type: "type", customertype: "type",
  company: "company", companyname: "company", business: "company",
  gstnumber: "gstNumber", gst: "gstNumber", gstin: "gstNumber",
  address: "address",
  city: "city",
  state: "state",
  postalcode: "postalCode", postal: "postalCode", pincode: "postalCode", zip: "postalCode",
  source: "source", channel: "source",
  notes: "notes", note: "notes", remarks: "notes",
};

export interface CustomerCsvRow {
  firstName?: string;
  lastName?: string;
  mobile?: string;
  email?: string;
  type?: string;
  company?: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  source?: string;
  notes?: string;
}

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_\-./]+/g, "");
}

/** Map a free-text source label/value to a CustomerSource key (best effort). */
function coerceSource(v?: string): CustomerSource | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  const byLabel = (Object.keys(CUSTOMER_SOURCE_LABEL) as CustomerSource[])
    .find((k) => CUSTOMER_SOURCE_LABEL[k].toLowerCase() === s || k === s);
  if (byLabel) return byLabel;
  if (s.includes("walk")) return "direct_walkin";
  if (s.includes("refer")) return "referral";
  if (s.includes("gmb") || s.includes("google")) return "gmb";
  if (s.includes("meta") || s.includes("facebook") || s.includes("insta")) return "meta";
  if (s.includes("sale")) return "sales";
  return "other";
}

export interface ParsedCustomerCSV {
  headers: string[];
  rows: CustomerCsvRow[];
  /** 1-based source row numbers (excluding header), for error messages. */
  rowNumbers: number[];
  /** Required headers missing from the file (First Name + Mobile). */
  missingRequired: string[];
}

/** Parse CSV text into typed customer rows with tolerant header matching. */
export function parseCustomerCSV(text: string): ParsedCustomerCSV {
  const matrix = parseCSV(text);
  if (matrix.length === 0) {
    return { headers: [], rows: [], rowNumbers: [], missingRequired: ["First Name", "Mobile"] };
  }
  const rawHeaders = matrix[0].map((h) => h.trim());
  const keys = rawHeaders.map((h) => HEADER_KEY[normHeader(h)]);
  const present = new Set(keys.filter(Boolean));
  const missingRequired: string[] = [];
  if (!present.has("firstName")) missingRequired.push("First Name");
  if (!present.has("mobile")) missingRequired.push("Mobile");

  const rows: CustomerCsvRow[] = [];
  const rowNumbers: number[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    const obj: CustomerCsvRow = {};
    keys.forEach((key, idx) => { if (key) obj[key] = (cells[idx] ?? "").trim(); });
    // Skip completely empty rows.
    if (Object.values(obj).some((v) => (v ?? "").trim() !== "")) {
      rows.push(obj);
      rowNumbers.push(r);
    }
  }
  return { headers: rawHeaders, rows, rowNumbers, missingRequired };
}

/** Convert a parsed CSV row into a FindOrCreateInput stamped as an import. */
export function csvRowToInput(row: CustomerCsvRow): FindOrCreateInput | null {
  const firstName = (row.firstName || "").trim();
  const mobile = (row.mobile || "").trim();
  // First name + mobile are the minimum identity we require per row.
  if (!firstName && !mobile) return null;
  const type = (row.type || "").trim().toLowerCase() === "business" ? "business" : "personal";
  return {
    firstName: firstName || "Customer",
    lastName: (row.lastName || "").trim(),
    mobile,
    email: (row.email || "").trim() || undefined,
    type,
    source: coerceSource(row.source),
    captureSource: "import",
    company: (row.company || "").trim() || undefined,
    address: (row.address || "").trim() || undefined,
    city: (row.city || "").trim() || undefined,
    state: (row.state || "").trim() || undefined,
    postalCode: (row.postalCode || "").trim() || undefined,
  };
}

/** One canonical example row for the customer template (shared by CSV + XLSX). */
export const CUSTOMER_TEMPLATE_EXAMPLE: (string | number)[] = [
  "Priya", "Menon", "+91 98765 43210", "priya@example.com", "personal",
  "", "", "12 MG Road", "Bengaluru", "Karnataka", "560001", "Referral",
  "Prefers WhatsApp",
];

/** Blank template: canonical headers + one example row. */
export function customerTemplateCSV(): string {
  return toCSV([...CUSTOMER_CSV_COLUMNS], [CUSTOMER_TEMPLATE_EXAMPLE]);
}

/** Download the customer IMPORT TEMPLATE as an Excel (.xlsx) file (Excel-only). */
export function downloadCustomerTemplateXLSX(filename = "customer-import-template"): Promise<void> {
  return downloadXLSX(filename, [...CUSTOMER_CSV_COLUMNS], [CUSTOMER_TEMPLATE_EXAMPLE], "Customers");
}

/**
 * Serialize the whole customer list to a marketing-ready CSV.
 *
 * Pass `loyaltyByCustomer` (from `useStore().loyaltyByCustomer`) for the exact
 * settled loyalty balance/tier. When a customer has no loyalty account yet, the
 * points/tier are DERIVED from lifetime value (₹100 = 1 point) so the export
 * matches the Customer Master table — loyalty is linked to lifetime value.
 *
 * Export-only columns appended after the importable base columns:
 *   Captured Via | Created At | Last Visit | Total Tickets | Total Invoices |
 *   Lifetime Value (₹) | Loyalty Points | Loyalty Tier
 */
/** Full export column set (importable base columns + export-only provenance). */
export const CUSTOMER_EXPORT_COLUMNS: string[] = [
  ...CUSTOMER_CSV_COLUMNS,
  "Captured Via",
  "Created At",
  "Last Visit",
  "Total Tickets",
  "Total Invoices",
  "Lifetime Value (₹)",
  "Loyalty Points",
  "Loyalty Tier",
];

/** Build the export rows (shared by the CSV and XLSX exporters). */
export function buildCustomerExportRows(
  customers: Customer[],
  loyaltyByCustomer?: Record<string, { points: number; tier: string }>,
): (string | number | undefined)[][] {
  return customers.map((c) => {
    const loyalty = loyaltyByCustomer?.[c.id];
    return [
      // ── importable base columns ──────────────────────────────────────
      c.firstName,
      c.lastName,
      c.mobile,
      c.email,
      c.type,
      c.company,
      c.gstNumber,
      c.address,
      c.city,
      c.state,
      c.postalCode,
      c.source ? (CUSTOMER_SOURCE_LABEL[c.source] ?? c.source) : "",
      c.notes,
      // ── export-only provenance + activity columns ────────────────────
      c.captureSource ? (CAPTURE_SOURCE_LABEL[c.captureSource] ?? c.captureSource) : "",
      c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN") : "",
      c.lastVisit ? new Date(c.lastVisit).toLocaleDateString("en-IN") : "",
      c.totalTickets ?? 0,
      c.totalInvoices ?? 0,
      c.lifetimeValue ?? 0,
      // ── loyalty: explicit account when present, else derived from
      //    lifetime value (matches the Customer Master table) ────────────
      loyalty?.points ?? pointsFromInvoiceAmount(c.lifetimeValue ?? 0),
      (() => {
        const tier = loyalty?.tier ?? tierForLifetimeValue(pointsFromInvoiceAmount(c.lifetimeValue ?? 0));
        return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "";
      })(),
    ];
  });
}

export function customersToCSV(
  customers: Customer[],
  loyaltyByCustomer?: Record<string, { points: number; tier: string }>,
): string {
  return toCSV(CUSTOMER_EXPORT_COLUMNS, buildCustomerExportRows(customers, loyaltyByCustomer));
}

/** Export the whole customer list as an Excel (.xlsx) file. */
export function downloadCustomersXLSX(
  filename: string,
  customers: Customer[],
  loyaltyByCustomer?: Record<string, { points: number; tier: string }>,
): Promise<void> {
  return downloadXLSX(filename, CUSTOMER_EXPORT_COLUMNS, buildCustomerExportRows(customers, loyaltyByCustomer), "Customers");
}
