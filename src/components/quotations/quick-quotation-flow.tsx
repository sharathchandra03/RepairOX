"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Quick Quotation (no Lead required).

   The SECONDARY workflow: a Sales Agent sends a quotation to a customer WITHOUT
   first creating a Lead. It stays fast:

     Quick Quotation → phone lookup → Existing Customer | Create Customer
       → device / service → inventory / items → warranty → generate → send

   Guarantees:
     • Reuses the canonical Customer Master (CustomerIdentityLookup +
       AddCustomerModal) — never a second customer db, never a duplicate.
     • Never creates a Lead (standalone quotation; leadId = "").
     • Sales Agent = the CURRENT logged-in agent (never inherited from the
       customer's history).
     • Creating/sending never makes an invoice/payment/revenue or consumes stock.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { FileText, Send, Eye, Loader2 } from "lucide-react";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { allow, CAP } from "@/lib/capabilities";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { useStoreSettings } from "@/lib/store-settings";
import { useQuotations } from "@/lib/quotations-context";
import { CustomerPicker } from "@/components/common/customer-picker";
import { AddCustomerModal } from "@/components/common/add-customer-modal";
import { buildStoreInfo, getQuotationPrintUrl } from "@/lib/print-utils";
import { sendQuotationOnWhatsApp } from "@/lib/quotation-send";
import type { Customer } from "@/lib/customer-data";
import type { DeviceSelection } from "@/components/leads/lead-form-fields";
import {
  type Quotation, type QuotationDraft,
  emptyQuotationDraft, applyCustomerToDraft, computeQuotationTotals,
  validateQuotationForGenerate,
} from "@/lib/quotation-data";
import { QuotationItemsEditor, QuotationDeviceIssue, WarrantyField, QuotationPreview } from "@/components/quotations/quotation-editor";

export function QuickQuotationFlow({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { can } = usePermissions();
  const session = useSession();
  const { settings } = useStoreSettings();
  const { activeStoreId } = useStoreContext();
  const { customers } = useStore();
  const { createQuotation, sendQuotation } = useQuotations();

  const [draft, setDraft] = useState<QuotationDraft>(() =>
    emptyQuotationDraft({ id: session.id || "", name: session.name || "" }, activeStoreId || ""));
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Quotation | null>(null);

  const canSend = allow(can, CAP.quotation.send);
  const storeInfo = useMemo(() => buildStoreInfo(settings), [settings]);

  // Reset when (re)opened.
  useEffect(() => {
    if (open) {
      setDraft(emptyQuotationDraft({ id: session.id || "", name: session.name || "" }, activeStoreId || ""));
      setCreated(null);
      setShowPreview(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<QuotationDraft>) => setDraft((d) => ({ ...d, ...p }));
  const totals = computeQuotationTotals(draft);

  const applyCustomer = (c: Customer) => setDraft((d) => applyCustomerToDraft(d, c));
  const handleDeviceChange = (sel: DeviceSelection) => setDraft((d) => ({
    ...d,
    device: sel.label,
    deviceCategoryId: sel.categoryId,
    deviceBrandId: sel.brandId,
    deviceModelId: sel.modelId,
  }));

  const persistDraft = async (): Promise<Quotation | null> => {
    const v = validateQuotationForGenerate(draft);
    if (!v.ok) { toast.error("Can't generate quotation", { description: v.errors[0] }); return null; }
    if (created) return created;
    const q = await createQuotation({ ...draft, source: "standalone", leadId: "", leadNo: "" });
    if (q) setCreated(q);
    return q;
  };

  const handlePreview = async () => {
    setSaving(true);
    const q = await persistDraft();
    setSaving(false);
    if (q) window.open(getQuotationPrintUrl(q.id), "_blank");
  };

  // Generate & Send directly — persist, mark sent, generate+download the PDF
  // and open WhatsApp with a short covering message, then close.
  const handleSend = async () => {
    if (saving) return;
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

  const canGenerate = validateQuotationForGenerate(draft).ok;

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" onClick={handlePreview} className="gap-1.5" disabled={saving || !canGenerate}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Preview
      </Button>
      <Button size="sm" onClick={handleSend} className="gap-1.5" disabled={saving || !canSend || !canGenerate}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Generate & Send
      </Button>
    </div>
  );

  return (
    <>
      <RoxCenteredForm
        open={open}
        onClose={onClose}
        title="Quick Quotation"
        subtitle="Send a quotation without creating a lead"
        icon={FileText}
        width="max-w-2xl"
        footer={footer}
      >
        <div className="space-y-5">
          {/* ── Customer (autocomplete search / create) ── */}
          <section className="space-y-2">
            <Label>Customer</Label>
            {/* Searchable Customer Master picker — type to see matching
                customers; "Add New Customer" when none match. */}
            <CustomerPicker
              value={draft.customerId}
              customers={customers}
              onChange={(id) => { if (!id) patch({ customerId: "" }); }}
              onCustomerSelected={applyCustomer}
              showAddButton
              onAddNew={() => setShowAddCustomer(true)}
              placeholder="Search customer by name, phone, or email…"
            />
            {/* Manual fields (also used when creating a brand-new customer). */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                value={draft.customerName}
                onChange={(e) => patch({ customerName: e.target.value, customerId: "" })}
                placeholder="Customer name"
                className="h-9"
              />
              <Input
                value={draft.phone}
                onChange={(e) => patch({ phone: e.target.value, customerId: "" })}
                placeholder="Phone"
                className="h-9"
              />
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => patch({ email: e.target.value })}
                placeholder="Email (optional)"
                className="h-9"
              />
              <Input
                value={draft.location}
                onChange={(e) => patch({ location: e.target.value })}
                placeholder="Location (optional)"
                className="h-9"
              />
            </div>
            {draft.customerName && !draft.customerId ? (
              <button
                type="button"
                onClick={() => setShowAddCustomer(true)}
                className="text-[12px] font-medium text-[#4361EE] hover:underline"
              >
                + Create this customer in Customer Master
              </button>
            ) : null}
          </section>

          {/* ── Device / Service (Device Catalog + issue pills, ticket-style) ── */}
          <section>
            <QuotationDeviceIssue
              device={draft.device}
              deviceCategoryId={draft.deviceCategoryId}
              deviceBrandId={draft.deviceBrandId}
              deviceModelId={draft.deviceModelId}
              issue={draft.issue}
              onDeviceChange={handleDeviceChange}
              onIssueChange={(issue) => patch({ issue })}
            />
          </section>

          {/* ── Items ── */}
          <section className="space-y-1">
            <Label>Quoted Items</Label>
            <QuotationItemsEditor items={draft.items} onChange={(items) => patch({ items })} />
          </section>

          {/* ── Warranty ── */}
          <section className="space-y-1">
            <Label>Warranty</Label>
            <WarrantyField warranty={draft.warranty} onChange={(w) => patch({ warranty: w })} />
          </section>

          {/* ── Note + agent ── */}
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Quotation Note (optional)</Label>
              <Textarea value={draft.note} onChange={(e) => patch({ note: e.target.value })} rows={2} />
            </div>
            <div className="space-y-1">
              <Label>Sales Agent</Label>
              <Input value={draft.salesAgentName} disabled className="h-9" />
              <p className="text-[11px] text-muted-foreground">Automatically you ({session.name || "current agent"}).</p>
            </div>
          </section>

          {/* ── Preview toggle ── */}
          <div>
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-[#4361EE]" onClick={() => setShowPreview((s) => !s)} disabled={!canGenerate}>
              <Eye className="h-3.5 w-3.5" /> {showPreview ? "Hide preview" : "Show preview"}
            </Button>
            {showPreview && canGenerate ? (
              <div className="mt-2">
                <QuotationPreview draft={draft} store={storeInfo} />
              </div>
            ) : null}
          </div>
        </div>
      </RoxCenteredForm>

      <AddCustomerModal
        isOpen={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        onCustomerCreated={(c) => { applyCustomer(c); setShowAddCustomer(false); }}
        title="Create Customer"
        description="Create a Customer Master record for this quotation (no lead required)."
        defaultData={{
          firstName: draft.customerName,
          mobile: draft.phone,
          email: draft.email,
          captureSource: "manual",
        }}
      />

    </>
  );
}
