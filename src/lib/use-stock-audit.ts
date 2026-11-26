"use client";
/* Stock Audit actions. Every step re-checks the same rules as the database guard
   (migration 0128) first, so stock is never posted for a move that would be refused.
   Stock moves ONLY in `approve` (effect count_variance, via use-inventory-actions). */
import { useCallback, useRef } from "react";
import { usePermissions } from "@/lib/permissions-context";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import { useStore } from "@/lib/store";
import { CAP, allow } from "@/lib/capabilities";
import { toast } from "@/components/ui/toaster";
import { DOC_META, type DocLine, type InvDoc } from "@/lib/inventory-ops";
import {
  applyRecount, auditMeta, canApproveAudit, canMoveTo, lineVariance, submitBlockers,
  type AuditHistoryEntry, type AuditKind,
} from "@/lib/stock-audit";

export function useStockAudit() {
  const { currentUser, can } = usePermissions();
  const { inventory } = useStore();
  const ops = useInventoryOps();
  const { runAction, createDoc } = useInventoryActions();
  const invRef = useRef(inventory); invRef.current = inventory;
  const opsRef = useRef(ops); opsRef.current = ops;
  const who = currentUser?.name ?? "";
  const me = currentUser?.id ?? "";

  const history = (doc: InvDoc, status: string, note?: string, self?: boolean): AuditHistoryEntry[] => [
    ...auditMeta(doc).history,
    { at: new Date().toISOString(), by: who, status, ...(note ? { note } : {}), ...(self ? { self: true } : {}) },
  ];
  /** The latest saved copy, or null (with a toast) when someone else already moved it. */
  const fresh = useCallback((doc: InvDoc): InvDoc | null => {
    const live = opsRef.current.getDoc(doc.id);
    if (!live || live.status !== doc.status) { toast.error(`${doc.id} was just updated by someone else. Reload and check its status.`); return null; }
    return live;
  }, []);
  const action = (from: string, to: string) => DOC_META.stock_count.actions(from).find((a) => a.to === to);

  /** Start an audit. Lines carry the system-quantity snapshot taken now. */
  const createAudit = useCallback(async (i: { kind: AuditKind; blind: boolean; scope: string; notes: string; lines: DocLine[]; recountOf?: string }): Promise<InvDoc | null> => {
    if (!allow(can, CAP.stockAudit.create)) { toast.error("You don't have access to start a stock audit."); return null; }
    if (i.lines.length === 0) { toast.error("Add at least one item to audit."); return null; }
    const at = new Date().toISOString();
    return createDoc("stock_count", {
      party: i.scope, lines: i.lines,
      data: { kind: i.kind, blind: i.blind, scope: i.scope, notes: i.notes, recountOf: i.recountOf ?? "", createdById: me, history: [{ at, by: who, status: "draft", note: "Audit started" }] },
    });
  }, [can, createDoc, me, who]);

  /** Save one item's count. The system quantity is refreshed to what the system holds right now. */
  const countLine = useCallback(async (doc: InvDoc, itemId: string, counted: number, reason: string, note: string): Promise<boolean> => {
    if (!allow(can, [...CAP.stockAudit.count, ...CAP.stockAudit.create])) { toast.error("You don't have access to enter counts."); return false; }
    const live = fresh(doc); if (!live) return false;
    if (live.status !== "draft") { toast.error("This audit is no longer being counted."); return false; }
    if (!Number.isInteger(counted) || counted < 0) { toast.error("Enter a whole number, 0 or more."); return false; }
    const item = invRef.current.find((x) => x.id === itemId);
    const lines = live.lines.map((l) => {
      if (l.itemId !== itemId) return l;
      const system = item ? item.currentStock : l.system ?? 0;
      const next: DocLine = { ...l, system, counted, countedBy: who, countedById: me, countedAt: new Date().toISOString(), recount: false, recountNote: undefined, comment: note.trim() || undefined };
      next.reason = counted !== system ? reason : undefined;
      return next;
    });
    return opsRef.current.saveDoc({ ...live, lines });
  }, [can, fresh, me, who]);

  const submit = useCallback(async (doc: InvDoc): Promise<boolean> => {
    if (!canMoveTo(can, "draft", "submitted")) { toast.error("You don't have access to submit this audit."); return false; }
    const live = fresh(doc); if (!live) return false;
    const blockers = submitBlockers(live.lines, auditMeta(live).blind);
    if (blockers.length) { toast.error(blockers[0]); return false; }
    const a = action("draft", "submitted"); if (!a) return false;
    return runAction({ ...live, data: { ...live.data, submittedById: me, history: history(live, "submitted") } }, a);
  }, [can, fresh, me, runAction]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Approve and post the variance. Nothing is posted unless EVERY shortage can be taken from stock. */
  const approve = useCallback(async (doc: InvDoc, note: string): Promise<boolean> => {
    const live = fresh(doc); if (!live) return false;
    const check = canApproveAudit(live, can, me);
    if (!check.ok) { toast.error(check.reason ?? "You can't approve this audit."); return false; }
    for (const l of live.lines) {
      const v = lineVariance(l);
      const it = invRef.current.find((x) => x.id === l.itemId);
      if (v < 0 && (!it || it.currentStock + v < 0)) { toast.error(`${l.name}: only ${it?.currentStock ?? 0} on hand, cannot take off ${-v}. Ask for a recount.`); return false; }
    }
    const own = auditMeta(live).submittedById === me || live.lines.some((l) => l.countedById === me);
    const a = action("submitted", "approved"); if (!a) return false;
    return runAction({ ...live, data: { ...live.data, decidedBy: who, decidedById: me, decidedAt: new Date().toISOString(), ...(own ? { selfReviewed: true } : {}), history: history(live, "approved", note, own) } }, a);
  }, [can, fresh, me, runAction, who]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Send flagged lines back for another count. The audit returns to "Counting". */
  const requestRecount = useCallback(async (doc: InvDoc, flagged: Record<string, string>): Promise<boolean> => {
    if (!canMoveTo(can, "submitted", "draft")) { toast.error("You don't have access to request a recount."); return false; }
    const live = fresh(doc); if (!live) return false;
    const ids = Object.keys(flagged);
    if (ids.length === 0) { toast.error("Tick at least one item to recount."); return false; }
    const lines = applyRecount(live.lines.map((l) => (ids.includes(l.itemId) ? { ...l, recount: true, recountNote: flagged[l.itemId] || undefined } : l)));
    const a = action("submitted", "draft"); if (!a) return false;
    return runAction({ ...live, lines, data: { ...live.data, history: history(live, "draft", `Recount requested for ${ids.length} item${ids.length === 1 ? "" : "s"}`) } }, a);
  }, [can, fresh, runAction]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(async (doc: InvDoc, to: "rejected" | "cancelled", note: string): Promise<boolean> => {
    if (!canMoveTo(can, doc.status, to)) { toast.error("You don't have access to do this."); return false; }
    if (!note.trim()) { toast.error("Add a short reason."); return false; }
    const live = fresh(doc); if (!live) return false;
    const a = action(live.status, to) ?? (to === "rejected" ? { label: "Reject", to } : undefined);
    if (!a) return false;
    return runAction({ ...live, data: { ...live.data, decidedBy: who, decidedById: me, decidedAt: new Date().toISOString(), history: history(live, to, note.trim()) } }, a);
  }, [can, fresh, me, runAction, who]); // eslint-disable-line react-hooks/exhaustive-deps

  return { createAudit, countLine, submit, approve, requestRecount, close };
}
