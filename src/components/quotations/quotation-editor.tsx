"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Shared quotation EDITOR + PREVIEW pieces.

   Reused by BOTH the Lead → Send Quotation review flow and the Quick Quotation
   flow so the two surfaces behave identically. These are quotation-SPECIFIC
   controls only (price / warranty / items / note); they never edit the source
   Lead or the Customer Master.

   • QuotationItemsEditor — proposed line items, reusing the canonical Inventory
     search + Add Inventory (never a second inventory system; never consumes
     stock). Also supports a free-text service line.
   • WarrantyField        — structured warranty (months) with a readable label.
   • QuotationPreview     — the review preview; mirrors the final document.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { Plus, Trash2, Package, Wrench, FileText, Boxes, Smartphone, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatINR } from "@/lib/utils";
import { useCatalog, brandsForCategory, modelsForBrand, partsForModel } from "@/lib/catalog-context";
import { DeviceCatalogPicker, deviceLabel, type DeviceSelection } from "@/components/leads/lead-form-fields";
import { IssueSelector } from "@/components/common/issue-selector";
import {
  type QuotationLineItem, type QuotationWarranty, type QuotationDraft,
  type Quotation,
  createQuotationLine, catalogPartToQuotationLine, computeQuotationTotals,
  warrantyLabel, round2, buildQuotationMessage, formatQuotationMoney,
  type QuotationPolicy, DEFAULT_QUOTATION_POLICY,
} from "@/lib/quotation-data";
import type { PrintStoreInfo } from "@/lib/print-utils";

/* ─── Device & Issue (reuses the ticket-flow pickers) ──────────────────────
   Device comes from the Device Catalog (Category → Brand → Model) and the issue
   is captured as pills — exactly like the Ticket intake flow. Both store their
   structured values on the quotation draft. */

export function QuotationDeviceIssue({
  device,
  deviceCategoryId,
  deviceBrandId,
  deviceModelId,
  issue,
  onDeviceChange,
  onIssueChange,
}: {
  device: string;
  deviceCategoryId: string;
  deviceBrandId: string;
  deviceModelId: string;
  issue: string;
  /** Emits the resolved catalog ids + cached label. */
  onDeviceChange: (sel: DeviceSelection) => void;
  onIssueChange: (issue: string) => void;
}) {
  const selection: DeviceSelection = {
    categoryId: deviceCategoryId,
    brandId: deviceBrandId,
    modelId: deviceModelId,
    label: device,
  };
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Smartphone className="h-3.5 w-3.5 text-[#4361EE]" /> Device
        </label>
        <DeviceCatalogPicker value={selection} onChange={onDeviceChange} />
      </div>
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Wrench className="h-3.5 w-3.5 text-[#4361EE]" /> Issue / Service
        </label>
        <IssueSelector value={issue} onChange={onIssueChange} placeholder="Search or add issues (e.g. Battery replacement)…" />
      </div>
    </div>
  );
}

/* ─── Price List part picker ───────────────────────────────────────────────
   A quotation line is sourced from the PRICE LIST (Device Catalog): the agent
   browses Category → Brand → Model and picks published parts (with their
   catalog price). This READS the canonical catalog via useCatalog() — it never
   creates or mutates a catalog record and the catalog carries no stock to
   reserve. Brands + models follow the catalog A–Z ordering. */

