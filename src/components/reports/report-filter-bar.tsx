"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Filter bar (entity filters)
   ──────────────────────────────────────────────────────────────────────────
   V2 presentation change only: the date-range control now lives in the page
   header (see date-range-control.tsx), so this panel holds just the entity
   filters and renders as a collapsible drawer the parent shows on demand.
   Same ReportFilters contract, same onChange/onReset semantics — every filter
   still narrows the exact same underlying dataset as before.
   ────────────────────────────────────────────────────────────────────────── */

import { RotateCcw } from "lucide-react";
import { RSelect } from "@/components/ui/rselect";
import { activeFilterCount } from "@/lib/reports/filters";
import type { ReportFilters, FilterOptionSet } from "@/lib/reports/types";

interface Props {
  filters: ReportFilters;
  options: FilterOptionSet;
  onChange: (next: ReportFilters) => void;
  onReset: () => void;
}

export function ReportFilterBar({ filters, options, onChange, onReset }: Props) {
  const count = activeFilterCount(filters);
  const set = (patch: Partial<ReportFilters>) => onChange({ ...filters, ...patch });
  const withAll = (opts: { label: string; value: string }[], allLabel: string) =>
    [{ label: allLabel, value: "" }, ...opts];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-foreground">Refine this view</p>
        {count > 0 && (
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11.5px] font-medium text-zinc-600 transition hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset {count} filter{count > 1 ? "s" : ""}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <FilterField label="Branch">
          <RSelect value={filters.branch ?? ""} onChange={(v) => set({ branch: v })} searchable options={withAll(options.branches, "All Branches")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Employee">
          <RSelect value={filters.employee ?? ""} onChange={(v) => set({ employee: v })} searchable options={withAll(options.employees, "All Employees")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Technician">
          <RSelect value={filters.technician ?? ""} onChange={(v) => set({ technician: v })} searchable options={withAll(options.technicians, "All Technicians")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Customer">
          <RSelect value={filters.customer ?? ""} onChange={(v) => set({ customer: v })} searchable options={withAll(options.customers, "All Customers")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Invoice Type">
          <RSelect value={filters.invoiceType ?? ""} onChange={(v) => set({ invoiceType: v })} options={withAll(options.invoiceTypes, "All Types")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Ticket Status">
          <RSelect value={filters.ticketStatus ?? ""} onChange={(v) => set({ ticketStatus: v })} options={withAll(options.ticketStatuses, "All Statuses")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Payment Status">
          <RSelect value={filters.paymentStatus ?? ""} onChange={(v) => set({ paymentStatus: v })} options={withAll(options.paymentStatuses, "All Payments")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Payment Mode">
          <RSelect value={filters.paymentMode ?? ""} onChange={(v) => set({ paymentMode: v })} options={withAll(options.paymentModes, "All Modes")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Device Category">
          <RSelect value={filters.deviceCategory ?? ""} onChange={(v) => set({ deviceCategory: v })} searchable options={withAll(options.deviceCategories, "All Devices")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Brand">
          <RSelect value={filters.brand ?? ""} onChange={(v) => set({ brand: v })} searchable options={withAll(options.brands, "All Brands")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Model">
          <RSelect value={filters.model ?? ""} onChange={(v) => set({ model: v })} searchable options={withAll(options.models, "All Models")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Priority">
          <RSelect value={filters.priority ?? ""} onChange={(v) => set({ priority: v })} options={withAll(options.priorities, "All Priorities")} menuWidth="w-56" />
        </FilterField>
        <FilterField label="Service Type">
          <RSelect value={filters.serviceType ?? ""} onChange={(v) => set({ serviceType: v })} options={withAll(options.serviceTypes, "All Service Types")} menuWidth="w-56" />
        </FilterField>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
