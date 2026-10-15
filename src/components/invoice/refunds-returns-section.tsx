"use client";

/**
 * RepairOX — View Invoice "Refunds & Returns" DetailSection.
 *
 * Lists the invoice's refund records (money) and physical item-return records
 * (independent, linkable), with authorized Print Credit Note / Restock actions.
 * Uses the shared DetailSection (accent emerald) + the in-section table look
 * (view-detail-pages §4). A compact dashed empty state — never a large blank
 * band. All derived from invoice_refunds / invoice_item_returns (never stored
 * status).
 */
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Undo2, Printer, PackageCheck } from "lucide-react";
import { DetailSection } from "@/components/common/detail-page";
import { useStore } from "@/lib/store";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import { formatINR } from "@/lib/utils";
import {
  REFUND_STATUS_TONE,
  RETURN_CONDITION_LABEL,
  RETURN_DISPOSITION_LABEL,
  type Invoice,
  type InvoiceRefund,
} from "@/lib/mock-data";

const LIFECYCLE_TONE: Record<InvoiceRefund["status"], string> = {
  pending: REFUND_STATUS_TONE.refund_pending,
  processing: REFUND_STATUS_TONE.refund_pending,
  succeeded: REFUND_STATUS_TONE.fully_refunded,
  failed: REFUND_STATUS_TONE.refund_failed_reversed,
  reversed: REFUND_STATUS_TONE.refund_failed_reversed,
};

const LIFECYCLE_LABEL: Record<InvoiceRefund["status"], string> = {
  pending: "Pending",
  processing: "Processing",
  succeeded: "Succeeded",
  failed: "Failed",
  reversed: "Reversed",
};

export function RefundsReturnsSection({ invoice }: { invoice: Invoice }) {
  const router = useRouter();
  const { invoiceRefunds, invoiceItemReturns, restockItemReturn } = useStore();
  const { can } = usePermissions();
  const canView = allow(can, CAP.invoice.refundView);
  const canPrint = allow(can, CAP.invoice.print);
  const canRestock = allow(can, CAP.inventory.returnRestock);

  const refunds = useMemo(
    () => invoiceRefunds.filter((r) => r.invoiceId === invoice.id),
    [invoiceRefunds, invoice.id],
  );
  const returns = useMemo(
    () => invoiceItemReturns.filter((r) => r.invoiceId === invoice.id),
    [invoiceItemReturns, invoice.id],
  );

  if (!canView) return null;

  const empty = refunds.length === 0 && returns.length === 0;

  return (
    <DetailSection title="Refunds & Returns" icon={Undo2} accent="emerald">
      {empty ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          No refunds or returns for this invoice.
        </div>
      ) : (
        <div className="space-y-5">
          {refunds.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Refunds</p>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Refund</th>
                      <th className="px-3 py-2 text-left">Reason</th>
                      <th className="px-3 py-2 text-left">Method</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refunds.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{r.refundNo || r.id.slice(0, 8)}</td>
                        <td className="px-3 py-2">{r.reasonCode}</td>
                        <td className="px-3 py-2 capitalize">{r.method.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(r.refundAmount)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${LIFECYCLE_TONE[r.status]}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {LIFECYCLE_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canPrint && (
                            <button
                              type="button"
                              onClick={() => router.push(`/print/credit_note/${r.id}?format=a4`)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline"
                            >
                              <Printer className="h-3 w-3" /> Credit Note
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {returns.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Item Returns</p>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Return</th>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-left">Condition</th>
                      <th className="px-3 py-2 text-left">Disposition</th>
                      <th className="px-3 py-2 text-left">Restock</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((rt) => {
                      const restockable = rt.disposition === "restock" && rt.dispositionStatus === "pending";
                      return (
                        <tr key={rt.id} className="border-t border-border">
                          <td className="px-3 py-2 font-medium">{rt.returnNo || rt.id.slice(0, 8)}</td>
                          <td className="px-3 py-2">{rt.itemName || rt.sku || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{rt.returnQty}</td>
                          <td className="px-3 py-2">{RETURN_CONDITION_LABEL[rt.condition]}</td>
                          <td className="px-3 py-2">{RETURN_DISPOSITION_LABEL[rt.disposition]}</td>
                          <td className="px-3 py-2">
                            <span className={rt.dispositionStatus === "completed" ? "text-emerald-700" : "text-muted-foreground"}>
                              {rt.dispositionStatus === "completed" ? `Restocked${rt.stockMovementRef ? ` · ${rt.stockMovementRef}` : ""}` : "Pending"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {restockable && canRestock && (
                              <button
                                type="button"
                                onClick={() => restockItemReturn(rt.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4361EE] hover:underline"
                              >
                                <PackageCheck className="h-3 w-3" /> Restock
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </DetailSection>
  );
}
