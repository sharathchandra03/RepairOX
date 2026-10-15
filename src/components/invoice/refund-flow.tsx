"use client";

/**
 * RepairOX — Refund workflow (focused, in-context, on RoxCenteredForm).
 *
 * A centered multi-step flow that consumes the pure invoice-refunds.ts engine
 * (eligibility / scope / allocation / status) and the useStore() refund + return
 * actions. The finalized invoice is NEVER mutated — this only creates linked
 * refund + allocation + (optional) item-return records.
 *
 * Steps: 1 Eligibility+Scope → 2 Amount (full/partial) → 3 Reason+Method →
 *        4 Item Return (optional) → 5 Review + Confirm.
 *
 * Design: app/.agents/tasks/invoice-refunds-design.md §7.2.
 */
import { useMemo, useState, useCallback } from "react";
import { RotateCcw, AlertTriangle } from "lucide-react";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Input, Select, Textarea } from "@/components/ui/input";
import { formatINR } from "@/lib/utils";
import { useStore, type ProcessRefundInput } from "@/lib/store";
import { useStoreSettings } from "@/lib/store-settings";
import { usePermissions } from "@/lib/permissions-context";
import { allow, CAP } from "@/lib/capabilities";
import {
  buildScopeTree,
  allocateScope,
  scaleAllocation,
  distributePartial,
  eligibility as refundEligibility,
  remainingRefundable,
  lineRemainingQty,
  refundsForInvoice,
  type Allocation,
} from "@/lib/invoice-refunds";
import {
  RETURN_CONDITION_LABEL,
  RETURN_DISPOSITION_LABEL,
  type Invoice,
  type ReturnCondition,
  type ReturnDisposition,
} from "@/lib/mock-data";

type ScopeMode = "invoice" | "devices" | "lines";

interface ReturnDraft {
  returned: boolean;
  condition: ReturnCondition;
  disposition: ReturnDisposition;
  qty: number;
}

