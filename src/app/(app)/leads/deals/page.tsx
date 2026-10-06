"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Deals / Discount-Approval queue.

   The approval workspace for managers/owners (and a read view for authorized
   agents). A DEAL is the discount-exception approval request attached to a
   Lead — this page is the queue of those requests, NOT a second lead/customer
   list. Gated by CAP.deal.view / viewAll; hidden from users without it.
   ────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BadgePercent, Clock, CheckCircle2, XCircle, RefreshCw, Lock,
  ChevronDown, Check, X, MoreHorizontal, Eye, User as UserIcon, Link2, Ban,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Drawer } from "@/components/ui/drawer";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { Avatar } from "@/components/ui/avatar";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { useRoxStickyHeader } from "@/components/ui/rox-table";
import { TableUtilityBar } from "@/components/common/table-utility-bar";
import { matchesStoreSelection } from "@/components/common/store-multi-select";
import { useLeadStoreMode } from "@/lib/lead-store-mode";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { CAP, allow } from "@/lib/capabilities";
import { cn, formatINR } from "@/lib/utils";
import { useDeals } from "@/lib/lead-deals-context";
import { useLeads } from "@/lib/leads-context";
import { toast } from "@/components/ui/toaster";
import {
  DEAL_QUEUE_TABS, type DealQueueTab, dealInQueueTab,
  DEAL_STATUS_LABEL, dealStatusTone, formatDealDiscount, dealAgeLabel,
  isOpenDealStatus, canAgentResubmit, canDecideDeal,
  type LeadDeal,
} from "@/lib/lead-deals";
import { DealReviewPanel } from "@/components/deals/deal-review-panel";
import { DealRequestModal } from "@/components/deals/deal-request-modal";

/** The customer's offer = quoted price minus the requested discount
 *  (absolute ₹ or percent). Returns null when the quote is unknown. */
function customerOfferPrice(
  leadValue: number | null,
  discount: number | null,
  type: "amount" | "percent",
): number | null {
  if (leadValue == null) return null;
  if (discount == null) return leadValue;
  const off = type === "percent" ? (leadValue * discount) / 100 : discount;
  return Math.max(0, Math.round(leadValue - off));
}

/* Soft colour tints for the KPI boxes — tinted surface + matching icon chip +
   value colour, with a subtle hover lift. Kept restrained (RepairOX palette). */
const KPI_TONES = {
  indigo:  { card: "border-[#4361EE]/20 bg-[#EEF1FD] hover:border-[#4361EE]/40", chip: "bg-[#4361EE]/15 text-[#4361EE]", value: "text-[#2f3fb5]" },
  amber:   { card: "border-amber-300/60 bg-amber-50 hover:border-amber-400",     chip: "bg-amber-100 text-amber-700",   value: "text-amber-800" },
  emerald: { card: "border-emerald-300/60 bg-emerald-50 hover:border-emerald-400", chip: "bg-emerald-100 text-emerald-700", value: "text-emerald-800" },
  rose:    { card: "border-rose-300/60 bg-rose-50 hover:border-rose-400",         chip: "bg-rose-100 text-rose-700",     value: "text-rose-800" },
  sky:     { card: "border-sky-300/60 bg-sky-50 hover:border-sky-400",            chip: "bg-sky-100 text-sky-700",       value: "text-sky-800" },
} as const;

