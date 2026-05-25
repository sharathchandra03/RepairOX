import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset",
  {
    variants: {
      tone: {
        neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200",
        brand: "bg-brand-50 text-brand-700 ring-brand-200",
        success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
        warning: "bg-amber-50 text-amber-700 ring-amber-200",
        danger: "bg-rose-50 text-rose-700 ring-rose-200",
        info: "bg-blue-50 text-blue-700 ring-blue-200",
        violet: "bg-violet-50 text-violet-700 ring-violet-200",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export const Badge = ({ className, tone, dot, children, ...p }: BadgeProps) => (
  <span className={cn(badgeVariants({ tone }), className)} {...p}>
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" />}
    {children}
  </span>
);
