/**
 * Device Catalog — Media Library helper.
 *
 * Collects every image already SAVED across the catalog (category images,
 * brand logos, model images and part images) into one deduped, grouped list.
 * This is NOT a second storage system — it derives entirely from the live
 * catalog data (`useCatalog()`), which is the single source of truth. Reusing
 * an image simply means pointing another record's image field at the same URL.
 */

import type {
  DeviceCategory,
  PriceListBrand,
  PriceListModel,
  DevicePart,
} from "@/lib/price-list-data";

export type MediaSourceType = "category" | "brand" | "model" | "part";

export interface MediaImage {
  /** The image URL (Supabase Storage public URL or base64 data URL). */
  url: string;
  /** Which kind of catalog record this image belongs to. */
  type: MediaSourceType;
  /** Human label — the owning record's name (e.g. "Laptop", "Apple", "MacBook Air M3"). */
  ownerName: string;
  /** The owning record id, for reference. */
  ownerId: string;
}

export interface MediaGroup {
  type: MediaSourceType;
  label: string;
  images: MediaImage[];
}

const isUsable = (v?: string | null): v is string =>
  typeof v === "string" && v.trim().length > 0;

interface CatalogSlice {
  categories: DeviceCategory[];
  brands: PriceListBrand[];
  models: PriceListModel[];
  parts: DevicePart[];
}

/**
 * Build the grouped media library from the catalog. Images are deduped by URL
 * WITHIN each group (the same URL reused by two models shows once per group).
 */
export function collectMedia({ categories, brands, models, parts }: CatalogSlice): MediaGroup[] {
  const groups: MediaGroup[] = [
    { type: "category", label: "Category Images", images: [] },
    { type: "brand", label: "Brand Logos", images: [] },
    { type: "model", label: "Model Images", images: [] },
    { type: "part", label: "Part Images", images: [] },
  ];

  const seen: Record<MediaSourceType, Set<string>> = {
    category: new Set(),
    brand: new Set(),
    model: new Set(),
    part: new Set(),
  };

  const push = (type: MediaSourceType, url: string | undefined | null, ownerName: string, ownerId: string) => {
    if (!isUsable(url)) return;
    if (seen[type].has(url)) return;
    seen[type].add(url);
    const g = groups.find((x) => x.type === type)!;
    g.images.push({ url, type, ownerName: ownerName || "Untitled", ownerId });
  };

  for (const c of categories) push("category", c.imageUrl, c.name, c.id);
  for (const b of brands) push("brand", b.logoUrl, b.name, b.id);
  for (const m of models) push("model", m.imageUrl, m.name, m.id);
  for (const p of parts) push("part", p.imageUrl, p.partName, String(p.id));

  return groups;
}

/** Flatten all images across groups (used by the pick-from-library modal). */
export function collectAllMedia(slice: CatalogSlice): MediaImage[] {
  return collectMedia(slice).flatMap((g) => g.images);
}

/** Total usable images across the catalog. */
export function mediaCount(slice: CatalogSlice): number {
  return collectMedia(slice).reduce((n, g) => n + g.images.length, 0);
}
