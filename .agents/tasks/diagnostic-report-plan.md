# Implementation Plan — Ticket "Diagnostic Report" feature

## Context & design decisions (grounded in the codebase)

Confirmed facts from reading the code:

- **Quick-action dropdown**: `src/components/tickets/ticket-actions-menu.tsx` exports a
  `TicketAction` union and renders `Dropdown`/`MenuItem`s that call
  `onAction(action, ticket)`. The parent owns navigation.
- **Parents** rendering `TicketActionsMenu` + implementing `onAction`:
  - `src/app/(app)/tickets/page.tsx` — `handleAction` (line ~657). Navigation is done
    with `router.push(...)`; print-preview does `router.push('/print/ticket/<id>?format=a4')`.
  - The View Ticket detail page `src/app/(app)/tickets/[id]/page.tsx` does NOT use
    `TicketActionsMenu`; it has its own header "More actions" `Dropdown` with Print A4 /
    Thermal / Label `MenuItem`s (around line ~630-655). We add the entry here too, and
    the "Diagnostic Report generated" mention in this page.
- **Routes** (confirmed via `find`): `src/app/(app)/tickets/[id]/page.tsx` (View Ticket),
  `src/app/(app)/tickets/page.tsx` (list), `src/app/(app)/tickets/warranty/page.tsx`.
  So a `tickets/[id]` segment EXISTS — the new entry page goes at
  `src/app/(app)/tickets/[id]/diagnostic-report/page.tsx` (inherits the `(app)` app shell).
- **Print route** `src/app/print/[type]/[id]/page.tsx` is OUTSIDE `(app)` (no app shell —
  correct for a printable doc). It reads `docType = params.type`, handles `"ticket"`,
  `"quotation"`, else invoice. It builds `printData` via `buildTicketPrintData` /
  `buildQuotationPrintData` / `buildInvoicePrintData` and renders `<A4Template data=.../>`.
  Format + `auto` are read from the query string with `URLSearchParams`.
- **Print data/URLs** `src/lib/print-utils.ts`: `PrintDocumentData` is the shared shape;
  `buildTicketPrintData(settings, ticket)` sets `termsAndConditions: settings.ticketTerms`.
  URL builders: `getTicketPrintUrl`, `getInvoicePrintUrl`, `getQuotationPrintUrl`.
- **A4 template** `src/components/print/a4-template.tsx`: `A4Template` routes on
  `data.ticket` → `TicketServiceReport`, `data.quotation` → `QuotationA4`, else `InvoiceA4`.
  `TicketServiceReport` already builds a per-device **"QC — Failed"** red band
  (`#FEF2F2`/`#B91C1C`) from `dev.failedQC`, renders Terms via
  `{data.termsAndConditions ? ...SectionHead "Terms & Conditions"... }`, and uses the
  shared `BRAND` palette (`BRAND.rose = #BE123C`, `BRAND.band`, etc.) + `SectionHead` helper.
- **localStorage per-id hook pattern**: `src/hooks/use-lead-temperature.ts` is the
  canonical lightweight, non-DB, per-id localStorage history hook (SSR-safe `readAll`/
  `writeAll`, a `SYNC_EVENT` CustomEvent for same-tab sync + a `storage` listener for
  cross-tab, `hydrated` flag). We mirror this exact pattern for the diagnostic marker.
- **Permissions**: `usePermissions().can` + `allow(can, CAP.ticket.print)` already gates
  all print actions in both menus. Reuse it — **do NOT add a new permission key.**

### Decisions

1. **Comment flow (no persistence)**: entry page → URL query param → print route → A4.
   The entry page opens `/print/diagnostic/<ticketId>?format=a4&comment=<encoded>` (and we
   also set the localStorage marker at that moment). The print route reads `comment` from
   the query string (same `URLSearchParams` approach the route already uses for `format`).
   This satisfies "store nothing" — the comment lives only in the URL + rendered document.
   (`auto=1` is intentionally NOT added so the user previews before printing, matching
   `print-preview`.)

2. **A4 diagnostic variant = a mode flag on the shared data, not a forked template.**
   Add an optional `diagnostic?: { comment: string }` field to `PrintDocumentData`. In
   `TicketServiceReport`, when `data.diagnostic` is present: (a) suppress the Terms &
   Conditions block, (b) suppress Warranty Information block, (c) render a highlighted
   "QC FAILED" banner near the header, and (d) render a highlighted "Device Condition"
   box with the typed comment. This reuses `TicketServiceReport` entirely (header,
   customer/ticket info, device/QC table, signatures, footer) — only three small
   conditional edits. No new template system, no new design language.