export function RefundFlow({
  invoice,
  open,
  onClose,
}: {
  invoice: Invoice | null;
  open: boolean;
  onClose: () => void;
}) {
  const { invoiceRefunds, invoiceRefundAllocations, processRefund, recordItemReturn } = useStore();
  const { settings } = useStoreSettings();
  const { can } = usePermissions();
  const canInitiate = allow(can, CAP.invoice.refundInitiate);

  const [step, setStep] = useState(1);
  const [scopeMode, setScopeMode] = useState<ScopeMode>("invoice");
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [refundKind, setRefundKind] = useState<"full_scope" | "partial">("full_scope");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [reasonCode, setReasonCode] = useState<string>(settings.refundConfig.reasons[0] ?? "Other");
  const [reasonComment, setReasonComment] = useState("");
  const [method, setMethod] = useState<string>(settings.invoicePaymentModes[0] ?? "cash");
  const [reference, setReference] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [internalRemark, setInternalRemark] = useState("");
  const [gateway, setGateway] = useState(false);
  const [returnDrafts, setReturnDrafts] = useState<Record<string, ReturnDraft>>({});
  const [submitting, setSubmitting] = useState(false);

  const existingRefunds = useMemo(
    () => (invoice ? refundsForInvoice(invoiceRefunds, invoice.id) : []),
    [invoice, invoiceRefunds],
  );
  const elig = useMemo(
    () => (invoice ? refundEligibility(invoice, existingRefunds) : null),
    [invoice, existingRefunds],
  );
  const remaining = useMemo(
    () => (invoice ? remainingRefundable(invoice, existingRefunds) : 0),
    [invoice, existingRefunds],
  );
  const tree = useMemo(() => (invoice ? buildScopeTree(invoice) : []), [invoice]);
  const allLines = useMemo(() => tree.flatMap((d) => d.lines), [tree]);

  // The line ids in the current scope.
  const scopeLineIds = useMemo(() => {
    if (!invoice) return [] as string[];
    if (scopeMode === "invoice") return allLines.map((l) => l.lineId);
    return allLines.filter((l) => selectedLineIds.has(l.lineId)).map((l) => l.lineId);
  }, [invoice, scopeMode, allLines, selectedLineIds]);

  // Base (full-qty) allocation for the selected scope.
  const baseAllocation: Allocation = useMemo(
    () => (invoice && scopeLineIds.length > 0 ? allocateScope(invoice, scopeLineIds) : { lines: [], net: 0, tax: 0, amount: 0 }),
    [invoice, scopeLineIds],
  );

  // The effective allocation after full-scope capping or partial distribution.
  const effectiveAllocation: Allocation = useMemo(() => {
    if (!invoice || baseAllocation.amount <= 0) return { lines: [], net: 0, tax: 0, amount: 0 };
    if (refundKind === "full_scope") {
      return scaleAllocation(baseAllocation, remaining);
    }
    const amt = Math.max(0, Number(partialAmount) || 0);
    return distributePartial(baseAllocation, Math.min(amt, remaining, baseAllocation.amount));
  }, [invoice, baseAllocation, refundKind, partialAmount, remaining]);

  const partialNum = Math.max(0, Number(partialAmount) || 0);
  const partialTooHigh =
    refundKind === "partial" && (partialNum <= 0 || partialNum > remaining + 0.01 || partialNum > baseAllocation.amount + 0.01);

  const reset = useCallback(() => {
    setStep(1);
    setScopeMode("invoice");
    setSelectedLineIds(new Set());
    setRefundKind("full_scope");
    setPartialAmount("");
    setReasonComment("");
    setReference("");
    setCustomerNote("");
    setInternalRemark("");
    setGateway(false);
    setReturnDrafts({});
    setSubmitting(false);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const toggleLine = useCallback((lineId: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      next.has(lineId) ? next.delete(lineId) : next.add(lineId);
      return next;
    });
  }, []);

  const confirm = useCallback(async () => {
    if (!invoice || submitting) return;
    setSubmitting(true);
    try {
      const input: ProcessRefundInput = {
        invoiceId: invoice.id,
        scope: scopeMode,
        refundKind,
        refundAmount: effectiveAllocation.amount,
        refundNet: effectiveAllocation.net,
        refundTax: effectiveAllocation.tax,
        reasonCode,
        reasonComment: reasonComment || undefined,
        method,
        reference: reference || undefined,
        customerNote: customerNote || undefined,
        internalRemark: internalRemark || undefined,
        gateway,
        allocation: effectiveAllocation,
      };
      const refundNo = await processRefund(input);
      if (!refundNo) {
        setSubmitting(false);
        return;
      }
      // Record each physical item return the user flagged (independent of money).
      for (const l of effectiveAllocation.lines) {
        const draft = returnDrafts[l.lineId];
        if (!draft || !draft.returned || draft.qty <= 0) continue;
        await recordItemReturn({
          invoiceId: invoice.id,
          deviceId: l.deviceId,
          lineId: l.lineComponent === "line" ? l.lineId : undefined,
          sku: l.sku,
          itemName: l.name,
          returnQty: draft.qty,
          condition: draft.condition,
          disposition: draft.disposition,
          branchId: invoice.branchId ?? null,
        });
      }
      close();
    } finally {
      setSubmitting(false);
    }
  }, [
    invoice, submitting, scopeMode, refundKind, effectiveAllocation, reasonCode, reasonComment,
    method, reference, customerNote, internalRemark, gateway, returnDrafts, processRefund, recordItemReturn, close,
  ]);

  if (!invoice) return null;

  const blocked = !elig?.eligible;
  const canGoNext =
    step === 1 ? !blocked && scopeLineIds.length > 0 && effectiveAllocation.amount >= 0
    : step === 2 ? (refundKind === "full_scope" ? effectiveAllocation.amount > 0 : !partialTooHigh)
    : true;

  const stepTitles = ["Scope", "Amount", "Reason & Method", "Item Return", "Review"];

  const footer = blocked ? null : (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={step === 1 ? close : () => setStep((s) => s - 1)}
        className="rounded-xl border border-border px-4 py-2 text-[13px] font-medium text-foreground transition hover:bg-muted"
      >
        {step === 1 ? "Cancel" : "Back"}
      </button>
      {step < 5 ? (
        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => setStep((s) => s + 1)}
          className="rounded-xl bg-[#4361EE] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3550d8] disabled:opacity-50"
        >
          Continue
        </button>
      ) : (
        <button
          type="button"
          disabled={submitting || effectiveAllocation.amount <= 0}
          onClick={confirm}
          className="rounded-xl bg-[#4361EE] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3550d8] disabled:opacity-50"
        >
          {submitting ? "Processing…" : `Confirm refund of ${formatINR(effectiveAllocation.amount)}`}
        </button>
      )}
    </div>
  );

  return (
    <RoxCenteredForm
      open={open}
      onClose={close}
      title="Process Refund"
      subtitle={`Invoice ${invoice.reference || invoice.id} · ${invoice.customer || "—"}`}
      icon={RotateCcw}
      width="max-w-2xl"
      canEdit={canInitiate}
      readOnlyNote="View-only: you don't have permission to initiate refunds."
      footer={footer}
    >
      {/* Step rail */}
      {!blocked && (
        <div className="mb-5 flex items-center gap-1.5 text-[11px] font-medium">
          {stepTitles.map((t, i) => (
            <span
              key={t}
              className={`rounded-full px-2.5 py-1 ${step === i + 1 ? "bg-[#4361EE] text-white" : step > i + 1 ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-muted text-muted-foreground"}`}
            >
              {i + 1}. {t}
            </span>
          ))}
        </div>
      )}

      {/* Balance summary (always, except hard-blocked proforma/draft) */}
      {!blocked && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          <SummaryTile label="Refundable Base" value={formatINR(elig!.base)} />
          <SummaryTile label="Already Refunded" value={formatINR(elig!.priorRefunded)} />
          <SummaryTile label="Remaining" value={formatINR(remaining)} tone="emerald" />
        </div>
      )}

      {/* Blocked state */}
      {blocked && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-800">This invoice cannot be refunded</p>
              <p className="text-[13px] text-amber-700">{blockedMessage(elig?.reasonWhenBlocked)}</p>
              {elig?.suggestedAlternative && (
                <a href={elig.suggestedAlternative.href} className="inline-block text-[13px] font-medium text-[#4361EE] hover:underline">
                  {elig.suggestedAlternative.label} →
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 1 — Scope */}
      {!blocked && step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            {(["invoice", "devices", "lines"] as ScopeMode[]).map((m) => (
              <label key={m} className="flex items-center gap-3 rounded-lg border border-border px-4 py-2.5">
                <input
                  type="radio"
                  name="refund-scope"
                  checked={scopeMode === m}
                  onChange={() => setScopeMode(m)}
                  className="h-4 w-4 text-[#4361EE]"
                />
                <span className="text-sm font-medium">
                  {m === "invoice" ? "Entire Invoice" : m === "devices" ? "Selected Devices" : "Selected Line Items"}
                </span>
              </label>
            ))}
          </div>

          {(scopeMode === "devices" || scopeMode === "lines") && (
            <div className="space-y-3">
              {tree.map((d) => {
                const deviceLineIds = d.lines.map((l) => l.lineId);
                const allSel = deviceLineIds.length > 0 && deviceLineIds.every((id) => selectedLineIds.has(id));
                return (
                  <div key={d.deviceId} className="rounded-xl border border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[13px] font-semibold">{d.brand} {d.model}</p>
                      {scopeMode === "devices" && (
                        <label className="flex items-center gap-2 text-[12px]">
                          <input
                            type="checkbox"
                            checked={allSel}
                            onChange={() => {
                              setSelectedLineIds((prev) => {
                                const next = new Set(prev);
                                if (allSel) deviceLineIds.forEach((id) => next.delete(id));
                                else deviceLineIds.forEach((id) => next.add(id));
                                return next;
                              });
                            }}
                          />
                          Refund device
                        </label>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {d.lines.map((l) => {
                        const remQty = invoice ? lineRemainingQty(invoice, l.lineId, existingRefunds, invoiceRefundAllocations) : l.qty;
                        return (
                          <div key={l.lineId} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-1.5 text-[12px]">
                            <label className="flex min-w-0 items-center gap-2">
                              {scopeMode === "lines" && (
                                <input
                                  type="checkbox"
                                  checked={selectedLineIds.has(l.lineId)}
                                  onChange={() => toggleLine(l.lineId)}
                                  disabled={remQty <= 0 && l.lineComponent === "line"}
                                />
                              )}
                              <span className="truncate">{l.name}</span>
                            </label>
                            <span className="shrink-0 text-muted-foreground">
                              {l.lineComponent === "line" ? `qty ${remQty} left · ` : ""}{formatINR(l.grossNet)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[12px] text-muted-foreground">
            Selected scope value: <strong>{formatINR(baseAllocation.amount)}</strong>
            {" "}(net {formatINR(baseAllocation.net)} + tax {formatINR(baseAllocation.tax)})
          </p>
        </div>
      )}

      {/* Step 2 — Amount */}
      {!blocked && step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-2.5">
              <input type="radio" name="refund-kind" checked={refundKind === "full_scope"} onChange={() => setRefundKind("full_scope")} className="h-4 w-4 text-[#4361EE]" />
              <span className="flex-1 text-sm font-medium">Full Refund of Selected Scope</span>
              <span className="text-[13px] font-semibold">{formatINR(scaleAllocation(baseAllocation, remaining).amount)}</span>
            </label>
            {settings.refundConfig.allowPartial && (
              <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-2.5">
                <input type="radio" name="refund-kind" checked={refundKind === "partial"} onChange={() => setRefundKind("partial")} className="h-4 w-4 text-[#4361EE]" />
                <span className="text-sm font-medium">Partial Refund</span>
              </label>
            )}
          </div>

          {refundKind === "partial" && (
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground">Refund amount (≤ {formatINR(Math.min(remaining, baseAllocation.amount))})</label>
              <Input
                type="number"
                min={0}
                value={partialAmount}
                onChange={(e) => setPartialAmount(e.target.value)}
                placeholder="0"
              />
              {partialTooHigh && (
                <p className="text-[12px] text-rose-600">Enter an amount between ₹0 and {formatINR(Math.min(remaining, baseAllocation.amount))}.</p>
              )}
            </div>
          )}

          <AllocationTable allocation={effectiveAllocation} />
        </div>
      )}

      {/* Step 3 — Reason + Method */}
      {!blocked && step === 3 && (
        <div className="space-y-4">
          <Field label="Reason">
            <Select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
              options={settings.refundConfig.reasons.map((r) => ({ label: r, value: r }))}
            />
          </Field>
          <Field label="Comment (optional)">
            <Textarea value={reasonComment} onChange={(e) => setReasonComment(e.target.value)} rows={2} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Refund Method">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                options={settings.invoicePaymentModes.map((m) => ({ label: paymentLabel(m), value: m }))}
              />
            </Field>
            <Field label="Reference / Txn ID (optional)">
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={gateway} onChange={(e) => setGateway(e.target.checked)} />
            Gateway refund (settle later — records as Pending until confirmed)
          </label>
          <Field label="Customer note (optional)">
            <Input value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
          </Field>
          <Field label="Internal remark (optional)">
            <Input value={internalRemark} onChange={(e) => setInternalRemark(e.target.value)} />
          </Field>
        </div>
      )}

      {/* Step 4 — Item Return (optional, per product line in scope) */}
      {!blocked && step === 4 && (
        <div className="space-y-3">
          <p className="text-[12px] text-muted-foreground">
            A physical item return is tracked separately from the money refund. Leave off for service lines.
          </p>
          {effectiveAllocation.lines.filter((l) => l.lineComponent === "line").length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-3 text-[13px] text-muted-foreground">
              No returnable product lines in this scope (service / repair only).
            </p>
          )}
          {effectiveAllocation.lines
            .filter((l) => l.lineComponent === "line")
            .map((l) => {
              const draft = returnDrafts[l.lineId] ?? {
                returned: false,
                condition: "uninspected" as ReturnCondition,
                disposition: settings.refundConfig.restockDefault,
                qty: l.qty,
              };
              const setDraft = (patch: Partial<ReturnDraft>) =>
                setReturnDrafts((prev) => ({ ...prev, [l.lineId]: { ...draft, ...patch } }));
              return (
                <div key={l.lineId} className="rounded-xl border border-border p-3">
                  <label className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{l.name}</span>
                    <span className="flex items-center gap-2 text-[12px]">
                      <input type="checkbox" checked={draft.returned} onChange={(e) => setDraft({ returned: e.target.checked })} />
                      Item returned
                    </span>
                  </label>
                  {draft.returned && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <Field label="Qty">
                        <Input type="number" min={0} value={draft.qty} onChange={(e) => setDraft({ qty: Math.max(0, Number(e.target.value) || 0) })} />
                      </Field>
                      <Field label="Condition">
                        <Select
                          value={draft.condition}
                          onChange={(e) => setDraft({ condition: e.target.value as ReturnCondition })}
                          options={(Object.keys(RETURN_CONDITION_LABEL) as ReturnCondition[]).map((c) => ({ label: RETURN_CONDITION_LABEL[c], value: c }))}
                        />
                      </Field>
                      <Field label="Disposition">
                        <Select
                          value={draft.disposition}
                          onChange={(e) => setDraft({ disposition: e.target.value as ReturnDisposition })}
                          options={(Object.keys(RETURN_DISPOSITION_LABEL) as ReturnDisposition[]).map((d) => ({ label: RETURN_DISPOSITION_LABEL[d], value: d }))}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Step 5 — Review */}
      {!blocked && step === 5 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <SummaryTile label="Original Invoiced" value={formatINR(invoice.total)} />
            <SummaryTile label="Previously Refunded" value={formatINR(elig!.priorRefunded)} />
            <SummaryTile label="This Refund" value={formatINR(effectiveAllocation.amount)} tone="emerald" />
            <SummaryTile label="Remaining After" value={formatINR(Math.max(0, remaining - effectiveAllocation.amount))} />
          </div>
          <AllocationTable allocation={effectiveAllocation} />
          <div className="rounded-xl border border-border p-3 text-[12.5px]">
            <p><span className="text-muted-foreground">Scope:</span> {scopeMode === "invoice" ? "Entire Invoice" : scopeMode === "devices" ? "Selected Devices" : "Selected Line Items"}</p>
            <p><span className="text-muted-foreground">Reason:</span> {reasonCode}{reasonComment ? ` — ${reasonComment}` : ""}</p>
            <p><span className="text-muted-foreground">Method:</span> {paymentLabel(method)}{reference ? ` · ${reference}` : ""}{gateway ? " · gateway (pending)" : ""}</p>
          </div>
        </div>
      )}
    </RoxCenteredForm>
  );
}

/* ─── small presentational helpers ──────────────────────────────────── */

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: "emerald" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "emerald" ? "border-emerald-200 bg-emerald-50" : "border-border bg-muted/20"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-[18px] font-extrabold tabular-nums ${tone === "emerald" ? "text-emerald-700" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function AllocationTable({ allocation }: { allocation: Allocation }) {
  if (allocation.lines.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-[12px]">
        <thead className="bg-muted/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Line</th>
            <th className="px-3 py-2 text-right">Net</th>
            <th className="px-3 py-2 text-right">Tax</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {allocation.lines.map((l) => (
            <tr key={l.lineId} className="border-t border-border">
              <td className="px-3 py-2">{l.name}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatINR(l.allocNet)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatINR(l.allocTax)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(l.allocAmount)}</td>
            </tr>
          ))}
          <tr className="border-t border-border bg-muted/40 font-semibold">
            <td className="px-3 py-2">Total</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatINR(allocation.net)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatINR(allocation.tax)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{formatINR(allocation.amount)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function blockedMessage(reason?: string): string {
  switch (reason) {
    case "proforma": return "A proforma is not revenue and cannot be refunded.";
    case "draft": return "A draft invoice has no settled money to refund.";
    case "cancelled_use_credit": return "This invoice is cancelled — use the cancellation / credit path instead of a cash refund.";
    case "unpaid_use_credit": return "No money has been received on this invoice. Cancel the invoice instead of issuing a cash refund.";
    case "fully_refunded": return "This invoice has already been fully refunded.";
    default: return "There is no remaining refundable balance on this invoice.";
  }
}

function paymentLabel(mode: string): string {
  const map: Record<string, string> = {
    cash: "Cash", upi: "UPI", bank_transfer: "Bank Transfer", card: "Card", cheque: "Cheque", wallet: "Wallet", other: "Other",
  };
  return map[mode] ?? mode.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
