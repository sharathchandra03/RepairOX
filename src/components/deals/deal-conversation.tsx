"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Deal Conversation (shared, reusable).

   The INTERNAL approval conversation between the Sales Agent and the approver
   for one deal — NEVER a customer channel. Chronological + append-only (a
   comment is never overwritten or deleted). Posting a comment notifies the
   OTHER party through the shared notify() system (handled in the deals
   context's addDealComment).

   This is the ONE conversation thread implementation. It is reused by the Deal
   review panel (both the Deals queue drawer and the lead Deal panel) and the
   full-page View Lead Deal section, so the look + behaviour stay identical.

   It reads commentsForDeal / addDealComment / permissions itself via the
   existing hooks. Gated by CAP.deal.comment and the owner read-only lens: a
   view-tier / read-only user sees the thread but no composer.
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { MessageSquarePlus, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { CheckCircle2, XCircle, RefreshCw, Send, Ban } from "lucide-react";
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { formatINR, cn } from "@/lib/utils";
import { useDeals } from "@/lib/lead-deals-context";
import {
  type LeadDeal, type LeadDealComment, type LeadDealRevision, type DealRevisionAction,
  DEAL_REVISION_ACTION_LABEL, formatDealDiscount, dealCustomerPrice,
} from "@/lib/lead-deals";

function fmt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/* Restrained semantic tone + icon for a decision entry in the chat.
   Approved = emerald (strongly highlighted + the final amount), rejected =
   rose (strongly highlighted), changes requested = indigo (restrained),
   submitted/resubmitted = neutral "requested" (subtle). No neon. */
const REV_STYLE: Record<DealRevisionAction, { surface: string; chip: string; label: string; icon: React.ComponentType<{ className?: string }>; strong: boolean }> = {
  approved:          { surface: "border-emerald-200 bg-emerald-50", chip: "bg-emerald-100 text-emerald-700", label: "text-emerald-800", icon: CheckCircle2, strong: true },
  rejected:          { surface: "border-rose-200 bg-rose-50",       chip: "bg-rose-100 text-rose-700",       label: "text-rose-800",    icon: XCircle,      strong: true },
  changes_requested: { surface: "border-indigo-200 bg-indigo-50/70", chip: "bg-indigo-100 text-indigo-700", label: "text-indigo-800",  icon: RefreshCw,    strong: false },
  submitted:         { surface: "border-border bg-muted/30",        chip: "bg-zinc-100 text-zinc-600",       label: "text-zinc-700",    icon: Send,         strong: false },
  resubmitted:       { surface: "border-border bg-muted/30",        chip: "bg-zinc-100 text-zinc-600",       label: "text-zinc-700",    icon: RefreshCw,    strong: false },
  cancelled:         { surface: "border-border bg-muted/30",        chip: "bg-zinc-100 text-zinc-500",       label: "text-zinc-600",    icon: Ban,          strong: false },
};

type TimelineItem =
  | { kind: "comment"; at: number; comment: LeadDealComment }
  | { kind: "revision"; at: number; revision: LeadDealRevision };

export function DealConversation({
  deal,
  readOnly,
  heading = true,
  compact = false,
  threadMaxHeight,
}: {
  deal: LeadDeal;
  /** Honour the owner "view as agent" read-only lens — hides the composer. */
  readOnly?: boolean;
  /** Show the compact "Deal Conversation" header (default true). */
  heading?: boolean;
  /** Compact (popover) variant — denser thread + autofocus-friendly composer.
   *  Reuses the SAME thread + composer; it only tightens the max thread height. */
  compact?: boolean;
  /** Override the scrollable thread's max height (px). Defaults: 320 (full),
   *  240 (compact). */
  threadMaxHeight?: number;
}) {
  const { can } = usePermissions();
  const { addDealComment, commentsForDeal, revisionsForDeal } = useDeals();
  const comments = commentsForDeal(deal.id);
  const revisions = revisionsForDeal(deal.id);
  const canComment = allow(can, CAP.deal.comment) && !readOnly;

  // ONE chronological timeline — comments interleaved with decision revisions
  // (append-only display; a revision is never mutated). Approve/reject/final
  // amount are highlighted; normal comments keep the neutral card style.
  const timeline = React.useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...comments.map((c) => ({ kind: "comment" as const, at: new Date(c.createdAt).getTime(), comment: c })),
      ...revisions.map((r) => ({ kind: "revision" as const, at: new Date(r.createdAt).getTime(), revision: r })),
    ];
    return items.sort((a, b) => a.at - b.at);
  }, [comments, revisions]);

  const [newComment, setNewComment] = React.useState("");
  const [posting, setPosting] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message on mount and whenever the thread grows.
  const count = timeline.length;
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [count, deal.id]);

  const postComment = async () => {
    const text = newComment.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      await addDealComment(deal.id, text);
      setNewComment("");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-2.5">
      {heading && (
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <MessagesSquare className="h-3.5 w-3.5" /> Deal Conversation
        </p>
      )}

      {timeline.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-4 text-center text-[12px] text-muted-foreground">
          No messages yet. Discuss this discount request with the approver here.
        </p>
      ) : (
        <ol
          className="space-y-2 overflow-y-auto pr-0.5"
          style={{ maxHeight: threadMaxHeight ?? (compact ? 240 : 320) }}
        >
          {timeline.map((item) =>
            item.kind === "comment" ? (
              <li key={`c-${item.comment.id}`} className="flex gap-2.5">
                <Avatar name={item.comment.authorName || "User"} size={26} />
                <div className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-foreground">{item.comment.authorName || "User"}</span>
                    <span className="text-[10px] text-muted-foreground">{fmt(item.comment.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-zinc-700">{item.comment.body}</p>
                </div>
              </li>
            ) : (
              <DecisionEntry key={`r-${item.revision.id}`} deal={deal} revision={item.revision} />
            ),
          )}
          <div ref={endRef} />
        </ol>
      )}

      {canComment && (
        <div className="flex items-end gap-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Message the approver / agent…"
            className="min-h-[40px] text-[13px]"
          />
          <Button size="sm" className="gap-1.5" loading={posting} disabled={!newComment.trim()} onClick={postComment}>
            <MessageSquarePlus className="h-3.5 w-3.5" /> Post
          </Button>
        </div>
      )}
    </div>
  );
}