function CatalogPartPicker({
  onAdd,
}: {
  onAdd: (part: Parameters<typeof catalogPartToQuotationLine>[0], deviceLabel: string) => void;
}) {
  const { categories, brands, models, parts, hydrated } = useCatalog();
  const [sel, setSel] = useState<DeviceSelection>({ categoryId: "", brandId: "", modelId: "", label: "" });

  const brandName = useMemo(
    () => brandsForCategory(brands, sel.categoryId).find((b) => b.id === sel.brandId)?.name || "",
    [brands, sel.categoryId, sel.brandId],
  );
  const modelName = useMemo(
    () => modelsForBrand(models, sel.brandId).find((m) => m.id === sel.modelId)?.name || "",
    [models, sel.brandId, sel.modelId],
  );
  const label = [brandName, modelName].filter(Boolean).join(" ");

  const partRows = useMemo(
    () => (sel.modelId ? partsForModel(parts, sel.modelId) : []),
    [parts, sel.modelId],
  );

  return (
    <div className="space-y-3 rounded-xl border border-[#4361EE]/30 bg-card p-3 shadow-sm">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Tag className="h-3.5 w-3.5 text-[#4361EE]" /> Pick from Price List
      </p>

      {/* Category → Brand → Model — reuses the canonical catalog picker */}
      <DeviceCatalogPicker value={sel} onChange={setSel} />

      {/* Parts for the selected model, with their published catalog price */}
      {sel.modelId ? (
        partRows.length > 0 ? (
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
            {partRows.map((p) => {
              const unknown = p.priceKnown === false;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onAdd(p, label)}
                  className="group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition hover:bg-[#EEF1FD]"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#EEF1FD] text-[#4361EE]">
                    <Package className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{p.partName}</span>
                    {p.repairCategory ? (
                      <span className="block truncate text-[11px] text-muted-foreground">{p.repairCategory}</span>
                    ) : null}
                  </span>
                  <span className={cn("shrink-0 text-sm font-semibold tabular-nums", unknown ? "text-muted-foreground" : "text-[#4361EE]")}>
                    {unknown ? "N/A" : formatINR(p.price)}
                  </span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-hover:text-[#4361EE]" />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-3 text-center text-[12px] text-muted-foreground">
            {hydrated ? "No parts listed for this model in the Price List." : "Loading parts…"}
          </p>
        )
      ) : (
        <p className="rounded-lg border border-dashed border-border p-3 text-center text-[12px] text-muted-foreground">
          Select a Category, Brand and Model to list its Price List parts.
        </p>
      )}
    </div>
  );
}

/* ─── Items editor (sourced from the Price List) ───────────────────────────── */

export function QuotationItemsEditor({
  items,
  onChange,
}: {
  items: QuotationLineItem[];
  onChange: (items: QuotationLineItem[]) => void;
}) {
  const update = (id: string, patch: Partial<QuotationLineItem>) => {
    onChange(items.map((it) => {
      if (it.id !== id) return it;
      const next = { ...it, ...patch };
      next.total = round2((Number(next.qty) || 0) * (Number(next.unitPrice) || 0));
      return next;
    }));
  };
  const remove = (id: string) => onChange(items.filter((it) => it.id !== id));
  const addFromCatalog = (part: Parameters<typeof catalogPartToQuotationLine>[0], dLabel: string) => {
    onChange([...items, catalogPartToQuotationLine(part, dLabel)]);
  };
  const addService = () => onChange([...items, createQuotationLine({ kind: "service", name: "" })]);

  const subtotal = items.reduce((s, it) => s + (Number(it.total) || 0), 0);

  return (
    <div className="space-y-3 rounded-2xl border-2 border-[#4361EE]/25 bg-[#F7FAFF] p-4">
      {/* Highlighted header — differentiates the quoted-items section */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#4361EE] text-white">
            <Boxes className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-foreground">Price List & Items</p>
            <p className="text-[11px] text-muted-foreground">Pick parts from the Price List (with catalog price) or add a service line.</p>
          </div>
        </div>
      </div>

      {/* Price List part picker — browse Category → Brand → Model → part */}
      <CatalogPartPicker onAdd={addFromCatalog} />

      {/* Action row — Add Service (free line) */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addService}>
          <Wrench className="h-3.5 w-3.5" /> Add Service
        </Button>
      </div>

      {/* Line items table (in-section look) */}
      {items.length > 0 ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left">Item / Service</th>
                <th className="px-2 py-2 text-center w-16">Qty</th>
                <th className="px-2 py-2 text-right w-28">Price</th>
                <th className="px-2 py-2 text-right w-28">Total</th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const fromCatalog = it.kind === "catalog" || it.kind === "inventory";
                return (
                  <tr key={it.id} className="border-t border-border align-middle">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#EEF1FD] text-[#4361EE]">
                          {fromCatalog ? <Package className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
                        </span>
                        {fromCatalog ? (
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{it.name}</p>
                            {it.description ? <p className="truncate text-[11px] text-muted-foreground">{it.description}</p> : null}
                          </div>
                        ) : (
                          <Input
                            value={it.name}
                            onChange={(e) => update(it.id, { name: e.target.value })}
                            placeholder="Service / charge name"
                            className="h-8"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Input
                        type="number" min={1}
                        value={it.qty}
                        onChange={(e) => update(it.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                        className="h-8 w-14 text-center tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Input
                        type="number" min={0}
                        value={it.unitPrice}
                        onChange={(e) => update(it.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                        className="h-8 w-24 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatINR(it.total)}</td>
                    <td className="px-2 py-2 text-center">
                      <button type="button" onClick={() => remove(it.id)} className="text-muted-foreground hover:text-rose-600" title="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/30">
                <td colSpan={3} className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Subtotal</td>
                <td className="px-2 py-2 text-right font-bold tabular-nums">{formatINR(subtotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          No items yet. Pick a part from the Price List or Add Service to build the quotation.
        </div>
      )}
    </div>
  );
}

/* ─── Warranty field ─────────────────────────────────────────────────────── */

const WARRANTY_PRESETS = [0, 1, 3, 6, 12, 24];

export function WarrantyField({
  warranty,
  onChange,
}: {
  warranty: QuotationWarranty;
  onChange: (w: QuotationWarranty) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {WARRANTY_PRESETS.map((m) => {
          const active = (warranty.months ?? 0) === m && !warranty.label;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ months: m === 0 ? null : m, label: "" })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                active ? "border-[#4361EE] bg-[#EEF1FD] text-[#4361EE]" : "border-border text-muted-foreground hover:border-[#4361EE]/40",
              )}
            >
              {m === 0 ? "No warranty" : m === 1 ? "1 Month" : `${m} Months`}
            </button>
          );
        })}
      </div>
      <Input
        value={warranty.label}
        onChange={(e) => onChange({ ...warranty, label: e.target.value })}
        placeholder='Custom warranty label (optional, e.g. "6 Months", "As applicable")'
        className="h-9"
      />
      <p className="text-[11px] text-muted-foreground">
        The warranty sentence appears in the quotation only when a warranty is set.
        Leave as “No warranty” to omit it — never promise an unrecorded warranty.
      </p>
    </div>
  );
}

/* ─── Preview (mirrors the final document) ─────────────────────────────────── */

export function QuotationPreview({
  draft,
  store,
  policy = DEFAULT_QUOTATION_POLICY,
}: {
  draft: QuotationDraft;
  store: PrintStoreInfo;
  policy?: QuotationPolicy;
}) {
  const totals = computeQuotationTotals(draft);
  // Build the message from a quotation-shaped projection of the draft.
  const q = { ...draft, amount: totals.amount, subtotal: totals.subtotal } as unknown as Quotation;
  const message = buildQuotationMessage(q, store, policy);

  return (
    <div className="rounded-xl border border-border bg-[#F7FAFF] p-4 space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#4361EE]">
        <FileText className="h-3.5 w-3.5" /> Quotation Preview
      </div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm leading-relaxed text-foreground">
        {message.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        {draft.note ? <p className="text-[13px] text-muted-foreground border-t border-border pt-2">{draft.note}</p> : null}
        <div className="pt-1">
          <p>Best regards,</p>
          {message.agentLine ? <p className="font-semibold">{message.agentLine}</p> : null}
          {message.companyLine ? <p className="text-[#4361EE] font-medium">{message.companyLine}</p> : null}
          {message.officeLine ? <p className="text-[13px] text-muted-foreground">{message.officeLine}</p> : null}
          {message.contactLine ? <p className="text-[13px] text-muted-foreground">{message.contactLine}</p> : null}
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-[#EEF1FD] px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#4361EE]">Quotation Total</span>
        <span className="text-base font-bold text-[#4361EE] tabular-nums">{formatQuotationMoney(totals.amount)}</span>
      </div>
    </div>
  );
}
