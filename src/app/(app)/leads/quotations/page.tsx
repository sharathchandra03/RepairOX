"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Quotations section.

   The real quotation list — lead-based AND standalone (Quick) quotations from
   the canonical quotations store (never a mock / second db). Gated by
   CAP.quotation.view; a Sales Agent sees their own quotations, an owner/manager
   with viewAll sees every quotation in authorized stores. Follows the design-
   system table + utility-bar + store-context + pagination standards.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, FileText, Send, Clock, CheckCircle2, Lock, Eye, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Pagination } from "@/components/ui/pagination";
import { useRoxStickyHeader } from "@/components/ui/rox-table";
import { toast } from "@/components/ui/toaster";
import { TableUtilityBar } from "@/components/common/table-utility-bar";
import { matchesStoreSelection } from "@/components/common/store-multi-select";
import { useLeadStoreMode } from "@/lib/lead-store-mode";
import { StoreContextCell } from "@/components/common/store-context-cell";
import { Can } from "@/components/common/can";
import { usePermissions } from "@/lib/permissions-context";
import { useStoreContext } from "@/lib/store-context";
import { useSession } from "@/lib/use-session";
import { CAP, allow } from "@/lib/capabilities";
import { cn, formatINR } from "@/lib/utils";
import { useQuotations } from "@/lib/quotations-context";
import { useLeads } from "@/lib/leads-context";
import { getQuotationPrintUrl } from "@/lib/print-utils";
import { useStoreSettings } from "@/lib/store-settings";
import { sendQuotationOnWhatsApp } from "@/lib/quotation-send";
import {
  QUOTATION_STATUS_LABEL, quotationStatusTone, quotationSourceTone,
  QUOTATION_SOURCE_LABEL, formatIssueList,
  type QuotationStatus, type Quotation,
} from "@/lib/quotation-data";
import { QuickQuotationFlow } from "@/components/quotations/quick-quotation-flow";

/* Soft colour tints for the KPI boxes — tinted surface + matching icon chip +
   value colour, with a subtle hover lift. Kept restrained (RepairOX palette). */
const KPI_TONES = {
  indigo:  { card: "border-[#4361EE]/20 bg-[#EEF1FD] hover:border-[#4361EE]/40", chip: "bg-[#4361EE]/15 text-[#4361EE]", value: "text-[#2f3fb5]" },
  amber:   { card: "border-amber-300/60 bg-amber-50 hover:border-amber-400",     chip: "bg-amber-100 text-amber-700",   value: "text-amber-800" },
  emerald: { card: "border-emerald-300/60 bg-emerald-50 hover:border-emerald-400", chip: "bg-emerald-100 text-emerald-700", value: "text-emerald-800" },
  rose:    { card: "border-rose-300/60 bg-rose-50 hover:border-rose-400",         chip: "bg-rose-100 text-rose-700",     value: "text-rose-800" },
  sky:     { card: "border-sky-300/60 bg-sky-50 hover:border-sky-400",            chip: "bg-sky-100 text-sky-700",       value: "text-sky-800" },
} as const;

type StatusTab = "all" | QuotationStatus;
const STATUS_TABS: { label: string; value: StatusTab }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Rejected", value: "rejected" },
  { label: "Expired", value: "expired" },
];

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

