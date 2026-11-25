/* ──────────────────────────────────────────────────────────────────────────
   Inventory operations — domain model + workflow definitions (Phases 2–3).

   ONE document table (`inventory_docs`) carries every workflow so each new
   process doesn't need its own table, page and context. A document has typed
   header fields, a `lines` array and a `data` bag for type-specific fields.
   What a status change DOES to stock is declared here (`effect`) and executed by
   `use-inventory-actions.ts`.
   ────────────────────────────────────────────────────────────────────────── */

export type DocType =
  | "purchase_order" | "grn" | "vendor_return" | "transfer"
  | "stock_count" | "write_off" | "old_part" | "warranty_claim";

export type DocLine = {
  itemId: string;
  name: string;
  qty: number;
  /** Purchasing docs only (cost-gated at RLS). */
  unitCost?: number;
  /** PO: units received so far. */
  received?: number;
  /** Stock count: system quantity at count time and what was counted. */
  system?: number;
  counted?: number;
  /** Transfer: destination item that receives the units (defaults to itemId). */
  toItemId?: string;
  reason?: string;
  /** Transfer: per-line comment. */
  comment?: string;
  /** PO: line details (all optional so other workflows are unaffected). */
  description?: string;
  hsn?: string;
  uom?: string;
  taxPct?: number;
};

