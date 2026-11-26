/* ──────────────────────────────────────────────────────────────────────────
   Stock Audit — pure domain + report engine (no React, no I/O).
   An audit is ONE `stock_count` inventory document (lib/inventory-ops.ts). Lines carry
   the system quantity at the time the item was counted (`system`), the counted quantity
   and who/when. Stock moves ONLY when the audit is approved (effect `count_variance`).
   Posting `counted − system` is already reconciled for sales/receipts that happened
   between the count and the approval, because `system` is refreshed at count time.

   Workflow: draft (counting) → submitted → approved | rejected | draft (recount);
   draft/submitted → cancelled. Enforced in the database by `stock_audit_guard` (0128).
   HIGH VARIANCE (mirrors `stock_audit_is_high` in 0128): a line off by ≥ 10 units, or by
   ≥ 25% of system and at least 2 units. High-variance audits need `stock_audit_approve_high`.
   ────────────────────────────────────────────────────────────────────────── */
import type { PermissionKey } from "@/lib/permissions";
import { CAP, allow } from "@/lib/capabilities";
import type { DocLine, InvDoc } from "@/lib/inventory-ops";
import type { InventoryItem } from "@/lib/inventory-data";

export type AuditKind = "full" | "cycle" | "spot" | "recount";
export const AUDIT_KIND_LABEL: Record<AuditKind, string> = {
  full: "Full audit", cycle: "Cycle count", spot: "Spot check", recount: "Recount",
};
export const AUDIT_KIND_HINT: Record<AuditKind, string> = {
  full: "Every stocked item in the location",
  cycle: "One category or brand at a time",
  spot: "A handful of items you pick",
  recount: "Items from an earlier audit that need another look",
};
/** A reason is required for every line whose count differs from the system. */
export const VARIANCE_REASONS = [
  "Miscount earlier", "Damaged / defective", "Lost or theft", "Sale not recorded", "Receipt not recorded",
  "Wrong rack / location", "Issued to ticket, not billed", "Other",
] as const;

export const HIGH_ABS_UNITS = 10;
export const HIGH_PCT = 25;
export const HIGH_MIN_UNITS = 2;

/* ── Lines ──────────────────────────────────────────────────────────────── */
export const isCounted = (l: DocLine): boolean => typeof l.counted === "number" && Number.isFinite(l.counted);
export const lineVariance = (l: DocLine): number => (isCounted(l) ? (l.counted as number) - (l.system ?? 0) : 0);
export type LineState = "not_counted" | "matched" | "short" | "excess" | "recount";
export function lineState(l: DocLine): LineState {
  if (l.recount) return "recount";
  if (!isCounted(l)) return "not_counted";
  const v = lineVariance(l);
  return v === 0 ? "matched" : v < 0 ? "short" : "excess";
}
export const LINE_STATE_LABEL: Record<LineState, string> = {
  not_counted: "Not counted", matched: "Matched", short: "Short", excess: "Excess", recount: "Recount",
};
export function isHighLine(l: DocLine): boolean {
  if (!isCounted(l)) return false;
  const sys = l.system ?? 0;
  const abs = Math.abs(lineVariance(l));
  return abs >= HIGH_ABS_UNITS || (sys > 0 && abs >= HIGH_MIN_UNITS && abs * 100 >= sys * HIGH_PCT);
}
export const hasHighVariance = (lines: DocLine[]): boolean => lines.some(isHighLine);
export const lineNeedsReason = (l: DocLine): boolean => isCounted(l) && lineVariance(l) !== 0;

