/* ──────────────────────────────────────────────────────────────────────────
   Loss & Damage — pure domain + report engine (no React, no I/O).

   An incident is ONE `write_off` inventory document (lib/inventory-ops.ts).
   The document carries the workflow status; this file turns it into a flat,
   reportable `Incident` and builds every report/export from the SAME rows, so
   the on-screen report and the Excel/CSV export can never disagree.

   Stock moves ONLY when an incident reaches `approved` (effect `writeoff_out`
   in use-inventory-actions). Everything else — reported, verified, under
   investigation, quarantined, rejected, restored — leaves stock untouched.
   Legacy write-offs (status `posted`, or bare `WO-` stock movements from before
   the approval workflow) already moved stock and count as confirmed.
   ────────────────────────────────────────────────────────────────────────── */

import { DOC_META, type DocAction, type InvDoc } from "@/lib/inventory-ops";
import { CAP, allow } from "@/lib/capabilities";
import type { PermissionKey } from "@/lib/permissions";
import type { InventoryItem } from "@/lib/inventory-data";
import type { StockMovement } from "@/lib/inventory-data";
import { isWriteOff, parseMovementDate, writeOffReason } from "@/lib/inventory-analytics";

export type IncidentKind = "loss" | "damage";

export const KIND_LABEL: Record<IncidentKind, string> = { loss: "Loss", damage: "Damage" };

/** Loss = stock that is gone. Damage = stock that is physically unusable. */
export const LOSS_REASONS = ["Missing stock", "Unexplained shortage", "Theft", "Lost in transit"] as const;
export const DAMAGE_REASONS = [
  "Physical damage", "Handling damage", "Liquid damage", "Transit damage", "Defective on arrival", "Expired / defective", "Used for testing",
] as const;
export const reasonsFor = (k: IncidentKind): readonly string[] => (k === "loss" ? LOSS_REASONS : DAMAGE_REASONS);

/* ── Workflow status groups ─────────────────────────────────────────────── */
export type IncidentStatus = "reported" | "verified" | "investigating" | "quarantined" | "approved" | "restored" | "rejected" | "posted";

/** Stock was (or is being) written off: counts as confirmed financial loss. */
export const CONFIRMED: ReadonlySet<string> = new Set(["approved", "posted"]);
/** Still waiting on a person. */
export const OPEN: ReadonlySet<string> = new Set(["reported", "verified", "investigating", "quarantined"]);
/** A manager has to act (verify/approve). Quarantined waits on a repair, not on approval. */
export const NEEDS_DECISION: ReadonlySet<string> = new Set(["reported", "verified", "investigating"]);

export type StatusFilter = "all" | "needs_action" | "quarantined" | "confirmed" | "rejected";
export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_action", label: "Needs action" },
  { value: "quarantined", label: "Quarantined" },
  { value: "confirmed", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];
export function matchesStatusFilter(status: string, f: StatusFilter): boolean {
  switch (f) {
    case "all": return true;
    case "needs_action": return NEEDS_DECISION.has(status);
    case "quarantined": return status === "quarantined";
    case "confirmed": return CONFIRMED.has(status);
    case "rejected": return status === "rejected" || status === "restored";
  }
}

/* ── The flat, reportable incident ──────────────────────────────────────── */
export type HistoryEntry = { at: string; by: string; status: string; note?: string; self?: boolean };

