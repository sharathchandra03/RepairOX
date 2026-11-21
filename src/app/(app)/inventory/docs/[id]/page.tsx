"use client";

/* View page for any inventory workflow document (PO, GRN, vendor return,
   transfer, stock count, write-off, old part, warranty claim). Full page per the
   View-record standard: hero + summary cards + sections + pinned action rail. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ClipboardList, FileText, ListChecks, PackageCheck, Trash2 } from "lucide-react";
import { BackPill } from "@/components/common/back-pill";
import { DetailField, DetailHero, DetailSection, SummaryCard } from "@/components/common/detail-page";
import { PinnedRail } from "@/components/common/pinned-rail";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ToneChip, fmtDate } from "@/components/inventory/doc-ui";
import { toast } from "@/components/ui/toaster";
import { useInventoryOps } from "@/lib/inventory-ops-context";
import { useInventoryActions } from "@/lib/use-inventory-actions";
import { useInventoryScope } from "@/components/inventory/inv-ui";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { DOC_META, docUnits, docValue, type DocAction } from "@/lib/inventory-ops";
import { cn, formatINR } from "@/lib/utils";

const TH = "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]";

export default function InventoryDocPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can } = usePermissions();
  const { getDoc, saveDoc, removeDoc, ready } = useInventoryOps();
  const { runAction, createDoc } = useInventoryActions();
  const { inventory } = useInventoryScope();
  const doc = getDoc(decodeURIComponent(id));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [counts, setCounts] = useState<Record<string, string>>({});

  const meta = doc ? DOC_META[doc.type] : null;
  const gate = (needs?: DocAction["needs"]) =>
    !needs ? true : allow(can, needs === "approve" ? CAP.inventory.approve : needs === "adjust" ? CAP.inventory.adjust : needs === "transfer" ? CAP.inventory.transfer : CAP.inventory.purchase);
  const actions = useMemo(() => (doc && meta ? meta.actions(doc.status).filter((a) => gate(a.needs)) : []), [doc, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc || !meta) {
    return (
      <div className="space-y-4">
        <BackPill href="/inventory" label="Back to Inventory" />
        <p className="py-16 text-center text-muted-foreground">{ready ? "This document doesn't exist or you don't have access to it." : "Loading…"}</p>
      </div>
    );
  }

  const status = meta.statuses[doc.status];
  const counting = doc.type === "stock_count" && doc.status === "draft" && allow(can, CAP.inventory.adjust);
  const countedOf = (l: (typeof doc.lines)[number]) => (counts[l.itemId] !== undefined ? (counts[l.itemId] === "" ? undefined : Number(counts[l.itemId])) : l.counted);
  const variance = (l: (typeof doc.lines)[number]) => { const c = countedOf(l); return c === undefined ? null : c - (l.system ?? 0); };
  const countedAll = doc.type !== "stock_count" || doc.lines.every((l) => countedOf(l) !== undefined);

  async function saveCounts() {
    if (!doc) return;
    setBusy(true);
    const lines = doc.lines.map((l) => ({ ...l, counted: countedOf(l) }));
    if (await saveDoc({ ...doc, lines })) toast.success("Counts saved");
    setBusy(false);
  }

  async function act(a: DocAction) {
    if (!doc || busy) return;
    if (doc.type === "stock_count" && a.to === "submitted") {
      if (!countedAll) { toast.error("Enter a counted quantity for every item first"); return; }
      const lines = doc.lines.map((l) => ({ ...l, counted: countedOf(l) }));
      setBusy(true);
      await runAction({ ...doc, lines }, a);
      setBusy(false);
      return;
    }
    setBusy(true);
    await runAction(doc, a);
    setBusy(false);
  }

  async function createGrn() {
    if (!doc) return;
    const lines = doc.lines.map((l) => ({ itemId: l.itemId, name: l.name, qty: Math.max(l.qty - (l.received ?? 0), 0), unitCost: l.unitCost ?? 0 })).filter((l) => l.qty > 0);
    if (lines.length === 0) { toast.error("Everything on this PO is already received"); return; }
    setBusy(true);
    const grn = await createDoc("grn", { party: doc.party, ref: doc.id, lines });
    setBusy(false);
    if (grn) router.push(`/inventory/docs/${grn.id}`);
  }

  const itemById = (itemId: string) => inventory.find((i) => i.id === itemId);
  const linkedRef = doc.ref && /^(PO|GRN|RMA|TRF|CNT|WO|OLD|WCL)-/.test(doc.ref) ? `/inventory/docs/${doc.ref}` : undefined;
  const notes = typeof doc.data.notes === "string" ? doc.data.notes : "";

  return (
    <div className="space-y-6">
      <BackPill href={meta.route} label={`Back to ${meta.plural}`} />

      <DetailHero>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#4361EE] text-white shadow-[0_8px_20px_-8px_rgba(67,97,238,0.6)]"><FileText className="h-6 w-6" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{meta.label}</p>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">{doc.id}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="w-44"><ToneChip tone={status?.tone ?? "neutral"} label={status?.label ?? doc.status} /></span>
                {doc.party && <span className="text-[13px] text-muted-foreground">{meta.partyLabel}: <b className="text-foreground">{doc.party}</b></span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button key={a.to} onClick={() => act(a)} disabled={busy} variant={a.tone === "danger" ? "destructive" : a.tone === "outline" ? "outline" : "primary"}>{a.label}</Button>
            ))}
            {doc.type === "purchase_order" && (doc.status === "sent" || doc.status === "partial") && allow(can, CAP.inventory.purchase) && (
              <Button variant="outline" className="gap-2" onClick={createGrn} disabled={busy}><PackageCheck className="h-4 w-4" />Receive stock</Button>
            )}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Lines" value={doc.lines.length} />
          <SummaryCard label="Units" value={docUnits(doc)} />
          {meta.hasCost ? <SummaryCard label="Value" value={formatINR(docValue(doc))} /> : <SummaryCard label="Created by" value={doc.createdBy || "—"} />}
          <SummaryCard label="Created" value={fmtDate(doc.createdAt)} />
        </div>
      </DetailHero>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection
            icon={ListChecks}
            title="Items"
            accent="blue"
            action={counting ? <Button size="sm" onClick={saveCounts} disabled={busy}>Save counts</Button> : undefined}
          >
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full table-fixed text-[13px]">
                <thead>
                  <tr className="bg-[#EEF1FD] text-left">
                    <th className={TH}>Item</th>
                    {doc.type === "stock_count" ? (
                      <>
                        <th className={cn(TH, "w-[90px] text-right")}>System</th>
                        <th className={cn(TH, "w-[110px] text-right")}>Counted</th>
                        <th className={cn(TH, "w-[90px] text-right")}>Variance</th>
                      </>
                    ) : (
                      <>
                        <th className={cn(TH, "w-[80px] text-right")}>Qty</th>
                        {doc.type === "purchase_order" && <th className={cn(TH, "w-[90px] text-right")}>Received</th>}
                        {meta.hasCost && <th className={cn(TH, "w-[100px] text-right")}>Unit cost</th>}
                        {meta.hasCost && <th className={cn(TH, "w-[110px] text-right")}>Total</th>}
                        {doc.type === "vendor_return" && <th className={cn(TH, "w-[150px]")}>Reason</th>}
                        {doc.type === "transfer" && <th className={cn(TH, "w-[140px]")}>Destination</th>}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((l) => {
                    const v = variance(l);
                    return (
                      <tr key={l.itemId} className="border-t border-border">
                        <td className="px-3 py-2.5"><p className="truncate font-medium" title={l.name}>{l.name}</p><p className="truncate text-[11px] text-muted-foreground">{l.itemId}</p></td>
                        {doc.type === "stock_count" ? (
                          <>
                            <td className="px-3 py-2.5 text-right tabular-nums">{l.system}</td>
                            <td className="px-3 py-2.5 text-right">
                              {counting ? (
                                <input type="number" min={0} step={1} value={counts[l.itemId] ?? (l.counted ?? "")} onChange={(e) => setCounts((p) => ({ ...p, [l.itemId]: e.target.value }))} className="h-[30px] w-full rounded-lg border border-input bg-card px-2 text-right tabular-nums outline-none focus:border-[#4361EE]" />
                              ) : <span className="tabular-nums">{l.counted ?? "—"}</span>}
                            </td>
                            <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums", v === null ? "text-muted-foreground" : v === 0 ? "text-emerald-600" : "text-rose-600")}>{v === null ? "—" : v > 0 ? `+${v}` : v}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{l.qty}</td>
                            {doc.type === "purchase_order" && <td className="px-3 py-2.5 text-right tabular-nums">{l.received ?? 0}</td>}
                            {meta.hasCost && <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(l.unitCost ?? 0)}</td>}
                            {meta.hasCost && <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatINR((l.unitCost ?? 0) * l.qty)}</td>}
                            {doc.type === "vendor_return" && <td className="truncate px-3 py-2.5 text-muted-foreground" title={l.reason}>{l.reason || "—"}</td>}
                            {doc.type === "transfer" && <td className="truncate px-3 py-2.5 text-muted-foreground">{l.toItemId && l.toItemId !== l.itemId ? itemById(l.toItemId)?.store || l.toItemId : "Same item"}</td>}
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {doc.type === "stock_count" && doc.status === "draft" && !countedAll && <p className="mt-3 text-[12.5px] text-muted-foreground">Enter the counted quantity for every item, save, then submit for approval.</p>}
          </DetailSection>

          <DetailSection icon={ClipboardList} title="Details" accent="neutral">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label={meta.partyLabel} value={doc.party || "—"} flat />
              <DetailField label="Linked record" value={linkedRef ? <Link href={linkedRef} className="font-semibold text-[#4361EE] hover:underline">{doc.ref}</Link> : doc.ref || "—"} flat />
              {doc.type === "write_off" && <DetailField label="Location" value={String(doc.data.location ?? "—")} flat />}
              <DetailField label="Created by" value={doc.createdBy || "—"} flat />
              <DetailField label="Last updated" value={fmtDate(doc.updatedAt)} flat />
            </div>
          </DetailSection>
        </div>

        <PinnedRail>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What happens next</h3>
            <ul className="mt-3 space-y-2 text-[13px]">
              {doc.type === "purchase_order" && <li>Send the PO to the vendor, then use <b>Receive stock</b> for each delivery. Partial deliveries are tracked line by line.</li>}
              {doc.type === "grn" && <li>Posting adds each line to stock at its unit cost and updates the linked PO.</li>}
              {doc.type === "vendor_return" && <li>Sending removes the units from stock. Record the vendor's credit or replacement when it arrives.</li>}
              {doc.type === "transfer" && <li>Dispatch removes stock from the source. Receiving adds it to the destination item.</li>}
              {doc.type === "stock_count" && <li>Counts are compared with the system quantity. Approval posts only the variance.</li>}
              {doc.type === "write_off" && <li>This write-off has already reduced stock. It is kept for audit.</li>}
              {doc.type === "old_part" && <li>Record what happened to the replaced part so no old part goes missing.</li>}
              {doc.type === "warranty_claim" && <li>Track the vendor claim. When the replacement arrives it is added to stock.</li>}
              {actions.length === 0 && doc.status !== "draft" && <li className="text-muted-foreground">No further actions for this status.</li>}
            </ul>
          </div>
          {notes && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</h3>
              <p className="mt-2 whitespace-pre-wrap text-[13px]">{notes}</p>
            </div>
          )}
          {["draft", "requested", "raised", "pending"].includes(doc.status) && doc.type !== "write_off" && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <button onClick={() => setConfirmDelete(true)} className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left text-[13px] font-medium text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" />Delete this {meta.label.toLowerCase()}
              </button>
            </div>
          )}
        </PinnedRail>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${doc.id}?`}
        description="Only documents that haven't moved stock can be deleted."
        confirmLabel="Delete"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => { await removeDoc(doc.id); router.push(meta.route); }}
      />
    </div>
  );
}
