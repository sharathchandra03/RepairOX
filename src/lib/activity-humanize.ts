/**
 * Activity humanizer — turns raw DB audit rows into clear, user-facing text.
 *
 * The `audit_log` table is written by a generic DB trigger (fn_audit) that
 * fires on EVERY table write. That is exactly what we want for a forensic
 * backend trail — but it is NOT what a business user should read. Raw rows look
 * like:
 *     action      = "Update Lead"
 *     description = "Lead update (5193bddf-0a41-4e8d-b6de-9835c690e10d)"
 *     record_id   = "5193bddf-0a41-4e8d-b6de-9835c690e10d"
 * i.e. a technical table op repeated twice with a UUID. Internal bookkeeping
 * tables (lead_*_history, *_options, …) also produce rows that mean nothing to
 * a user.
 *
 * This module is the single PRESENTATION choke point: given a raw row it
 * decides (a) whether a user should see it at all, and (b) the clean action +
 * description + human reference to show. The raw row is never mutated — it
 * stays intact in the DB for audit/compliance.
 */

type RawAuditRow = {
  module?: string | null;
  entity_type?: string | null;
  action?: string | null;
  action_type?: string | null;
  record_id?: string | null;
  description?: string | null;
  new_value?: Record<string, unknown> | null;
  previous_value?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
};

export type HumanizedActivity = {
  /** Short title, e.g. "Lead Updated", "Ticket Created". */
  action: string;
  /** One-line human description, e.g. "Updated lead for Rahul Sharma." */
  description: string;
  /** A meaningful reference to show as a pill (TK-1042, LD-23) — never a UUID. */
  reference?: string;
};

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/** Entity types that are internal bookkeeping — kept in the DB trail, hidden
 *  from the user-facing feed because they are noise to a business user. */
const HIDDEN_ENTITIES = new Set<string>([
  "lead_status_history",
  "lead_assignment_history",
  "lead_activity_history",
  "lead_followup_history",
  "lead_conversion_history",
  "lead_deal_revisions",
  "lead_deal_comments",
  "stock_movements",
  "ledger_entries",
  "numbering_sequences",
  "user_preferences",
  "user_table_preferences",
  "assigned_by_options",
  "assigned_to_options",
  "audit_log",
  "file_uploads",
]);

/** Phrases in a raw action/description that mark an internal "history"/options
 *  write even when the entity type isn't in HIDDEN_ENTITIES. */
const HIDDEN_PHRASES = /\b(history|revision|sequence|preference|option)s?\b/i;

/** Verb from the raw table op. */
function verb(row: RawAuditRow): "created" | "updated" | "deleted" | "changed" {
  const a = `${row.action ?? ""} ${row.action_type ?? ""}`.toLowerCase();
  if (/\b(insert|create|add|new)/.test(a)) return "created";
  if (/\b(delete|remov|cancel)/.test(a)) return "deleted";
  if (/\b(update|edit|chang)/.test(a)) return "updated";
  return "changed";
}

/** Friendly singular noun for a module/entity. */
function subjectNoun(row: RawAuditRow): string {
  const m = (row.module ?? "").toLowerCase();
  const map: Record<string, string> = {
    lead: "lead",
    ticket: "ticket",
    invoice: "invoice",
    customer: "customer",
    "walk-in": "walk-in",
    inventory: "inventory item",
    "price list": "price list entry",
    employee: "user",
    expense: "expense",
    task: "task",
    settings: "settings",
    company: "company",
    field: "field job",
    warranty: "warranty",
    quotation: "quotation",
    deal: "deal",
  };
  return map[m] ?? (row.module || "record").toLowerCase();
}

/** Pull a human-friendly label (person/business/doc number) out of the row's
 *  JSON payload, so we can say "for Rahul Sharma" instead of showing a UUID. */
function humanLabel(row: RawAuditRow): string | undefined {
  const v = row.new_value ?? row.previous_value ?? {};
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const val = v[k];
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    return undefined;
  };
  // Combine first/last name when that's how the record stores a person.
  const first = typeof v.first_name === "string" ? v.first_name.trim() : "";
  const last = typeof v.last_name === "string" ? v.last_name.trim() : "";
  const fullFromParts = `${first} ${last}`.trim();
  return (
    pick("name", "full_name", "customer_name", "contact_name") ||
    (fullFromParts || undefined) ||
    pick("company", "company_name", "title", "subject")
  );
}

/** A meaningful reference (doc/lead number) — never a bare UUID. */
function humanReference(row: RawAuditRow): string | undefined {
  const v = row.new_value ?? row.previous_value ?? {};
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const val = v[k];
      if ((typeof val === "string" || typeof val === "number") && String(val).trim())
        return String(val).trim();
    }
    return undefined;
  };
  const ref = pick(
    "doc_number", "invoice_no", "ticket_no", "lead_no", "number",
    "reference", "walk_in_no", "quotation_no", "deal_no", "code",
  );
  if (ref && !UUID_RE.test(ref)) return ref;
  // The record_id is only a usable reference when it is NOT a raw UUID
  // (some tables use human ids like "TK-1042" / "CUS-208").
  const rid = row.record_id ?? undefined;
  if (rid && !UUID_RE.test(rid)) return rid;
  return undefined;
}

/**
 * Decide whether a raw audit row should appear in the USER-facing feed.
 * Internal/bookkeeping writes are kept in the DB but hidden here.
 */
export function isUserFacingActivity(row: RawAuditRow): boolean {
  const entity = (row.entity_type ?? "").toLowerCase();
  if (HIDDEN_ENTITIES.has(entity)) return false;
  const text = `${row.action ?? ""} ${row.description ?? ""} ${entity}`;
  if (HIDDEN_PHRASES.test(text)) return false;
  return true;
}

/**
 * Produce clean, user-facing text for a raw audit row. Prefers an explicit,
 * already-human description written by the app (e.g. "Ram created Akhilesh",
 * "Recorded ₹6,500 payment") and only reformats the generic trigger output.
 */
export function humanizeActivity(row: RawAuditRow): HumanizedActivity {
  const reference = humanReference(row);
  const noun = subjectNoun(row);
  const v = verb(row);
  const label = humanLabel(row);

  const rawAction = (row.action ?? "").trim();
  const rawDesc = (row.description ?? "").trim();

  // Is the stored description already a clean human sentence (app-written),
  // i.e. it carries no UUID and isn't the generic "<module> <op> (<id>)" shape?
  const genericDesc = /\b(insert|update|delete)\b/i.test(rawDesc) && UUID_RE.test(rawDesc);
  const descHasUuid = UUID_RE.test(rawDesc);

  // Clean title: "Lead Updated", "Ticket Created".
  const action = `${capitalize(noun)} ${capitalize(v)}`;

  let description: string;
  if (rawDesc && !genericDesc && !descHasUuid) {
    // App-written, already friendly — keep it (strip any stray UUIDs for safety).
    description = rawDesc.replace(UUID_RE, "").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim();
  } else if (label) {
    description = `${capitalize(v)} ${noun} for ${label}.`;
  } else if (reference) {
    description = `${capitalize(v)} ${noun} ${reference}.`;
  } else {
    description = `${capitalize(v)} a ${noun}.`;
  }

  // Prefer an app-written non-generic action title when present and clean.
  const finalAction =
    rawAction && !UUID_RE.test(rawAction) && !/\b(insert|update|delete)\b/i.test(rawAction)
      ? rawAction
      : action;

  return { action: finalAction, description, reference };
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
