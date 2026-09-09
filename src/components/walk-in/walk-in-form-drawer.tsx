"use client";

/* ──────────────────────────────────────────────────────────────────────────
   Walk-In create / edit modal — fast, low-friction entry.

   Opens as a centered dialog over a full-screen blurred backdrop (same concept
   as the Add Lead capture flow) so the Walk-In list stays visible behind it.

   Two compact panels in a single modal (no multi-step wizard):
     1. Walk-In Details — Date (auto), Type, Source, Customer (search/add),
        Contact (auto-populated), and Sales Person (only when Type = Sales).
     2. Device / Enquiry — Model (device catalog), Issue, Final Status.

   Reuses the existing Customer Master (search + quick create), Device Catalog
   (Category → Brand → Model) and Employee/User master (sales assignment) rather
   than creating any parallel data source.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, Search, Check, Phone, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Label, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { useStore } from "@/lib/store";
import { searchCustomers, createCustomer, type CustomerType } from "@/lib/customer-data";
import { CustomerBadges, resolveGroups } from "@/components/common/customer-classification";
import { walkInTypeToCustomerSource } from "@/lib/walk-in-data";

import {
  type WalkIn,
  type WalkInType,
  WALKIN_TYPE_LABEL,
  WALKIN_FINAL_STATUSES,
  WALKIN_STATUS_LABEL,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function WalkInFormDrawer({
  open,
  onClose,
  walkIn,
  sources,
  requireSalesPerson,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  walkIn: WalkIn | null;
  sources: string[];
  requireSalesPerson: boolean;
  onSaved: (data: Partial<WalkIn>, editingId: string | null) => void;
}) {
  const { customers, customerGroups, addCustomer, team, deviceModels } = useStore();
  const isEdit = !!walkIn;
  // Once converted to a ticket, the follow-up schedule is locked (business rule).
  const isConverted = !!walkIn?.linkedTicketId;

  const [form, setForm] = useState<Partial<WalkIn>>({});
  // Customer Type for a NEW customer created from this walk-in (Personal/Business).
  // Independent of the walk-in Type (direct/sales). When an existing customer is
  // linked, this mirrors that customer's type for display only.
  const [contactType, setContactType] = useState<CustomerType>("personal");
  const [custQuery, setCustQuery] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const [salesQuery, setSalesQuery] = useState("");
  const [salesOpen, setSalesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const custRef = useRef<HTMLDivElement>(null);
  const salesRef = useRef<HTMLDivElement>(null);

  // (Re)initialise the form whenever the drawer opens.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (walkIn) {
      setForm({ ...walkIn });
      setCustQuery(walkIn.customer || "");
      setSalesQuery(walkIn.salesPersonName || "");
      const linked = walkIn.customerId ? customers.find((c) => c.id === walkIn.customerId) : undefined;
      setContactType(linked?.type ?? "personal");
    } else {
      const now = new Date();
      setForm({
        date: now.toISOString().slice(0, 10),
        time: now.toTimeString().slice(0, 5),
        type: "direct",
        source: sources[0] || "",
        customer: "",
        phone: "",
        model: "",
        issue: "",
        status: "visitor",
        reasons: [],
        invoiceValue: 0,
        businessValue: 0,
      });
      setCustQuery("");
      setSalesQuery("");
      setContactType("personal");
    }
    setCustOpen(false);
    setSalesOpen(false);
  }, [open, walkIn, sources, customers]);

  // Close the dropdowns when clicking outside them.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setCustOpen(false);
      if (salesRef.current && !salesRef.current.contains(e.target as Node)) setSalesOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Close on Escape + lock body scroll while the modal is open (mirrors the
  // Add Lead capture flow behaviour).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const set = (patch: Partial<WalkIn>) => setForm((f) => ({ ...f, ...patch }));

  /* ── Customer search — reuse Customer Master ── */
  const custResults = useMemo(() => {
    if (!custQuery.trim()) return [];
    return searchCustomers(customers, custQuery).slice(0, 6);
  }, [customers, custQuery]);

  function pickCustomer(c: (typeof customers)[number]) {
    set({ customer: c.fullName, phone: c.mobile, email: c.email || form.email, customerId: c.id });
    setContactType(c.type);
    setCustQuery(c.fullName);
    setCustOpen(false);
  }

  const linkedCustomer = form.customerId ? customers.find((c) => c.id === form.customerId) : undefined;

  /* ── Sales person — reuse the Employee/User master (store.team) ── */
  const activeStaff = useMemo(() => team.filter((m) => m.status === "active"), [team]);
  const salesResults = useMemo(() => {
    const q = salesQuery.trim().toLowerCase();
    const base = q ? activeStaff.filter((m) => m.name.toLowerCase().includes(q)) : activeStaff;
    return base.slice(0, 8);
  }, [activeStaff, salesQuery]);

  function pickSalesPerson(m: (typeof team)[number]) {
    set({ salesPersonId: m.id, salesPersonName: m.name });
    setSalesQuery(m.name);
    setSalesOpen(false);
  }

  /* ── Model suggestions from the shared Device Catalog ── */
  const modelSuggestions = useMemo(() => {
    const q = (form.model || "").trim().toLowerCase();
    if (!q) return [];
    return deviceModels
      .filter((m) => !m.archived && m.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [deviceModels, form.model]);
  const [modelOpen, setModelOpen] = useState(false);

  function handleSave() {
    setError(null);
    const name = (form.customer || "").trim() || custQuery.trim();
    if (!name) { setError("Customer name is required."); return; }
    if (!(form.phone || "").trim()) { setError("Contact number is required."); return; }
    if (form.type === "sales" && requireSalesPerson && !form.salesPersonId) {
      setError("A marketing person must be assigned for a Marketing walk-in.");
      return;
    }

    // Quick-create a customer when a name was typed with no existing match.
    let customerId = form.customerId;
    if (!customerId && name) {
      const dup = customers.find((c) => c.mobile.replace(/\D/g, "") === (form.phone || "").replace(/\D/g, "") && (form.phone || "").trim());
      if (dup) {
        customerId = dup.id;
      } else {
        const [first, ...rest] = name.split(" ");
        // Seed the new customer's ORIGIN from the walk-in handling type. The
        // customer's Type (Personal/Business) comes from the selector — Walk-In
        // is a source, never a customer type.
        const created = createCustomer({
          firstName: first,
          lastName: rest.join(" "),
          mobile: (form.phone || "").trim(),
          email: (form.email || "").trim(),
          type: contactType,
          source: walkInTypeToCustomerSource(form.type),
        });
        addCustomer(created);
        customerId = created.id;
      }
    }

    const payload: Partial<WalkIn> = {
      ...form,
      customer: name,
      customerId,
      // Clear the sales assignment when the type is not Sales.
      salesPersonId: form.type === "sales" ? form.salesPersonId : undefined,
      salesPersonName: form.type === "sales" ? form.salesPersonName : undefined,
    };
    onSaved(payload, isEdit ? walkIn!.id : null);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Full-screen blurred / dimmed backdrop — the app stays visible behind it. */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9998] bg-foreground/50 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Centered container — panel is vertically + horizontally centered. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          >
            <div
              className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_32px_80px_-20px_rgba(20,30,80,0.35)]"
              role="dialog" aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-border p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/60"><UserPlus className="h-5 w-5" /></span>
                  <div>
                    <h2 className="font-display text-lg font-bold tracking-tight">{isEdit ? `Edit ${walkIn?.walkInNumber || "Walk-In"}` : "New Walk-In"}</h2>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">Quick entry — capture the essentials and save.</p>
                  </div>
                </div>
                <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close"><X className="h-4 w-4" /></button>
              </div>

              {/* Body — scrolls independently. */}
              <div className="flex-1 overflow-y-auto p-5">
                <div className="space-y-6">
        {/* ── Panel 1 — Walk-In Details ── */}
        <section className="space-y-4">
          <PanelHeading step={1} title="Walk-In Details" />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date || ""}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e: any) => set({ date: e.target.value })}
                title="Defaults to today — click to pick an earlier date"
              />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={form.type || "direct"}
                onChange={(e: any) => set({ type: e.target.value as WalkInType })}
                options={(Object.keys(WALKIN_TYPE_LABEL) as WalkInType[]).map((t) => ({ label: WALKIN_TYPE_LABEL[t], value: t }))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Source</Label>
            <Select
              value={form.source || ""}
              onChange={(e: any) => set({ source: e.target.value })}
              placeholder="Select source"
              options={
                // Keep the current value selectable even if it was archived.
                (form.source && !sources.includes(form.source) ? [form.source, ...sources] : sources)
                  .map((s) => ({ label: s, value: s }))
              }
            />
          </div>

          {/* Customer — search existing or create new */}
          <div className="space-y-1" ref={custRef}>
            <Label>Customer Name *</Label>
            <div className="relative">
              <Input
                value={custQuery}
                iconLeft={<Search className="h-4 w-4" />}
                placeholder="Search or type a new name…"
                onChange={(e: any) => {
                  setCustQuery(e.target.value);
                  set({ customer: e.target.value, customerId: undefined });
                  setCustOpen(true);
                }}
                onFocus={() => setCustOpen(true)}
              />
              {custOpen && custResults.length > 0 && (
                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  {custResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => pickCustomer(c)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-muted"
                    >
                      <Avatar name={c.fullName} size={26} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{c.fullName}</p>
                        <p className="text-[11px] text-muted-foreground">{c.mobile}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {form.customerId && linkedCustomer && (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                  <Check className="h-3 w-3" /> Linked to Customer Master
                </p>
                <CustomerBadges
                  type={linkedCustomer.type}
                  source={linkedCustomer.source}
                  groups={resolveGroups(linkedCustomer.groupIds, customerGroups)}
                  maxGroups={2}
                />
              </div>
            )}
          </div>

          {/* Customer Type — Personal / Business. Only editable for a NEW
              customer; when linked, it reflects the existing master record. */}
          <div className="space-y-1">
            <Label>Customer Type</Label>
            <Select
              value={contactType}
              disabled={!!form.customerId}
              onChange={(e: any) => setContactType(e.target.value as CustomerType)}
              options={[{ label: "Personal", value: "personal" }, { label: "Business", value: "business" }]}
            />
            <p className="text-[10px] text-muted-foreground">
              {form.customerId
                ? "Inherited from the linked customer — Walk-In is the source, not the type."
                : "Personal or Business. This is separate from the Walk-In source above."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Contact *</Label>
              <Input
                value={form.phone || ""}
                iconLeft={<Phone className="h-4 w-4" />}
                placeholder="Phone number"
                onChange={(e: any) => set({ phone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email || ""}
                iconLeft={<Mail className="h-4 w-4" />}
                placeholder="name@email.com"
                onChange={(e: any) => set({ email: e.target.value })}
              />
            </div>
          </div>

          {/* Sales person — only when Type = Sales */}
          {form.type === "sales" && (
            <div className="space-y-1" ref={salesRef}>
              <Label>Marketing Person {requireSalesPerson ? "*" : ""}</Label>
              <div className="relative">
                <Input
                  value={salesQuery}
                  iconLeft={<Search className="h-4 w-4" />}
                  placeholder="Assign a marketing person…"
                  onChange={(e: any) => { setSalesQuery(e.target.value); set({ salesPersonId: undefined, salesPersonName: undefined }); setSalesOpen(true); }}
                  onFocus={() => setSalesOpen(true)}
                />
                {salesOpen && salesResults.length > 0 && (
                  <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
                    {salesResults.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => pickSalesPerson(m)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-muted"
                      >
                        <Avatar name={m.name} size={26} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium">{m.name}</p>
                          <p className="text-[11px] text-muted-foreground">{m.designation || m.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {salesOpen && salesResults.length === 0 && (
                  <div className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground shadow-lg">
                    No employees found. Add staff under Employees.
                  </div>
                )}
              </div>
              {form.salesPersonId && (
                <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                  <Check className="h-3 w-3" /> Assigned to {form.salesPersonName}
                </p>
              )}
            </div>
          )}
        </section>

        {/* ── Panel 2 — Device / Enquiry ── */}
        <section className="space-y-4 border-t border-border pt-5">
          <PanelHeading step={2} title="Device & Enquiry" />

          <div className="space-y-1">
            <Label>Model</Label>
            <div className="relative">
              <Input
                value={form.model || ""}
                iconLeft={<Search className="h-4 w-4" />}
                placeholder="Device model (leave blank if unknown)"
                onChange={(e: any) => { set({ model: e.target.value, modelId: undefined }); setModelOpen(true); }}
                onFocus={() => setModelOpen(true)}
                onBlur={() => setTimeout(() => setModelOpen(false), 150)}
              />
              {modelOpen && modelSuggestions.length > 0 && (
                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  {modelSuggestions.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onMouseDown={() => { set({ model: m.name, modelId: m.id }); setModelOpen(false); }}
                      className="block w-full px-3 py-2 text-left text-[13px] transition hover:bg-muted"
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Issue</Label>
            <Textarea
              rows={2}
              value={form.issue || ""}
              placeholder="e.g. Screen damaged, Battery issue, Camera not working…"
              onChange={(e: any) => set({ issue: e.target.value })}
            />
          </div>

          <div className="space-y-1">
            <Label>Final Status</Label>
            <Select
              value={form.status || "visitor"}
              onChange={(e: any) => set({ status: e.target.value })}
              options={
                // Offer the three business outcomes; keep a legacy value visible
                // if the record already carries one (historical safety).
                (form.status && !WALKIN_FINAL_STATUSES.includes(form.status)
                  ? [form.status, ...WALKIN_FINAL_STATUSES]
                  : WALKIN_FINAL_STATUSES
                ).map((s) => ({ label: WALKIN_STATUS_LABEL[s], value: s }))
              }
            />
            {form.status === "converted_ticket" && !form.linkedTicketId && (
              <p className="text-[10px] text-amber-600">
                Tip: use the “Convert to Ticket” action to create and link a real ticket.
              </p>
            )}
          </div>

          {/* Follow-Up (optional). Compact date + time. Locked once the walk-in
              has been converted to a ticket (per business rule). */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Follow-Up <span className="font-normal text-muted-foreground">(optional)</span></Label>
              {form.followUpDate && !isConverted && (
                <button
                  type="button"
                  onClick={() => set({ followUpDate: undefined, followUpTime: undefined, followUpStatus: undefined, followUpReadAt: undefined })}
                  className="text-[10px] font-medium text-rose-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                value={form.followUpDate || ""}
                disabled={isConverted}
                onChange={(e: any) => set({ followUpDate: e.target.value, followUpStatus: e.target.value ? "pending" : undefined })}
              />
              <Input
                type="time"
                value={form.followUpTime || ""}
                disabled={isConverted || !form.followUpDate}
                onChange={(e: any) => set({ followUpTime: e.target.value })}
              />
            </div>
            {isConverted ? (
              <p className="text-[10px] text-muted-foreground">Follow-up is locked — this walk-in is already converted to a ticket.</p>
            ) : form.followUpStatus === "done" ? (
              <p className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                <Check className="h-3 w-3" /> Follow-up marked complete
                <button type="button" onClick={() => set({ followUpStatus: "pending" })} className="ml-1 text-muted-foreground hover:underline">Reopen</button>
              </p>
            ) : form.followUpDate ? (
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">A reminder appears in the Walk-In bell when this is due.</p>
                <button type="button" onClick={() => set({ followUpStatus: "done" })} className="text-[10px] font-medium text-[#4361EE] hover:underline">Mark complete</button>
              </div>
            ) : null}
          </div>
        </section>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 border-t border-border p-5">
                <span className="text-xs text-rose-600">{error}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
                  <Button size="sm" onClick={handleSave}>Save Walk-In</Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function PanelHeading({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#EEF1FD] text-[11px] font-bold text-[#4361EE]">{step}</span>
      <h4 className="text-[13px] font-semibold tracking-tight">{title}</h4>
    </div>
  );
}
