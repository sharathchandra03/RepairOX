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

interface SelectProps {
  value?: string;
  defaultValue?: string;
  onChange?: (e: { target: { value: string } }) => void;
  options: { label: string; value: string }[];
  className?: string;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}
export function Select({ value, defaultValue, onChange, options, className, placeholder, disabled }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  const currentValue = value !== undefined ? value : internalValue;
  const ref = React.useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === currentValue);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-xl border bg-card px-3.5 text-sm transition-all duration-150",
          open
            ? "border-[#4361EE] ring-2 ring-[#4361EE]/15"
            : "border-border hover:border-[#4361EE]/40",
          disabled && "cursor-not-allowed opacity-50 hover:border-border",
          className
        )}
      >
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
          {selected ? selected.label : (placeholder || "Select…")}
        </span>
        <span className={cn("text-muted-foreground transition-transform duration-200", open && "rotate-180")}>▾</span>
      </button>
      {open && (
        <div className="absolute left-0 min-w-[160px] top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg">
          {options.map((o) => {
            const isSelected = o.value === currentValue;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { setInternalValue(o.value); onChange?.({ target: { value: o.value } }); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                  isSelected ? "bg-[#EEF1FD] font-medium text-[#4361EE]" : "hover:bg-[#EEF1FD]/60"
                )}
              >
                <span className={cn("text-[#4361EE]", isSelected ? "opacity-100" : "opacity-0")}>✓</span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
