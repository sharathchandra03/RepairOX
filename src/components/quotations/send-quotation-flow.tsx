"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Lead → Send Quotation (review + send).

   The PRIMARY quotation workflow. From the Lead Table, a Sales Agent clicks
   "Send Quotation" and gets a quick REVIEW screen pre-populated ENTIRELY from
   the Lead (customer, device, issue, estimate, sales agent, store) — no
   re-entry. The agent may make quotation-SPECIFIC edits (price / warranty /
   email / note / items), preview the exact document, and send.

   Guarantees enforced here:
     • Sales Agent = the LEAD's owner (never the customer creator / current user
       when they aren't the owner).
     • Deal gate: a Discounted Lead with a PENDING/CHANGES deal cannot send a
       discounted quotation until approved; it may still send at standard price.
     • Reuses Customer Master (customerId) — never a second customer db.
     • Creating/sending never makes an invoice/payment/revenue, never consumes
       stock, never marks the lead Won.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { FileText, Pencil, Send, Eye, AlertTriangle, Loader2 } from "lucide-react";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { allow } from "@/lib/capabilities";
import { CAP } from "@/lib/capabilities";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreSettings } from "@/lib/store-settings";
import { useLeads } from "@/lib/leads-context";
import { useDeals } from "@/lib/lead-deals-context";
import { useQuotations } from "@/lib/quotations-context";
import { currentDealForLead, isDiscountedLeadValue, formatDealDiscount } from "@/lib/lead-deals";
import { buildStoreInfo, getQuotationPrintUrl } from "@/lib/print-utils";
import { sendQuotationOnWhatsApp } from "@/lib/quotation-send";
import {
  type Quotation, type QuotationDraft,
  leadToQuotationDraft, computeQuotationTotals, validateQuotationForGenerate,
} from "@/lib/quotation-data";
import { QuotationItemsEditor, QuotationDeviceIssue, WarrantyField, QuotationPreview } from "@/components/quotations/quotation-editor";
import type { DeviceSelection } from "@/components/leads/lead-form-fields";
import type { Lead } from "@/lib/leads-data";

