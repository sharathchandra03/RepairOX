"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Search, Filter, ChevronRight, ChevronLeft, ChevronDown,
  Smartphone, Tablet, Laptop, Monitor, Watch, Headphones,
  Gamepad2, Plane, Box, Upload, Download, Plus, Clock,
  User, Cpu, HardDrive, MonitorSmartphone, Calendar,
  Info, MoreHorizontal, Pencil, Eye, Wrench, X, Tag,
  Image as ImageIcon, GripVertical, Copy, Settings2, Check,
} from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { useCatalog, brandsForCategory, modelsForBrand, partsForModel } from "@/lib/catalog-context";
import { parseCatalogCSV, validateRows, catalogToCSV, downloadCSV, toCSV } from "@/lib/csv-utils";
import { readSheet, readSheetByName } from "@/lib/sheet-reader";
import { parseSmartSheet, type SmartImportResult } from "@/lib/smart-import";
import { SmartImportDialog } from "@/components/price-list/smart-import-dialog";
import {
  type DeviceCategory,
  type PriceListBrand,
  type PriceListModel,
  type DevicePart,
} from "@/lib/price-list-data";

/* ─── Icon Map ───────────────────────────────────────────────────── */
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Smartphone, Tablet, Laptop, Monitor, Watch, Headphones,
  Gamepad2, Plane, Box,
};

/* ─── Animation Config ───────────────────────────────────────────── */
// Panel width: left col (196) + gap (14) + right col (250) = 460
const PANEL_WIDTH = 460;
const SPRING = { type: "spring", stiffness: 320, damping: 34, mass: 0.7 } as const;
const HOVER_DELAY_OUT = 380;

