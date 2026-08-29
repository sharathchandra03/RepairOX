import type { SVGProps } from "react";

/**
 * PushToInvoiceIcon — a professional "invoice document + forward arrow" glyph.
 *
 * Matches the RepairOX quick-action icon style: 24×24 viewBox, currentColor
 * stroke, 2px stroke weight, round joins/caps — visually consistent with the
 * lucide-react icons used elsewhere in the ticket row actions. The document
 * carries a rupee (₹) mark and a forward arrow exits to the right to signal
 * "push this ticket into an invoice".
 */
export function PushToInvoiceIcon({
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
      {/* Document body — left-aligned so the arrow has room to exit right */}
      <path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h7" />
      {/* Rupee (₹) mark inside the document */}
      <path d="M8 7h3" />
      <path d="M8 9.5h3" />
      <path d="M8 7c2 0 2 2.5 0 2.5H8.5l2 3" />
      {/* Forward arrow exiting the document to the right */}
      <path d="M14 16h7" />
      <path d="M18 13l3 3-3 3" />
    </svg>
  );
}
