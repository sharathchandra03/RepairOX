import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  size = 36,
  className,
  tone = "brand",
}: {
  name: string;
  size?: number;
  className?: string;
  tone?: "brand" | "muted";
}) {
  const bg = tone === "brand" ? "brand-gradient text-white" : "bg-muted text-foreground";
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold tracking-wide select-none ring-2 ring-white shadow-sm",
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
