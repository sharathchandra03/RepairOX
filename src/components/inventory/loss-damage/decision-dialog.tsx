"use client";

/* One dialog for every approval step on an incident: verify, approve, reject,
   investigate, quarantine, restore. The server-side effects (stock write-off)
   run in use-inventory-actions → decideIncident. */

import { useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { useInventoryScope } from "@/components/inventory/inv-ui";
import { money } from "@/components/inventory/loss-damage/ld-ui";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import { useStore } from "@/lib/store";
import { DOC_META, type DocAction, type InvDoc } from "@/lib/inventory-ops";
import { incidentFromDoc, itemUnitCost } from "@/lib/loss-damage";

const FIELD = "mt-1.5 h-[34px] w-full rounded-xl border border-input bg-card px-3 text-[13px] tabular-nums outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15";

/** Steps that need a written reason from the approver. */
const NOTE_REQUIRED = new Set(["rejected", "investigating", "quarantined"]);

/** `chain` = verify + approve in one go (managers / owners who hold both permissions). */
export function DecisionDialog({ doc, action, chain = false, onClose }: { doc: InvDoc; action: DocAction | null; chain?: boolean; onClose: () => void }) {
  const { decideIncident, approveIncident } = useInventoryActions();
  const { canViewCost } = useInventoryScope();
  const { inventory } = useStore();
  const inc = incidentFromDoc(doc);
  const item = inventory.find((i) => i.id === inc.itemId);
  const [qty, setQty] = useState(String(inc.qty));
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!action) return;
    setQty(String(inc.qty)); setNote(""); setBusy(false);
    setCost(String(inc.unitCost || itemUnitCost(item) || ""));
    // Reset only when a different step opens, not on every live stock update.
  }, [action, doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!action) return null;
  const to = action.to;
  const verifying = to === "verified" || chain;
  const writing = action.effect === "writeoff_out";
  const n = Number(qty);
  const onHand = item?.currentStock ?? 0;
  const qtyOk = !verifying && !writing ? true : Number.isInteger(n) && n > 0 && n <= onHand;
  const noteOk = !NOTE_REQUIRED.has(to) || note.trim().length >= 3;
  const costNum = Number(cost);
  const costOk = !canViewCost || cost === "" || (Number.isFinite(costNum) && costNum >= 0);
  const danger = action.tone === "danger";

  async function submit() {
    if (!qtyOk || !noteOk || !costOk || busy || !action) return;
    setBusy(true);
    try {
      const opts = {
        note: note.trim() || undefined,
        qty: verifying ? n : undefined,
        unitCost: canViewCost && cost !== "" && (verifying || writing) ? costNum : undefined,
      };
      const ok = chain ? await approveIncident(doc, opts) : await decideIncident(doc, action, opts);
      if (ok) onClose();
    } finally { setBusy(false); }
  }

  return (
    <RoxCenteredForm
      open onClose={onClose} icon={danger ? AlertTriangle : BadgeCheck} width="max-w-lg"
      title={action.label} subtitle={`${doc.id} · ${inc.itemName}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={danger ? "destructive" : "primary"} onClick={submit} disabled={!qtyOk || !noteOk || !costOk || busy}>{busy ? "Working…" : "Confirm"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-muted/30 p-3.5 text-[13px]">
          <p>{chain ? <>Verifies the count and approves the write-off in one step. Both are recorded in the history.</> : <>Moves this incident to <b>{DOC_META.write_off.statuses[to]?.label ?? to}</b>.</>}</p>
          {writing && (
            <p className="mt-1.5 font-medium text-rose-700">
              This removes <b>{verifying ? (Number(qty) || inc.qty) : inc.qty}</b> × {inc.itemName} from stock ({onHand} on hand) and records the loss in the stock ledger.
            </p>
          )}
          {to === "restored" && <p className="mt-1.5 text-muted-foreground">Stock stays as it is. The part is back in usable stock.</p>}
        </div>

        {verifying && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Verified quantity</Label>
              <input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} className={FIELD} />
              <p className="mt-1 text-[11.5px] text-muted-foreground">Reported {inc.qty} · on hand {onHand}</p>
              {!qtyOk && <p className="mt-0.5 text-[11.5px] text-rose-600">Enter 1 – {onHand}.</p>}
            </div>
            {canViewCost && (
              <div>
                <Label>Unit cost (₹)</Label>
                <input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className={FIELD} />
                <p className="mt-1 text-[11.5px] text-muted-foreground">Impact {money((Number(qty) || 0) * (costNum || 0))}</p>
              </div>
            )}
          </div>
        )}
        {writing && canViewCost && !verifying && (
          <div>
            <Label>Unit cost (₹)</Label>
            <input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className={FIELD} />
            <p className="mt-1 text-[11.5px] text-muted-foreground">Financial impact {money(inc.qty * (costNum || 0))}</p>
          </div>
        )}

        <div>
          <Label>Remarks {NOTE_REQUIRED.has(to) && <span className="text-rose-600">*</span>}</Label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder={NOTE_REQUIRED.has(to) ? "Explain the decision. This is kept in the incident history." : "Optional note for the history"}
            className="mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
        </div>
      </div>
    </RoxCenteredForm>
  );
}