export type AuditSummary = {
  total: number; counted: number; matched: number; short: number; excess: number; notCounted: number; recount: number;
  shortUnits: number; excessUnits: number; netUnits: number; systemUnits: number; countedUnits: number;
  /** matched ÷ counted, 0..1. null until something is counted. */
  accuracy: number | null;
  complete: boolean;
  high: boolean;
};
export function summarize(lines: DocLine[]): AuditSummary {
  const s: AuditSummary = {
    total: lines.length, counted: 0, matched: 0, short: 0, excess: 0, notCounted: 0, recount: 0,
    shortUnits: 0, excessUnits: 0, netUnits: 0, systemUnits: 0, countedUnits: 0, accuracy: null, complete: false, high: false,
  };
  for (const l of lines) {
    s.systemUnits += l.system ?? 0;
    if (l.recount) s.recount++;
    if (!isCounted(l)) { s.notCounted++; continue; }
    s.counted++;
    s.countedUnits += l.counted as number;
    const v = lineVariance(l);
    if (v === 0) s.matched++;
    else if (v < 0) { s.short++; s.shortUnits += -v; }
    else { s.excess++; s.excessUnits += v; }
  }
  s.netUnits = s.excessUnits - s.shortUnits;
  s.accuracy = s.counted > 0 ? s.matched / s.counted : null;
  s.complete = s.total > 0 && s.notCounted === 0;
  s.high = hasHighVariance(lines);
  return s;
}
/** Money value of the net variance. Only call with a cost map when the viewer holds `viewCost`. */
export function varianceValue(lines: DocLine[], costOf: (itemId: string) => number): { short: number; excess: number; net: number } {
  let short = 0, excess = 0;
  for (const l of lines) {
    const v = lineVariance(l);
    if (v < 0) short += -v * costOf(l.itemId);
    else if (v > 0) excess += v * costOf(l.itemId);
  }
  return { short, excess, net: excess - short };
}
/** Lines that still block "Submit": uncounted lines, or a difference without a reason.
 *  On a BLIND audit the counter cannot see differences, so no reason is demanded (the reviewer decides). */
export function submitBlockers(lines: DocLine[], blind = false): string[] {
  const out: string[] = [];
  if (lines.length === 0) out.push("Add at least one item.");
  const open = lines.filter((l) => !isCounted(l)).length;
  if (open) out.push(`${open} item${open === 1 ? " is" : "s are"} not counted yet.`);
  const noReason = blind ? 0 : lines.filter((l) => lineNeedsReason(l) && !(l.reason ?? "").trim()).length;
  if (noReason) out.push(`${noReason} item${noReason === 1 ? " has" : "s have"} a difference without a reason.`);
  return out;
}

/* ── Document data ──────────────────────────────────────────────────────── */
export type AuditHistoryEntry = { at: string; by: string; status: string; note?: string; self?: boolean };
export type AuditMeta = {
  kind: AuditKind; blind: boolean; scope: string; notes: string; recountOf: string;
  createdById: string; submittedById: string; selfReviewed: boolean; history: AuditHistoryEntry[];
};
export function auditMeta(doc: InvDoc): AuditMeta {
  const d = doc.data;
  const kind = (["full", "cycle", "spot", "recount"] as const).find((k) => k === d.kind) ?? "full";
  return {
    kind, blind: d.blind === true, scope: typeof d.scope === "string" ? d.scope : doc.party,
    notes: typeof d.notes === "string" ? d.notes : "", recountOf: typeof d.recountOf === "string" ? d.recountOf : "",
    createdById: typeof d.createdById === "string" ? d.createdById : "", submittedById: typeof d.submittedById === "string" ? d.submittedById : "",
    selfReviewed: d.selfReviewed === true,
    history: Array.isArray(d.history) ? (d.history as unknown as AuditHistoryEntry[]) : [],
  };
}

/* ── Permissions (same rules as the DB guard, checked first in the UI) ───── */
type Can = (k: PermissionKey) => boolean;
/** Keys that allow moving an audit to a status. Mirrors `stock_audit_guard` (0128). */
export function stepKeys(from: string, to: string): PermissionKey[] {
  if (from === "draft" && to === "submitted") return [...CAP.stockAudit.count, ...CAP.stockAudit.create];
  if (to === "approved") return CAP.stockAudit.approve;
  if (to === "rejected") return [...CAP.stockAudit.review, ...CAP.stockAudit.approve];
  if (to === "draft") return CAP.stockAudit.review;
  if (to === "cancelled") return CAP.stockAudit.cancel;
  return [];
}
export const canMoveTo = (can: Can, from: string, to: string): boolean => { const k = stepKeys(from, to); return k.length > 0 && allow(can, k); };
/** Counters hide the system quantity on a blind audit while it is being counted, unless they hold the key. */
export function systemHidden(doc: InvDoc, can: Can): boolean {
  return auditMeta(doc).blind && doc.status === "draft" && !allow(can, CAP.stockAudit.seeSystemQty);
}
/** This person entered a count on, or submitted, the audit. */
export function isOwnCount(doc: InvDoc, myId: string | undefined): boolean {
  if (!myId) return false;
  return auditMeta(doc).submittedById === myId || doc.lines.some((l) => l.countedById === myId);
}
/** Owners (full access) may approve their own count so a one-owner shop is not stuck. It is flagged. */
export const canReviewOwn = (can: Can): boolean => can("full_access");
export type ApproveCheck = { ok: boolean; reason?: string };
export function canApproveAudit(doc: InvDoc, can: Can, myId: string | undefined): ApproveCheck {
  if (doc.status !== "submitted") return { ok: false, reason: "Only a submitted audit can be approved." };
  if (!canMoveTo(can, "submitted", "approved")) return { ok: false, reason: "You don't have access to approve stock audits." };
  if (hasHighVariance(doc.lines) && !allow(can, CAP.stockAudit.approveHigh)) return { ok: false, reason: "This audit has a high variance and needs a senior approver." };
  if (isOwnCount(doc, myId) && !canReviewOwn(can)) return { ok: false, reason: "Another approver has to approve an audit you counted." };
  return { ok: true };
}

