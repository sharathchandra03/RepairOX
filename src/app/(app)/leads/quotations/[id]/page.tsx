"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — View Quotation (single-record detail page).

   Follows the view-detail-pages standard: header + summary cards, then a
   `grid lg:grid-cols-3` with a `lg:col-span-2` left column of DetailSections
   and a right <PinnedRail> (Quick Actions → Activity Timeline → Internal Note).
   Renders the canonical quotation record (never a mock), gated by
   CAP.quotation.view / viewAll + store scope.
   ────────────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, FileText, User, Phone, Smartphone, Wrench, Shield, IndianRupee,
  Send, Eye, Printer, Trash2, CheckCircle2, XCircle, Clock, MoreHorizontal,
  Tag, Calendar, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PinnedRail } from "@/components/common/pinned-rail";
import { toast } from "@/components/ui/toaster";
import { usePermissions } from "@/lib/permissions-context";
import { useSession } from "@/lib/use-session";
import { useStoreContext } from "@/lib/store-context";
import { CAP, allow } from "@/lib/capabilities";
import { cn, formatINR } from "@/lib/utils";
import { useQuotations } from "@/lib/quotations-context";
import { getQuotationPrintUrl } from "@/lib/print-utils";
import { useStoreSettings } from "@/lib/store-settings";
import { sendQuotationOnWhatsApp } from "@/lib/quotation-send";
import {
  QUOTATION_STATUS_LABEL, quotationStatusTone, QUOTATION_SOURCE_LABEL,
  warrantyLabel, formatIssueList, type QuotationStatus,
} from "@/lib/quotation-data";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
function fmtDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

