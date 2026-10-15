"use client";

import { useState, useCallback } from "react";
import { RotateCcw, Plus, X, Info, ShieldCheck } from "lucide-react";
import { SettingsPage, SettingsSection } from "@/components/settings/settings-page";
import { Label, Select } from "@/components/ui/input";
import { useStoreSettings } from "@/lib/store-settings";
import { useCanEdit } from "@/lib/use-can-edit";
import { CAP } from "@/lib/capabilities";
import { cn } from "@/lib/utils";
import { RETURN_DISPOSITION_LABEL, type ReturnDisposition } from "@/lib/mock-data";

/**
 * Settings → Invoice → Refunds (structured refund_config).
 *
 * The free-text Refund Policy (Store Information) is unchanged and still prints
 * on documents. This page edits the OPERATIONAL config the refund flow consumes:
 * the reason list, approval requirement, partial-refund toggle and the default
 * disposition for returned items. Payment methods reuse the Payment settings
 * list (no second list). Gated by CAP.settings.financial (view-vs-edit honoured
 * by SettingsPage's canEdit).
 */
export default function InvoiceRefundSettingsPage() {
  const canEdit = useCanEdit(CAP.settings.financial);
  const { settings, updateSettings } = useStoreSettings();
  const [reasons, setReasons] = useState<string[]>(settings.refundConfig.reasons);
  const [requireApproval, setRequireApproval] = useState(settings.refundConfig.requireApproval);
  const [allowPartial, setAllowPartial] = useState(settings.refundConfig.allowPartial);
  const [restockDefault, setRestockDefault] = useState<ReturnDisposition>(settings.refundConfig.restockDefault);
  const [newReason, setNewReason] = useState("");
  const [saving, setSaving] = useState(false);

  const addReason = useCallback(() => {
    const v = newReason.trim();
    if (!v) return;
    setReasons((prev) => (prev.some((r) => r.toLowerCase() === v.toLowerCase()) ? prev : [...prev, v]));
    setNewReason("");
  }, [newReason]);

  const removeReason = useCallback((reason: string) => {
    setReasons((prev) => prev.filter((r) => r !== reason));
  }, []);

  const handleSave = useCallback(() => {
    setSaving(true);
    updateSettings({
      refundConfig: { reasons, requireApproval, allowPartial, restockDefault },
    });
    setTimeout(() => setSaving(false), 400);
  }, [reasons, requireApproval, allowPartial, restockDefault, updateSettings]);

  const dispositionOptions = (Object.keys(RETURN_DISPOSITION_LABEL) as ReturnDisposition[]).map((d) => ({
    label: RETURN_DISPOSITION_LABEL[d],
    value: d,
  }));

  return (
    <SettingsPage
      breadcrumbs={[
        { label: "Invoice", href: "/settings/invoice/general" },
        { label: "Refunds" },
      ]}
      title="Refunds"
      description="Reasons, approval and item-return defaults applied when processing a refund. These never change an already-processed refund."
      onSave={handleSave}
      saving={saving}
      canEdit={canEdit}
    >
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[12.5px] text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Refunds are a monetary reversal attached to a finalized invoice; the invoice itself is never
          edited. Refund methods use the same list as{" "}
          <a href="/settings/invoice/payment" className="text-[#4361EE] hover:underline">Payment</a>. The
          free-text Refund Policy that prints on documents is set under Store Information.
        </p>
      </div>

      <SettingsSection
        title="Refund Reasons"
        description="Shown in the Reason dropdown when processing a refund. A reason is always required."
        icon={RotateCcw}
      >
        <div className="space-y-2">
          {reasons.map((reason) => (
            <div key={reason} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="flex-1 text-sm font-medium">{reason}</span>
              <button
                onClick={() => removeReason(reason)}
                className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition hover:bg-rose-100 hover:text-rose-600"
                title={`Remove ${reason}`}
                aria-label={`Remove ${reason}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {reasons.length === 0 && (
            <p className="text-[13px] text-muted-foreground">No refund reasons. Add one below.</p>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addReason(); }}
            placeholder="Add a reason (e.g. Price adjustment)"
            className="h-[34px] flex-1 rounded-xl border border-border bg-card px-3 text-[13px] focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 focus:outline-none"
          />
          <button
            onClick={addReason}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl bg-[#4361EE] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#3550d8]",
              !newReason.trim() && "opacity-50",
            )}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Refund Controls"
        description="Segregation of duties and partial-refund behaviour."
        icon={ShieldCheck}
      >
        <div className="space-y-3">
          <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
              className="h-4 w-4 rounded border-border text-[#4361EE] focus:ring-[#4361EE]/30"
            />
            <span className="flex-1">
              <span className="block text-sm font-medium">Require approval</span>
              <span className="block text-[11.5px] text-muted-foreground">
                A refund must be approved by a different user (not the initiator) before it settles.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
            <input
              type="checkbox"
              checked={allowPartial}
              onChange={(e) => setAllowPartial(e.target.checked)}
              className="h-4 w-4 rounded border-border text-[#4361EE] focus:ring-[#4361EE]/30"
            />
            <span className="flex-1">
              <span className="block text-sm font-medium">Allow partial refunds</span>
              <span className="block text-[11.5px] text-muted-foreground">
                Permit refunding a smaller amount than the selected scope&apos;s remaining balance.
              </span>
            </span>
          </label>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Returned Item Default"
        description="The disposition proposed when a returned item is recorded. Restock increases saleable stock only when authorised and confirmed, valued at cost."
        icon={RotateCcw}
      >
        <div className="max-w-xs space-y-1.5">
          <Label>Default disposition</Label>
          <Select
            value={restockDefault}
            onChange={(e) => setRestockDefault(e.target.value as ReturnDisposition)}
            options={dispositionOptions}
          />
        </div>
      </SettingsSection>
    </SettingsPage>
  );
}
