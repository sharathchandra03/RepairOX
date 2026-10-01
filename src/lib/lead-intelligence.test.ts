import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateLeadIntelligence, EMPTY_INTELLIGENCE_FILTERS } from "./lead-intelligence";
import { buildAgentIntelligenceHref, buildLeadEvidenceHref, parseIntelligenceFilters, resolveLeadEvidenceIds } from "./lead-intelligence-url";
import type { Lead, LeadFollowUp } from "./leads-data";

const AS_OF = new Date("2026-09-30T12:00:00.000Z").getTime();

function lead(id: string, patch: Partial<Lead> = {}): Lead {
  const createdAt = patch.createdAt ?? "2026-09-05T09:00:00.000Z";
  return {
    id, branchId: "store-a", leadNo: id, date: createdAt.slice(0, 10), time: "09:00", month: "2026-09",
    region: "Bengaluru", source: "Google", modeOfContact: "Inbound", captureChannel: "Form", agent: "Agent A",
    qualification: "Qualified Lead", name: `Customer ${id}`, number: "9000000000", alternateNumber: "", email: "",
    location: "", locationUnit: "", locationLat: null, locationLng: null, locationMapsUrl: "",
    device: "Apple iPhone", deviceCategoryId: "cat-mobile", deviceBrandId: "plb-apple", deviceModelId: "plm-iphone",
    issue: "Screen", category: "Repair", subCategory: "Display", estimate: 5_000, discount: null, discountType: "amount",
    leadCategory: "Repair", leadNature: "Hot", priority: "Hot", comments: "", contactStatus: "Contacted",
    status: "Qualified", result: "Interested", finalRemarks: "", followUpDate: "", followUpAgent: "Agent A",
    followUpAgentId: "agent-a", finalResult: "", followUpComments: "", notContactedSince: "",
    assignedTo: "agent-a", assignedToName: "Agent A", assignedBy: "owner", assignedByName: "Owner", assignedAt: createdAt,
    pinnedAt: "", fulfilmentRoute: "STORE_VISIT", assignedStore: "", routedAt: createdAt,
    linkedWalkInId: "", linkedFieldJobId: "", linkedTicketId: "", linkedInvoiceId: "", contactId: "", customerId: "",
    createdBy: "owner", createdAt, updatedAt: createdAt,
    ...patch,
  };
}

function followUp(id: string, leadId: string, patch: Partial<LeadFollowUp> = {}): LeadFollowUp {
  return {
    id, leadId, seq: 1, dueAt: "2026-09-20T09:00:00.000Z", followUpUserId: "agent-a", followUpUserName: "Agent A",
    createdBy: "agent-a", createdByName: "Agent A", status: "completed", completedAt: "2026-09-20T10:00:00.000Z",
    outcome: "Interested", createdAt: "2026-09-10T09:00:00.000Z", ...patch,
  };
}

function scenario() {
  const leads: Lead[] = [];
  const followUps: LeadFollowUp[] = [];
  const tickets: { id: string; ticketNo: string; createdAt: string }[] = [];
  const invoices: { id: string; ticketId: string; total: number; status: string; documentType: "invoice" | "proforma"; createdAt: string }[] = [];

  // Supported high-converting segment: 12 Google leads, 6 converted.
  for (let i = 1; i <= 12; i += 1) {
    const converted = i <= 6;
    const id = `g-${i}`;
    leads.push(lead(id, converted ? {
      status: "Won", finalResult: "Won", qualifiedAt: "2026-09-06T09:00:00.000Z", convertedAt: "2026-09-10T09:00:00.000Z",
      linkedWalkInId: `wi-${i}`, linkedTicketId: `ticket-${i}`,
    } : {}));
    if (i <= 10) followUps.push(followUp(`fu-g-${i}`, id));
    if (converted) {
      tickets.push({ id: `ticket-${i}`, ticketNo: `T-${i}`, createdAt: "2026-09-08T09:00:00.000Z" });
      invoices.push({ id: `inv-${i}`, ticketId: `ticket-${i}`, total: 10_000, status: "paid", documentType: "invoice", createdAt: "2026-09-11T09:00:00.000Z" });
    }
  }

  // Supported low-converting segment: 12 Forms leads, 1 converted.
  for (let i = 1; i <= 12; i += 1) {
    const converted = i === 1;
    const id = `f-${i}`;
    leads.push(lead(id, {
      source: "Forms", qualification: i <= 6 ? "Qualified Lead" : "Not Qualified Lead",
      status: converted ? "Won" : i <= 6 ? "Qualified" : "Lost",
      finalResult: converted ? "Won" : i <= 6 ? "" : "Lost",
      lostReason: i > 6 ? "Price" : undefined,
      convertedAt: converted ? "2026-09-20T09:00:00.000Z" : undefined,
      linkedTicketId: converted ? "ticket-f-1" : "",
      linkedWalkInId: converted ? "wi-f-1" : "",
    }));
  }
  tickets.push({ id: "ticket-f-1", ticketNo: "T-F1", createdAt: "2026-09-18T09:00:00.000Z" });
  // Proforma is never Revenue Won.
  invoices.push({ id: "proforma-f-1", ticketId: "ticket-f-1", total: 99_999, status: "paid", documentType: "proforma", createdAt: "2026-09-22T09:00:00.000Z" });

  // Tiny 100% segment must not be declared strongest.
  leads.push(lead("tiny", { source: "Referral", status: "Won", finalResult: "Won", convertedAt: "2026-09-07T09:00:00.000Z" }));
  // Another agent and another month must never enter Agent A's cohort.
  leads.push(lead("agent-b", { assignedTo: "agent-b", assignedToName: "Agent B", status: "Won", finalResult: "Won" }));
  leads.push(lead("august", { createdAt: "2026-08-15T09:00:00.000Z", date: "2026-08-15", status: "Won", finalResult: "Won" }));

  // Upper-quartile high-value open qualified stall with overdue follow-up.
  leads.push(lead("stall", { estimate: 50_000, updatedAt: "2026-09-10T09:00:00.000Z" }));
  followUps.push(followUp("fu-stall", "stall", { status: "scheduled", completedAt: undefined, dueAt: "2026-09-15T09:00:00.000Z" }));

  return { leads, followUps, revenue: { tickets, invoices } };
}

