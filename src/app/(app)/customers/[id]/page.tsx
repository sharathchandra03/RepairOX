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
  Phone, Mail, MapPin, Building2, Gift, Ticket as TicketIcon, MessageCircle, Copy,
  Receipt, UserCheck, Truck, Target, Activity, ContactRound, Inbox,
} from "lucide-react";
import { BackPill } from "@/components/common/back-pill";
import { SegmentedTabs } from "@/components/ui/tabs";
import { DetailHero, DetailSection, DetailField, SummaryCard } from "@/components/common/detail-page";
import { toast } from "@/components/ui/toaster";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useField } from "@/lib/field-context";
import { useLeads } from "@/lib/leads-context";
import { customerSalesAttribution } from "@/lib/leads-data";
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
  const { leads } = useLeads();

  const customer = useMemo(() => customers.find((c) => c.id === customerId), [customers, customerId]);

  /* ── Sales attribution (derived, read-only) ──
     Per-lead agent/date/result/revenue for every lead referencing THIS
     customer. A customer worked by several agents shows several rows — the
     history is never collapsed onto one "customer agent", and the record
     creator is never treated as the sales agent (spec §19/§20/§52/§97). */
  const salesAttribution = useMemo(
    () => customerSalesAttribution(customerId, leads, { tickets, invoices }),
    [customerId, leads, tickets, invoices],
  );
  const primaryAgent = salesAttribution.find((r) => r.agentName)?.agentName || "";

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

  const canView = allow(can, CAP.customer.view) && allow(can, CAP.customer.master);
  const canViewHistory = can("view_customer_history") || can("manage_customers");
  const [tab, setTab] = useState<TabId>("overview");

  if (!canView) {
    return <div className="p-8 text-center text-sm text-muted-foreground">You don&apos;t have permission to view customer records.</div>;
  }
  if (!customer) {
    return (
      <div className="space-y-5">
        <BackPill fallback="/customers" />
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-sm text-muted-foreground shadow-card">Customer not found.</div>
      </div>
    );
  }

  const groups = resolveGroups(customer.groupIds, customerGroups);
  const name = formatCustomerName(customer);
  const wa = customer.mobile ? `https://wa.me/91${customer.mobile.replace(/\D/g, "").slice(-10)}` : "";
  const copy = async (t: string, l: string) => { try { await navigator.clipboard.writeText(t); toast.success(`${l} copied`); } catch { toast.error("Couldn't copy"); } };

  /* Recent activity across modules (newest first). */
  type Act = { key: string; kind: string; tone: string; ref: string; sub: string; status: string; date: string; href: string };
  const activity: Act[] = [
    ...customerTickets.map((t) => ({ key: "t" + t.id, kind: "Ticket", tone: "bg-indigo-50 text-indigo-700", ref: t.ticketNo || t.id, sub: [t.device, t.model].filter(Boolean).join(" ") || "—", status: STATUS_LABEL[t.status] || "", date: t.createdAt || "", href: `/tickets/${t.id}` })),
    ...customerInvoices.map((i) => ({ key: "i" + i.id, kind: "Invoice", tone: "bg-emerald-50 text-emerald-700", ref: i.reference || i.id, sub: formatINR(i.total ?? 0), status: INVOICE_STATUS_LABEL[i.status] || "", date: i.createdAt || "", href: `/invoice/${i.id}` })),
    ...customerWalkIns.map((w) => ({ key: "w" + w.id, kind: "Walk-In", tone: "bg-sky-50 text-sky-700", ref: w.walkInNumber || w.id, sub: w.issue || "—", status: w.status, date: w.date || "", href: `/walk-in?walkIn=${w.id}` })),
    ...customerFieldJobs.map((j: any) => ({ key: "f" + j.id, kind: "Field", tone: "bg-violet-50 text-violet-700", ref: j.jobNo || j.id, sub: (j.route || "").replace(/_/g, " ") || "—", status: (j.status || "").replace(/_/g, " "), date: j.createdAt || "", href: `/field/${j.id}` })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const tabs: { label: string; value: TabId }[] = [
    { label: "Overview", value: "overview" },
    { label: `Leads (${salesAttribution.length})`, value: "leads" },
    { label: `Tickets (${customerTickets.length})`, value: "tickets" },
    { label: `Invoices (${customerInvoices.length})`, value: "invoices" },
    { label: `Walk-Ins (${customerWalkIns.length})`, value: "walkins" },
    { label: `Field (${customerFieldJobs.length})`, value: "field" },
    ...(canViewLoyalty ? [{ label: "Loyalty", value: "loyalty" as TabId }] : []),
  ];

  const go = (href: string) => router.push(href);

  return (
    <div className="space-y-5">
      <BackPill fallback="/customers" />

      <DetailHero>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar name={name} size={60} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold tracking-tight">{name}</h1>
                <CustomerBadges type={customer.type} source={customer.source as CustomerSource | undefined} groups={groups} />
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{customer.id} · Customer since {fmtDate(customer.createdAt)}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-zinc-700">
                {customer.mobile && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-[#4361EE]" />{formatPhone(customer.mobile)}</span>}
                {customer.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-[#4361EE]" />{customer.email}</span>}
                {customer.city && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#4361EE]" />{customer.city}</span>}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {customer.mobile && <a href={`tel:${customer.mobile}`}><Button size="sm" variant="outline" className="gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"><Phone className="h-3.5 w-3.5" />Call</Button></a>}
            {wa && <a href={wa} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5 bg-green-50 text-green-700 hover:bg-green-100"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</Button></a>}
            {customer.email && <a href={`mailto:${customer.email}`}><Button size="sm" variant="outline" className="gap-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100"><Mail className="h-3.5 w-3.5" />Email</Button></a>}
            {customer.mobile && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copy(customer.mobile, "Mobile")}><Copy className="h-3.5 w-3.5" />Copy</Button>}
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Lifetime Value" value={formatINR(customer.lifetimeValue ?? 0)} />
          <SummaryCard label="Leads" value={salesAttribution.length} />
          <SummaryCard label="Tickets" value={customer.totalTickets ?? customerTickets.length} />
          <SummaryCard label="Invoices" value={customer.totalInvoices ?? customerInvoices.length} />
          <SummaryCard label="Walk-Ins" value={customerWalkIns.length} />
          <SummaryCard label="Loyalty Points" value={canViewLoyalty && loyaltyBalance != null ? loyaltyBalance : "—"} />
        </div>
      </DetailHero>

      {!canViewHistory ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-card">You don&apos;t have permission to view this customer&apos;s activity history.</div>
      ) : (
        <>
          <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SegmentedTabs size="sm" value={tab} onChange={(v) => setTab(v as TabId)} options={tabs} />
          </div>

          {tab === "overview" && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <DetailSection icon={Activity} title="Recent Activity" accent="blue">
                  {activity.length === 0 ? (
                    <Empty text="No tickets, invoices, walk-ins or field jobs yet." />
                  ) : (
                    <ul className="divide-y divide-border">
                      {activity.slice(0, 8).map((a) => (
                        <li key={a.key}>
                          <button type="button" onClick={() => go(a.href)} className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-muted/40">
                            <span className={cn("w-[72px] shrink-0 rounded-md px-2 py-1 text-center text-[10.5px] font-bold uppercase", a.tone)}>{a.kind}</span>
                            <span className="w-[110px] shrink-0 truncate text-[13px] font-semibold text-[#4361EE]">{a.ref}</span>
                            <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{a.sub}</span>
                            <span className="hidden shrink-0 text-[11.5px] capitalize text-muted-foreground sm:inline">{a.status}</span>
                            <span className="w-[92px] shrink-0 text-right text-[11.5px] text-muted-foreground">{fmtDate(a.date)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </DetailSection>
              </div>
              <DetailSection icon={ContactRound} title="Contact Details" accent="green">
                <div className="grid grid-cols-1 gap-3">
                  <DetailField flat label="Mobile" value={customer.mobile ? formatPhone(customer.mobile) : "—"} />
                  {customer.altMobile && <DetailField flat label="Alternate" value={formatPhone(customer.altMobile)} />}
                  <DetailField flat label="Email" value={customer.email || "—"} />
                  {customer.company && <DetailField flat label="Company" value={customer.company} />}
                  {customer.gstNumber && <DetailField flat label="GST" value={customer.gstNumber} />}
                  <DetailField flat label="Address" value={[customer.address, customer.city, customer.state, customer.postalCode].filter(Boolean).join(", ") || "—"} />
                  {customer.notes && <DetailField flat label="Notes" value={customer.notes} />}
                </div>
              </DetailSection>
            </div>
          )}

          {tab === "leads" && (
            <DetailSection icon={Target} title="Leads & Sales Agents" accent="violet"
              action={primaryAgent ? <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200"><UserCheck className="h-3 w-3" />{primaryAgent}</span> : undefined}>
              {salesAttribution.length === 0 ? <Empty text="No sales lead is linked to this customer. Direct business carries no sales-agent credit." /> : (
                <Table heads={["Lead", "Sales Agent", "Date", "Result", "Revenue"]}
                  rows={salesAttribution.map((r) => ({
                    key: r.leadId, onClick: () => go(`/leads/${r.leadId}`),
                    cells: [
                      <span key="a" className="font-semibold text-[#4361EE]">{r.leadNo}</span>,
                      r.agentName ? <span key="b" className="inline-flex items-center gap-1.5"><Avatar name={r.agentName} size={18} />{r.agentName}</span> : <span key="b" className="text-muted-foreground">Unassigned</span>,
                      fmtDate(r.date),
                      <span key="d" className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">{r.result}</span>,
                      r.revenue > 0 ? formatINR(r.revenue) : "—",
                    ],
                  }))} />
              )}
            </DetailSection>
          )}

          {tab === "tickets" && (
            <DetailSection icon={TicketIcon} title="Tickets" accent="indigo">
              {customerTickets.length === 0 ? <Empty text="No tickets for this customer yet." /> : (
                <Table heads={["Ticket", "Device", "Status", "Amount", "Date"]}
                  rows={customerTickets.map((t) => ({ key: t.id, onClick: () => go(`/tickets/${t.id}`), cells: [
                    <span key="a" className="font-semibold text-[#4361EE]">{t.ticketNo || t.id}</span>,
                    [t.device, t.model].filter(Boolean).join(" ") || "—",
                    <span key="c" className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", STATUS_TONE[t.status])}>{STATUS_LABEL[t.status]}</span>,
                    formatINR(t.amount ?? 0), fmtDate(t.createdAt),
                  ] }))} />
              )}
            </DetailSection>
          )}

          {tab === "invoices" && (
            <DetailSection icon={Receipt} title="Invoices" accent="emerald">
              {customerInvoices.length === 0 ? <Empty text="No invoices for this customer yet." /> : (
                <Table heads={["Invoice", "Type", "Status", "Total", "Date"]}
                  rows={customerInvoices.map((i) => ({ key: i.id, onClick: () => go(`/invoice/${i.id}`), cells: [
                    <span key="a" className="font-semibold text-[#4361EE]">{i.reference || i.id}</span>,
                    <span key="b" className="capitalize">{i.invoiceType}</span>,
                    <span key="c" className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", INVOICE_STATUS_TONE[i.status])}>{INVOICE_STATUS_LABEL[i.status]}</span>,
                    formatINR(i.total ?? 0), fmtDate(i.createdAt),
                  ] }))} />
              )}
            </DetailSection>
          )}

          {tab === "walkins" && (
            <DetailSection icon={UserCheck} title="Walk-Ins" accent="sky">
              {customerWalkIns.length === 0 ? <Empty text="No walk-ins for this customer yet." /> : (
                <Table heads={["Walk-In", "Type", "Issue", "Status", "Date"]}
                  rows={customerWalkIns.map((w) => ({ key: w.id, onClick: () => go(`/walk-in?walkIn=${w.id}`), cells: [
                    <span key="a" className="font-semibold text-[#4361EE]">{w.walkInNumber || w.id}</span>,
                    <span key="b" className="capitalize">{w.type}</span>, w.issue || "—", <span key="d" className="capitalize">{w.status}</span>, fmtDate(w.date),
                  ] }))} />
              )}
            </DetailSection>
          )}

          {tab === "field" && (
            <DetailSection icon={Truck} title="Field Jobs" accent="violet">
              {customerFieldJobs.length === 0 ? <Empty text="No field jobs for this customer yet." /> : (
                <Table heads={["Job", "Route", "Status", "Date"]}
                  rows={customerFieldJobs.map((j: any) => ({ key: j.id, onClick: () => go(`/field/${j.id}`), cells: [
                    <span key="a" className="font-semibold text-[#4361EE]">{j.jobNo || j.id}</span>,
                    <span key="b" className="capitalize">{(j.route || "").replace(/_/g, " ") || "—"}</span>,
                    <span key="c" className="capitalize">{(j.status || "").replace(/_/g, " ")}</span>, fmtDate(j.createdAt),
                  ] }))} />
              )}
            </DetailSection>
          )}

          {tab === "loyalty" && canViewLoyalty && (
            <DetailSection icon={Gift} title="Loyalty Activity" accent="amber">
              {loyaltyTx.length === 0 ? <Empty text="No loyalty transactions yet." /> : (
                <Table heads={["Type", "Description", "Change", "Balance", "Date"]}
                  rows={loyaltyTx.map((tx) => ({ key: tx.id, cells: [
                    <span key="a" className="capitalize">{tx.type}</span>, tx.description,
                    <span key="c" className={tx.pointsChange >= 0 ? "text-emerald-600" : "text-rose-600"}>{tx.pointsChange >= 0 ? "+" : ""}{tx.pointsChange}</span>,
                    tx.pointsBalance, fmtDate(tx.createdAt),
                  ] }))} />
              )}
            </DetailSection>
          )}
        </>
      )}
    </div>
  );
}

type TabId = "overview" | "leads" | "tickets" | "invoices" | "walkins" | "field" | "loyalty";

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground"><Inbox className="h-5 w-5" /></span>
      <p className="text-[13px] text-muted-foreground">{text}</p>
    </div>
  );
}

/** Simple in-section table (soft sub-table header per the view-page standard). */
function Table({ heads, rows }: { heads: string[]; rows: { key: string; onClick?: () => void; cells: React.ReactNode[] }[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-[#EEF1FD] text-left text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]">
            {heads.map((h) => <th key={h} className="px-3 py-2.5">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} onClick={r.onClick} className={cn("border-t border-border", r.onClick && "cursor-pointer hover:bg-muted/40")}>
              {r.cells.map((c, i) => <td key={i} className="px-3 py-3 align-middle">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
