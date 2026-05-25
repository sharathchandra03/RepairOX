import { cn } from "@/lib/utils";

export function Logo({ className, mark = false }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="relative grid h-8 w-8 place-items-center rounded-xl brand-gradient shadow-glow">
        <span className="absolute inset-0 rounded-xl ring-1 ring-white/30" />
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white">
          <path
            d="M5 13l3 3 4-6 3 4 4-7"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {!mark && (
        <span className="font-display text-[17px] font-semibold tracking-tight">
          Repair<span className="brand-gradient-text">OX</span>
        </span>
      )}
    </span>
  );
}
