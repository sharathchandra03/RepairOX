import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  src,
  size = 36,
  className,
  tone = "brand",
}: {
  name: string;
  /** Optional profile picture (data URL or image URL). Falls back to initials. */
  src?: string | null;
  size?: number;
  className?: string;
  tone?: "brand" | "muted";
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
