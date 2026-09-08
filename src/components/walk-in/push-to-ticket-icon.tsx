import type { SVGProps } from "react";

/**
 * PushToTicketIcon — a "repair ticket + forward arrow" glyph.
 *
 * Mirrors the RepairOX quick-action icon style used by PushToInvoiceIcon
 * (24×24 viewBox, currentColor stroke, 2px weight, round joins) so the Walk-In
 * "Push to Ticket" action reads as the sibling of the ticket's "Push to
 * Invoice" action — same concept, different destination glyph. The document
 * carries a small wrench/repair mark and a forward arrow exits to the right to
 * signal "push this walk-in into a ticket".
 */
export function PushToTicketIcon({
  className,
  strokeWidth = 2,
  ...props
}: SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Ticket body — left-aligned so the arrow has room to exit right */}
      <path d="M13 4H5a1 1 0 0 0-1 1v3a2 2 0 0 1 0 4v3a1 1 0 0 0 1 1h8" />
      {/* Perforation line on the ticket */}
      <path d="M10 4v14" strokeDasharray="1.5 2" />
      {/* Forward arrow exiting the ticket to the right */}
      <path d="M14 12h7" />
      <path d="M18 9l3 3-3 3" />
    </svg>
  );
}
