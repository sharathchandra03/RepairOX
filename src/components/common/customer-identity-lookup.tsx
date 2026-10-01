"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Canonical inline Customer identity lookup

   The ONE reusable "is this phone already a Customer?" surface. As the user
   types a phone (and optionally an email) into any capture form, this
   debounced control searches the canonical Customer Master and surfaces one of
   two states inline — never a separate search button, never a Settings detour:

       ✓ CUSTOMER FOUND              ·  No customer found
         Ayush                          [ Create New Customer ]
         9880909012
         aayush@example.com
         [ Use Existing Customer ]

   CRITICAL (RepairOX Customer Identity Standard):
     • This is IDENTITY ONLY. It resolves WHO the customer is. It carries NO
       sales-agent / attribution data. An existing customer's historical Sales
       Agent is NEVER surfaced here and NEVER assigned to the current record —
       the Lead/Walk-In/Ticket owner is decided by the caller, not by customer
       history (see §6/§85 of the spec).
     • It reuses the canonical Customer Master (`useStore().customers`) and the
       canonical normalized-phone matcher (`findCustomerByExactIdentity`) — it
       never maintains a second customer list or a second normalizer.
     • An EXACT phone/email hit is a CERTAIN identity match (shown here),
       distinct from the weaker Potential-Duplicate (fuzzy) workflow.

   Linking is explicit: nothing is auto-selected. The caller owns the selected
   `customerId` and decides what to do with "Use Existing" / "Create New".
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Phone, Mail, UserPlus, Link2, X, UserRound } from "lucide-react";
import { useStore } from "@/lib/store";
import {
  findCustomerByExactIdentity,
  normalizeCustomerPhone,
  type Customer,
} from "@/lib/customer-data";
import { formatPhone } from "@/lib/customer-service";
import { cn } from "@/lib/utils";

export interface CustomerIdentityLookupProps {
  /** The phone the user is typing (raw, un-normalized). */
  phone: string;
  /** Optional email to also match on. */
  email?: string;
  /** The already-linked customer id, if any — when set, shows the "linked"
   *  confirmation instead of the search card. */
  linkedCustomerId?: string;
  /** User chose "Use Existing Customer" — receives the canonical record. */
  onUseExisting: (customer: Customer) => void;
  /** User cleared the current link. */
  onClearLink?: () => void;
  /** User chose "Create New Customer" (no exact match). Optional — when omitted
   *  the create affordance is hidden (identity-only surfaces). */
  onCreateNew?: () => void;
  /** Debounce for the lookup, ms (default 300). */
  debounceMs?: number;
  className?: string;
}

/**
 * Inline, debounced Customer Master identity lookup. Renders nothing until the
 * phone reaches a matchable length (≥10 digits) or an email is present.
 */
export function CustomerIdentityLookup({
  phone,
  email,
  linkedCustomerId,
  onUseExisting,
  onClearLink,
  onCreateNew,
  debounceMs = 300,
  className,
}: CustomerIdentityLookupProps) {
  const { customers } = useStore();

  // Debounce the identity inputs so we don't match on every keystroke.
  const [debounced, setDebounced] = useState({ phone, email });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced({ phone, email }), debounceMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [phone, email, debounceMs]);

  const normalizedPhone = normalizeCustomerPhone(debounced.phone || "");
  const hasEnoughToSearch = normalizedPhone.length >= 10 || !!(debounced.email || "").trim();

  // The exact-identity match (certain), computed off the canonical master.
  const match = useMemo(
    () => (hasEnoughToSearch
      ? findCustomerByExactIdentity(customers, { phone: debounced.phone, email: debounced.email })
      : null),
    [customers, debounced.phone, debounced.email, hasEnoughToSearch],
  );

  // The currently-linked customer (confirmation state).
  const linked = linkedCustomerId ? customers.find((c) => c.id === linkedCustomerId) : undefined;

  // ── Already linked → compact confirmation (spec §78) ──
  if (linked) {
    return (
      <div className={cn("flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50/70 px-3 py-2", className)}>
        <div className="flex min-w-0 items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-zinc-900">
              {linked.fullName || `${linked.firstName} ${linked.lastName}`.trim() || "Customer"}
              <span className="ml-1.5 rounded-full bg-white px-1.5 py-px text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Existing Customer · Linked
              </span>
            </p>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500">
              {linked.mobile ? formatPhone(linked.mobile) : ""}{linked.email ? ` · ${linked.email}` : ""}
            </p>
          </div>
        </div>
        {onClearLink && (
          <button
            type="button"
            onClick={onClearLink}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-white hover:text-zinc-600"
            title="Unlink customer"
            aria-label="Unlink customer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  if (!hasEnoughToSearch) return null;

  // ── Exact match → "CUSTOMER FOUND" (spec §5/§6/§77) ──
  // Helpful, not an error. NO historical sales agent is shown here.
  if (match) {
    return (
      <div className={cn("rounded-xl border border-[#4361EE]/40 bg-[#EEF1FD] p-3", className)}>
        <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#3347D6]">
          <CheckCircle2 className="h-3.5 w-3.5" /> Customer Found
        </p>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-inset ring-[#B3BFF6]/50">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-zinc-900">
              {match.fullName || `${match.firstName} ${match.lastName}`.trim() || "Customer"}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
              {match.mobile && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {formatPhone(match.mobile)}</span>}
              {match.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {match.email}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onUseExisting(match)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4361EE] px-2.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[#3347D6]"
          >
            <Link2 className="h-3.5 w-3.5" /> Use Existing Customer
          </button>
        </div>
      </div>
    );
  }

  // ── No match → optional "Create New Customer" (spec §8) ──
  if (!onCreateNew) return null;
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2", className)}>
      <p className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <UserRound className="h-3.5 w-3.5" /> No customer found for this number
      </p>
      <button
        type="button"
        onClick={onCreateNew}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#4361EE]/40 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#4361EE] transition hover:bg-[#EEF1FD]"
      >
        <UserPlus className="h-3.5 w-3.5" /> Create New Customer
      </button>
    </div>
  );
}
