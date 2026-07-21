"use client";

import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, X, Pin, PinOff, Plus, Save, RotateCcw, ChevronDown,
  User, Phone, Mail, Building2, Hash, FileText, CreditCard,
  Smartphone, Wrench, MapPin, Tag, ToggleLeft,
} from "lucide-react";
import { Input, Select, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ─── Criteria Definitions ───────────────────────────────────────────── */

export type FilterType = "text" | "select" | "date" | "toggle" | "phone";

export type CriteriaOption = {
  id: string;
  label: string;
  group: string;
  type: FilterType;
  icon: any;
  options?: { label: string; value: string }[];
  placeholder?: string;
};

const CRITERIA_GROUPS: { group: string; items: CriteriaOption[] }[] = [
  {
    group: "Customer",
    items: [
      { id: "customer_mobile", label: "Customer Mobile", group: "Customer", type: "phone", icon: Phone, placeholder: "+91 …" },
      { id: "customer_email", label: "Customer Email", group: "Customer", type: "text", icon: Mail, placeholder: "email@example.com" },
      { id: "customer_org", label: "Organization", group: "Customer", type: "text", icon: Building2, placeholder: "Company name" },
      { id: "customer_group", label: "Customer Group", group: "Customer", type: "select", icon: User, options: [{ label: "All", value: "" }, { label: "VIP", value: "vip" }, { label: "Regular", value: "regular" }, { label: "Wholesale", value: "wholesale" }] },
      { id: "gst_number", label: "GST Number", group: "Customer", type: "text", icon: Hash, placeholder: "22AAAAA0000A1Z5" },
    ],
  },
  {
    group: "Invoice",
    items: [
      { id: "invoice_type", label: "Invoice Type", group: "Invoice", type: "select", icon: FileText, options: [{ label: "All", value: "" }, { label: "Service", value: "service" }, { label: "Product", value: "product" }, { label: "Mixed", value: "mixed" }] },
      { id: "payment_status", label: "Payment Status", group: "Invoice", type: "select", icon: CreditCard, options: [{ label: "All", value: "" }, { label: "Paid", value: "paid" }, { label: "Unpaid", value: "unpaid" }, { label: "Partial", value: "partial" }] },
      { id: "due_status", label: "Due Status", group: "Invoice", type: "select", icon: FileText, options: [{ label: "All", value: "" }, { label: "Not Due", value: "not_due" }, { label: "Due Today", value: "due_today" }, { label: "Overdue", value: "overdue" }] },
      { id: "tax_type", label: "Tax Type", group: "Invoice", type: "select", icon: Tag, options: [{ label: "All", value: "" }, { label: "GST", value: "gst" }, { label: "No Tax", value: "none" }] },
      { id: "currency", label: "Currency", group: "Invoice", type: "select", icon: CreditCard, options: [{ label: "INR (₹)", value: "inr" }, { label: "USD ($)", value: "usd" }] },
    ],
  },
  {
    group: "Repair",
    items: [
      { id: "ticket_id", label: "Ticket ID", group: "Repair", type: "text", icon: Hash, placeholder: "T-1837" },
      { id: "device_brand", label: "Device Brand", group: "Repair", type: "select", icon: Smartphone, options: [{ label: "All", value: "" }, { label: "Apple", value: "apple" }, { label: "Samsung", value: "samsung" }, { label: "OnePlus", value: "oneplus" }, { label: "Other", value: "other" }] },
      { id: "device_model", label: "Device Model", group: "Repair", type: "text", icon: Smartphone, placeholder: "iPhone 16 Pro" },
      { id: "imei", label: "IMEI", group: "Repair", type: "text", icon: Hash, placeholder: "356…" },
      { id: "serial_number", label: "Serial Number", group: "Repair", type: "text", icon: Hash, placeholder: "C02…" },
      { id: "repair_type", label: "Repair Type", group: "Repair", type: "select", icon: Wrench, options: [{ label: "All", value: "" }, { label: "Screen", value: "screen" }, { label: "Battery", value: "battery" }, { label: "Board", value: "board" }, { label: "Other", value: "other" }] },
      { id: "technician", label: "Technician", group: "Repair", type: "select", icon: User, options: [{ label: "All", value: "" }, { label: "Anand", value: "anand" }, { label: "Pooja", value: "pooja" }, { label: "Vikas", value: "vikas" }, { label: "Shubham", value: "shubham" }, { label: "Ravi", value: "ravi" }] },
    ],
  },
  {
    group: "Business",
    items: [
      { id: "branch", label: "Branch", group: "Business", type: "select", icon: MapPin, options: [{ label: "All", value: "" }, { label: "BTM Layout (HQ)", value: "btm" }, { label: "Koramangala", value: "koramangala" }, { label: "HSR Layout", value: "hsr" }] },
      { id: "sales_exec", label: "Sales Executive", group: "Business", type: "select", icon: User, options: [{ label: "All", value: "" }, { label: "Anjali R.", value: "anjali" }, { label: "Manoj S.", value: "manoj" }] },
      { id: "payment_method", label: "Payment Method", group: "Business", type: "select", icon: CreditCard, options: [{ label: "All", value: "" }, { label: "Cash", value: "cash" }, { label: "UPI", value: "upi" }, { label: "Card", value: "card" }, { label: "Bank Transfer", value: "bank" }] },
      { id: "product_category", label: "Product Category", group: "Business", type: "select", icon: Tag, options: [{ label: "All", value: "" }, { label: "Parts", value: "parts" }, { label: "Labour", value: "labour" }, { label: "Accessories", value: "accessories" }] },
    ],
  },
  {
    group: "Flags",
    items: [
      { id: "show_unsaved", label: "Show Unsaved Invoices", group: "Flags", type: "toggle", icon: ToggleLeft },
      { id: "show_deposit", label: "Show Deposit Invoices", group: "Flags", type: "toggle", icon: ToggleLeft },
      { id: "overdue_only", label: "Overdue Only", group: "Flags", type: "toggle", icon: ToggleLeft },
      { id: "partially_paid", label: "Partially Paid", group: "Flags", type: "toggle", icon: ToggleLeft },
      { id: "refunded", label: "Refunded", group: "Flags", type: "toggle", icon: ToggleLeft },
      { id: "has_discount", label: "Has Discount", group: "Flags", type: "toggle", icon: ToggleLeft },
    ],
  },
];

const ALL_CRITERIA = CRITERIA_GROUPS.flatMap((g) => g.items);

/* ─── Types ──────────────────────────────────────────────────────────── */

export type ActiveFilter = {
  id: string;
  value: string;
  pinned: boolean;
};

export type FilterState = {
  customerName: string;
  invoiceId: string;
  invoiceStatus: string;
  employee: string;
  dateFrom: string;
  dateTo: string;
  dynamicFilters: ActiveFilter[];
  pinnedIds: string[];
};

const DEFAULT_FILTER_STATE: FilterState = {
  customerName: "",
  invoiceId: "",
  invoiceStatus: "all",
  employee: "",
  dateFrom: "",
  dateTo: "",
  dynamicFilters: [],
  pinnedIds: [],
};

/* ─── Main Component ─────────────────────────────────────────────────── */

export function InvoiceFilters({
  onSearch,
  onReset,
  extraActions,
}: {
  onSearch: (state: FilterState) => void;
  onReset: () => void;
  extraActions?: ReactNode;
}) {
  const [state, setState] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [showCriteria, setShowCriteria] = useState(false);
  const [criteriaSearch, setCriteriaSearch] = useState("");

  // Set field helper
  const setField = useCallback((key: keyof FilterState, value: any) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  // Add dynamic filter
  const addFilter = useCallback((criteriaId: string) => {
    setState((s) => {
      if (s.dynamicFilters.some((f) => f.id === criteriaId)) return s;
      const isPinned = s.pinnedIds.includes(criteriaId);
      return { ...s, dynamicFilters: [...s.dynamicFilters, { id: criteriaId, value: "", pinned: isPinned }] };
    });
    setShowCriteria(false);
    setCriteriaSearch("");
  }, []);

  // Remove dynamic filter
  const removeFilter = useCallback((criteriaId: string) => {
    setState((s) => ({
      ...s,
      dynamicFilters: s.dynamicFilters.filter((f) => f.id !== criteriaId),
    }));
  }, []);

  // Update dynamic filter value
  const updateFilterValue = useCallback((criteriaId: string, value: string) => {
    setState((s) => ({
      ...s,
      dynamicFilters: s.dynamicFilters.map((f) => f.id === criteriaId ? { ...f, value } : f),
    }));
  }, []);

  // Pin/unpin
  const togglePin = useCallback((criteriaId: string) => {
    setState((s) => {
      const isPinned = s.pinnedIds.includes(criteriaId);
      const pinnedIds = isPinned ? s.pinnedIds.filter((id) => id !== criteriaId) : [...s.pinnedIds, criteriaId];
      const dynamicFilters = s.dynamicFilters.map((f) => f.id === criteriaId ? { ...f, pinned: !isPinned } : f);
      return { ...s, pinnedIds, dynamicFilters };
    });
  }, []);

  // Reset
  const handleReset = useCallback(() => {
    setState((s) => ({
      ...DEFAULT_FILTER_STATE,
      pinnedIds: s.pinnedIds,
      dynamicFilters: s.dynamicFilters.filter((f) => s.pinnedIds.includes(f.id)).map((f) => ({ ...f, value: "" })),
    }));
    onReset();
  }, [onReset]);

  // Search
  const handleSearch = useCallback(() => {
    onSearch(state);
  }, [state, onSearch]);

  // Filtered criteria for dropdown
  const filteredCriteria = useMemo(() => {
    const activeIds = new Set(state.dynamicFilters.map((f) => f.id));
    const q = criteriaSearch.toLowerCase();
    return CRITERIA_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => !activeIds.has(item.id) && (!q || item.label.toLowerCase().includes(q))),
    })).filter((g) => g.items.length > 0);
  }, [state.dynamicFilters, criteriaSearch]);

  return (
    <div className="space-y-4">
      {/* Primary Filters Row */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card overflow-hidden">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <FilterField label="Customer Name">
            <Input value={state.customerName} onChange={(e: any) => setField("customerName", e.target.value)} placeholder="Enter customer name" iconLeft={<User className="h-3.5 w-3.5" />} />
          </FilterField>
          <FilterField label="Invoice ID">
            <Input value={state.invoiceId} onChange={(e: any) => setField("invoiceId", e.target.value)} placeholder="INV-1001" iconLeft={<Hash className="h-3.5 w-3.5" />} />
          </FilterField>
          <FilterField label="Invoice Status">
            <Select value={state.invoiceStatus} onChange={(e: any) => setField("invoiceStatus", e.target.value)} options={[
              { label: "All Statuses", value: "all" },
              { label: "Draft", value: "draft" }, { label: "Sent", value: "sent" },
              { label: "Paid", value: "paid" }, { label: "Partial", value: "partial" },
              { label: "Overdue", value: "overdue" }, { label: "Cancelled", value: "cancelled" },
            ]} />
          </FilterField>
          <FilterField label="Employee">
            <Select value={state.employee} onChange={(e: any) => setField("employee", e.target.value)} options={[
              { label: "All Employees", value: "" },
              { label: "Anjali R.", value: "Anjali R." }, { label: "Vikas", value: "Vikas" },
              { label: "Pooja", value: "Pooja" }, { label: "Ravi", value: "Ravi" },
            ]} />
          </FilterField>
          <FilterField label="Created Date">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex-1 min-w-0">
                <Input type="date" value={state.dateFrom} onChange={(e: any) => setField("dateFrom", e.target.value)} className="text-xs w-full" />
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">to</span>
              <div className="flex-1 min-w-0">
                <Input type="date" value={state.dateTo} onChange={(e: any) => setField("dateTo", e.target.value)} className="text-xs w-full" />
              </div>
            </div>
          </FilterField>
        </div>

        {/* Dynamic Filters */}
        <AnimatePresence>
          {state.dynamicFilters.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="mt-3 pt-3 border-t border-border"
            >
              <div className="flex flex-wrap gap-3">
                {state.dynamicFilters.map((filter) => {
                  const criteria = ALL_CRITERIA.find((c) => c.id === filter.id);
                  if (!criteria) return null;
                  return (
                    <DynamicFilterCard
                      key={filter.id}
                      criteria={criteria}
                      value={filter.value}
                      pinned={filter.pinned}
                      onChange={(v) => updateFilterValue(filter.id, v)}
                      onPin={() => togglePin(filter.id)}
                      onRemove={() => removeFilter(filter.id)}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Row */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Select Criteria button */}
          <CriteriaSelector
            open={showCriteria}
            onToggle={() => setShowCriteria(!showCriteria)}
            onSelect={addFilter}
            search={criteriaSearch}
            onSearchChange={setCriteriaSearch}
            groups={filteredCriteria}
          />

          <div className="flex-1" />

          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
          {extraActions}
          <Button variant="outline" size="sm">
            <Save className="h-3.5 w-3.5" /> Save Filter
          </Button>
          <Button size="sm" onClick={handleSearch}>
            <Search className="h-3.5 w-3.5" /> Search
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Filter Field Wrapper ───────────────────────────────────────────── */

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/* ─── Dynamic Filter Card ────────────────────────────────────────────── */

function DynamicFilterCard({
  criteria,
  value,
  pinned,
  onChange,
  onPin,
  onRemove,
}: {
  criteria: CriteriaOption;
  value: string;
  pinned: boolean;
  onChange: (v: string) => void;
  onPin: () => void;
  onRemove: () => void;
}) {
  const Icon = criteria.icon;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "flex items-center gap-2 rounded-xl border bg-card p-2 pr-1 shadow-sm transition",
        pinned ? "border-indigo-200 bg-indigo-50/30" : "border-border"
      )}
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground leading-none mb-1">{criteria.label}</p>
        {criteria.type === "toggle" ? (
          <button
            onClick={() => onChange(value === "true" ? "" : "true")}
            className={cn(
              "relative h-5 w-9 rounded-full transition",
              value === "true" ? "bg-[#4361EE]" : "bg-zinc-200"
            )}
          >
            <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", value === "true" ? "left-[18px]" : "left-0.5")} />
          </button>
        ) : criteria.type === "select" ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-full min-w-[120px] appearance-none rounded-lg border border-border bg-card px-2 text-xs focus:border-[#4361EE] focus:ring-1 focus:ring-[#4361EE]/30 focus:outline-none"
          >
            {criteria.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            type={criteria.type === "phone" ? "tel" : "text"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={criteria.placeholder || "Enter value…"}
            className="h-7 w-full min-w-[120px] rounded-lg border border-border bg-card px-2 text-xs placeholder:text-muted-foreground focus:border-[#4361EE] focus:ring-1 focus:ring-[#4361EE]/30 focus:outline-none"
          />
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0 ml-1">
        <button onClick={onPin} className={cn("grid h-6 w-6 place-items-center rounded-md transition", pinned ? "text-[#4361EE] hover:bg-indigo-100" : "text-muted-foreground hover:bg-muted")} title={pinned ? "Unpin" : "Pin"}>
          {pinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
        </button>
        <button onClick={onRemove} className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-500 transition" title="Remove">
          <X className="h-3 w-3" />
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Criteria Selector Dropdown ─────────────────────────────────────── */

function CriteriaSelector({
  open,
  onToggle,
  onSelect,
  search,
  onSearchChange,
  groups,
}: {
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  groups: { group: string; items: CriteriaOption[] }[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onToggle();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onToggle]);

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="sm" onClick={onToggle} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Select Criteria <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
      </Button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 top-full mt-2 z-50 w-72 rounded-xl border border-border bg-popover shadow-[0_12px_40px_-12px_rgba(20,30,80,0.25)] overflow-hidden"
          >
            {/* Search */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search criteria…"
                  className="h-8 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:border-[#4361EE] focus:ring-1 focus:ring-[#4361EE]/30 focus:outline-none"
                />
              </div>
            </div>

            {/* Groups */}
            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {groups.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">No matching criteria</p>
              )}
              {groups.map((g) => (
                <div key={g.group} className="mb-1">
                  <p className="px-2 py-1.5 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">{g.group}</p>
                  {g.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onSelect(item.id)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-foreground transition hover:bg-muted"
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
