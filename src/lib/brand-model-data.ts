/* ─── Brand & Model Master ────────────────────────────────────────── */

export type Brand = {
  id: string;
  name: string;
  /**
   * Device-category this brand belongs to (matches a `DeviceCategoryItem.id`
   * from Settings → Device Categories, e.g. "iphone", "android").
   *
   * A brand belongs to EXACTLY ONE category. "Apple" under iPhone and "Apple"
   * under iPad are two independent Brand records with different ids. Brands are
   * strictly category-scoped — a brand never appears under a category other
   * than its own.
   *
   * Legacy rows created before the hierarchy existed may have this undefined;
   * such rows are migrated into per-category copies at load (see the store's
   * legacy-brand migration). They are never shown "globally".
   */
  categoryId?: string;
  /** Soft-disable/archive flag. Archived brands are hidden from selection but
   *  never deleted, so existing tickets/invoices keep their values. */
  archived?: boolean;
  createdAt: string;
};

export type DeviceModel = {
  id: string;
  brandId: string;
  /**
   * Device-category this model belongs to — always the same category as its
   * brand. Stored explicitly so a model is a fully self-describing
   * `CategoryModel { categoryId, brandId }` record and category-scoped queries
   * never need to join back through the brand. Optional only for legacy rows.
   */
  categoryId?: string;
  name: string;
  /** Soft-disable/archive flag. Archived models are hidden from selection but
   *  preserved so existing records keep their values. */
  archived?: boolean;
  createdAt: string;
};

/* ─── ID Generation ──────────────────────────────────────────────── */

export function generateBrandId(): string {
  return `BRD-${crypto.randomUUID().slice(0, 8)}`;
}

export function generateModelId(): string {
  return `MDL-${crypto.randomUUID().slice(0, 8)}`;
}

/* ─── Factory ────────────────────────────────────────────────────── */

export function createBrand(name: string, categoryId?: string): Brand {
  return {
    id: generateBrandId(),
    name: name.trim(),
    categoryId: categoryId || undefined,
    createdAt: new Date().toISOString(),
  };
}

export function createDeviceModel(brandId: string, name: string, categoryId?: string): DeviceModel {
  return {
    id: generateModelId(),
    brandId,
    categoryId: categoryId || undefined,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
}

/* ─── Search helpers ─────────────────────────────────────────────── */

/** Case-insensitive, natural-order name comparator (so "iPhone 2" < "iPhone 10"). */
function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

export function searchBrands(brands: Brand[], query: string): Brand[] {
  const q = query.trim().toLowerCase();
  const list = q ? brands.filter((b) => b.name.toLowerCase().includes(q)) : brands;
  // Always alphabetical.
  return [...list].sort(byName);
}

export function searchModels(models: DeviceModel[], brandId: string | null, query: string): DeviceModel[] {
  // If no brand is selected, return empty — user must pick a brand first
  if (!brandId) return [];
  let filtered = models.filter((m) => m.brandId === brandId && !m.archived);
  const q = query.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((m) => m.name.toLowerCase().includes(q));
  }
  // Always alphabetical (numeric-aware so model numbers order naturally).
  return [...filtered].sort(byName);
}

export function getModelsForBrand(models: DeviceModel[], brandId: string): DeviceModel[] {
  return [...models.filter((m) => m.brandId === brandId && !m.archived)].sort(byName);
}

/* ─── Category-aware helpers (Category → Brand → Model hierarchy) ──── */

/**
 * Return the brands configured under a given device category, excluding
 * archived ones.
 *
 * Backward-compat rule: brands with NO `categoryId` (legacy/global) are
 * included for EVERY category, so tickets created before the hierarchy
 * existed continue to find their brand. Once a brand is assigned a category
 * it only shows under that category.
 *
 * Pass `categoryId = null` (or empty) to get all non-archived brands
 * (used as a fallback when a category has no configured brands).
 */
export function getBrandsForCategory(brands: Brand[], categoryId: string | null | undefined): Brand[] {
  // STRICT isolation: with no category there are no brands, and a brand only
  // ever belongs to its own category. No global/shared fallback.
  if (!categoryId) return [];
  return brands
    .filter((b) => !b.archived && b.categoryId === categoryId)
    .sort(byName);
}

/**
 * Search brands within a category (strict category filter + text query + sort).
 */