/* ── Building an audit ──────────────────────────────────────────────────── */
export type AuditScope = { location: string; category: string; brand: string };
export const brandOf = (i: InventoryItem): string => (i.brandModel ?? "").split(/[\\/]/)[0].trim();
export function itemsInScope(items: InventoryItem[], s: AuditScope): InventoryItem[] {
  return items.filter((i) => (s.location === "all" || i.store === s.location) && (s.category === "all" || i.category === s.category) && (s.brand === "all" || brandOf(i) === s.brand));
}
export function scopeLabel(s: AuditScope, kind: AuditKind): string {
  const parts = [s.location !== "all" ? s.location : "All locations", s.category !== "all" ? s.category : "", s.brand !== "all" ? s.brand : ""].filter(Boolean);
  return kind === "spot" ? `Spot check · ${parts[0]}` : parts.join(" · ");
}
/** Snapshot the system quantity of each item at the moment the audit starts. */
export function lineFromItem(i: InventoryItem): DocLine {
  return {
    itemId: i.id, name: i.name, qty: 0, system: i.currentStock, systemStart: i.currentStock,
    category: i.category, brand: brandOf(i), location: i.store,
  };
}
/** Clear the counts of lines a reviewer flagged, keeping the flag + note so the counter knows why. */
export function applyRecount(lines: DocLine[]): DocLine[] {
  return lines.map((l) => (l.recount
    ? { ...l, counted: undefined, countedBy: undefined, countedById: undefined, countedAt: undefined, reason: undefined }
    : l));
}

/* ── Reports (approved audits only: they are the ones that corrected stock) ─ */
const ts = (iso: string): number => { const t = new Date(iso).getTime(); return Number.isNaN(t) ? 0 : t; };
export const approvedAudits = (docs: InvDoc[]): InvDoc[] => docs.filter((d) => d.type === "stock_count" && d.status === "approved");

