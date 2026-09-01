"use client";

import { type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";

/* ─── Types ──────────────────────────────────────────────────────────── */

export type FilterState = {
  customerName: string;
  invoiceId: string;
  invoiceStatus: string;
  invoiceType: string;
  category: string;
  dateFrom: string;
  dateTo: string;
  dynamicFilters: { id: string; value: string; pinned: boolean }[];
  pinnedIds: string[];
};

/* ─── Advanced Filters Panel (controlled) ────────────────────────────────
   The quick date strip and the invoice status strip now live on the Invoice
   PAGE itself (always visible). This panel is the ADVANCED filter surface that
   the "Filter" button toggles. It is fully controlled by the page so the
   active filter state persists when the panel is hidden.                    */

export function InvoiceFilters({
  search,
  invoiceStatus,
  invoiceType,
  category,
  onChange,
  onReset,
}: {
  /** Unified live search across Invoice ID + Customer Name. */
  search: string;
  invoiceStatus: string;
  invoiceType: string;
  category: string;
  onChange: (patch: Partial<{ search: string; invoiceStatus: string; invoiceType: string; category: string }>) => void;
  onReset: () => void;
  extraActions?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Advanced Filters</p>
        <button onClick={onReset} className="text-[11px] text-[#4361EE] font-medium hover:underline">
          Reset Filters
        </button>
      </div>

      {/* Filter Controls Row — 4 equal-width fields, evenly distributed (live filtering, no button) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-end gap-3">
        {/* Unified Search — Invoice ID + Customer Name (live, case-insensitive) */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice / Customer</label>
          <Input
            value={search}
            onChange={(e: any) => onChange({ search: e.target.value })}
            placeholder="Search invoice or customer..."
            iconLeft={<Search className="h-3.5 w-3.5" />}
            className="!h-11 !rounded-xl !text-sm"
          />
        </div>

        {/* Invoice Status */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Status</label>
          <Select
            value={invoiceStatus}
            onChange={(e: any) => onChange({ invoiceStatus: e.target.value })}
            options={[
              { label: "All Statuses", value: "all" },
              { label: "Draft", value: "draft" },
              { label: "Sent", value: "sent" },
              { label: "Paid", value: "paid" },
              { label: "Partial", value: "partial" },
              { label: "Overdue", value: "overdue" },
              { label: "Cancelled", value: "cancelled" },
            ]}
          />
        </div>

        {/* Invoice Type */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Type</label>
          <Select
            value={invoiceType}
            onChange={(e: any) => onChange({ invoiceType: e.target.value })}
            options={[
              { label: "All Types", value: "all" },
              { label: "Retail", value: "retail" },
              { label: "Business", value: "business" },
            ]}
          />
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Category</label>
          <Select
            value={category}
            onChange={(e: any) => onChange({ category: e.target.value })}
            options={[
              { label: "All Categories", value: "all" },
              { label: "Service", value: "service" },
              { label: "Accessories", value: "accessories" },
            ]}
          />
        </div>

      </div>
    </div>
  );
}
