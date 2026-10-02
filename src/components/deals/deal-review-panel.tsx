"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Deal review + approval panel.

   The concise approval surface for a manager/owner: customer / agent / lead /
   value / requested discount / reason, the Approve · Request Changes · Reject
   actions (each gated by capability + the self-approval rule), the internal
   comment thread, and the full revision history. Reused by the Deal queue page
   and the lead detail Deal panel.
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import Link from "next/link";
import {
  Check, X, MessageSquarePlus, Clock, User, Tag, FileText, BadgePercent,
  CheckCircle2, XCircle, RefreshCw, Ban, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/tabs";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatINR } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { useDeals } from "@/lib/lead-deals-context";
import {
  type LeadDeal, type DealRevisionAction,
  DEAL_STATUS_LABEL, DEAL_REVISION_ACTION_LABEL, dealStatusTone, formatDealDiscount, dealAgeLabel,
  canDecideDeal, canAgentResubmit, isOpenDealStatus,
} from "@/lib/lead-deals";

function fmt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const REV_ICON: Record<DealRevisionAction, React.ComponentType<{ className?: string }>> = {
  submitted: Send,
  resubmitted: RefreshCw,
  changes_requested: RefreshCw,
  approved: CheckCircle2,
  rejected: XCircle,
  cancelled: Ban,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[13px] font-medium text-foreground">{children}</p>
    </div>
  );
}

