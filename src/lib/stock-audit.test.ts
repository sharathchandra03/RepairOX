import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accuracyByAudit, applyRecount, auditMeta, canApproveAudit, canMoveTo, hasHighVariance, isHighLine, lineState, notAuditedSince,
  repeatVariance, shrinkage, submitBlockers, summarize, systemHidden, varianceValue,
} from "./stock-audit";
import type { DocLine, InvDoc } from "./inventory-ops";
import type { InventoryItem } from "./inventory-data";
import type { PermissionKey } from "./permissions";

const L = (itemId: string, system: number, counted?: number, extra: Partial<DocLine> = {}): DocLine => ({ itemId, name: itemId, qty: 0, system, counted, ...extra });
const doc = (status: string, lines: DocLine[], data: InvDoc["data"] = {}, id = "CNT-0001"): InvDoc => ({
  id, type: "stock_count", status, party: "Main", ref: "", lines, data, createdBy: "A", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-02-01T00:00:00Z",
});
const canWith = (...keys: PermissionKey[]) => (k: PermissionKey) => keys.includes(k);

test("line state + variance", () => {
  assert.equal(lineState(L("a", 5)), "not_counted");
  assert.equal(lineState(L("a", 5, 5)), "matched");
  assert.equal(lineState(L("a", 5, 3)), "short");
  assert.equal(lineState(L("a", 5, 9)), "excess");
  assert.equal(lineState(L("a", 5, undefined, { recount: true })), "recount");
});
test("zero counted is a real count, not 'not counted'", () => {
  assert.equal(lineState(L("a", 4, 0)), "short");
});
test("high variance: 10 units, or 25% and >= 2 units", () => {
  assert.equal(isHighLine(L("a", 100, 90)), true);
  assert.equal(isHighLine(L("a", 100, 91)), false);
  assert.equal(isHighLine(L("a", 8, 6)), true);   // 2 units = 25%
  assert.equal(isHighLine(L("a", 8, 7)), false);  // 1 unit
  assert.equal(isHighLine(L("a", 0, 1)), false);
  assert.equal(hasHighVariance([L("a", 5, 5), L("b", 100, 80)]), true);
});
test("summary + accuracy", () => {
  const s = summarize([L("a", 5, 5), L("b", 5, 3), L("c", 5, 8), L("d", 5)]);
  assert.deepEqual([s.counted, s.matched, s.short, s.excess, s.notCounted], [3, 1, 1, 1, 1]);
  assert.equal(s.shortUnits, 2); assert.equal(s.excessUnits, 3); assert.equal(s.netUnits, 1);
  assert.equal(s.accuracy, 1 / 3); assert.equal(s.complete, false);
  assert.equal(summarize([]).accuracy, null);
});
test("submit blockers: uncounted and missing reasons", () => {
  assert.equal(submitBlockers([L("a", 5, 5)]).length, 0);
  assert.equal(submitBlockers([L("a", 5)]).length, 1);
  assert.equal(submitBlockers([L("a", 5, 4)]).length, 1);
  assert.equal(submitBlockers([L("a", 5, 4, { reason: "Other" })]).length, 0);
  assert.equal(submitBlockers([]).length, 1);
  assert.equal(submitBlockers([L("a", 5, 4)], true).length, 0); // blind: reviewer decides
});
test("variance value", () => {
  const v = varianceValue([L("a", 5, 3), L("b", 5, 6)], (id) => (id === "a" ? 100 : 40));
  assert.deepEqual(v, { short: 200, excess: 40, net: -160 });
});
test("recount clears flagged lines only", () => {
  const out = applyRecount([L("a", 5, 3, { recount: true, reason: "Other", countedBy: "X" }), L("b", 5, 5)]);
  assert.equal(out[0].counted, undefined); assert.equal(out[0].reason, undefined); assert.equal(out[0].recount, true);
  assert.equal(out[1].counted, 5);
});
test("blind audit hides system qty from counters only while counting", () => {
  const d = doc("draft", [L("a", 5)], { blind: true });
  assert.equal(systemHidden(d, canWith("stock_audit_count")), true);
  assert.equal(systemHidden(d, canWith("stock_audit_count", "stock_audit_see_system_qty")), false);
  assert.equal(systemHidden({ ...d, status: "submitted" }, canWith("stock_audit_count")), false);
  assert.equal(systemHidden(doc("draft", [L("a", 5)]), canWith("stock_audit_count")), false);
});
test("workflow keys per step", () => {
  assert.equal(canMoveTo(canWith("stock_audit_count"), "draft", "submitted"), true);
  assert.equal(canMoveTo(canWith("stock_audit_count"), "submitted", "approved"), false);
  assert.equal(canMoveTo(canWith("stock_audit_approve"), "submitted", "approved"), true);
  assert.equal(canMoveTo(canWith("stock_audit_review"), "submitted", "draft"), true);
  assert.equal(canMoveTo(canWith("stock_audit_approve"), "draft", "cancelled"), false);
  assert.equal(canMoveTo(canWith("stock_audit_cancel"), "draft", "cancelled"), true);
});
test("approval rules: self-approval and high variance", () => {
  const ok = doc("submitted", [L("a", 5, 4, { countedById: "u1" })], { submittedById: "u1" });
  assert.equal(canApproveAudit(ok, canWith("stock_audit_approve"), "u2").ok, true);
  assert.equal(canApproveAudit(ok, canWith("stock_audit_approve"), "u1").ok, false);
  assert.equal(canApproveAudit(ok, canWith("stock_audit_approve", "full_access"), "u1").ok, true);
  const high = doc("submitted", [L("a", 100, 50, { countedById: "u1" })]);
  assert.equal(canApproveAudit(high, canWith("stock_audit_approve"), "u2").ok, false);
  assert.equal(canApproveAudit(high, canWith("stock_audit_approve", "stock_audit_approve_high"), "u2").ok, true);
  assert.equal(canApproveAudit(doc("draft", []), canWith("stock_audit_approve"), "u2").ok, false);
});
test("reports use approved audits only", () => {
  const a = doc("approved", [L("a", 5, 3, { category: "Display", reason: "Lost or theft", countedBy: "Ravi" }), L("b", 5, 5, { category: "Battery", countedBy: "Ravi" })]);
  const draft = doc("draft", [L("a", 5, 0)], {}, "CNT-0002");
  assert.equal(accuracyByAudit([a, draft]).length, 1);
  assert.equal(accuracyByAudit([a])[0].accuracy, 0.5);
  const s = shrinkage([a, draft], "category", () => 10);
  assert.equal(s[0].label, "Display"); assert.equal(s[0].value, -20);
  assert.equal(repeatVariance([a, { ...a, id: "CNT-0003" }])[0].times, 2);
});
test("not audited since", () => {
  const item = (id: string) => ({ id, name: id } as InventoryItem);
  const a = doc("approved", [L("x", 5, 5)]);
  const now = new Date("2026-02-11T00:00:00Z").getTime();
  const r = notAuditedSince([item("x"), item("y")], [a], 5, now);
  assert.deepEqual(r.map((s) => s.item.id), ["y", "x"]);
  assert.equal(notAuditedSince([item("x")], [a], 30, now).length, 0);
});
test("audit meta defaults", () => {
  const m = auditMeta(doc("draft", [], {}));
  assert.equal(m.kind, "full"); assert.equal(m.blind, false);
});
