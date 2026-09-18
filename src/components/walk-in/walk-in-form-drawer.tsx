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
import { loadDeviceCategories, getCachedCategories, type DeviceCategoryItem } from "@/lib/device-categories";
import { loadDeviceColours, getCachedColours, DEFAULT_COLOURS, type DeviceColourItem } from "@/lib/device-colours";
import { TimePicker } from "@/components/ui/time-picker";
import { Avatar } from "@/components/ui/avatar";
import { useStore } from "@/lib/store";
import { searchCustomers, createCustomer, type CustomerType } from "@/lib/customer-data";
import { CustomerBadges, resolveGroups } from "@/components/common/customer-classification";
import { walkInTypeToCustomerSource } from "@/lib/walk-in-data";
import { IssueSelector } from "@/components/common/issue-selector";
import { FollowUpHistoryTimeline } from "@/components/walk-in/walk-in-followup-cell";

import {
  type WalkIn,
  type WalkInType,
  type WalkInDevice,
  WALKIN_TYPE_LABEL,
  WALKIN_FINAL_STATUSES,
  WALKIN_STATUS_LABEL,
  createWalkInDevice,
  getWalkInDevices,
} from "@/lib/mock-data";
import { Plus, Trash2 } from "lucide-react";
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
  const { customers, customerGroups, addCustomer, team, deviceModels, brands } = useStore();
  // Device Categories + Colours masters (same sources as the Ticket wizard).
  const [categories, setCategories] = useState<DeviceCategoryItem[]>(() => getCachedCategories() ?? []);
  const [colours, setColours] = useState<DeviceColourItem[]>(() => getCachedColours() ?? DEFAULT_COLOURS);
  useEffect(() => {
    if (!open) return;
    loadDeviceCategories().then(setCategories).catch(() => {});
    loadDeviceColours().then(setColours).catch(() => {});
  }, [open]);
  const isEdit = !!walkIn;
  // Once converted to a ticket, the follow-up schedule is locked (business rule).
  const isConverted = !!walkIn?.linkedTicketId;

  const [form, setForm] = useState<Partial<WalkIn>>({});
  // Multi-device state — a Walk-In captures ONE customer visit that may involve
  // MULTIPLE devices (spec §2/§3). Device 1 always exists; "+ Add Device" pushes
  // more. Each device independently stores Model + Issue (spec §4/§27/§33).
  const [devices, setDevices] = useState<WalkInDevice[]>([createWalkInDevice()]);
  // Which device's model autocomplete dropdown is open (index), or null.
  const [modelOpenIndex, setModelOpenIndex] = useState<number | null>(null);
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
      // Restore the multi-device array. getWalkInDevices synthesizes Device 1
      // from the flat fields for legacy single-device records, so editing an
      // old Walk-In shows exactly one device with no migration (spec §7/§8).
      setDevices(getWalkInDevices(walkIn).map((d) => ({ ...d })));
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
      // New Walk-In always opens with a single blank Device 1 (spec §6).
      setDevices([createWalkInDevice()]);
      setCustQuery("");
      setSalesQuery("");
      setContactType("personal");
    }
    setCustOpen(false);
    setSalesOpen(false);
    setModelOpenIndex(null);
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

  /* ── Model suggestions from the shared Device Catalog (per-device) ── */
  const activeModels = useMemo(
    () => deviceModels.filter((m) => !m.archived),
    [deviceModels],
  );
  function modelSuggestionsFor(query: string) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return [];
    return activeModels.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }

  /* ── Device card helpers (add / remove / patch one device) ──
     Each mutation is INDEPENDENT: editing Device 2 never touches Device 1 or 3,
     and removing Device 2 leaves the others intact (spec §10/§27). */
  function patchDevice(index: number, patch: Partial<WalkInDevice>) {
    setDevices((ds) => ds.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }
  function addDevice() {
    setDevices((ds) => [...ds, createWalkInDevice()]);
  }
  function removeDevice(index: number) {
    // Device 1 is the anchor and can never be removed — always keep >= 1 device.
    setDevices((ds) => (ds.length <= 1 ? ds : ds.filter((_, i) => i !== index)));
    setModelOpenIndex(null);
  }

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

    // Normalise the device array — drop trailing fully-empty cards so an
    // accidental "+ Add Device" with nothing typed doesn't persist a blank
    // device, but ALWAYS keep at least Device 1 (spec §6/§33).
    const cleaned = devices
      .map((d) => ({
        ...d,
        model: (d.model || "").trim(),
        brand: (d.brand || "").trim() || undefined,
        imei: (d.imei || "").trim() || undefined,
        issue: (d.issue || "").trim(),
      }))
      // Keep Device 1 always; drop later cards only when COMPLETELY empty
      // (no model, issue, brand, imei, category or colour).
      .filter((d, i) => i === 0 || d.model || d.issue || d.brand || d.imei || d.category || d.deviceColour);
    const finalDevices = cleaned.length > 0 ? cleaned : [createWalkInDevice()];
    const primary = finalDevices[0];

    const payload: Partial<WalkIn> = {
      ...form,
      customer: name,
      customerId,
      // Multi-device source of truth. The flat model/modelId/category/issue
      // mirror the PRIMARY device for backward-compat, search and summary
      // display (spec §5/§16/§39). Only stored when >1 device to keep legacy
      // single-device rows byte-identical to before.
      devices: finalDevices.length > 1 ? finalDevices : undefined,
      model: primary.model,
      modelId: primary.modelId,
      category: primary.category ?? form.category,
      issue: primary.issue,
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
              /* Thin black outer boundary so the form reads as a crisp, distinct
                 card against the dimmed backdrop — keeps the RepairOX radius +
                 shadow. Thin (1px) line, not a heavy frame. */
              className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-black ring-1 ring-black/10 bg-card shadow-[0_32px_80px_-20px_rgba(20,30,80,0.35)]"
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
                /* Match the Type Select's height + fill the grid column so the
                   Date and Type controls read as equal-width in this row. */
                className="h-11 w-full"
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
            {/* ── Device Cards — one per device (spec §3/§4/§34) ──
                A single Walk-In visit may involve multiple devices. Device 1 is
                always shown; "+ Add Device" appends more. Each card independently
                captures Model + Issue and reuses the SAME controls (catalog model
                autocomplete + shared IssueSelector) as before, so a single-device
                Walk-In feels unchanged. Cards stack vertically and never overflow
                horizontally (spec §35). */}
            <div className="space-y-3">
              {devices.map((dev, i) => {
                const suggestions = modelSuggestionsFor(dev.model);
                const isOpen = modelOpenIndex === i;
                return (
                  <div
                    key={dev.id}
                    className="space-y-3 rounded-xl border border-border bg-muted/20 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-[#EEF1FD] text-[10px] font-bold text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/60">
                          {i + 1}
                        </span>
                        Device {i + 1}
                      </span>
                      {/* Device 1 has no remove — it is the anchor (spec §10). */}
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => removeDevice(i)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      )}
                    </div>

                    {/* Category + Brand — the top of the Category → Brand → Model
                        hierarchy. Both optional at the enquiry stage; selecting a
                        catalog Model auto-fills them. */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Category</Label>
                        <Select
                          value={dev.category || ""}
                          onChange={(e: any) => patchDevice(i, { category: e.target.value })}
                          className="h-[34px] px-3 text-[13px]"
                          options={[
                            { label: "Select…", value: "" },
                            ...categories.map((c) => ({ label: c.label, value: c.id })),
                          ]}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Brand</Label>
                        <Input
                          value={dev.brand || ""}
                          placeholder="e.g. Apple"
                          onChange={(e: any) => patchDevice(i, { brand: e.target.value, brandId: undefined })}
                        />
                      </div>
                    </div>

                    {/* Model — device catalog autocomplete (per device). */}
                    <div className="space-y-1">
                      <Label>Model</Label>
                      <div className="relative">
                        <Input
                          value={dev.model || ""}
                          iconLeft={<Search className="h-4 w-4" />}
                          placeholder="Device model (leave blank if unknown)"
                          onChange={(e: any) => { patchDevice(i, { model: e.target.value, modelId: undefined }); setModelOpenIndex(i); }}
                          onFocus={() => setModelOpenIndex(i)}
                          onBlur={() => setTimeout(() => setModelOpenIndex((cur) => (cur === i ? null : cur)), 150)}
                        />
                        {isOpen && suggestions.length > 0 && (
                          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                            {suggestions.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onMouseDown={() => {
                                  // Selecting a catalog model auto-fills the
                                  // durable ids + resolves Brand + Category so
                                  // the whole hierarchy is captured in one pick.
                                  const brandRec = brands.find((b) => b.id === m.brandId);
                                  patchDevice(i, {
                                    model: m.name,
                                    modelId: m.id,
                                    brand: brandRec?.name || dev.brand,
                                    brandId: brandRec?.id || m.brandId,
                                    category: m.categoryId || brandRec?.categoryId || dev.category,
                                  });
                                  setModelOpenIndex(null);
                                }}
                                className="block w-full px-3 py-2 text-left text-[13px] transition hover:bg-muted"
                              >
                                {m.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* IMEI / Serial + Device Colour — device identity. Both
                        optional; captured so the ticket inherits them on convert. */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>IMEI / Serial</Label>
                        <Input
                          value={dev.imei || ""}
                          placeholder="IMEI or serial no."
                          onChange={(e: any) => patchDevice(i, { imei: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Device Colour</Label>
                        <Select
                          value={dev.deviceColour || ""}
                          onChange={(e: any) => patchDevice(i, { deviceColour: e.target.value })}
                          className="h-[34px] px-3 text-[13px]"
                          options={[
                            { label: "Select…", value: "" },
                            ...colours.map((c) => ({ label: c.label, value: c.value })),
                          ]}
                        />
                      </div>
                    </div>

                    {/* Issue — reuses the shared Issue Master (same control +
                        data source as the Ticket Issue field). Per device. */}
                    <div className="space-y-1">
                      <Label>Issue</Label>
                      <IssueSelector
                        value={dev.issue || ""}
                        onChange={(v) => patchDevice(i, { issue: v })}
                        placeholder="Search issues e.g. Display… or add a new one"
                      />
                    </div>
                  </div>
                );
              })}

              {/* + Add Device — appends a fresh Device Card (spec §3). */}
              <button
                type="button"
                onClick={addDevice}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#B3BFF6] px-3 py-2 text-[12px] font-semibold text-[#4361EE] transition hover:bg-[#EEF1FD]"
              >
                <Plus className="h-4 w-4" /> Add Device
              </button>
            </div>
          </div>

          {/* Customer Comments — free text capturing what the CUSTOMER said
              during the visit (conversation context). Distinct from Issue (the
              device problem) and internal Notes. */}
          <div className="space-y-1">
            <Label>Customer Comments <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea
              rows={2}
              value={form.customerComments || ""}
              placeholder="Capture what the customer said…"
              onChange={(e: any) => set({ customerComments: e.target.value })}
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
                )
                  .filter((s) => s !== "visitor")
                  .map((s) => ({ label: WALKIN_STATUS_LABEL[s], value: s }))
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
                onChange={(e: any) =>
                  set({
                    followUpDate: e.target.value,
                    followUpStatus: e.target.value ? "pending" : undefined,
                    // Keep the attempt number consistent with prior history: the
                    // active attempt is (completed history + 1), min 1.
                    followUpAttempt: e.target.value ? ((form.followUpHistory?.length ?? 0) + 1) : undefined,
                    // A freshly (re)scheduled follow-up is unread again so it can
                    // re-notify at the new time.
                    followUpReadAt: undefined,
                  })
                }
              />
              <TimePicker
                value={form.followUpTime || ""}
                disabled={isConverted || !form.followUpDate}
                onChange={(v) => set({ followUpTime: v })}
              />
            </div>
            {isConverted ? (
              <p className="text-[10px] text-muted-foreground">Follow-up is locked — this walk-in is already converted to a ticket.</p>
            ) : form.followUpStatus === "done" && !form.followUpDate ? (
              <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                Last follow-up attempt completed. Set a date above to schedule the next one.
              </p>
            ) : form.followUpDate ? (
              <p className="flex items-center gap-1 text-[10px] font-medium text-sky-700">
                <Check className="h-3 w-3" /> Scheduled — a reminder appears in the notification bells when it's due. Complete the attempt (and record its outcome) from the Follow-Up pill in the table.
              </p>
            ) : null}
          </div>

          {/* Follow-Up History — the full attempt trail so the store user can see
              the customer journey before making the next call. Read-only here;
              completing/scheduling attempts is done via the Follow-Up pill. */}
          {isEdit && walkIn && (walkIn.followUpHistory?.length || walkIn.followUpDate) ? (
            <div className="space-y-1">
              <Label>Follow-Up History</Label>
              <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
                <FollowUpHistoryTimeline walkIn={walkIn} />
              </div>
            </div>
          ) : null}
        </section>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-2 border-t border-border p-5">
                <span className="text-xs text-rose-600">{error}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
                  <Button size="sm" onClick={handleSave}>Save</Button>
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