test("Lead Intelligence scopes by canonical owner and lead-created cohort", () => {
  const s = scenario();
  const result = calculateLeadIntelligence({
    ...s, agentUserId: "agent-a", filters: { ...EMPTY_INTELLIGENCE_FILTERS, dateRange: "thisMonth" }, asOf: AS_OF,
  });
  assert.equal(result.cohort.some((l) => l.id === "agent-b"), false);
  assert.equal(result.cohort.some((l) => l.id === "august"), false);
  assert.equal(result.summary.totalLeads, 26);
  assert.equal(result.period.semantics, "lead-created cohort");
});

test("Revenue counts only paid non-proforma invoices through Lead to Ticket", () => {
  const result = calculateLeadIntelligence({ ...scenario(), agentUserId: "agent-a", filters: EMPTY_INTELLIGENCE_FILTERS, asOf: AS_OF });
  assert.equal(result.summary.revenueWon, 60_000);
  assert.equal(result.summary.finalizedInvoices, 6);
  assert.equal(result.summary.averageInvoiceValue, 10_000);
});

test("supported segments use minimum evidence and preserve numerator/denominator", () => {
  const result = calculateLeadIntelligence({ ...scenario(), agentUserId: "agent-a", filters: EMPTY_INTELLIGENCE_FILTERS, asOf: AS_OF });
  const google = result.segments.source.find((row) => row.key === "Google");
  const forms = result.segments.source.find((row) => row.key === "Forms");
  const tiny = result.segments.source.find((row) => row.key === "Referral");
  assert.deepEqual({ leads: google?.leads, converted: google?.converted, sufficient: google?.sufficient }, { leads: 13, converted: 6, sufficient: true });
  assert.deepEqual({ leads: forms?.leads, converted: forms?.converted, sufficient: forms?.sufficient }, { leads: 12, converted: 1, sufficient: true });
  assert.equal(tiny?.sufficient, false);
  assert.equal(result.focusInsights.some((i) => i.title === "Referral"), false);
});

test("follow-up completion and overdue metrics come from structured records", () => {
  const result = calculateLeadIntelligence({ ...scenario(), agentUserId: "agent-a", filters: EMPTY_INTELLIGENCE_FILTERS, asOf: AS_OF });
  assert.equal(result.followUp.completed, 10);
  assert.equal(result.followUp.overdue, 1);
  assert.equal(result.summary.overdueFollowUps, 1);
  assert.equal(result.followUp.leadsWithCompleted, 10);
});

test("funnel is cumulative and leakage never divides by zero", () => {
  const result = calculateLeadIntelligence({ ...scenario(), agentUserId: "agent-a", filters: EMPTY_INTELLIGENCE_FILTERS, asOf: AS_OF });
  for (let i = 1; i < result.funnel.length; i += 1) assert.ok(result.funnel[i].count <= result.funnel[i - 1].count);
  assert.ok(result.leakage);
  const empty = calculateLeadIntelligence({ leads: [], followUps: [], revenue: { tickets: [], invoices: [] }, agentUserId: "agent-a", filters: EMPTY_INTELLIGENCE_FILTERS, asOf: AS_OF });
  assert.equal(empty.summary.conversionRate, 0);
  assert.equal(empty.leakage, null);
  assert.equal(empty.focusInsights.length, 0);
});

