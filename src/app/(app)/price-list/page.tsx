"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, ChevronRight, ChevronDown, ChevronUp,
  Smartphone, Tablet, Laptop, Monitor, Watch, Headphones,
  Gamepad2, Plane, Box, Upload, Download, Plus, Clock,
  User, Cpu, HardDrive, MonitorSmartphone, Calendar,
  Info, MoreHorizontal, Pencil, Eye, Wrench, X, Tag,
  Image as ImageIcon, GripVertical, Copy, Settings2, Check,
  FileSpreadsheet, FileText, Loader2, Trash2, Images,
} from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dropdown, MenuItem, MenuLabel } from "@/components/ui/dropdown";
import { Drawer, DetailRow } from "@/components/ui/drawer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useCatalog, brandsForCategory, modelsForBrand, partsForModel, sortCategories } from "@/lib/catalog-context";
import { uploadCatalogImage } from "@/components/settings/catalog/upload-image";
import { collectMedia } from "@/components/settings/catalog/media-library";
import { parseCatalogCSV, validateRows, catalogToCSV, downloadCSV, downloadCatalogXLSX, toCSV } from "@/lib/csv-utils";
import { readSheet, readSheetByName } from "@/lib/sheet-reader";
import { parseSmartSheet, type SmartImportResult } from "@/lib/smart-import";
import { SmartImportDialog } from "@/components/price-list/smart-import-dialog";
import { rememberOrigin } from "@/lib/settings-origin";
import { useScrollCollapse } from "@/hooks/use-scroll-collapse";
import { Pagination } from "@/components/ui/pagination";
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
/** Left-edge reveal strip width (ZONE A). Narrow + fixed so it never overlaps
 *  the browser/workspace divider and can't act as a close trigger. */
const REVEAL_ZONE_WIDTH = 14;
/** Hover-intent window. Short and intentional (not an artificial timeout) — a
 *  pointer merely crossing the divider won't flip the expanded/collapsed state. */
const HOVER_INTENT_MS = 180;

/* ─── Rotating search hints (fade only, no layout shift) ─────────────
   Top search operates on the DEVICE / MODEL dataset only — never Parts. */
const SEARCH_HINTS = [
  "Search models...",
  "Search MacBook Air...",
  "Search iPhone 15 Pro...",
  "Search device models...",
] as const;

/* ─── Rotating Parts search hints (fade only, no layout shift) ───────
   Parts search operates on the PARTS dataset only — never Models. */
const PART_SEARCH_HINTS = [
  "Search parts...",
  "Search battery...",
  "Search screen...",
  "Search charging port...",
  "Search keyboard...",
  "Search motherboard...",
  "Search speaker...",
] as const;

