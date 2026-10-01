"use client";

import { useMemo, useState } from "react";
import { Filter, SlidersHorizontal } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ActiveFilterChip, RoxFilterPanelHeader } from "@/components/ui/rox-filter";
import { StoreMultiSelect } from "@/components/common/store-multi-select";
import { DateRangePicker } from "@/components/filters/date-range-picker";
import {
  EMPTY_INTELLIGENCE_FILTERS,
  type IntelligenceDateRange,
  type LeadIntelligenceFilters,
} from "@/lib/lead-intelligence";
import type { Lead } from "@/lib/leads-data";
import type { DeviceCategory, PriceListBrand } from "@/lib/price-list-data";

const PERIODS: { label: string; value: IntelligenceDateRange }[] = [
  { label: "Today", value: "today" },
  { label: "This Week", value: "thisWeek" },
  { label: "This Month", value: "thisMonth" },
  { label: "Last Month", value: "lastMonth" },
  { label: "Last 3 Months", value: "last3Months" },
  { label: "Custom", value: "custom" },
];

export function IntelligenceFilters({
  filters,
  onChange,
  leads,
  categories,
  brands,
  lockedStoreName,
}: {
  filters: LeadIntelligenceFilters;
  onChange: (next: LeadIntelligenceFilters) => void;
  leads: Lead[];
  categories: DeviceCategory[];
  brands: PriceListBrand[];
  lockedStoreName?: string;
}) {
  const [showFilters, setShowFilters] = useState(false);
  const set = <K extends keyof LeadIntelligenceFilters>(key: K, value: LeadIntelligenceFilters[K]) => onChange({ ...filters, [key]: value });
  const options = useMemo(() => ({
    source: distinct(leads.map((l) => l.source)),
    modeOfLead: distinct(leads.map((l) => l.modeOfContact)),
    leadCategory: distinct(leads.map((l) => l.leadCategory)),
    subCategory: distinct(leads.map((l) => l.subCategory)),
    priority: distinct(leads.map((l) => l.priority)),
    status: distinct(leads.map((l) => l.status)),
  }), [leads]);
  const visibleBrands = filters.deviceCategoryId
    ? brands.filter((b) => b.categoryId === filters.deviceCategoryId)
    : brands;

  const chips = useMemo(() => {
    const rows: { label: string; value: string; clear: () => void }[] = [];
    if (filters.storeIds.length && !lockedStoreName) rows.push({ label: "Store", value: `${filters.storeIds.length} selected`, clear: () => set("storeIds", []) });
    const fields: { key: keyof LeadIntelligenceFilters; label: string }[] = [
      { key: "source", label: "Source" }, { key: "modeOfLead", label: "Mode" },
      { key: "leadCategory", label: "Lead category" }, { key: "subCategory", label: "Sub category" },
      { key: "priority", label: "Lead type" }, { key: "status", label: "Status" }, { key: "route", label: "Route" },
    ];
    for (const field of fields) {
      const value = String(filters[field.key] || "");
      if (value) rows.push({ label: field.label, value: routeLabel(value), clear: () => set(field.key, "" as never) });
    }
    if (filters.deviceCategoryId) rows.push({
      label: "Device category", value: categories.find((c) => c.id === filters.deviceCategoryId)?.name || filters.deviceCategoryId,
      clear: () => onChange({ ...filters, deviceCategoryId: "", deviceBrandId: "" }),
    });
    if (filters.deviceBrandId) rows.push({
      label: "Device brand", value: brands.find((b) => b.id === filters.deviceBrandId)?.name || filters.deviceBrandId,
      clear: () => set("deviceBrandId", ""),
    });
    return rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, categories, brands, lockedStoreName]);

  const resetDimensions = () => onChange({ ...EMPTY_INTELLIGENCE_FILTERS, dateRange: filters.dateRange, customFrom: filters.customFrom, customTo: filters.customTo });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-full overflow-x-auto px-0.5 py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <SegmentedTabs
            size="sm"
            options={PERIODS}
            value={filters.dateRange}
            onChange={(value) => set("dateRange", value as IntelligenceDateRange)}
          />
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {lockedStoreName ? (
            <span className="inline-flex h-[34px] min-w-[150px] items-center rounded-xl border border-border bg-card px-3 text-[12px] font-semibold text-foreground">{lockedStoreName}</span>
          ) : <StoreMultiSelect value={filters.storeIds} onChange={(value) => set("storeIds", value)} />}
          <Button variant={showFilters || chips.length ? "soft" : "outline"} size="sm" className="h-[34px] gap-1.5 rounded-xl" onClick={() => setShowFilters(true)}>
            <Filter className="h-3.5 w-3.5" /> Filters
            {chips.length > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#4361EE] px-1 text-[10px] font-bold text-white">{chips.length}</span>}
          </Button>
        </div>
      </div>

      <DateRangePicker
        open={filters.dateRange === "custom"}
        from={filters.customFrom || ""}
        to={filters.customTo || ""}
        onFromChange={(value) => onChange({ ...filters, customFrom: value, dateRange: "custom" })}
        onToChange={(value) => onChange({ ...filters, customTo: value, dateRange: "custom" })}
      />

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => <ActiveFilterChip key={`${chip.label}-${chip.value}`} label={chip.label} value={chip.value} onClear={chip.clear} />)}
          <button type="button" className="text-[12px] font-medium text-[#4361EE] hover:underline" onClick={resetDimensions}>Clear all</button>
        </div>
      )}

      {showFilters && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <RoxFilterPanelHeader title="Intelligence filters" onClose={() => setShowFilters(false)} onReset={resetDimensions} showReset={chips.length > 0} />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField label="Source" value={filters.source} onChange={(v) => set("source", v)} options={options.source} />
            <SelectField label="Mode of Lead" value={filters.modeOfLead} onChange={(v) => set("modeOfLead", v)} options={options.modeOfLead} />
            <SelectField label="Lead Category" value={filters.leadCategory} onChange={(v) => set("leadCategory", v)} options={options.leadCategory} />
            <SelectField label="Sub Category" value={filters.subCategory} onChange={(v) => set("subCategory", v)} options={options.subCategory} />
            <SelectField label="Lead Type / Priority" value={filters.priority} onChange={(v) => set("priority", v)} options={options.priority} />
            <SelectField label="Status" value={filters.status} onChange={(v) => set("status", v)} options={options.status} />
            <SelectField label="Route" value={filters.route} onChange={(v) => set("route", v as LeadIntelligenceFilters["route"])} options={["STORE_VISIT", "PICKUP_DROP", "ON_SITE"]} labels={routeLabel} />
            <SelectField label="Device Category" value={filters.deviceCategoryId} onChange={(v) => onChange({ ...filters, deviceCategoryId: v, deviceBrandId: "" })} options={categories.map((c) => c.id)} labels={(id) => categories.find((c) => c.id === id)?.name || id} />
            <SelectField label="Device Brand" value={filters.deviceBrandId} onChange={(v) => set("deviceBrandId", v)} options={visibleBrands.map((b) => b.id)} labels={(id) => visibleBrands.find((b) => b.id === id)?.name || id} />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground"><SlidersHorizontal className="h-3.5 w-3.5 text-[#4361EE]" />Every section updates from the same lead-created cohort and filter set.</p>
        </div>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options, labels = (v) => v }: { label: string; value: string; onChange: (value: string) => void; options: string[]; labels?: (value: string) => string }) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-[36px] w-full rounded-xl border border-input bg-card px-2.5 text-[13px] text-foreground focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15">
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{labels(option)}</option>)}
      </select>
    </label>
  );
}

function distinct(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function routeLabel(value: string): string {
  return value === "STORE_VISIT" ? "Walk-In" : value === "PICKUP_DROP" ? "Pickup & Drop" : value === "ON_SITE" ? "On-Site" : value;
}