export function searchBrandsInCategory(
  brands: Brand[],
  categoryId: string | null | undefined,
  query: string,
): Brand[] {
  const scoped = getBrandsForCategory(brands, categoryId);
  const q = query.trim().toLowerCase();
  const list = q ? scoped.filter((b) => b.name.toLowerCase().includes(q)) : scoped;
  return [...list].sort(byName);
}

/**
 * Resolve a brand strictly within a category by name (case-insensitive).
 * Returns undefined if no brand of that name exists IN THAT CATEGORY — it will
 * never fall through to a same-named brand in a different category.
 */
export function findBrandInCategory(
  brands: Brand[],
  categoryId: string | null | undefined,
  name: string,
): Brand | undefined {
  if (!categoryId || !name) return undefined;
  const key = name.toLowerCase().trim();
  return brands.find((b) => b.categoryId === categoryId && b.name.toLowerCase() === key);
}

/**
 * True when a category has at least one brand configured under it.
 */
export function categoryHasConfiguredBrands(brands: Brand[], categoryId: string | null | undefined): boolean {
  if (!categoryId) return false;
  return brands.some((b) => !b.archived && b.categoryId === categoryId);
}

/* ─── Legacy → category-scoped migration ─────────────────────────────
 *
 * Older data had a single "global" brand (no categoryId) whose models spanned
 * several device categories (e.g. one "Apple" brand owning iPhones, iPads,
 * MacBooks…). Strict isolation requires one brand record PER category.
 *
 * `migrateLegacyBrands` splits each category-less brand into independent
 * per-category copies, reassigns each model to the copy matching its inferred
 * category, and archives the original legacy brand (never deletes it, so any
 * ticket/invoice that referenced the old id still resolves by id or text).
 * ------------------------------------------------------------------ */

/** Ordered rules mapping a model (or brand) name to a default category id.
 *  First match wins. Tuned for the default category set. */
const CATEGORY_NAME_RULES: { test: RegExp; categoryId: string }[] = [
  { test: /\bipad\b/i, categoryId: "ipad" },
  { test: /\bmacbook\b/i, categoryId: "macbook" },
  { test: /\bimac\b/i, categoryId: "imac" },
  { test: /(apple watch|\bwatch\b|iwatch)/i, categoryId: "iwatch" },
  { test: /\biphone\b/i, categoryId: "iphone" },
  { test: /(galaxy|pixel|oneplus|redmi|poco|xiaomi|oppo|vivo|realme|nothing phone|moto|nokia|nord)/i, categoryId: "android" },
  { test: /(surface|thinkpad|ideapad|yoga|spectre|pavilion|\bxps\b|inspiron|zenbook|\brog\b|latitude|elitebook|vostro)/i, categoryId: "windows" },
];

/**
 * Infer a category id from a model/brand name. Returns the fallback when no
 * rule matches (default "others").
 */
export function inferCategoryFromName(name: string, fallback = "others"): string {
  for (const rule of CATEGORY_NAME_RULES) {
    if (rule.test.test(name)) return rule.categoryId;
  }
  return fallback;
}

export type LegacyMigrationResult = {
  /** Full replacement brand list (originals archived, new per-category copies added). */
  brands: Brand[];
  /** Full replacement model list (repointed to per-category brand copies). */
  models: DeviceModel[];
  /** Whether anything actually changed (skip DB writes when false). */
  changed: boolean;
  /** New brand records to persist. */
  newBrands: Brand[];
  /** Models whose brandId/categoryId changed, to persist. */
  updatedModels: DeviceModel[];
  /** Legacy brand ids that were archived, to persist. */
  archivedBrandIds: string[];
};

/**
 * Split category-less ("global") brands into strict per-category records.
 * Idempotent: brands that already have a categoryId are left untouched.
 *
 * @param categoryIds  known category ids (used as a fallback bucket target).
 */
