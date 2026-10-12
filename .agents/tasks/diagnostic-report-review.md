# Ticket Diagnostic Report — post-QC device-condition document

The change adds a "Diagnostic Report" quick action to the ticket menus. It opens a dedicated full-page entry screen that shows the real ticket number, customer and device details read-only and offers one editable "Device Condition" textarea. Pressing Create records a lightweight localStorage marker and opens the shared A4 print preview in a new `diagnostic` mode that reuses the existing ticket Service Report layout but omits Terms & Warranty and adds a highlighted "QC Failed" banner plus a highlighted "Device Condition" box carrying the typed comment. The comment is never persisted — it travels only in the print URL query string.

Watch for: nothing blocking. The comment is non-recoverable once the print tab closes (by design, "store nothing"), and a very long comment would ride in the URL; both are acceptable per the plan and requirements. (confirmed)

**Verdict**: APPROVED

## High-level view

Real-data sourcing is correct everywhere. The entry page resolves the ticket from `useStore().tickets` and renders `ticket.ticketNo`, `ticket.customer`, and `getTicketDevices(ticket)` — the same canonical helpers the rest of the app uses — with a proper "Ticket Not Found" state. The print path resolves the same real ticket and builds its data through the shared `buildStoreInfo` / `buildCustomerFromTicket` / `buildTicketInfo` builders. No fabricated sample data anywhere.

No DB persistence of the comment. There is no migration, no new column, no store mutation touching the comment. The comment flows entry page → URL query param → print route → A4 only. The sole persisted artifact is a localStorage marker that records only `{ ticketId, generatedAt }` — never the comment text — exactly as required for the "mention" feature.

The A4 document is a mode on the shared template, not a fork. `TicketServiceReport` reads an optional `data.diagnostic` and conditionally renders the highlighted QC Failed banner and Device Condition box while suppressing Terms and Warranty with `!diagnostic` guards. `QuotationA4` and `InvoiceA4` and the `A4Template` router are untouched, so ticket and quotation print are unaffected.

Permission gating reuses `allow(can, CAP.ticket.print)` in both menus and on the entry page; no new permission key was introduced. The menu item is also correctly hidden for estimates.

End-to-end wiring is sound and the type-check passes clean.

<details>
<summary>Issues (0)</summary>

No actionable issues. The two notes below (comment non-recoverability, long comment in URL) are documented, intended trade-offs, not defects.

</details>

<details>
<summary>Details</summary>

### Real-data sourcing (requirement 1)

The entry page (`src/app/(app)/tickets/[id]/diagnostic-report/page.tsx`) resolves `ticket = tickets.find(t => t.id === ticketId)` from `useStore()` and renders `ticket.ticketNo ?? ticket.id`, `ticket.customer`, optional `ticket.phone`/`ticket.email`, and iterates `getTicketDevices(ticket)` for brand/model/identifier (via `identifierDisplayLabel`)/colour/issue/technician. A missing ticket yields a dedicated "Ticket Not Found" screen rather than fabricated content.

The print builder `buildDiagnosticReportPrintData(settings, ticket, comment)` composes `buildStoreInfo(settings)`, `buildCustomerFromTicket(ticket)`, and `buildTicketInfo(ticket)` — the identical real-data builders used by the normal ticket print. Nothing is hard-coded. (confirmed)

### No DB persistence (requirement 2)

The diagnostic comment is never written to a store or database. `buildDiagnosticReportPrintData` takes the comment as an argument (sourced from the URL), and `getDiagnosticReportPrintUrl` encodes it into `/print/diagnostic/<id>?format=a4&comment=<encoded>`. The print route reads it back with `getCommentFromUrl()` into local component state. No migration or column was added. The `use-diagnostic-report` hook persists only `{ ticketId, generatedAt }` to `localStorage` under `repairox-diagnostic-reports` — explicitly never the comment content. (confirmed)

### Shared A4 template reuse (requirement 3)