export default function QuotationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { can, currentUser } = usePermissions();
  const session = useSession();
  const { getStore, isAllShops, stores } = useStoreContext();
  const { settings } = useStoreSettings();
  const { quotationById, sendQuotation, setQuotationStatus, deleteQuotation } = useQuotations();

  const id = decodeURIComponent((params.id as string) || "");
  const quotation = quotationById(id);

  const [showDelete, setShowDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const canView = allow(can, CAP.quotation.view) || allow(can, CAP.quotation.viewAll);
  const canViewAll = allow(can, CAP.quotation.viewAll);
  const canSend = allow(can, CAP.quotation.send);
  const canEdit = allow(can, CAP.quotation.create);
  const canDelete = allow(can, CAP.quotation.delete);

  const meId = session.id || currentUser?.id || "";

  // Scope: a non-viewAll user may only open quotations they created / own.
  const scopeOk = quotation
    ? canViewAll || quotation.createdBy === meId || quotation.salesAgentId === meId
    : true;

  if (!canView || (quotation && !scopeOk)) {
    return (
      <div className="space-y-5">
        <PageBack router={router} />
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-12 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><Lock className="h-6 w-6" /></div>
          <p className="font-semibold">You don't have access to this quotation</p>
        </div>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="space-y-5">
        <PageBack router={router} />
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-12 text-center shadow-card">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><FileText className="h-6 w-6" /></div>
          <p className="font-semibold">Quotation not found</p>
          <Button variant="outline" size="sm" onClick={() => router.push("/leads/quotations")}>Back to Quotations</Button>
        </div>
      </div>
    );
  }

  const q = quotation;
  const warranty = warrantyLabel(q.warranty);
  const store = getStore(q.branchId || null);
  const multiStore = isAllShops && stores.length > 1;

  const handleSend = async () => {
    setBusy(true);
    const ok = await sendQuotation(q.id);
    const res = await sendQuotationOnWhatsApp({ ...q, sentAt: q.sentAt || new Date().toISOString() }, settings);
    setBusy(false);
    if (ok) {
      if (res.noPhone) {
        toast.success("Quotation ready", { description: `${q.quotationNo} saved${res.pdfDownloaded ? " (PDF downloaded)" : ""}. Add a phone number to send on WhatsApp.` });
      } else {
        toast.success("Opening WhatsApp", { description: `${q.quotationNo} — PDF downloaded, attach it in the chat.` });
      }
    }
  };
  const handleStatus = async (status: QuotationStatus) => {
    setBusy(true);
    await setQuotationStatus(q.id, status);
    setBusy(false);
  };
  const handleDelete = async () => {
    setBusy(true);
    const ok = await deleteQuotation(q.id);
    setBusy(false);
    setShowDelete(false);
    if (ok) router.push("/leads/quotations");
  };

  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <button onClick={() => router.push("/leads/quotations")} className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-card transition hover:bg-[#EEF1FD] hover:text-[#4361EE]">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-extrabold tabular-nums">{q.quotationNo}</h1>
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", quotationStatusTone(q.status))}>
                  {QUOTATION_STATUS_LABEL[q.status]}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {QUOTATION_SOURCE_LABEL[q.source]}
                {q.leadNo ? (
                  <>
                    {" · "}
                    {q.leadId ? (
                      <Link href={`/leads/list?lead=${q.leadId}`} className="font-medium text-[#4361EE] transition hover:underline">
                        Lead {q.leadNo}
                      </Link>
                    ) : (
                      <>Lead {q.leadNo}</>
                    )}
                  </>
                ) : null}
                {" · "}
                {fmtDateShort(q.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => window.open(getQuotationPrintUrl(q.id), "_blank")}>
              <Eye className="h-3.5 w-3.5" /> Preview
            </Button>
            {canSend && (
              <Button size="sm" className="rounded-full gap-1.5" disabled={busy} onClick={handleSend}>
                <Send className="h-3.5 w-3.5" /> {q.status === "sent" ? "Resend" : "Send"}
              </Button>
            )}
            <Dropdown
              align="right"
              width="w-52"
              trigger={({ toggle }) => (
                <button onClick={toggle} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-card transition hover:bg-[#EEF1FD] hover:text-[#4361EE]">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              )}
            >
              {(close) => (
                <>
                  <MenuItem icon={Printer} onClick={() => { window.open(getQuotationPrintUrl(q.id), "_blank"); close(); }}>Print / PDF</MenuItem>
                  {canEdit && <MenuItem icon={CheckCircle2} onClick={() => { void handleStatus("accepted"); close(); }}>Mark Accepted</MenuItem>}
                  {canEdit && <MenuItem icon={XCircle} onClick={() => { void handleStatus("rejected"); close(); }}>Mark Rejected</MenuItem>}
                  {canEdit && <MenuItem icon={Clock} onClick={() => { void handleStatus("expired"); close(); }}>Mark Expired</MenuItem>}
                  {canDelete && <div className="my-1 border-t border-border" />}
                  {canDelete && <MenuItem icon={Trash2} danger onClick={() => { setShowDelete(true); close(); }}>Delete Quotation</MenuItem>}
                </>
              )}
            </Dropdown>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Customer" value={q.customerName || "—"} icon={User} />
          <SummaryCard label="Phone" value={q.phone || "—"} icon={Phone} />
          <SummaryCard label="Device" value={q.device || "—"} icon={Smartphone} />
          <SummaryCard label="Amount" value={formatINR(q.amount)} icon={IndianRupee} />
          <SummaryCard label="Warranty" value={warranty || "—"} icon={Shield} />
          <SummaryCard label="Sales Agent" value={q.salesAgentName || "—"} icon={User} />
        </div>
      </div>

      {/* ─── Main Content Grid ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Lineage */}
          {q.leadNo ? (
            <DetailSection title="Linked Records" icon={Tag}>
              <Link href={`/leads/list?lead=${q.leadId}`} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-[#4361EE] transition hover:bg-[#EEF1FD]">
                <FileText className="h-4 w-4" /> Lead {q.leadNo}
              </Link>
            </DetailSection>
          ) : null}

          {/* Customer */}
          <DetailSection title="Customer Information" icon={User}>
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Name" value={q.customerName || "—"} />
              <DetailField label="Phone" value={q.phone || "—"} />
              <DetailField label="Email" value={q.email || "—"} />
              <DetailField label="Location" value={q.location || "—"} />
            </div>
          </DetailSection>

          {/* Device & Service */}
          <DetailSection title="Device & Service" icon={Wrench}>
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <DetailField label="Device" value={q.device || "—"} />
              <DetailField label="Service / Issue" value={formatIssueList(q.issue) || "—"} />
              <DetailField label="Warranty" value={warranty || "—"} />
              <DetailField label="Valid Until" value={q.validUntil ? fmtDateShort(q.validUntil) : "—"} />
            </div>
          </DetailSection>

          {/* Quoted Items */}
          <DetailSection title={`Quoted Items (${q.items.length})`} icon={FileText}>
            {q.items.length > 0 ? (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 text-left">Item / Service</th>
                      <th className="px-2 py-2 text-center">Qty</th>
                      <th className="px-2 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.items.map((it) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground">{it.name}</p>
                          {it.description ? <p className="text-[11px] text-muted-foreground">{it.description}</p> : null}
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums">{it.qty}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatINR(it.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatINR(it.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {q.discount > 0 && (
                      <tr className="border-t border-border">
                        <td colSpan={3} className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Discount</td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-600">-{formatINR(q.subtotal - q.amount)}</td>
                      </tr>
                    )}
                    <tr className="border-t border-border bg-muted/30">
                      <td colSpan={3} className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quotation Total</td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums text-[#4361EE]">{formatINR(q.amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No itemized lines — offer total {formatINR(q.amount)}.</p>
            )}
            {q.note ? <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">{q.note}</p> : null}
          </DetailSection>
        </div>

        {/* Right Column — pinned rail */}
        <PinnedRail>
          {/* Quick Actions */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <button onClick={() => window.open(getQuotationPrintUrl(q.id), "_blank")} className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:bg-[#EEF1FD]">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Eye className="h-4 w-4" /></span>
                <div><p className="text-sm font-medium">Preview / Print</p><p className="text-[11px] text-muted-foreground">Open the document</p></div>
              </button>
              {canSend && (
                <button onClick={handleSend} disabled={busy} className="flex w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition hover:bg-[#EEF1FD] disabled:opacity-60">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Send className="h-4 w-4" /></span>
                  <div><p className="text-sm font-medium">{q.status === "sent" ? "Resend" : "Send"} Quotation</p><p className="text-[11px] text-muted-foreground">To {q.email || q.phone || "customer"}</p></div>
                </button>
              )}
            </div>
          </div>

          {/* Quotation details */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quotation Details</h3>
            <div className="space-y-3">
              <RailField label="Created" value={fmtDate(q.createdAt)} icon={Calendar} />
              {q.sentAt ? <RailField label="Sent" value={fmtDate(q.sentAt)} icon={Send} /> : null}
              <RailField label="Sales Agent" value={q.salesAgentName || "—"} icon={User} />
              {multiStore && store ? <RailField label="Store" value={store.name} icon={Tag} /> : null}
              <RailField label="Source" value={QUOTATION_SOURCE_LABEL[q.source]} icon={FileText} />
            </div>
          </div>
        </PinnedRail>
      </div>

      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete quotation?"
        description={`Delete ${q.quotationNo}. This does not affect the lead, customer or any invoice.`}
        confirmLabel="Delete"
      />
    </div>
  );
}

/* ─── Sub-components (canonical view-detail markup) ───────────────────── */

function PageBack({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <button onClick={() => router.push("/leads/quotations")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[#4361EE]">
      <ArrowLeft className="h-4 w-4" /> Back to Quotations
    </button>
  );
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-sm transition hover:border-[#B3BFF6]/50">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-sm font-semibold truncate">{value}</p>
        </div>
      </div>
    </div>
  );
}

function DetailSection({ title, icon: Icon, children, action }: { title: string; icon: any; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 scroll-mt-24">
      <div className="flex items-center justify-between gap-2.5 mb-5 pb-4 border-b border-border/70">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function DetailField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm", highlight ? "font-bold text-rose-600" : "font-medium text-foreground")}>{value}</p>
    </div>
  );
}

function RailField({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}
