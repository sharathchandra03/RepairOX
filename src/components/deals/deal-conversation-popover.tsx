"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Deal Conversation Popover.

   A compact, in-place CHAT popover for the internal deal conversation, anchored
   to the trigger that opened it (the Last Action chat icon in the Lead Table,
   or the Deals Quick Actions comment button). It lets the user read new
   messages and reply RIGHT THERE — no navigation to View Lead.

   It REUSES the one shared <DealConversation> as its body (never a second
   thread UI). It is portalled to document.body and positioned from the
   trigger's live bounding rect, so the table's `overflow` never clips it
   (same portalling pattern as the sidebar tooltip / date-time dialog). Closes
   on outside-click and Esc.

   Opening the popover is the caller's cue to markSeen(deal.id); this component
   only renders the thread + composer.
   ────────────────────────────────────────────────────────────────────────── */

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, MessagesSquare } from "lucide-react";
import { DealConversation } from "@/components/deals/deal-conversation";
import type { LeadDeal } from "@/lib/lead-deals";

const PANEL_WIDTH = 340;
const GAP = 8;

export function DealConversationPopover({
  deal,
  anchorRect,
  readOnly,
  subtitle,
  onClose,
}: {
  deal: LeadDeal;
  /** The trigger's bounding rect (getBoundingClientRect), used to position. */
  anchorRect: DOMRect | null;
  /** Honour the owner read-only lens (hides the composer). */
  readOnly?: boolean;
  /** Optional subtitle line (e.g. "Deal DA-0001 · Lead L-1024"). */
  subtitle?: string;
  onClose: () => void;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  // Close on Esc.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined" || !anchorRect) return null;

  // Position the panel below the trigger, right-aligned to it, clamped into the
  // viewport so it is never cut off. Flip above when there isn't room below.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const estHeight = 420;
  const dropUp = vh - anchorRect.bottom < estHeight && anchorRect.top > vh - anchorRect.bottom;
  let left = anchorRect.right - PANEL_WIDTH;
  left = Math.max(8, Math.min(left, vw - PANEL_WIDTH - 8));
  const top = dropUp ? undefined : Math.min(anchorRect.bottom + GAP, vh - 8);
  const bottom = dropUp ? vh - anchorRect.top + GAP : undefined;

  return createPortal(
    <AnimatePresence>
      <>
        {/* Outside-click shield. */}
        <div
          className="fixed inset-0 z-[90]"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        />
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: dropUp ? 6 : -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: dropUp ? 6 : -6, scale: 0.98 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Deal conversation"
          style={{ position: "fixed", top, bottom, left, width: PANEL_WIDTH }}
          className="z-[100] flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_50px_-18px_rgba(20,30,80,0.4)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-[#F7F8FD] px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]">
                <MessagesSquare className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-foreground">Deal Conversation</p>
                {subtitle && <p className="truncate text-[10.5px] text-muted-foreground">{subtitle}</p>}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close conversation"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <DealConversation deal={deal} readOnly={readOnly} heading={false} compact threadMaxHeight={300} />
          </div>
        </motion.div>
      </>
    </AnimatePresence>,
    document.body,
  );
}
