/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Export (CSV + branded Print / PDF)
   ──────────────────────────────────────────────────────────────────────────
   • CSV / Excel-compatible export via the shared csv-utils.
   • Branded print document (company logo + details, report name, date range,
     filters used, KPI summary, tables, totals, generated-by + timestamp).
     Users "Save as PDF" from the browser print dialog — no server needed.
   Company details come from the live organization settings, so exports always
   carry the current shop's identity.
   ────────────────────────────────────────────────────────────────────────── */

import { toCSV, downloadCSV } from "@/lib/csv-utils";

export interface CompanyInfo {
  name: string;
  logo?: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  website?: string;
  gst?: string;
}

export interface ExportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  /** Optional totals row appended to the bottom. */
  totals?: (string | number)[];
}

export interface ReportExportPayload {
  reportName: string;
  dateRangeLabel: string;
  filtersUsed: { label: string; value: string }[];
  generatedBy: string;
  /** KPI summary chips. */
  summary?: { label: string; value: string }[];
  tables: ExportTable[];
}

/* ─── CSV ───────────────────────────────────────────────────────────────── */

export function exportTablesCSV(filename: string, tables: ExportTable[]) {
  const blocks: string[] = [];
  for (const t of tables) {
    const rows = [...t.rows];
    if (t.totals) rows.push(t.totals);
    blocks.push(`${t.title}\n${toCSV(t.columns, rows)}`);
  }
  downloadCSV(filename, blocks.join("\n\n"));
}

export function exportSingleCSV(
  filename: string,
  columns: string[],
  rows: (string | number)[][]
) {
  downloadCSV(filename, toCSV(columns, rows));
}

/* ─── Print / PDF ───────────────────────────────────────────────────────── */

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tableHtml(t: ExportTable): string {
  const head = t.columns.map((c) => `<th>${esc(c)}</th>`).join("");
  const body = t.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("");
  const totals = t.totals
    ? `<tr class="totals">${t.totals.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`
    : "";
  return `
    <section class="block">
      <h2>${esc(t.title)}</h2>
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}${totals}</tbody>
      </table>
    </section>`;
}

export function printReport(company: CompanyInfo, payload: ReportExportPayload) {
  if (typeof window === "undefined") return;
  const win = window.open("", "_blank", "width=1024,height=768");
  if (!win) return;

  const now = new Date();
  const stamp = now.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  const summaryHtml = payload.summary?.length
    ? `<div class="summary">${payload.summary
        .map((s) => `<div class="kpi"><span>${esc(s.label)}</span><strong>${esc(s.value)}</strong></div>`)
        .join("")}</div>`
    : "";

  const filtersHtml = payload.filtersUsed.length
    ? `<div class="filters"><strong>Filters:</strong> ${payload.filtersUsed
        .map((f) => `${esc(f.label)}: <em>${esc(f.value)}</em>`)
        .join(" &nbsp;•&nbsp; ")}</div>`
    : "";

  const addr = [company.address, company.city, company.state].filter(Boolean).join(", ");

  win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
  <title>${esc(payload.reportName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #111827; margin: 32px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4361EE; padding-bottom: 14px; margin-bottom: 18px; }
    .brand { display: flex; gap: 12px; align-items: center; }
    .brand img { height: 44px; width: auto; object-fit: contain; }
    .brand h1 { font-size: 18px; margin: 0; }
    .brand p { font-size: 11px; color: #6b7280; margin: 2px 0 0; }
    .meta { text-align: right; font-size: 11px; color: #6b7280; }
    .meta .rn { font-size: 15px; font-weight: 700; color: #111827; }
    .filters { font-size: 11px; color: #374151; margin: 10px 0 4px; background:#f3f4f6; padding:8px 10px; border-radius:8px; }
    .summary { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; }
    .kpi { border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 12px; min-width: 140px; }
    .kpi span { display:block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; }
    .kpi strong { font-size: 16px; }
    .block { margin-top: 18px; page-break-inside: avoid; }
    h2 { font-size: 13px; margin: 0 0 8px; color: #4361EE; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eef0f4; }
    th { background: #f8fafc; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; color: #6b7280; }
    tr.totals td { font-weight: 700; border-top: 2px solid #cbd5e1; }
    .footer { margin-top: 26px; border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 10px; color: #9ca3af; display:flex; justify-content: space-between; }
    @media print { body { margin: 12mm; } }
  </style></head><body>
    <div class="header">
      <div class="brand">
        ${company.logo ? `<img src="${esc(company.logo)}" alt="logo"/>` : ""}
        <div>
          <h1>${esc(company.name)}</h1>
          <p>${esc(addr)}</p>
          <p>${[company.phone, company.email, company.website].filter(Boolean).map(esc).join(" • ")}</p>
          ${company.gst ? `<p>GSTIN: ${esc(company.gst)}</p>` : ""}
        </div>
      </div>
      <div class="meta">
        <div class="rn">${esc(payload.reportName)}</div>
        <div>${esc(payload.dateRangeLabel)}</div>
        <div>Generated by ${esc(payload.generatedBy)}</div>
        <div>${esc(stamp)}</div>
      </div>
    </div>
    ${filtersHtml}
    ${summaryHtml}
    ${payload.tables.map(tableHtml).join("")}
    <div class="footer">
      <span>${esc(company.name)} — Business Intelligence Report</span>
      <span>Generated ${esc(stamp)}</span>
    </div>
    <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
  </body></html>`);
  win.document.close();
}