export function SendQuotationFlow({
  lead,
  open,
  onClose,
}: {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = usePermissions();
  const { settings } = useStoreSettings();
  const { salesAgentsFor } = useLeads();
  const { deals } = useDeals();
  const { createQuotation, updateQuotation, sendQuotation, currentQuotationForLead } = useQuotations();

  const [draft, setDraft] = useState<QuotationDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Quotation | null>(null);

  const canEdit = allow(can, CAP.quotation.create);
  const canSend = allow(can, CAP.quotation.send);

  const storeInfo = useMemo(() => buildStoreInfo(settings), [settings]);

  // The Deal gate: an open (pending / changes-requested) discount approval on a
  // Discounted Lead blocks sending a DISCOUNTED quotation until approved.
  const deal = lead ? currentDealForLead(deals, lead.id) ?? null : null;
  const dealOpen = !!deal && (deal.status === "pending_approval" || deal.status === "changes_requested");
  const dealApproved = !!deal && deal.status === "approved";

  // Resolve the sales agent name from the lead's owner (not the current user).
  const salesAgentName = useMemo(() => {
    if (!lead) return "";
    if (lead.assignedToName) return lead.assignedToName;
    const agent = salesAgentsFor(lead.branchId).find((a) => a.id === lead.assignedTo);
    return agent?.name || lead.agent || "";
  }, [lead, salesAgentsFor]);

  // Build the auto-mapped draft when the flow opens. If a quotation already
  // exists for the lead, resume editing it instead of creating a duplicate.
  useEffect(() => {
    if (!open || !lead) { setDraft(null); setEditing(false); setCreated(null); return; }
    const existing = currentQuotationForLead(lead.id);
    if (existing) {
      setCreated(existing);
      setDraft({ ...existing } as unknown as QuotationDraft);
    } else {
      // Apply the APPROVED discount when a deal is approved; otherwise map the
      // lead's own discount only when there's no open deal gating it.
      const approvedDiscount = dealApproved ? deal!.approvedDiscount : undefined;
      const approvedDiscountType = dealApproved ? deal!.approvedDiscountType : undefined;
      const d = leadToQuotationDraft(lead, {
        salesAgentName,
        approvedDiscount: approvedDiscount ?? undefined,
        approvedDiscountType,
      });
      // If a deal is still OPEN, do not carry an unapproved lead discount into
      // the quotation (standard pricing only until approval).
      if (dealOpen) { d.discount = 0; d.discountType = "amount"; }
      const totals = computeQuotationTotals(d);
      setDraft({ ...d, subtotal: totals.subtotal, amount: totals.amount });
    }
    setEditing(false);
  }, [open, lead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lead || !draft) {
    return (
      <RoxCenteredForm open={open && !!lead} onClose={onClose} title="Send Quotation" icon={FileText}>
        <div className="p-6 text-sm text-muted-foreground">Loading lead data…</div>
      </RoxCenteredForm>
    );
  }

  const totals = computeQuotationTotals(draft);
  const discounted = draft.discount > 0;
  // Block a discounted send while a deal is pending (spec §21).
  const blockedByDeal = dealOpen && discounted;

  const patch = (p: Partial<QuotationDraft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const handleDeviceChange = (sel: DeviceSelection) => setDraft((d) => (d ? {
    ...d,
    device: sel.label,
    deviceCategoryId: sel.categoryId,
    deviceBrandId: sel.brandId,
    deviceModelId: sel.modelId,
  } : d));

  const persistDraft = async (): Promise<Quotation | null> => {
    const v = validateQuotationForGenerate(draft);
    if (!v.ok) { toast.error("Can't generate quotation", { description: v.errors[0] }); return null; }
    if (created) {
      const ok = await updateQuotation(created.id, {
        items: draft.items, warranty: draft.warranty, discount: draft.discount,
        discountType: draft.discountType, email: draft.email, note: draft.note,
        device: draft.device, issue: draft.issue, validUntil: draft.validUntil,
        deviceCategoryId: draft.deviceCategoryId, deviceBrandId: draft.deviceBrandId,
        deviceModelId: draft.deviceModelId,
      });
      if (!ok) return null;
      return { ...created, ...draft, subtotal: totals.subtotal, amount: totals.amount } as Quotation;
    }
    const q = await createQuotation(draft);
    if (q) setCreated(q);
    return q;
  };

  const handlePreview = async () => {
    setSaving(true);
    const q = await persistDraft();
    setSaving(false);
    if (q) window.open(getQuotationPrintUrl(q.id), "_blank");
  };

  // Send directly — no extra confirmation step. Persist, send, then close on
  // success. The deal gate still blocks a discounted send.
  const handleSend = async () => {
    if (saving) return;
    if (blockedByDeal) {
      toast.error("Discount approval pending", { description: `${deal?.dealNo} must be approved before sending a discounted quotation.` });
      return;
    }
    setSaving(true);
    const q = await persistDraft();
    if (!q) { setSaving(false); return; }
    const sent = await sendQuotation(q.id);
    const sentQ = { ...q, sentAt: q.sentAt || new Date().toISOString() } as Quotation;
    const res = await sendQuotationOnWhatsApp(sentQ, settings);
    setSaving(false);
    if (sent) {
      if (res.noPhone) {
        toast.success("Quotation ready", { description: `${q.quotationNo} saved${res.pdfDownloaded ? " (PDF downloaded)" : ""}. Add a phone number to send on WhatsApp.` });
      } else {
        toast.success("Opening WhatsApp", { description: `${q.quotationNo} — PDF downloaded, attach it in the chat.` });
      }
      onClose();
    }
  };

  const footer = (
    <div className="flex items-center justify-between gap-2">
      <Button variant="outline" size="sm" onClick={() => setEditing((e) => !e)} className="gap-1.5" disabled={!canEdit}>
        <Pencil className="h-3.5 w-3.5" /> {editing ? "Done editing" : "Edit"}
      </Button>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={handlePreview} className="gap-1.5" disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Preview
        </Button>
        <Button
          size="sm"
          onClick={handleSend}
          className="gap-1.5"
          disabled={saving || !canSend || blockedByDeal}
          title={blockedByDeal ? "Discount approval pending" : undefined}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send Quotation
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <RoxCenteredForm
        open={open}
        onClose={onClose}
        title="Send Quotation"
        subtitle={`${lead.leadNo} · ${draft.customerName || "Customer"}`}
        icon={FileText}
        width="max-w-2xl"
        footer={footer}
        canEdit={canEdit}
      >
        <div className="space-y-5">
          {/* Deal gate banner */}
          {dealOpen ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Discount approval pending</p>
                <p>{deal?.dealNo} ({formatDealDiscount(deal?.requestedDiscount ?? null, deal?.requestedDiscountType ?? "amount")} requested) is awaiting approval. You can send a <strong>standard-price</strong> quotation now; a discounted quotation is blocked until the deal is approved.</p>
              </div>
            </div>
          ) : null}
          {dealApproved && deal?.approvedDiscount != null ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-800">
              Approved discount applied: <strong>{formatDealDiscount(deal.approvedDiscount, deal.approvedDiscountType)}</strong> ({deal.dealNo}).
            </div>
          ) : null}

          {/* Auto-mapped summary (read-only lead data) */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
            <Mapped label="Customer" value={draft.customerName} />
            <Mapped label="Phone" value={draft.phone} />
            <Mapped label="Device" value={draft.device || "—"} />
            <Mapped label="Service / Issue" value={draft.issue || "—"} />
            <Mapped label="Sales Agent" value={draft.salesAgentName || "—"} />
            <Mapped label="Lead" value={lead.leadNo} />
          </div>

          {editing ? (
            <div className="space-y-4">
              {/* Device & Issue — mapped from the lead, editable via the Device
                  Catalog + issue pills (ticket-style). */}
              <QuotationDeviceIssue
                device={draft.device}
                deviceCategoryId={draft.deviceCategoryId}
                deviceBrandId={draft.deviceBrandId}
                deviceModelId={draft.deviceModelId}
                issue={draft.issue}
                onDeviceChange={handleDeviceChange}
                onIssueChange={(issue) => patch({ issue })}
              />

              {/* Quotation-specific edits only — never the source lead data. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Customer Email</Label>
                  <Input type="email" value={draft.email} onChange={(e) => patch({ email: e.target.value })} className="h-9" placeholder="For emailing the quotation" />
                </div>
                <div className="space-y-1">
                  <Label>Valid Until</Label>
                  <Input type="date" value={draft.validUntil} onChange={(e) => patch({ validUntil: e.target.value })} className="h-9" />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Quoted Items</Label>
                <QuotationItemsEditor
                  items={draft.items}
                  onChange={(items) => patch({ items })}
                  device={{
                    categoryId: draft.deviceCategoryId,
                    brandId: draft.deviceBrandId,
                    modelId: draft.deviceModelId,
                    label: draft.device,
                  }}
                />
              </div>

              <div className="space-y-1">
                <Label>Warranty</Label>
                <WarrantyField warranty={draft.warranty} onChange={(w) => patch({ warranty: w })} />
              </div>

              {/* Discount — gated by the deal workflow */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Discount</Label>
                  <Input
                    type="number" min={0}
                    value={draft.discount}
                    onChange={(e) => patch({ discount: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-9"
                    disabled={dealOpen}
                  />
                  {dealOpen ? <p className="text-[11px] text-amber-700">Discount locked until the pending deal is approved.</p> : null}
                </div>
                <div className="space-y-1">
                  <Label>Quotation Note (optional)</Label>
                  <Textarea value={draft.note} onChange={(e) => patch({ note: e.target.value })} rows={2} placeholder="Anything specific for the customer" />
                </div>
              </div>
            </div>
          ) : (
            <QuotationPreview draft={draft} store={storeInfo} />
          )}
        </div>
      </RoxCenteredForm>
    </>
  );
}

function Mapped({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}
