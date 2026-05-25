"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium select-none transition-[transform,box-shadow,background,color] duration-200 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.985]",
  {
    variants: {
      variant: {
        primary:
          "bg-[linear-gradient(180deg,#E11D48_0%,#BE123C_100%)] text-white shadow-[0_8px_20px_-10px_rgba(225,29,72,0.7),inset_0_1px_0_rgba(255,255,255,0.2)] hover:shadow-[0_12px_28px_-10px_rgba(225,29,72,0.8),inset_0_1px_0_rgba(255,255,255,0.25)]",
        secondary:
          "bg-secondary text-secondary-foreground border border-border hover:bg-muted",
        ghost:
          "text-foreground hover:bg-muted",
        outline:
          "border border-border bg-card hover:bg-muted text-foreground",
        soft:
          "bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-100",
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-95",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-[15px]",
        xl: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, ...props }, ref) => {
    return (
      <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {loading && (
          <span className="absolute inset-0 grid place-items-center bg-inherit rounded-[inherit]">
            <span className="h-4 w-4 rounded-full border-2 border-current border-r-transparent animate-spin" />
          </span>
        )}
        <span className={cn("inline-flex items-center gap-2", loading && "opacity-0")}>{children}</span>
      </button>
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
