"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Warranty Flow (search → eligibility → claim / new ticket)
   ────────────────────────────────────────────────────────────────────────
   The FIRST step of the Warranty process (Add New → Warranty). It is a search
   over previous Tickets that surfaces PER-DEVICE warranty eligibility so staff
   can either raise a ₹0 warranty claim (in warranty) or start a normal paid
   Ticket prefilled from the original (out of warranty). It reuses the existing
   Ticket data (customer/device/store/numbering), the shared centered-form
   foundation, and the central permission + store-context systems — Warranty is
   NOT a separate application, just another record type in the Ticket
   architecture. See spec §11–§29, §38–§40, §52–§62, §67–§69.
   ────────────────────────────────────────────────────────────────────────── */

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Search, Shield, ShieldCheck, ShieldAlert, Smartphone, Ticket as TicketIcon, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { RoxCenteredForm } from "@/components/ui/rox-centered-form";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { useStore } from "@/lib/store";
import { useStoreContext } from "@/lib/store-context";
import { usePermissions } from "@/lib/permissions-context";
import { logActivity } from "@/lib/activity-log";
import { cn } from "@/lib/utils";
import {
  type Ticket, type DeviceRecord,
  getTicketDevices, getRecordType, isWarranty,
  ticketDeviceWarrantyEligibility, warrantyEligibilityLabel, type WarrantyEligibility,
  findInvoiceForTicketDevice,
} from "@/lib/mock-data";
import { toast } from "@/components/ui/toaster";

/* ─── Helpers ────────────────────────────────────────────────────────── */

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function deviceName(d: DeviceRecord): string {
  return [d.brand, d.model].filter(Boolean).join(" ") || d.model || d.brand || "Device";
}

/** A single original ticket + its per-device eligibility, resolved once. */
type SearchHit = {
  ticket: Ticket;
  devices: { device: DeviceRecord; eligibility: WarrantyEligibility }[];
};

/* ─── Page ───────────────────────────────────────────────────────────── */

