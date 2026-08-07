"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Search, Edit2, X, User, Building2, Phone, Mail, MapPin, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { RSelect } from "@/components/ui/rselect";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { createCustomer, type Customer } from "@/lib/customer-data";

export default function ManageCustomersPage() {
  const { customers, addCustomer, updateCustomer, deleteCustomer } = useStore();

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "personal" | "business">("all");

  // Form state
  const [form, setForm] = useState({
    type: "personal" as "personal" | "business",
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
    setForm({ type: "personal", firstName: "", lastName: "", mobile: "", email: "", company: "", gstNumber: "", address: "", city: "", state: "", postalCode: "", notes: "" });
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

  // Filter and search
  const filtered = customers.filter((c) => {
    if (filterType !== "all" && c.type !== filterType) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.fullName.toLowerCase().includes(q) ||
      c.mobile.replace(/[\s\-\(\)\+]/g, "").includes(q.replace(/[\s\-\(\)\+]/g, "")) ||
      c.email.toLowerCase().includes(q) ||
      c.company.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings › Customers"
        title="Manage Customers"
        subtitle="Add, edit, or remove customers. These customers are available when creating tickets."
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e: any) => setSearch(e.target.value)}
              placeholder="Search by name, phone, email, company..."
              className="pl-9 h-10"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {(["all", "personal", "business"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium transition",
                  filterType === t
                    ? "bg-[#4361EE] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {t === "all" ? "All" : t === "personal" ? "Personal" : "Business"}
              </button>
            ))}
          </div>
        </div>
        <Button size="md" onClick={openNewForm}>
          <Plus className="h-4 w-4" /> Add Customer
        </Button>
      </div>

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
                {/* Type */}
                <div className="space-y-1">
                  <Label>Customer Type</Label>
                  <RSelect
                    value={form.type}
                    onChange={(v) => setForm({ ...form, type: v as "personal" | "business" })}
                    options={[
                      { label: "Personal", value: "personal" },
                      { label: "Business", value: "business" },
                    ]}
                  />
                </div>

                {/* First Name */}
                <div className="space-y-1">
                  <Label>First Name *</Label>
                  <Input
                    value={form.firstName}
                    onChange={(e: any) => setForm({ ...form, firstName: e.target.value })}
                    placeholder="First name"
                  />
                </div>

                {/* Last Name */}
                <div className="space-y-1">
                  <Label>Last Name</Label>
                  <Input
                    value={form.lastName}
                    onChange={(e: any) => setForm({ ...form, lastName: e.target.value })}
                    placeholder="Last name"
                  />
                </div>

                {/* Mobile */}
                <div className="space-y-1">
                  <Label>Mobile *</Label>
                  <Input
                    value={form.mobile}
                    onChange={(e: any) => setForm({ ...form, mobile: e.target.value })}
                    placeholder="+91 98765 43210"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    value={form.email}
                    onChange={(e: any) => setForm({ ...form, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>

                {/* Company */}
                <div className="space-y-1">
                  <Label>Company</Label>
                  <Input
                    value={form.company}
                    onChange={(e: any) => setForm({ ...form, company: e.target.value })}
                    placeholder="Company name"
                  />
                </div>

                {/* GST */}
                {form.type === "business" && (
                  <div className="space-y-1">
                    <Label>GST Number</Label>
                    <Input
                      value={form.gstNumber}
                      onChange={(e: any) => setForm({ ...form, gstNumber: e.target.value })}
                      placeholder="29AABCK1234F1ZP"
                    />
                  </div>
                )}

                {/* Address */}
                <div className="space-y-1">
                  <Label>Address</Label>
                  <Input
                    value={form.address}
                    onChange={(e: any) => setForm({ ...form, address: e.target.value })}
                    placeholder="Street address"
                  />
                </div>

                {/* City */}
                <div className="space-y-1">
                  <Label>City</Label>
                  <Input
                    value={form.city}
                    onChange={(e: any) => setForm({ ...form, city: e.target.value })}
                    placeholder="City"
                  />
                </div>

                {/* State */}
                <div className="space-y-1">
                  <Label>State</Label>
                  <Input
                    value={form.state}
                    onChange={(e: any) => setForm({ ...form, state: e.target.value })}
                    placeholder="State"
                  />
                </div>

                {/* Postal Code */}
                <div className="space-y-1">
                  <Label>Postal Code</Label>
                  <Input
                    value={form.postalCode}
                    onChange={(e: any) => setForm({ ...form, postalCode: e.target.value })}
                    placeholder="560001"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <Label>Notes</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e: any) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Any internal notes about this customer..."
                    rows={2}
                  />
                </div>
              </div>

              {/* Actions */}
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

      {/* Customer List */}
      <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Customers ({filtered.length}{filterType !== "all" ? ` ${filterType}` : ""})
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">{search ? "No customers match your search." : "No customers yet. Add your first customer above."}</p>
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {filtered.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition">
                {/* Avatar */}
                <span className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold",
                  c.type === "business" ? "bg-violet-100 text-violet-700" : "bg-[#EEF1FD] text-[#4361EE]"
                )}>
                  {c.firstName[0]?.toUpperCase()}{c.lastName[0]?.toUpperCase() || ""}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{c.fullName}</p>
                    <span className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase",
                      c.type === "business" ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"
                    )}>
                      {c.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {c.mobile}
                    {c.email && <> &middot; {c.email}</>}
                    {c.company && <> &middot; {c.company}</>}
                    {c.city && <> &middot; {c.city}</>}
                  </p>
                </div>

                {/* Stats */}
                <div className="hidden sm:block text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground">{c.totalTickets} tickets</p>
                  <p className="text-[10px] text-muted-foreground">{c.id}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditForm(c)}
                    className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-[#4361EE] hover:bg-indigo-50 transition"
                    title="Edit"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  {confirmDelete === c.id ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>No</Button>
                      <Button size="sm" onClick={() => handleDelete(c.id)} className="bg-rose-600 hover:bg-rose-700 text-white">Yes</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(c.id)}
                      className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