export default function QuotationsPage() {
  const router = useRouter();
  const { can, currentUser } = usePermissions();
  const session = useSession();
  const { isAllShops, stores, getStore } = useStoreContext();
  const { settings } = useStoreSettings();
  const { quotations, hydrated, sendQuotation } = useQuotations();
  const { viewAsReadOnly } = useLeads();

  const canView = allow(can, CAP.quotation.view) || allow(can, CAP.quotation.viewAll);
  const canViewAll = allow(can, CAP.quotation.viewAll);
  const canSend = allow(can, CAP.quotation.send) && !viewAsReadOnly;
  // Quotations inherit the Lead's store; store filter/column only in Multi mode.
  const leadMode = useLeadStoreMode();
  const multiStore = isAllShops && stores.length > 1 && leadMode.isMulti;
  const [sendingId, setSendingId] = useState<string | null>(null);

  const handleSend = async (q: Quotation) => {
    setSendingId(q.id);
    const ok = await sendQuotation(q.id);
    const res = await sendQuotationOnWhatsApp({ ...q, sentAt: q.sentAt || new Date().toISOString() }, settings);
    setSendingId(null);
    if (ok) {
      if (res.noPhone) {
        toast.success("Quotation ready", { description: `${q.quotationNo} saved${res.pdfDownloaded ? " (PDF downloaded)" : ""}. Add a phone number to send on WhatsApp.` });
      } else {
        toast.success("Opening WhatsApp", { description: `${q.quotationNo} — PDF downloaded, attach it in the chat.` });
      }
    }
  };

  const [tab, setTab] = useState<StatusTab>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "lead" | "standalone">("all");
  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showQuick, setShowQuick] = useState(false);

  const meId = session.id || currentUser?.id || "";

  // Scope: without viewAll, a user sees only quotations they created or own.
  const scoped = useMemo(() => {
    if (canViewAll) return quotations;
    return quotations.filter((q) => q.createdBy === meId || q.salesAgentId === meId);
  }, [quotations, canViewAll, meId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((x) => {
      if (tab !== "all" && x.status !== tab) return false;
      if (sourceFilter !== "all" && x.source !== sourceFilter) return false;
      if (!matchesStoreSelection(x.branchId || null, storeFilter)) return false;
      if (q) {
        const hay = `${x.quotationNo} ${x.leadNo} ${x.customerName} ${x.salesAgentName} ${x.device} ${x.issue}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [scoped, tab, sourceFilter, storeFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  /* Frozen sticky header offset (pins the <thead> flush below the topbar +
     the sticky utility block). Same mechanism as Walk-In / Tickets / Deals. */
  const { wrapRef, theadTop } = useRoxStickyHeader();

  // Reset to page 1 when filters change.
  useMemo(() => { setPage(1); }, [tab, sourceFilter, storeFilter.join(","), query, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = useMemo(() => {
    const total = scoped.length;
    const sent = scoped.filter((q) => q.status === "sent").length;
    const draft = scoped.filter((q) => q.status === "draft").length;
    const accepted = scoped.filter((q) => q.status === "accepted").length;
    return { total, sent, draft, accepted };
  }, [scoped]);

  if (!canView) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Sales" title="Quotations" subtitle="Customer-facing quotations." />
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-12 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><Lock className="h-6 w-6" /></div>
          <p className="font-semibold">You don't have access to Quotations</p>
          <p className="text-sm text-muted-foreground">Ask an administrator for the View Quotations permission.</p>
        </div>
      </div>
    );
  }

  const statusCount = (t: StatusTab) => t === "all" ? scoped.length : scoped.filter((q) => q.status === t).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Quotations"
        subtitle="Customer-facing offers — generated from leads or sent as quick quotations."
        actions={
          !viewAsReadOnly && (
            <Can permission={CAP.quotation.create}>
              <Button size="sm" className="gap-1.5" onClick={() => setShowQuick(true)}>
                <Plus className="h-3.5 w-3.5" /> New Quotation
              </Button>
            </Can>
          )
        }
      />

      {/* KPI strip — soft colour-tinted boxes (one tone per metric) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          { label: "Total", value: String(kpis.total), icon: FileText, tone: "indigo" },
          { label: "Sent", value: String(kpis.sent), icon: Send, tone: "sky" },
          { label: "Draft", value: String(kpis.draft), icon: Clock, tone: "amber" },
          { label: "Accepted", value: String(kpis.accepted), icon: CheckCircle2, tone: "emerald" },
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

      {/* Status + source tabs (left) + Store/Search (right) — sticky block;
          the frozen table header (theadTop) pins flush beneath it. */}
      <div ref={wrapRef} className="sticky top-[60px] z-[6] -mt-2 bg-[hsl(var(--background))] pb-3 pt-2">
        <TableUtilityBar
          hideStore={!leadMode.isMulti}
          storeValue={storeFilter}
          onStoreChange={setStoreFilter}
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search number, customer, device, agent…"
          left={
            <div className="flex flex-wrap items-center gap-2">
              <div className="max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <SegmentedTabs
                  size="sm"
                  options={STATUS_TABS.map((t) => ({ label: `${t.label} (${statusCount(t.value)})`, value: t.value }))}
                  value={tab}
                  onChange={(v) => setTab(v as StatusTab)}
                />
              </div>
              <SegmentedTabs
                size="sm"
                options={[
                  { label: "All", value: "all" },
                  { label: "Lead", value: "lead" },
                  { label: "Quick", value: "standalone" },
                ]}
                value={sourceFilter}
                onChange={(v) => setSourceFilter(v as "all" | "lead" | "standalone")}
              />
            </div>
          }
        />
      </div>

      {/* ── Quotations table — canonical rox-table foundation (sharp 2px frame,
          frozen sticky header with the brand fill, visible row separators,
          detached pagination). Matches the Walk-In / Ticket / Deals tables. ── */}
      <div className="border-2 border-zinc-300 bg-card shadow-card">
        {/* [overflow-x:clip] (not auto/scroll) so the sticky <thead> freeze is
            never broken; table-fixed + <colgroup> keeps every column shrinking
            proportionally on zoom / small viewports instead of overflowing. */}
        <div className="[overflow-x:clip]">
          <table className="w-full table-fixed text-[14px]">
            <colgroup>
              <col className="w-[150px]" />{/* Quotation (+ lead) */}
              {multiStore && <col className="w-[130px]" />}{/* Store */}
              <col className="w-[22%]" />{/* Customer — flexible */}
              <col className="w-[24%]" />{/* Device / Service — flexible */}
              <col className="w-[18%]" />{/* Sales Agent — flexible */}
              <col className="w-[96px]" />{/* Source */}
              <col className="w-[120px]" />{/* Amount */}
              <col className="w-[120px]" />{/* Status */}
              <col className="w-[100px]" />{/* Date */}
              <col className="w-[110px]" />{/* Actions */}
            </colgroup>
            <thead style={{ top: theadTop }} className="sticky z-[5] bg-[#D6DDFB] border-b-2 border-[#4361EE]/40">
              <tr className="text-left text-[12px] font-bold uppercase tracking-wider text-[#4361EE] [&>th]:py-4 [&>th]:whitespace-nowrap">
                <th className="pl-5 pr-3">Quotation</th>
                {multiStore && <th className="px-3">Store</th>}
                <th className="px-3">Customer</th>
                <th className="px-3">Device / Service</th>
                <th className="px-3">Sales Agent</th>
                <th className="px-3">Source</th>
                <th className="px-3 text-right">Amount</th>
                <th className="pl-[47px] pr-3">Status</th>
                <th className="px-3 text-right">Date</th>
                <th className="px-3 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            {/* Rows match the canonical Walk-In / Ticket rhythm EXACTLY:
                h-[68px] height, border-t border-zinc-500 separators, py-4 cells. */}
            <tbody>
              {paged.map((q, i) => (
                <motion.tr
                  key={q.id}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(0.015 * i, 0.2) }}
                  onClick={() => router.push(`/leads/quotations/${q.id}`)}
                  className="rox-table-row group h-[68px] cursor-pointer border-t border-zinc-500 align-middle transition hover:bg-muted/40"
                >
                  <td className="pl-5 pr-3 py-4 align-middle">
                    <p className="font-semibold tabular-nums text-zinc-900">{q.quotationNo}</p>
                    {q.leadNo ? (
                      q.leadId ? (
                        <Link
                          href={`/leads/list?lead=${q.leadId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate text-[11px] font-medium text-[#4361EE] transition hover:underline"
                          title={`Open Lead ${q.leadNo}`}
                        >
                          Lead {q.leadNo}
                        </Link>
                      ) : (
                        <p className="truncate text-[11px] text-muted-foreground">Lead {q.leadNo}</p>
                      )
                    ) : null}
                  </td>
                  {multiStore && <td className="px-3 py-4 align-middle"><StoreContextCell store={getStore(q.branchId || null)} mode="stacked" /></td>}
                  <td className="px-3 py-4 align-middle">
                    <p className="truncate text-zinc-700">{q.customerName || "—"}</p>
                    {q.phone ? <p className="truncate text-[11px] text-muted-foreground">{q.phone}</p> : null}
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <p className="truncate text-zinc-700">{q.device || "—"}</p>
                    {q.issue ? <p className="truncate text-[11px] text-muted-foreground">{formatIssueList(q.issue)}</p> : null}
                  </td>
                  <td className="px-3 py-4 align-middle text-zinc-700"><span className="block truncate">{q.salesAgentName || "—"}</span></td>
                  <td className="px-3 py-4 align-middle">
                    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", quotationSourceTone(q.source))}>
                      {QUOTATION_SOURCE_LABEL[q.source]}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-right align-middle font-semibold tabular-nums text-[#4361EE]">{formatINR(q.amount)}</td>
                  <td className="pl-[47px] pr-3 py-4 align-middle">
                    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset", quotationStatusTone(q.status))}>
                      {QUOTATION_STATUS_LABEL[q.status]}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-right align-middle text-[11px] text-muted-foreground">{formatDay(q.createdAt)}</td>

                  {/* Quick actions — View · Send/Resend · Print. stopPropagation
                      so clicking an action doesn't also open the row's detail. */}
                  <td className="px-3 pr-4 py-4 align-middle" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() => router.push(`/leads/quotations/${q.id}`)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
                        title="View quotation"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      {canSend && (
                        <button
                          onClick={() => handleSend(q)}
                          disabled={sendingId === q.id}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE] disabled:opacity-50"
                          title={q.status === "sent" ? "Resend quotation" : "Send quotation"}
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => window.open(getQuotationPrintUrl(q.id), "_blank")}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]"
                        title="Print / PDF"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {hydrated && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><FileText className="h-6 w-6" /></div>
            <p className="font-semibold">No quotations yet</p>
            <p className="text-sm text-muted-foreground">Send a quotation from a lead, or create a Quick Quotation.</p>
          </div>
        )}
        {!hydrated && <div className="p-12 text-center text-sm text-muted-foreground">Loading quotations…</div>}
      </div>

      {/* Pagination — DETACHED below the table frame (canonical: 10/20/50/100). */}
      <Pagination
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={filtered.length}
        pageSizeOptions={[10, 20, 50, 100]}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        itemLabel="quotation"
      />

      <QuickQuotationFlow open={showQuick} onClose={() => setShowQuick(false)} />
    </div>
  );
}
