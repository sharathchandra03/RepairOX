import { cn, initials } from "@/lib/utils";
import { TICKET_TYPE_CODE, type TicketType } from "@/lib/mock-data";

/**
 * Subtle, professional pastel palette per ticket intake type.
 * Kept low-intensity so the WK / PD / OS code stays easy on the eyes while
 * remaining readable and instantly distinguishable at a glance.
 *   Walk-In (WK) → light lavender/purple
 *   Pick-Up (PD) → light blue
 *   On-Site (OS) → light mint/teal
 */
const TICKET_TYPE_AVATAR_STYLE: Record<TicketType, string> = {
  walkin: "bg-violet-100 text-violet-700",
  pickup: "bg-sky-100 text-sky-700",
  onsite: "bg-teal-100 text-teal-700",
};

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
   * Saved ticket intake Type (Walk-In / Pick-Up / On-Site). When provided, the
   * avatar shows the type code (WK / PD / OS) with a subtle per-type color
   * instead of the customer initials. When null/undefined (e.g. legacy tickets
   * with no saved type), the avatar falls back to the existing initials style.
   */
  ticketType?: TicketType | null;
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

  // Ticket-type indicator: replace the initials with the WK / PD / OS code and
  // apply the subtle type color. Falls back to initials when no type is saved.
  if (ticketType) {
    return (
      <div
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide select-none ring-2 ring-white shadow-sm",
          TICKET_TYPE_AVATAR_STYLE[ticketType],
          className
        )}
        style={{ width: size, height: size, fontSize: size * 0.36 }}
        aria-label={name}
      >
        {TICKET_TYPE_CODE[ticketType]}
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
