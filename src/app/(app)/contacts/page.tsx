"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, User, Building2, Phone, Mail, MapPin, Trash2, ChevronDown, ChevronUp, Ticket, FileText, IndianRupee, Calendar, Edit2, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { searchCustomers, createCustomer, type Customer } from "@/lib/customer-data";
import { cn, formatINR } from "@/lib/utils";

export default function CustomersPage() {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useStore();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "personal" | "business">("all");

  // Filter + search
  let filtered = query.trim().length >= 2 ? searchCustomers(customers, query) : customers;
  if (filter !== "all") filtered = filtered.filter((c) => c.type === filter);

  // Stats
  const totalActive = customers.filter((c) => c.status === "active").length;
  const totalBusiness = customers.filter((c) => c.type === "business").length;
  const totalValue = customers.reduce((s, c) => s + c.lifetimeValue, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CRM"
        title="Customer Master"
        subtitle="All customers stored permanently. Used across tickets, invoices, and the entire CRM."
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Customers" value={String(customers.length)} />
        <StatCard label="Active" value={String(totalActive)} />
        <StatCard label="Business Accounts" value={String(totalBusiness)} />
        <StatCard label="Lifetime Revenue" value={formatINR(totalValue)} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Input
            value={query}
            onChange={(e: any) => setQuery(e.target.value)}
            placeholder="Search by name, phone, email, company or ID…"
            iconLeft={<Search className="h-4 w-4" />}
          />
        </div>
        <div className="flex items-center gap-2">
          {(["all", "personal", "business"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all",
                filter === f ? "bg-[#4361EE] text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-slate-200"
              )}
            >
              {f === "all" ? "All" : f === "personal" ? "Personal" : "Business"} ({f === "all" ? customers.length : customers.filter((c) => c.type === f).length})
            </button>
          ))}
          <Button size="md" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add Customer
          </Button>
        </div>
      </div>

      {/* Customer List */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        {/* Header */}
        <div className="hidden sm:grid sm:grid-cols-[1fr_140px_140px_100px_80px] gap-2 px-5 py-2.5 border-b border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Customer</div>
          <div>Contact</div>
          <div>Company</div>
          <div>Tickets</div>
          <div className="text-right">Value</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {filtered.length > 0 ? filtered.map((c) => (
            <CustomerRow
              key={c.id}
              customer={c}
              expanded={expandedId === c.id}
              onToggle={() => setExpandedId(expandedId === c.id ? null : c.id)}
              onEdit={() => setEditId(c.id)}
              onDelete={() => setConfirmDelete(c.id)}
              confirmDelete={confirmDelete === c.id}
              onConfirmDelete={() => { deleteCustomer(c.id); setConfirmDelete(null); }}
              onCancelDelete={() => setConfirmDelete(null)}
            />
          )) : (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              {query ? `No customers match "${query}"` : "No customers yet. Add one to get started."}
            </div>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAdd && (
        <CustomerFormModal
          onClose={() => setShowAdd(false)}
          onSave={(data) => {
            const newCustomer = createCustomer(data);
            addCustomer(newCustomer);
            setShowAdd(false);
          }}
        />
      )}

      {/* Edit Customer Modal */}
      {editId && (
        <CustomerFormModal
          customer={customers.find((c) => c.id === editId)}
          onClose={() => setEditId(null)}
          onSave={(data) => {
            updateCustomer(editId, { ...data, fullName: `${data.firstName} ${data.lastName}`.trim() });
            setEditId(null);
          }}
        />
      )}
    </div>
  );
}

/* ─── Stat Card ──────────────────────────────────────────────────────── */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

