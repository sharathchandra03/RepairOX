"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Customer Detail / Profile page.

   Single source of truth for "what has this customer actually done" —
   real tickets, invoices, walk-ins, field jobs and loyalty history, all
   resolved by customer_id (never inferred from name/phone matching).

   Builds on the invoice/[id] detail-page skeleton: useParams() for the id,
   useStore() for the record + cross-module arrays, RoxTableCard primitives
   (unpaginated — this is a bounded "recent activity" view, not a full list)
   for each activity section.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Phone, Mail, MapPin, Building2, Tag, Gift, Ticket as TicketIcon,
  Receipt, UserCheck, Truck,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useField } from "@/lib/field-context";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { formatCustomerName, formatPhone, type LoyaltyTransaction } from "@/lib/customer-service";
import { CUSTOMER_SOURCE_LABEL, type CustomerSource } from "@/lib/customer-data";
import { CustomerBadges, resolveGroups } from "@/components/common/customer-classification";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, STATUS_LABEL, STATUS_TONE } from "@/lib/mock-data";
import { RoxTableCard, RoxTableHead, RoxHeadRow, RoxTableRow, RoxTableCell } from "@/components/ui/rox-table";
import { cn, formatINR } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const RECENT_LIMIT = 5;

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;
  const { can } = usePermissions();
  const { customers, customerGroups, tickets, invoices, walkIns } = useStore();
  const { jobs: fieldJobs } = useField();

  const customer = useMemo(() => customers.find((c) => c.id === customerId), [customers, customerId]);

  const customerTickets = useMemo(
    () => tickets.filter((t) => t.customerId === customerId).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [tickets, customerId]
  );
  const customerInvoices = useMemo(
    () => invoices.filter((i) => i.customerId === customerId).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [invoices, customerId]
  );
  const customerWalkIns = useMemo(
    () => walkIns.filter((w) => w.customerId === customerId).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [walkIns, customerId]
  );
  const customerFieldJobs = useMemo(
    () => fieldJobs.filter((j) => j.customerId === customerId),
    [fieldJobs, customerId]
  );

  // Loyalty history: no global hook exposes this yet (loyalty_accounts /
  // loyalty_transactions are only ever WRITTEN from awardLoyaltyForPaidInvoice
  // in store.tsx — nothing reads them anywhere else). Query directly, scoped
  // to this one customer, gated by the same loyalty_view_points/manage_loyalty
  // RLS policy already defined in 0032_loyalty_ledger.sql.
  const [loyaltyTx, setLoyaltyTx] = useState<LoyaltyTransaction[]>([]);
  const [loyaltyBalance, setLoyaltyBalance] = useState<number | null>(null);
  const canViewLoyalty = allow(can, CAP.loyalty.view);

  useEffect(() => {
    if (!customerId || !canViewLoyalty || !isSupabaseConfigured || !supabase) return;
    let active = true;
    (async () => {
      const [{ data: acct }, { data: txRows }] = await Promise.all([
        supabase!.from("loyalty_accounts").select("points_balance").eq("customer_id", customerId).maybeSingle(),
        supabase!.from("loyalty_transactions").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(RECENT_LIMIT),
      ]);
      if (!active) return;
      setLoyaltyBalance(acct?.points_balance ?? null);
      if (txRows) {
        setLoyaltyTx(
          txRows.map((r: any) => ({
            id: r.id,
            customerId: r.customer_id,
            type: r.type,
            pointsChange: r.points_change,
            pointsBalance: r.points_balance,
            tier: r.tier ?? undefined,
            sourceType: r.source_type ?? undefined,
            sourceId: r.source_id ?? undefined,
            description: r.description ?? "",
            createdAt: r.created_at,
          }))
        );
      }
    })();
    return () => { active = false; };
  }, [customerId, canViewLoyalty]);

  const canView = allow(can, CAP.customer.view);
  const canViewHistory = can("view_customer_history") || can("manage_customers");

  if (!canView) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        You don&apos;t have permission to view customer records.
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground mb-4">Customer not found.</p>
        <Link href="/settings/customers/manage" className="text-sm font-medium text-[#4361EE] hover:underline">
          &larr; Back to Customers
        </Link>
      </div>
    );
  }

  const groups = resolveGroups(customer.groupIds, customerGroups);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => router.push("/settings/customers/manage")}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted transition"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <p className="text-sm text-muted-foreground">Customers</p>
      </div>

      <div className="rounded-2xl border-2 border-zinc-300 bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Avatar name={formatCustomerName(customer)} size={56} />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold">{formatCustomerName(customer)}</h1>
                <CustomerBadges type={customer.type} source={customer.source as CustomerSource | undefined} groups={groups} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
                {customer.mobile && (
                  <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {formatPhone(customer.mobile)}</span>
                )}
                {customer.email && (
                  <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {customer.email}</span>
                )}
                {customer.company && (
                  <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {customer.company}</span>
                )}
                {customer.city && (
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {customer.city}</span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{customer.id}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Customer since {fmtDate(customer.createdAt)}</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Lifetime Value" value={formatINR(customer.lifetimeValue ?? 0)} />
          <StatCard label="Tickets" value={String(customer.totalTickets ?? customerTickets.length)} />
          <StatCard label="Invoices" value={String(customer.totalInvoices ?? customerInvoices.length)} />
          <StatCard label="Loyalty Points" value={canViewLoyalty ? (loyaltyBalance != null ? String(loyaltyBalance) : "—") : "—"} icon={<Gift className="h-3.5 w-3.5" />} />
        </div>
      </div>

      {!canViewHistory ? (
        <div className="rounded-2xl border-2 border-zinc-300 bg-card p-6 text-center text-sm text-muted-foreground">
          You don&apos;t have permission to view this customer&apos;s activity history.
        </div>
      ) : (
        <>
          <ActivitySection
            title="Tickets"
            icon={<TicketIcon className="h-3.5 w-3.5" />}
            emptyText="No tickets for this customer yet."
          >
            {customerTickets.length > 0 && (
              <RoxTableCard>
                <colgroup><col className="w-[18%]" /><col className="w-[30%]" /><col className="w-[22%]" /><col className="w-[15%]" /><col className="w-[15%]" /></colgroup>
                <RoxTableHead>
                  <RoxHeadRow><th className="px-3 py-3">Ticket</th><th className="px-3 py-3">Device</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Date</th></RoxHeadRow>
                </RoxTableHead>
                <tbody>
                  {customerTickets.slice(0, RECENT_LIMIT).map((t) => (
                    <RoxTableRow key={t.id} onClick={() => router.push(`/tickets/${t.id}`)} className="cursor-pointer">
                      <RoxTableCell className="font-medium text-[#4361EE]">{t.ticketNo || t.id}</RoxTableCell>
                      <RoxTableCell className="truncate">{[t.device, t.model].filter(Boolean).join(" ") || "—"}</RoxTableCell>
                      <RoxTableCell>
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", STATUS_TONE[t.status])}>
                          {STATUS_LABEL[t.status]}
                        </span>
                      </RoxTableCell>
                      <RoxTableCell>{formatINR(t.amount ?? 0)}</RoxTableCell>
                      <RoxTableCell>{fmtDate(t.createdAt)}</RoxTableCell>
                    </RoxTableRow>
                  ))}
                </tbody>
              </RoxTableCard>
            )}
          </ActivitySection>

          <ActivitySection
            title="Invoices"
            icon={<Receipt className="h-3.5 w-3.5" />}
            emptyText="No invoices for this customer yet."
          >
            {customerInvoices.length > 0 && (
              <RoxTableCard>
                <colgroup><col className="w-[20%]" /><col className="w-[25%]" /><col className="w-[20%]" /><col className="w-[17%]" /><col className="w-[18%]" /></colgroup>
                <RoxTableHead>
                  <RoxHeadRow><th className="px-3 py-3">Invoice</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Date</th></RoxHeadRow>
                </RoxTableHead>
                <tbody>
                  {customerInvoices.slice(0, RECENT_LIMIT).map((inv) => (
                    <RoxTableRow key={inv.id} onClick={() => router.push(`/invoice/${inv.id}`)} className="cursor-pointer">
                      <RoxTableCell className="font-medium text-[#4361EE]">{inv.reference || inv.id}</RoxTableCell>
                      <RoxTableCell className="capitalize">{inv.invoiceType}</RoxTableCell>
                      <RoxTableCell>
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", INVOICE_STATUS_TONE[inv.status])}>
                          {INVOICE_STATUS_LABEL[inv.status]}
                        </span>
                      </RoxTableCell>
                      <RoxTableCell>{formatINR(inv.total ?? 0)}</RoxTableCell>
                      <RoxTableCell>{fmtDate(inv.createdAt)}</RoxTableCell>
                    </RoxTableRow>
                  ))}
                </tbody>
              </RoxTableCard>
            )}
          </ActivitySection>

          <ActivitySection
            title="Walk-Ins"
            icon={<UserCheck className="h-3.5 w-3.5" />}
            emptyText="No walk-ins for this customer yet."
          >
            {customerWalkIns.length > 0 && (
              <RoxTableCard>
                <colgroup><col className="w-[20%]" /><col className="w-[25%]" /><col className="w-[25%]" /><col className="w-[15%]" /><col className="w-[15%]" /></colgroup>
                <RoxTableHead>
                  <RoxHeadRow><th className="px-3 py-3">Walk-In</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Issue</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Date</th></RoxHeadRow>
                </RoxTableHead>
                <tbody>
                  {customerWalkIns.slice(0, RECENT_LIMIT).map((w) => (
                    <RoxTableRow key={w.id} onClick={() => router.push(`/walk-in?walkIn=${w.id}`)} className="cursor-pointer">
                      <RoxTableCell className="font-medium text-[#4361EE]">{w.walkInNumber || w.id}</RoxTableCell>
                      <RoxTableCell className="capitalize">{w.type}</RoxTableCell>
                      <RoxTableCell className="truncate">{w.issue || "—"}</RoxTableCell>
                      <RoxTableCell className="capitalize">{w.status}</RoxTableCell>
                      <RoxTableCell>{fmtDate(w.date)}</RoxTableCell>
                    </RoxTableRow>
                  ))}
                </tbody>
              </RoxTableCard>
            )}
          </ActivitySection>

          <ActivitySection
            title="Field Jobs"
            icon={<Truck className="h-3.5 w-3.5" />}
            emptyText="No field jobs for this customer yet."
          >
            {customerFieldJobs.length > 0 && (
              <RoxTableCard>
                <colgroup><col className="w-[20%]" /><col className="w-[30%]" /><col className="w-[25%]" /><col className="w-[25%]" /></colgroup>
                <RoxTableHead>
                  <RoxHeadRow><th className="px-3 py-3">Job</th><th className="px-3 py-3">Route</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Date</th></RoxHeadRow>
                </RoxTableHead>
                <tbody>
                  {customerFieldJobs.slice(0, RECENT_LIMIT).map((j: any) => (
                    <RoxTableRow key={j.id} onClick={() => router.push(`/field?job=${j.id}`)} className="cursor-pointer">
                      <RoxTableCell className="font-medium text-[#4361EE]">{j.jobNo || j.id}</RoxTableCell>
                      <RoxTableCell className="capitalize">{(j.route || "").replace(/_/g, " ") || "—"}</RoxTableCell>
                      <RoxTableCell className="capitalize">{(j.status || "").replace(/_/g, " ")}</RoxTableCell>
                      <RoxTableCell>{fmtDate(j.createdAt)}</RoxTableCell>
                    </RoxTableRow>
                  ))}
                </tbody>
              </RoxTableCard>
            )}
          </ActivitySection>

          {canViewLoyalty && (
            <ActivitySection
              title="Loyalty Activity"
              icon={<Gift className="h-3.5 w-3.5" />}
              emptyText="No loyalty transactions yet."
            >
              {loyaltyTx.length > 0 && (
                <RoxTableCard>
                  <colgroup><col className="w-[20%]" /><col className="w-[35%]" /><col className="w-[15%]" /><col className="w-[15%]" /><col className="w-[15%]" /></colgroup>
                  <RoxTableHead>
                    <RoxHeadRow><th className="px-3 py-3">Type</th><th className="px-3 py-3">Description</th><th className="px-3 py-3">Change</th><th className="px-3 py-3">Balance</th><th className="px-3 py-3">Date</th></RoxHeadRow>
                  </RoxTableHead>
                  <tbody>
                    {loyaltyTx.map((tx) => (
                      <RoxTableRow key={tx.id}>
                        <RoxTableCell className="capitalize">{tx.type}</RoxTableCell>
                        <RoxTableCell className="truncate">{tx.description}</RoxTableCell>
                        <RoxTableCell className={tx.pointsChange >= 0 ? "text-emerald-600" : "text-rose-600"}>
                          {tx.pointsChange >= 0 ? "+" : ""}{tx.pointsChange}
                        </RoxTableCell>
                        <RoxTableCell>{tx.pointsBalance}</RoxTableCell>
                        <RoxTableCell>{fmtDate(tx.createdAt)}</RoxTableCell>
                      </RoxTableRow>
                    ))}
                  </tbody>
                </RoxTableCard>
              )}
            </ActivitySection>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon}{label}</p>
      <p className="text-[15px] font-bold mt-1">{value}</p>
    </div>
  );
}

function ActivitySection({
  title, icon, emptyText, children,
}: {
  title: string;
  icon: React.ReactNode;
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasContent = Array.isArray((children as any))
    ? (children as any).some(Boolean)
    : !!children;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-[#EEF1FD] text-[#4361EE]">{icon}</span>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-600">{title}</h3>
      </div>
      {hasContent ? children : (
        <div className="rounded-2xl border-2 border-zinc-300 bg-card p-6 text-center text-[13px] text-muted-foreground">
          {emptyText}
        </div>
      )}
    </div>
  );
}