/* A decision entry in the chat timeline (approve / reject / changes / submit).
   Approved shows the FINAL APPROVED AMOUNT prominently (the customer price when
   the quote is known, else the discount). Rejected shows the reason. These are
   highlighted; requested/resubmitted stay subtle. Append-only display only. */
function DecisionEntry({ deal, revision: r }: { deal: LeadDeal; revision: LeadDealRevision }) {
  const style = REV_STYLE[r.action] ?? REV_STYLE.submitted;
  const Icon = style.icon;

  // The approved final amount, expressed as the customer price when the quote
  // is known (falls back to the raw discount otherwise). Requested entries show
  // the requested discount for context.
  const approvedPrice = r.action === "approved" ? dealCustomerPrice(deal.leadValue, r.approvedDiscount, r.approvedDiscountType) : null;
  const approvedDiscountStr = formatDealDiscount(r.approvedDiscount, r.approvedDiscountType);
  const requestedDiscountStr = formatDealDiscount(r.requestedDiscount, r.requestedDiscountType);

  return (
    <li className="flex gap-2.5">
      <span className={cn("mt-0.5 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-lg", style.chip)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className={cn("min-w-0 flex-1 rounded-lg border px-3 py-2", style.surface)}>
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-[12px] font-bold", style.label)}>
            {DEAL_REVISION_ACTION_LABEL[r.action]}
            {r.actorName ? <span className="font-normal text-muted-foreground"> · {r.actorName}</span> : null}
          </span>
          <span className="text-[10px] text-muted-foreground">{fmt(r.createdAt)}</span>
        </div>

        {r.action === "approved" && (
          <p className={cn("mt-1 text-[13px] font-extrabold tabular-nums", style.label)}>
            {approvedPrice != null ? formatINR(approvedPrice) : approvedDiscountStr}
            {approvedPrice != null && r.approvedDiscount != null && r.approvedDiscount > 0 && (
              <span className="ml-1.5 text-[11px] font-semibold text-emerald-700">(−{approvedDiscountStr})</span>
            )}
          </p>
        )}
        {(r.action === "submitted" || r.action === "resubmitted") && r.requestedDiscount != null && (
          <p className="mt-0.5 text-[11.5px] font-medium tabular-nums text-zinc-600">Requested {requestedDiscountStr} off</p>
        )}
        {r.comment && (
          <p className={cn("mt-0.5 whitespace-pre-wrap text-[12.5px]", style.strong ? style.label : "italic text-zinc-600")}>
            {style.strong ? r.comment : `“${r.comment}”`}
          </p>
        )}
      </div>
    </li>
  );
}
