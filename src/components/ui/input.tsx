"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, iconLeft, iconRight, ...props }, ref) => {
    return (
      <div className={cn("group relative flex items-center")}>
        {iconLeft && (
          <span className="pointer-events-none absolute left-2.5 inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
            {iconLeft}
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            "flex h-9 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground transition-all duration-150",
            "hover:border-[#4361EE]/40",
            "focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 focus:outline-none",
            iconLeft && "pl-9",
            iconRight && "pr-9",
            className
          )}
          {...props}
        />
        {iconRight && (
          <span className="absolute right-2.5 inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
            {iconRight}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[96px] w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm placeholder:text-muted-foreground transition-all duration-150 resize-none",
        "hover:border-[#4361EE]/40",
        "focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 focus:outline-none",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn("text-xs font-medium text-muted-foreground tracking-wide", className)} {...props} />
  )
);
Label.displayName = "Label";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: { label: string; value: string }[];
}
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "h-11 w-full appearance-none rounded-xl border border-border bg-card px-3.5 pr-9 text-sm transition focus:border-brand-400 focus:ring-2 focus:ring-brand-200/50 focus:outline-none",
          className
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">▾</span>
    </div>
  )
);
Select.displayName = "Select";

/** Numeric input that avoids leading-zero issues.
 *  Shows empty while editing; commits number on blur. */
export function NumericInput({
  value,
  onChange,
  min,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (n: number) => void;
  min?: number;
}) {
  const [raw, setRaw] = React.useState<string>(value === 0 ? "" : String(value));
  const [focused, setFocused] = React.useState(false);

  // Sync external value changes when not focused
  React.useEffect(() => {
    if (!focused) setRaw(value === 0 ? "" : String(value));
  }, [value, focused]);

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      value={focused ? raw : (value === 0 ? "0" : String(value))}
      onFocus={(e) => {
        setFocused(true);
        setRaw(value === 0 ? "" : String(value));
        e.target.select();
      }}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9.]/g, "");
        setRaw(v);
        const n = parseFloat(v);
        onChange(isNaN(n) ? 0 : (min !== undefined ? Math.max(min, n) : n));
      }}
      onBlur={() => {
        setFocused(false);
        if (raw === "" || raw === ".") onChange(min ?? 0);
      }}
      className={cn(
        "flex h-11 w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm placeholder:text-muted-foreground transition",
        "focus:border-brand-400 focus:ring-2 focus:ring-brand-200/40 focus:outline-none",
        className
      )}
    />
  );
}