test("qualified historical fact survives a later Won status", () => {
  const result = calculateLeadIntelligence({ ...scenario(), agentUserId: "agent-a", filters: EMPTY_INTELLIGENCE_FILTERS, asOf: AS_OF });
  assert.ok(result.summary.qualified >= result.summary.converted);
  assert.equal(result.stalls.highValueStalled.some((l) => l.id === "stall"), true);
  assert.equal(result.stalls.highValueStalledValue, 50_000);
});

test("store and dimension filters apply to every calculation", () => {
  const s = scenario();
  const forms = calculateLeadIntelligence({
    ...s, agentUserId: "agent-a",
    filters: { ...EMPTY_INTELLIGENCE_FILTERS, source: "Forms", status: "Lost" },
    asOf: AS_OF,
  });
  assert.equal(forms.summary.totalLeads, 6);
  assert.equal(forms.lossReasons[0]?.reason, "Price");

  const unauthorizedStore = calculateLeadIntelligence({
    ...s, agentUserId: "agent-a",
    filters: { ...EMPTY_INTELLIGENCE_FILTERS, storeIds: ["store-b"] },
    asOf: AS_OF,
  });
  assert.equal(unauthorizedStore.summary.totalLeads, 0);
});

test("owner links preserve filters and evidence links preserve exact cohort ids", () => {
  const filters = {
    ...EMPTY_INTELLIGENCE_FILTERS,
    dateRange: "custom" as const,
    customFrom: "2026-09-01",
    customTo: "2026-09-30",
    storeIds: ["store-a"],
    source: "Google",
    priority: "Hot",
    route: "STORE_VISIT" as const,
  };
  const agentHref = buildAgentIntelligenceHref("agent-a", filters);
  const parsed = parseIntelligenceFilters(new URL(`https://repairox.local${agentHref}`).searchParams);
  assert.deepEqual(parsed, filters);

  const result = calculateLeadIntelligence({ ...scenario(), agentUserId: "agent-a", filters, asOf: AS_OF });
  const href = buildLeadEvidenceHref(["g-1", "g-2"], filters, result.period, "agent-a");
  const params = new URL(`https://repairox.local${href}`).searchParams;
  assert.equal(params.get("evidenceIds"), "g-1,g-2");
  assert.equal(params.get("assignedTo"), "agent-a");
  assert.equal(params.get("source"), "Google");
  assert.equal(params.get("dateRange"), "custom");
});

test("large evidence cohorts use a bounded token and round-trip when browser storage succeeds", () => {
  const memory = new Map<string, string>();
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    },
  } });
  const ids = Array.from({ length: 500 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  const period = { key: "thisMonth" as const, label: "This month", from: AS_OF - 10 * 86_400_000, to: AS_OF, fromISO: "2026-09-20", toISO: "2026-09-30", semantics: "lead-created cohort" as const };
  const href = buildLeadEvidenceHref(ids, EMPTY_INTELLIGENCE_FILTERS, period, "agent-a");
  const params = new URL(`https://repairox.local${href}`).searchParams;
  assert.ok(params.get("evidenceToken"));
  assert.equal(params.has("evidenceIds"), false);
  assert.ok(href.length < 500);
  assert.deepEqual(resolveLeadEvidenceIds(params), ids);
  const raw = memory.values().next().value as string;
  assert.deepEqual(JSON.parse(raw).ids, ids);
  Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
});

test("large evidence falls back to exact inline ids when storage is denied", () => {
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: { setItem: () => { throw new Error("quota"); } } } });
  const ids = Array.from({ length: 41 }, (_, index) => `lead-${index}`);
  const period = { key: "thisMonth" as const, label: "This month", from: AS_OF - 10 * 86_400_000, to: AS_OF, fromISO: "2026-09-20", toISO: "2026-09-30", semantics: "lead-created cohort" as const };
  const href = buildLeadEvidenceHref(ids, EMPTY_INTELLIGENCE_FILTERS, period, "agent-a");
  const params = new URL(`https://repairox.local${href}`).searchParams;
  assert.equal(params.get("evidenceIds"), ids.join(","));
  assert.equal(params.has("evidenceToken"), false);
  Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
});