/* ─── Main Page Component ────────────────────────────────────────── */
export default function PriceListPage() {
  const { categories, brands, models, parts: allParts, importRows, importSmartModels } = useCatalog();
  const router = useRouter();
  const urlParams = useSearchParams();

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
  // Rotating placeholder hint (fade transition only, no layout shift)
  const [hintIndex, setHintIndex] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
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

  // ── Device Information (hero) collapse ──────────────────────────────────
  // Scroll-aware, with a manual override that scroll must not silently undo.
  //  manualCollapse === null  → follow the scroll suggestion
  //  manualCollapse === true  → user manually collapsed (stays collapsed while
  //                             scrolling within the page)
  //  manualCollapse === false → user manually expanded
  // The override is cleared automatically once the user scrolls back to the
  // very top, handing control back to the scroll behaviour (and expanding).
  const { anchorRef: heroScrollAnchor, shouldCollapse } = useScrollCollapse({
    enabled: !!selectedModelId,
  });
  const [manualCollapse, setManualCollapse] = useState<boolean | null>(null);
  const heroCollapsed = manualCollapse ?? shouldCollapse;

  // When the scroll driver reports we're back near the top (shouldCollapse
  // false), release any manual override so auto behaviour resumes.
  const prevShouldCollapse = useRef(shouldCollapse);
  useEffect(() => {
    if (prevShouldCollapse.current && !shouldCollapse) setManualCollapse(null);
    prevShouldCollapse.current = shouldCollapse;
  }, [shouldCollapse]);

  // A new model selection resets to the default (expanded) state.
  useEffect(() => { setManualCollapse(null); }, [selectedModelId]);

  const toggleHeroCollapse = useCallback(() => {
    setManualCollapse((prev) => !(prev ?? shouldCollapse));
  }, [shouldCollapse]);

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

  // Rotate the placeholder hint on a slow cycle, pausing while the user types.
  // Fades out, swaps text, fades back in — the input layout never shifts.
  useEffect(() => {
    if (globalSearch) return; // don't rotate while there's a query
    const CYCLE_MS = 3600;
    const FADE_MS = 400;
    const id = setInterval(() => {
      setHintVisible(false);
      setTimeout(() => {
        setHintIndex((i) => (i + 1) % SEARCH_HINTS.length);
        setHintVisible(true);
      }, FADE_MS);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [globalSearch]);

  // Restore context when returning from Settings → Price List. The Add Price
  // action encodes the exact selection + part search in the URL so Back lands
  // the user right where they were. Runs once on mount.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const cat = urlParams.get("cat");
    const brand = urlParams.get("brand");
    const model = urlParams.get("model");
    const ps = urlParams.get("q");
    if (cat) setSelectedCategoryId(cat);
    if (brand) setSelectedBrandId(brand);
    if (model) setSelectedModelId(model);
    if (ps) setPartSearch(ps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Categories follow the administrator-defined order (sortCategories); this is
  // the SAME source of truth used by Settings → Device Catalog. Brands/models
  // below are sorted A–Z inside brandsForCategory / modelsForBrand.
  const visibleCategories = useMemo(
    () => sortCategories(categories.filter((c) => c.enabled ?? true)).map((c) => ({ ...c, count: catModelCount.get(c.id) ?? 0 })),
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

  // "+ Add Price" → Settings → Price List (the central admin area). We record
  // the exact Price List context (selected category/brand/model + part search)
  // as the return URL so the Settings Back button lands the user right back
  // here rather than on the Shop dashboard.
  const handleAddPrice = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedCategoryId) params.set("cat", selectedCategoryId);
    if (selectedBrandId) params.set("brand", selectedBrandId);
    if (selectedModelId) params.set("model", selectedModelId);
    if (partSearch.trim()) params.set("q", partSearch.trim());
    const returnTo = `/price-list${params.toString() ? `?${params.toString()}` : ""}`;
    rememberOrigin({ key: "price-list", label: "Price List", returnTo });
    // Carry the current category/brand/model into Settings so the Parts tab
    // opens with them preselected — no manual re-selection needed.
    const q = new URLSearchParams({ tab: "parts", from: "price-list" });
    if (selectedCategoryId) q.set("cat", selectedCategoryId);
    if (selectedBrandId) q.set("brand", selectedBrandId);
    if (selectedModelId) q.set("model", selectedModelId);
    router.push(`/settings/inventory/price-lists?${q.toString()}`);
  }, [router, selectedCategoryId, selectedBrandId, selectedModelId, partSearch]);

  // General "Settings" entry → Device Catalog (Categories tab). Remembers the
  // exact Price List context so the Settings "← Back to Price List" control
  // returns the user right here (same pattern as Tickets/Invoice).
  const handleOpenCatalogSettings = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedCategoryId) params.set("cat", selectedCategoryId);
    if (selectedBrandId) params.set("brand", selectedBrandId);
    if (selectedModelId) params.set("model", selectedModelId);
    if (partSearch.trim()) params.set("q", partSearch.trim());
    const returnTo = `/price-list${params.toString() ? `?${params.toString()}` : ""}`;
    rememberOrigin({ key: "price-list", label: "Price List", returnTo });
    router.push("/settings/inventory/price-lists?tab=categories&from=price-list");
  }, [router, selectedCategoryId, selectedBrandId, selectedModelId, partSearch]);

  // "Edit Model" (Device Hero) → Settings → Device Catalog, Models tab, with the
  // current category/brand/model preselected. Remembers the Price List context
  // so "← Back to Price List" returns the user to this exact device.
  const handleEditModel = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedCategoryId) params.set("cat", selectedCategoryId);
    if (selectedBrandId) params.set("brand", selectedBrandId);
    if (selectedModelId) params.set("model", selectedModelId);
    if (partSearch.trim()) params.set("q", partSearch.trim());
    const returnTo = `/price-list${params.toString() ? `?${params.toString()}` : ""}`;
    rememberOrigin({ key: "price-list", label: "Price List", returnTo });
    const q = new URLSearchParams({ tab: "models", from: "price-list" });
    if (selectedCategoryId) q.set("cat", selectedCategoryId);
    if (selectedBrandId) q.set("brand", selectedBrandId);
    if (selectedModelId) q.set("model", selectedModelId);
    router.push(`/settings/inventory/price-lists?${q.toString()}`);
  }, [router, selectedCategoryId, selectedBrandId, selectedModelId, partSearch]);

  /* ── Top search — MODELS ONLY ──
     Operates strictly on the device/model dataset: model name, brand, category,
     year and model-level metadata. It deliberately does NOT search Parts, so
     typing "Battery" never surfaces a part here (use the Parts search for that). */
  const globalResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return { models: [] as PriceListModel[] };
    const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
    const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "";
    const modelMatches = models
      .filter((m) => {
        const metaHit = Object.values(m.meta ?? {}).some((v) =>
          String(v).toLowerCase().includes(q));
        return (
          m.name.toLowerCase().includes(q) ||
          brandName(m.brandId).toLowerCase().includes(q) ||
          catName(m.categoryId).toLowerCase().includes(q) ||
          String(m.year ?? "").toLowerCase().includes(q) ||
          (m.chip ?? "").toLowerCase().includes(q) ||
          (m.variant ?? "").toLowerCase().includes(q) ||
          metaHit
        );
      })
      .slice(0, 8);
    return { models: modelMatches };
  }, [globalSearch, models, categories, brands]);

  const hasResults = globalResults.models.length > 0;

  const jumpToModel = useCallback((m: PriceListModel) => {
    setSelectedCategoryId(m.categoryId);
    setSelectedBrandId(m.brandId);
    setSelectedModelId(m.id);
    setPartSearch("");
    setGlobalSearch("");
    setSearchOpen(false);
  }, []);

  /* ── Import / Export against the live catalog ── */
  const handleExportExcel = useCallback(() => {
    void downloadCatalogXLSX(
      `repairox-price-list-${new Date().toISOString().slice(0, 10)}`,
      categories, brands, models, allParts,
    );
  }, [categories, brands, models, allParts]);
  const handleExportCSV = useCallback(() => {
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

  /* ────────────────────────────────────────────────────────────────
     FOCUS MODE — stable interaction model (no flicker)

     One state variable (`navVisible`) is the single source of truth for
     EXPANDED (true) / COLLAPSED (false). It is driven only by explicit,
     non-overlapping pointer zones — never by the animating panel itself, so
     the panel resizing under the cursor can never re-trigger a state change:

       • ZONE A — left-edge reveal strip (fixed 14px, non-animating):
         pointer-enter here (with hover intent) → EXPAND.
       • ZONE B — main workspace (Device Hero + Parts & Pricing):
         pointer clearly inside → COLLAPSE (after a short intent delay).
       • ZONE C — the browser panel + a transition buffer: PRESERVE state.
         Entering the panel cancels any pending collapse; it never toggles.

     Delays use a short hover-intent window (HOVER_INTENT_MS) so crossing the
     divider doesn't switch states. Layout does not reflow: the panel's slot
     keeps a stable width and the content slides via transform (see markup). */
  const clearHoverTimer = useCallback(() => {
    if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = null; }
  }, []);

  // ZONE A — deliberate left-edge reveal (expand).
  const revealBrowser = useCallback(() => {
    if (!focusMode) return;
    clearHoverTimer();
    hoverTimeoutRef.current = setTimeout(() => setNavVisible(true), HOVER_INTENT_MS);
  }, [focusMode, clearHoverTimer]);

  // ZONE B — pointer clearly inside the main workspace (collapse).
  const collapseFromWorkspace = useCallback(() => {
    if (!focusMode) return;
    // Only meaningful once a model is chosen and the browser is open.
    clearHoverTimer();
    hoverTimeoutRef.current = setTimeout(() => setNavVisible(false), HOVER_INTENT_MS);
  }, [focusMode, clearHoverTimer]);

  // ZONE C — inside the browser panel / buffer: preserve the open state and
  // cancel any pending collapse. Never expands on its own (it's already open).
  const holdBrowserOpen = useCallback(() => {
    if (!focusMode) return;
    clearHoverTimer();
  }, [focusMode, clearHoverTimer]);

  // Keep the browser open while typing in a search box (search focus must not
  // let a stray collapse timer fire mid-interaction).
  const keepNavOpen = useCallback(() => {
    clearHoverTimer();
    setNavVisible(true);
  }, [clearHoverTimer]);

  useEffect(() => {
    return () => { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); };
  }, []);

  const panelOpen = !focusMode || navVisible;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            {/* Spotlight glow — stronger on first load, settles into a subtle idle breathe */}
            <div className="pointer-events-none absolute -inset-[3px] rounded-xl animate-search-spotlight group-hover/search:[animation-play-state:paused] group-focus-within/search:[animation-play-state:paused]" />
            <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground/70 transition-colors duration-200 group-focus-within/search:text-[#4361EE]" />
            {/* Rotating placeholder hint — fades only, never shifts layout. Hidden once the user types. */}
            {!globalSearch && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-10 top-1/2 z-10 -translate-y-1/2 truncate pr-9 text-sm font-bold text-muted-foreground/70 transition-opacity duration-[400ms] ease-in-out"
                style={{ opacity: hintVisible ? 1 : 0, maxWidth: "calc(100% - 3.5rem)" }}
              >
                {SEARCH_HINTS[hintIndex]}
              </span>
            )}
            <input
              value={globalSearch}
              onChange={(e) => { setGlobalSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setGlobalSearch(""); setSearchOpen(false); }
                if (e.key === "Enter" && globalResults.models[0]) jumpToModel(globalResults.models[0]);
              }}
              aria-label="Search models"
              placeholder={SEARCH_HINTS[hintIndex]}
              className="relative h-10 w-80 rounded-xl border-2 border-[#4361EE]/40 bg-card pl-10 pr-9 text-sm shadow-[0_1px_3px_0_rgba(67,97,238,0.06),0_1px_2px_-1px_rgba(20,30,80,0.04)] placeholder:text-transparent transition-all duration-200 hover:border-[#4361EE]/60 hover:shadow-[0_2px_8px_-2px_rgba(67,97,238,0.16)] focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/20 focus:shadow-[0_0_0_3px_rgba(67,97,238,0.1),0_4px_14px_-4px_rgba(67,97,238,0.22)]"
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
                  <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">No models found.</p>
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
              </div>
            )}
          </div>

          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => handleImportFile(e.target.files?.[0])}
          />
          <Dropdown
            width="w-52"
            trigger={({ toggle }) => (
              <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={toggle}>
                <Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={FileSpreadsheet} onClick={() => { handleExportExcel(); close(); }}>
                  Excel (.xlsx)
                </MenuItem>
                <MenuItem icon={FileText} onClick={() => { handleExportCSV(); close(); }}>
                  CSV (.csv)
                </MenuItem>
              </>
            )}
          </Dropdown>
          <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={handleOpenCatalogSettings} title="Open Device Catalog settings">
            <Settings2 className="h-3.5 w-3.5" /> Settings
          </Button>
          <Button size="sm" className="gap-1.5 rounded-xl" onClick={handleAddPrice}>
            <Plus className="h-3.5 w-3.5" /> Add Price
          </Button>
        </div>
      </div>

      {/* Import result notice */}
      {importNotice && (
        <div className={cn(
          "mx-auto flex w-full max-w-[1400px] items-center gap-2 rounded-xl border px-4 py-2.5 text-[12px]",
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
          never stretches to match a tall parts table (no empty gap below).
          mx-auto + max-w center the ENTIRE workspace group (Devices rail +
          main content) as one unit, so the left and right outer gutters stay
          visually balanced on wide viewports. w-full keeps it flush and
          overflow-free on smaller screens. */}
      <div className="mx-auto flex w-full max-w-[1400px] items-start relative">
        {/*
          ZONE A — LEFT-EDGE REVEAL STRIP (collapsed state only).
          A fixed, narrow (REVEAL_ZONE_WIDTH), NON-animating strip anchored to
          the content's left edge. Hover-intent here re-opens the browser. It is
          the ONLY reopen trigger — the divider between panel and workspace is
          deliberately NOT a trigger, which is what stops oscillation. It also
          hosts the visible "Devices" handle so revealing is discoverable
          (hover reveals; a click reveals immediately too).
        */}
        {focusMode && !navVisible && (
          <div
            className="sticky top-[76px] self-start mr-4 shrink-0 h-[calc(100vh-92px)]"
            style={{ width: REVEAL_ZONE_WIDTH + 48 }}
            onMouseEnter={revealBrowser}
            onMouseLeave={clearHoverTimer}
          >
            <button
              type="button"
              onClick={() => { clearHoverTimer(); setNavVisible(true); }}
              className="group flex h-full w-12 flex-col items-center justify-center gap-5 rounded-2xl border border-border bg-card shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50"
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
          </div>
        )}

        {/*
          UNIFIED DEVICE BROWSER PANEL (ZONE C).
          The outer motion.div animates its WIDTH to reclaim/return layout
          space, but it carries NO hover handlers — so it can never re-trigger a
          state change while it resizes under the cursor (this was the flicker
          source). Hover intent lives on the STABLE inner content (holdBrowserOpen)
          which keeps a fixed PANEL_WIDTH and slides via transform, plus a small
          transition buffer on its right edge that preserves the open state.
        */}
        <motion.div
          className="shrink-0 overflow-hidden sticky top-[76px] self-start h-[calc(100vh-92px)]"
          animate={{
            width: panelOpen ? PANEL_WIDTH : 0,
            marginRight: panelOpen ? 16 : 0,
          }}
          transition={SPRING}
          style={{ willChange: "width, margin" }}
        >
          <motion.div
            className="flex gap-3.5 h-full"
            style={{ width: PANEL_WIDTH }}
            animate={{
              x: panelOpen ? 0 : -PANEL_WIDTH,
              opacity: panelOpen ? 1 : 0,
            }}
            transition={SPRING}
            onMouseEnter={holdBrowserOpen}
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

        {/*
          ZONE C — TRANSITION BUFFER. A small, invisible neutral gutter between
          the browser and the main workspace. The pointer crossing this band
          PRESERVES the current state (it cancels a pending collapse but never
          toggles), so travelling from the Model list into the Parts table does
          not flip the sidebar. Only visible/active in focus mode when open.
        */}
        {focusMode && navVisible && (
          <div
            aria-hidden="true"
            className="shrink-0 self-stretch"
            style={{ width: 16 }}
            onMouseEnter={holdBrowserOpen}
          />
        )}

        {/* ─── Right Workspace (ZONE B): Hero Card + Parts Table ─────
            Pointer clearly inside here → collapse the browser (after a short
            hover-intent delay). This is the ONLY collapse trigger, and because
            it sits past the transition buffer it can't fight the panel's
            reveal. */}
        <div
          ref={heroScrollAnchor as React.RefObject<HTMLDivElement>}
          className="flex-1 min-w-0 space-y-4 [overflow-x:clip]"
          onMouseEnter={collapseFromWorkspace}
        >
          {/* Guard: a stray move back toward the browser cancels the pending
              collapse so the panel doesn't close after the pointer left. */}
          {selectedModel ? (
            <>
              <DeviceHeroCard
                model={selectedModel}
                brand={selectedBrand}
                category={selectedCategory}
                parts={modelParts}
                collapsed={heroCollapsed}
                onToggleCollapse={toggleHeroCollapse}
                onEditModel={handleEditModel}
              />
              <PartsAndPricing
                parts={modelParts}
                modelName={selectedModel.name}
                search={partSearch}
                onSearchChange={setPartSearch}
                onManageInSettings={handleAddPrice}
              />
            </>
          ) : (
            <EmptyState />
          )}
        </div>
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
  parts = [],
  collapsed = false,
  onToggleCollapse,
  onEditModel,
}: {
  model: PriceListModel;
  brand: PriceListBrand | null;
  category: DeviceCategory | null;
  parts?: DevicePart[];
  /** Scroll-aware / manual collapse state. When true, show the compact header. */
  collapsed?: boolean;
  /** Toggle handler for the expand/collapse chevron control. */
  onToggleCollapse?: () => void;
  /** Opens the model in Settings → Device Catalog (Models tab). */
  onEditModel?: () => void;
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
  // Format an ISO timestamp down to a plain readable date (no time / timezone).
  // Falls back to the original value if it isn't a parseable date.
  const toDate = (value?: string | number | null): string => {
    if (value === undefined || value === null || String(value).trim() === "") return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };
  pushField(Box, "Brand", brand?.name);
  pushField(MonitorSmartphone, "Category", category?.name, true);
  pushField(Cpu, "Chip", model.chip);
  pushField(Monitor, "Display Size", model.displaySize);
  pushField(HardDrive, "Storage (Base)", model.storage);
  pushField(Calendar, "Model Year", model.modelYear || model.year);
  pushField(Tag, "Variant", model.variant);
  // Last Updated takes the slot Created On used to occupy. It stays synced to
  // the most recent change across the model itself AND its parts — whichever
  // was touched last wins, so editing any part refreshes this value.
  const lastUpdatedRaw = (() => {
    const candidates = [model.lastUpdated, model.createdOn, ...parts.map((p) => p.lastUpdated)];
    let bestTime = -Infinity;
    let bestRaw = "";
    for (const c of candidates) {
      if (!c) continue;
      const t = new Date(c).getTime();
      if (!isNaN(t) && t > bestTime) {
        bestTime = t;
        bestRaw = String(c);
      }
      if (!bestRaw) bestRaw = String(c); // keep a fallback even if unparseable
    }
    return bestRaw || model.lastUpdated || model.createdOn;
  })();
  pushField(Clock, "Last Updated", toDate(lastUpdatedRaw));
  // Extra imported metadata
  for (const [k, v] of Object.entries(model.meta ?? {})) pushField(Tag, k, v);
  pushField(User, "Updated By", model.updatedBy);

  // Smooth height compression between the full hero and the compact header.
  // Animating height:auto ⇄ auto (measured) via framer-motion keeps the Parts
  // table flush beneath — no reserved blank space when collapsed.
  const EASE = [0.22, 1, 0.36, 1] as const;

  return (
    <motion.div
      key={model.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="relative rounded-2xl border border-zinc-300 bg-card shadow-card overflow-hidden"
    >
      {/* Expand / collapse control — small chevron, part of the card. Up = collapse,
          Down = expand, matching the resting direction of the content. */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand device information" : "Collapse device information"}
        title={collapsed ? "Expand device information" : "Collapse device information"}
        className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-lg border border-foreground bg-brand-50 text-brand-600 shadow-sm transition-colors hover:bg-brand-100 hover:text-brand-700"
      >
        {collapsed
          ? <ChevronDown className="h-4 w-4" />
          : <ChevronUp className="h-4 w-4" />}
      </button>

      <AnimatePresence initial={false} mode="wait">
        {collapsed ? (
          /* ── Compact header — keeps the selected-model context in one row ── */
          <motion.div
            key="compact"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex items-center gap-3 px-4 py-2.5 pr-14">
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-white">
                {model.imageUrl
                  ? <img src={model.imageUrl} alt={model.name} className="h-full w-full object-contain" />
                  : <CategoryIcon className="h-5 w-5 text-brand-400/70" />}
              </span>
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-[15px] font-bold tracking-tight">{model.name} ({model.year})</h2>
                <Badge tone={isActive ? "success" : "neutral"} dot={isActive}>
                  {isActive ? "Active" : "Discontinued"}
                </Badge>
              </div>
              <Button variant="outline" size="sm" className="ml-auto gap-1.5 rounded-xl text-[12px] shrink-0" onClick={onEditModel}>
                <Pencil className="h-3 w-3" /> Edit Model
              </Button>
            </div>
          </motion.div>
        ) : (
          /* ── Full hero — unchanged expanded layout ── */
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div className="flex items-stretch">
              {/* Device image — uploaded image (from Settings → Price List) fills the
                  whole panel. Falls back to a category illustration when none exists.
                  Never a broken image. */}
              <div className="w-[220px] shrink-0 self-center h-[150px] bg-white flex items-start justify-center relative overflow-hidden px-2 py-2">
                {model.imageUrl ? (
                  <img
                    src={model.imageUrl}
                    alt={model.name}
                    className="h-full w-full min-h-0 object-contain object-top rounded-xl"
                  />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(67,97,238,0.08),transparent_70%)]" />
                    <div className="relative">
                      <CategoryIcon className="h-16 w-16 text-brand-400/70" />
                    </div>
                  </>
                )}
              </div>
              <div className="flex-1 p-5 pr-14 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-bold tracking-tight truncate">{model.name} ({model.year})</h2>
                      <Badge tone={isActive ? "success" : "neutral"} dot={isActive}>
                        {isActive ? "Active" : "Discontinued"}
                      </Badge>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-[12px] shrink-0" onClick={onEditModel}>
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
        )}
      </AnimatePresence>
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
// Fallback pin offset (px) used only until the real topbar height is measured
// at runtime. The measured value replaces this so the section header sits
// flush beneath the app topbar with no gap.
const STICKY_TOP = 60;

type PartColKey = "image" | "part" | "price" | "warranty";
const PART_COL_LABEL: Record<PartColKey, string> = {
  image: "Image", part: "Part Name", price: "Price (INR)", warranty: "Warranty",
};

/* ─── Inline Part Image cell — upload from device or reuse from library ───
   Click the thumbnail/placeholder to open a small menu. No trip to Settings. */
function PartImageCell({ part, onChange }: { part: DevicePart; onChange: (url: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setMenuOpen(false);
    const url = await uploadCatalogImage(file, "parts");
    setBusy(false);
    if (url) onChange(url);
  };

  // Close the menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.parentElement?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        title={part.imageUrl ? "Change image" : "Add image"}
        className="group grid h-12 w-12 place-items-center overflow-hidden rounded-xl border border-border bg-muted/40 transition hover:border-[#4361EE]/50 hover:bg-[#EEF1FD]/40"
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin text-[#4361EE]" />
        ) : part.imageUrl ? (
          <img src={part.imageUrl} alt={part.partName} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-5 w-5 text-muted-foreground/40 transition group-hover:text-[#4361EE]" />
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.avif,.bmp,.heic,.heif"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {menuOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-[0_12px_40px_-12px_rgba(20,30,80,0.25)]">
          <button
            onClick={() => { setMenuOpen(false); inputRef.current?.click(); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-[#EEF1FD]"
          >
            <Upload className="h-4 w-4 opacity-70" /> Upload from device
          </button>
          <button
            onClick={() => { setMenuOpen(false); setLibraryOpen(true); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors hover:bg-[#EEF1FD]"
          >
            <Images className="h-4 w-4 opacity-70" /> Choose from library
          </button>
          {part.imageUrl && (
            <>
              <div className="my-1 border-t border-border" />
              <button
                onClick={() => { setMenuOpen(false); setConfirmRemove(true); }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
              >
                <Trash2 className="h-4 w-4 opacity-80" /> Remove image
              </button>
            </>
          )}
        </div>
      )}

      {libraryOpen && (
        <PartLibraryPicker
          onClose={() => setLibraryOpen(false)}
          onPick={(url) => { onChange(url); setLibraryOpen(false); }}
        />
      )}

      {/* Confirm before removing so an accidental click can't wipe the image. */}
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => { onChange(""); setConfirmRemove(false); }}
        title="Remove this image?"
        description={`The image for "${part.partName}" will be removed. You can add it again anytime.`}
        confirmLabel="Remove Image"
      />
    </div>
  );
}

/* Library picker for the inline part cell — reuse an existing catalog image. */
function PartLibraryPicker({ onClose, onPick }: { onClose: () => void; onPick: (url: string) => void }) {
  const { categories, brands, models, parts } = useCatalog();
  const [search, setSearch] = useState("");
  const groups = useMemo(() => collectMedia({ categories, brands, models, parts }), [categories, brands, models, parts]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.map((g) => ({ ...g, images: g.images.filter((im) => im.ownerName.toLowerCase().includes(q)) }));
  }, [groups, search]);
  const total = filtered.reduce((n, g) => n + g.images.length, 0);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#EEF1FD] text-[#4361EE]"><Images className="h-4 w-4" /></span>
            <div>
              <h3 className="text-sm font-bold">Choose from library</h3>
              <p className="text-[11px] text-muted-foreground">Reuse an image already saved in the catalog</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name..." className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-[#4361EE] focus:outline-none focus:ring-2 focus:ring-[#4361EE]/15" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {total === 0 ? (
            <div className="grid place-items-center py-12 text-center text-sm text-muted-foreground">
              {search.trim() ? "No images match your search." : "No images saved in the catalog yet."}
            </div>
          ) : (
            <div className="space-y-5">
              {filtered.map((g) => g.images.length > 0 && (
                <div key={g.type}>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{g.label} · {g.images.length}</p>
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
                    {g.images.map((im) => (
                      <button
                        key={`${g.type}-${im.ownerId}-${im.url}`}
                        type="button"
                        onClick={() => onPick(im.url)}
                        title={`Use ${im.ownerName}`}
                        className="group overflow-hidden rounded-xl border border-zinc-300 bg-muted/30 text-left transition hover:border-[#4361EE] hover:shadow-card-hover"
                      >
                        <div className="aspect-square w-full overflow-hidden bg-white">
                          <img src={im.url} alt={im.ownerName} className="h-full w-full object-contain p-1.5" />
                        </div>
                        <p className="truncate border-t border-border/70 px-2 py-1 text-[10px] font-medium">{im.ownerName}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PartsAndPricing({
  parts, modelName, search, onSearchChange, onManageInSettings,
}: {
  parts: DevicePart[];
  modelName: string;
  search: string;
  onSearchChange: (v: string) => void;
  onManageInSettings: () => void;
}) {
  const { updatePart } = useCatalog();
  const [activeTab] = useState("parts");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  // Measured height of the sticky section header so the sticky table head can
  // pin exactly beneath it (no hard-coded offset → no header jumping/overlap).
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerH, setHeaderH] = useState(60);
  // Offset (px) at which the section header pins: the exact height of the app's
  // sticky topbar stack (topbar + any banners). Measured at runtime so the
  // header sits flush beneath it with NO gap, whatever the banner state.
  const [stickyTop, setStickyTop] = useState(STICKY_TOP);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    // Find the scroll container's top sticky bar (topbar + banners) and use its
    // measured height as our pin offset. Falls back to STICKY_TOP if not found.
    const findTopbar = (): HTMLElement | null => {
      let el: HTMLElement | null = headerRef.current;
      while (el && el.parentElement) {
        const p = el.parentElement;
        const style = window.getComputedStyle(p);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          // First child of the scroll container is the sticky topbar wrapper.
          const bar = p.firstElementChild as HTMLElement | null;
          return bar;
        }
        el = p;
      }
      return null;
    };
    const bar = findTopbar();
    if (!bar) return;
    const measure = () => setStickyTop(bar.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  const [order, setOrder] = useState<PartColKey[]>(["image", "part", "price", "warranty"]);
  const [dragCol, setDragCol] = useState<PartColKey | null>(null);
  const [overCol, setOverCol] = useState<PartColKey | null>(null);
  const [detail, setDetail] = useState<DevicePart | null>(null);

  // Rotating placeholder hint for the Parts search (fade transition only, no
  // layout shift). Pauses while the user is typing. Parts wording only.
  const [partHintIndex, setPartHintIndex] = useState(0);
  const [partHintVisible, setPartHintVisible] = useState(true);
  useEffect(() => {
    if (search) return; // don't rotate while there's a query
    const CYCLE_MS = 3600;
    const FADE_MS = 400;
    const id = setInterval(() => {
      setPartHintVisible(false);
      setTimeout(() => {
        setPartHintIndex((i) => (i + 1) % PART_SEARCH_HINTS.length);
        setPartHintVisible(true);
      }, FADE_MS);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [search]);

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
    else {
      // Default ("none"): keep a STABLE, meaningful order that never shifts when
      // a row is edited (e.g. an image upload triggers a DB re-fetch whose raw
      // order is undefined). Sort by SKU / part number using natural,
      // numeric-aware comparison (so 661-30002 comes before 661-30010), falling
      // back to part name when a SKU is absent. Rows with a SKU always precede
      // those without.
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      list.sort((a, b) => {
        const sa = (a.partNumber ?? "").trim();
        const sb = (b.partNumber ?? "").trim();
        if (sa && sb) return collator.compare(sa, sb) || collator.compare(a.partName, b.partName);
        if (sa) return -1;
        if (sb) return 1;
        return collator.compare(a.partName, b.partName);
      });
    }
    return list;
  }, [parts, search, warrantyFilter, minPrice, maxPrice, sortBy]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Reset to page 1 whenever the filtered set changes (search, filters, size,
  // or a different model) so the user never lands on a now-empty page.
  useEffect(() => { setPage(1); }, [search, warrantyFilter, minPrice, maxPrice, sortBy, modelName, pageSize]);
  const safePage = Math.min(page, totalPages);
  const pageParts = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
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

  // Column grid is shared by <colgroup>, header and every row so header labels
  // sit exactly over their row values. Per-column content alignment (kept
  // intentional even though widths are equal): Image & Warranty centered;
  // Part Name left; Price right; # and Actions centered.
  const alignClass: Record<PartColKey, string> = {
    image: "text-left", part: "text-left", price: "text-right", warranty: "text-center",
  };

  const headerCell = (key: PartColKey, top: number) => (
    <th
      key={key}
      draggable
      onDragStart={() => setDragCol(key)}
      onDragOver={(e) => { e.preventDefault(); setOverCol(key); }}
      onDragEnd={() => { setDragCol(null); setOverCol(null); }}
      onDrop={() => onDrop(key)}
      style={{ top }}
      className={cn(
        "sticky z-20 border-b border-l border-border bg-[#4261EE] px-4 py-2.5 text-[12px] font-semibold uppercase tracking-wider text-white cursor-grab select-none whitespace-nowrap",
        alignClass[key],
        // Move the whole Image column (header + content) right as one unit.
        key === "image" && "pl-[27px]",
        overCol === key && dragCol && dragCol !== key && "bg-[#3049c9]",
        dragCol === key && "opacity-50"
      )}
      title="Drag to reorder column"
    >
      <span className={cn(
        "inline-flex items-center gap-1",
        key === "part" || key === "image" ? "justify-start" : key === "price" ? "justify-end" : "justify-center"
      )}>
        <GripVertical className="h-3 w-3 opacity-60" />
        {PART_COL_LABEL[key]}
      </span>
    </th>
  );

  const bodyCell = (key: PartColKey, part: DevicePart) => {
    if (key === "image") return (
      <td key={key} className="border-l border-border pl-[27px] pr-4 py-3 text-left align-middle">
        <div className="ml-[11px]">
          <PartImageCell part={part} onChange={(url) => updatePart(part.id, { imageUrl: url })} />
        </div>
      </td>
    );
    if (key === "part") return (
      <td key={key} className="border-l border-border px-4 py-3 text-left align-middle">
        <p className="ml-[14px] text-[15px] font-semibold leading-snug text-foreground">{part.partName}</p>
        {part.repairCategory && (
          <p className="ml-[14px] mt-0.5 text-[11.5px] text-muted-foreground">{part.repairCategory}</p>
        )}
      </td>
    );
    if (key === "price") return (
      <td key={key} className="border-l border-border px-4 py-3 text-right align-middle">
        {part.priceKnown === false
          ? <span className="mr-[5px] text-[14px] font-medium text-muted-foreground">N/A</span>
          : <span className="mr-[5px] text-[16px] font-extrabold tracking-tight tabular-nums text-foreground">{formatINR(part.price)}</span>}
      </td>
    );
    // warranty
    return (
      <td key={key} className="border-l border-border px-4 py-3 text-center align-middle">
        <div className="flex justify-center"><span className="ml-[4px]"><WarrantyBadge warranty={part.warranty} /></span></div>
      </td>
    );
  };

  // Column widths: the # (index) column is narrow since it only holds a small
  // number. Every OTHER column (Image, Part Name, Price, Warranty, Actions)
  // gets an equal share of the remaining width, so they line up evenly.
  const IDX_W = "56px";
  const EQUAL_W = `calc((100% - ${IDX_W}) / ${order.length + 1})`;
  // Pin the column head 1px UNDER the section header so the two frozen bars
  // butt together with no seam — otherwise scrolling rows peek through a
  // sub-pixel gap between them. Never let it go above the section header.
  const tableHeadTop = Math.max(stickyTop, stickyTop + headerH - 1);
  const colDefs = [
    <col key="idx" style={{ width: IDX_W }} />,
    ...order.map((k) => <col key={k} style={{ width: EQUAL_W }} />),
    <col key="actions" style={{ width: EQUAL_W }} />,
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-border bg-card shadow-card"
    >
      {/* Single page scroll — the card grows with its content and the whole
          page scrolls (there is no separate inner scrollbar). The section
          header and the table head are sticky against the PAGE scroll
          container, so scrolling anywhere (including over the rows) collapses
          the hero and keeps these pinned.
          NOTE: the card must NOT use overflow-hidden — an overflow ancestor
          would trap position:sticky inside this card and let the header scroll
          away. Corners are rounded on the sticky header / pagination footer
          instead so the card still reads as one rounded panel. */}
      {/* ── STICKY section header (heading + Part Search + Filter on one row).
          Pinned just below the app topbar (measured stickyTop). z-30 keeps it
          above the table head, which pins directly beneath it. */}
      <div ref={headerRef} style={{ top: stickyTop }} className="sticky z-30 -mx-px -mt-px flex flex-col gap-2 rounded-t-2xl border border-border bg-card px-5 py-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Corner masks — while the header is frozen, scrolling rows would show
            through the concave gap outside the header's rounded top corners.
            Each mask paints ONLY that gap in the page-canvas colour using a
            radial-gradient (transparent inside the corner radius, canvas colour
            outside), so the rounded top reads cleanly at rest and while frozen,
            and no row bleeds through. Sits above the rows, below the content. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -left-px -top-px h-4 w-4"
          style={{ background: "radial-gradient(circle 16px at bottom right, transparent 0 15px, hsl(var(--background)) 16px)" }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -right-px -top-px h-4 w-4"
          style={{ background: "radial-gradient(circle 16px at bottom left, transparent 0 15px, hsl(var(--background)) 16px)" }}
        />
        <h3 className="text-[16px] font-bold text-foreground shrink-0">Parts &amp; Pricing</h3>
        <div className="flex items-center gap-2">
          <div className="group/partsearch relative flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground/70 transition-colors duration-200 group-focus-within/partsearch:text-[#4361EE]" />
            {/* Rotating placeholder hint — fades only, never shifts layout. Hidden once the user types. Parts wording only. */}
            {!search && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-9 top-1/2 z-10 -translate-y-1/2 truncate pr-3 text-[13px] text-muted-foreground/70 transition-opacity duration-[400ms] ease-in-out"
                style={{ opacity: partHintVisible ? 1 : 0, maxWidth: "calc(100% - 3rem)" }}
              >
                {PART_SEARCH_HINTS[partHintIndex]}
              </span>
            )}
            <input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={PART_SEARCH_HINTS[partHintIndex]}
              aria-label="Search parts"
              className="relative h-9 w-full rounded-lg border-2 border-[#4361EE]/40 bg-card pl-9 pr-3 text-[13px] placeholder:text-transparent shadow-[0_1px_3px_0_rgba(67,97,238,0.06),0_0_0_3px_rgba(67,97,238,0.06)] transition-all duration-200 hover:border-[#4361EE]/60 hover:shadow-[0_2px_8px_-2px_rgba(67,97,238,0.16),0_0_0_3px_rgba(67,97,238,0.08)] focus:border-[#4361EE] focus:outline-none focus:shadow-[0_0_0_3px_rgba(67,97,238,0.14),0_4px_14px_-4px_rgba(67,97,238,0.2)] sm:w-80"
            />
          </div>
          <Dropdown
            align="right"
            width="w-72"
            trigger={({ toggle, open }) => (
              <button
                onClick={toggle}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg border-2 px-3 text-[13px] font-medium transition-all duration-200",
                  activeFilters
                    ? "border-[#4361EE] bg-brand-50 text-brand-700 shadow-[0_0_0_3px_rgba(67,97,238,0.12)]"
                    : "border-[#4361EE]/40 text-muted-foreground shadow-[0_1px_3px_0_rgba(67,97,238,0.06),0_0_0_3px_rgba(67,97,238,0.06)] hover:border-[#4361EE]/60 hover:shadow-[0_2px_8px_-2px_rgba(67,97,238,0.16),0_0_0_3px_rgba(67,97,238,0.08)]"
                )}
              >
                <Filter className="h-3.5 w-3.5" /> Filter
                {activeFilters > 0 && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white">{activeFilters}</span>
                )}
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
              </button>
            )}
          >
            {(close) => (
              <div className="p-1">
                {/* Canonical filter-panel header — mandatory close (×)
                    (Design System v2 §3g). */}
                <div className="mb-1 flex items-center justify-between gap-3 px-2.5 pt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Filters</p>
                  <button
                    onClick={close}
                    aria-label="Close filters"
                    title="Close filters"
                    className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
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
          {/* Table. The whole page is the single scroll surface, so the head
              cells pin to the PAGE scroll container (top = STICKY_TOP + section
              header height). We deliberately do NOT wrap the table in an
              overflow container — that would create a new scroll context and
              break position:sticky. The card's overflow-hidden clips any excess
              width so the page never gains a horizontal scrollbar. */}
          <table className="w-full min-w-[760px] table-fixed border-collapse border-x border-b border-border text-left">
            {/* Shared column grid — header + every row use identical boundaries. */}
            <colgroup>{colDefs}</colgroup>
            {/* Sticky table header — pins directly beneath the section header
                using its measured height, so there is never a wrong offset,
                header jumping, or content bleeding through. */}
            <thead>
              <tr>
                <th
                  style={{ top: tableHeadTop }}
                  className="sticky z-20 border-b border-r border-border bg-[#4261EE] pl-4 pr-2 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wider text-white"
                >#</th>
                {order.map((key) => headerCell(key, tableHeadTop))}
                <th
                  style={{ top: tableHeadTop }}
                  className="sticky z-20 border-b border-l border-border bg-[#4261EE] px-4 py-2.5 text-center text-[12px] font-semibold uppercase tracking-wider text-white"
                >Actions</th>
              </tr>
            </thead>
            <tbody>
                {pageParts.map((part, idx) => (
                  <tr key={part.id} className="border-b border-border transition-colors hover:bg-brand-50/40">
                    <td className="pl-4 pr-2 py-3 text-left align-middle text-[13px] font-semibold tabular-nums text-muted-foreground">{(safePage - 1) * pageSize + idx + 1}</td>
                    {order.map((key) => bodyCell(key, part))}
                    <td className="border-l border-border py-3 px-4 align-middle">
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
                              <button onClick={() => { onManageInSettings(); close(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-[#EEF1FD]">
                                <Settings2 className="h-4 w-4 opacity-70" /> Manage in Settings
                              </button>
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
        </>
      )}

      {/* Pagination — the card footer. It scrolls with the page (single scroll
          surface). Same 10/20/50/100 pattern as Tickets & Invoices; search
          resets to page 1. */}
      {activeTab === "parts" && (
        <div className="rounded-b-2xl border-x border-b border-t border-border bg-card px-5 py-3">
          <Pagination
            page={safePage}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={total}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 50, 100]}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            itemLabel="part"
          />
        </div>
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
