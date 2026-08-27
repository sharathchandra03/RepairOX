"use client";

import type { PrintDocumentData, PrintDeviceInfo, PrintLineItem } from "@/lib/print-utils";
import { formatPrintCurrency, formatPrintDate, formatPrintTime, formatPrintDateTime } from "@/lib/print-utils";
import { formatWarranty } from "@/lib/mock-data";

/* ─── RepairOX Brand Palette ─────────────────────────────────────────── */
const BRAND = {
  blue: "#1F52D8", // primary RepairOX blue/indigo
  blueDark: "#1743B5",
  navy: "#0F1B3D", // dark navy text
  ink: "#1E293B",
  slate: "#475569",
  slateLight: "#64748B",
  band: "#EAF0FF", // light blue section background
  bandSoft: "#F4F7FF",
  border: "#D7DEEA", // thin borders
  borderSoft: "#E7ECF5",
  white: "#FFFFFF",
  green: "#15803D",
  rose: "#BE123C",
};

/* Keep a block from being split across printed pages. */
const NO_BREAK: React.CSSProperties = {
  breakInside: "avoid",
  pageBreakInside: "avoid",
};

/* ─── A4 Print Template (router) ─────────────────────────────────────── */

export function A4Template({ data }: { data: PrintDocumentData }) {
  if (data.ticket) {
    return <TicketServiceReport data={data} />;
  }
  return <InvoiceA4 data={data} />;
}

/* ═══════════════════════════════════════════════════════════════════════
   TICKET — Professional Blue Service Report (single-page-first, A4)
   ═══════════════════════════════════════════════════════════════════════ */

/** Pure-CSS barcode (Code128-style visual). No external lib, deterministic bars. */
function Barcode({ value }: { value: string }) {
  // Deterministic bar widths derived from the value's char codes.
  const seed = value || "0";
  const bars: { w: number; on: boolean }[] = [];
  for (let i = 0; i < seed.length * 4 + 12; i++) {
    const code = seed.charCodeAt(i % seed.length) || 48;
    const w = ((code + i * 7) % 3) + 1; // 1–3px
    bars.push({ w, on: (code + i) % 2 === 0 });
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-end", height: 40, gap: 0 }}>
      {bars.map((b, i) => (
        <div
          key={i}
          style={{
            width: b.w,
            height: "100%",
            backgroundColor: b.on ? BRAND.navy : "transparent",
          }}
        />
      ))}
    </div>
  );
}

/** Small labelled cell used across the info grids. */
function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: BRAND.slateLight }}>
        {label}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: BRAND.navy, fontFamily: mono ? "ui-monospace, monospace" : undefined, wordBreak: "break-word" }}>
        {value || "—"}
      </span>
    </div>
  );
}

/** Section header bar (icon dot + title) with light-blue band. */
function SectionHead({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, backgroundColor: BRAND.band, borderBottom: `1px solid ${BRAND.border}`, padding: "5px 10px" }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, backgroundColor: BRAND.blue, display: "inline-block" }} />
      <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: BRAND.blue }}>{title}</span>
    </div>
  );
}