/* ─── Main Page Component ────────────────────────────────────────── */
export default function PriceListPage() {
  const { categories, brands, models, parts: allParts, importRows, importSmartModels } = useCatalog();

  // Selection is stored by ID and resolved against live catalog data, so any
  // edit in Settings → Price List (image upload, rename, delete) reflects here.
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>("cat-laptop");
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>("plb-apple-l");
  const [selectedModelId, setSelectedModelId] = useState<string | null>("plm-mba-m3");
  const [modelSearch, setModelSearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [partSearch, setPartSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [importNotice, setImportNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Smart (wide-sheet) import flow
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartResult, setSmartResult] = useState<SmartImportResult | null>(null);
  const [smartFile, setSmartFile] = useState<File | null>(null);
  const [smartSheetNames, setSmartSheetNames] = useState<string[]>([]);
  const [smartActiveSheet, setSmartActiveSheet] = useState<string>("");
  const [smartFileName, setSmartFileName] = useState("");
  const [focusMode, setFocusMode] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Resolve selected IDs against live catalog data
  const selectedCategory = useMemo<DeviceCategory | null>(
    () => categories.find((c) => c.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  );
  const selectedBrand = useMemo<PriceListBrand | null>(
    () => brands.find((b) => b.id === selectedBrandId) ?? null,
    [brands, selectedBrandId]
  );
  const selectedModel = useMemo<PriceListModel | null>(
    () => models.find((m) => m.id === selectedModelId) ?? null,
    [models, selectedModelId]
  );

  // Enter focus mode after model selection
  useEffect(() => {
    if (selectedModelId) {
      const timer = setTimeout(() => {
        setFocusMode(true);
        setNavVisible(false);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setFocusMode(false);
      setNavVisible(true);
    }
  }, [selectedModelId]);

  // Filtered data derived from live catalog (only enabled categories are shown)
  // Live model counts, so the browser badges reflect the real catalog
  // (including anything just imported) rather than static seed numbers.
  const catModelCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const mo of models) m.set(mo.categoryId, (m.get(mo.categoryId) ?? 0) + 1);
    return m;
  }, [models]);
  const brandModelCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const mo of models) m.set(mo.brandId, (m.get(mo.brandId) ?? 0) + 1);
    return m;
  }, [models]);

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.enabled ?? true).map((c) => ({ ...c, count: catModelCount.get(c.id) ?? 0 })),
    [categories, catModelCount]
  );

  const filteredBrands = useMemo(() => {
    if (!selectedCategoryId) return [];
    let all = brandsForCategory(brands, selectedCategoryId);
    if (brandSearch.trim()) all = all.filter((b) => b.name.toLowerCase().includes(brandSearch.toLowerCase()));
    return all.map((b) => ({ ...b, count: brandModelCount.get(b.id) ?? 0 }));
  }, [brands, selectedCategoryId, brandSearch, brandModelCount]);

  const filteredModels = useMemo(() => {
    if (!selectedBrandId) return [];
    const all = modelsForBrand(models, selectedBrandId);
    if (!modelSearch.trim()) return all;
    const q = modelSearch.toLowerCase();
    return all.filter((m) => m.name.toLowerCase().includes(q));
  }, [models, selectedBrandId, modelSearch]);

  const modelParts = useMemo(
    () => (selectedModelId ? partsForModel(allParts, selectedModelId) : []),
    [allParts, selectedModelId]
  );

  const handleCategorySelect = useCallback((cat: DeviceCategory) => {
    setSelectedCategoryId(cat.id);
    setSelectedBrandId(null);
    setSelectedModelId(null);
    setBrandSearch("");
    setModelSearch("");
    setFocusMode(false);
    setNavVisible(true);
  }, []);

  const handleBrandSelect = useCallback((brand: PriceListBrand) => {
    setSelectedBrandId(brand.id);
    setSelectedModelId(null);
    setModelSearch("");
    setFocusMode(false);
    setNavVisible(true);
  }, []);

  const handleModelSelect = useCallback((model: PriceListModel) => {
    setSelectedModelId(model.id);
    setPartSearch("");
  }, []);

  /* ── Global search (models · parts · SKU) ── */
  const globalResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return { models: [] as PriceListModel[], parts: [] as { part: DevicePart; model: PriceListModel }[] };
    const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
    const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "";
    const modelMatches = models
      .filter((m) =>
        m.name.toLowerCase().includes(q) ||
        brandName(m.brandId).toLowerCase().includes(q) ||
        catName(m.categoryId).toLowerCase().includes(q))
      .slice(0, 6);
    const partMatches = allParts
      .filter((p) => p.partName.toLowerCase().includes(q) || p.partNumber.toLowerCase().includes(q))
      .slice(0, 6)
      .map((part) => ({ part, model: models.find((m) => m.id === part.modelId) }))
      .filter((x): x is { part: DevicePart; model: PriceListModel } => !!x.model);
    return { models: modelMatches, parts: partMatches };
  }, [globalSearch, models, allParts, categories, brands]);

  const hasResults = globalResults.models.length > 0 || globalResults.parts.length > 0;

  const jumpToModel = useCallback((m: PriceListModel, partHint?: string) => {
    setSelectedCategoryId(m.categoryId);
    setSelectedBrandId(m.brandId);
    setSelectedModelId(m.id);
    setPartSearch(partHint ?? "");
    setGlobalSearch("");
    setSearchOpen(false);
  }, []);

  /* ── Import / Export against the live catalog ── */
  const handleExport = useCallback(() => {
    downloadCSV(
      `repairox-price-list-${new Date().toISOString().slice(0, 10)}`,
      catalogToCSV(categories, brands, models, allParts),
    );
  }, [categories, brands, models, allParts]);

  // Import: read any CSV/Excel file, auto-detect its shape and route it.
  //  • Canonical catalog template (Category/Brand/Model/Part Name/Price columns,
  //    one part per row) → long-format import.
  //  • Any other sheet (repair parts as columns) → generic smart importer.
  const handleImportFile = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      const { matrix, sheetName, sheetNames } = await readSheet(file);
      if (matrix.length === 0) {
        setImportNotice({ tone: "error", text: "The file appears to be empty." });
        return;
      }
      const headerSet = new Set(matrix[0].map((h) => h.trim().toLowerCase()));
      const isLongTemplate =
        headerSet.has("model") &&
        (headerSet.has("part name") || headerSet.has("part")) &&
        (headerSet.has("price") || headerSet.has("price (inr)"));

      if (isLongTemplate) {
        const parsed = parseCatalogCSV(toCSV(matrix[0], matrix.slice(1)));
        if (parsed.missingRequired.length) {
          setImportNotice({ tone: "error", text: `Import failed — missing required columns: ${parsed.missingRequired.join(", ")}.` });
          return;
        }
        const validated = validateRows(parsed);
        const goodRows = validated.filter((v) => !v.issues.some((i) => i.level === "error")).map((v) => v.row);
        const skipped = validated.length - goodRows.length;
        if (goodRows.length === 0) {
          setImportNotice({ tone: "error", text: `No valid rows found. ${skipped} row(s) had errors.` });
          return;
        }
        const res = importRows(goodRows);
        const bits = [
          res.modelsAdded ? `${res.modelsAdded} models` : "",
          res.partsAdded ? `${res.partsAdded} parts added` : "",
          res.partsUpdated ? `${res.partsUpdated} parts updated` : "",
        ].filter(Boolean);
        setImportNotice({ tone: "ok", text: `Imported ${bits.join(", ") || "no changes"}.${skipped ? ` ${skipped} row(s) skipped.` : ""}` });
        return;
      }

      // Generic wide sheet → open the smart-import confirm dialog
      setSmartFile(file);
      setSmartFileName(file.name);
      setSmartSheetNames(sheetNames);
      setSmartActiveSheet(sheetName);
      setSmartResult(parseSmartSheet(matrix));
      setSmartOpen(true);
    } catch {
      setImportNotice({ tone: "error", text: "Could not read this file. Please upload a valid .csv, .xlsx or .xls file." });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [importRows]);

  // Switch sheets within a multi-sheet Excel workbook (re-parse chosen sheet).
  const handleSmartSheetChange = useCallback(async (name: string) => {
    if (!smartFile) return;
    try {
      const matrix = await readSheetByName(smartFile, name);
      setSmartActiveSheet(name);
      setSmartResult(parseSmartSheet(matrix));
    } catch {
      setImportNotice({ tone: "error", text: `Could not read sheet "${name}".` });
    }
  }, [smartFile]);

  // Commit the smart import into the catalog.
  const handleSmartConfirm = useCallback((opts: { defaultCategory: string; defaultBrand: string }) => {
    if (!smartResult) return;
    const res = importSmartModels(smartResult.models, opts);
    const bits = [
      res.modelsAdded ? `${res.modelsAdded} models added` : "",
      res.modelsUpdated ? `${res.modelsUpdated} models updated` : "",
      res.partsAdded ? `${res.partsAdded} parts added` : "",
      res.partsUpdated ? `${res.partsUpdated} parts updated` : "",
    ].filter(Boolean);
    setImportNotice({ tone: "ok", text: `Imported ${bits.join(", ") || "no changes"} into the catalog.` });
    setSmartOpen(false);
    setSmartResult(null);
    setSmartFile(null);
  }, [smartResult, importSmartModels]);

  // Hover reveal — entire panel as one unit
  const handleHoverEnter = useCallback(() => {
    if (!focusMode) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setNavVisible(true);
  }, [focusMode]);

  const handleHoverLeave = useCallback(() => {
    if (!focusMode) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setNavVisible(false), HOVER_DELAY_OUT);
  }, [focusMode]);

  // Keep the browser panel open while the user is typing in a search box (so
  // the model/brand search doesn't collapse mid-interaction in focus mode).
  const keepNavOpen = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setNavVisible(true);
  }, []);

  useEffect(() => {
    return () => { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); };
  }, []);

  const panelOpen = !focusMode || navVisible;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>Shop</span>
            <ChevronRight className="h-3 w-3" />
            <span className="font-medium text-foreground">Price List</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">Price List</h1>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Browse devices and manage part pricing</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Global search with live results (models · parts · SKU) */}
          <div className="relative group/search">
            {/* Breathing glow layer behind the search bar */}
            <div className="pointer-events-none absolute -inset-[3px] rounded-xl opacity-60 animate-search-breathe group-hover/search:[animation-play-state:paused] group-focus-within/search:[animation-play-state:paused]" />
            <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground/70 transition-colors duration-200 group-focus-within/search:text-[#4361EE]" />
            <input
              value={globalSearch}
              onChange={(e) => { setGlobalSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setGlobalSearch(""); setSearchOpen(false); }
                if (e.key === "Enter" && globalResults.models[0]) jumpToModel(globalResults.models[0]);
              }}
              placeholder="Search model, part, or SKU..."
              className="relative h-10 w-80 rounded-xl border border-[#4361EE]/30 bg-card pl-10 pr-9 text-sm shadow-[0_1px_3px_0_rgba(67,97,238,0.06),0_1px_2px_-1px_rgba(20,30,80,0.04)] placeholder:text-muted-foreground/60 transition-all duration-200 hover:border-[#4361EE]/50 hover:shadow-[0_2px_8px_-2px_rgba(67,97,238,0.13)] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:shadow-[0_0_0_3px_rgba(67,97,238,0.08),0_4px_12px_-4px_rgba(67,97,238,0.18)]"
            />
            {globalSearch && (
              <button
                onMouseDown={(e) => { e.preventDefault(); setGlobalSearch(""); setSearchOpen(false); }}
                className="absolute right-3 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted transition-colors duration-150"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {searchOpen && globalSearch.trim() && (
              <div className="absolute left-0 top-full z-50 mt-1 max-h-[380px] w-[340px] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 shadow-[0_12px_40px_-12px_rgba(20,30,80,0.25)]">
                {!hasResults && (
                  <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">No matches found.</p>
                )}
                {globalResults.models.length > 0 && (
                  <>
                    <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Models</p>
                    {globalResults.models.map((m) => (
                      <button
                        key={m.id}
                        onMouseDown={(e) => { e.preventDefault(); jumpToModel(m); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#EEF1FD]"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                          {m.imageUrl ? <img src={m.imageUrl} alt="" className="h-full w-full object-cover" /> : <Laptop className="h-4 w-4 text-muted-foreground" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{m.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {brands.find((b) => b.id === m.brandId)?.name} · {m.year}
                          </span>
                        </span>
                      </button>
                    ))}
                  </>
                )}
                {globalResults.parts.length > 0 && (
                  <>
                    <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Parts</p>
                    {globalResults.parts.map(({ part, model }) => (
                      <button
                        key={part.id}
                        onMouseDown={(e) => { e.preventDefault(); jumpToModel(model, part.partNumber || part.partName); }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[#EEF1FD]"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <Wrench className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{part.partName}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {model.name} · <span className="font-mono">{part.partNumber || "—"}</span> · {formatINR(part.price)}
                          </span>
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Import CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => handleImportFile(e.target.files?.[0])}
          />
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button size="sm" className="gap-1.5 rounded-xl"><Plus className="h-3.5 w-3.5" /> Add New <ChevronDown className="h-3 w-3" /></Button>
        </div>
      </div>

      {/* Import result notice */}
      {importNotice && (
        <div className={cn(
          "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[12px]",
          importNotice.tone === "ok"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-rose-200 bg-rose-50 text-rose-700"
        )}>
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{importNotice.text}</span>
          <button onClick={() => setImportNotice(null)} className="grid h-6 w-6 place-items-center rounded-md hover:bg-black/5" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ─── Main Content Area ─────────────────────────────────────── */}
      {/* items-start keeps the left browser at its own natural height so it
          never stretches to match a tall parts table (no empty gap below). */}
      <div className="flex items-start relative">
        {/*
          REVEAL HANDLE — a visible, in-flow handle shown when the browser is
          collapsed in Focus Mode. Anchored to the content's left edge (NOT the
          viewport), so moving toward the app sidebar never triggers it.
          Revealing is a deliberate click; hovering only highlights it.
        */}
        {focusMode && !navVisible && (
          <button
            type="button"
            onClick={() => setNavVisible(true)}
            className="group sticky top-[76px] self-start mr-3 flex h-[calc(100vh-92px)] w-14 shrink-0 flex-col items-center justify-center gap-5 rounded-2xl border border-border bg-card shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50"
            title="Show device browser"
            aria-label="Show device browser"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600 shadow-sm transition-colors group-hover:bg-brand-500 group-hover:text-white">
              <ChevronRight className="h-5 w-5" />
            </span>
            <span className="[writing-mode:vertical-rl] rotate-180 text-[12px] font-bold uppercase tracking-[0.25em] text-muted-foreground transition-colors group-hover:text-brand-600">
              Devices
            </span>
          </button>
        )}

        {/*
          UNIFIED DEVICE BROWSER PANEL
          One outer motion.div controls the width in the flex layout.
          When collapsed: width=0, marginRight=0, overflow hidden.
          The inner wrapper uses translateX for GPU-accelerated slide.
          All three sections (Category, Brand, Model) live inside as
          one continuous unit — they always appear/disappear together.
        */}
        <motion.div
          className="shrink-0 overflow-hidden sticky top-[76px] self-start h-[calc(100vh-92px)]"
          animate={{
            width: panelOpen ? PANEL_WIDTH : 0,
            marginRight: panelOpen ? 16 : 0,
          }}
          transition={SPRING}
          style={{ willChange: "width, margin" }}
          onMouseEnter={handleHoverEnter}
          onMouseLeave={handleHoverLeave}
        >
          <motion.div
            className="flex gap-3.5 h-full"
            style={{ width: PANEL_WIDTH }}
            animate={{
              x: panelOpen ? 0 : -PANEL_WIDTH,
              opacity: panelOpen ? 1 : 0,
            }}
            transition={SPRING}
          >
            {/* LEFT COLUMN: Category + Brand stacked, filling full height */}
            <div className="w-[196px] shrink-0 flex flex-col gap-3.5 h-full">
              <CategoryCard
                categories={visibleCategories}
                selected={selectedCategory}
                onSelect={handleCategorySelect}
              />
              {selectedCategory && (
                <BrandCard
                  brands={filteredBrands}
                  selected={selectedBrand}
                  onSelect={handleBrandSelect}
                  categoryName={selectedCategory.name}
                  search={brandSearch}
                  onSearchChange={setBrandSearch}
                  onSearchFocus={keepNavOpen}
                />
              )}
            </div>

            {/* RIGHT COLUMN: Model */}
            <div className="flex-1 min-w-0 h-full">
              {selectedBrand ? (
                <ModelCard
                  models={filteredModels}
                  selected={selectedModel}
                  onSelect={handleModelSelect}
                  brandName={selectedBrand.name}
                  search={modelSearch}
                  onSearchChange={setModelSearch}
                  onSearchFocus={keepNavOpen}
                />
              ) : (
                <div className="h-full rounded-2xl border border-dashed border-border bg-muted/20 grid place-items-center p-4">
                  <div className="text-center">
                    <span className="grid h-6 w-6 mx-auto place-items-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">3</span>
                    <p className="mt-2 text-[11px] text-muted-foreground">Select a brand</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>

        {/* ─── Right Workspace: Hero Card + Parts Table ────────────── */}
        <div className="flex-1 min-w-0 space-y-4">
          {selectedModel ? (
            <>
              <DeviceHeroCard model={selectedModel} brand={selectedBrand} category={selectedCategory} />
              <PartsAndPricing
                parts={modelParts}
                modelName={selectedModel.name}
                search={partSearch}
                onSearchChange={setPartSearch}
              />
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Branch Info Footer */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-[12px] text-muted-foreground">
        <Info className="h-3.5 w-3.5 text-brand-500" />
        <span>Prices are branch specific. You&apos;re viewing prices for</span>
        <button className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
          Main Branch <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* Smart import confirm dialog (generic Excel/CSV sheets) */}
      <SmartImportDialog
        open={smartOpen}
        fileName={smartFileName}
        result={smartResult}
        sheetNames={smartSheetNames}
        activeSheet={smartActiveSheet}
        onSheetChange={handleSmartSheetChange}
        onClose={() => { setSmartOpen(false); setSmartResult(null); setSmartFile(null); }}
        onConfirm={handleSmartConfirm}
      />
    </div>
  );
}

/* ─── Category Card ──────────────────────────────────────────────── */
function CategoryCard({
  categories,
  selected,
  onSelect,
}: {
  categories: DeviceCategory[];
  selected: DeviceCategory | null;
  onSelect: (c: DeviceCategory) => void;
}) {
  return (
    <div className="flex flex-1 min-h-0 flex-col rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-brand-500 text-[10px] font-bold text-white">1</span>
          <span className="text-[13px] font-semibold">Category</span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {categories.map((cat) => {
          const Icon = iconMap[cat.icon] || Box;
          const isActive = selected?.id === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors duration-100",
                isActive
                  ? "bg-brand-50 text-brand-700 font-semibold border-l-[3px] border-brand-500"
                  : "text-foreground hover:bg-muted/70 border-l-[3px] border-transparent"
              )}
            >
              {cat.imageUrl ? (
                <img src={cat.imageUrl} alt={cat.name} className="h-5 w-5 shrink-0 rounded object-cover" />
              ) : (
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-brand-500" : "text-muted-foreground")} />
              )}
              <span className="flex-1 truncate">{cat.name}</span>
              <span className={cn(
                "tabular-nums rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
                isActive ? "bg-brand-500 text-white" : "bg-muted text-muted-foreground"
              )}>
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Brand Card ─────────────────────────────────────────────────── */
function BrandCard({
  brands,
  selected,
  onSelect,
  categoryName,
  search,
  onSearchChange,
  onSearchFocus,
}: {
  brands: PriceListBrand[];
  selected: PriceListBrand | null;
  onSelect: (b: PriceListBrand) => void;
  categoryName: string;
  search: string;
  onSearchChange: (v: string) => void;
  onSearchFocus?: () => void;
}) {
  return (
    <div className="flex flex-1 min-h-0 flex-col rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-brand-500 text-[10px] font-bold text-white">2</span>
          <span className="text-[13px] font-semibold truncate">Brand ({categoryName})</span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="px-3 pt-2.5 pb-2 shrink-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={onSearchFocus}
            placeholder="Search brand..."
            className="h-8 w-full rounded-lg border border-border bg-muted/40 pl-8 pr-2 text-[12px] placeholder:text-muted-foreground focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {brands.map((brand) => {
          const isActive = selected?.id === brand.id;
          return (
            <button
              key={brand.id}
              onClick={() => onSelect(brand)}
              className={cn(
                "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors duration-100",
                isActive
                  ? "bg-brand-50 text-brand-700 font-semibold border-l-[3px] border-brand-500"
                  : "text-foreground hover:bg-muted/70 border-l-[3px] border-transparent"
              )}
            >
              <span className="flex-1 truncate">{brand.name}</span>
              <span className={cn(
                "tabular-nums rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
                isActive ? "bg-brand-500 text-white" : "bg-muted text-muted-foreground"
              )}>
                {brand.count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-border px-3.5 py-2 shrink-0">
        <button className="text-[11px] font-medium text-brand-600 hover:underline">View all brands</button>
      </div>
    </div>
  );
}

/* ─── Model Card ─────────────────────────────────────────────────── */
function ModelCard({
  models,
  selected,
  onSelect,
  brandName,
  search,
  onSearchChange,
  onSearchFocus,
}: {
  models: PriceListModel[];
  selected: PriceListModel | null;
  onSelect: (m: PriceListModel) => void;
  brandName: string;
  search: string;
  onSearchChange: (v: string) => void;
  onSearchFocus?: () => void;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-brand-500 text-[10px] font-bold text-white">3</span>
          <span className="text-[13px] font-semibold truncate">Model ({brandName})</span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="px-3 pt-2.5 pb-2 shrink-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={onSearchFocus}
            placeholder="Search model..."
            className="h-8 w-full rounded-lg border border-border bg-muted/40 pl-8 pr-2 text-[12px] placeholder:text-muted-foreground focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1.5 px-2 space-y-1">
        {models.map((model) => {
          const isActive = selected?.id === model.id;
          return (
            <button
              key={model.id}
              onClick={() => onSelect(model)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-100",
                isActive
                  ? "bg-brand-50 ring-1 ring-brand-200 shadow-sm"
                  : "hover:bg-muted/60"
              )}
            >
              <div className={cn(
                "h-11 w-11 shrink-0 overflow-hidden rounded-lg grid place-items-center",
                isActive ? "bg-brand-100" : "bg-muted/80"
              )}>
                {model.imageUrl ? (
                  <img src={model.imageUrl} alt={model.name} className="h-full w-full object-contain" />
                ) : (
                  <Laptop className={cn("h-5 w-5", isActive ? "text-brand-600" : "text-muted-foreground")} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-[13px] leading-tight truncate",
                  isActive ? "font-semibold text-brand-700" : "font-medium text-foreground"
                )}>
                  {model.name}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {model.year}{model.variant ? ` · ${model.variant}` : ""}
                </p>
              </div>
            </button>
          );
        })}
        {models.length === 0 && (
          <p className="text-center py-6 text-[12px] text-muted-foreground">No models found</p>
        )}
      </div>
      <div className="border-t border-border px-3.5 py-2 shrink-0">
        <button className="text-[11px] font-medium text-brand-600 hover:underline">View all models</button>
      </div>
    </div>
  );
}

/* ─── Device Hero Card ───────────────────────────────────────────── */
function DeviceHeroCard({
  model,
  brand,
  category,
}: {
  model: PriceListModel;
  brand: PriceListBrand | null;
  category: DeviceCategory | null;
}) {
  const CategoryIcon = (category && iconMap[category.icon]) || Laptop;
  const isActive = model.status === "active";

  // Build the metadata list dynamically — only fields that actually exist are
  // shown (no empty placeholders). Known fields first, then any extra metadata
  // captured from an imported sheet (Series, RAM, Colour, …).
  type MetaField = { icon: React.ComponentType<{ className?: string }>; label: string; value: string; highlight?: boolean };
  const metaFields: MetaField[] = [];
  const pushField = (icon: MetaField["icon"], label: string, value?: string | number | null, highlight?: boolean) => {
    const v = value === undefined || value === null ? "" : String(value).trim();
    if (v) metaFields.push({ icon, label, value: v, highlight });
  };
  pushField(Box, "Brand", brand?.name);
  pushField(MonitorSmartphone, "Category", category?.name, true);
  pushField(Cpu, "Chip", model.chip);
  pushField(Monitor, "Display Size", model.displaySize);
  pushField(HardDrive, "Storage (Base)", model.storage);
  pushField(Calendar, "Model Year", model.modelYear || model.year);
  pushField(Tag, "Variant", model.variant);
  // Extra imported metadata
  for (const [k, v] of Object.entries(model.meta ?? {})) pushField(Tag, k, v);
  pushField(Calendar, "Created On", model.createdOn);
  pushField(Clock, "Last Updated", model.lastUpdated);
  pushField(User, "Updated By", model.updatedBy);

  return (
    <motion.div
      key={model.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-border bg-card shadow-card overflow-hidden"
    >
      <div className="flex items-stretch">
        {/* Device image — uploaded image (from Settings → Price List) fills the
            whole panel. Falls back to a category illustration when none exists.
            Never a broken image. */}
        <div className="w-[220px] shrink-0 self-stretch bg-white grid place-items-center relative overflow-hidden p-4">
          {model.imageUrl ? (
            <img
              src={model.imageUrl}
              alt={model.name}
              className="h-full w-full object-contain rounded-xl"
            />
          ) : (
            <>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(67,97,238,0.08),transparent_70%)]" />
              <div className="relative">
                <CategoryIcon className="h-24 w-24 text-brand-400/70" />
              </div>
            </>
          )}
        </div>
        <div className="flex-1 p-5 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold tracking-tight truncate">{model.name} ({model.year})</h2>
                <Badge tone={isActive ? "success" : "neutral"} dot={isActive}>
                  {isActive ? "Active" : "Discontinued"}
                </Badge>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-[12px] shrink-0">
              <Pencil className="h-3 w-3" /> Edit Model
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-3">
            {metaFields.map((f) => (
              <MetaItem key={f.label} icon={f.icon} label={f.label} value={f.value} highlight={f.highlight} />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MetaItem({ icon: Icon, label, value, highlight }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={cn(
          "text-[13px] font-medium leading-tight mt-0.5 truncate",
          highlight && "text-brand-600 underline underline-offset-2 decoration-brand-300"
        )}>{value}</p>
      </div>
    </div>
  );
}

/* ─── Parts & Pricing Table ──────────────────────────────────────── */
type PartColKey = "image" | "part" | "price" | "warranty";
const PART_COL_LABEL: Record<PartColKey, string> = {
  image: "Image", part: "Part Name", price: "Price (INR)", warranty: "Warranty",
};

function PartsAndPricing({
  parts, modelName, search, onSearchChange,
}: {
  parts: DevicePart[];
  modelName: string;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const [activeTab, setActiveTab] = useState("parts");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [order, setOrder] = useState<PartColKey[]>(["image", "part", "price", "warranty"]);
  const [dragCol, setDragCol] = useState<PartColKey | null>(null);
  const [overCol, setOverCol] = useState<PartColKey | null>(null);
  const [detail, setDetail] = useState<DevicePart | null>(null);

  // Filters
  const [warrantyFilter, setWarrantyFilter] = useState<Set<string>>(new Set());
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortBy, setSortBy] = useState<"none" | "price-asc" | "price-desc" | "name">("none");

  const warrantyOptions = useMemo(() => Array.from(new Set(parts.map((p) => p.warranty))).sort(), [parts]);

  const filtered = useMemo(() => {
    let list = parts.slice();
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) =>
      p.partName.toLowerCase().includes(q) ||
      (p.partNumber ?? "").toLowerCase().includes(q) ||
      (p.repairCategory ?? "").toLowerCase().includes(q));
    if (warrantyFilter.size) list = list.filter((p) => warrantyFilter.has(p.warranty));
    const mn = parseFloat(minPrice), mx = parseFloat(maxPrice);
    if (!isNaN(mn)) list = list.filter((p) => p.price >= mn);
    if (!isNaN(mx)) list = list.filter((p) => p.price <= mx);
    if (sortBy === "price-asc") list.sort((a, b) => a.price - b.price);
    else if (sortBy === "price-desc") list.sort((a, b) => b.price - a.price);
    else if (sortBy === "name") list.sort((a, b) => a.partName.localeCompare(b.partName));
    return list;
  }, [parts, search, warrantyFilter, minPrice, maxPrice, sortBy]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { setPage(1); }, [search, warrantyFilter, minPrice, maxPrice, sortBy, modelName]);
  const pageParts = filtered.slice((page - 1) * pageSize, page * pageSize);
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(page * pageSize, total);
  const activeFilters = warrantyFilter.size + (minPrice ? 1 : 0) + (maxPrice ? 1 : 0) + (sortBy !== "none" ? 1 : 0);

  const toggleWarranty = (w: string) =>
    setWarrantyFilter((prev) => { const n = new Set(prev); n.has(w) ? n.delete(w) : n.add(w); return n; });
  const clearFilters = () => { setWarrantyFilter(new Set()); setMinPrice(""); setMaxPrice(""); setSortBy("none"); };

  // Column drag-to-reorder (native HTML5 DnD)
  const onDrop = (target: PartColKey) => {
    if (!dragCol || dragCol === target) { setDragCol(null); setOverCol(null); return; }
    setOrder((prev) => {
      const arr = prev.slice();
      arr.splice(arr.indexOf(dragCol), 1);
      arr.splice(arr.indexOf(target), 0, dragCol);
      return arr;
    });
    setDragCol(null); setOverCol(null);
  };

  const copy = (t: string) => { try { navigator.clipboard?.writeText(t); } catch { /* clipboard unavailable */ } };

  // Fixed column widths keep headers aligned with content and stop the Part
  // Name column from hogging space. All columns are centre-aligned.
  const COL_WIDTH: Record<PartColKey, string> = {
    image: "w-28", part: "", price: "w-40", warranty: "w-40",
  };

  const headerCell = (key: PartColKey) => (
    <th
      key={key}
      draggable
      onDragStart={() => setDragCol(key)}
      onDragOver={(e) => { e.preventDefault(); setOverCol(key); }}
      onDragEnd={() => { setDragCol(null); setOverCol(null); }}
      onDrop={() => onDrop(key)}
      className={cn(
        "px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/70 cursor-grab select-none whitespace-nowrap",
        COL_WIDTH[key],
        overCol === key && dragCol && dragCol !== key && "bg-[#DCE3FB]",
        dragCol === key && "opacity-50"
      )}
      title="Drag to reorder column"
    >
      <span className="inline-flex items-center justify-center gap-1">
        <GripVertical className="h-3 w-3 opacity-40" />
        {PART_COL_LABEL[key]}
      </span>
    </th>
  );

  const bodyCell = (key: PartColKey, part: DevicePart) => {
    if (key === "image") return (
      <td key={key} className="px-3 py-3.5 align-middle">
        <div className="mx-auto grid h-14 w-14 place-items-center overflow-hidden rounded-xl border border-border bg-muted/40">
          {part.imageUrl
            ? <img src={part.imageUrl} alt={part.partName} className="h-full w-full object-cover" />
            : <ImageIcon className="h-5 w-5 text-muted-foreground/40" />}
        </div>
      </td>
    );
    if (key === "part") return (
      <td key={key} className="px-4 py-3.5 text-center align-middle">
        <p className="text-[14px] font-semibold leading-tight text-foreground">{part.partName}</p>
      </td>
    );
    if (key === "price") return (
      <td key={key} className="px-4 py-3.5 text-center align-middle">
        {part.priceKnown === false
          ? <span className="text-[13px] font-medium text-muted-foreground">N/A</span>
          : <span className="text-[16px] font-extrabold tracking-tight tabular-nums text-foreground">{formatINR(part.price)}</span>}
      </td>
    );
    // warranty
    return (
      <td key={key} className="px-4 py-3.5 align-middle">
        <div className="flex justify-center"><WarrantyBadge warranty={part.warranty} /></div>
      </td>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-border bg-card shadow-card overflow-hidden"
    >
      {/* Header + Search + Filter */}
      <div className="flex flex-col items-center border-b border-border px-5 pt-4 pb-3 gap-3">
        <h3 className="text-[16px] font-bold text-foreground">Parts & Pricing</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search part..."
              className="h-8 w-48 rounded-lg border border-border bg-muted/50 pl-8 pr-3 text-[12px] placeholder:text-muted-foreground focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
            />
          </div>
          <Dropdown
            align="right"
            width="w-72"
            trigger={({ toggle, open }) => (
              <button
                onClick={toggle}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition",
                  activeFilters ? "border-brand-300 bg-brand-50 text-brand-700" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Filter className="h-3 w-3" /> Filter
                {activeFilters > 0 && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white">{activeFilters}</span>
                )}
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
              </button>
            )}
          >
            {(close) => (
              <div className="p-1">
                <MenuLabel>Sort by</MenuLabel>
                {([["none", "Default"], ["price-asc", "Price: Low to High"], ["price-desc", "Price: High to Low"], ["name", "Name (A–Z)"]] as const).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setSortBy(v)}
                    className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]", sortBy === v ? "bg-[#EEF1FD] font-medium text-[#3347D6]" : "hover:bg-muted")}
                  >
                    <Check className={cn("h-3.5 w-3.5 text-[#4361EE]", sortBy === v ? "opacity-100" : "opacity-0")} /> {l}
                  </button>
                ))}
                {warrantyOptions.length > 0 && (
                  <>
                    <MenuLabel>Warranty</MenuLabel>
                    <div className="flex flex-wrap gap-1.5 px-2.5 pb-2">
                      {warrantyOptions.map((w) => (
                        <button
                          key={w}
                          onClick={() => toggleWarranty(w)}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition",
                            warrantyFilter.has(w) ? "bg-brand-500 text-white ring-brand-500" : "bg-muted text-muted-foreground ring-border hover:bg-muted/70"
                          )}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <MenuLabel>Price range (₹)</MenuLabel>
                <div className="flex items-center gap-2 px-2.5 pb-2">
                  <input value={minPrice} onChange={(e) => setMinPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Min" inputMode="numeric" className="h-8 w-full rounded-lg border border-border bg-card px-2 text-[12px] focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200" />
                  <span className="text-muted-foreground">–</span>
                  <input value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Max" inputMode="numeric" className="h-8 w-full rounded-lg border border-border bg-card px-2 text-[12px] focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200" />
                </div>
                <div className="flex items-center justify-between border-t border-border px-2.5 pt-2">
                  <button onClick={clearFilters} className="text-[12px] font-medium text-muted-foreground hover:text-foreground">Clear all</button>
                  <button onClick={close} className="rounded-lg bg-brand-500 px-3 py-1.5 text-[12px] font-semibold text-white">Done</button>
                </div>
              </div>
            )}
          </Dropdown>
        </div>
      </div>

      {activeTab !== "parts" ? (
        <div className="grid place-items-center py-16 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-muted"><Info className="h-6 w-6 text-muted-foreground/50" /></div>
          <p className="text-sm font-medium">Coming soon</p>
          <p className="mt-1 text-[12px] text-muted-foreground">This section isn&apos;t available yet.</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#EEF1FD] border-b border-[#D6DDFB]">
                  <th className="w-14 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/70">#</th>
                  {order.map((key) => headerCell(key))}
                  <th className="w-24 py-3 px-4 text-center text-[11px] font-semibold uppercase tracking-wider text-[#4361EE]/70">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageParts.map((part, idx) => (
                  <tr key={part.id} className="border-b-2 border-slate-100 transition-colors hover:bg-brand-50/40">
                    <td className="py-3.5 text-center align-middle text-[13px] font-semibold tabular-nums text-muted-foreground">{(page - 1) * pageSize + idx + 1}</td>
                    {order.map((key) => bodyCell(key, part))}
                    <td className="py-3.5 px-4 align-middle">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setDetail(part)} title="View details" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-[#EEF1FD] hover:text-[#4361EE]">
                          <Eye className="h-4 w-4" />
                        </button>
                        <Dropdown
                          align="right"
                          width="w-52"
                          trigger={({ toggle }) => (
                            <button onClick={toggle} title="More actions" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          )}
                        >
                          {(close) => (
                            <>
                              <MenuItem icon={Eye} onClick={() => { setDetail(part); close(); }}>View details</MenuItem>
                              <MenuItem icon={Copy} onClick={() => { copy(part.priceKnown === false ? "N/A" : formatINR(part.price)); close(); }}>Copy price</MenuItem>
                              {part.partNumber && <MenuItem icon={Copy} onClick={() => { copy(part.partNumber); close(); }}>Copy SKU</MenuItem>}
                              <MenuItem icon={Copy} onClick={() => { copy(part.partName); close(); }}>Copy part name</MenuItem>
                              <div className="my-1 border-t border-border" />
                              <Link href="/settings/inventory/price-lists" onClick={close} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-[#EEF1FD]">
                                <Settings2 className="h-4 w-4 opacity-70" /> Manage in Settings
                              </Link>
                            </>
                          )}
                        </Dropdown>
                      </div>
                    </td>
                  </tr>
                ))}
                {pageParts.length === 0 && (
                  <tr><td colSpan={order.length + 2} className="py-14 text-center text-sm text-muted-foreground">No parts match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <p className="text-[12px] text-muted-foreground">Showing {startIdx} to {endIdx} of {total} parts</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 transition"><ChevronLeft className="h-3.5 w-3.5" /></button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setPage(p)} className={cn("grid h-8 w-8 place-items-center rounded-lg text-[12px] font-medium transition", p === page ? "bg-brand-500 text-white shadow-sm" : "border border-border text-muted-foreground hover:bg-muted")}>{p}</button>
              ))}
              {totalPages > 5 && <span className="px-1 text-muted-foreground">...</span>}
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 transition"><ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </>
      )}

      <PartDetailDrawer part={detail} modelName={modelName} onClose={() => setDetail(null)} />
    </motion.div>
  );
}

/* ─── Part detail drawer (eye action) — elegant, aligned key/value view ── */
function PartDetailDrawer({ part, modelName, onClose }: { part: DevicePart | null; modelName: string; onClose: () => void }) {
  return (
    <Drawer open={!!part} onClose={onClose} title={part?.partName ?? "Part"} subtitle={modelName} icon={Wrench} width="max-w-md">
      {part && (
        <div className="space-y-4">
          <div className="grid place-items-center rounded-2xl border border-border bg-muted/30 p-4">
            <div className="grid h-40 w-full place-items-center overflow-hidden rounded-xl bg-white">
              {part.imageUrl
                ? <img src={part.imageUrl} alt={part.partName} className="max-h-40 w-auto object-contain" />
                : <div className="flex flex-col items-center text-muted-foreground/50"><ImageIcon className="h-10 w-10" /><span className="mt-2 text-[11px]">No image uploaded</span></div>}
            </div>
          </div>
          <div className="rounded-xl border border-border divide-y divide-border px-4">
            <DetailRow label="Part name">{part.partName}</DetailRow>
            <DetailRow label="Repair category"><RepairCategoryBadge category={part.repairCategory} /></DetailRow>
            <DetailRow label="Part number / SKU"><span className="font-mono text-[12px]">{part.partNumber || "—"}</span></DetailRow>
            <DetailRow label="Price">{part.priceKnown === false ? "N/A" : <span className="font-bold">{formatINR(part.price)}</span>}</DetailRow>
            <DetailRow label="Warranty">{part.warranty}</DetailRow>
            <DetailRow label="Availability">{part.priceKnown === false ? "N/A" : <AvailabilityBadge availability={part.availability} />}</DetailRow>
            <DetailRow label="Last updated">{part.lastUpdated}</DetailRow>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ─── Badge Helpers ──────────────────────────────────────────────── */
// Stable colour per repair category so the table reads at a glance.
const REPAIR_CATEGORY_TONE: Record<string, string> = {
  Display: "bg-indigo-50 text-indigo-700",
  Glass: "bg-sky-50 text-sky-700",
  Battery: "bg-emerald-50 text-emerald-700",
  Camera: "bg-fuchsia-50 text-fuchsia-700",
  Buttons: "bg-amber-50 text-amber-700",
  Audio: "bg-violet-50 text-violet-700",
  Charging: "bg-teal-50 text-teal-700",
  Motherboard: "bg-rose-50 text-rose-700",
  Keyboard: "bg-cyan-50 text-cyan-700",
  Cooling: "bg-blue-50 text-blue-700",
  Sensor: "bg-orange-50 text-orange-700",
  Biometrics: "bg-purple-50 text-purple-700",
  Housing: "bg-stone-100 text-stone-700",
  Accessories: "bg-lime-50 text-lime-700",
  General: "bg-zinc-100 text-zinc-600",
};

function RepairCategoryBadge({ category }: { category?: string }) {
  const c = category || "General";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", REPAIR_CATEGORY_TONE[c] ?? REPAIR_CATEGORY_TONE.General)}>
      {c}
    </span>
  );
}

function WarrantyBadge({ warranty }: { warranty: string }) {
  const tone = warranty.includes("6") ? "success" : warranty.includes("3") ? "brand" : "neutral";
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
      tone === "success" && "bg-emerald-50 text-emerald-700",
      tone === "brand" && "bg-blue-50 text-blue-700",
      tone === "neutral" && "bg-orange-50 text-orange-700",
    )}>
      {warranty}
    </span>
  );
}

function AvailabilityBadge({ availability }: { availability: DevicePart["availability"] }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[12px] font-medium",
      availability === "In Stock" && "text-emerald-600",
      availability === "Limited" && "text-amber-600",
      availability === "Out of Stock" && "text-rose-600",
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        availability === "In Stock" && "bg-emerald-500",
        availability === "Limited" && "bg-amber-500",
        availability === "Out of Stock" && "bg-rose-500",
      )} />
      {availability}
    </span>
  );
}

/* ─── Empty State ────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-16 text-center">
      <div className="h-16 w-16 rounded-2xl bg-brand-50 grid place-items-center mb-4">
        <Laptop className="h-8 w-8 text-brand-400" />
      </div>
      <h3 className="text-lg font-semibold">Select a Device</h3>
      <p className="mt-1 text-[13px] text-muted-foreground max-w-sm">
        Choose a Category, Brand, and Model from the left panel to view device details and part pricing.
      </p>
    </div>
  );
}