export type InvDoc = {
  id: string;
  type: DocType;
  status: string;
  /** Vendor name / destination store / ticket reference — the "other side". */
  party: string;
  /** Linked document (GRN → PO) or ticket id. */
  ref: string;
  lines: DocLine[];
  data: Record<string, string | number | boolean | null>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Vendor = {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  gstNumber: string;
  address: string;
  paymentTerms: string;
  leadTimeDays?: number;
  notes: string;
  active: boolean;
};

export type SerialStatus = "in_stock" | "installed" | "sold" | "returned" | "rma" | "scrapped";
export type Serial = {
  id: string;
  itemId: string;
  serial: string;
  status: SerialStatus;
  ticketId: string;
  vendor: string;
  receivedDoc: string;
  notes: string;
  createdAt: string;
};

export const SERIAL_STATUS_LABEL: Record<SerialStatus, string> = {
  in_stock: "In stock", installed: "Installed", sold: "Sold", returned: "Returned", rma: "At vendor (RMA)", scrapped: "Scrapped",
};

/* ── Workflow definitions ───────────────────────────────────────────────── */

export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "violet";

/** What a transition does to stock. Executed by use-inventory-actions. */
export type DocEffect =
  | "grn_in"            // + each line qty at its unit cost, update the linked PO
  | "out"               // − each line qty (vendor return sent, transfer dispatched)
  | "transfer_in"       // + each line qty into the destination item
  | "count_variance"    // post (counted − system) per line
  | "replacement_in";   // + qty back at weighted-average cost

export type DocAction = { label: string; to: string; effect?: DocEffect; tone?: "primary" | "danger" | "outline"; needs?: "approve" | "adjust" | "transfer" | "purchase" };

export type DocMeta = {
  type: DocType;
  prefix: string;
  label: string;
  plural: string;
  route: string;
  partyLabel: string;
  statuses: Record<string, { label: string; tone: Tone }>;
  initial: string;
  /** Does the document carry unit costs (purchasing docs)? */
  hasCost: boolean;
  actions: (status: string) => DocAction[];
};

export const DOC_META: Record<DocType, DocMeta> = {
  purchase_order: {
    type: "purchase_order", prefix: "PO", label: "Purchase Order", plural: "Purchase Orders", route: "/inventory/purchase-orders",
    partyLabel: "Vendor", initial: "draft", hasCost: true,
    statuses: {
      draft: { label: "Draft", tone: "neutral" }, sent: { label: "Sent to vendor", tone: "info" },
      partial: { label: "Partially received", tone: "warning" }, received: { label: "Received", tone: "success" },
      closed: { label: "Closed", tone: "neutral" }, cancelled: { label: "Cancelled", tone: "danger" },
    },
    actions: (s) => s === "draft" ? [{ label: "Mark as sent", to: "sent", needs: "purchase" }, { label: "Cancel PO", to: "cancelled", tone: "danger", needs: "purchase" }]
      : s === "sent" || s === "partial" ? [{ label: "Close PO", to: "closed", tone: "outline", needs: "purchase" }, { label: "Cancel PO", to: "cancelled", tone: "danger", needs: "purchase" }]
      : [],
  },
  grn: {
    type: "grn", prefix: "GRN", label: "Goods Received Note", plural: "Receive Stock (GRN)", route: "/inventory/receive-stock",
    partyLabel: "Vendor", initial: "draft", hasCost: true,
    statuses: { draft: { label: "Draft", tone: "neutral" }, posted: { label: "Posted to stock", tone: "success" } },
    actions: (s) => s === "draft" ? [{ label: "Post to stock", to: "posted", effect: "grn_in", needs: "purchase" }] : [],
  },
  vendor_return: {
    type: "vendor_return", prefix: "RMA", label: "Vendor Return", plural: "Vendor Returns (RMA)", route: "/inventory/vendor-returns",
    partyLabel: "Vendor", initial: "draft", hasCost: false,
    statuses: {
      draft: { label: "Draft", tone: "neutral" }, sent: { label: "Sent to vendor", tone: "info" },
      credited: { label: "Credit received", tone: "success" }, replaced: { label: "Replaced", tone: "success" }, closed: { label: "Closed", tone: "neutral" },
    },
    actions: (s) => s === "draft" ? [{ label: "Send to vendor (remove stock)", to: "sent", effect: "out", needs: "purchase" }]
      : s === "sent" ? [{ label: "Credit received", to: "credited", needs: "purchase" }, { label: "Replacement received", to: "replaced", effect: "replacement_in", needs: "purchase" }, { label: "Close (no credit)", to: "closed", tone: "outline", needs: "purchase" }]
      : [],
  },
  transfer: {
    type: "transfer", prefix: "TRF", label: "Store Transfer", plural: "Stock Transfers", route: "/inventory/stock-movement",
    partyLabel: "To store", initial: "requested", hasCost: false,
    statuses: {
      requested: { label: "Requested", tone: "warning" }, in_transit: { label: "In transit", tone: "info" },
      received: { label: "Received", tone: "success" }, cancelled: { label: "Cancelled", tone: "danger" },
    },
    actions: (s) => s === "requested" ? [{ label: "Dispatch (remove from source)", to: "in_transit", effect: "out", needs: "transfer" }, { label: "Cancel", to: "cancelled", tone: "danger", needs: "transfer" }]
      : s === "in_transit" ? [{ label: "Receive at destination", to: "received", effect: "transfer_in", needs: "transfer" }] : [],
  },
  stock_count: {
    type: "stock_count", prefix: "CNT", label: "Stock Count", plural: "Stock Audit", route: "/inventory/stock-count",
    partyLabel: "Location", initial: "draft", hasCost: false,
    statuses: {
      draft: { label: "Counting", tone: "warning" }, submitted: { label: "Awaiting approval", tone: "info" },
      approved: { label: "Approved · stock corrected", tone: "success" }, rejected: { label: "Rejected", tone: "danger" },
    },
    actions: (s) => s === "draft" ? [{ label: "Submit for approval", to: "submitted", needs: "adjust" }]
      : s === "submitted" ? [{ label: "Approve & correct stock", to: "approved", effect: "count_variance", needs: "approve" }, { label: "Reject", to: "rejected", tone: "danger", needs: "approve" }] : [],
  },
  write_off: {
    type: "write_off", prefix: "WO", label: "Write-off", plural: "Write-offs", route: "/inventory/loss-damage",
    partyLabel: "Reason", initial: "posted", hasCost: false,
    statuses: { posted: { label: "Posted", tone: "danger" } },
    actions: () => [],
  },
  old_part: {
    type: "old_part", prefix: "OLD", label: "Old Part Return", plural: "Old Part Returns", route: "/inventory/old-parts",
    partyLabel: "Ticket", initial: "pending", hasCost: false,
    statuses: {
      pending: { label: "Pending return", tone: "warning" }, returned_vendor: { label: "Returned to vendor", tone: "success" },
      scrapped: { label: "Scrapped", tone: "neutral" }, recycled: { label: "Recycled / e-waste", tone: "violet" },
    },
    actions: (s) => s === "pending" ? [{ label: "Returned to vendor", to: "returned_vendor", needs: "adjust" }, { label: "Scrapped", to: "scrapped", tone: "outline", needs: "adjust" }, { label: "Recycled / e-waste", to: "recycled", tone: "outline", needs: "adjust" }] : [],
  },
  warranty_claim: {
    type: "warranty_claim", prefix: "WCL", label: "Warranty Part Claim", plural: "Warranty Part Claims", route: "/inventory/warranty-parts",
    partyLabel: "Vendor", initial: "raised", hasCost: false,
    statuses: {
      raised: { label: "Raised", tone: "warning" }, sent: { label: "Sent to vendor", tone: "info" },
      approved: { label: "Approved", tone: "violet" }, replaced: { label: "Replacement received", tone: "success" }, rejected: { label: "Rejected", tone: "danger" },
    },
    actions: (s) => s === "raised" ? [{ label: "Mark sent to vendor", to: "sent", needs: "adjust" }, { label: "Reject", to: "rejected", tone: "danger", needs: "adjust" }]
      : s === "sent" ? [{ label: "Vendor approved", to: "approved", needs: "adjust" }, { label: "Vendor rejected", to: "rejected", tone: "danger", needs: "adjust" }]
      : s === "approved" ? [{ label: "Replacement received (add stock)", to: "replaced", effect: "replacement_in", needs: "adjust" }] : [],
  },
};

/** Next display number for a doc type: PO-0007. */
export function nextDocId(type: DocType, existing: { id: string; type: DocType }[]): string {
  const { prefix } = DOC_META[type];
  let max = 0;
  for (const d of existing) {
    if (d.type !== type) continue;
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(d.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

export function nextVendorId(existing: { id: string }[]): string {
  let max = 0;
  for (const v of existing) {
    const m = /^VND-(\d+)$/.exec(v.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `VND-${String(max + 1).padStart(4, "0")}`;
}

export const docUnits = (d: InvDoc) => d.lines.reduce((s, l) => s + (l.qty || 0), 0);
export const docValue = (d: InvDoc) =>
  // A PO built in the full PO editor stores its grand total (tax, discount, charges included).
  typeof d.data.grandTotal === "number" ? d.data.grandTotal : d.lines.reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0);

/* ── Row mappers (snake_case DB ↔ camelCase app) ────────────────────────── */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const rowToDoc = (r: any): InvDoc => ({
  id: r.id, type: r.doc_type, status: r.status ?? "draft", party: r.party ?? "", ref: r.ref ?? "",
  lines: Array.isArray(r.lines) ? r.lines : [], data: r.data && typeof r.data === "object" ? r.data : {},
  createdBy: r.created_by_name ?? "", createdAt: r.created_at ?? "", updatedAt: r.updated_at ?? "",
});
export const docToRow = (d: InvDoc) => ({
  id: d.id, doc_type: d.type, status: d.status, party: d.party || null, ref: d.ref || null,
  lines: d.lines, data: d.data, created_by_name: d.createdBy || null, updated_at: new Date().toISOString(),
});
export const rowToVendor = (r: any): Vendor => ({
  id: r.id, name: r.name ?? "", contactPerson: r.contact_person ?? "", phone: r.phone ?? "", email: r.email ?? "",
  gstNumber: r.gst_number ?? "", address: r.address ?? "", paymentTerms: r.payment_terms ?? "",
  leadTimeDays: r.lead_time_days ?? undefined, notes: r.notes ?? "", active: r.active ?? true,
});
export const vendorToRow = (v: Vendor) => ({
  id: v.id, name: v.name, contact_person: v.contactPerson || null, phone: v.phone || null, email: v.email || null,
  gst_number: v.gstNumber || null, address: v.address || null, payment_terms: v.paymentTerms || null,
  lead_time_days: v.leadTimeDays ?? null, notes: v.notes || null, active: v.active, updated_at: new Date().toISOString(),
});
export const rowToSerial = (r: any): Serial => ({
  id: r.id, itemId: r.item_id, serial: r.serial, status: r.status ?? "in_stock", ticketId: r.ticket_id ?? "",
  vendor: r.vendor ?? "", receivedDoc: r.received_doc ?? "", notes: r.notes ?? "", createdAt: r.created_at ?? "",
});
export const serialToRow = (s: Serial) => ({
  id: s.id, item_id: s.itemId, serial: s.serial, status: s.status, ticket_id: s.ticketId || null,
  vendor: s.vendor || null, received_doc: s.receivedDoc || null, notes: s.notes || null, updated_at: new Date().toISOString(),
});