`src/components/print/a4-template.tsx` adds `const diagnostic = data.diagnostic;` inside the existing `TicketServiceReport`. When set, it renders a full-width rose banner (`#FEF2F2` background, `BRAND.rose` border, a solid rose "QC Failed" badge) below the header, and after the device table a highlighted "Device Condition" box (rose header strip, `#FFF7F7` body, `whiteSpace: pre-wrap` for the typed comment, `—` fallback). The existing Terms and Warranty blocks are guarded with `{!diagnostic && …}`. The `printTitle` ("Diagnostic Report") drives the header heading via the existing `{printTitle}` slot. The `A4Template` router still dispatches diagnostic data into `TicketServiceReport` because `data.ticket` is set. `QuotationA4`/`InvoiceA4` terms rendering (lines ~1129/1139) is unchanged. (confirmed)

### Permission gating (requirement 4)

The list menu (`ticket-actions-menu.tsx`) renders the Diagnostic Report `MenuItem` only under `canPrint && !estimate`, where `canPrint = allow(can, CAP.ticket.print)`. The View Ticket header dropdown gates it with `canPrintTicket && !estimate` (`canPrintTicket = allow(can, CAP.ticket.print)`). The entry page itself computes `canCreate = allow(can, CAP.ticket.print)` and renders a "Not Allowed" state otherwise. No new permission key was invented. (confirmed)

### End-to-end wiring (requirement 5)

Dropdown action `"diagnostic-report"` is added to the `TicketAction` union; the list page `handleAction` maps it to `router.push(/tickets/<id>/diagnostic-report)`; the entry page's Create button calls `markDiagnosticReportGenerated(ticket.id)` then `router.push(getDiagnosticReportPrintUrl(ticket.id, comment))`; the print route handles `docType === "diagnostic"` (A4-only, format-reset effect) and renders the A4 diagnostic variant; View Ticket shows a read-only "Diagnostic Report generated" pill when `diagHydrated && hasReport(ticket.id)`, linking back to re-open the entry page. The chain is complete. (confirmed)

### Regression safety (requirement 6)

The print route's branch order (`isDiagnostic` → `isTicket` → `isQuotation` → invoice) and the format-reset effect only extend behavior with `isDiagnostic`; ticket/quotation/invoice paths are untouched. The A4 template changes are confined to `TicketServiceReport` behind `diagnostic` guards. `npx tsc --noEmit` run as a narrow confirmation returned exit 0 with no errors, corroborating type-level soundness of the ticket/quotation/invoice paths. (confirmed)

</details>

<details>
<summary>File map</summary>

- `src/app/(app)/tickets/[id]/diagnostic-report/page.tsx` — new entry page (real ticket identity + device details read-only, Device Condition textarea, permission + not-found states, Create → marker + print URL).
- `src/app/(app)/tickets/[id]/page.tsx` — View Ticket: `useDiagnosticReport` wiring, "Diagnostic Report generated" mention pill, header-dropdown entry.
- `src/app/(app)/tickets/page.tsx` — list `handleAction` routes `diagnostic-report` to the entry page.
- `src/app/print/[type]/[id]/page.tsx` — new `diagnostic` docType, `getCommentFromUrl`, A4-only selector/reset.
- `src/components/print/a4-template.tsx` — diagnostic mode in `TicketServiceReport`: QC Failed banner, Device Condition box, Terms/Warranty suppression.
- `src/components/tickets/ticket-actions-menu.tsx` — `diagnostic-report` action + gated menu item (not for estimates).
- `src/hooks/use-diagnostic-report.ts` — new localStorage-per-ticket marker hook (no comment content stored).
- `src/lib/print-utils.ts` — `diagnostic` field on `PrintDocumentData`, `buildDiagnosticReportPrintData`, `getDiagnosticReportPrintUrl`, `"diagnostic"` doc type.

Full diff: commit `a82b64a`.

</details>
