"use client";

/**
 * DocumentLineage — compact "Document History / Linked Records" panel.
 *
 * Renders the RepairOX commercial lifecycle as a small chain of clickable
 * nodes (spec §63/§64/§65/§66):
 *
 *   Repair Estimate → Ticket → Proforma → Final Invoice
 *
 * Only the relationships that EXIST are shown. The node representing the record
 * currently being viewed is marked `current` (non-clickable, highlighted). It
 * is deliberately a small horizontal/vertical relationship — not a diagram —
 * and reuses the existing RepairOX visual language (indigo accent + zinc text).
 */

import { useRouter } from "next/navigation";
import { FileText, Ticket as TicketIcon, ReceiptText, Receipt, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type LineageKind = "estimate" | "ticket" | "proforma" | "invoice";

export type LineageNode = {
  kind: LineageKind;
  /** Human-readable document number, e.g. "KR-E-005" / "KR-P-INV002". */
  label: string;
  /** Route to open when clicked. Omit for the current record (non-clickable). */
  href?: string;
  /** True for the record currently being viewed (highlighted, not a link). */
  current?: boolean;
};

const KIND_META: Record<LineageKind, { title: string; icon: any }> = {
  estimate: { title: "Repair Estimate", icon: FileText },
  ticket: { title: "Ticket", icon: TicketIcon },
  proforma: { title: "Proforma Invoice", icon: ReceiptText },
  invoice: { title: "Final Invoice", icon: Receipt },
};

export function DocumentLineage({ nodes, className }: { nodes: LineageNode[]; className?: string }) {
  const router = useRouter();
  // A single node (just the record itself, no relationships) carries no useful
  // traceability — don't render an empty-looking panel.
  if (nodes.length <= 1) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-1 gap-y-2", className)}>
      {nodes.map((node, i) => {
        const meta = KIND_META[node.kind];
        const Icon = meta.icon;
        const clickable = !!node.href && !node.current;
        return (
          <div key={`${node.kind}-${node.label}-${i}`} className="flex items-center gap-1">
            <button
              type="button"
              disabled={!clickable}
              onClick={clickable ? () => router.push(node.href!) : undefined}
              title={`${meta.title}: ${node.label}`}
              className={cn(
                // Uniform node size: fixed min-width + fixed height so every
                // node reads as an equal-sized cell regardless of label length.
                "inline-flex h-11 min-w-[128px] items-center gap-2 rounded-lg px-3 text-left transition ring-1 ring-inset",
                node.current
                  ? "bg-[#EEF1FD] text-[#3347D6] ring-[#B3BFF6]/60 cursor-default"
                  : clickable
                    ? "bg-card text-foreground ring-border hover:bg-[#EEF1FD] hover:text-[#4361EE] cursor-pointer"
                    : "bg-muted/50 text-muted-foreground ring-border cursor-default",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[9px] font-semibold uppercase tracking-wider opacity-70">{meta.title}</span>
                <span className="truncate text-[12px] font-semibold">{node.label}</span>
              </span>
            </button>
            {i < nodes.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
            )}
          </div>
        );
      })}
    </div>
  );
}