export default function DealsPage() {
  const { can } = usePermissions();
  const { isAllShops, stores, getStore } = useStoreContext();
  const { deals, hydrated, dealById, approveDeal, cancelDeal, reopenDeal } = useDeals();
  const { leads, viewAsReadOnly, canSeeAllLeads } = useLeads();
  const searchParams = useSearchParams();
  const router = useRouter();

  const canView = allow(can, CAP.deal.view) || allow(can, CAP.deal.viewAll);

  /* Lead lookup — deals reference a Lead by id; Device & Issue come from the
     linked Lead (never duplicated onto the deal). */
  const leadById = useMemo(() => {
    const m = new Map<string, (typeof leads)[number]>();
    for (const l of leads) m.set(l.id, l);
    return m;
  }, [leads]);
  // Deals inherit the Lead's store; a store filter/column only makes sense in
  // Multi-Store Lead mode.
  const leadMode = useLeadStoreMode();
  const multiStore = isAllShops && stores.length > 1 && leadMode.isMulti;

  const [tab, setTab] = useState<DealQueueTab>("all");
  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [resubmitDeal, setResubmitDeal] = useState<LeadDeal | null>(null);
  const meId = usePermissions().currentUser?.id || "";
  const isOwner = can("full_access");

  /* Visibility scope (UI = server = RLS). A MANAGER/owner who can view the whole
     queue (deals_view_all / deals_approve / manage_sales / manage_reports, or
     the lead see-all key) sees EVERY deal in their authorized stores — with the
     agent name differentiating each row. An individual AGENT sees ONLY their own
     deals: the ones they raised, or whose parent lead is in their visible leads.
     In DB mode RLS already enforces this; this client scope is the local-mode
     boundary + defence-in-depth so an agent never sees another agent's deal. */
  const canSeeAllDeals = allow(can, CAP.deal.viewAll) || canSeeAllLeads;
  const myLeadIds = useMemo(() => new Set(leads.map((l) => l.id)), [leads]);

  /** Deals the current user is allowed to see (before tab/store/search). KPIs
   *  and tab counts derive from this so an agent's numbers reflect only their
   *  own deals, and a manager's reflect every agent's. */
  const visibleDeals = useMemo(() => {
    if (canSeeAllDeals) return deals;
    return deals.filter((d) => d.createdBy === meId || d.salesAgentId === meId || myLeadIds.has(d.leadId));
  }, [deals, canSeeAllDeals, meId, myLeadIds]);

  /* Approval authority (what-you-can-do) — used to gate the inline Status
     control. Reject / Request Changes require a mandatory reason, so they open
     the review drawer; Approve can be applied inline (defaults to the requested
     discount). All gated by capability + the self-approval rule. */
  const canApprove = allow(can, CAP.deal.approve);
  const canReject = allow(can, CAP.deal.reject);
  const canRequestChanges = allow(can, CAP.deal.requestChanges);

  /** Inline approve — authorizes the exception at the requested discount. */
  const inlineApprove = async (d: LeadDeal) => {
    const ok = await approveDeal(d.id, {
      approvedDiscount: d.requestedDiscount,
      approvedDiscountType: d.requestedDiscountType,
    });
    if (ok) toast.success("Deal approved", { description: `${d.dealNo} · ${formatDealDiscount(d.requestedDiscount, d.requestedDiscountType)}` });
    else toast.error("Couldn't approve the deal");
  };

  // Deep-link ?deal=<id> opens the review drawer.
  useEffect(() => {
    const d = searchParams.get("deal");
    if (d) setOpenId(d);
  }, [searchParams]);

  const openDeal = openId ? dealById(openId) ?? null : null;
  // Keep the open drawer in sync with live deal updates.
  const liveOpenDeal = openDeal ? deals.find((d) => d.id === openDeal.id) ?? openDeal : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleDeals.filter((d) => {
      if (!dealInQueueTab(d, tab)) return false;
      if (!matchesStoreSelection(d.branchId || null, storeFilter)) return false;
      if (q) {
        const hay = `${d.dealNo} ${d.leadNo} ${d.customerName} ${d.salesAgentName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      // Oldest pending first (approval aging); else newest first.
      if (tab === "pending_approval") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [visibleDeals, tab, storeFilter, query]);

  /* Pagination (canonical: 10/20/50/100 + detached footer below the table). */
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );
  // Reset to page 1 whenever the filtered set changes shape.
  useEffect(() => { setPage(1); }, [tab, storeFilter, query, pageSize]);

  /* Frozen sticky header offset (pins the <thead> flush below the topbar). */
  const { wrapRef, theadTop } = useRoxStickyHeader();

  const kpis = useMemo(() => {
    const pending = visibleDeals.filter((d) => d.status === "pending_approval").length;
    const changes = visibleDeals.filter((d) => d.status === "changes_requested").length;
    const approved = visibleDeals.filter((d) => d.status === "approved").length;
    const rejected = visibleDeals.filter((d) => d.status === "rejected").length;
    return { pending, changes, approved, rejected };
  }, [visibleDeals]);

  if (!canView) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Sales" title="Deals" subtitle="Discount approval requests." />
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-12 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><Lock className="h-6 w-6" /></div>
          <p className="font-semibold">You don't have access to the Deals page</p>
          <p className="text-sm text-muted-foreground">Discount approvals are managed by authorized reviewers. You can still submit a discount request from a lead.</p>
        </div>
      </div>
    );
  }

  const tabCount = (t: DealQueueTab) => t === "all" ? visibleDeals.length : visibleDeals.filter((d) => d.status === t).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Deals"
        subtitle="Discount approval requests attached to leads. Review, approve, request changes or reject."
      />

      {/* KPI strip — soft colour-tinted boxes (one tone per status) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          { label: "Pending Approval", value: String(kpis.pending), icon: Clock, tone: "amber" },
          { label: "Changes Requested", value: String(kpis.changes), icon: RefreshCw, tone: "indigo" },
          { label: "Approved", value: String(kpis.approved), icon: CheckCircle2, tone: "emerald" },
          { label: "Rejected", value: String(kpis.rejected), icon: XCircle, tone: "rose" },
        ] as const).map((kpi, i) => {
          const Icon = kpi.icon;
          const t = KPI_TONES[kpi.tone];
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i }}
              className={cn("rounded-xl border-2 p-4 shadow-card transition", t.card)}
            >
              <span className={cn("grid h-8 w-8 place-items-center rounded-lg", t.chip)}>
                <Icon className="h-4 w-4" />
              </span>
              <p className={cn("font-display mt-2 text-xl font-extrabold tabular-nums", t.value)}>{kpi.value}</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Queue tabs (left) + Store/Search utility group (right) — sticky block;
          the frozen table header (theadTop) pins flush beneath it. */}
      <div ref={wrapRef} className="sticky top-[60px] z-[6] -mt-2 bg-[hsl(var(--background))] pb-3 pt-2">
        <TableUtilityBar
          hideStore={!leadMode.isMulti}
          storeValue={storeFilter}
          onStoreChange={setStoreFilter}
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search deal, lead, customer, agent…"
          left={
            <div className="max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <SegmentedTabs
                size="sm"
                options={DEAL_QUEUE_TABS.map((t) => ({ label: `${t.label} (${tabCount(t.value)})`, value: t.value }))}
                value={tab}
                onChange={(v) => setTab(v as DealQueueTab)}
              />
            </div>
          }
        />
      </div>

      {/* ── Deals table — canonical rox-table foundation (sharp frame, frozen
          sticky header, detached pagination). Matches the Walk-In / Ticket
          tables. ── */}
      <div className="border-2 border-zinc-300 bg-card shadow-card">
        <div className="[overflow-x:clip]">
          <table className="w-full table-fixed text-[14px]">
            <colgroup>
              <col className="w-[124px]" />{/* Deal ID */}
              {multiStore && <col className="w-[112px]" />}{/* Store */}
              <col className="w-[15%]" />{/* Agent Name — flexible */}
              <col className="w-[16%]" />{/* Customer Name — flexible */}
              <col className="w-[18%]" />{/* Device & Issue — flexible */}
              <col className="w-[106px]" />{/* Price Quoted */}
              <col className="w-[118px]" />{/* Customer Offer */}
              <col className="w-[146px]" />{/* Status — editable pill */}
              <col className="w-[58px]" />{/* Age */}
              <col className="w-[64px]" />{/* Actions */}
            </colgroup>
            <thead style={{ top: theadTop }} className="sticky z-[5] bg-[#D6DDFB] border-b-2 border-[#4361EE]/40">
              <tr className="text-left text-[12px] font-bold uppercase tracking-wider text-[#4361EE] [&>th]:py-4 [&>th]:whitespace-nowrap">
                <th className="pl-5 pr-3">Deal ID</th>
                {multiStore && <th className="px-3">Store</th>}
                <th className="px-3">Agent Name</th>
                <th className="px-3">Customer Name</th>
                <th className="px-3">Device &amp; Issue</th>
                <th className="px-3 text-right">Price Quoted</th>
                <th className="px-3 text-right">Customer Offer</th>
                <th className="pl-[32px] pr-3">Status</th>
                <th className="px-3 text-right">Age</th>
                <th className="px-3 text-center">Actions</th>
              </tr>
            </thead>
            {/* Rows match the canonical Walk-In / Ticket rhythm EXACTLY:
                h-[68px] height, border-t border-zinc-500 separators, py-4 cells. */}
            <tbody>
              {paged.map((d, i) => {
                const lead = leadById.get(d.leadId);
                const device = lead?.device?.trim() || "";
                const issue = lead?.issue?.trim() || "";
                // The customer's offer = quoted price minus the requested
                // discount (amount or percent). Null quote → unknown.
                const offer = customerOfferPrice(d.leadValue, d.requestedDiscount, d.requestedDiscountType);
                // Inline Status: for OPEN deals an authorized approver can decide
                // (Approve/Reject/Request Changes). For TERMINAL deals (approved
                // / rejected / cancelled) the approver can REOPEN for a fresh
                // review. The agent's Revise & Resubmit is gated separately.
                const hasApprovalCaps = !viewAsReadOnly && (canApprove || canReject || canRequestChanges);
                const canDecide = hasApprovalCaps
                  && isOpenDealStatus(d.status)
                  && canDecideDeal(d, meId, isOwner);
                const canReopen = hasApprovalCaps
                  && !isOpenDealStatus(d.status)
                  && d.status !== "cancelled";
                return (
                <motion.tr
                  key={d.id}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(0.015 * i, 0.2) }}
                  onClick={() => setOpenId(d.id)}
                  className="rox-table-row group h-[68px] cursor-pointer border-t border-zinc-500 align-middle transition hover:bg-muted/40"
                >
                  <td className="pl-5 pr-3 py-4 align-middle">
                    <p className="font-semibold tabular-nums text-zinc-900">{d.dealNo}</p>
                    {d.leadNo ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); router.push(`/leads/${d.leadId}`); }}
                        title={`Open lead ${d.leadNo}`}
                        className="block max-w-full truncate text-[11px] font-medium text-[#4361EE] hover:underline"
                      >
                        {d.leadNo}
                      </button>
                    ) : (
                      <span className="text-[11px] text-zinc-400">—</span>
                    )}
                  </td>
                  {multiStore && <td className="px-3 py-4 align-middle"><StoreContextCell store={getStore(d.branchId || null)} mode="stacked" /></td>}
                  <td className="px-3 py-4 align-middle text-zinc-700"><span className="block truncate">{d.salesAgentName || "—"}</span></td>
                  <td className="px-3 py-4 align-middle">
                    <div className="flex items-center gap-2">
                      <Avatar name={d.customerName || "—"} size={26} />
                      <span className="truncate text-zinc-700">{d.customerName || "—"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-4 align-middle">
                    {device || issue ? (
                      <>
                        <p className="truncate font-medium text-zinc-800" title={device || undefined}>{device || "—"}</p>
                        <p className="truncate text-[11px] text-muted-foreground" title={issue || undefined}>{issue || "No issue noted"}</p>
                      </>
                    ) : (
                      <span className="text-[13px] text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-4 text-right align-middle tabular-nums text-zinc-700">{d.leadValue == null ? "—" : formatINR(d.leadValue)}</td>
                  <td className="px-3 py-4 text-right align-middle">
                    {offer == null ? (
                      <span className="text-[13px] text-zinc-400">—</span>
                    ) : (
                      <>
                        <p className="font-semibold tabular-nums text-emerald-600">{formatINR(offer)}</p>
                        <p className="text-[11px] text-muted-foreground">off {formatDealDiscount(d.requestedDiscount, d.requestedDiscountType)}</p>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                    <DealStatusCell
                      deal={d}
                      canDecide={canDecide}
                      canReopen={canReopen}
                      canApprove={canApprove}
                      canReject={canReject}
                      canRequestChanges={canRequestChanges}
                      onApprove={() => inlineApprove(d)}
                      onReject={() => setOpenId(d.id)}
                      onRequestChanges={() => setOpenId(d.id)}
                      onReopen={() => reopenDeal(d.id)}
                      onResubmit={() => setResubmitDeal(d)}
                      canResubmit={!viewAsReadOnly && canAgentResubmit(d, meId)}
                    />
                  </td>
                  <td className="px-3 py-4 text-right align-middle text-[11px] text-muted-foreground">{dealAgeLabel(d.createdAt)}</td>
                  <td className="px-3 py-4 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                    <DealQuickActions
                      deal={d}
                      meId={meId}
                      onView={() => setOpenId(d.id)}
                      onViewLead={() => router.push(`/leads/${d.leadId}`)}
                      onResubmit={() => setResubmitDeal(d)}
                      onCancel={() => cancelDeal(d.id)}
                      canCancel={!viewAsReadOnly && (allow(can, CAP.deal.approve) || d.createdBy === meId)}
                    />
                  </td>
                </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hydrated && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><BadgePercent className="h-6 w-6" /></div>
            <p className="font-semibold">No deals here</p>
            <p className="text-sm text-muted-foreground">Discount requests appear when a Sales Agent marks a lead as a Discounted Lead.</p>
          </div>
        )}
        {!hydrated && <div className="p-12 text-center text-sm text-muted-foreground">Loading deals…</div>}
      </div>

      {/* Pagination — DETACHED below the table frame (canonical). */}
      <Pagination
        page={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
        totalItems={filtered.length}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        itemLabel="deal"
      />

      {/* Review drawer */}
      <Drawer
        open={!!liveOpenDeal}
        onClose={() => setOpenId(null)}
        title={liveOpenDeal ? liveOpenDeal.dealNo : "Deal"}
        subtitle={liveOpenDeal ? `Lead ${liveOpenDeal.leadNo} · ${liveOpenDeal.customerName || ""}` : ""}
        icon={BadgePercent}
        width="max-w-xl"
      >
        {liveOpenDeal && <DealReviewPanel deal={liveOpenDeal} onResubmit={(dl) => { setOpenId(null); setResubmitDeal(dl); }} />}
      </Drawer>

      {/* Revise & resubmit modal (opened from the row menu / review panel) */}
      <DealRequestModal
        open={!!resubmitDeal}
        onClose={() => setResubmitDeal(null)}
        lead={resubmitDeal ? leads.find((l) => l.id === resubmitDeal.leadId) ?? null : null}
        deal={resubmitDeal}
        onDone={() => setResubmitDeal(null)}
      />
    </div>
  );
}

/* ─── Inline Status cell ─────────────────────────────────────────────────────
   A canonical RepairOX status pill (rounded-full, ring, tone from the shared
   dealStatusTone helper) that doubles as an inline decision control.

   • Read-only when the viewer can't decide this deal (view-tier user, a closed
     deal, a non-approver, or the requester's own open deal) — a plain pill, no
     chevron.
   • Editable for an authorized approver on an OPEN deal: the pill opens a small
     menu of decisions. APPROVE applies inline at the requested discount;
     REJECT / REQUEST CHANGES require a mandatory reason, so they open the review
     drawer (never a silent status change without the required input).
   • For the requester whose deal is changes-requested, offers Revise & Resubmit.

   The pill fills its cell (flex h-7 w-full) with truncation + tooltip so it
   never resizes per row. */
function DealStatusCell({
  deal, canDecide, canReopen, canApprove, canReject, canRequestChanges,
  onApprove, onReject, onRequestChanges, onReopen, onResubmit, canResubmit,
}: {
  deal: LeadDeal;
  canDecide: boolean;
  canReopen: boolean;
  canApprove: boolean;
  canReject: boolean;
  canRequestChanges: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRequestChanges: () => void;
  onReopen: () => void;
  onResubmit: () => void;
  canResubmit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; dropUp: boolean }>({ top: 0, left: 0, dropUp: false });
  const btnRef = useRef<HTMLButtonElement>(null);

  const label = DEAL_STATUS_LABEL[deal.status];
  const tone = dealStatusTone(deal.status);
  const interactive = canDecide || canReopen || canResubmit;

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const dropUp = window.innerHeight - r.bottom < 220;
      setPos({ top: dropUp ? undefined : r.bottom + 6, bottom: dropUp ? window.innerHeight - r.top + 6 : undefined, left: r.left, dropUp });
    }
    setOpen((o) => !o);
  };

  // Read-only pill — same full-width geometry (minus the chevron) so it lines
  // up with the editable pills in other rows.
  if (!interactive) {
    return (
      <span
        title={label}
        className={cn("flex h-7 w-full min-w-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold ring-1 ring-inset", tone)}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {isOpenDealStatus(deal.status) && <Lock className="h-3 w-3 shrink-0 opacity-50" />}
      </span>
    );
  }

  return (
    <div className="relative block w-full" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        title={label}
        className={cn(
          "flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-left text-[11px] font-semibold ring-1 ring-inset transition hover:shadow-sm",
          tone,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
            <motion.div
              initial={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: pos.dropUp ? 4 : -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left }}
              className="z-[70] w-[230px] rounded-xl border border-border bg-card p-1.5 shadow-xl"
            >
              <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Change status</p>
              {canDecide && canApprove && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); onApprove(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-emerald-700 transition hover:bg-emerald-50"
                >
                  <Check className="h-3.5 w-3.5" /> Approve (at requested)
                </button>
              )}
              {canDecide && canRequestChanges && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); onRequestChanges(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-indigo-700 transition hover:bg-indigo-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Request Changes…
                </button>
              )}
              {canDecide && canReject && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); onReject(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-rose-600 transition hover:bg-rose-50"
                >
                  <X className="h-3.5 w-3.5" /> Reject…
                </button>
              )}
              {canReopen && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); onReopen(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-amber-700 transition hover:bg-amber-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Reopen for review
                </button>
              )}
              {canResubmit && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setOpen(false); onResubmit(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-medium text-[#4361EE] transition hover:bg-indigo-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Revise &amp; Resubmit
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Quick Actions row menu (view / view lead / copy link / resubmit / cancel —
   NO delete) ──────────────────────────────────────────────────────────────── */
function DealQuickActions({
  deal, meId, onView, onViewLead, onResubmit, onCancel, canCancel,
}: {
  deal: LeadDeal;
  meId: string;
  onView: () => void;
  onViewLead: () => void;
  onResubmit: () => void;
  onCancel: () => void;
  canCancel: boolean;
}) {
  const copyLink = () => {
    const url = `${window.location.origin}/leads/deals?deal=${deal.id}`;
    navigator.clipboard?.writeText(url).then(
      () => toast.success("Link copied", { description: deal.dealNo }),
      () => toast.error("Couldn't copy link"),
    );
  };
  return (
    <Dropdown
      width="w-52"
      trigger={({ toggle }) => (
        <button
          onClick={toggle}
          className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={`Actions for ${deal.dealNo}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Deal</MenuLabel>
          <MenuItem icon={Eye} onClick={() => { close(); onView(); }}>View Deal</MenuItem>
          <MenuItem icon={UserIcon} onClick={() => { close(); onViewLead(); }}>View Lead</MenuItem>
          <MenuItem icon={Link2} onClick={() => { close(); copyLink(); }}>Copy approval link</MenuItem>
          {canAgentResubmit(deal, meId) && (
            <MenuItem icon={RefreshCw} onClick={() => { close(); onResubmit(); }}>Revise &amp; Resubmit</MenuItem>
          )}
          {canCancel && isOpenDealStatus(deal.status) && (
            <MenuItem icon={Ban} onClick={() => { close(); onCancel(); }}>Cancel request</MenuItem>
          )}
        </>
      )}
    </Dropdown>
  );
}