3. **Diagnostic print title** = `"Diagnostic Report"` (set in a new
   `buildDiagnosticReportPrintData`), replacing `"Service Report"` in the header.

4. **New print `docType` = `"diagnostic"`** handled alongside `"ticket"`/`"quotation"`.
   It resolves the real ticket from `useStore().tickets` (same as ticket), builds data via
   the new builder passing the `comment` query param. Ticket + quotation behavior untouched.

5. **Entry page** lives at `(app)/tickets/[id]/diagnostic-report/page.tsx`: read-only
   Ticket No + Customer Name + Device details from the real ticket (`useStore().tickets`),
   an editable "Device Condition" textarea, and a "Create Diagnostic Report" button that
   sets the marker + opens the print URL. All values from the real ticket record.

6. **View-Ticket mention** = a lightweight `use-diagnostic-report` localStorage-per-ticket
   hook mirroring `use-lead-temperature.ts`. The View Ticket page reads
   `hasReport(ticket.id)` and shows a small badge/row in the header summary area. The marker
   is set when "Create Diagnostic Report" is clicked. (Non-DB, per the constraints.)

---

## Steps

- [ ] 1. Add the `diagnostic` payload to the shared print data shape and a diagnostic
      print-data builder + URL builder.
      - Edit `src/lib/print-utils.ts`:
        - Add `PrintDocumentType` member `"diagnostic"` (update the union).
        - Add optional field to `PrintDocumentData`: `diagnostic?: { comment: string }`.
        - Add `buildDiagnosticReportPrintData(settings, ticket, comment: string): PrintDocumentData`
          — reuse `buildStoreInfo`, `buildCustomerFromTicket`, `buildTicketInfo`; set
          `printTitle: "Diagnostic Report"`, `termsAndConditions: ""`, `warrantyText: ""`,
          `printFooter: settings.ticketFooter`, and `diagnostic: { comment }`.
        - Add `getDiagnosticReportPrintUrl(ticketId: string, comment: string, format: PrintFormat = "a4"): string`
          returning `/print/diagnostic/${encodeURIComponent(ticketId)}?format=${format}&comment=${encodeURIComponent(comment)}`.
      - Files: `src/lib/print-utils.ts`
      - Verify: `cd "/Users/apple/Desktop/Reapirox dummy2/app" && npx tsc --noEmit` passes
        (no type errors from the new field/functions).

- [ ] 2. Render the diagnostic variant in the A4 template (highlighted QC FAILED banner +
      highlighted Device Condition box; omit T&C and Warranty when in diagnostic mode).
      - Edit `src/components/print/a4-template.tsx`, function `TicketServiceReport`:
        - Compute `const diagnostic = data.diagnostic;` near the top (after `const t = ticket!`).
        - Add a highlighted **"QC FAILED"** banner block immediately below the `<header>`
          (before the Customer/Ticket info grid) rendered only when `diagnostic` is set:
          a full-width rose block using the existing `BRAND.rose`/`#FEF2F2`/`#B91C1C`
          language (bold uppercase "QC FAILED", matching the existing "QC — Failed" red
          band styling already in this file).
        - Add a highlighted **"Device Condition"** box (reuse the `SectionHead` helper with
          title "Device Condition", rose/amber highlighted body) rendering
          `diagnostic.comment` (fallback "—" when empty). Place it after the device/service
          table (near the Service Summary / Price Breakdown block) so it reads as the
          justification of the diagnostic report.
        - Guard the existing Terms block: change
          `{data.termsAndConditions ? ...}` → `{!diagnostic && data.termsAndConditions ? ...}`.
        - Guard the existing Warranty block similarly:
          `{!diagnostic && data.warrantyText ? ...}`.
        - Do NOT touch `QuotationA4` / `InvoiceA4` / the `A4Template` router (router already
          falls into `TicketServiceReport` because `data.ticket` is set for diagnostic data).
      - Files: `src/components/print/a4-template.tsx`
      - Verify: `npx tsc --noEmit` passes.

