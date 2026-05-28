"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type Option = {
  id: string;
  label: string;
  emoji?: string;
  icon?: React.ReactNode;
  desc?: string;
};

export function OptionGrid({
  options,
  value,
  onChange,
  cols = 3,
}: {
  options: Option[];
  value?: string;
  onChange: (id: string) => void;
  cols?: 2 | 3 | 4;
}) {
  const colCls =
    cols === 2 ? "sm:grid-cols-2" :
    cols === 3 ? "sm:grid-cols-3" :
    "sm:grid-cols-4";
  return (
    <div className={cn("grid grid-cols-2 gap-3", colCls)}>
      {options.map((o, i) => {
        const active = o.id === value;
        return (
          <motion.button
            key={o.id}
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => onChange(o.id)}
            className={cn(
              "group relative flex flex-col items-center justify-center rounded-2xl border bg-card p-5 text-center shadow-card transition",
              active
                ? "border-indigo-300 ring-2 ring-indigo-200/70"
                : "border-border hover:-translate-y-0.5 hover:border-indigo-200"
            )}
          >
            {/* glow */}
            <span
              className={cn(
                "pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition group-hover:opacity-100",
                "bg-[radial-gradient(60%_60%_at_50%_0%,rgba(79,70,229,0.10),transparent_70%)]"
              )}
            />
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-b from-indigo-50 to-white text-3xl shadow-ring ring-1 ring-border">
              {o.emoji || o.icon}
            </span>
            <p className="font-display mt-3 text-base font-bold tracking-tight">{o.label}</p>
            {o.desc && <p className="mt-1 text-[11px] text-muted-foreground">{o.desc}</p>}
            {active && (
              <span className="absolute right-2.5 top-2.5 inline-flex h-5 w-5 items-center justify-center rounded-full brand-gradient text-[11px] font-bold text-white shadow-glow">
                ✓
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
