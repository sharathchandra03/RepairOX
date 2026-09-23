"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Settings → Customers → Customer Master

   Redesigned around three tabs so the customer identity lifecycle (per
   REPAIROX-CUSTOMER-MASTER.md) is visible in one place:

     • Customers          — verified customers with a service/commercial
                             relationship (real Customer Master records).
     • CRM Contacts        — prospects captured via Lead/Walk-In intake that
                             have NOT yet been promoted to a Customer.
     • Potential Duplicates — customer records that already look like the
                             same person/business (mobile/email/name+company)
                             so they can be merged from here directly.

   Suppliers/vendors are NOT part of this page — Contacts are strictly the
   inbound (customer-acquisition) side of the business, never the cost side.

   Builds on the canonical table foundation (RepairOX Design System v2): sharp
   2px card frame, visible row separators, and a bare/detached Pagination
   footer. NOTE: unlike Tickets/Walk-In (which sit directly under AppShell's
   single scroll container), pages under /settings live inside a SECOND,
   nested scroll container (SettingsLayout's own <main overflow-y-auto>).
   useRoxStickyHeader()'s ancestor-walk finds that inner container first and
   measures its non-topbar first child, producing a garbage offset — the
   header ends up positioned far down the page instead of pinned at the top.
   So every other table already living under Settings (account/sessions,
   roles-permissions) uses a plain static <thead>, and this page follows the
   same working precedent rather than forcing the Tickets-only sticky hook.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Search, Edit2, X, GitMerge,
  Users, Repeat, Briefcase, Gem, Wallet, UserPlus, ShieldAlert,
  ArrowLeft, Upload, Download,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { RoxFilterPanelHeader, ActiveFiltersBar, type AppliedFilter } from "@/components/ui/rox-filter";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn, formatINR } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useLeads } from "@/lib/leads-context";
import {
  createCustomer, searchCustomers, findDuplicateClusters,
  CUSTOMER_SOURCES, CUSTOMER_SOURCE_LABEL,
  CAPTURE_SOURCE_BADGE, CAPTURE_SOURCE_TONE,
  type Customer, type CustomerSource,
} from "@/lib/customer-data";
import { customersToCSV } from "@/lib/customer-csv";
import { downloadCSV } from "@/lib/csv-utils";
import { toast } from "@/components/ui/toaster";
import { CustomerImportDialog } from "@/components/customers/customer-import-dialog";
import type { Contact } from "@/lib/leads-data";
import { CustomerGroupPicker } from "@/components/common/customer-group-picker";
import { CustomerBadges, resolveGroups } from "@/components/common/customer-classification";
import { Can } from "@/components/common/can";
import { CAP, allow } from "@/lib/capabilities";
import { usePermissions } from "@/lib/permissions-context";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
/** Lifetime-value threshold for the "High Value" KPI + filter — matches the
 *  ₹50k+ chip shown against high-value customers. */
const HIGH_VALUE_THRESHOLD = 50_000;

const SOURCE_OPTIONS = [
  { label: "- Not set -", value: "" },
  ...CUSTOMER_SOURCES.map((s) => ({ label: CUSTOMER_SOURCE_LABEL[s], value: s })),
];

type TabKey = "customers" | "contacts" | "duplicates";

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

/* ─── KPI card ─────────────────────────────────────────────────────────── */
function KpiCard({
  label, value, icon: Icon, hint, chip,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  hint?: React.ReactNode;
  chip?: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-[180px] rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-2 text-[28px] font-bold tracking-tight leading-none">{value}</p>
      {(hint || chip) && (
        <div className="mt-2 flex items-center gap-1.5 text-[12px]">
          {hint && <span className="text-emerald-600 font-medium">{hint}</span>}
          {chip}
        </div>
      )}
    </div>
  );
}