export function DealReviewPanel({
  deal, onResubmit, compact,
}: {
  deal: LeadDeal;
  /** Called when the agent chooses to revise & resubmit (opens the request modal). */
  onResubmit?: (deal: LeadDeal) => void;
  compact?: boolean;
}) {
  const { can, currentUser } = usePermissions();
  const meId = currentUser?.id || "";
  const isOwner = can("full_access");
  const { approveDeal, rejectDeal, requestChanges, cancelDeal, addDealComment, commentsForDeal, revisionsForDeal } = useDeals();

  const canApprove = allow(can, CAP.deal.approve);
  const canReject = allow(can, CAP.deal.reject);
  const canRequestChanges = allow(can, CAP.deal.requestChanges);
  const canComment = allow(can, CAP.deal.comment);
  // A top-authority owner may decide a deal they raised; everyone else can't.
  const isDecider = canDecideDeal(deal, meId, isOwner) && (canApprove || canReject || canRequestChanges);
  const isSelfBlocked = deal.createdBy === meId && !isOwner && isOpenDealStatus(deal.status) && (canApprove || canReject || canRequestChanges);
  const isMine = deal.createdBy === meId || deal.salesAgentId === meId;

  const comments = commentsForDeal(deal.id);
  const revisions = revisionsForDeal(deal.id);

  // Decision form state
  const [mode, setMode] = React.useState<null | "approve" | "reject" | "changes">(null);
  const [apprType, setApprType] = React.useState<"amount" | "percent">(deal.requestedDiscountType);
  const [apprValue, setApprValue] = React.useState<string>(deal.requestedDiscount == null ? "" : String(deal.requestedDiscount));
  const [decisionComment, setDecisionComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [newComment, setNewComment] = React.useState("");

  React.useEffect(() => {
    setApprType(deal.requestedDiscountType);
    setApprValue(deal.requestedDiscount == null ? "" : String(deal.requestedDiscount));
    setMode(null); setDecisionComment("");
  }, [deal.id, deal.revision, deal.requestedDiscount, deal.requestedDiscountType]);

  const act = async () => {
    setBusy(true);
    try {
      if (mode === "approve") {
        await approveDeal(deal.id, {
          approvedDiscount: apprValue.trim() === "" ? deal.requestedDiscount : Number(apprValue.replace(/[^0-9.]/g, "")),
          approvedDiscountType: apprType,
          comment: decisionComment.trim() || undefined,
        });
      } else if (mode === "reject") {
        if (!decisionComment.trim()) return;
        await rejectDeal(deal.id, decisionComment.trim());
      } else if (mode === "changes") {
        if (!decisionComment.trim()) return;
        await requestChanges(deal.id, decisionComment.trim());
      }
      setMode(null); setDecisionComment("");
    } finally { setBusy(false); }
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    await addDealComment(deal.id, newComment.trim());
    setNewComment("");
  };

  const requested = formatDealDiscount(deal.requestedDiscount, deal.requestedDiscountType);
  const approved = formatDealDiscount(deal.approvedDiscount, deal.approvedDiscountType);

  return (
    <div className="space-y-4">
      {/* ── Hero: the discount request at a glance ── */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-[#EEF1FD]/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset", dealStatusTone(deal.status))}>
              {DEAL_STATUS_LABEL[deal.status]}
            </span>
            <span className="text-[11px] font-medium text-muted-foreground">Revision {deal.revision}</span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" /> {dealAgeLabel(deal.createdAt)} old</span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4">
          <div className="rounded-xl border border-[#B3BFF6]/50 bg-[#EEF1FD]/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4361EE]/70">Requested</p>
            <p className="mt-0.5 font-display text-xl font-extrabold tabular-nums text-[#4361EE]">{requested}</p>
          </div>
          <div className={cn("rounded-xl border p-3", deal.status === "approved" ? "border-emerald-200 bg-emerald-50/60" : "border-border bg-muted/20")}>
            <p className={cn("text-[10px] font-semibold uppercase tracking-wider", deal.status === "approved" ? "text-emerald-700/80" : "text-muted-foreground")}>Approved</p>
            <p className={cn("mt-0.5 font-display text-xl font-extrabold tabular-nums", deal.status === "approved" ? "text-emerald-700" : "text-zinc-300")}>{deal.status === "approved" ? approved : "—"}</p>
          </div>
        </div>
      </div>

      {/* ── Decision actions (approver, open deal) — PROMINENT, at the top ── */}
      {isDecider && (
        <div className="rounded-2xl border-2 border-[#4361EE]/20 bg-[#EEF1FD]/30 p-3">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/80">Review this request</p>
          {mode === null ? (
            <div className="grid grid-cols-3 gap-2">
              {canApprove && <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setMode("approve")}><Check className="h-3.5 w-3.5" /> Approve</Button>}
              {canRequestChanges && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setMode("changes")}><RefreshCw className="h-3.5 w-3.5" /> Changes</Button>}
              {canReject && <Button size="sm" variant="outline" className="gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => setMode("reject")}><X className="h-3.5 w-3.5" /> Reject</Button>}
            </div>
          ) : (
            <div className="space-y-3 rounded-xl bg-card p-3">
              {mode === "approve" && (
                <div className="space-y-1.5">
                  <Label>Approved Discount</Label>
                  <div className="flex items-stretch gap-2">
                    <SegmentedTabs size="sm" options={[{ label: "%", value: "percent" }, { label: "₹", value: "amount" }]} value={apprType} onChange={(v) => setApprType(v as "amount" | "percent")} />
                    <input value={apprValue} onChange={(e) => setApprValue(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="e.g. 15" className="h-9 flex-1 rounded-lg border border-input bg-card px-3 text-[13px] outline-none focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15" />
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{mode === "approve" ? "Comment (optional)" : mode === "reject" ? "Rejection reason (required)" : "What should the agent change? (required)"}</Label>
                <Textarea
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  placeholder={mode === "approve" ? "e.g. Proceed with 15% maximum discount." : mode === "reject" ? "e.g. Cannot offer a discount on this item." : "e.g. Can approve a maximum of 10%; ask the customer if they can proceed."}
                  className="min-h-[72px] text-[13px]"
                  autoFocus
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setMode(null); setDecisionComment(""); }}>Cancel</Button>
                <Button
                  size="sm"
                  className={cn("gap-1.5", mode === "approve" && "bg-emerald-600 hover:bg-emerald-700", mode === "reject" && "bg-rose-600 hover:bg-rose-700")}
                  loading={busy}
                  disabled={(mode === "reject" || mode === "changes") && !decisionComment.trim()}
                  onClick={act}
                >
                  {mode === "approve" ? "Confirm Approval" : mode === "reject" ? "Confirm Rejection" : "Send Changes Request"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Request details ── */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-border bg-muted/20 p-4">
        <Field label="Customer">
          <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-muted-foreground" />{deal.customerName || "—"}</span>
        </Field>
        <Field label="Sales Agent">{deal.salesAgentName || "—"}</Field>
        <Field label="Lead">
          <Link href={`/leads/list?lead=${deal.leadId}`} className="text-[#4361EE] hover:underline tabular-nums">{deal.leadNo}</Link>
        </Field>
        <Field label="Lead Value">{deal.leadValue == null ? "—" : formatINR(deal.leadValue)}</Field>
        <div className="col-span-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reason for discount</p>
          <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-foreground">{deal.requestedReason || "—"}</p>
        </div>
      </div>

      {/* ── Decision outcome banner (approved / rejected / changes requested) ── */}
      {deal.status === "approved" && deal.approvalComment && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Approval comment</p>
          <p className="mt-0.5 text-[12.5px] text-emerald-900">{deal.approvalComment}</p>
          {deal.approverName && <p className="mt-1 text-[11px] text-emerald-700/80">by {deal.approverName} · {fmt(deal.decidedAt)}</p>}
        </div>
      )}
      {deal.status === "rejected" && deal.rejectionReason && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Rejection reason</p>
          <p className="mt-0.5 text-[12.5px] text-rose-900">{deal.rejectionReason}</p>
          {deal.approverName && <p className="mt-1 text-[11px] text-rose-700/80">by {deal.approverName} · {fmt(deal.decidedAt)}</p>}
        </div>
      )}
      {deal.status === "changes_requested" && deal.approvalComment && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Changes requested</p>
          <p className="mt-0.5 text-[12.5px] text-indigo-900">{deal.approvalComment}</p>
          {deal.approverName && <p className="mt-1 text-[11px] text-indigo-700/80">by {deal.approverName} · {fmt(deal.decidedAt)}</p>}
        </div>
      )}

      {/* ── Agent resubmit (own deal, changes requested) ── */}
      {canAgentResubmit(deal, meId) && onResubmit && (
        <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
          <p className="text-[12.5px] text-indigo-900">The manager asked for changes. Revise and resubmit.</p>
          <Button size="sm" className="gap-1.5" onClick={() => onResubmit(deal)}><RefreshCw className="h-3.5 w-3.5" /> Revise & Resubmit</Button>
        </div>
      )}

      {/* Self-approval notice — only when the viewer is blocked (not an owner) */}
      {isSelfBlocked && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-inset ring-amber-200">
          You submitted this request, so you can't approve it yourself. Another authorized approver must review it.
        </p>
      )}

      {/* ── Internal comment thread ── */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Approval Conversation</p>
        {comments.length === 0 && <p className="text-[12px] text-muted-foreground">No comments yet.</p>}
        <ol className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={c.authorName || "User"} size={26} />
              <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-foreground">{c.authorName || "User"}</span>
                  <span className="text-[10px] text-muted-foreground">{fmt(c.createdAt)}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-zinc-700">{c.body}</p>
              </div>
            </li>
          ))}
        </ol>
        {canComment && (
          <div className="flex items-end gap-2">
            <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment…" className="min-h-[40px] text-[13px]" />
            <Button size="sm" className="gap-1.5" disabled={!newComment.trim()} onClick={postComment}><MessageSquarePlus className="h-3.5 w-3.5" /> Post</Button>
          </div>
        )}
      </div>

      {/* ── Revision / approval history ── */}
      {revisions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Approval History</p>
          <ol className="relative space-y-2.5 pl-1">
            {revisions.map((r, i) => {
              const Icon = REV_ICON[r.action] ?? FileText;
              const last = i === revisions.length - 1;
              return (
                <li key={r.id} className="relative flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]"><Icon className="h-3.5 w-3.5" /></span>
                    {!last && <span className="mt-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className="min-w-0 pb-1">
                    <p className="text-[12.5px] font-medium text-foreground">
                      Revision {r.revision} · {DEAL_REVISION_ACTION_LABEL[r.action]}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDealDiscount(r.action === "approved" ? r.approvedDiscount : r.requestedDiscount, r.action === "approved" ? r.approvedDiscountType : r.requestedDiscountType)}
                      {r.actorName ? ` · ${r.actorName}` : ""}
                    </p>
                    {r.comment && <p className="mt-0.5 text-[11px] italic text-zinc-500">“{r.comment}”</p>}
                    <p className="text-[10px] text-muted-foreground/80">{fmt(r.createdAt)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
