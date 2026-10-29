import { cn, initials } from "@/lib/utils";
import { TICKET_TYPE_CODE, type TicketType } from "@/lib/mock-data";

/**
 * Type avatar language shared across Tickets and Invoices.
 *   • Type PROVIDED (Walk-In / Pick-Up / On-Site) → each intake type gets its
 *     OWN shade of blue so WK and OS no longer blend into the RepairOX brand
 *     blue. Pick-Up keeps the brand indigo (#4361EE); Walk-In uses a deeper
 *     navy and On-Site a brighter cyan-blue — all with white code text.
 *   • Type NOT PROVIDED (N/A) → the existing light-blue (sky) treatment (kept).
 */
const TICKET_TYPE_AVATAR_COLOR: Record<TicketType, string> = {
  walkin: "bg-[#1E3A8A] text-white",
  pickup: "bg-[#4361EE] text-white",
  onsite: "bg-[#0EA5E9] text-white",
};
const TICKET_TYPE_AVATAR_NONE = "bg-sky-100 text-sky-700";

export function Avatar({
  name,
  src,
  size = 36,
  className,
  tone = "brand",
  ticketType,
}: {
  name: string;
  /** Optional profile picture (data URL or image URL). Falls back to initials. */
  src?: string | null;
  size?: number;
  className?: string;
  tone?: "brand" | "muted";
  /**
   * Saved ticket intake Type (Walk-In / Pick-Up / On-Site). Controls the
   * two-colour type avatar shared across Tickets and Invoices:
   *   • A real type (walkin/pickup/onsite) → dark-blue avatar showing WK/PD/OS.
   *   • "na" → light-blue avatar showing "N/A" (type not provided). Callers that
   *     want the type avatar but have no saved type pass `getTicketType(t) ?? "na"`.
   *   • undefined → not a type-avatar context; falls back to customer initials.
   */
  ticketType?: TicketType | "na" | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={cn(
          "inline-block shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm",
          className
        )}
        style={{ width: size, height: size }}
      />
    );
  }

  // Ticket-type indicator: replace the initials with the WK / PD / OS code (or
  // N/A) using the shared two-colour language. Only rendered when the caller
  // opts into the type avatar by passing `ticketType` (including "na").
  if (ticketType != null) {
    const isProvided = ticketType !== "na";
    const code = isProvided ? TICKET_TYPE_CODE[ticketType] : "N/A";
    return (
      <div
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide select-none ring-2 ring-white shadow-sm",
          isProvided ? TICKET_TYPE_AVATAR_COLOR[ticketType] : TICKET_TYPE_AVATAR_NONE,
          className
        )}
        style={{ width: size, height: size, fontSize: size * (isProvided ? 0.36 : 0.3) }}
        aria-label={isProvided ? `${name} — ${TICKET_TYPE_CODE[ticketType]}` : `${name} — type not provided`}
      >
        {code}
      </div>
    );
  }

  const bg = tone === "brand" ? "brand-gradient text-white" : "bg-muted text-foreground";
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide select-none ring-2 ring-white shadow-sm",
        bg,
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-label={name}
    >
      {initials(name)}
    </div>
  );
}
