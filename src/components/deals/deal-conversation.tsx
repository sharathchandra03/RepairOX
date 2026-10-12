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
import { usePermissions } from "@/lib/permissions-context";
import { CAP, allow } from "@/lib/capabilities";
import { useDeals } from "@/lib/lead-deals-context";
import type { LeadDeal } from "@/lib/lead-deals";

function fmt(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function DealConversation({
  deal,
  readOnly,
  heading = true,
}: {
  deal: LeadDeal;
  /** Honour the owner "view as agent" read-only lens — hides the composer. */
  readOnly?: boolean;
  /** Show the compact "Deal Conversation" header (default true). */
  heading?: boolean;
}) {
  const { can } = usePermissions();
  const { addDealComment, commentsForDeal } = useDeals();
  const comments = commentsForDeal(deal.id);
  const canComment = allow(can, CAP.deal.comment) && !readOnly;

  const [newComment, setNewComment] = React.useState("");
  const [posting, setPosting] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message on mount and whenever the thread grows.
  const count = comments.length;
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

      {comments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-4 text-center text-[12px] text-muted-foreground">
          No messages yet. Discuss this discount request with the approver here.
        </p>
      ) : (
        <ol className="max-h-[320px] space-y-2 overflow-y-auto pr-0.5">
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