- [ ] 3. Handle the new `"diagnostic"` docType in the print route, reading the comment from
      the query string; keep ticket/quotation/invoice intact.
      - Edit `src/app/print/[type]/[id]/page.tsx`:
        - Import `buildDiagnosticReportPrintData` from `@/lib/print-utils`.
        - Add `const isDiagnostic = docType === "diagnostic";`.
        - Add a small helper `getCommentFromUrl()` mirroring `getFormatFromUrl()`:
          read `new URLSearchParams(window.location.search).get("comment") ?? ""`.
          Store it in client state on mount (e.g. `const [comment, setComment] = useState("")`
          set inside the existing mount `useEffect`) so the memo can depend on it without
          reading `window` during SSR.
        - In the `printData` `useMemo`, add a branch: `if (isDiagnostic) { const ticket =
          tickets.find(t => t.id === docId); if (!ticket) return null; return
          buildDiagnosticReportPrintData(settings, ticket, comment); }` placed before the
          ticket branch; add `isDiagnostic`/`comment` to the memo dependency array.
        - Treat diagnostic like a ticket for the format selector where sensible: pass
          `isTicket={isTicket || isDiagnostic}` is NOT required — simplest is to force A4
          only for diagnostic. Add an effect `if (isDiagnostic && format !== "a4") setFormat("a4")`
          (mirroring the quotation effect) and keep the selector A4-only by passing
          `isQuotation={isQuotation || isDiagnostic}` is misleading; instead add an
          `isDiagnostic` prop path: pass `isTicket={isTicket}` unchanged and gate the
          selector with the quotation-style A4-only filter when `isDiagnostic`. (Keep it
          simple: reuse the existing `isQuotation`-style A4-only rendering by OR-ing a new
          `a4Only = isQuotation || isDiagnostic` and using `a4Only` where `isQuotation` is
          passed to `FormatSelector` and in the format-reset effect.)
      - Files: `src/app/print/[type]/[id]/page.tsx`
      - Verify: `npx tsc --noEmit` passes.

- [ ] 4. Create the localStorage-per-ticket marker hook, mirroring `use-lead-temperature.ts`.
      - Create `src/hooks/use-diagnostic-report.ts`:
        - `STORAGE_KEY = "repairox-diagnostic-reports"`, `SYNC_EVENT =
          "repairox:diagnostic-reports"`.
        - Shape: `Record<string, { ticketId: string; generatedAt: string }>` keyed by
          ticket id (or an array of `{ ticketId, generatedAt }`) — follow the same
          `readAll`/`writeAll` + CustomEvent + `storage` listener + `hydrated` pattern.
        - Export a non-React choke point `markDiagnosticReportGenerated(ticketId: string)`
          (SSR-safe, idempotent — updates `generatedAt`) and a hook
          `useDiagnosticReport()` returning `{ hydrated, hasReport(ticketId): boolean,
          generatedAt(ticketId): string | undefined, mark(ticketId): void }`.
      - Files: `src/hooks/use-diagnostic-report.ts`
      - Verify: `npx tsc --noEmit` passes.

- [ ] 5. Create the Diagnostic Report entry page (separate full page under `(app)`).
      - Create `src/app/(app)/tickets/[id]/diagnostic-report/page.tsx` (client component):
        - `const { tickets } = useStore();` resolve `ticket = tickets.find(t => t.id ===
          params.id)`; show a "Ticket Not Found" state (mirror the View Ticket not-found UI)
          when missing.
        - Gate the whole page / Create button with `usePermissions().can` +
          `allow(can, CAP.ticket.print)` (reuse `<Can permission={CAP.ticket.print}>` or an
          `allow` guard — NO new permission key).
        - Read-only display, all from the real ticket: Ticket No (`ticket.ticketNo ??
          ticket.id`), Customer Name (`ticket.customer`), Device details (use
          `getTicketDevices(ticket)` for brand/model/serial/issue; fall back to
          `ticket.device`/`ticket.model`/`ticket.issue`). Reuse existing shared primitives
          where convenient (`DetailHero`/`DetailSection` from `@/components/common/detail-page`
          are available and used by the View Ticket page) to match the app look.
        - A `<textarea>` labelled "Device Condition" (controlled React state
          `const [comment, setComment] = useState("")`), placeholder guiding the QC/condition
          notes.
        - "Create Diagnostic Report" button: on click call `markDiagnosticReportGenerated(
          ticket.id)` then `router.push(getDiagnosticReportPrintUrl(ticket.id, comment))`
          (or `window.open(..., "_blank")` to open the printable doc in a new tab — prefer
          `router.push` to match existing print navigation).
        - A "Back" button to `/tickets/${ticket.id}`.
      - Files: `src/app/(app)/tickets/[id]/diagnostic-report/page.tsx`
      - Verify: `npx tsc --noEmit` passes.

