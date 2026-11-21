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
import type { MovementType } from "@/lib/inventory-data";

type Adjust = { itemId: string; delta: number; label: string; type: MovementType; unitCost?: number; doc: string };

export function useInventoryActions() {
  const { inventory, addStockMovement, updateInventoryItem } = useStore();
  const { currentUser, isDemoMode } = usePermissions();
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
    await addStockMovement({
      docNumber: a.doc, fromStore: a.delta > 0 ? a.label : item.store, toStore: a.delta > 0 ? item.store : a.label,
      items: Math.abs(a.delta), date: new Date().toLocaleDateString("en-IN"), user: who, type: a.type, status: "completed",
    }, { itemId: a.itemId });
    return true;
  }, [useDb, updateInventoryItem, addStockMovement, who]);

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
        const label = doc.type === "transfer" ? `Transfer ${doc.id} → ${doc.party}` : `Vendor return ${doc.id} → ${doc.party}`;
        for (let i = 0; i < doc.lines.length; i++) {
          if (!(await adjust({ itemId: doc.lines[i].itemId, delta: -doc.lines[i].qty, label, type, doc: mv(i) }))) return false;
        }
        return true;
      }
      case "transfer_in": {
        for (let i = 0; i < doc.lines.length; i++) {
          const l = doc.lines[i];
          if (!(await adjust({ itemId: l.toItemId || l.itemId, delta: l.qty, label: `Transfer ${doc.id}`, type: "Transfer", doc: `${mv(i)}-IN` }))) return false;
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

  /** Write off damaged / lost stock: post the stock-out, then record the document. */
  const writeOff = useCallback(async (itemId: string, qty: number, reason: string, note: string): Promise<boolean> => {
    const item = invRef.current.find((i) => i.id === itemId);
    if (!item) return false;
    const id = opsRef.current.nextDocId("write_off");
    if (!(await adjust({ itemId, delta: -qty, label: `Write-off: ${reason}`, type: "Adjustment", doc: `${id}/1` }))) return false;
    return opsRef.current.saveDoc({
      id, type: "write_off", status: "posted", party: reason, ref: "", lines: [{ itemId, name: item.name, qty, reason }],
      data: { note, location: item.store }, createdBy: who, createdAt: "", updatedAt: "",
    });
  }, [adjust, who]);

  return { adjust, runAction, createDoc, writeOff, canRemove };
}