function TicketServiceReport({ data }: { data: PrintDocumentData }) {
  const { store, customer, ticket } = data;
  const t = ticket!;

  const isBusiness = t.customerType === "business";
  const createdDate = formatPrintDate(t.createdAt);
  const createdTime = formatPrintTime(t.createdAt);

  // Devices: reuse existing per-device print info; fall back to flat single device.
  const devices: PrintDeviceInfo[] =
    t.devices && t.devices.length > 0
      ? t.devices
      : [
          {
            id: "d0",
            brand: t.device || "",
            model: t.model || "",
            serial: t.serial || "",
            issue: t.issue || "",
            service: t.service || "",
            technician: t.technician || "",
            priority: t.priority || "",
            status: t.status || "",
            warranty: t.warranty || "",
            parts: t.parts || [],
            estimate: t.amount || 0,
            accessories: "",
            notes: "",
          },
        ];

  // Build the itemized table rows: one main row per device + its parts as rows.
  type Row = {
    idx: number;
    name: string;
    tag?: string;
    descLines: { label?: string; value: string; strong?: boolean }[];
    qty: number;
    price: number;
    discount: number;
    tax: number;
    total: number;
  };

  const gstOn = !!(t.sgst && t.sgst > 0) || !!(t.cgst && t.cgst > 0) || !!(t.gstRate && t.gstRate > 0);

  const rows: Row[] = [];
  let rowNo = 0;

  devices.forEach((dev) => {
    const deviceLabel = [dev.brand, dev.model].filter(Boolean).join(" ") || dev.brand || dev.model || "Device";
    const partsSum = (dev.parts || []).reduce((s, p) => s + p.total, 0);
    const deviceLine = Math.max(dev.estimate - partsSum, 0);

    // Main device row — carries the COMPLETE device information inside the
    // Description cell (no separate Device Details section exists).
    const descLines: Row["descLines"] = [];
    if (dev.brand) descLines.push({ label: "Brand", value: dev.brand });
    if (dev.model) descLines.push({ label: "Model", value: dev.model });
    if (dev.serial) descLines.push({ label: "IMEI / Serial", value: dev.serial });
    if (dev.issue) descLines.push({ label: "Issue", value: dev.issue });
    if (dev.service && dev.service !== dev.issue) descLines.push({ label: "Service", value: dev.service });
    if (dev.technician) descLines.push({ label: "Technician", value: dev.technician });
    if (dev.priority) descLines.push({ label: "Priority", value: String(dev.priority).replace(/_/g, " ") });
    if (dev.status) descLines.push({ label: "Status", value: String(dev.status).replace(/_/g, " ") });
    if (dev.warranty) descLines.push({ label: "Warranty", value: formatWarranty(undefined, undefined, dev.warranty) });
    if (t.dueDate) descLines.push({ label: "Due Date", value: formatPrintDateTime(t.dueDate) });
    if (dev.accessories) descLines.push({ label: "Accessories", value: dev.accessories });
    if (dev.notes) descLines.push({ label: "Notes", value: dev.notes });

    rowNo += 1;
    rows.push({
      idx: rowNo,
      name: deviceLabel,
      tag: dev.issue ? "DIAGNOSIS" : dev.service || undefined,
      descLines,
      qty: 1,
      price: deviceLine,
      discount: 0,
      tax: 0,
      total: deviceLine,
    });

    // Parts rows for this device
    (dev.parts || []).forEach((p: PrintLineItem) => {
      rowNo += 1;
      rows.push({
        idx: rowNo,
        name: p.name,
        descLines: p.description ? [{ value: p.description }] : [],
        qty: p.qty,
        price: p.price,
        discount: p.discount || 0,
        total: p.total,
        tax: 0,
      });
    });
  });

  // Summary values — all from real saved ticket data. No dummy fill.
  const subtotal = rows.reduce((s, r) => s + r.total, 0) || t.amount || 0;
  const discountTotal = rows.reduce((s, r) => s + (r.discount || 0), 0);
  const sgst = t.sgst || 0;
  const cgst = t.cgst || 0;
  const grandTotal = t.amount || subtotal;
  const totalPaid = 0; // tickets do not store partial payments; real value is 0 until invoiced
  const due = Math.max(grandTotal - totalPaid, 0);

  // GST column header text
  const gstHeader = gstOn ? `CGST ${t.cgstRate ?? 0}%` : "TAX";
  const priceHeader = `PRICE`;

  return (
    <div
      className="a4-page"
      style={{
        width: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        backgroundColor: BRAND.white,
        color: BRAND.navy,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize: 11,
        lineHeight: 1.4,
        boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* content wrapper with padding, footer sits flush at bottom */}
      <div className="ticket-print-body" style={{ padding: "9mm 12mm 2mm", flex: 1 }}>
        {/* ══ HEADER ══ */}
        <header data-pdf-atomic style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, paddingBottom: 10, borderBottom: `2px solid ${BRAND.blue}` }}>
          {/* LEFT: store branding */}
          <div style={{ display: "flex", gap: 13, alignItems: "flex-start", maxWidth: "58%" }}>
            {store.logo ? (
              <img src={store.logo} alt="Logo" style={{ height: 56, width: 56, objectFit: "contain" }} />
            ) : null}
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.blue, lineHeight: 1.1 }}>{store.storeName}</div>
              {store.alternateName ? (
                <div style={{ fontSize: 9, color: BRAND.slateLight, fontWeight: 600 }}>{store.alternateName}</div>
              ) : null}
              <div style={{ marginTop: 5, fontSize: 9.5, color: BRAND.slate, display: "flex", flexDirection: "column", gap: 1.5 }}>
                {store.fullAddress ? <span>{store.fullAddress}</span> : null}
                {store.phone ? <span>{store.phone}{store.mobile && store.mobile !== store.phone ? ` · ${store.mobile}` : ""}</span> : null}
                {store.email ? <span>{store.email}</span> : null}
                {store.website ? <span style={{ color: BRAND.blue, fontWeight: 600 }}>{store.website}</span> : null}
              </div>
              {(store.registrationNumber || store.hsnCode) ? (
                <div style={{ marginTop: 5, fontSize: 9, fontWeight: 700, color: BRAND.navy, display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {store.registrationNumber ? <span>GSTIN: {store.registrationNumber}</span> : null}
                  {store.hsnCode ? <span>HSN CODE: {store.hsnCode}</span> : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* RIGHT: service report identity */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5, color: BRAND.navy, textTransform: "uppercase" }}>Service Report</div>
            {/* Date · Time · Retail/Business — pulled up right under the title */}
            <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, fontSize: 9, color: BRAND.slate }}>
              <span>{createdDate} · {createdTime}</span>
              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", backgroundColor: isBusiness ? "#FEF3C7" : BRAND.band, color: isBusiness ? "#92400E" : BRAND.blue, border: `1px solid ${isBusiness ? "#FCD34D" : BRAND.border}` }}>
                {isBusiness ? "Business / GST" : "Retail"}
              </span>
            </div>
            <div style={{ marginTop: 6, backgroundColor: BRAND.blue, color: BRAND.white, borderRadius: 8, padding: "6px 14px", display: "inline-block", textAlign: "left", minWidth: 150 }}>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.85 }}>Ticket Number</div>
              <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>{t.ticketId}</div>
            </div>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <Barcode value={t.ticketId} />
              <div style={{ fontSize: 9, fontWeight: 600, color: BRAND.navy, letterSpacing: 1 }}>{t.ticketId}</div>
            </div>
          </div>
        </header>

        {/* ══ CUSTOMER + TICKET INFO ══ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 10, marginTop: 9 }}>
          {/* CUSTOMER DETAILS */}
          <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden" }}>
            <SectionHead title="Customer Details" />
            <div style={{ padding: "7px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
              <Field label="Name" value={customer.name} />
              {customer.company ? <Field label="Company" value={customer.company} /> : null}
              {customer.phone ? <Field label="Phone" value={customer.phone} /> : null}
              {customer.email ? <Field label="Email" value={customer.email} /> : null}
              {customer.address ? <Field label="Address" value={customer.address} /> : null}
              {isBusiness && t.gstNumber ? <Field label="GST Number" value={t.gstNumber} mono /> : null}
            </div>
          </div>

          {/* TICKET INFORMATION */}
          <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden" }}>
            <SectionHead title="Ticket Information" />
            <div style={{ padding: "7px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" }}>
              <Field label="Ticket Number" value={t.ticketId} />
              <Field label="Due On" value={t.dueDate ? formatPrintDateTime(t.dueDate) : "—"} />
              <Field label="Created" value={`${createdDate} (${createdTime})`} />
              <Field label="Status" value={String(t.status || "").replace(/_/g, " ") || "—"} />
              <Field label="Technician" value={t.technician || "Unassigned"} />
              <Field label="Priority" value={t.priority || "Normal"} />
            </div>
          </div>
        </div>

        {/* ══ DEVICE / SERVICE TABLE ══
             table-layout: fixed + colgroup percentages guarantee identical
             column widths in the browser preview AND the printed/PDF output,
             preventing text columns from collapsing and wrapping word-by-word. */}
        <div style={{ marginTop: 9, border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 10 }}>
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "35%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: BRAND.blue, color: BRAND.white }}>
                <th style={thStyle("center")}>#</th>
                <th style={thStyle("left")}>Item / Service</th>
                <th style={thStyle("left")}>Description</th>
                <th style={thStyle("center")}>Qty</th>
                <th style={thStyle("right")}>{priceHeader}</th>
                <th style={thStyle("right")}>Disc.</th>
                <th style={thStyle("right")}>{gstHeader}</th>
                <th style={thStyle("right")}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} data-pdf-atomic style={{ backgroundColor: i % 2 === 1 ? BRAND.bandSoft : BRAND.white, verticalAlign: "top", ...NO_BREAK }}>
                  <td style={tdStyle("center")}>{r.idx}</td>
                  <td style={tdStyle("left")}>
                    <div style={{ fontWeight: 700, color: BRAND.navy }}>{r.name}</div>
                    {r.tag ? <div style={{ fontSize: 9, fontWeight: 700, color: BRAND.blue, marginTop: 2 }}>{r.tag}</div> : null}
                  </td>
                  <td style={tdStyle("left")}>
                    {r.descLines.length > 0 ? (
                      <div
                        style={
                          r.descLines.length > 3
                            ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5px 14px" }
                            : { display: "flex", flexDirection: "column", gap: 1.5 }
                        }
                      >
                        {r.descLines.map((d, di) => (
                          <div key={di} style={{ fontSize: 9.3, color: BRAND.ink, lineHeight: 1.35 }}>
                            {d.label ? <span style={{ fontWeight: 700, color: BRAND.navy }}>{d.label}: </span> : null}
                            <span>{d.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: BRAND.slateLight }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle("center")}>{r.qty}</td>
                  <td style={tdStyle("right")}>{formatPrintCurrency(r.price)}</td>
                  <td style={tdStyle("right")}>{r.discount > 0 ? formatPrintCurrency(r.discount) : formatPrintCurrency(0)}</td>
                  <td style={tdStyle("right")}>{formatPrintCurrency(r.tax)}</td>
                  <td style={{ ...tdStyle("right"), fontWeight: 800, color: BRAND.navy }}>{formatPrintCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ══ SUPPORTING INFO + SUMMARY (side-by-side) ══
             All device info lives in the Item/Service table above; the space to
             the LEFT of the Price Breakdown is used for a compact recap so it is
             not wasted. */}
        <div data-pdf-atomic style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 10, marginTop: 9, alignItems: "stretch", ...NO_BREAK }}>
          {/* LEFT: compact supporting info — stretches to match Price Breakdown height */}
          <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <SectionHead title="Service Summary" />
            <div style={{ padding: "7px 12px", display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
                <span style={{ fontSize: 9.5, color: BRAND.slate }}>
                  <span style={{ fontWeight: 700, color: BRAND.navy }}>Devices: </span>{devices.length}
                </span>
                <span style={{ fontSize: 9.5, color: BRAND.slate }}>
                  <span style={{ fontWeight: 700, color: BRAND.navy }}>Line Items: </span>{rows.length}
                </span>
                {t.priority ? (
                  <span style={{ fontSize: 9.5, color: BRAND.slate }}>
                    <span style={{ fontWeight: 700, color: BRAND.navy }}>Priority: </span>
                    {String(t.priority).replace(/_/g, " ")}
                  </span>
                ) : null}
                {t.status ? (
                  <span style={{ fontSize: 9.5, color: BRAND.slate }}>
                    <span style={{ fontWeight: 700, color: BRAND.navy }}>Status: </span>
                    {String(t.status).replace(/_/g, " ")}
                  </span>
                ) : null}
              </div>
              {/* Per-device one-line recap (Brand Model — Status · Warranty) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2.5, borderTop: `1px solid ${BRAND.borderSoft}`, paddingTop: 5 }}>
                {devices.map((dev, di) => {
                  const name = [dev.brand, dev.model].filter(Boolean).join(" ") || "Device";
                  const bits = [
                    dev.serial ? `IMEI ${dev.serial}` : "",
                    dev.status ? String(dev.status).replace(/_/g, " ") : "",
                    dev.warranty ? formatWarranty(undefined, undefined, dev.warranty) : "",
                  ].filter(Boolean);
                  return (
                    <div key={dev.id || di} style={{ fontSize: 9, color: BRAND.slate, lineHeight: 1.35 }}>
                      <span style={{ fontWeight: 700, color: BRAND.navy }}>{name}</span>
                      {bits.length ? <span> — {bits.join(" · ")}</span> : null}
                    </div>
                  );
                })}
              </div>
              {/* Aggregated accessories/notes when present */}
              {(() => {
                const accessories = devices.map((d) => d.accessories).filter(Boolean).join("; ");
                const notes = devices.map((d) => d.notes).filter(Boolean).join("; ");
                return (
                  <>
                    {accessories ? (
                      <div style={{ fontSize: 9, color: BRAND.slate, borderTop: `1px solid ${BRAND.borderSoft}`, paddingTop: 5 }}>
                        <span style={{ fontWeight: 700, color: BRAND.navy }}>Accessories: </span>{accessories}
                      </div>
                    ) : null}
                    {notes ? (
                      <div style={{ fontSize: 9, color: BRAND.slate, borderTop: accessories ? "none" : `1px solid ${BRAND.borderSoft}`, paddingTop: accessories ? 0 : 5 }}>
                        <span style={{ fontWeight: 700, color: BRAND.navy }}>Notes: </span>{notes}
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </div>
          </div>

          {/* RIGHT: Price Breakdown — same top & bottom edges as Service Summary */}
          <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "9px 12px", display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
              <SummaryRow label="Sub Total" value={formatPrintCurrency(subtotal)} />
              <SummaryRow label="Discount" value={formatPrintCurrency(discountTotal)} />
              {gstOn ? (
                <>
                  <SummaryRow label={`SGST @${t.sgstRate ?? 0}%`} value={formatPrintCurrency(sgst)} />
                  <SummaryRow label={`CGST @${t.cgstRate ?? 0}%`} value={formatPrintCurrency(cgst)} />
                </>
              ) : null}
              <div style={{ borderTop: `1px dashed ${BRAND.border}`, margin: "2px 0" }} />
              <SummaryRow label="Total" value={formatPrintCurrency(grandTotal)} strong accent />
              <SummaryRow label="Total Paid" value={formatPrintCurrency(totalPaid)} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: BRAND.band, borderTop: `1px solid ${BRAND.border}`, padding: "8px 12px" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: BRAND.navy }}>Due</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: BRAND.blue }}>{formatPrintCurrency(due)}</span>
            </div>
          </div>
        </div>

        {/* ══ TERMS & CONDITIONS ══ */}
        {data.termsAndConditions ? (
          <div data-pdf-atomic style={{ marginTop: 8, border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden", ...NO_BREAK }}>
            <SectionHead title="Terms & Conditions" />
            <div style={{ padding: "5px 12px" }}>
              <TwoColList text={data.termsAndConditions} />
            </div>
          </div>
        ) : null}

        {/* ══ WARRANTY INFORMATION ══ */}
        {data.warrantyText ? (
          <div data-pdf-atomic style={{ marginTop: 7, border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden", ...NO_BREAK }}>
            <SectionHead title="Warranty Information" />
            <div style={{ padding: "5px 12px" }}>
              <WarrantyBlock text={data.warrantyText} />
            </div>
          </div>
        ) : null}

        {/* ══ SIGNATURES ══ */}
        <div data-pdf-atomic data-pdf-keep-with-next style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 8, marginBottom: 5, breakBefore: "avoid", pageBreakBefore: "avoid", ...NO_BREAK }}>
          <div>
            <div style={{ borderBottom: `1px solid ${BRAND.slate}`, height: 20 }} />
            <div style={{ fontSize: 9, color: BRAND.slate, marginTop: 3 }}>Customer Confirmation</div>
          </div>
          <div>
            <div style={{ borderBottom: `1px solid ${BRAND.slate}`, height: 20 }} />
            <div style={{ fontSize: 9, color: BRAND.slate, marginTop: 3 }}>
              Authorized Signatory{t.technician ? ` (${t.technician})` : ` (On Behalf of ${store.storeName})`}
            </div>
          </div>
        </div>
      </div>

      {/* ══ FOOTER (flush to bottom) — kept with the signatures on the final page ══ */}
      <footer data-pdf-atomic style={{ backgroundColor: BRAND.blue, color: BRAND.white, textAlign: "center", padding: "5px 12px", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, breakBefore: "avoid", pageBreakBefore: "avoid", ...NO_BREAK }}>
        {data.printFooter || "Thank you for choosing RepairOX!"}
      </footer>
    </div>
  );
}

/* ─── Ticket sub-helpers ─────────────────────────────────────────────── */

function thStyle(align: "left" | "center" | "right"): React.CSSProperties {
  return {
    textAlign: align,
    padding: "6px 5px",
    fontSize: 8,
    fontWeight: 800,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    borderRight: "1px solid rgba(255,255,255,0.18)",
    whiteSpace: "nowrap",
    overflow: "hidden",
  };
}

function tdStyle(align: "left" | "center" | "right"): React.CSSProperties {
  return {
    textAlign: align,
    padding: "5px 7px",
    fontSize: 9.5,
    lineHeight: 1.3,
    color: BRAND.ink,
    borderTop: `1px solid ${BRAND.borderSoft}`,
    borderRight: `1px solid ${BRAND.borderSoft}`,
    // Numeric columns (right/center aligned) must never wrap mid-number.
    whiteSpace: align === "left" ? "normal" : "nowrap",
    overflowWrap: align === "left" ? "break-word" : "normal",
    wordBreak: "normal",
  };
}

function SummaryRow({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: strong ? 11 : 10, fontWeight: strong ? 800 : 500, color: accent ? BRAND.blue : BRAND.slate }}>{label}</span>
      <span style={{ fontSize: strong ? 11.5 : 10, fontWeight: strong ? 800 : 600, color: accent ? BRAND.blue : BRAND.navy }}>{value}</span>
    </div>
  );
}

/** Splits a numbered/multiline terms block into two balanced, compact columns. */
function TwoColList({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const mid = Math.ceil(lines.length / 2);
  const cols = [lines.slice(0, mid), lines.slice(mid)];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
      {cols.map((col, ci) => (
        <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {col.map((line, li) => (
            <div key={li} style={{ fontSize: 8.8, color: BRAND.slate, lineHeight: 1.35 }}>{line}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Warranty block — parses the configured warranty text into labelled groups
 * (e.g. "WARRANTY COVERAGE", "CLAIM PROCEDURE", "WARRANTY IS VOID IF") and lays
 * the first groups side-by-side across two columns to save vertical space.
 * Preserves all original text; only reorganizes it horizontally.
 */
function WarrantyBlock({ text }: { text: string }) {
  type Group = { heading?: string; items: string[] };
  const groups: Group[] = [];
  let current: Group | null = null;

  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    // A heading is a non-bullet line ending with ":" (e.g. "CLAIM PROCEDURE:")
    const isHeading = /:$/.test(line) && !/^[-*•]/.test(line);
    if (isHeading) {
      current = { heading: line.replace(/:$/, ""), items: [] };
      groups.push(current);
    } else {
      const item = line.replace(/^[-*•]\s*/, "");
      if (!current) {
        current = { items: [] };
        groups.push(current);
      }
      current.items.push(item);
    }
  });

  // If parsing produced no headings, fall back to a simple 2-column list.
  const hasHeadings = groups.some((g) => g.heading);
  if (!hasHeadings) {
    return <TwoColList text={text} />;
  }

  const GroupView = ({ g }: { g: Group }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {g.heading ? (
        <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: BRAND.blue }}>{g.heading}</div>
      ) : null}
      {g.items.map((it, i) => (
        <div key={i} style={{ fontSize: 8.8, color: BRAND.slate, lineHeight: 1.35, display: "flex", gap: 4 }}>
          <span style={{ color: BRAND.blue, flexShrink: 0 }}>•</span>
          <span style={{ wordBreak: "break-word" }}>{it}</span>
        </div>
      ))}
    </div>
  );

  // Lay all groups across a horizontal grid so the third group
  // (e.g. "WARRANTY IS VOID IF") uses the unused right-side space instead of
  // stacking vertically. Columns adapt to the number of groups (max 3).
  const cols = Math.min(groups.length, 3) || 1;

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "6px 18px", alignItems: "start" }}>
      {groups.map((g, i) => (
        <GroupView key={i} g={g} />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   INVOICE — SAME RepairOX blue A4 template as the Ticket Service Report,
   populated with Invoice data + calculations. "Ticket template + Invoice data."
   ═══════════════════════════════════════════════════════════════════════ */

const INVOICE_STATUS_STYLE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  paid: { label: "Paid", bg: "#DCFCE7", color: "#166534", border: "#86EFAC" },
  overdue: { label: "Overdue", bg: "#FEF2F2", color: "#991B1B", border: "#FCA5A5" },
  partial: { label: "Partial", bg: "#FFFBEB", color: "#92400E", border: "#FCD34D" },
  due: { label: "Due", bg: "#FFFBEB", color: "#92400E", border: "#FCD34D" },
};

function InvoiceA4({ data }: { data: PrintDocumentData }) {
  const { store, customer, invoice, printTitle } = data;
  const inv = invoice!;

  const isBusiness = inv.invoiceType === "business";
  const createdDate = formatPrintDate(inv.createdAt);
  const createdTime = formatPrintTime(inv.createdAt);
  const statusInfo = INVOICE_STATUS_STYLE[inv.status] || INVOICE_STATUS_STYLE.due;

  // GST is shown only when tax is actually applied.
  const sgst = inv.sgst || 0;
  const cgst = inv.cgst || 0;
  const gstOn = sgst > 0 || cgst > 0 || (inv.tax || 0) > 0;

  /* ── Build itemized rows (mirrors the ticket table structure) ──
     Multi-device invoices → one row per device (details in Description) plus a
     row per part. Flat invoices → one row per line item. */
  type Row = {
    idx: number;
    name: string;
    tag?: string;
    descLines: { label?: string; value: string }[];
    qty: number;
    price: number;
    discount: number;
    tax: number;
    total: number;
  };
  const rows: Row[] = [];
  let rowNo = 0;

  if (inv.devices && inv.devices.length > 0) {
    inv.devices.forEach((dev) => {
      const deviceLabel = [dev.brand, dev.model].filter(Boolean).join(" ") || "Device";
      const partsSum = (dev.parts || []).reduce((s, p) => s + p.total, 0);
      const deviceLine = Math.max((dev.subtotal || 0) - partsSum, 0);

      const descLines: Row["descLines"] = [];
      if (dev.brand) descLines.push({ label: "Brand", value: dev.brand });
      if (dev.model) descLines.push({ label: "Model", value: dev.model });
      if (dev.serial) descLines.push({ label: "IMEI / Serial", value: dev.serial });
      if (dev.issue) descLines.push({ label: "Issue", value: dev.issue });
      if (dev.jobType) descLines.push({ label: "Job", value: dev.jobType });
      if (dev.technician) descLines.push({ label: "Technician", value: dev.technician });
      if (dev.priority && dev.priority !== "normal") descLines.push({ label: "Priority", value: String(dev.priority).replace(/_/g, " ") });
      if (dev.warrantyValue || dev.warranty) descLines.push({ label: "Warranty", value: formatWarranty(dev.warrantyValue, dev.warrantyUnit, dev.warranty) });
      if (dev.notes) descLines.push({ label: "Notes", value: dev.notes });

      rowNo += 1;
      rows.push({ idx: rowNo, name: deviceLabel, tag: dev.jobType ? String(dev.jobType).toUpperCase() : undefined, descLines, qty: 1, price: deviceLine, discount: 0, tax: 0, total: deviceLine });

      (dev.parts || []).forEach((p: PrintLineItem) => {
        rowNo += 1;
        rows.push({ idx: rowNo, name: p.name, descLines: p.description ? [{ value: p.description }] : [], qty: p.qty, price: p.price, discount: p.discount || 0, tax: 0, total: p.total });
      });
    });
  } else {
    inv.items.forEach((item) => {
      rowNo += 1;
      rows.push({ idx: rowNo, name: item.name, descLines: item.description ? [{ value: item.description }] : [], qty: item.qty, price: item.price, discount: item.discount || 0, tax: 0, total: item.total });
    });
  }

  const gstHeader = gstOn ? `CGST ${inv.cgstRate ?? 0}%` : "TAX";
  const priceHeader = `PRICE`;

  const invoiceTypeLabel =
    inv.serviceCategory === "accessories" ? "Accessories Invoice" : isBusiness ? "Tax Invoice" : "Retail Invoice";

  return (
    <div
      className="a4-page"
      style={{
        width: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        backgroundColor: BRAND.white,
        color: BRAND.navy,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize: 11,
        lineHeight: 1.4,
        boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="ticket-print-body" style={{ padding: "9mm 12mm 2mm", flex: 1 }}>
        {/* ══ HEADER ══ */}
        <header data-pdf-atomic style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, paddingBottom: 10, borderBottom: `2px solid ${BRAND.blue}` }}>
          {/* LEFT: store branding */}
          <div style={{ display: "flex", gap: 13, alignItems: "flex-start", maxWidth: "58%" }}>
            {store.logo ? (
              <img src={store.logo} alt="Logo" style={{ height: 56, width: 56, objectFit: "contain" }} />
            ) : null}
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.blue, lineHeight: 1.1 }}>{store.storeName}</div>
              {store.alternateName ? (
                <div style={{ fontSize: 9, color: BRAND.slateLight, fontWeight: 600 }}>{store.alternateName}</div>
              ) : null}
              <div style={{ marginTop: 5, fontSize: 9.5, color: BRAND.slate, display: "flex", flexDirection: "column", gap: 1.5 }}>
                {store.fullAddress ? <span>{store.fullAddress}</span> : null}
                {store.phone ? <span>{store.phone}{store.mobile && store.mobile !== store.phone ? ` · ${store.mobile}` : ""}</span> : null}
                {store.email ? <span>{store.email}</span> : null}
                {store.website ? <span style={{ color: BRAND.blue, fontWeight: 600 }}>{store.website}</span> : null}
              </div>
              {(store.registrationNumber || store.hsnCode) ? (
                <div style={{ marginTop: 5, fontSize: 9, fontWeight: 700, color: BRAND.navy, display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {store.registrationNumber ? <span>GSTIN: {store.registrationNumber}</span> : null}
                  {store.hsnCode ? <span>HSN CODE: {store.hsnCode}</span> : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* RIGHT: invoice identity — pills sit side-by-side on the date row
              to use horizontal space and keep the header compact. */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5, color: BRAND.navy, textTransform: "uppercase" }}>{printTitle}</div>
            {/* Date/time  +  [Retail/Business] [Status] — one horizontal row */}
            <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: "4px 8px", fontSize: 9, color: BRAND.slate }}>
              <span>{createdDate} · {createdTime}</span>
              <span style={{ display: "inline-flex", gap: 6 }}>
                <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", backgroundColor: isBusiness ? "#FEF3C7" : BRAND.band, color: isBusiness ? "#92400E" : BRAND.blue, border: `1px solid ${isBusiness ? "#FCD34D" : BRAND.border}` }}>
                  {isBusiness ? "Business / GST" : "Retail"}
                </span>
                <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 4, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", backgroundColor: statusInfo.bg, color: statusInfo.color, border: `1px solid ${statusInfo.border}` }}>
                  {statusInfo.label}
                </span>
              </span>
            </div>
            <div style={{ marginTop: 6, backgroundColor: BRAND.blue, color: BRAND.white, borderRadius: 8, padding: "6px 14px", display: "inline-block", textAlign: "left", minWidth: 150 }}>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.85 }}>Invoice Number</div>
              <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>{inv.invoiceId}</div>
            </div>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
              <Barcode value={inv.invoiceId} />
              <div style={{ fontSize: 9, fontWeight: 600, color: BRAND.navy, letterSpacing: 1 }}>{inv.invoiceId}</div>
            </div>
          </div>
        </header>

        {/* ══ CUSTOMER + INVOICE INFO ══ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 10, marginTop: 7 }}>
          {/* CUSTOMER DETAILS */}
          <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden" }}>
            <SectionHead title="Customer Details" />
            <div style={{ padding: "7px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
              <Field label="Name" value={customer.name} />
              {customer.company ? <Field label="Company" value={customer.company} /> : null}
              {customer.phone ? <Field label="Phone" value={customer.phone} /> : null}
              {customer.email ? <Field label="Email" value={customer.email} /> : null}
              {customer.address ? <Field label="Address" value={customer.address} /> : null}
              {isBusiness && inv.gstNumber ? <Field label="GST Number" value={inv.gstNumber} mono /> : null}
            </div>
          </div>

          {/* INVOICE INFORMATION */}
          <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden" }}>
            <SectionHead title="Invoice Information" />
            <div style={{ padding: "7px 10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" }}>
              <Field label="Invoice Number" value={inv.invoiceId} />
              <Field label="Invoice Date" value={`${createdDate} (${createdTime})`} />
              <Field label="Due Date" value={inv.dueDate ? formatPrintDate(inv.dueDate) : "—"} />
              <Field label="Type" value={invoiceTypeLabel} />
              <Field label="Category" value={inv.serviceCategory || "service"} />
              <Field label="Status" value={statusInfo.label} />
              {inv.paymentMode ? <Field label="Payment Mode" value={inv.paymentMode.replace(/_/g, " ")} /> : null}
              {inv.employee ? <Field label="Salesperson" value={inv.employee} /> : null}
              {inv.reference ? <Field label="Reference / PO" value={inv.reference} /> : null}
              {inv.ticketId ? <Field label="Ticket Number" value={inv.ticketId} /> : null}
            </div>
          </div>
        </div>

        {/* ══ ITEM / SERVICE TABLE ══ */}
        <div style={{ marginTop: 7, border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: 10 }}>
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "35%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: BRAND.blue, color: BRAND.white }}>
                <th style={thStyle("center")}>#</th>
                <th style={thStyle("left")}>Item / Service</th>
                <th style={thStyle("left")}>Description</th>
                <th style={thStyle("center")}>Qty</th>
                <th style={thStyle("right")}>{priceHeader}</th>
                <th style={thStyle("right")}>Disc.</th>
                <th style={thStyle("right")}>{gstHeader}</th>
                <th style={thStyle("right")}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} data-pdf-atomic style={{ backgroundColor: i % 2 === 1 ? BRAND.bandSoft : BRAND.white, verticalAlign: "top", ...NO_BREAK }}>
                  <td style={tdStyle("center")}>{r.idx}</td>
                  <td style={tdStyle("left")}>
                    <div style={{ fontWeight: 700, color: BRAND.navy }}>{r.name}</div>
                    {r.tag ? <div style={{ fontSize: 9, fontWeight: 700, color: BRAND.blue, marginTop: 2 }}>{r.tag}</div> : null}
                  </td>
                  <td style={tdStyle("left")}>
                    {r.descLines.length > 0 ? (
                      <div
                        style={
                          r.descLines.length > 3
                            ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5px 14px" }
                            : { display: "flex", flexDirection: "column", gap: 1.5 }
                        }
                      >
                        {r.descLines.map((d, di) => (
                          <div key={di} style={{ fontSize: 9.3, color: BRAND.ink, lineHeight: 1.35 }}>
                            {d.label ? <span style={{ fontWeight: 700, color: BRAND.navy }}>{d.label}: </span> : null}
                            <span>{d.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: BRAND.slateLight }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle("center")}>{r.qty}</td>
                  <td style={tdStyle("right")}>{formatPrintCurrency(r.price)}</td>
                  <td style={tdStyle("right")}>{r.discount > 0 ? formatPrintCurrency(r.discount) : formatPrintCurrency(0)}</td>
                  <td style={tdStyle("right")}>{formatPrintCurrency(r.tax)}</td>
                  <td style={{ ...tdStyle("right"), fontWeight: 800, color: BRAND.navy }}>{formatPrintCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ══ PAYMENT DETAILS + PRICE BREAKDOWN (side-by-side) ══ */}
        <div data-pdf-atomic style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 10, marginTop: 7, alignItems: "stretch", ...NO_BREAK }}>
          {/* LEFT: payment / supporting info */}
          <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <SectionHead title="Payment Details" />
            <div style={{ padding: "7px 12px", display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
                <span style={{ fontSize: 9.5, color: BRAND.slate }}>
                  <span style={{ fontWeight: 700, color: BRAND.navy }}>Line Items: </span>{rows.length}
                </span>
                {inv.paymentMode ? (
                  <span style={{ fontSize: 9.5, color: BRAND.slate }}>
                    <span style={{ fontWeight: 700, color: BRAND.navy }}>Mode: </span>{inv.paymentMode.replace(/_/g, " ")}
                  </span>
                ) : null}
                <span style={{ fontSize: 9.5, color: BRAND.slate }}>
                  <span style={{ fontWeight: 700, color: BRAND.navy }}>Status: </span>{statusInfo.label}
                </span>
                {inv.ticketId ? (
                  <span style={{ fontSize: 9.5, color: BRAND.slate }}>
                    <span style={{ fontWeight: 700, color: BRAND.navy }}>Ticket: </span>{inv.ticketId}
                  </span>
                ) : null}
              </div>
              {/* Per-device recap when multi-device */}
              {inv.devices && inv.devices.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 2.5, borderTop: `1px solid ${BRAND.borderSoft}`, paddingTop: 5 }}>
                  {inv.devices.map((dev, di) => {
                    const name = [dev.brand, dev.model].filter(Boolean).join(" ") || "Device";
                    const bits = [
                      dev.serial ? `IMEI ${dev.serial}` : "",
                      dev.warrantyValue || dev.warranty ? formatWarranty(dev.warrantyValue, dev.warrantyUnit, dev.warranty) : "",
                    ].filter(Boolean);
                    return (
                      <div key={dev.id || di} style={{ fontSize: 9, color: BRAND.slate, lineHeight: 1.35 }}>
                        <span style={{ fontWeight: 700, color: BRAND.navy }}>{name}</span>
                        {bits.length ? <span> — {bits.join(" · ")}</span> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {inv.notes ? (
                <div style={{ fontSize: 9, color: BRAND.slate, borderTop: `1px solid ${BRAND.borderSoft}`, paddingTop: 5 }}>
                  <span style={{ fontWeight: 700, color: BRAND.navy }}>Notes: </span>{inv.notes}
                </div>
              ) : null}
            </div>
          </div>

          {/* RIGHT: Price Breakdown */}
          <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "9px 12px", display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
              <SummaryRow label="Sub Total" value={formatPrintCurrency(inv.subtotal)} />
              <SummaryRow label="Discount" value={inv.discount > 0 ? `-${formatPrintCurrency(inv.discount)}` : formatPrintCurrency(0)} />
              {gstOn ? (
                sgst > 0 || cgst > 0 ? (
                  <>
                    <SummaryRow label={`SGST @${inv.sgstRate ?? 0}%`} value={formatPrintCurrency(sgst)} />
                    <SummaryRow label={`CGST @${inv.cgstRate ?? 0}%`} value={formatPrintCurrency(cgst)} />
                  </>
                ) : (
                  <SummaryRow label="Tax (GST)" value={formatPrintCurrency(inv.tax)} />
                )
              ) : null}
              <div style={{ borderTop: `1px dashed ${BRAND.border}`, margin: "2px 0" }} />
              <SummaryRow label="Total" value={formatPrintCurrency(inv.total)} strong accent />
              <SummaryRow label="Total Paid" value={formatPrintCurrency(inv.paidAmount)} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: BRAND.band, borderTop: `1px solid ${BRAND.border}`, padding: "8px 12px" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: BRAND.navy }}>Balance Due</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: BRAND.blue }}>{formatPrintCurrency(inv.balance)}</span>
            </div>
          </div>
        </div>

        {/* ══ TERMS & CONDITIONS ══ (invoice-specific terms take precedence) */}
        {inv.terms || data.termsAndConditions ? (
          <div data-pdf-atomic style={{ marginTop: 7, border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden", ...NO_BREAK }}>
            <SectionHead title="Terms & Conditions" />
            <div style={{ padding: "5px 12px" }}>
              <TwoColList text={inv.terms || data.termsAndConditions} />
            </div>
          </div>
        ) : null}

        {/* ══ WARRANTY INFORMATION ══ */}
        {data.warrantyText ? (
          <div data-pdf-atomic style={{ marginTop: 7, border: `1px solid ${BRAND.border}`, borderRadius: 8, overflow: "hidden", ...NO_BREAK }}>
            <SectionHead title="Warranty Information" />
            <div style={{ padding: "5px 12px" }}>
              <WarrantyBlock text={data.warrantyText} />
            </div>
          </div>
        ) : null}

        {/* ══ SIGNATURES ══ */}
        <div data-pdf-atomic data-pdf-keep-with-next style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 8, marginBottom: 5, breakBefore: "avoid", pageBreakBefore: "avoid", ...NO_BREAK }}>
          <div>
            <div style={{ borderBottom: `1px solid ${BRAND.slate}`, height: 20 }} />
            <div style={{ fontSize: 9, color: BRAND.slate, marginTop: 3 }}>Customer Confirmation</div>
          </div>
          <div>
            <div style={{ borderBottom: `1px solid ${BRAND.slate}`, height: 20 }} />
            <div style={{ fontSize: 9, color: BRAND.slate, marginTop: 3 }}>
              Authorized Signatory{inv.employee ? ` (${inv.employee})` : ` (On Behalf of ${store.storeName})`}
            </div>
          </div>
        </div>
      </div>

      {/* ══ FOOTER (flush to bottom) ══ */}
      <footer data-pdf-atomic style={{ backgroundColor: BRAND.blue, color: BRAND.white, textAlign: "center", padding: "5px 12px", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, breakBefore: "avoid", pageBreakBefore: "avoid", ...NO_BREAK }}>
        {inv.footer || data.printFooter || "Thank you for choosing RepairOX!"}
      </footer>
    </div>
  );
}