/* ─── Customer Row ───────────────────────────────────────────────────── */
function CustomerRow({ customer: c, expanded, onToggle, onEdit, onDelete, confirmDelete, onConfirmDelete, onCancelDelete }: {
  customer: Customer;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  confirmDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition cursor-pointer" onClick={onToggle}>
        {/* Avatar */}
        <span className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold",
          c.type === "business" ? "bg-violet-100 text-violet-700" : "bg-[#EEF1FD] text-[#4361EE]"
        )}>
          {c.firstName[0]}{c.lastName?.[0] || ""}
        </span>

        {/* Name + ID */}
        <div className="flex-1 min-w-0 sm:grid sm:grid-cols-[1fr_140px_140px_100px_80px] sm:gap-2 sm:items-center">
          <div>
            <p className="text-sm font-medium truncate">{c.fullName}</p>
            <p className="text-[10px] text-muted-foreground">{c.id} · {c.type === "business" ? "Business" : "Personal"}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-[12px] truncate">{c.mobile}</p>
            {c.email && <p className="text-[10px] text-muted-foreground truncate">{c.email}</p>}
          </div>
          <div className="hidden sm:block">
            <p className="text-[12px] truncate">{c.company || "—"}</p>
          </div>
          <div className="hidden sm:block">
            <p className="text-[12px] tabular-nums">{c.totalTickets}</p>
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-[12px] font-medium tabular-nums">{formatINR(c.lifetimeValue)}</p>
          </div>
        </div>

        {/* Expand icon */}
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>

      {/* Expanded Details */}
      {expanded && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="border-t border-border bg-muted/20 px-5 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Contact Info */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</p>
              <div className="space-y-1.5 text-[13px]">
                <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {c.mobile}</div>
                {c.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {c.email}</div>}
                {c.address && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> {[c.address, c.city, c.state, c.postalCode].filter(Boolean).join(", ")}</div>}
                {c.company && <div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {c.company}</div>}
                {c.gstNumber && <p className="text-[11px] text-muted-foreground">GST: {c.gstNumber}</p>}
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Statistics</p>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat icon={Ticket} label="Tickets" value={String(c.totalTickets)} />
                <MiniStat icon={FileText} label="Invoices" value={String(c.totalInvoices)} />
                <MiniStat icon={IndianRupee} label="Lifetime" value={formatINR(c.lifetimeValue)} />
                <MiniStat icon={Calendar} label="Last Visit" value={c.lastVisit ? new Date(c.lastVisit).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" }) : "—"} />
              </div>
            </div>

            {/* Notes + Actions */}
            <div className="space-y-2">
              {c.notes && (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
                  <p className="text-[12px] text-muted-foreground">{c.notes}</p>
                </>
              )}
              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                  <Edit2 className="h-3.5 w-3.5" /> Edit
                </Button>
                {confirmDelete ? (
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" onClick={onCancelDelete}>Cancel</Button>
                    <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white" onClick={onConfirmDelete}>Confirm Delete</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" /> Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white border border-border p-2">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
      <p className="mt-0.5 text-[12px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/* ─── Customer Form Modal (Add / Edit) ───────────────────────────────── */
function CustomerFormModal({ customer, onClose, onSave }: {
  customer?: Customer;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const isEdit = !!customer;
  const [form, setForm] = useState({
    firstName: customer?.firstName || "",
    lastName: customer?.lastName || "",
    mobile: customer?.mobile || "",
    email: customer?.email || "",
    company: customer?.company || "",
    gstNumber: customer?.gstNumber || "",
    address: customer?.address || "",
    city: customer?.city || "",
    state: customer?.state || "",
    postalCode: customer?.postalCode || "",
    notes: customer?.notes || "",
    type: customer?.type || "personal" as "personal" | "business",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.firstName.trim()) errs.firstName = "Required";
    if (!form.mobile.trim()) errs.mobile = "Required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-card shadow-2xl ring-1 ring-border"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4 rounded-t-2xl">
          <h3 className="text-base font-bold">{isEdit ? "Edit Customer" : "Add New Customer"}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted transition">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4">
          {/* Type */}
          <div className="flex items-center gap-2">
            <button onClick={() => set("type", "personal")} className={cn("rounded-full px-3 py-1.5 text-[11px] font-semibold transition", form.type === "personal" ? "bg-[#4361EE] text-white" : "bg-muted text-muted-foreground")}>Personal</button>
            <button onClick={() => set("type", "business")} className={cn("rounded-full px-3 py-1.5 text-[11px] font-semibold transition", form.type === "business" ? "bg-[#4361EE] text-white" : "bg-muted text-muted-foreground")}>Business</button>
          </div>

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>First Name *</Label>
              <Input value={form.firstName} onChange={(e: any) => set("firstName", e.target.value)} placeholder="Rahul" className={cn(errors.firstName && "border-rose-400")} />
            </div>
            <div className="space-y-1">
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={(e: any) => set("lastName", e.target.value)} placeholder="Kapoor" />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Mobile *</Label>
              <Input value={form.mobile} onChange={(e: any) => set("mobile", e.target.value)} placeholder="+91 98456 12345" className={cn(errors.mobile && "border-rose-400")} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e: any) => set("email", e.target.value)} placeholder="email@example.com" />
            </div>
          </div>

          {/* Company */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Company</Label>
              <Input value={form.company} onChange={(e: any) => set("company", e.target.value)} placeholder="Company name" />
            </div>
            {form.type === "business" && (
              <div className="space-y-1">
                <Label>GST Number</Label>
                <Input value={form.gstNumber} onChange={(e: any) => set("gstNumber", e.target.value.toUpperCase())} placeholder="29AABCK1234F1ZP" className="font-mono tracking-wider uppercase" maxLength={15} />
              </div>
            )}
          </div>

          {/* Address */}
          <div className="space-y-1">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e: any) => set("address", e.target.value)} placeholder="Street / Locality" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>City</Label>
              <Input value={form.city} onChange={(e: any) => set("city", e.target.value)} placeholder="Bengaluru" />
            </div>
            <div className="space-y-1">
              <Label>State</Label>
              <Input value={form.state} onChange={(e: any) => set("state", e.target.value)} placeholder="Karnataka" />
            </div>
            <div className="space-y-1">
              <Label>Postal Code</Label>
              <Input value={form.postalCode} onChange={(e: any) => set("postalCode", e.target.value)} placeholder="560001" />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e: any) => set("notes", e.target.value)} placeholder="Internal notes about this customer…" rows={2} />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-card px-5 py-3 rounded-b-2xl">
          <Button variant="outline" size="md" onClick={onClose}>Cancel</Button>
          <Button size="md" onClick={handleSave}>{isEdit ? "Save Changes" : "Add Customer"}</Button>
        </div>
      </motion.div>
    </div>
  );
}