export type Incident = {
  id: string;
  /** Source document (absent for legacy movement-only write-offs). */
  doc?: InvDoc;
  legacy: boolean;
  createdAt: string;
  ts: number;
  kind: IncidentKind;
  reason: string;
  itemId: string;
  itemName: string;
  model: string;
  category: string;
  branch: string;
  qty: number;
  /** 0 when cost is unknown. Display is gated by the viewCost permission. */
  unitCost: number;
  value: number;
  status: string;
  reportedBy: string;
  reportedById: string;
  responsible: string;
  notes: string;
  photos: string[];
  history: HistoryEntry[];
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** "iPhone 16 Pro Max · Display" → "iPhone 16 Pro Max". */
export function modelOfItem(it: Pick<InventoryItem, "brandModel" | "variantGroup" | "category"> | undefined): string {
  if (!it) return "";
  const g = it.brandModel?.trim() || it.variantGroup?.split("·")[0]?.trim() || "";
  return g;
}

/** Best-known unit cost for an item (cost-scoped fields are empty for users without cost access). */
export function itemUnitCost(it: InventoryItem | undefined): number {
  if (!it) return 0;
  return it.costPrice ?? it.regularBuyingPrice ?? 0;
}

export function incidentFromDoc(d: InvDoc): Incident {
  const line = d.lines[0];
  const reason = d.party || "Other";
  const kind: IncidentKind = d.data.kind === "loss" || d.data.kind === "damage" ? d.data.kind : guessKind(reason);
  const unitCost = num(d.data.unitCost) || num(line?.unitCost);
  const qty = d.lines.reduce((s, l) => s + (l.qty || 0), 0);
  const history = Array.isArray(d.data.history) ? (d.data.history as unknown as HistoryEntry[]) : [];
  const photos = Array.isArray(d.data.photos) ? (d.data.photos as unknown as string[]).filter((p) => typeof p === "string") : [];
  return {
    id: d.id, doc: d, legacy: false, createdAt: d.createdAt, ts: new Date(d.createdAt).getTime() || 0,
    kind, reason, itemId: line?.itemId ?? "", itemName: line?.name ?? "—",
    model: str(d.data.model) || "Unspecified", category: str(d.data.category), branch: str(d.data.branch) || str(d.data.location) || "—",
    qty, unitCost, value: qty * unitCost, status: d.status,
    reportedBy: d.createdBy || "—", reportedById: str(d.data.reportedById), responsible: str(d.data.responsible),
    notes: str(d.data.note) || str(d.data.notes), photos, history,
  };
}

/** A write-off from before the workflow existed: only a stock movement remains. */
export function incidentFromMovement(m: StockMovement): Incident {
  const reason = writeOffReason(m);
  const ts = parseMovementDate(m.date)?.getTime() ?? 0;
  return {
    id: m.docNumber, legacy: true, createdAt: ts ? new Date(ts).toISOString() : "", ts, kind: guessKind(reason), reason,
    itemId: "", itemName: "Earlier write-off", model: "Unspecified", category: "", branch: m.fromStore || "—", qty: m.items, unitCost: 0, value: 0,
    status: "posted", reportedBy: m.user || "—", reportedById: "", responsible: "", notes: "", photos: [], history: [],
  };
}

export function guessKind(reason: string): IncidentKind {
  return /lost|missing|theft|shortage|stolen/i.test(reason) ? "loss" : "damage";
}

/** All incidents: workflow documents plus any older movement-only write-offs. */
export function buildIncidents(docs: InvDoc[], movements: StockMovement[]): Incident[] {
  const covered = new Set(docs.map((d) => d.id));
  const legacy = movements.filter(isWriteOff).filter((m) => !covered.has(m.docNumber.split("/")[0])).map(incidentFromMovement);
  return [...docs.map(incidentFromDoc), ...legacy].sort((a, b) => b.ts - a.ts);
}

/* ── Approval rules ─────────────────────────────────────────────────────── */
/** Which permission a move to `to` needs. Mirrors `loss_damage_guard` in migration 0126. */
export function stepKeys(to: string): PermissionKey[] {
  switch (to) {
    case "verified": case "investigating": return CAP.lossDamage.verify;
    case "approved": case "quarantined": case "restored": return CAP.lossDamage.approve;
    case "rejected": return CAP.lossDamage.reject;
    default: return [];
  }
}
export const canMoveTo = (can: (k: PermissionKey) => boolean, to: string): boolean => {
  const keys = stepKeys(to);
  return keys.length > 0 && allow(can, keys);
};

/** A reporter never verifies or approves their own incident (same rule as Deals). */
export function isOwnIncident(i: Pick<Incident, "reportedById">, myId: string | undefined): boolean {
  return !!myId && !!i.reportedById && i.reportedById === myId;
}
/** Owners (full access) may review their own report, so a one-owner shop is not stuck. It is flagged as self-reviewed. */
export const canReviewOwn = (can: (k: PermissionKey) => boolean): boolean => can("full_access");

/** What this person can do to an incident right now, as buttons. Same rules as the detail page and the DB guard.
 *  `chain` = a manager/owner who can both verify and approve gets ONE "Approve" button that does both steps. */
export type QuickAction = { key: string; label: string; tone: "primary" | "danger" | "outline"; action: DocAction; chain?: boolean };
export function quickActions(inc: Incident, can: (k: PermissionKey) => boolean, myId: string | undefined): QuickAction[] {
  if (inc.legacy || !inc.doc) return [];
  if (isOwnIncident(inc, myId) && !canReviewOwn(can)) return [];
  const step = (status: string, to: string) => DOC_META.write_off.actions(status).find((a) => a.to === to && canMoveTo(can, a.to));
  const out: QuickAction[] = [];
  const s = inc.status;
  if (s === "reported" || s === "investigating") {
    const verify = step(s, "verified");
    const approve = DOC_META.write_off.actions("verified").find((a) => a.to === "approved");
    if (verify && approve && canMoveTo(can, "approved")) out.push({ key: "approve", label: "Approve", tone: "primary", action: approve, chain: true });
    else if (verify) out.push({ key: "verify", label: "Verify", tone: "primary", action: verify });
  } else if (s === "verified") {
    const approve = step(s, "approved");
    if (approve) out.push({ key: "approve", label: "Approve", tone: "primary", action: approve });
  } else if (s === "quarantined") {
    const wo = step(s, "approved");
    if (wo) out.push({ key: "writeoff", label: "Write off", tone: "primary", action: wo });
  }
  const reject = step(s, "rejected");
  if (reject) out.push({ key: "reject", label: "Reject", tone: "danger", action: reject });
  return out;
}
/** Incidents this person could act on right now (drives the "waiting for you" banner). */
export function actionableFor(rows: Incident[], can: (k: PermissionKey) => boolean, myId: string | undefined): Incident[] {
  return rows.filter((r) => NEEDS_DECISION.has(r.status) && quickActions(r, can, myId).length > 0);
}

/* ── KPIs ───────────────────────────────────────────────────────────────── */
export type LossKpis = {
  incidents: number; needsAction: number; quarantined: number;
  confirmedLoss: number; confirmedDamage: number; confirmedUnits: number; atRisk: number;
};
export function computeKpis(rows: Incident[]): LossKpis {
  const k: LossKpis = { incidents: rows.length, needsAction: 0, quarantined: 0, confirmedLoss: 0, confirmedDamage: 0, confirmedUnits: 0, atRisk: 0 };
  for (const r of rows) {
    if (NEEDS_DECISION.has(r.status)) k.needsAction++;
    if (r.status === "quarantined") k.quarantined++;
    if (CONFIRMED.has(r.status)) {
      k.confirmedUnits += r.qty;
      if (r.kind === "loss") k.confirmedLoss += r.value; else k.confirmedDamage += r.value;
    } else if (OPEN.has(r.status)) k.atRisk += r.value;
  }
  return k;
}

/* ── Reports ────────────────────────────────────────────────────────────── */
export type GroupBy = "model" | "item" | "model_item" | "month" | "branch" | "reporter" | "responsible" | "reason";
export const GROUP_OPTIONS: { value: GroupBy; label: string; heading: string }[] = [
  { value: "model", label: "Model", heading: "Model" },
  { value: "item", label: "Item", heading: "Item" },
  { value: "model_item", label: "Model + Item", heading: "Model · Item" },
  { value: "month", label: "Month", heading: "Month" },
  { value: "branch", label: "Branch", heading: "Branch" },
  { value: "reporter", label: "Reported by", heading: "Reported by" },
  { value: "responsible", label: "Responsible", heading: "Responsible" },
  { value: "reason", label: "Reason", heading: "Reason" },
];

export type ReportBasis = "confirmed" | "all";

export type ReportRow = {
  key: string; label: string; sub?: string;
  incidents: number; qty: number; lossQty: number; damageQty: number; lossValue: number; damageValue: number; total: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthKey(ts: number): string {
  if (!ts) return "unknown";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "Unknown";
}

function groupOf(r: Incident, by: GroupBy): { key: string; label: string; sub?: string } {
  switch (by) {
    case "model": return { key: r.model, label: r.model };
    case "item": return { key: r.itemId || r.itemName, label: r.itemName, sub: r.itemId || undefined };
    case "model_item": return { key: `${r.model}||${r.itemId || r.itemName}`, label: `${r.model} – ${r.itemName}`, sub: r.itemId || undefined };
    case "month": { const k = monthKey(r.ts); return { key: k, label: monthLabel(k) }; }
    case "branch": return { key: r.branch, label: r.branch };
    case "reporter": return { key: r.reportedBy, label: r.reportedBy };
    case "responsible": return { key: r.responsible || "—", label: r.responsible || "Not assigned" };
    case "reason": return { key: r.reason, label: r.reason };
  }
}

/** Group incidents. `basis` "confirmed" = approved write-offs only (the financial truth). */
export function buildReport(rows: Incident[], by: GroupBy, basis: ReportBasis): ReportRow[] {
  const src = basis === "confirmed" ? rows.filter((r) => CONFIRMED.has(r.status)) : rows.filter((r) => r.status !== "rejected" && r.status !== "restored");
  const map = new Map<string, ReportRow>();
  for (const r of src) {
    const g = groupOf(r, by);
    const row = map.get(g.key) ?? { key: g.key, label: g.label, sub: g.sub, incidents: 0, qty: 0, lossQty: 0, damageQty: 0, lossValue: 0, damageValue: 0, total: 0 };
    row.incidents++; row.qty += r.qty;
    if (r.kind === "loss") { row.lossQty += r.qty; row.lossValue += r.value; } else { row.damageQty += r.qty; row.damageValue += r.value; }
    row.total += r.value;
    map.set(g.key, row);
  }
  const out = [...map.values()];
  if (by === "month") return out.sort((a, b) => b.key.localeCompare(a.key));
  return out.sort((a, b) => b.total - a.total || b.qty - a.qty || a.label.localeCompare(b.label));
}

export function reportTotals(rows: ReportRow[]): ReportRow {
  return rows.reduce<ReportRow>((t, r) => ({
    key: "total", label: "Total", incidents: t.incidents + r.incidents, qty: t.qty + r.qty, lossQty: t.lossQty + r.lossQty, damageQty: t.damageQty + r.damageQty,
    lossValue: t.lossValue + r.lossValue, damageValue: t.damageValue + r.damageValue, total: t.total + r.total,
  }), { key: "total", label: "Total", incidents: 0, qty: 0, lossQty: 0, damageQty: 0, lossValue: 0, damageValue: 0, total: 0 });
}

/** ONE row-builder for Excel and CSV so the export equals the on-screen report. */
export function reportExport(rows: ReportRow[], by: GroupBy, withValue: boolean): { headers: string[]; rows: (string | number)[][] } {
  const heading = GROUP_OPTIONS.find((g) => g.value === by)?.heading ?? "Group";
  const headers = [heading, "Incidents", "Loss qty", "Damage qty", "Total qty", ...(withValue ? ["Loss value", "Damage value", "Total value"] : [])];
  const body = [...rows, reportTotals(rows)].map((r) => [
    r.label, r.incidents, r.lossQty, r.damageQty, r.qty, ...(withValue ? [r.lossValue, r.damageValue, r.total] : []),
  ]);
  return { headers, rows: body };
}

/** The incident register as a spreadsheet (every column the register shows). */
export function registerExport(rows: Incident[], withValue: boolean, statusLabel: (s: string) => string): { headers: string[]; rows: (string | number)[][] } {
  const headers = ["Incident", "Date", "Type", "Reason", "Status", "Model", "Item", "SKU", "Category", "Branch", "Qty", ...(withValue ? ["Unit cost", "Value"] : []), "Reported by", "Responsible", "Notes"];
  const body = rows.map((r) => [
    r.id, r.createdAt ? r.createdAt.slice(0, 10) : "", KIND_LABEL[r.kind], r.reason, statusLabel(r.status), r.model, r.itemName, r.itemId, r.category, r.branch, r.qty,
    ...(withValue ? [r.unitCost, r.value] : []), r.reportedBy, r.responsible, r.notes,
  ]);
  return { headers, rows: body };
}

/** Quantity already waiting in unresolved incidents for an item (so a second report can't double-claim stock). */
export function pendingQtyFor(rows: Incident[], itemId: string): number {
  return rows.filter((r) => r.itemId === itemId && OPEN.has(r.status) && r.status !== "quarantined").reduce((s, r) => s + r.qty, 0);
}