export default function WarrantySearchPage() {
  const router = useRouter();
  const { tickets, invoices, addTicket, updateInvoice } = useStore();
  const { isAllShops, stores, getStore, activePrefixes } = useStoreContext();
  const { can } = usePermissions();

  const canCreate = can("create_warranty") || can("full_access") || can("manage_repair_jobs");
  const canConvert = can("convert_warranty_to_ticket") || can("create_ticket") || can("full_access") || can("manage_repair_jobs");
  const multiStore = isAllShops && stores.length > 1;

  const [q, setQ] = useState("");
  // The claim being composed (in-warranty device selection + new issue).
  const [claim, setClaim] = useState<{ hit: SearchHit } | null>(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [newIssue, setNewIssue] = useState("");
  const [comments, setComments] = useState("");
  const [warrantyStatus, setWarrantyStatus] = useState("open");
  const [submitting, setSubmitting] = useState(false);

  /* ── Search: eligible ORIGINAL tickets only ──
     A warranty is always raised against a REAL repair Ticket (spec §69), so we
     search only genuine Tickets (never Estimates or existing Warranty records)
     and never show a giant empty table (spec §68). The store already loads only
     rows the user is authorized for (org + store RLS), so cross-store records
     can't leak here (spec §32/§49/§82). */
  const results: SearchHit[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const base = tickets.filter((t) => getRecordType(t) === "ticket");
    const matched = base.filter((t) => {
      const hay = `${t.ticketNo ?? ""} ${t.id} ${t.customer} ${t.phone} ${t.model} ${t.device} ${t.company ?? ""}`.toLowerCase();
      if (hay.includes(needle)) return true;
      // Also match on any device model / imei so a phone/serial search works.
      return getTicketDevices(t).some((d) =>
        `${d.brand} ${d.model} ${d.imei}`.toLowerCase().includes(needle));
    });
    // Recent/relevant first (spec §67).
    const ordered = [...matched].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return ordered.slice(0, 25).map((t) => ({
      ticket: t,
      devices: getTicketDevices(t).map((d) => ({
        device: d,
        // Eligibility is resolved from the LINKED INVOICE (the authoritative
        // warranty source): the invoice device's warranty duration + the
        // invoice date as the start. A never-invoiced device has no warranty.
        eligibility: ticketDeviceWarrantyEligibility(t, d.id, invoices),
      })),
    }));
  }, [tickets, invoices, q]);

  /* ── Start a claim for an in-warranty device (opens the claim form) ── */
  const startClaim = useCallback((hit: SearchHit, deviceId: string) => {
    if (!canCreate) { toast.error("You don't have permission to create warranty claims."); return; }
    // SERVER-/STORE-SIDE REVALIDATION (spec §56/§57): recompute eligibility
    // against NOW at the moment of selection — never trust the rendered result,
    // which may have gone stale while the user browsed.
    const entry = hit.devices.find((d) => d.device.id === deviceId);
    if (!entry) return;
    const fresh = ticketDeviceWarrantyEligibility(hit.ticket, deviceId, invoices);
    if (!fresh.inWarranty) {
      toast.error("This device is no longer in warranty.", {
        description: warrantyEligibilityLabel(fresh),
      });
      return;
    }
    setClaim({ hit });
    setSelectedDeviceIds(new Set([deviceId]));
    setNewIssue("");
    setComments("");
    setWarrantyStatus("open");
  }, [canCreate, invoices]);

  /* ── Out of warranty → prefilled normal Ticket (spec §25/§26/§28) ── */
  const createNewTicket = useCallback((hit: SearchHit) => {
    if (!canConvert) { toast.error("You don't have permission to create tickets."); return; }
    logActivity({
      module: "Warranty", action: "Out-of-Warranty Detected", severity: "info",
      entity: "Ticket", reference: hit.ticket.ticketNo ?? hit.ticket.id,
      description: `Warranty expired for ${hit.ticket.customer}; creating a new paid ticket from ${hit.ticket.ticketNo ?? hit.ticket.id}.`,
    });
    const params = new URLSearchParams();
    params.set("fromTicket", hit.ticket.id);
    params.set("reason", "Warranty expired");
    router.push(`/tickets/new?${params.toString()}`);
  }, [canConvert, router]);

  /* ── Toggle a device inside the open claim (multi-device, spec §40) ── */
  const toggleClaimDevice = useCallback((deviceId: string) => {
    if (!claim) return;
    const entry = claim.hit.devices.find((d) => d.device.id === deviceId);
    // Only in-warranty devices are selectable (spec §8/§39 — never auto-cover an
    // out-of-warranty device).
    if (!entry || !ticketDeviceWarrantyEligibility(claim.hit.ticket, deviceId, invoices).inWarranty) return;
    setSelectedDeviceIds((prev) => {
      const n = new Set(prev);
      n.has(deviceId) ? n.delete(deviceId) : n.add(deviceId);
      return n;
    });
  }, [claim, invoices]);

  /* ── Submit the warranty claim → create a W-XXX record ── */
  const submitClaim = useCallback(async () => {
    if (!claim || submitting) return;
    if (selectedDeviceIds.size === 0) { toast.error("Select at least one device under warranty."); return; }
    if (!newIssue.trim()) { toast.error("Describe the new reported issue."); return; }

    const original = claim.hit.ticket;
    const selectedIds = Array.from(selectedDeviceIds);
    const originalDevices = getTicketDevices(original);
    const claimedDevices = originalDevices.filter((d) => selectedIds.includes(d.id));

    // FINAL server-/store-side revalidation before creation (spec §56/§57): every
    // selected device must STILL be in warranty right now.
    const now = new Date();
    for (const d of claimedDevices) {
      const el = ticketDeviceWarrantyEligibility(original, d.id, invoices, now);
      if (!el.inWarranty) {
        toast.error(`${deviceName(d)} is no longer in warranty (${warrantyEligibilityLabel(el)}).`);
        return;
      }
    }

    // Duplicate protection (spec §58): if an OPEN/IN-PROGRESS warranty already
    // covers exactly these device(s) for this ticket, surface it instead of
    // creating a second record.
    const existingActive = tickets.find((t) =>
      isWarranty(t) && t.parentTicketId === original.id &&
      (t.warrantyStatus === "open" || t.warrantyStatus === "in_progress") &&
      (t.warrantyDeviceIds ?? []).some((id) => selectedIds.includes(id)));
    if (existingActive) {
      toast.info("An open warranty claim already exists for this device.", {
        description: `Opening ${existingActive.ticketNo ?? existingActive.id}.`,
      });
      router.push(`/tickets/${existingActive.id}`);
      return;
    }

    setSubmitting(true);
    try {
      // Build the warranty record's device records: reuse the original device
      // identity but reset repair-operational fields, capture the NEW issue, and
      // stamp an explicit warranty window so it is never recomputed later.
      const warrantyDevices: DeviceRecord[] = claimedDevices.map((d) => {
        const el = ticketDeviceWarrantyEligibility(original, d.id, invoices, now);
        return {
          ...d,
          // A warranty repair is free (spec §21/§22).
          estimate: 0,
          parts: [],
          // The NEW reported issue for this claim (original issue untouched).
          issue: newIssue.trim(),
          description: newIssue.trim(),
          status: "in_progress",
          // Persist the resolved window so eligibility stays fixed.
          warrantyStartDate: el.startDate,
          warrantyEndDate: el.endDate,
        };
      });

      // Resolve the specific invoice(s) that established these devices' warranty
      // terms (the authoritative source per the DATE SOURCE RULE). Selective
      // invoicing means different claimed devices COULD have been billed on
      // different invoices, so resolve per-device and collect the distinct set
      // — the warranty record links the PRIMARY device's invoice; every touched
      // invoice gets the reverse `warrantyClaimIds` pointer.
      const invoiceIdsTouched = new Set<string>();
      let primaryInvoiceId: string | undefined;
      for (const d of claimedDevices) {
        const inv = findInvoiceForTicketDevice(original, d.id, invoices);
        if (inv) {
          invoiceIdsTouched.add(inv.id);
          if (!primaryInvoiceId) primaryInvoiceId = inv.id;
        }
      }

      const primary = claimedDevices[0];
      const warrantyTicket: Ticket = {
        id: "", // assigned by addTicket (fresh unique id)
        customer: original.customer,
        phone: original.phone,
        email: original.email,
        address: original.address,
        company: original.company,
        customerId: original.customerId,
        customerType: original.customerType,
        device: primary?.brand || original.device,
        model: claimedDevices.length > 1
          ? `${primary?.model || "Device"} + ${claimedDevices.length - 1} more`
          : (primary?.model || original.model),
        issue: newIssue.trim(),
        service: newIssue.trim(),
        status: "in_progress",
        priority: "normal",
        technician: primary?.assignedTo || "Unassigned",
        createdAt: new Date().toISOString(),
        // A valid warranty service is ₹0 (spec §21/§22/§81) — no revenue.
        amount: 0,
        discount: 0,
        devices: warrantyDevices,
        // ── Warranty record type + lineage ──
        recordType: "warranty",
        warrantyStatus: warrantyStatus as any,
        parentTicketId: original.id,
        parentTicketNo: original.ticketNo ?? original.id,
        warrantyDeviceIds: selectedIds,
        warrantyIssue: newIssue.trim(),
        // The invoice that established this claim's warranty terms — lets View
        // Warranty answer "raised from Invoice X" without a reverse scan.
        sourceInvoiceId: primaryInvoiceId,
        internalNotes: comments.trim() || undefined,
        // The warranty inherits the original ticket's store so numbering +
        // isolation follow the same store (spec §32).
        branchId: original.branchId,
      };

      const newId = await addTicket(warrantyTicket);
      const created = tickets.find((t) => t.id === newId);
      const wNo = created?.ticketNo ?? newId;

      // Reverse link: stamp this warranty ticket's id onto every invoice whose
      // billed device it claims against, so View Invoice can show "warranty
      // claim(s) raised from this invoice" without a reverse scan.
      for (const invId of invoiceIdsTouched) {
        const inv = invoices.find((i) => i.id === invId);
        const existingClaims = inv?.warrantyClaimIds ?? [];
        if (!existingClaims.includes(newId)) {
          try {
            await updateInvoice(invId, { warrantyClaimIds: [...existingClaims, newId] });
          } catch { /* non-fatal — warranty record itself is already saved */ }
        }
      }

      logActivity({
        module: "Warranty", action: "Warranty Created", severity: "success",
        entity: "Warranty", reference: wNo,
        description: `Opened warranty claim ${wNo} from ${original.ticketNo ?? original.id} for ${original.customer} - ${newIssue.trim()}.`,
        meta: {
          "Original Ticket": original.ticketNo ?? original.id,
          Devices: claimedDevices.map(deviceName).join(", "),
          Charge: "₹0",
          ...(primaryInvoiceId ? { "Source Invoice": primaryInvoiceId } : {}),
        },
      });

      toast.success(`Warranty ${wNo} created`, { description: "Linked to the original ticket · ₹0 warranty service." });
      setClaim(null);
      router.push(`/tickets/${newId}`);
    } finally {
      setSubmitting(false);
    }
  }, [claim, selectedDeviceIds, newIssue, comments, warrantyStatus, submitting, tickets, invoices, addTicket, updateInvoice, router]);

  /* ─── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/tickets">
          <button className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-card text-zinc-600 shadow-card transition hover:bg-muted" aria-label="Back to tickets">
            <ArrowLeft className="h-4 w-4" />
          </button>
        </Link>
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">Warranty</h1>
          <p className="text-sm text-muted-foreground">Check a previous repair and raise a warranty claim.</p>
        </div>
      </div>

      {/* Search field — the prominent primary element (spec §12/§52). */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ((e.target as HTMLInputElement).value)}
            placeholder="Search ticket, customer name or phone number…"
            className="pl-10"
            aria-label="Search tickets for warranty"
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Empty prompt (spec §68) */}
      {!q.trim() && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#EEF1FD] text-[#4361EE]">
            <Shield className="h-7 w-7" />
          </span>
          <p className="text-sm font-medium text-foreground">Search for a ticket or customer to check warranty eligibility.</p>
          <p className="max-w-sm text-xs text-muted-foreground">Enter a ticket ID, customer name, phone number or device to see previous repairs and their warranty status.</p>
        </div>
      )}

      {/* No result (spec §69) */}
      {q.trim() && results.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-card">
          <p className="text-sm font-medium">No matching tickets found.</p>
          <p className="mt-1 text-xs text-muted-foreground">Try a different ticket ID, customer name or phone number.</p>
        </div>
      )}

      {/* Results */}
      <div className="space-y-4">
        {results.map((hit) => (
          <motion.div
            key={hit.ticket.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border-2 border-zinc-300 bg-card p-5 shadow-card"
          >
            {/* Ticket header row */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><TicketIcon className="h-4 w-4" /></span>
                  <Link href={`/tickets/${hit.ticket.id}`} className="font-semibold text-foreground hover:text-[#4361EE]">
                    {hit.ticket.ticketNo ?? hit.ticket.id}
                  </Link>
                </div>
                <p className="mt-1 text-sm">
                  <span className="font-medium">{hit.ticket.customer}</span>
                  <span className="text-muted-foreground"> · {hit.ticket.phone}</span>
                </p>
                <p className="text-xs text-muted-foreground">Original repair: {fmtDate(hit.ticket.createdAt)}</p>
              </div>
              {multiStore && <StoreContextCell store={getStore(hit.ticket.branchId)} mode="stacked" />}
            </div>

            {/* Per-device eligibility (spec §13/§14/§15/§39) */}
            <div className="mt-4 space-y-2.5">
              {hit.devices.map(({ device, eligibility }) => {
                const inW = eligibility.inWarranty;
                return (
                  <div
                    key={device.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-muted/20 p-3.5"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-zinc-500 ring-1 ring-inset ring-zinc-200">
                        <Smartphone className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight">{deviceName(device)}</p>
                        <p className="text-xs text-muted-foreground">
                          {device.issue || "Repair"}
                          {eligibility.durationLabel ? ` · Warranty: ${eligibility.durationLabel}` : ""}
                        </p>
                        {/* Always EXPLAIN why (spec §15): end date + remaining/overdue. */}
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                          {eligibility.hasWarranty ? (
                            <>
                              <span className={cn("inline-flex items-center gap-1 font-medium", inW ? "text-emerald-700" : "text-rose-700")}>
                                {inW ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                                {inW ? "IN WARRANTY" : "OUT OF WARRANTY"}
                              </span>
                              <span className="text-muted-foreground">
                                {inW ? "Expires" : "Expired"} {fmtDate(eligibility.endDate)}
                              </span>
                              <span className={cn(inW ? "text-emerald-700" : "text-rose-700")}>
                                {warrantyEligibilityLabel(eligibility)}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">No warranty on record - this device has no linked invoice with a warranty.</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {eligibility.hasWarranty && inW ? (
                        <Button size="sm" className="rounded-full" onClick={() => startClaim(hit, device.id)} disabled={!canCreate}>
                          <ShieldCheck className="h-3.5 w-3.5" /> Use Warranty
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="rounded-full" onClick={() => createNewTicket(hit)} disabled={!canConvert}>
                          Create New Ticket
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>

      {/* ─── Warranty claim form (centered, canonical form foundation) ─── */}
      <RoxCenteredForm
        open={!!claim}
        onClose={() => setClaim(null)}
        title="New Warranty Claim"
        subtitle={claim ? `From ${claim.hit.ticket.ticketNo ?? claim.hit.ticket.id} · ${claim.hit.ticket.customer}` : undefined}
        icon={Shield}
        footer={
          <>
            <Button variant="outline" onClick={() => setClaim(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={submitClaim} disabled={submitting}>
              {submitting ? "Creating…" : "Create Warranty · ₹0"}
            </Button>
          </>
        }
      >
        {claim && (
          <div className="space-y-5">
            {/* Prefilled context — the user never re-enters this (spec §18/§53). */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <Field label="Customer" value={claim.hit.ticket.customer} />
                <Field label="Phone" value={claim.hit.ticket.phone} />
                <Field label="Original Ticket" value={claim.hit.ticket.ticketNo ?? claim.hit.ticket.id} />
                <Field label="Charge" value="₹0 (warranty)" />
              </div>
            </div>

            {/* Device selection — only in-warranty devices are selectable (spec §40). */}
            <div>
              <p className="mb-2 text-[13px] font-semibold">Devices under warranty</p>
              <div className="space-y-2">
                {claim.hit.devices.map(({ device, eligibility }) => {
                  const inW = eligibility.inWarranty;
                  const selected = selectedDeviceIds.has(device.id);
                  return (
                    <button
                      key={device.id}
                      type="button"
                      onClick={() => toggleClaimDevice(device.id)}
                      disabled={!inW}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition",
                        selected ? "border-[#4361EE] bg-indigo-50/60" : "border-border hover:bg-muted/40",
                        !inW && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={cn("grid h-4 w-4 place-items-center rounded border", selected ? "border-[#4361EE] bg-[#4361EE] text-white" : "border-zinc-300")}>
                          {selected && <span className="text-[10px] leading-none">✓</span>}
                        </span>
                        <span className="text-sm font-medium">{deviceName(device)}</span>
                      </span>
                      <span className={cn("text-[11px] font-medium", inW ? "text-emerald-700" : "text-rose-700")}>
                        {inW ? warrantyEligibilityLabel(eligibility) : "Out of warranty"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* New reported issue (stored SEPARATELY, spec §19). */}
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold">New reported issue<span className="text-rose-600"> *</span></label>
              <Input
                value={newIssue}
                onChange={(e) => setNewIssue((e.target as HTMLInputElement).value)}
                placeholder="e.g. Display flickering after repair"
              />
            </div>

            {/* Customer statement / comments */}
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold">Comments / customer statement</label>
              <Textarea
                value={comments}
                onChange={(e) => setComments((e.target as HTMLTextAreaElement).value)}
                placeholder="Any additional context from the customer…"
                rows={3}
              />
            </div>

            {/* Initial case status */}
            <div>
              <label className="mb-1.5 block text-[13px] font-semibold">Warranty status</label>
              <Select
                value={warrantyStatus}
                onChange={(e) => setWarrantyStatus(e.target.value)}
                options={[
                  { label: "Open", value: "open" },
                  { label: "In Progress", value: "in_progress" },
                ]}
              />
            </div>
          </div>
        )}
      </RoxCenteredForm>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