export type AccuracyRow = { id: string; at: string; scope: string; counted: number; matched: number; accuracy: number | null; shortUnits: number; excessUnits: number };
export function accuracyByAudit(docs: InvDoc[]): AccuracyRow[] {
  return approvedAudits(docs).map((d) => {
    const s = summarize(d.lines);
    return { id: d.id, at: d.updatedAt, scope: auditMeta(d).scope, counted: s.counted, matched: s.matched, accuracy: s.accuracy, shortUnits: s.shortUnits, excessUnits: s.excessUnits };
  }).sort((a, b) => ts(b.at) - ts(a.at));
}
export type GroupBy = "category" | "item" | "counter" | "reason";
export type ShrinkRow = { key: string; label: string; lines: number; shortUnits: number; excessUnits: number; netUnits: number; value: number };
export function shrinkage(docs: InvDoc[], by: GroupBy, costOf?: (itemId: string) => number): ShrinkRow[] {
  const map = new Map<string, ShrinkRow>();
  for (const d of approvedAudits(docs)) {
    for (const l of d.lines) {
      const v = lineVariance(l);
      if (!isCounted(l)) continue;
      const label = by === "category" ? (l.category || "Uncategorised") : by === "item" ? l.name : by === "counter" ? (l.countedBy || "Unknown") : (l.reason || (v === 0 ? "Matched" : "No reason"));
      const key = by === "item" ? l.itemId : label;
      const r = map.get(key) ?? { key, label, lines: 0, shortUnits: 0, excessUnits: 0, netUnits: 0, value: 0 };
      r.lines++;
      if (v < 0) r.shortUnits += -v; else if (v > 0) r.excessUnits += v;
      r.netUnits += v;
      r.value += v * (costOf ? costOf(l.itemId) : 0);
      map.set(key, r);
    }
  }
  return [...map.values()].sort((a, b) => (a.value - b.value) || (a.netUnits - b.netUnits));
}
export type CounterAccuracy = { name: string; lines: number; matched: number; accuracy: number };
export function counterAccuracy(docs: InvDoc[]): CounterAccuracy[] {
  const map = new Map<string, { lines: number; matched: number }>();
  for (const d of approvedAudits(docs)) for (const l of d.lines) {
    if (!isCounted(l)) continue;
    const k = l.countedBy || "Unknown";
    const r = map.get(k) ?? { lines: 0, matched: 0 };
    r.lines++; if (lineVariance(l) === 0) r.matched++;
    map.set(k, r);
  }
  return [...map].map(([name, r]) => ({ name, lines: r.lines, matched: r.matched, accuracy: r.lines ? r.matched / r.lines : 0 })).sort((a, b) => b.lines - a.lines);
}
/** itemId → time (ms) it was last counted in an approved audit. */
export function lastAudited(docs: InvDoc[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of approvedAudits(docs)) for (const l of d.lines) if (isCounted(l)) out.set(l.itemId, Math.max(out.get(l.itemId) ?? 0, ts(d.updatedAt)));
  return out;
}
export type StaleItem = { item: InventoryItem; lastAt: number | null; days: number | null };
/** Stocked items not audited for `days` (or never). Oldest first, never-audited on top. */
export function notAuditedSince(items: InventoryItem[], docs: InvDoc[], days: number, now = Date.now()): StaleItem[] {
  const last = lastAudited(docs);
  const cutoff = now - days * 86_400_000;
  return items.flatMap((item) => {
    const at = last.get(item.id) ?? null;
    return at === null || at < cutoff ? [{ item, lastAt: at, days: at === null ? null : Math.floor((now - at) / 86_400_000) }] : [];
  }).sort((a, b) => (a.lastAt ?? 0) - (b.lastAt ?? 0));
}
/** Items that differed in two or more approved audits. */
export function repeatVariance(docs: InvDoc[]): { itemId: string; name: string; times: number; netUnits: number }[] {
  const map = new Map<string, { name: string; times: number; netUnits: number }>();
  for (const d of approvedAudits(docs)) for (const l of d.lines) {
    const v = lineVariance(l);
    if (!isCounted(l) || v === 0) continue;
    const r = map.get(l.itemId) ?? { name: l.name, times: 0, netUnits: 0 };
    r.times++; r.netUnits += v;
    map.set(l.itemId, r);
  }
  return [...map].filter(([, r]) => r.times >= 2).map(([itemId, r]) => ({ itemId, ...r })).sort((a, b) => b.times - a.times);
}

/* ── Export rows (ONE builder for Excel + CSV + on-screen sheet) ────────── */
export function sheetRows(doc: InvDoc, opts: { showSystem: boolean; showCost: boolean; costOf?: (id: string) => number }): { headers: string[]; rows: (string | number)[][] } {
  const headers = ["#", "Item", "SKU", "Category", ...(opts.showSystem ? ["System qty"] : []), "Counted", ...(opts.showSystem ? ["Difference"] : []), ...(opts.showSystem && opts.showCost ? ["Value difference"] : []), "Reason", "Counted by", "Counted at", "Note"];
  const rows = doc.lines.map((l, i) => {
    const v = lineVariance(l);
    return [
      i + 1, l.name, l.itemId, l.category ?? "", ...(opts.showSystem ? [l.system ?? 0] : []), isCounted(l) ? (l.counted as number) : "",
      ...(opts.showSystem ? [isCounted(l) ? v : ""] : []), ...(opts.showSystem && opts.showCost ? [isCounted(l) ? v * (opts.costOf?.(l.itemId) ?? 0) : ""] : []),
      l.reason ?? "", l.countedBy ?? "", l.countedAt ?? "", l.comment ?? "",
    ];
  });
  return { headers, rows };
}
