# Agent Intelligence → Sales Book redesign — implementation note

## 1. Existing architecture (relevant source files)
- Owner page (screenshot): `app/src/app/(app)/leads/intelligence/agents/page.tsx` — KPI strip + ranked agent cards, each with **View Analysis** (evidence engine) and **View Workspace** (owner read-only `?viewAs=`).
- Selected-agent detail: `app/src/app/(app)/leads/intelligence/agents/[agentId]/page.tsx` → renders `LeadIntelligenceView`.
- Analysis engine (THE single source of truth, do not fork): `app/src/lib/lead-intelligence.ts` → `calculateLeadIntelligence(input)`.
- URL helpers: `app/src/lib/lead-intelligence-url.ts` (`parseIntelligenceFilters`, `buildAgentIntelligenceHref`, `buildLeadEvidenceHref`).
- Filters UI: `app/src/components/leads/intelligence/intelligence-filters.tsx`.
- Lead model + helpers: `app/src/lib/leads-data.ts`. Contexts: `useLeads` (`leads-context.tsx`), `useStore` (`store.tsx`), `useField` (`field-context.tsx`), `useStoreContext`, `useCatalog`, `useSession`.
- Workflow derivation (Action/Result/Store — system-derived, read-only): `app/src/lib/lead-workflow.ts` (`deriveLeadWorkflow`, `resolveLead*`).
- Shared UI: `rox-table.tsx`, `pagination.tsx`, `dropdown.tsx`, `detail-page.tsx`, `pinned-rail.tsx`, `avatar.tsx`, `csv-utils.ts` (`downloadXLSX`/`toCSV`/`downloadCSV`), `tabs.tsx` (`SegmentedTabs`).

## 2. Data relationships + reliable metrics
- **Sales Agent identity = `lead.assignedTo` (staff.id)**; `assignedToName` is a display cache. `SalesAgent` = `{id,name,roleLabel,avatarUrl,storeIds,anyStore}` via `useLeads().salesAgents` / `salesAgentsFor(storeId)` (store-scoped by RLS/RPC). NEVER a role/name.
- **Qualified** = `isQualifiedLead`. **Won/Converted** = `isWonStatus(status,finalResult)`. **Lost** = `isLostStatus || lostAt`. Historical qualification survives later Won/Lost.
- **Revenue Won (gross)** = `revenueWonForLead(lead, tickets, invoices)` — Lead→`linkedTicketId`→ticket→`invoice.ticketId` paid & non-proforma, plus direct `linkedInvoiceId`. **Net** = `revenueWonNetForLead(..., refunds)` subtracting SUCCEEDED refunds on those finalized invoices. Estimate/Proforma/Draft/partial = ₹0.
- **Pipeline value** = Σ `leadExpectedValue` for OPEN, non-downstream-gated leads. Never revenue.
- **Follow-ups** = structured `LeadFollowUp[]` (`useLeads().followUps`), lifecycle via `followUpLifecycle` (datetime-precise Overdue/Due/Pending). Owner = `followUpUserId`.
- **Fulfillment mode** = `lead.fulfilmentRoute` ∈ {STORE_VISIT, PICKUP_DROP, ON_SITE, ""}. The ONLY reliable per-lead mode field. "" = not yet routed (surface honestly; field-job `leadType` is an operational sub-type, not the mode).
- **Links**: `linkedWalkInId / linkedFieldJobId / linkedTicketId / linkedInvoiceId`. Invoice = `useStore().invoices` (status, total, ticketId, documentType, branchId). Refunds = `useStore().invoiceRefunds` (status `succeeded` realized; `refundAmount`, `invoiceId`).
- **Activity/timeline**: client exposes `assignmentHistoryFor`, `conversionHistoryFor`, `followUpsFor` + lead terminal timestamps (`firstContactedAt/qualifiedAt/convertedAt/lostAt/routedAt`). There is NO generic lead_activity_history / lead_status_history reader on the client — the dossier timeline is built ONLY from those real records and must label absence as "no recorded activity", never infer contact happened.

## 3. Current defects / attribution risks addressed
- Page showed **gross** revenue only (never subtracted refunds). → Sales Book surfaces NET revenue + refund exceptions, keeping gross traceable.
- One-lead-many-invoices/tickets could inflate counts. → All aggregates count **unique lead ids**; export dedups by lead id with invoice/ticket as separate reference columns.
- "Mysterious" ranking order. → Roster is an explicit sortable table; the active sort metric is always shown. No composite score.
- Empty state = wall of zeros with no path. → Honest empty states + a path to the agent's own leads; the owner-vs-own scoping is corrected at the query (`assignedTo` only; engine re-filters).

## 4. Role-aware IA
- **Owner** (`CAP.lead.performanceAll`): "Agent Intelligence — your sales operations, across authorized agents and stores." Agent Roster + Sales Book workspace over the selected agent (or whole team). Links to the evidence engine (`View Analysis`) + `View Workspace` preserved.
- **Individual** (`CAP.lead.performanceOwn`): "My Sales Book — every lead, every action, every outcome in one place." Same workspace scoped to `session.id`.
- Both reuse ONE `calculateLeadIntelligence` pass per subject + one deterministic `lead-sales-book.ts` for the ledger/queue/mode/export. Store scope enforced via `useStoreContext().activeStoreId` merged into `storeIds` (matches existing pattern + RLS).

## 5. New features (this change)
- Portfolio **status rail** (segmented, lifecycle-aware, mutually-exclusive stage + separate operational flags).
- **Next Moves** rule-based attention queue (overdue / due today / no next follow-up / no recorded outreach / stale qualified / won-without-invoice), each with reason + evidence lead + deep link. Transparent, not AI.
- **Portfolio outcome map** (created→assigned→qualified→progressing→won→ticket→invoice) from real links, each stage drill-down.
- **Fulfillment & sales motions** (Walk-In/Pickup/On-Site) from `fulfilmentRoute`, with an explicit "Not routed yet" bucket.
- **Agent roster** (owner) sortable table: active/qualified/won, net revenue, invoice & ticket counts, overdue, no-next-action, stalled, last activity.
- **Lead ledger** (`rox-table` standard) with saved views + the Store context column, click → **Lead dossier** side panel (identity, outcome, links, follow-ups, real activity timeline with actor+timestamp).
- **Export center**: Excel-primary + CSV `Dropdown`, presets (all / won / invoice-generated / ticket-generated / on-site / pickup / store-to-store / overdue / no-next-action / current view), one shared row-builder, dedup by lead id, refund-aware.

## 6. Gaps / assumptions
- No DB migration required: all data already loaded client-side (leads, follow-ups, tickets, invoices, refunds, field jobs). Export is client-side XLSX/CSV (RepairOX standard) — adequate for the loaded authorized set.
- No generic activity-history reader exists client-side → timeline is assembled from assignment + conversion + follow-up records + lead terminal timestamps; "no recorded activity" shown honestly.
- Fulfillment mode is "" for un-routed leads — reported as its own bucket, never guessed.
- Net revenue path uses the existing `revenueWonNetForLead`; the engine summary stays gross, so the Sales Book computes net alongside it (no engine signature change needed).
