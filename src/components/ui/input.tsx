"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, iconLeft, iconRight, ...props }, ref) => {
    const internalRef = React.useRef<HTMLInputElement>(null);
    const combinedRef = (node: HTMLInputElement | null) => {
      (internalRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
    };

    return (
      <div className={cn("group relative flex items-center")}>
        {iconLeft && (
          <span className="pointer-events-none absolute left-2.5 inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
            {iconLeft}
          </span>
        )}
        <input
          ref={combinedRef}
          className={cn(
            "flex h-[34px] w-full rounded-xl border border-border bg-card px-3 py-1.5 text-[13px] placeholder:text-muted-foreground transition-all duration-150",
            "hover:border-[#4361EE]/40",
            "focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 focus:outline-none",
            iconLeft && "pl-9",
            iconRight && "pr-9",
            className
          )}
          {...props}
        />
        {iconRight && (
          <span
            className="absolute right-2.5 inline-flex h-4 w-4 items-center justify-center text-muted-foreground cursor-pointer"
            onClick={() => internalRef.current?.focus()}
          >
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
        "min-h-[80px] w-full rounded-xl border border-border bg-card px-3 py-2 text-[13px] placeholder:text-muted-foreground transition-all duration-150 resize-none",
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
  const [mounted, setMounted] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  const currentValue = value !== undefined ? value : internalValue;
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === currentValue);

  // The dropdown panel is rendered in a portal with FIXED positioning so it's
  // never clipped by a scrolling/overflow-hidden ancestor (e.g. inside a modal
  // or drawer body). It also flips upward when there isn't enough room below.
  const [pos, setPos] = React.useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 0 });

  React.useEffect(() => { setMounted(true); }, []);

  const updatePosition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < 260 && r.top > spaceBelow;
    setPos({
      left: r.left,
      width: r.width,
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
    });
  }, []);

  // Recompute position when opening, and keep it aligned on scroll/resize.
  React.useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  // Close on click outside (trigger only; the backdrop handles panel clicks).
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
        ref={triggerRef}
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
      {mounted && open && createPortal(
        <>
          {/* Invisible click-catcher so clicking anywhere closes the panel. */}
          <div className="fixed inset-0 z-[10040]" onMouseDown={() => setOpen(false)} />
          <div
            style={{ left: pos.left, width: Math.max(pos.width, 160), top: pos.top, bottom: pos.bottom }}
            className="fixed z-[10041] max-h-60 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-[0_20px_50px_-12px_rgba(20,30,80,0.35)]"
          >
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
        </>,
        document.body,
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
  iconLeft,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  iconLeft?: React.ReactNode;
}) {
  const [raw, setRaw] = React.useState<string>(value === 0 ? "" : String(value));
  const [focused, setFocused] = React.useState(false);

  // Sync external value changes when not focused
  React.useEffect(() => {
    if (!focused) setRaw(value === 0 ? "" : String(value));
  }, [value, focused]);

  return (
    <div className="group relative flex items-center">
      {iconLeft && (
        <span className="pointer-events-none absolute left-2.5 inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
          {iconLeft}
        </span>
      )}
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
          iconLeft && "pl-9",
          className
        )}
      />
    </div>
  );
}