export default function ManageCustomersPage() {
  const router = useRouter();
  const { customers, customerGroups, addCustomer, updateCustomer, deleteCustomer, mergeCustomersAction, loyaltyByCustomer } = useStore();
  const { contacts, hydrated: contactsHydrated } = useLeads();
  const { can } = usePermissions();

  const [tab, setTab] = useState<TabKey>("customers");

  /* ── KPIs (Customers tab) ──────────────────────────────────────────── */
  const kpis = useMemo(() => {
    const now = new Date();
    const activeCustomers = customers.filter((c) => c.status === "active");
    const newThisMonth = customers.filter((c) => {
      const d = new Date(c.createdAt);
      return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const repeatCustomers = customers.filter((c) => (c.totalTickets ?? 0) + (c.totalInvoices ?? 0) > 1);
    const business = customers.filter((c) => c.type === "business");
    const highValue = customers.filter((c) => (c.lifetimeValue ?? 0) >= HIGH_VALUE_THRESHOLD);
    const lifetimeRevenue = customers.reduce((sum, c) => sum + (c.lifetimeValue ?? 0), 0);
    const retentionPct = customers.length > 0 ? Math.round((repeatCustomers.length / customers.length) * 100) : 0;
    return { activeCustomers, newThisMonth, repeatCustomers, business, highValue, lifetimeRevenue, retentionPct };
  }, [customers]);

  /* ── Duplicate clusters (Potential Duplicates tab) ─────────────────── */
  const duplicateClusters = useMemo(() => findDuplicateClusters(customers), [customers]);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "personal" | "business">("all");
  const [filterSource, setFilterSource] = useState<"all" | CustomerSource>("all");
  const [filterGroup, setFilterGroup] = useState<"all" | string>("all");
  const [filterHighValue, setFilterHighValue] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [mergingCustomer, setMergingCustomer] = useState<Customer | null>(null);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeTarget, setMergeTarget] = useState<Customer | null>(null);
  const [mergeReason, setMergeReason] = useState("");
  const [mergeBusy, setMergeBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showImport, setShowImport] = useState(false);

  /* Export the WHOLE customer list to CSV (for marketing/promotions). */
  const handleExport = () => {
    if (customers.length === 0) { toast.info("No customers to export yet."); return; }
    downloadCSV(`customers-${new Date().toISOString().slice(0, 10)}`, customersToCSV(customers, loyaltyByCustomer));
    toast.success(`Exported ${customers.length} customer${customers.length === 1 ? "" : "s"}.`);
  };

  const mergeResults = mergeQuery.trim().length >= 2 && mergingCustomer
    ? searchCustomers(customers, mergeQuery).filter((c) => c.id !== mergingCustomer.id)
    : [];

  const closeMergeDialog = () => {
    setMergingCustomer(null);
    setMergeQuery("");
    setMergeTarget(null);
    setMergeReason("");
  };

  const handleMerge = async () => {
    if (!mergingCustomer || !mergeTarget) return;
    setMergeBusy(true);
    try {
      // The customer being viewed (mergingCustomer) is folded INTO the
      // selected target — target becomes the surviving/primary record.
      const result = await mergeCustomersAction(mergeTarget.id, mergingCustomer.id, mergeReason || undefined);
      if (result.success) closeMergeDialog();
    } finally {
      setMergeBusy(false);
    }
  };

  const activeGroupList = customerGroups.filter((g) => g.active).sort((a, b) => a.displayOrder - b.displayOrder);

  // Form state
  const [form, setForm] = useState({
    type: "personal" as "personal" | "business",
    source: "" as CustomerSource | "",
    groupIds: [] as string[],
    firstName: "",
    lastName: "",
    mobile: "",
    email: "",
    company: "",
    gstNumber: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    notes: "",
  });

  const resetForm = () => {
    setForm({ type: "personal", source: "", groupIds: [], firstName: "", lastName: "", mobile: "", email: "", company: "", gstNumber: "", address: "", city: "", state: "", postalCode: "", notes: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const openNewForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (c: Customer) => {
    setForm({
      type: c.type,
      source: c.source ?? "",
      groupIds: c.groupIds ?? [],
      firstName: c.firstName,
      lastName: c.lastName,
      mobile: c.mobile,
      email: c.email,
      company: c.company,
      gstNumber: c.gstNumber,
      address: c.address,
      city: c.city,
      state: c.state,
      postalCode: c.postalCode,
      notes: c.notes,
    });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.firstName.trim() || !form.mobile.trim()) return;

    if (editingId) {
      updateCustomer(editingId, {
        type: form.type,
        source: form.source || undefined,
        groupIds: form.groupIds,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        fullName: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        gstNumber: form.gstNumber.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
        notes: form.notes.trim(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      const newCustomer = createCustomer({
        type: form.type,
        source: form.source || undefined,
        groupIds: form.groupIds,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        gstNumber: form.gstNumber.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        postalCode: form.postalCode.trim(),
        notes: form.notes.trim(),
      });
      addCustomer(newCustomer);
    }
    resetForm();
  };

  const handleDelete = (id: string) => {
    deleteCustomer(id);
    setConfirmDelete(null);
  };

  /* ── Filter + search (Customers tab) ────────────────────────────────── */
  const filtered = useMemo(() => customers.filter((c) => {
    if (filterType !== "all" && c.type !== filterType) return false;
    if (filterSource !== "all" && c.source !== filterSource) return false;
    if (filterGroup !== "all" && !(c.groupIds ?? []).includes(filterGroup)) return false;
    if (filterHighValue && (c.lifetimeValue ?? 0) < HIGH_VALUE_THRESHOLD) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.mobile.replace(/[\s\-\(\)\+]/g, "").includes(q.replace(/[\s\-\(\)\+]/g, "")) ||
      c.email.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  }), [customers, filterType, filterSource, filterGroup, filterHighValue, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  const resetFiltersAndPage = () => setPage(1);

  const activeFilterCount = [filterType !== "all", filterSource !== "all", filterGroup !== "all", filterHighValue].filter(Boolean).length;
  const appliedFilters: AppliedFilter[] = [
    ...(filterType !== "all" ? [{ id: "type", label: "Type", value: filterType === "business" ? "Business" : "Personal", onClear: () => { setFilterType("all"); resetFiltersAndPage(); } }] : []),
    ...(filterSource !== "all" ? [{ id: "source", label: "Source", value: CUSTOMER_SOURCE_LABEL[filterSource], onClear: () => { setFilterSource("all"); resetFiltersAndPage(); } }] : []),
    ...(filterGroup !== "all" ? [{ id: "group", label: "Group", value: activeGroupList.find((g) => g.id === filterGroup)?.name ?? filterGroup, onClear: () => { setFilterGroup("all"); resetFiltersAndPage(); } }] : []),
    ...(filterHighValue ? [{ id: "highValue", value: "High Value only", onClear: () => { setFilterHighValue(false); resetFiltersAndPage(); } }] : []),
  ];
  const clearAllFilters = () => { setFilterType("all"); setFilterSource("all"); setFilterGroup("all"); setFilterHighValue(false); resetFiltersAndPage(); };

  const canEdit = allow(can, CAP.customer.edit);
  const canDelete = allow(can, CAP.customer.delete);
  const canMerge = allow(can, CAP.customer.merge);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Shop › Customers"
        title="Customer Master"
        subtitle="Everyone your business has captured — walk-ins, leads, prospects and manual entries. Import, export and use for marketing."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="md" className="gap-1.5 rounded-full" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Can permission={CAP.customer.import}>
              <Button variant="outline" size="md" className="gap-1.5 rounded-full" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4" /> Import
              </Button>
            </Can>
            <Can permission={CAP.customer.export}>
              <Button variant="outline" size="md" className="gap-1.5 rounded-full" onClick={handleExport}>
                <Download className="h-4 w-4" /> Export
              </Button>
            </Can>
            <Can permission={CAP.customer.create}>
              <Button size="md" onClick={openNewForm}>
                <Plus className="h-4 w-4" /> Add Customer
              </Button>
            </Can>
          </div>
        }
      />

      {/* Tabs */}
      <SegmentedTabs
        value={tab}
        onChange={(v) => setTab(v as TabKey)}
        options={[
          { label: "Customers", value: "customers" },
          { label: "CRM Contacts", value: "contacts" },
          {
            label: (
              <span className="inline-flex items-center gap-1.5">
                Potential Duplicates
                {duplicateClusters.length > 0 && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-100 px-1 text-[10px] font-bold text-amber-700">
                    {duplicateClusters.length}
                  </span>
                )}
              </span>
            ),
            value: "duplicates",
          },
        ]}
      />

      {tab === "customers" && (
        <>
          {/* KPI cards */}
          <div className="flex flex-wrap gap-3">
            <KpiCard
              label="Active Customers"
              value={kpis.activeCustomers.length}
              icon={Users}
              hint={kpis.newThisMonth > 0 ? `+${kpis.newThisMonth} this month` : undefined}
            />
            <KpiCard
              label="Repeat Customers"
              value={kpis.repeatCustomers.length}
              icon={Repeat}
              hint={customers.length > 0 ? `${kpis.retentionPct}% retention` : undefined}
            />
            <KpiCard label="Business" value={kpis.business.length} icon={Briefcase} hint="accounts" />
            <KpiCard
              label="High Value"
              value={kpis.highValue.length}
              icon={Gem}
              chip={<span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">₹50k+</span>}
            />
            <KpiCard label="Lifetime Revenue" value={formatINR(kpis.lifetimeRevenue)} icon={Wallet} />
          </div>

          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="flex-1 max-w-sm">
                <Input
                  value={search}
                  onChange={(e: any) => { setSearch(e.target.value); resetFiltersAndPage(); }}
                  placeholder="Search name, phone, email, ID, company"
                  iconLeft={<Search className="h-4 w-4" />}
                  className="h-10"
                />
              </div>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                {(["all", "personal", "business"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setFilterType(t); resetFiltersAndPage(); }}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[12px] font-medium transition",
                      filterType === t ? "bg-[#4361EE] text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {t === "all" ? "All" : t === "personal" ? "Personal" : "Business"}
                  </button>
                ))}
              </div>
              <Button
                variant={showFilters || activeFilterCount > 0 ? "soft" : "outline"}
                size="sm"
                className="shrink-0 gap-1.5 rounded-full"
                onClick={() => setShowFilters((s) => !s)}
              >
                More Filters {activeFilterCount > 0 && <span className="ml-0.5 rounded-full bg-[#4361EE] px-1.5 text-[10px] font-bold text-white">{activeFilterCount}</span>}
              </Button>
            </div>
          </div>

          {/* Filter panel — mandatory close (×) + Reset */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
                  <RoxFilterPanelHeader
                    title="Filters"
                    onClose={() => setShowFilters(false)}
                    onReset={clearAllFilters}
                    resetLabel="Clear all"
                    showReset={activeFilterCount > 0}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="w-44">
                      <RSelect
                        value={filterSource}
                        onChange={(v) => { setFilterSource(v as "all" | CustomerSource); resetFiltersAndPage(); }}
                        options={[{ label: "All Sources", value: "all" }, ...CUSTOMER_SOURCES.map((s) => ({ label: CUSTOMER_SOURCE_LABEL[s], value: s }))]}
                      />
                    </div>
                    {activeGroupList.length > 0 && (
                      <div className="w-44">
                        <RSelect
                          value={filterGroup}
                          onChange={(v) => { setFilterGroup(v); resetFiltersAndPage(); }}
                          options={[{ label: "All Groups", value: "all" }, ...activeGroupList.map((g) => ({ label: g.name, value: g.id }))]}
                        />
                      </div>
                    )}
                    <button
                      onClick={() => { setFilterHighValue((v) => !v); resetFiltersAndPage(); }}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
                        filterHighValue ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border bg-card text-zinc-600 hover:bg-muted"
                      )}
                    >
                      <Gem className="h-3.5 w-3.5" /> High Value (₹50k+)
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Applied-filter chips — each individually removable, per module design rule */}
          <ActiveFiltersBar filters={appliedFilters} onClearAll={clearAllFilters} />

          {/* Add/Edit Form */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">{editingId ? "Edit Customer" : "Add New Customer"}</h3>
                    <button onClick={resetForm} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted transition">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Customer Type</Label>
                      <RSelect
                        value={form.type}
                        onChange={(v) => setForm({ ...form, type: v as "personal" | "business" })}
                        options={[{ label: "Personal", value: "personal" }, { label: "Business", value: "business" }]}
                      />
                      <p className="text-[10px] text-muted-foreground">What kind of customer they are.</p>
                    </div>

                    <div className="space-y-1">
                      <Label>Source</Label>
                      <RSelect
                        value={form.source}
                        onChange={(v) => setForm({ ...form, source: v as CustomerSource | "" })}
                        options={SOURCE_OPTIONS}
                      />
                      <p className="text-[10px] text-muted-foreground">How this customer first came to us.</p>
                    </div>

                    <div className="space-y-1">
                      <Label>First Name *</Label>
                      <Input value={form.firstName} onChange={(e: any) => setForm({ ...form, firstName: e.target.value })} placeholder="First name" />
                    </div>

                    <div className="space-y-1">
                      <Label>Last Name</Label>
                      <Input value={form.lastName} onChange={(e: any) => setForm({ ...form, lastName: e.target.value })} placeholder="Last name" />
                    </div>

                    <div className="space-y-1">
                      <Label>Mobile *</Label>
                      <Input value={form.mobile} onChange={(e: any) => setForm({ ...form, mobile: e.target.value })} placeholder="+91 98765 43210" />
                    </div>

                    <div className="space-y-1">
                      <Label>Email</Label>
                      <Input value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
                    </div>

                    <div className="space-y-1">
                      <Label>Company</Label>
                      <Input value={form.company} onChange={(e: any) => setForm({ ...form, company: e.target.value })} placeholder="Company name" />
                    </div>

                    {form.type === "business" && (
                      <div className="space-y-1">
                        <Label>GST Number</Label>
                        <Input value={form.gstNumber} onChange={(e: any) => setForm({ ...form, gstNumber: e.target.value })} placeholder="29AABCK1234F1ZP" />
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label>Address</Label>
                      <Input value={form.address} onChange={(e: any) => setForm({ ...form, address: e.target.value })} placeholder="Street address" />
                    </div>

                    <div className="space-y-1">
                      <Label>City</Label>
                      <Input value={form.city} onChange={(e: any) => setForm({ ...form, city: e.target.value })} placeholder="City" />
                    </div>

                    <div className="space-y-1">
                      <Label>State</Label>
                      <Input value={form.state} onChange={(e: any) => setForm({ ...form, state: e.target.value })} placeholder="State" />
                    </div>

                    <div className="space-y-1">
                      <Label>Postal Code</Label>
                      <Input value={form.postalCode} onChange={(e: any) => setForm({ ...form, postalCode: e.target.value })} placeholder="560001" />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                      <Label>Customer Groups</Label>
                      <CustomerGroupPicker value={form.groupIds} onChange={(groupIds) => setForm({ ...form, groupIds })} />
                    </div>

                    <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                      <Label>Notes</Label>
                      <Textarea value={form.notes} onChange={(e: any) => setForm({ ...form, notes: e.target.value })} placeholder="Any internal notes about this customer..." rows={2} />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-end gap-2">
                    <Button variant="outline" size="md" onClick={resetForm}>Cancel</Button>
                    <Button size="md" onClick={handleSave} disabled={!form.firstName.trim() || !form.mobile.trim()}>
                      {editingId ? "Update Customer" : "Save Customer"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Canonical table — sharp 2px frame, visible row separators. Plain
              (non-sticky) header: see the file-header note above for why the
              Tickets-style sticky hook doesn't apply inside Settings' nested
              scroll container. */}
          <div className="hidden border-2 border-zinc-300 bg-card shadow-card md:block">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-[14px]">
                <colgroup>
                  <col className="w-[4%]" />{/* checkbox */}
                  <col className="w-[16%]" />{/* Customer */}
                  <col className="w-[7%]" />{/* Type */}
                  <col className="w-[9%]" />{/* Source (captured via) */}
                  <col className="w-[13%]" />{/* Contact */}
                  <col className="w-[11%]" />{/* Company / Groups */}
                  <col className="w-[11%]" />{/* Activity */}
                  <col className="w-[9%]" />{/* Lifetime Value */}
                  <col className="w-[5%]" />{/* Loyalty */}
                  <col className="w-[7%]" />{/* Last Visit */}
                  <col className="w-[9%] min-w-[112px]" />{/* Actions — guaranteed min-width so 3 icon buttons never overflow into the previous column */}
                </colgroup>
                <thead className="bg-[#EEF1FD] border-b-2 border-[#4361EE]/40">
                  <tr className="text-left text-[12px] font-bold uppercase tracking-wider text-[#4361EE]">
                    <th className="px-3 py-3" />
                    <th className="px-3 py-3 text-left whitespace-nowrap">Customer</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Type</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Source</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Contact</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Company</th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Activity</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">
                      <span className="inline-block -translate-x-[10px]">Lifetime Value</span>
                    </th>
                    <th className="px-3 py-3 text-left whitespace-nowrap">Loyalty</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Last Visit</th>
                    <th className="px-3 py-3 min-w-[112px] text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((c) => {
                    const highValue = (c.lifetimeValue ?? 0) >= HIGH_VALUE_THRESHOLD;
                    const repeat = (c.totalTickets ?? 0) + (c.totalInvoices ?? 0) > 1;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/customers/${c.id}`)}
                        className="rox-table-row group h-[68px] cursor-pointer border-b border-zinc-500 align-middle transition hover:bg-muted/40"
                      >
                        <td className="px-3 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="h-4 w-4 rounded border-zinc-300 text-[#4361EE] focus:ring-[#4361EE]/30" onClick={(e) => e.stopPropagation()} />
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar name={c.fullName} size={32} />
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-foreground">{c.fullName}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{c.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <CustomerBadges type={c.type} showSource={false} />
                        </td>
                        <td className="px-3 py-4 align-middle">
                          {c.captureSource ? (
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                              CAPTURE_SOURCE_TONE[c.captureSource]
                            )}>
                              {CAPTURE_SOURCE_BADGE[c.captureSource]}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <p className="truncate text-[12px] text-zinc-700">{c.mobile}</p>
                          {c.email && <p className="truncate text-[11px] text-muted-foreground">{c.email}</p>}
                        </td>
                        <td className="px-3 py-4 align-middle">
                          {c.company && <p className="truncate text-[12px] text-zinc-700">{c.company}</p>}
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {resolveGroups(c.groupIds, customerGroups).slice(0, 2).map((g) => (
                              <span key={g.id} className="inline-flex items-center rounded-full bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">{g.name}</span>
                            ))}
                            {highValue && <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-200">High Value</span>}
                          </div>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <p className="whitespace-nowrap text-[12px] text-zinc-700 tnum">
                            {c.totalTickets} Tk &middot; {c.totalInvoices} Inv
                          </p>
                          {repeat && <p className="mt-0.5 text-[11px] text-emerald-600 font-medium">Repeat</p>}
                        </td>
                        <td className="px-3 py-4 align-middle text-right">
                          <span className="whitespace-nowrap font-semibold tabular-nums">{formatINR(c.lifetimeValue ?? 0)}</span>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          {(() => {
                            const loy = loyaltyByCustomer[c.id];
                            if (!loy) return <span className="text-[12px] text-muted-foreground">—</span>;
                            const tierColors: Record<string, string> = {
                              bronze:   "bg-orange-50 text-orange-700 ring-orange-200",
                              silver:   "bg-slate-50 text-slate-600 ring-slate-200",
                              gold:     "bg-yellow-50 text-yellow-700 ring-yellow-200",
                              platinum: "bg-indigo-50 text-indigo-700 ring-indigo-200",
                            };
                            const color = tierColors[loy.tier] ?? "bg-muted text-muted-foreground ring-border";
                            return (
                              <div>
                                <p className="text-[12px] font-semibold tabular-nums text-zinc-800">{loy.points} pts</p>
                                <span className={`mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset ${color}`}>
                                  {loy.tier.charAt(0).toUpperCase() + loy.tier.slice(1)}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-4 align-middle text-right">
                          <span className="whitespace-nowrap text-[12px] text-zinc-600 tnum">{fmtDate(c.lastVisit)}</span>
                        </td>
                        <td className="px-3 py-4 min-w-[112px] align-middle" onClick={(e) => e.stopPropagation()}>
                          {confirmDelete === c.id ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button size="sm" variant="outline" onClick={(e: any) => { e.stopPropagation(); setConfirmDelete(null); }}>No</Button>
                              <Button size="sm" onClick={(e: any) => { e.stopPropagation(); handleDelete(c.id); }} className="bg-rose-600 hover:bg-rose-700 text-white">Yes</Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && (
                                <button onClick={() => openEditForm(c)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-indigo-50 hover:text-[#4361EE]" title="Edit">
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canMerge && (
                                <button onClick={() => setMergingCustomer(c)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-violet-50 hover:text-violet-600" title="Merge into another customer">
                                  <GitMerge className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {canDelete && (
                                <button onClick={() => setConfirmDelete(c.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-rose-50 hover:text-rose-500" title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="p-12 text-center">
                <p className="text-sm text-muted-foreground">{search || activeFilterCount > 0 ? "No customers match your search or filters." : "No customers yet. Add your first customer above."}</p>
              </div>
            )}
          </div>

          {/* Mobile cards */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {paged.map((c) => (
              <div key={c.id} onClick={() => router.push(`/customers/${c.id}`)} className="cursor-pointer rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={c.fullName} size={36} />
                    <div>
                      <p className="font-semibold">{c.fullName}</p>
                      <p className="text-[11px] text-muted-foreground">{c.id} &middot; {c.mobile}</p>
                    </div>
                  </div>
                  <CustomerBadges type={c.type} showSource={false} />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[12px]">
                  <span className="text-zinc-600">{c.totalTickets} tickets &middot; {c.totalInvoices} invoices</span>
                  <span className="font-semibold tabular-nums">{formatINR(c.lifetimeValue ?? 0)}</span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                {search || activeFilterCount > 0 ? "No customers match your search or filters." : "No customers yet."}
              </div>
            )}
          </div>

          {/* Pagination — bare, detached below the table frame (matches Tickets). */}
          {filtered.length > 0 && (
            <Pagination
              page={currentPage}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={filtered.length}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              itemLabel="customer"
            />
          )}

          {/* Scope note — EVERYONE is captured here: walk-ins, leads, prospects
              and manual/imported entries, whether or not they've transacted.
              The Source column shows where each person was captured. */}
          <div className="rounded-xl border border-[#B3BFF6] bg-[#EEF1FD]/60 px-4 py-2.5 text-center text-[12px] text-[#3347D6]">
            <span className="font-medium">Every person is captured here</span> — walk-ins, leads, prospects and imports, whether or not they've done business. The <span className="font-medium">Source</span> column shows where each was captured.
          </div>
        </>
      )}

      {tab === "contacts" && (
        <ContactsTab contacts={contacts} hydrated={contactsHydrated} customers={customers} />
      )}

      {tab === "duplicates" && (
        <DuplicatesTab
          clusters={duplicateClusters}
          customerGroups={customerGroups}
          canMerge={canMerge}
          onMergeInto={(secondary) => setMergingCustomer(secondary)}
        />
      )}

      {/* Merge dialog — search for the surviving/target customer, confirm,
          then fold `mergingCustomer` into it (tickets/invoices/walk-ins/
          loyalty/groups reassigned, secondary archived). Shared across the
          Customers list AND the Potential Duplicates tab. */}
      {mergingCustomer && (
        <RoxCenteredForm
          open={!!mergingCustomer}
          title="Merge Customer"
          subtitle={`Fold ${mergingCustomer.fullName} into another customer record.`}
          onClose={closeMergeDialog}
          width="max-w-md"
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Merging (will be archived)</p>
              <p className="text-sm font-medium mt-0.5">{mergingCustomer.fullName}</p>
              <p className="text-xs text-muted-foreground">{mergingCustomer.mobile} &middot; {mergingCustomer.id}</p>
            </div>

            <div>
              <Label>Merge into (survives) *</Label>
              {mergeTarget ? (
                <div className="mt-1 flex items-center justify-between rounded-lg border border-violet-200 bg-violet-50 p-3">
                  <div>
                    <p className="text-sm font-medium">{mergeTarget.fullName}</p>
                    <p className="text-xs text-muted-foreground">{mergeTarget.mobile} &middot; {mergeTarget.id}</p>
                  </div>
                  <button onClick={() => setMergeTarget(null)} className="text-zinc-400 hover:text-zinc-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <Input
                    value={mergeQuery}
                    onChange={(e) => setMergeQuery(e.target.value)}
                    placeholder="Search by name, phone, or email…"
                  />
                  {mergeResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                      {mergeResults.slice(0, 8).map((cand) => (
                        <button
                          key={cand.id}
                          onClick={() => { setMergeTarget(cand); setMergeQuery(""); }}
                          className="w-full px-3 py-2 text-left hover:bg-muted/50 transition"
                        >
                          <p className="text-sm font-medium">{cand.fullName}</p>
                          <p className="text-xs text-muted-foreground">{cand.mobile} &middot; {cand.id}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label>Reason (optional, for audit log)</Label>
              <Textarea
                value={mergeReason}
                onChange={(e) => setMergeReason(e.target.value)}
                placeholder="e.g. Same customer entered twice with different spelling"
                className="mt-1"
              />
            </div>

            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              This reassigns all tickets, invoices, walk-ins, loyalty points and group
              memberships to the surviving customer, then archives{" "}
              <strong>{mergingCustomer.fullName}</strong>. This cannot be undone from the UI.
            </p>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={closeMergeDialog} disabled={mergeBusy}>Cancel</Button>
              <Button
                className="flex-1 bg-violet-600 hover:bg-violet-700"
                disabled={!mergeTarget || mergeBusy}
                onClick={handleMerge}
              >
                {mergeBusy ? "Merging…" : "Merge"}
              </Button>
            </div>
          </div>
        </RoxCenteredForm>
      )}

      {/* Import customers from CSV (deduped, stamped "Imported"). */}
      <CustomerImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        customers={customers}
        addCustomer={addCustomer}
        onDone={({ added, skipped }) => {
          if (added > 0) toast.success(`Imported ${added} new customer${added === 1 ? "" : "s"}.`);
          else if (skipped > 0) toast.info("No new customers — all rows were duplicates or empty.");
        }}
      />
    </div>
  );
}

/* ─── CRM Contacts tab ─────────────────────────────────────────────────── */
function ContactsTab({ contacts, hydrated, customers }: { contacts: Contact[]; hydrated: boolean; customers: Customer[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Only UNPROMOTED contacts belong on the Customer Master surface — once a
  // Contact carries a customerId it already shows up as a real Customer, so
  // listing it again here would double-count the same person.
  const prospects = useMemo(() => contacts.filter((c) => !c.customerId), [contacts]);

  const filtered = useMemo(() => prospects.filter((c) => {
    if (statusFilter !== "all" && (c.status ?? "active") !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.fullName.toLowerCase().includes(q) ||
      (c.mobile ?? c.phone ?? "").replace(/[\s\-\(\)\+]/g, "").includes(q.replace(/[\s\-\(\)\+]/g, "")) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  }), [prospects, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage, pageSize]);

  return (
    <>
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-[12px] text-muted-foreground">
        Prospects captured via Lead or Walk-In intake, before they become a verified Customer. Contacts here have no service or invoice history yet.
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="flex-1 max-w-sm">
            <Input
              value={search}
              onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, phone, email, ID"
              iconLeft={<Search className="h-4 w-4" />}
              className="h-10"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {(["all", "active", "inactive"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium capitalize transition",
                  statusFilter === s ? "bg-[#4361EE] text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hidden border-2 border-zinc-300 bg-card shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-[14px]">
            <colgroup>
              <col className="w-[24%]" />{/* Contact */}
              <col className="w-[19%]" />{/* Phone / Email */}
              <col className="w-[13%]" />{/* Source */}
              <col className="w-[15%]" />{/* Owner */}
              <col className="w-[11%]" />{/* Status */}
              <col className="w-[9%]" />{/* Last Contact */}
              <col className="w-[9%]" />{/* Created */}
            </colgroup>
            <thead className="bg-[#EEF1FD] border-b-2 border-[#4361EE]/40">
              <tr className="text-left text-[12px] font-bold uppercase tracking-wider text-[#4361EE]">
                <th className="px-3 py-3 text-left whitespace-nowrap">Contact</th>
                <th className="px-3 py-3 text-left whitespace-nowrap">Phone / Email</th>
                <th className="px-3 py-3 text-left whitespace-nowrap">Source</th>
                <th className="px-3 py-3 text-left whitespace-nowrap">Owner</th>
                <th className="px-3 py-3 text-left whitespace-nowrap">Status</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Last Contact</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Created</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => (
                <tr key={c.id} className="rox-table-row group h-[68px] border-b border-zinc-500 align-middle transition hover:bg-muted/40">
                  <td className="px-3 py-4 align-middle">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={c.fullName} size={32} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-foreground">{c.fullName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{c.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <p className="truncate text-[12px] text-zinc-700">{c.mobile ?? c.phone ?? "—"}</p>
                    {c.email && <p className="truncate text-[11px] text-muted-foreground">{c.email}</p>}
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <span className="truncate text-[12px] text-zinc-600">{c.source || "—"}</span>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <span className="truncate text-[12px] text-zinc-600">{c.owner || "—"}</span>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                      (c.status ?? "active") === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-zinc-100 text-zinc-500 ring-zinc-200"
                    )}>
                      {c.status ?? "active"}
                    </span>
                  </td>
                  <td className="px-3 py-4 align-middle text-right"><span className="whitespace-nowrap text-[12px] text-zinc-600 tnum">{fmtDate(c.lastContactAt)}</span></td>
                  <td className="px-3 py-4 align-middle text-right"><span className="whitespace-nowrap text-[12px] text-zinc-600 tnum">{fmtDate(c.createdAt)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hydrated && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><UserPlus className="h-6 w-6" /></div>
            <p className="font-semibold">{prospects.length === 0 ? "No CRM contacts yet" : "No contacts match your search"}</p>
            <p className="text-sm text-muted-foreground">{prospects.length === 0 ? "Prospects captured via Lead or Walk-In intake will appear here." : "Try a different search or status."}</p>
          </div>
        )}
        {!hydrated && <div className="p-12 text-center text-sm text-muted-foreground">Loading contacts…</div>}
      </div>

      {/* Mobile cards */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {paged.map((c) => (
          <div key={c.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Avatar name={c.fullName} size={36} />
                <div>
                  <p className="font-semibold">{c.fullName}</p>
                  <p className="text-[11px] text-muted-foreground">{c.mobile ?? c.phone ?? "—"}</p>
                </div>
              </div>
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
                (c.status ?? "active") === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-zinc-100 text-zinc-500 ring-zinc-200"
              )}>
                {c.status ?? "active"}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[12px] text-zinc-600">
              <span>{c.source || "—"}</span>
              <span>{fmtDate(c.createdAt)}</span>
            </div>
          </div>
        ))}
        {hydrated && filtered.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {prospects.length === 0 ? "No CRM contacts yet." : "No contacts match your search."}
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          totalItems={filtered.length}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          itemLabel="contact"
        />
      )}
    </>
  );
}

/* ─── Potential Duplicates tab ─────────────────────────────────────────── */
function DuplicatesTab({
  clusters, customerGroups, canMerge, onMergeInto,
}: {
  clusters: ReturnType<typeof findDuplicateClusters>;
  customerGroups: ReturnType<typeof useStore>["customerGroups"];
  canMerge: boolean;
  onMergeInto: (secondary: Customer) => void;
}) {
  if (clusters.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 bg-card/50 p-14 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><ShieldAlert className="h-6 w-6" /></div>
        <p className="font-semibold">No potential duplicates found</p>
        <p className="max-w-sm text-sm text-muted-foreground">Customer records are checked against matching mobile number, email, and name + company. Nothing looks duplicated right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-[12px] text-amber-800">
        {clusters.length} potential duplicate {clusters.length === 1 ? "group" : "groups"} detected - matched on mobile number, email, or name + company. Review and merge to keep one canonical record per customer.
      </div>
      {clusters.map((cluster) => (
        <div key={cluster.id} className="border-2 border-zinc-300 bg-card shadow-card">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-500 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-600"><ShieldAlert className="h-3.5 w-3.5" /></span>
              <p className="text-[12px] font-semibold">
                Matched on <span className="text-amber-700">{cluster.matchedOn}</span>
                <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">{cluster.confidence}</span>
              </p>
            </div>
            <span className="text-[11px] text-muted-foreground">{cluster.customers.length} records</span>
          </div>
          <div className="divide-y divide-zinc-200">
            {cluster.customers.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={c.fullName} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-semibold">{c.fullName}</p>
                    {i === 0 && <span className="inline-flex items-center rounded-full bg-[#EEF1FD] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#4361EE]">Oldest record</span>}
                    <CustomerBadges type={c.type} showSource={false} groups={resolveGroups(c.groupIds, customerGroups)} maxGroups={1} />
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">{c.id} &middot; {c.mobile}{c.email ? ` · ${c.email}` : ""} &middot; {c.totalTickets} tickets &middot; {formatINR(c.lifetimeValue ?? 0)}</p>
                </div>
                {canMerge && i > 0 && (
                  <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={() => onMergeInto(c)}>
                    <GitMerge className="h-3.5 w-3.5" /> Merge into {cluster.customers[0].fullName.split(" ")[0]}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