export function migrateLegacyBrands(
  brands: Brand[],
  models: DeviceModel[],
  categoryIds: string[] = [],
): LegacyMigrationResult {
  const legacy = brands.filter((br) => !br.categoryId && !br.archived);
  if (legacy.length === 0) {
    return { brands, models, changed: false, newBrands: [], updatedModels: [], archivedBrandIds: [] };
  }

  const nextBrands: Brand[] = [...brands];
  const nextModels: DeviceModel[] = [...models];
  const newBrands: Brand[] = [];
  const updatedModels: DeviceModel[] = [];
  const archivedBrandIds: string[] = [];

  const validCat = (id: string) => categoryIds.length === 0 || categoryIds.includes(id);

  for (const legacyBrand of legacy) {
    const brandModels = models.filter((mo) => mo.brandId === legacyBrand.id);

    // Determine target categories: the categories its models fall into. If the
    // brand has no models, bucket it by its own name.
    const catForModel = new Map<string, string>(); // modelId -> categoryId
    const targetCats = new Set<string>();
    if (brandModels.length > 0) {
      for (const mo of brandModels) {
        let cid = inferCategoryFromName(mo.name, "");
        if (!cid || !validCat(cid)) cid = inferCategoryFromName(legacyBrand.name, "others");
        if (!validCat(cid)) cid = "others";
        catForModel.set(mo.id, cid);
        targetCats.add(cid);
      }
    } else {
      let cid = inferCategoryFromName(legacyBrand.name, "others");
      if (!validCat(cid)) cid = "others";
      targetCats.add(cid);
    }

    // Create a per-category copy of the brand. Reuse a deterministic id so the
    // migration is idempotent and models can be repointed consistently.
    const brandCopyId = new Map<string, string>(); // categoryId -> new brand id
    for (const cid of targetCats) {
      const slug = legacyBrand.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const newId = `BRD-${cid}-${slug}`;
      // If a scoped brand with the same category+name already exists, reuse it.
      const existing = nextBrands.find((br) => br.categoryId === cid && br.name.toLowerCase() === legacyBrand.name.toLowerCase());
      if (existing) {
        brandCopyId.set(cid, existing.id);
      } else {
        const copy: Brand = { id: newId, name: legacyBrand.name, categoryId: cid, createdAt: legacyBrand.createdAt };
        brandCopyId.set(cid, newId);
        nextBrands.push(copy);
        newBrands.push(copy);
      }
    }

    // Repoint the legacy brand's models to their category-scoped copy.
    for (const mo of brandModels) {
      const cid = catForModel.get(mo.id)!;
      const newBrandId = brandCopyId.get(cid)!;
      const idx = nextModels.findIndex((x) => x.id === mo.id);
      if (idx !== -1 && (nextModels[idx].brandId !== newBrandId || nextModels[idx].categoryId !== cid)) {
        const updated = { ...nextModels[idx], brandId: newBrandId, categoryId: cid };
        nextModels[idx] = updated;
        updatedModels.push(updated);
      }
    }

    // Archive the original legacy brand (kept for historical id resolution).
    const li = nextBrands.findIndex((br) => br.id === legacyBrand.id);
    if (li !== -1) {
      nextBrands[li] = { ...nextBrands[li], archived: true };
      archivedBrandIds.push(legacyBrand.id);
    }
  }

  return {
    brands: nextBrands,
    models: nextModels,
    changed: newBrands.length > 0 || updatedModels.length > 0 || archivedBrandIds.length > 0,
    newBrands,
    updatedModels,
    archivedBrandIds,
  };
}

/* ─── Seed Data (STRICT category-scoped) ─────────────────────────────
 *
 * Every brand belongs to exactly one category and its models carry the same
 * categoryId. The same brand name (e.g. "Apple") appears as INDEPENDENT records
 * under different categories, so editing one never affects the other.
 *
 * Ids are stable + human-readable (`BRD-<category>-<brand>`, `MDL-<n>`) so
 * re-seeding is idempotent and ticket references stay valid.
 * ------------------------------------------------------------------ */

const SEED_TS = "2025-01-01T00:00:00.000Z";

function b(categoryId: string, name: string): Brand {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return { id: `BRD-${categoryId}-${slug}`, name, categoryId, createdAt: SEED_TS };
}

/** Brands, one independent record per category. */
export const seedBrands: Brand[] = [
  // iPhone
  b("iphone", "Apple"),
  // iPad
  b("ipad", "Apple"),
  // MacBook
  b("macbook", "Apple"),
  // iMac
  b("imac", "Apple"),
  // iWatch
  b("iwatch", "Apple"),
  // Android phones
  b("android", "Samsung"),
  b("android", "Google"),
  b("android", "OnePlus"),
  b("android", "Xiaomi"),
  b("android", "Vivo"),
  b("android", "Oppo"),
  b("android", "Realme"),
  b("android", "Nothing"),
  // Windows laptops / PCs
  b("windows", "Lenovo"),
  b("windows", "HP"),
  b("windows", "Dell"),
  b("windows", "Asus"),
  b("windows", "Microsoft"),
];

