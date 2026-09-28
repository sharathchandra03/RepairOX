"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — CRM Contact Identity block.

   Surfaces the CRM Contact behind an operational record (Ticket / Invoice /
   Walk-In) so staff can see the SAME person's CRM identity — who they are as a
   prospect/customer, their source, their owner, and the originating Lead — right
   where they're doing the work. Read-only; the data lives in the Lead/CRM
   module (contacts) and the Customer Master. It resolves the `contactId` the
   operational record already carries; if a `leadId` is present it also shows the
   originating lead + its owning agent, so attribution is visible.

   Reused on all three view surfaces (one component, one look). Renders NOTHING
   when there's no contact to show, so it never adds empty chrome.
   ────────────────────────────────────────────────────────────────────────── */

import Link from "next/link";
import { UserCircle2, ArrowUpRight, Target, Store } from "lucide-react";
import { useLeads } from "@/lib/leads-context";

export function CrmContactIdentity({
  contactId,
  leadId,
  /** Optional: render inside the caller's own section frame instead of the
   *  built-in card (e.g. when embedding in an existing DetailSection). */
  bare = false,
}: {
  contactId?: string | null;
  leadId?: string | null;
  bare?: boolean;
}) {
  const { contacts, leads, salesAgents } = useLeads();

  const contact = contactId ? contacts.find((c) => c.id === contactId) : undefined;
  // Prefer an explicit leadId; otherwise fall back to a lead that references
  // this contact (the originating enquiry).
  const lead = leadId
    ? leads.find((l) => l.id === leadId)
    : contactId
      ? leads.find((l) => l.contactId === contactId)
      : undefined;

  // Nothing to show → render nothing (no empty chrome).
  if (!contact && !lead) return null;

  const name = contact?.fullName || lead?.name || "Unknown contact";
  const source = contact?.source || lead?.source;
  const ownerName =
    lead?.assignedToName ||
    (lead?.assignedTo ? salesAgents.find((a) => a.id === lead.assignedTo)?.name : undefined);
  const isCustomer = !!contact?.customerId || !!lead?.customerId;

  const body = (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
          <UserCircle2 className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {isCustomer ? "Customer Master record" : "CRM Contact (prospect)"}
            {source ? ` · ${source}` : ""}
          </p>
        </div>
        {isCustomer && (
          <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            Customer
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {(contact?.mobile || contact?.phone) && (
          <IdentityField label="Phone" value={contact?.mobile || contact?.phone || "—"} />
        )}
        {contact?.email && <IdentityField label="Email" value={contact.email} />}
        {contact?.city && <IdentityField label="City" value={contact.city} />}
        {ownerName && <IdentityField label="Sales agent" value={ownerName} />}
      </div>

      {/* Originating lead — attribution visible from the operational record. */}
      {lead && (
        <Link
          href={`/leads/list?lead=${lead.id}`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/20 px-3 py-2 text-[12px] font-medium text-[#4361EE] transition hover:bg-muted/40"
        >
          <Target className="h-3.5 w-3.5" />
          From lead {lead.leadNo || lead.id}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );

  if (bare) return body;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
          <Store className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-foreground">CRM Contact</h3>
      </div>
      {body}
    </section>
  );
}

function IdentityField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-[12.5px] font-medium text-foreground">{value}</p>
    </div>
  );
}
