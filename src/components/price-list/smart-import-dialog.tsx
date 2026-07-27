"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, FileSpreadsheet, Cpu, Wrench, AlertTriangle, ArrowRight, Layers, ChevronDown, Check, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { useCatalog } from "@/lib/catalog-context";
import type { SmartImportResult } from "@/lib/smart-import";

/**
 * Confirmation dialog for the generic sheet importer. Shows how columns were
 * interpreted (metadata → Hero Card, parts → Parts table), lets the admin set
 * a fallback Category/Brand when the sheet doesn't include them, and commits.
 */
export function SmartImportDialog({
  open,
  fileName,
  result,
  sheetNames = [],
  activeSheet,
  onSheetChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  fileName: string;
  result: SmartImportResult | null;
  sheetNames?: string[];
  activeSheet?: string;
  onSheetChange?: (name: string) => void;
  onClose: () => void;
  onConfirm: (opts: { defaultCategory: string; defaultBrand: string }) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { categories: allCats, brands: allBrands } = useCatalog();

  const sheetHasCategory = !!result?.models.some((m) => m.category);
  const sheetHasBrand = !!result?.models.some((m) => m.brand);

  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");

  // Prefill from the sheet (if it carries category/brand) whenever result changes
  useEffect(() => {
    if (!result) return;
    setCategory(result.models.find((m) => m.category)?.category ?? "");
    setBrand(result.models.find((m) => m.brand)?.brand ?? "");
  }, [result]);

  // Existing categories/brands offered as themed suggestions so the admin
  // reuses them instead of accidentally creating duplicates. Brands are scoped
  // to the chosen category when it matches an existing one.
  const categoryOptions = useMemo(
    () => Array.from(new Set(allCats.map((c) => c.name))).sort((a, b) => a.localeCompare(b)),
    [allCats]
  );
  const brandOptions = useMemo(() => {
    const matched = allCats.find((c) => c.name.trim().toLowerCase() === category.trim().toLowerCase());
    const pool = matched ? allBrands.filter((b) => b.categoryId === matched.id) : allBrands;
    return Array.from(new Set(pool.map((b) => b.name))).sort((a, b) => a.localeCompare(b));
  }, [allBrands, allCats, category]);

  const totalParts = useMemo(
    () => (result?.models ?? []).reduce((sum, m) => sum + m.parts.length, 0),
    [result]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!mounted) return null;

  const canImport =
    !!result && result.models.length > 0 &&
    (sheetHasCategory || category.trim() !== "") &&
    (sheetHasBrand || brand.trim() !== "");

  const content = (
    <AnimatePresence>
      {open && result && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] grid place-items-center bg-foreground/40 p-4 backdrop-blur-[2px]"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border"
            role="dialog" aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EEF1FD] text-[#4361EE] ring-1 ring-inset ring-[#B3BFF6]/60">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-bold tracking-tight">Import Price List</h2>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{fileName}</p>
                </div>
              </div>
              <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Sheet picker (Excel multi-sheet) */}
              {sheetNames.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Sheet</Label>
                  <Select
                    value={activeSheet ?? sheetNames[0]}
                    onChange={(e) => onSheetChange?.(e.target.value)}
                    options={sheetNames.map((n) => ({ label: n, value: n }))}
                  />
                </div>
              )}

              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <Stat icon={Layers} label="Devices" value={result.models.length} />
                <Stat icon={Wrench} label="Repair parts" value={totalParts} />
                <Stat icon={Cpu} label="Metadata fields" value={result.metadataColumns.length + (result.modelNameColumn ? 1 : 0)} />
              </div>

              {/* Fallback category / brand */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Category {sheetHasCategory ? "(from sheet)" : "*"}</Label>
                  <ComboInput value={category} onChange={setCategory} options={categoryOptions} placeholder="e.g. Mobile, Laptop" disabled={sheetHasCategory} />
                </div>
                <div className="space-y-1.5">
                  <Label>Brand {sheetHasBrand ? "(from sheet)" : "*"}</Label>
                  <ComboInput value={brand} onChange={setBrand} options={brandOptions} placeholder="e.g. Apple, Samsung" disabled={sheetHasBrand} />
                </div>
                {(!sheetHasCategory || !sheetHasBrand) && (
                  <p className="sm:col-span-2 text-[11px] text-muted-foreground">
                    The sheet doesn&apos;t include {(!sheetHasCategory && !sheetHasBrand) ? "a category or brand" : !sheetHasCategory ? "a category" : "a brand"} column, so these are applied to every imported model.
                  </p>
                )}
              </div>

              {/* Column interpretation */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Cpu className="h-3.5 w-3.5" /> Metadata → Hero Card
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {result.modelNameColumn && (
                      <Chip tone="brand">{result.modelNameColumn} (name)</Chip>
                    )}
                    {result.metadataColumns.map((c) => <Chip key={c}>{c}</Chip>)}
                    {result.metadataColumns.length === 0 && !result.modelNameColumn && (
                      <span className="text-[11px] text-muted-foreground">None detected</span>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Wrench className="h-3.5 w-3.5" /> Repair parts → Parts table
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {result.partColumns.map((c) => <Chip key={c} tone="green">{c}</Chip>)}
                    {result.partColumns.length === 0 && (
                      <span className="text-[11px] text-muted-foreground">None detected</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview of first few models */}
              {result.models.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-muted/40">
                      <tr className="border-b border-border">
                        <th className="py-2 pl-3 pr-2 font-semibold text-muted-foreground">Device</th>
                        <th className="py-2 px-2 font-semibold text-muted-foreground">Parts</th>
                        <th className="py-2 px-2 font-semibold text-muted-foreground">Sample metadata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.models.slice(0, 5).map((m, i) => {
                        const metaBits = [
                          m.year && `${m.year}`, m.chip, m.storage, m.displaySize, m.variant,
                          ...Object.values(m.meta),
                        ].filter(Boolean).slice(0, 3);
                        return (
                          <tr key={i} className="border-b border-border/50 last:border-0">
                            <td className="py-1.5 pl-3 pr-2 font-medium">{m.name}</td>
                            <td className="py-1.5 px-2 text-muted-foreground">{m.parts.length}</td>
                            <td className="py-1.5 px-2 text-muted-foreground truncate">{metaBits.join(" · ") || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {result.models.length > 5 && (
                    <p className="border-t border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
                      +{result.models.length - 5} more device{result.models.length - 5 !== 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              )}

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="flex items-center gap-1.5 text-[11px] text-amber-600">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {w}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-border p-4">
              <p className="text-[12px] text-muted-foreground">
                {result.models.length} device{result.models.length !== 1 ? "s" : ""} · {totalParts} parts will be imported
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                <Button size="sm" disabled={!canImport} onClick={() => onConfirm({ defaultCategory: category.trim(), defaultBrand: brand.trim() })}>
                  Import <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}

/* ─── Small pieces ───────────────────────────────────────────────── */
function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Themed editable combobox — shows existing values to pick from, but also lets
 * the admin type a brand-new value (creating it on import). Prevents confusion
 * and duplicate categories/brands.
 */
function ComboInput({
  value, onChange, options, placeholder, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = value.trim().toLowerCase();
  const filtered = options.filter((o) => o.toLowerCase().includes(q));
  const exactMatch = options.some((o) => o.toLowerCase() === q);
  const showCreate = q.length > 0 && !exactMatch;

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "h-9 w-full rounded-xl border border-border bg-card pl-3 pr-8 text-sm placeholder:text-muted-foreground transition-all",
          "hover:border-[#4361EE]/40 focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15",
          disabled && "cursor-not-allowed opacity-60"
        )}
      />
      {!disabled && (
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((v) => !v)}
          className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      )}
      {open && !disabled && (filtered.length > 0 || showCreate) && (
        <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-52 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-[0_12px_40px_-12px_rgba(20,30,80,0.25)]">
          {showCreate && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-[#4361EE] hover:bg-[#EEF1FD]"
            >
              <Plus className="h-3.5 w-3.5" /> Create &ldquo;{value.trim()}&rdquo;
            </button>
          )}
          {filtered.map((o) => {
            const selected = o.toLowerCase() === q;
            return (
              <button
                key={o}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(o); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                  selected ? "bg-[#EEF1FD] font-medium text-[#3347D6]" : "hover:bg-[#EEF1FD]/60"
                )}
              >
                <Check className={cn("h-3.5 w-3.5 text-[#4361EE]", selected ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{o}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "brand" | "green" }) {
  return (
    <span className={cn(
      "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
      tone === "brand" && "bg-[#EEF1FD] text-[#3347D6] ring-[#B3BFF6]/60",
      tone === "green" && "bg-emerald-50 text-emerald-700 ring-emerald-200",
      tone === "neutral" && "bg-muted text-muted-foreground ring-border",
    )}>
      {children}
    </span>
  );
}