test("funnel does not treat scheduling as contact or invoice as terminal conversion", () => {
  const untouched = lead("untouched", { contactStatus: "Not Contacted", qualification: "", status: "New Lead" });
  const scheduled = followUp("scheduled", untouched.id, { status: "scheduled", completedAt: undefined, dueAt: "2026-10-02T09:00:00.000Z" });
  const wonWithoutTicket = lead("won-no-ticket", { status: "Won", finalResult: "Won", convertedAt: "2026-09-10T09:00:00.000Z" });
  const result = calculateLeadIntelligence({ leads: [untouched, wonWithoutTicket], followUps: [scheduled], revenue: { tickets: [], invoices: [] }, agentUserId: "agent-a", filters: EMPTY_INTELLIGENCE_FILTERS, asOf: AS_OF });
  assert.equal(result.funnel.find((stage) => stage.key === "contacted")?.count, 1);
  assert.equal(result.summary.converted, 1);
  assert.equal(result.funnel.at(-1)?.count, 0);
});

test("aging excludes lost, disqualified, and converted leads without reliable endpoint", () => {
  const openLead = lead("open");
  const lostLead = lead("lost", { status: "Lost", finalResult: "Lost", lostAt: "2026-09-10T09:00:00.000Z", lostReason: "Price" });
  const disqualified = lead("nq", { qualification: "Not Qualified Lead", finalRemarks: "Out of service area", status: "Contacted" });
  const undatedWon = lead("undated-won", { status: "Won", finalResult: "Won", convertedAt: undefined });
  const result = calculateLeadIntelligence({ leads: [openLead, lostLead, disqualified, undatedWon], followUps: [], revenue: { tickets: [], invoices: [] }, agentUserId: "agent-a", filters: EMPTY_INTELLIGENCE_FILTERS, asOf: AS_OF });
  assert.equal(result.aging.reduce((sum, bucket) => sum + bucket.leads, 0), 1);
  assert.equal(result.lossReasons.some((row) => row.reason === "Out of service area"), true);
});

test("follow-up comparison needs both sample size and a material observed difference", () => {
  const leads = Array.from({ length: 20 }, (_, index) => lead(`eq-${index}`, index % 5 === 0 ? { status: "Won", finalResult: "Won", convertedAt: "2026-09-10T09:00:00.000Z" } : {}));
  const followUps = leads.slice(0, 10).map((item, index) => followUp(`eq-fu-${index}`, item.id));
  const result = calculateLeadIntelligence({ leads, followUps, revenue: { tickets: [], invoices: [] }, agentUserId: "agent-a", filters: EMPTY_INTELLIGENCE_FILTERS, asOf: AS_OF });
  assert.equal(result.followUp.conversionWithCompletedRate, result.followUp.conversionWithoutCompletedRate);
  assert.equal(result.followUp.associationSupported, false);
  assert.equal(result.focusInsights.some((insight) => insight.id === "follow-up-association"), false);
});

test("historical qualification does not bypass current downstream gate", () => {
  const gated = lead("gated-history", { qualifiedAt: "2026-09-06T09:00:00.000Z", qualification: "Not Qualified Lead", finalRemarks: "Unsupported issue", status: "Contacted" });
  const result = calculateLeadIntelligence({ leads: [gated], followUps: [], revenue: { tickets: [], invoices: [] }, agentUserId: "agent-a", filters: EMPTY_INTELLIGENCE_FILTERS, asOf: AS_OF });
  assert.equal(result.summary.qualified, 1);
  assert.equal(result.funnel.find((stage) => stage.key === "active")?.count, 0);
  assert.equal(result.summary.pipelineValue, 0);
  assert.equal(result.stalls.qualifiedWithoutFutureFollowUp.length, 0);
  assert.equal(result.stalls.highValueStalled.length, 0);
  assert.equal(result.stalls.overdueQualified.length, 0);
  assert.equal(result.focusInsights.some((insight) => insight.id === "qualified-no-follow-up" || insight.id === "high-value-stalls"), false);
});

test("aging rejects conversion timestamps before lead creation", () => {
  const invalid = lead("bad-time", { createdAt: "2026-09-10T09:00:00.000Z", date: "2026-09-10", status: "Won", finalResult: "Won", convertedAt: "2026-09-05T09:00:00.000Z" });
  const result = calculateLeadIntelligence({ leads: [invalid], followUps: [], revenue: { tickets: [], invoices: [] }, agentUserId: "agent-a", filters: EMPTY_INTELLIGENCE_FILTERS, asOf: AS_OF });
  assert.equal(result.aging.reduce((sum, bucket) => sum + bucket.leads, 0), 0);
  assert.equal(result.dataQualityWarnings.some((warning) => warning.includes("before creation")), true);
});
