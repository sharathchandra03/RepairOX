"use client";

import { LayoutGrid, Building2, Laptop, Wrench, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SettingsBreadcrumb } from "@/components/settings/settings-breadcrumb";
import { useCatalog } from "@/lib/catalog-context";
import { CatalogSelectionProvider, useCatalogSelection, type CatalogTabId } from "./catalog-selection";
import { CategoriesTab } from "./categories-tab";
import { BrandsTab } from "./brands-tab";
import { ModelsTab } from "./models-tab";
import { PartsTab } from "./parts-tab";
import { ImportExportTab } from "./import-export-tab";

const TABS: { id: CatalogTabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "categories", label: "Categories", icon: LayoutGrid },
  { id: "brands", label: "Brands", icon: Building2 },
  { id: "models", label: "Models", icon: Laptop },
  { id: "parts", label: "Parts & Pricing", icon: Wrench },
  { id: "import", label: "Import / Export", icon: ArrowLeftRight },
];

export function CatalogAdmin() {
  return (
    <CatalogSelectionProvider>
      <CatalogAdminInner />
    </CatalogSelectionProvider>
  );
}

function CatalogAdminInner() {
  const { tab, setTab } = useCatalogSelection();
  const { categories, brands, models, parts, hydrated } = useCatalog();

  const counts: Record<CatalogTabId, number | null> = {
    categories: categories.length,
    brands: brands.length,
    models: models.length,
    parts: parts.length,
    import: null,
  };

  return (
    <div>
      <SettingsBreadcrumb items={[{ label: "Inventory", href: "/settings/inventory/general" }, { label: "Price List" }]} />

      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">Device Catalog</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The master source for categories, brands, models, images, parts and pricing across RepairOX.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex shrink-0 items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors",
                active ? "text-brand-600" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
              {counts[t.id] !== null && (
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  active ? "bg-brand-500 text-white" : "bg-muted text-muted-foreground"
                )}>
                  {counts[t.id]}
                </span>
              )}
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand-500" />}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {!hydrated ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          Loading catalog…
        </div>
      ) : (
        <>
          {tab === "categories" && <CategoriesTab />}
          {tab === "brands" && <BrandsTab />}
          {tab === "models" && <ModelsTab />}
          {tab === "parts" && <PartsTab />}
          {tab === "import" && <ImportExportTab />}
        </>
      )}
    </div>
  );
}
