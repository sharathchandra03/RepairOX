"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

/* Smart dropdown that auto-positions upward if near the bottom of the viewport.
   Renders the panel via a Portal so it always floats above everything.
   Handles outside-click + Escape, animated panel, right/left alignment. */
export function Dropdown({
  trigger,
  children,
  align = "right",
  width = "w-56",
  className,
  panelClassName,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  width?: string;
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top?: number; bottom?: number; left?: number; right?: number }>({});
  const ref = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => { setMounted(true); }, []);

  // Calculate fixed positioning when opening
  React.useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;

    const position: { top?: number; bottom?: number; left?: number; right?: number } = {};
    if (openUp) {
      position.bottom = window.innerHeight - rect.top + 4;
    } else {
      position.top = rect.bottom + 4;
    }
    if (align === "right") {
      position.right = window.innerWidth - rect.right;
    } else {
      position.left = rect.left;
    }
    setPos(position);
  }, [open, align]);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      // Close if click is outside both trigger wrapper and portal panel
      if (
        ref.current && !ref.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Close on scroll (unless scrolling inside the menu itself) so the
    // fixed-positioned panel never detaches from its trigger.
    function onScroll(e: Event) {
      const target = e.target as Node;
      if (panelRef.current && panelRef.current.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          style={pos}
          className={cn(
            "fixed z-[9999] overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-[0_12px_40px_-12px_rgba(20,30,80,0.25)]",
            width,
            panelClassName
          )}
        >
          {children(() => setOpen(false))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <div ref={triggerRef}>
        {trigger({ open, toggle: () => setOpen((v) => !v) })}
      </div>
      {mounted ? createPortal(panel, document.body) : null}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  onClick,
  danger,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
        danger ? "text-rose-600 hover:bg-rose-50" : "text-foreground hover:bg-[#EEF1FD]",
        className
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0 opacity-70" />}
      <span className="flex-1">{children}</span>
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
      {children}
    </p>
  );
}
