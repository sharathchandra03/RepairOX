"use client";

import { useState, useCallback, useEffect, type ReactNode } from "react";
import { Search, User, Hash } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

const DEFAULT_FILTER_STATE: FilterState = {
  customerName: "",
  invoiceId: "",
  invoiceStatus: "all",
  invoiceType: "all",
  category: "all",
  dateFrom: "",
  dateTo: "",
  dynamicFilters: [],
  pinnedIds: [],
};

/* ─── Quick Date Range Options ───────────────────────────────────────── */

const QUICK_DATE_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "7 Days", value: "7days" },
  { label: "14 Days", value: "14days" },
  { label: "30 Days", value: "30days" },
  { label: "Custom", value: "custom" },
] as const;

type QuickDateValue = (typeof QUICK_DATE_OPTIONS)[number]["value"];

/* ─── Main Component ─────────────────────────────────────────────────── */

export function InvoiceFilters({
  onSearch,
  onReset,
}: {
  onSearch: (state: FilterState) => void;
  onReset: () => void;
  extraActions?: ReactNode;
}) {
  const [state, setState] = useState<FilterState>(DEFAULT_FILTER_STATE);
  // Default the invoice date filter to Today (not All) on open.
  const [quickDate, setQuickDate] = useState<QuickDateValue>("today");

  // Set field helper
  const setField = useCallback((key: keyof FilterState, value: any) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  // Fire onSearch whenever any filter value changes (real-time filtering)
  useEffect(() => {
    onSearch({ ...state, invoiceId: quickDate, pinnedIds: state.invoiceId ? [state.invoiceId] : [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickDate, state.invoiceId, state.customerName, state.invoiceStatus, state.invoiceType, state.category, state.dateFrom, state.dateTo]);

  // Handle quick date selection — immediately filters
  const handleQuickDate = useCallback((value: QuickDateValue) => {
    setQuickDate(value);
    if (value !== "custom") {
      setState((s) => ({ ...s, dateFrom: "", dateTo: "" }));
    }
  }, []);

  // When custom date fields change, auto-select "Custom"
  const handleDateFromChange = useCallback((value: string) => {
    setState((s) => ({ ...s, dateFrom: value }));
    setQuickDate("custom");
  }, []);

  const handleDateToChange = useCallback((value: string) => {
    setState((s) => ({ ...s, dateTo: value }));
    setQuickDate("custom");
  }, []);

  // Search button — triggers filter with current state
  const handleSearch = useCallback(() => {
    onSearch({ ...state, invoiceId: quickDate, pinnedIds: state.invoiceId ? [state.invoiceId] : [] });
  }, [state, quickDate, onSearch]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
      {/* Quick Date Filter Strip */}
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_DATE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleQuickDate(opt.value)}
            className={cn(
              "h-8 min-w-[72px] rounded-full px-4 text-xs font-semibold text-center transition-all",
              quickDate === opt.value
                ? "bg-[#4361EE] text-white shadow-[0_4px_12px_-4px_rgba(67,97,238,0.4)]"
                : "bg-muted text-muted-foreground hover:bg-slate-200 hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Separator */}
      <div className="border-t border-border" />

      {/* Filter Controls Row — 5 equal-width fields + search button */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] items-end gap-3">
        {/* Invoice ID */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice ID</label>
          <Input
            value={state.invoiceId}
            onChange={(e: any) => setField("invoiceId", e.target.value)}
            placeholder="INV-1001"
            iconLeft={<Hash className="h-3.5 w-3.5" />}
            className="!h-11 !rounded-xl !text-sm"
          />
        </div>

        {/* Customer Name */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Customer Name</label>
          <Input
            value={state.customerName}
            onChange={(e: any) => setField("customerName", e.target.value)}
            placeholder="Enter customer name"
            iconLeft={<User className="h-3.5 w-3.5" />}
            className="!h-11 !rounded-xl !text-sm"
          />
        </div>

        {/* Invoice Status */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Status</label>
          <Select
            value={state.invoiceStatus}
            onChange={(e: any) => setField("invoiceStatus", e.target.value)}
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
            value={state.invoiceType}
            onChange={(e: any) => setField("invoiceType", e.target.value)}
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
            value={state.category}
            onChange={(e: any) => setField("category", e.target.value)}
            options={[
              { label: "All Categories", value: "all" },
              { label: "Service", value: "service" },
              { label: "Accessories", value: "accessories" },
            ]}
          />
        </div>

        {/* Search Button — vertically centered with inputs */}
        <div className="flex items-center h-11 shrink-0">
          <Button size="sm" onClick={handleSearch} className="h-11 px-5 rounded-xl">
            <Search className="h-3.5 w-3.5" /> Search
          </Button>
        </div>
      </div>

      {/* Date Range (Custom) — separate row below, only shown when Custom is active */}
      {quickDate === "custom" && (
        <div className="flex items-end gap-4 pt-1">
          <div className="max-w-[320px] space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date Range</label>
            <div className="flex items-center gap-2 h-11">
              <Input
                type="date"
                value={state.dateFrom}
                onChange={(e: any) => handleDateFromChange(e.target.value)}
                className="!h-11 !rounded-xl !text-sm"
              />
              <span className="text-xs text-muted-foreground shrink-0">to</span>
              <Input
                type="date"
                value={state.dateTo}
                onChange={(e: any) => handleDateToChange(e.target.value)}
                className="!h-11 !rounded-xl !text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
