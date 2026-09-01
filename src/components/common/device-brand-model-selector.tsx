"use client";

/**
 * Shared Brand/Model Selector — the single source of truth for device selection.
 *
 * Used by: Ticket Creation, Invoice Creation, and any future module.
 * Reads from the master Device Catalog via useStore() (brands + deviceModels).
 * Supports: searchable dropdown, Add New Brand/Model, click-outside-close,
 * and dependent filtering (Model filters by selected Brand).
 */

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  searchBrands,
  searchModels,
  getModelsForBrand,
  createBrand,
  createDeviceModel,
  searchBrandsInCategory,
  findBrandInCategory,
  type Brand,
  type DeviceModel,
} from "@/lib/brand-model-data";

/* ─── Props ──────────────────────────────────────────────────────────── */

export interface DeviceBrandModelSelectorProps {
  brand: string;
  model: string;
  onBrandChange: (value: string) => void;
  onModelChange: (value: string) => void;
  /**
   * Optional Category → Brand → Model scoping. When `categoryId` is provided
   * the brand list is STRICTLY filtered to that device category (no global or
   * cross-category brands) and the brand field is disabled until a category
   * exists. When omitted the selector behaves as an unscoped picker (all brands).
   */
  categoryId?: string;
  /** Durable relationship ids — pass these to persist the exact selection. */
  brandId?: string;
  modelId?: string;
  onBrandIdChange?: (value: string | undefined) => void;
  onModelIdChange?: (value: string | undefined) => void;
  /** Optional: additional class on the wrapper fragment container */
  className?: string;
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function DeviceBrandModelSelector({
  brand,
  model,
  onBrandChange,
  onModelChange,
  categoryId,
  brandId,
  modelId,
  onBrandIdChange,
  onModelIdChange,
}: DeviceBrandModelSelectorProps) {
  const { brands, deviceModels, addBrand, addDeviceModel } = useStore();

  // Brand combobox state
  const [brandQuery, setBrandQuery] = useState(brand || "");
  const [brandOpen, setBrandOpen] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");

  // Model combobox state
  const [modelQuery, setModelQuery] = useState(model || "");
  const [modelOpen, setModelOpen] = useState(false);
  const [showNewModel, setShowNewModel] = useState(false);
  const [newModelName, setNewModelName] = useState("");

  // Sync local queries when external props change
  useEffect(() => {
    setBrandQuery(brand || "");
  }, [brand]);

  useEffect(() => {
    setModelQuery(model || "");
  }, [model]);

  // Whether category scoping is active for this instance.
  const scoped = !!categoryId;

  // Resolve selected brand: prefer the durable brandId (resolves historical
  // records by id even if archived). Otherwise resolve STRICTLY within the
  // active category — never fall through to a same-named brand elsewhere.
  const selectedBrand = (() => {
    if (brandId) {
      const byId = brands.find((b) => b.id === brandId);
      if (byId) return byId;
    }
    const nameKey = (brand || brandQuery).toLowerCase().trim();
    if (!nameKey) return undefined;
    if (scoped) {
      return findBrandInCategory(brands, categoryId, nameKey);
    }
    return brands.find((b) => b.name.toLowerCase() === nameKey);
  })();

  // Search results — category-scoped when a category is provided.
  const brandResults = scoped
    ? searchBrandsInCategory(brands, categoryId, brandQuery)
    : searchBrands(brands, brandQuery);
  const modelResults = selectedBrand
    ? modelQuery.trim()
      ? searchModels(deviceModels, selectedBrand.id, modelQuery)
      : getModelsForBrand(deviceModels, selectedBrand.id)
    : [];

  const brandDisabled = scoped && !categoryId;

  // Brand selection
  const handleBrandSelect = (b: Brand) => {
    const shouldClearModel = brandId !== b.id || brand.toLowerCase() !== b.name.toLowerCase();
    onBrandChange(b.name);
    onBrandIdChange?.(b.id);
    setBrandQuery(b.name);
    setBrandOpen(false);
    if (shouldClearModel) {
      onModelChange("");
      onModelIdChange?.(undefined);
      setModelQuery("");
    }
  };

  // Save new brand — created under the active category when scoped.
  const handleSaveNewBrand = () => {
    if (!newBrandName.trim()) return;
    const newBrand = createBrand(newBrandName.trim(), scoped ? categoryId : undefined);
    addBrand(newBrand);
    onBrandChange(newBrand.name);
    onBrandIdChange?.(newBrand.id);
    onModelChange("");
    onModelIdChange?.(undefined);
    setBrandQuery(newBrand.name);
    setModelQuery("");
    setShowNewBrand(false);
    setNewBrandName("");
    setBrandOpen(false);
  };

  // Model selection
  const handleModelSelect = (m: DeviceModel) => {
    const brandForModel = brands.find((br) => br.id === m.brandId);
    onModelChange(m.name);
    onModelIdChange?.(m.id);
    setModelQuery(m.name);
    setModelOpen(false);
    // Auto-fill brand if not yet set
    if (brandForModel && !brand) {
      onBrandChange(brandForModel.name);
      onBrandIdChange?.(brandForModel.id);
      setBrandQuery(brandForModel.name);
    }
  };

  // Save new model
  const handleSaveNewModel = () => {
    if (!newModelName.trim() || !selectedBrand) return;
    const newModel = createDeviceModel(selectedBrand.id, newModelName.trim(), categoryId || selectedBrand.categoryId);
    addDeviceModel(newModel);
    onModelChange(newModel.name);
    onModelIdChange?.(newModel.id);
    setModelQuery(newModel.name);
    setShowNewModel(false);
    setNewModelName("");
    setModelOpen(false);
  };

  return (
    <>
      {/* Brand Combobox */}
      <div className="relative space-y-1">
        <Label>Brand Name</Label>
        <Input
          value={brandQuery}
          onChange={(e: any) => {
            setBrandQuery(e.target.value);
            onBrandChange(e.target.value);
            // Free-typing invalidates the resolved ids + dependent model.
            onBrandIdChange?.(undefined);
            onModelChange("");
            onModelIdChange?.(undefined);
            setModelQuery("");
            setBrandOpen(true);
          }}
          onFocus={() => { if (!brandDisabled) setBrandOpen(true); }}
          disabled={brandDisabled}
          placeholder={brandDisabled ? "Select category first..." : "Search brand..."}
          className="h-11"
          iconLeft={<Search className="h-4 w-4" />}
        />
        {brandOpen && !brandDisabled && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[240px] overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
            {brandResults.slice(0, 10).map((b) => {
              const isSel = brandId === b.id || brand.toLowerCase() === b.name.toLowerCase();
              return (
              <button
                key={b.id}
                type="button"
                onClick={() => handleBrandSelect(b)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[#EEF1FD]/60",
                  isSel && "bg-[#EEF1FD] font-medium text-[#4361EE]"
                )}
              >
                <Check
                  className={cn("h-3.5 w-3.5 shrink-0", isSel ? "text-[#4361EE]" : "opacity-0")}
                  strokeWidth={3}
                />
                <span>{b.name}</span>
              </button>
              );
            })}
            {brandResults.length === 0 && !brandQuery.trim() && scoped && (
              <p className="px-3 py-2 text-[12px] text-muted-foreground">
                No brands configured for this category yet. Type a name to add one.
              </p>
            )}
            {brandResults.length === 0 && brandQuery.trim() && (
              <p className="px-3 py-2 text-[12px] text-muted-foreground">
                No brands match &quot;{brandQuery}&quot;
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setNewBrandName(brandQuery);
                setShowNewBrand(true);
                setBrandOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-[13px] font-medium text-[#4361EE] hover:bg-[#EEF1FD]/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add New Brand
            </button>
          </div>
        )}
        {/* Click outside to close */}
        {brandOpen && (
          <div
            className="fixed inset-0 z-20"
            onClick={() => setBrandOpen(false)}
          />
        )}
      </div>

      {/* Model Combobox */}
      <div className="relative space-y-1">
        <Label>Model</Label>
        <Input
          value={modelQuery}
          onChange={(e: any) => {
            setModelQuery(e.target.value);
            onModelChange(e.target.value);
            onModelIdChange?.(undefined);
            setModelOpen(true);
          }}
          onFocus={() => { if (selectedBrand) setModelOpen(true); }}
          disabled={!selectedBrand}
          placeholder={
            selectedBrand
              ? `Search ${selectedBrand.name} models...`
              : "Select brand first..."
          }
          className="h-11"
          iconLeft={<Search className="h-4 w-4" />}
        />
        {modelOpen && selectedBrand && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[240px] overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
            {modelResults.slice(0, 12).map((m) => {
              const isSel = modelId === m.id || model.toLowerCase() === m.name.toLowerCase();
              return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleModelSelect(m)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-[#EEF1FD]/60",
                  isSel && "bg-[#EEF1FD] font-medium text-[#4361EE]"
                )}
              >
                <Check
                  className={cn("h-3.5 w-3.5 shrink-0", isSel ? "text-[#4361EE]" : "opacity-0")}
                  strokeWidth={3}
                />
                <span>{m.name}</span>
              </button>
              );
            })}
            {modelResults.length === 0 && !modelQuery.trim() && (
              <p className="px-3 py-2 text-[12px] text-muted-foreground">
                No models configured for this brand.
              </p>
            )}
            {modelResults.length === 0 && modelQuery.trim() && (
              <p className="px-3 py-2 text-[12px] text-muted-foreground">
                No models match &quot;{modelQuery}&quot;
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setNewModelName(modelQuery);
                setShowNewModel(true);
                setModelOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-[13px] font-medium text-[#4361EE] hover:bg-[#EEF1FD]/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add New Model
            </button>
          </div>
        )}
        {modelOpen && (
          <div
            className="fixed inset-0 z-20"
            onClick={() => setModelOpen(false)}
          />
        )}
      </div>

      {/* Add New Brand Modal */}
      {showNewBrand && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4"
          onClick={() => setShowNewBrand(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-border p-5"
          >
            <h3 className="text-base font-bold">Add New Brand</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              This brand will be saved permanently to the Brand Master.
            </p>
            <div className="mt-4 space-y-1">
              <Label>Brand Name</Label>
              <Input
                value={newBrandName}
                onChange={(e: any) => setNewBrandName(e.target.value)}
                placeholder="e.g. Nokia, Motorola"
                className="h-11"
                autoFocus
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewBrand(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveNewBrand}
                disabled={!newBrandName.trim()}
              >
                <Check className="h-3.5 w-3.5" /> Save Brand
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add New Model Modal */}
      {showNewModel && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-foreground/40 backdrop-blur-[2px] p-4"
          onClick={() => setShowNewModel(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-card shadow-2xl ring-1 ring-border p-5"
          >
            <h3 className="text-base font-bold">Add New Model</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              This model will be linked to{" "}
              <span className="font-semibold text-[#4361EE]">
                {selectedBrand?.name}
              </span>{" "}
              in the Model Master.
            </p>
            <div className="mt-4 space-y-1">
              <Label>Model Name</Label>
              <Input
                value={newModelName}
                onChange={(e: any) => setNewModelName(e.target.value)}
                placeholder="e.g. iPhone 16 Pro Max"
                className="h-11"
                autoFocus
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewModel(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveNewModel}
                disabled={!newModelName.trim()}
              >
                <Check className="h-3.5 w-3.5" /> Save Model
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
