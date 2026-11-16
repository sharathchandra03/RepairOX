import type { DocumentType, Invoice, InvoiceType } from "@/lib/mock-data";

/** Numbering config shape (from Settings → Invoice → Numbering). */
export type NumberingCfg = { prefix: string; startNumber: number; digits: number };

/**
 * Generate the next invoice id for a series. Uses the configured prefix/digits/
 * start number from Settings when provided, otherwise the legacy INV/INVG · 3-digit
 * defaults. The next number always continues from the highest EXISTING invoice in
 * the series, so changing settings never renumbers historical invoices.
 */
export function genInvoiceId(type: InvoiceType, existingInvoices: Invoice[], cfg?: NumberingCfg, documentType: DocumentType = "invoice"): string {
  const fallbackPrefix = type === "business" ? "INVG" : "INV";
  let prefix = (cfg?.prefix?.trim()) || fallbackPrefix;
  const digits = cfg?.digits && cfg.digits > 0 ? cfg.digits : 3;
  let startNumber = cfg?.startNumber && cfg.startNumber > 0 ? cfg.startNumber : 1;
  // PROFORMA gets its OWN series prefixed with "P-" (→ "P-INV"), matching the
  // DB-side nextInvoiceIdFromDb. This keeps proforma numbers from ever consuming
  // a normal invoice number. The store re-checks against the DB on insert.
  const isProformaDoc = documentType === "proforma";
  if (isProformaDoc) { prefix = `P-${prefix}`; startNumber = 1; }
  // Only compare within the SAME document type + invoice type so the running
  // max never mixes proformas with normal invoices.
  const existing = existingInvoices.filter((i) => i.invoiceType === type && (i.documentType ?? "invoice") === documentType);
  // Only count ids that match this series' canonical shape `<prefix><digits>`
  // (optionally with a store prefix like "KOR-INV054"). Off-series / malformed
  // ids (e.g. a duplicated invoice with a random suffix "INV-5483") are ignored
  // so they can never poison the running max and jump the whole series forward.
  // Match the trailing number ONLY when it directly follows the prefix with no
  // separator: "INV054" ✓, "KOR-INV054" ✓, but "INV-5483" ✗.
  const seriesRe = new RegExp(`(?:^|[A-Za-z]+-)${prefix}(\\d+)$`);
  const maxNum = existing.reduce((max, i) => {
    const canonical = seriesRe.exec(i.id);
    return canonical ? Math.max(max, parseInt(canonical[1], 10)) : max;
  }, 0);
  // First invoice in a fresh series honours the configured start number.
  const next = maxNum === 0 ? startNumber : maxNum + 1;
  return `${prefix}${String(next).padStart(digits, "0")}`;
}