/** Convenience: find a seed brand id by category + name. */
function sb(categoryId: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `BRD-${categoryId}-${slug}`;
}

let _mdlSeq = 0;
function m(categoryId: string, brandName: string, name: string): DeviceModel {
  _mdlSeq += 1;
  return {
    id: `MDL-${String(_mdlSeq).padStart(5, "0")}`,
    brandId: sb(categoryId, brandName),
    categoryId,
    name,
    createdAt: SEED_TS,
  };
}

/** Models, each scoped to its category + brand. */
export const seedModels: DeviceModel[] = [
  // iPhone → Apple
  m("iphone", "Apple", "iPhone 16 Pro Max"),
  m("iphone", "Apple", "iPhone 16 Pro"),
  m("iphone", "Apple", "iPhone 16"),
  m("iphone", "Apple", "iPhone 15 Pro Max"),
  m("iphone", "Apple", "iPhone 15 Pro"),
  m("iphone", "Apple", "iPhone 15"),
  m("iphone", "Apple", "iPhone 14 Pro Max"),
  m("iphone", "Apple", "iPhone 14 Pro"),
  m("iphone", "Apple", "iPhone 14"),
  m("iphone", "Apple", "iPhone 13"),
  m("iphone", "Apple", "iPhone SE (3rd Gen)"),

  // iPad → Apple
  m("ipad", "Apple", "iPad Pro 13\" M4"),
  m("ipad", "Apple", "iPad Air 11\" M2"),
  m("ipad", "Apple", "iPad Air 2"),
  m("ipad", "Apple", "iPad 10th Gen"),

  // MacBook → Apple
  m("macbook", "Apple", "MacBook Air M4"),
  m("macbook", "Apple", "MacBook Air M3"),
  m("macbook", "Apple", "MacBook Pro 16\" M4 Pro"),
  m("macbook", "Apple", "MacBook Pro 14\" M4"),

  // iMac → Apple
  m("imac", "Apple", "iMac 24\" M4"),

  // iWatch → Apple
  m("iwatch", "Apple", "Apple Watch Series 9"),
  m("iwatch", "Apple", "Apple Watch Ultra 2"),
  m("iwatch", "Apple", "Watch S8 45mm"),

  // Android → Samsung
  m("android", "Samsung", "Galaxy S25 Ultra"),
  m("android", "Samsung", "Galaxy S25+"),
  m("android", "Samsung", "Galaxy S24 Ultra"),
  m("android", "Samsung", "Galaxy S24+"),
  m("android", "Samsung", "Galaxy Z Fold 6"),
  m("android", "Samsung", "Galaxy Z Flip 6"),
  m("android", "Samsung", "Galaxy A55"),
  m("android", "Samsung", "Galaxy Tab S9"),
  // Android → Google
  m("android", "Google", "Pixel 9 Pro XL"),
  m("android", "Google", "Pixel 9 Pro"),
  m("android", "Google", "Pixel 9"),
  m("android", "Google", "Pixel 8a"),
  // Android → OnePlus
  m("android", "OnePlus", "OnePlus 13"),
  m("android", "OnePlus", "OnePlus 12"),
  m("android", "OnePlus", "OnePlus Nord 4"),
  // Android → Xiaomi
  m("android", "Xiaomi", "Xiaomi 14 Ultra"),
  m("android", "Xiaomi", "Redmi Note 13 Pro+"),
  m("android", "Xiaomi", "POCO F6"),
  // Android → Nothing
  m("android", "Nothing", "Nothing Phone (2a)"),
  m("android", "Nothing", "Nothing Phone (2)"),

  // Windows → Lenovo
  m("windows", "Lenovo", "Lenovo Yoga 9i"),
  m("windows", "Lenovo", "Lenovo IdeaPad 5"),
  m("windows", "Lenovo", "ThinkPad X1 Carbon"),
  // Windows → HP
  m("windows", "HP", "HP Spectre x360"),
  m("windows", "HP", "HP Pavilion 15"),
  // Windows → Dell
  m("windows", "Dell", "Dell XPS 15"),
  m("windows", "Dell", "Dell Inspiron 14"),
  // Windows → Asus
  m("windows", "Asus", "ROG Zephyrus G14"),
  m("windows", "Asus", "Zenbook 14 OLED"),
  // Windows → Microsoft
  m("windows", "Microsoft", "Surface Pro 10"),
  m("windows", "Microsoft", "Surface Laptop 6"),
];
