import { cn, initials } from "@/lib/utils";
import { TICKET_TYPE_CODE, type TicketType } from "@/lib/mock-data";

/**
 * Two-colour identity/type avatar language shared across Tickets and Invoices.
 * There are intentionally ONLY two colours — no purple/green/teal variants:
 *   • Type PROVIDED (Walk-In / Pick-Up / On-Site) → the SAME dark blue used by
 *     the customer/name avatar (brand indigo #4361EE), white code text so
 *     WK / PD / OS stays clearly readable.
 *   • Type NOT PROVIDED (N/A) → the existing light-blue (sky) treatment.
 */
const TICKET_TYPE_AVATAR_PROVIDED = "bg-[#4361EE] text-white";
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
          isProvided ? TICKET_TYPE_AVATAR_PROVIDED : TICKET_TYPE_AVATAR_NONE,
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
