"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Inventory actions — the ONE place that turns a document transition into stock
   movements. Supabase mode posts through atomic RPCs (post_stock_receipt for
   costed purchases, post_stock_adjust for everything else: cost layers + balance
   + movement row in one transaction). Demo / local mode updates the item and
   logs the movement client-side.

   Multi-line documents post line by line. Outbound documents are pre-checked
   (every line must have enough stock) so a partial post cannot happen for lack
   of stock.
   ────────────────────────────────────────────────────────────────────────── */

import { useCallback, useRef } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { toast } from "@/components/ui/toaster";
import { DOC_META, type DocAction, type DocLine, type InvDoc, type DocType } from "@/lib/inventory-ops";
import { CAP, allow } from "@/lib/capabilities";
import { canMoveTo, canReviewOwn } from "@/lib/loss-damage";
import type { MovementType } from "@/lib/inventory-data";

type Adjust = { itemId: string; delta: number; label: string; type: MovementType; unitCost?: number; doc: string };

export function useInventoryActions() {
  const { inventory, addStockMovement, updateInventoryItem, noteReceiptLocally } = useStore();
  const { currentUser, isDemoMode, can } = usePermissions();
  const ops = useInventoryOps();
  const invRef = useRef(inventory); invRef.current = inventory;
  const opsRef = useRef(ops); opsRef.current = ops;
  const useDb = isSupabaseConfigured && !!supabase && !isDemoMode;
  const who = currentUser?.name ?? "";

  const adjust = useCallback(async (a: Adjust): Promise<boolean> => {
    const item = invRef.current.find((i) => i.id === a.itemId);
    if (!item) { toast.error(`Item ${a.itemId} not found`); return false; }
    if (a.delta < 0 && item.currentStock + a.delta < 0) { toast.error(`${item.name}: only ${item.currentStock} on hand`); return false; }
    if (useDb && supabase) {
      if (a.delta > 0 && a.type === "Inward" && a.unitCost !== undefined) {
        const { error } = await supabase.rpc("post_stock_receipt", { p_item_id: a.itemId, p_qty: a.delta, p_unit_cost: a.unitCost, p_source: "purchase" });
        if (error) { toast.error(`Stock post failed: ${error.message}`); return false; }
        noteReceiptLocally(a.itemId, a.delta, a.unitCost, "purchase");
        return true;
      }
      const { error } = await supabase.rpc("post_stock_adjust", {
        p_item_id: a.itemId, p_delta: a.delta, p_label: a.label, p_type: a.type, p_unit_cost: a.unitCost ?? null, p_doc: a.doc,
      });
      if (error) {
        toast.error(error.message.includes("post_stock_adjust") && error.message.includes("does not exist")
          ? "Apply migration 0119 (npm run db:migrate) to post stock."
          : `Stock post failed: ${error.message}`);
        return false;
      }
      return true;
    }
    await updateInventoryItem(a.itemId, { currentStock: item.currentStock + a.delta });
    if (a.delta > 0 && a.type === "Inward" && a.unitCost !== undefined) noteReceiptLocally(a.itemId, a.delta, a.unitCost, "purchase");
    await addStockMovement({
      docNumber: a.doc, fromStore: a.delta > 0 ? a.label : item.store, toStore: a.delta > 0 ? item.store : a.label,
      items: Math.abs(a.delta), date: new Date().toLocaleDateString("en-IN"), user: who, type: a.type, status: "completed",
    }, { itemId: a.itemId });
    return true;
  }, [useDb, updateInventoryItem, addStockMovement, noteReceiptLocally, who]);

  /** Every line has enough stock for an outbound post. */
  const canRemove = useCallback((lines: DocLine[]): boolean => {
    for (const l of lines) {
      const it = invRef.current.find((i) => i.id === l.itemId);
      if (!it || it.currentStock < l.qty) { toast.error(`${l.name}: only ${it?.currentStock ?? 0} on hand, need ${l.qty}`); return false; }
    }
    return true;
  }, []);

  const post = useCallback(async (doc: InvDoc, action: DocAction): Promise<boolean> => {
    const mv = (i: number) => `${doc.id}/${i + 1}`;
    switch (action.effect) {
      case "out": {
        if (!canRemove(doc.lines)) return false;
        const type: MovementType = doc.type === "transfer" ? "Transfer" : "Outward";
        const label = doc.type === "transfer" ? (doc.party || `Transfer ${doc.id}`) : `Vendor return ${doc.id} → ${doc.party}`;
        for (let i = 0; i < doc.lines.length; i++) {
          if (!(await adjust({ itemId: doc.lines[i].itemId, delta: -doc.lines[i].qty, label, type, doc: mv(i) }))) return false;
        }
        return true;
      }
      case "transfer_in": {
        for (let i = 0; i < doc.lines.length; i++) {
          const l = doc.lines[i];
          if (!(await adjust({ itemId: l.toItemId || l.itemId, delta: l.qty, label: typeof doc.data.fromStore === "string" && doc.data.fromStore ? doc.data.fromStore : `Transfer ${doc.id}`, type: "Transfer", doc: `${mv(i)}-IN` }))) return false;
        }
        return true;
      }
      case "grn_in": {
        for (let i = 0; i < doc.lines.length; i++) {
          const l = doc.lines[i];
          if (!(await adjust({ itemId: l.itemId, delta: l.qty, label: `${doc.party || "Vendor"} · ${doc.id}`, type: "Inward", unitCost: l.unitCost ?? 0, doc: mv(i) }))) return false;
        }
        // Roll the receipt up into the purchase order.
        const po = doc.ref ? opsRef.current.getDoc(doc.ref) : undefined;
        if (po) {
          const lines = po.lines.map((pl) => {
            const got = doc.lines.filter((g) => g.itemId === pl.itemId).reduce((s, g) => s + g.qty, 0);
            return { ...pl, received: (pl.received ?? 0) + got };
          });
          const done = lines.every((l) => (l.received ?? 0) >= l.qty);
          await opsRef.current.saveDoc({ ...po, lines, status: done ? "received" : "partial" });
        }
        return true;
      }
      case "count_variance": {
        for (let i = 0; i < doc.lines.length; i++) {
          const l = doc.lines[i];
          const delta = (l.counted ?? l.system ?? 0) - (l.system ?? 0);
          if (delta !== 0 && !(await adjust({ itemId: l.itemId, delta, label: `Stock count ${doc.id}`, type: "Adjustment", doc: mv(i) }))) return false;
        }
        return true;
      }
      case "replacement_in": {
        for (let i = 0; i < doc.lines.length; i++) {
          const l = doc.lines[i];
          if (!(await adjust({ itemId: l.itemId, delta: l.qty, label: `Replacement · ${doc.id}`, type: "Inward", doc: `${mv(i)}-REP` }))) return false;
        }
        return true;
      }
      case "writeoff_out": {
        if (!canRemove(doc.lines)) return false;
        for (let i = 0; i < doc.lines.length; i++) {
          // "Write-off: <reason>" + a WO- doc number keep the movement recognisable to the stock ledger helpers.
          if (!(await adjust({ itemId: doc.lines[i].itemId, delta: -doc.lines[i].qty, label: `Write-off: ${doc.party || "Other"}`, type: "Adjustment", doc: mv(i) }))) return false;
        }
        return true;
      }
      default:
        return true;
    }
  }, [adjust, canRemove]);

  /** Move a document to its next status, posting any stock effect first. */
  const runAction = useCallback(async (doc: InvDoc, action: DocAction): Promise<boolean> => {
    if (action.effect && !(await post(doc, action))) return false;
    // grn_in already saved the PO; the GRN itself still needs its new status.
    const ok = await opsRef.current.saveDoc({ ...doc, status: action.to });
    if (ok) toast.success(`${doc.id}: ${DOC_META[doc.type].statuses[action.to]?.label ?? action.to}`);
    return ok;
  }, [post]);

  /** Create a document (no stock effect) and return it. */
  const createDoc = useCallback(async (type: DocType, fields: Partial<Pick<InvDoc, "party" | "ref" | "lines" | "data">>): Promise<InvDoc | null> => {
    const doc: InvDoc = {
      id: opsRef.current.nextDocId(type), type, status: DOC_META[type].initial,
      party: fields.party ?? "", ref: fields.ref ?? "", lines: fields.lines ?? [], data: fields.data ?? {},
      createdBy: who, createdAt: "", updatedAt: "",
    };
    return (await opsRef.current.saveDoc(doc)) ? doc : null;
  }, [who]);

  /** Report a loss / damage incident. No stock moves until a manager approves it. */
  const reportIncident = useCallback(async (i: {
    itemId: string; qty: number; kind: "loss" | "damage"; reason: string; model: string; branch: string;
    responsible: string; note: string; photos: string[]; unitCost: number;
  }): Promise<InvDoc | null> => {
    if (!allow(can, CAP.lossDamage.report)) { toast.error("You don't have access to report loss or damage."); return null; }
    const item = invRef.current.find((x) => x.id === i.itemId);
    if (!item) return null;
    const now = new Date().toISOString();
    return createDoc("write_off", {
      party: i.reason,
      lines: [{ itemId: item.id, name: item.name, qty: i.qty, reason: i.reason }],
      data: {
        kind: i.kind, model: i.model, category: item.category, branch: i.branch, location: i.branch, responsible: i.responsible,
        note: i.note, unitCost: i.unitCost, reportedQty: i.qty, reportedById: currentUser?.id ?? "",
        photos: i.photos, // small data-URL images
        history: [{ at: now, by: who, status: "reported", note: i.note || undefined }],
      },
    });
  }, [createDoc, currentUser?.id, who, can]);

  type StepOpts = { note?: string; qty?: number; unitCost?: number };

  /** Build the next document for one approval step (history entry, verified quantity, cost, self-review flag). */
  const stepDoc = useCallback((base: InvDoc, action: DocAction, opts: StepOpts, own: boolean): InvDoc => {
    const at = new Date().toISOString();
    const prev = Array.isArray(base.data.history) ? (base.data.history as unknown as object[]) : [];
    const qty = opts.qty !== undefined && opts.qty > 0 ? opts.qty : base.lines[0]?.qty ?? 0;
    const lines = base.lines.map((l, idx) => (idx === 0 ? { ...l, qty } : l));
    return {
      ...base, lines,
      data: {
        ...base.data,
        ...(opts.unitCost !== undefined ? { unitCost: opts.unitCost } : {}),
        ...(qty !== base.lines[0]?.qty ? { verifiedQty: qty } : {}),
        decidedBy: who, decidedById: currentUser?.id ?? "", decidedAt: at,
        ...(own ? { selfReviewed: true } : {}),
        history: [...prev, { at, by: who, status: action.to, note: opts.note || undefined, ...(own ? { self: true } : {}) }],
      },
    };
  }, [currentUser?.id, who]);

  /** Checks shared by every step: permission, own-report rule, and "someone else already moved it". */
  const guardStep = useCallback((doc: InvDoc, to: string): { live: InvDoc; own: boolean } | null => {
    // Same rules as the database guard (migrations 0126/0127), checked first so stock is never posted for a move that would be refused.
    if (!canMoveTo(can, to)) { toast.error("You don't have access to do this step."); return null; }
    const own = !!doc.data.reportedById && doc.data.reportedById === currentUser?.id;
    if (own && !canReviewOwn(can)) { toast.error("Another approver has to review an incident you reported."); return null; }
    const live = opsRef.current.getDoc(doc.id);
    if (!live || live.status !== doc.status) { toast.error(`${doc.id} was just updated by someone else. Reload and check its status.`); return null; }
    return { live, own };
  }, [can, currentUser?.id]);

  /** Move an incident through ONE step of the approval workflow (verify / approve / reject / quarantine …). */
  const decideIncident = useCallback(async (doc: InvDoc, action: DocAction, opts: StepOpts = {}): Promise<boolean> => {
    const g = guardStep(doc, action.to);
    if (!g) return false;
    return runAction(stepDoc(g.live, action, opts, g.own), action);
  }, [guardStep, stepDoc, runAction]);

  /** Manager / owner shortcut: verify AND approve the write-off in one go (two recorded steps). */
  const approveIncident = useCallback(async (doc: InvDoc, opts: StepOpts = {}): Promise<boolean> => {
    const verify = DOC_META.write_off.actions(doc.status).find((a) => a.to === "verified");
    const approve = DOC_META.write_off.actions("verified").find((a) => a.to === "approved");
    if (!verify || !approve) { toast.error("This incident can't be approved from its current status."); return false; }
    if (!canMoveTo(can, "verified")) { toast.error("You don't have access to verify incidents."); return false; }
    const g = guardStep(doc, "approved");
    if (!g) return false;
    const verified = stepDoc(g.live, verify, opts, g.own);
    // Nothing is written until we know the stock-out will succeed, so an incident is never left half-approved for lack of stock.
    if (!canRemove(verified.lines)) return false;
    if (!(await runAction(verified, verify))) return false;
    return runAction(stepDoc({ ...verified, status: "verified" }, approve, { note: opts.note }, g.own), approve);
  }, [can, guardStep, stepDoc, canRemove, runAction]);

  return { adjust, runAction, createDoc, reportIncident, decideIncident, approveIncident, canRemove };
}