- [ ] 6. Add the "Diagnostic Report" entry to the quick-action dropdown + wire navigation
      in the list page.
      - Edit `src/components/tickets/ticket-actions-menu.tsx`:
        - Extend the `TicketAction` union with `"diagnostic-report"`.
        - Add a `MenuItem` in the More dropdown (gated by the existing `canPrint =
          allow(can, CAP.ticket.print)`), using a lucide icon (`Stethoscope` or
          `ClipboardCheck` — import it), calling `onAction("diagnostic-report", ticket)` then
          `close()`. Place it near the Print item. Do NOT show it for estimates
          (the client flow is QC-after-repair; wrap in `!estimate` to keep the estimate
          action set unchanged).
      - Edit `src/app/(app)/tickets/page.tsx` `handleAction`:
        - Add `if (action === "diagnostic-report") { router.push(\`/tickets/\${ticket.id}/diagnostic-report\`); return; }`.
      - Files: `src/components/tickets/ticket-actions-menu.tsx`,
        `src/app/(app)/tickets/page.tsx`
      - Verify: `npx tsc --noEmit` passes.

- [ ] 7. Add the Diagnostic Report entry to the View Ticket header dropdown AND the
      "Diagnostic Report generated" mention.
      - Edit `src/app/(app)/tickets/[id]/page.tsx`:
        - Import `useDiagnosticReport` from `@/hooks/use-diagnostic-report` and the icon
          (`Stethoscope`/`ClipboardCheck`).
        - Call `const { hydrated: diagHydrated, hasReport, generatedAt } = useDiagnosticReport();`
          and compute `const hasDiagnostic = diagHydrated && hasReport(ticket.id);`.
        - In the header "More actions" `Dropdown`, add a `MenuItem` (gated by
          `canPrintTicket`, not for estimates) that does
          `router.push(\`/tickets/\${ticket.id}/diagnostic-report\`); close();` labelled
          "Diagnostic Report".
        - Add the mention: a small badge/row near the status pills or in the summary-cards
          area, rendered only when `hasDiagnostic`, e.g. a rose/indigo pill
          "Diagnostic Report generated" (optionally with `generatedAt`). Use the existing
          pill styling language already present in this file (`inline-flex ... rounded-full
          ... ring-1 ring-inset`). Keep it a read-only indicator (optionally a link to
          re-open `/tickets/<id>/diagnostic-report`).
      - Files: `src/app/(app)/tickets/[id]/page.tsx`
      - Verify: `npx tsc --noEmit` passes.

- [ ] 8. Full type-check and production build; manual smoke of the three print paths.
      - Run from `/Users/apple/Desktop/Reapirox dummy2/app`:
        - `npx tsc --noEmit` — zero errors.
        - `npm run build` — build succeeds (the new `(app)/tickets/[id]/diagnostic-report`
          route and the extended `print/[type]/[id]` route compile).
      - Manual verification (dev server): open a ticket → quick-action More → "Diagnostic
        Report" opens the entry page with real Ticket No / Customer / Device; type a
        condition; "Create Diagnostic Report" opens `/print/diagnostic/<id>?...comment=...`
        showing the A4 with a highlighted "QC FAILED" banner + highlighted "Device
        Condition" box and NO Terms & Conditions; the View Ticket page now shows the
        "Diagnostic Report generated" mention; confirm normal Ticket print
        (`/print/ticket/<id>`) and Quotation print still render unchanged.
      - Files: none (verification only).
      - Verify: both commands exit 0; printed doc matches the described diagnostic layout.

---

## Notes / gaps

- The constraints forbid any DB/store write for the comment; the comment is passed only via
  the print URL query param and is NOT recoverable after the tab closes — this is the
  intended "store nothing" behavior. The only persisted artifact is the lightweight
  localStorage marker (which records *that* a report was generated, not its content),
  matching the client's "mention should be there" requirement.
- If the comment can be long, a query param is acceptable here (short QC notes). If a future
  need arises for very large comments, a sessionStorage handoff keyed by ticket id could
  replace the query param without changing the A4/route contract — out of scope now.
- `use-diagnostic-report.ts` is modeled as org-shared localStorage (same as
  `use-lead-temperature.ts`); if a per-user marker is later desired, key it by user id like
  `use-lead-kanban.ts`. Current requirement only asks for a mention, so org-shared is fine.
