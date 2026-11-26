"use client";

/* Report a loss / damage incident. Nothing moves in stock here: the incident
   starts as "Awaiting verification" and a different approver verifies and
   approves it before any quantity is written off. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Package, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/tabs";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { InfoHint } from "@/components/ui/info-hint";
import { InventorySearchBox } from "@/components/inventory/inventory-search-box";
import { useInventoryScope } from "@/components/inventory/inv-ui";
import { EvidencePicker, money } from "@/components/inventory/loss-damage/ld-ui";
import { toast } from "@/components/ui/toaster";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { availableStock } from "@/lib/inventory-analytics";
import { buildIncidents, itemUnitCost, modelOfItem, pendingQtyFor, reasonsFor, type IncidentKind } from "@/lib/loss-damage";
import type { InventoryItem } from "@/lib/inventory-data";

const FIELD = "mt-1.5 h-[34px] w-full rounded-xl border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15";
const NONE = "__none__";

export function ReportIncidentDialog({ open, onClose, initialItem }: { open: boolean; onClose: () => void; initialItem?: InventoryItem | null }) {
  const router = useRouter();
  const { can, team } = usePermissions();
  const { canViewCost } = useInventoryScope();
  const canReport = allow(can, CAP.lossDamage.report);
  const { docsOfType } = useInventoryOps();
  const { reportIncident } = useInventoryActions();

  const [kind, setKind] = useState<IncidentKind>("damage");
  const [item, setItem] = useState<InventoryItem | null>(initialItem ?? null);
  const [model, setModel] = useState(initialItem ? modelOfItem(initialItem) : "");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<string>("");
  const [responsible, setResponsible] = useState(NONE);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const reasons = reasonsFor(kind);
  const effReason = reasons.includes(reason) ? reason : reasons[0];
  const claimed = useMemo(() => (item ? pendingQtyFor(buildIncidents(docsOfType("write_off"), []), item.id) : 0), [item, docsOfType]);
  const room = item ? Math.max(item.currentStock - claimed, 0) : 0;
  const n = Number(qty);
  const qtyOk = Number.isInteger(n) && n > 0 && !!item && n <= room;
  const noteOk = kind !== "loss" || note.trim().length >= 3;
  const people = useMemo(() => team.filter((m) => m.status === "active").map((m) => ({ label: m.name, value: m.name })), [team]);
  const unitCost = itemUnitCost(item ?? undefined);

  function reset() { setKind("damage"); setItem(null); setModel(""); setQty("1"); setReason(""); setResponsible(NONE); setNote(""); setPhotos([]); }
  function close() { onClose(); reset(); }
  function pickItem(it: InventoryItem) { setItem(it); setModel(modelOfItem(it)); }

  async function save() {
    if (!item || !qtyOk || !noteOk || saving || !canReport) return;
    setSaving(true);
    try {
      const doc = await reportIncident({
        itemId: item.id, qty: n, kind, reason: effReason, model: model.trim(), branch: item.store || "—",
        responsible: responsible === NONE ? "" : responsible, note: note.trim(), photos, unitCost,
      });
      if (doc) { toast.success(`${doc.id} reported. A manager will verify it.`); close(); router.push(`/inventory/loss-damage/${doc.id}`); }
    } finally { setSaving(false); }
  }

  return (
    <RoxCenteredForm
      open={open} onClose={close} width="max-w-2xl" icon={ShieldAlert} canEdit={canReport}
      title="Report loss or damage" subtitle="Stock is not reduced until a manager approves this report"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="hidden text-[12px] text-muted-foreground sm:block">
            {item && n > 0 && canViewCost && unitCost > 0 ? <>Estimated impact <b className="text-foreground">{money(n * unitCost)}</b></> : "You can attach evidence and add remarks."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={save} disabled={!qtyOk || !noteOk || saving}>{saving ? "Submitting…" : "Submit report"}</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <Label>What happened?</Label>
          <div className="mt-1.5">
            <SegmentedTabs size="sm" value={kind} onChange={(v) => setKind(v as IncidentKind)}
              options={[{ label: "Damage · unusable", value: "damage" }, { label: "Loss · missing", value: "loss" }]} />
          </div>
        </div>

        <div>
          <Label>Item</Label>
          {item ? (
            <div className="mt-1.5 flex items-center justify-between gap-3 rounded-xl border border-input px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Package className="h-4 w-4 shrink-0 text-[#4361EE]" />
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold">{item.name}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground">
                    <span>{item.id}</span><span>On hand {item.currentStock}</span><span>Available {availableStock(item)}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{item.store || "—"}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => setItem(null)} className="text-[12px] font-semibold text-[#4361EE] hover:underline">Change</button>
            </div>
          ) : (
            <div className="mt-1.5"><InventorySearchBox kind="part" onSelect={pickItem} placeholder="Search the part by name, SKU or category…" /></div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label>Model</Label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. iPhone 15 Pro Max" className={FIELD} />
          </div>
          <div>
            <Label>Quantity</Label>
            <input type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} className={FIELD} />
            {item && !qtyOk && (
              <p className="mt-1 text-[11.5px] text-rose-600">
                {room === 0 ? "No unreported stock left for this item." : `Enter 1 – ${room}.`}{claimed > 0 && ` ${claimed} already in open reports.`}
              </p>
            )}
          </div>
          <div>
            <Label>Reason</Label>
            <Select className="mt-1.5 h-[34px]" value={effReason} onChange={(e) => setReason(e.target.value)} options={reasons.map((r) => ({ label: r, value: r }))} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label>Responsible employee <InfoHint content="Who handled the stock when this happened. Leave blank if unknown. It is recorded for accountability and does not change who can approve." /></Label>
            <Select className="mt-1.5 h-[34px]" value={responsible} onChange={(e) => setResponsible(e.target.value)}
              options={[{ label: "Not known / not applicable", value: NONE }, ...people]} />
          </div>
          <div>
            <Label>Branch</Label>
            <div className="mt-1.5 flex h-[34px] items-center gap-2 rounded-xl border border-input bg-muted/40 px-3 text-[13px] text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />{item?.store || "Taken from the item"}
            </div>
          </div>
        </div>

        <div>
          <Label>Remarks {kind === "loss" && <span className="text-rose-600">*</span>}</Label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder={kind === "loss" ? "When was it last seen and where? Required for a loss." : "What happened, and where is the part now?"}
            className="mt-1.5 w-full rounded-xl border border-input bg-card px-3 py-2 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
        </div>

        <div>
          <Label>Evidence photos <InfoHint content="Up to 3 photos. They are resized on your device and kept with the report." /></Label>
          <div className="mt-1.5"><EvidencePicker photos={photos} onChange={setPhotos} /></div>
        </div>
      </div>
    </RoxCenteredForm>
  );
}
