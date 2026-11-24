"use client";
/* Device quick search — find any device model across every category and brand,
   pick it, and the caller loads that model's parts. The placeholder types out
   real model names from the catalog ("Search by iPhone 16 Pro Max"…). */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Smartphone } from "lucide-react";
import { useCatalog } from "@/lib/catalog-context";
import { useAnimatedPlaceholder } from "@/hooks/use-animated-placeholder";
import { cn } from "@/lib/utils";
import type { PriceListModel } from "@/lib/price-list-data";

type Hit = { model: PriceListModel; brand: string; category: string; parts: number };

export function DeviceQuickSearch({ onSelect, className }: { onSelect: (m: PriceListModel) => void; className?: string }) {
  const { models, brands, categories, parts } = useCatalog();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const all = useMemo<Hit[]>(() => {
    const b = new Map(brands.map((x) => [x.id, x.name]));
    const c = new Map(categories.map((x) => [x.id, x.name]));
    const count = new Map<string, number>();
    parts.forEach((p) => count.set(p.modelId, (count.get(p.modelId) ?? 0) + 1));
    return models.map((model) => ({ model, brand: b.get(model.brandId) ?? "", category: c.get(model.categoryId) ?? "", parts: count.get(model.id) ?? 0 }));
  }, [models, brands, categories, parts]);

  // A fixed, spread-out sample of real model names for the running placeholder.
  const words = useMemo(() => {
    const step = Math.max(1, Math.floor(all.length / 30));
    const picks = all.filter((_, i) => i % step === 0).slice(0, 30).map((h) => (h.model.name.toLowerCase().startsWith(h.brand.toLowerCase()) ? h.model.name : `${h.brand} ${h.model.name}`).trim());
    return picks.length ? picks : ["any device model"];
  }, [all]);
  const placeholder = useAnimatedPlaceholder({ prefix: "Search device: ", words, paused: focused || q.length > 0 });

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const terms = t.split(/\s+/);
    return all
      .filter((h) => {
        const hay = `${h.brand} ${h.model.name} ${h.category}`.toLowerCase();
        return terms.every((x) => hay.includes(x));
      })
      .sort((a, b) => Number(b.parts > 0) - Number(a.parts > 0) || a.model.name.localeCompare(b.model.name))
      .slice(0, 8);
  }, [all, q]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const off = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setFocused(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, []);

  function pick(h: Hit) {
    onSelect(h.model);
    setQ("");
    setFocused(false);
  }
  const open = focused && q.trim().length > 0;

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <div className={cn(
        "flex h-9 items-center gap-2 rounded-full border bg-[#EEF1FD]/60 px-3.5 transition",
        focused ? "border-[#4361EE] bg-white ring-4 ring-[#4361EE]/15" : "border-[#4361EE]/50 shadow-[0_0_0_3px_rgba(67,97,238,0.07)]",
      )}>
        <Search className="h-4 w-4 shrink-0 text-[#4361EE]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active]); }
            else if (e.key === "Escape") { setQ(""); setFocused(false); }
          }}
          placeholder={placeholder}
          aria-label="Search any device model"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-[#4361EE]/60"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Clear search" className="grid h-6 w-6 place-items-center rounded-full text-[#4361EE] hover:bg-[#4361EE]/10"><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-2xl border border-[#4361EE]/30 bg-card shadow-[0_18px_40px_-18px_rgba(67,97,238,0.45)]">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-muted-foreground">No device matches &ldquo;{q}&rdquo;.</p>
          ) : results.map((h, i) => (
            <button
              key={h.model.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(h)}
              className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left transition", i === active ? "bg-[#EEF1FD]" : "hover:bg-muted/40")}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Smartphone className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{h.model.name.toLowerCase().startsWith(h.brand.toLowerCase()) ? h.model.name : `${h.brand} ${h.model.name}`}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">{h.category}</span>
              </span>
              <span className="shrink-0 rounded-full bg-[#4361EE]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#4361EE]">{h.parts} part{h.parts === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
