/* ─── Brand & Model Master ────────────────────────────────────────── */

export type Brand = {
  id: string;
  name: string;
  createdAt: string;
};

export type DeviceModel = {
  id: string;
  brandId: string;
  name: string;
  createdAt: string;
};

/* ─── ID Generation ──────────────────────────────────────────────── */

let _brandCounter = 100;
let _modelCounter = 1000;

export function generateBrandId(): string {
  _brandCounter += 1;
  return `BRD-${String(_brandCounter).padStart(4, "0")}`;
}

export function generateModelId(): string {
  _modelCounter += 1;
  return `MDL-${String(_modelCounter).padStart(5, "0")}`;
}

/* ─── Factory ────────────────────────────────────────────────────── */

export function createBrand(name: string): Brand {
  return {
    id: generateBrandId(),
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
}

export function createDeviceModel(brandId: string, name: string): DeviceModel {
  return {
    id: generateModelId(),
    brandId,
    name: name.trim(),
    createdAt: new Date().toISOString(),
  };
}

/* ─── Search helpers ─────────────────────────────────────────────── */

export function searchBrands(brands: Brand[], query: string): Brand[] {
  const q = query.trim().toLowerCase();
  if (!q) return brands;
  return brands.filter((b) => b.name.toLowerCase().includes(q));
}

export function searchModels(models: DeviceModel[], brandId: string | null, query: string): DeviceModel[] {
  // If no brand is selected, return empty — user must pick a brand first
  if (!brandId) return [];
  let filtered = models.filter((m) => m.brandId === brandId);
  const q = query.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((m) => m.name.toLowerCase().includes(q));
  }
  return filtered;
}

export function getModelsForBrand(models: DeviceModel[], brandId: string): DeviceModel[] {
  return models.filter((m) => m.brandId === brandId);
}

/* ─── Seed Data ──────────────────────────────────────────────────── */

export const seedBrands: Brand[] = [
  { id: "BRD-0001", name: "Apple", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0002", name: "Samsung", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0003", name: "Google", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0004", name: "OnePlus", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0005", name: "Xiaomi", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0006", name: "Lenovo", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0007", name: "HP", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0008", name: "Dell", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0009", name: "Asus", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0010", name: "Vivo", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0011", name: "Oppo", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0012", name: "Realme", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0013", name: "Nothing", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0014", name: "Sony", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "BRD-0015", name: "Microsoft", createdAt: "2025-01-01T00:00:00.000Z" },
];

export const seedModels: DeviceModel[] = [
  // Apple
  { id: "MDL-00001", brandId: "BRD-0001", name: "iPhone 16 Pro Max", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00002", brandId: "BRD-0001", name: "iPhone 16 Pro", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00003", brandId: "BRD-0001", name: "iPhone 16", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00004", brandId: "BRD-0001", name: "iPhone 15 Pro Max", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00005", brandId: "BRD-0001", name: "iPhone 15 Pro", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00006", brandId: "BRD-0001", name: "iPhone 15", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00007", brandId: "BRD-0001", name: "iPhone 14 Pro Max", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00008", brandId: "BRD-0001", name: "iPhone 14 Pro", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00009", brandId: "BRD-0001", name: "iPhone 14", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00010", brandId: "BRD-0001", name: "iPhone 13", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00011", brandId: "BRD-0001", name: "iPhone SE (3rd Gen)", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00012", brandId: "BRD-0001", name: "MacBook Air M4", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00013", brandId: "BRD-0001", name: "MacBook Air M3", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00014", brandId: "BRD-0001", name: "MacBook Pro 16\" M4 Pro", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00015", brandId: "BRD-0001", name: "MacBook Pro 14\" M4", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00016", brandId: "BRD-0001", name: "iPad Pro 13\" M4", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00017", brandId: "BRD-0001", name: "iPad Air 11\" M2", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00018", brandId: "BRD-0001", name: "iPad Air 2", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00019", brandId: "BRD-0001", name: "iMac 24\" M4", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00020", brandId: "BRD-0001", name: "Apple Watch Series 9", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00021", brandId: "BRD-0001", name: "Apple Watch Ultra 2", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00022", brandId: "BRD-0001", name: "Watch S8 45mm", createdAt: "2025-01-01T00:00:00.000Z" },
  // Samsung
  { id: "MDL-00023", brandId: "BRD-0002", name: "Galaxy S25 Ultra", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00024", brandId: "BRD-0002", name: "Galaxy S25+", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00025", brandId: "BRD-0002", name: "Galaxy S24 Ultra", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00026", brandId: "BRD-0002", name: "Galaxy S24+", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00027", brandId: "BRD-0002", name: "Galaxy Z Fold 6", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00028", brandId: "BRD-0002", name: "Galaxy Z Flip 6", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00029", brandId: "BRD-0002", name: "Galaxy A55", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00030", brandId: "BRD-0002", name: "Galaxy Tab S9", createdAt: "2025-01-01T00:00:00.000Z" },
  // Google
  { id: "MDL-00031", brandId: "BRD-0003", name: "Pixel 9 Pro XL", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00032", brandId: "BRD-0003", name: "Pixel 9 Pro", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00033", brandId: "BRD-0003", name: "Pixel 9", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00034", brandId: "BRD-0003", name: "Pixel 8a", createdAt: "2025-01-01T00:00:00.000Z" },
  // OnePlus
  { id: "MDL-00035", brandId: "BRD-0004", name: "OnePlus 13", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00036", brandId: "BRD-0004", name: "OnePlus 12", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00037", brandId: "BRD-0004", name: "OnePlus Nord 4", createdAt: "2025-01-01T00:00:00.000Z" },
  // Xiaomi
  { id: "MDL-00038", brandId: "BRD-0005", name: "Xiaomi 14 Ultra", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00039", brandId: "BRD-0005", name: "Redmi Note 13 Pro+", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00040", brandId: "BRD-0005", name: "POCO F6", createdAt: "2025-01-01T00:00:00.000Z" },
  // Lenovo
  { id: "MDL-00041", brandId: "BRD-0006", name: "Lenovo Yoga 9i", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00042", brandId: "BRD-0006", name: "Lenovo IdeaPad 5", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00043", brandId: "BRD-0006", name: "ThinkPad X1 Carbon", createdAt: "2025-01-01T00:00:00.000Z" },
  // HP
  { id: "MDL-00044", brandId: "BRD-0007", name: "HP Spectre x360", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00045", brandId: "BRD-0007", name: "HP Pavilion 15", createdAt: "2025-01-01T00:00:00.000Z" },
  // Dell
  { id: "MDL-00046", brandId: "BRD-0008", name: "Dell XPS 15", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00047", brandId: "BRD-0008", name: "Dell Inspiron 14", createdAt: "2025-01-01T00:00:00.000Z" },
  // Asus
  { id: "MDL-00048", brandId: "BRD-0009", name: "ROG Phone 8 Pro", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00049", brandId: "BRD-0009", name: "Zenbook 14 OLED", createdAt: "2025-01-01T00:00:00.000Z" },
  // Nothing
  { id: "MDL-00050", brandId: "BRD-0013", name: "Nothing Phone (2a)", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00051", brandId: "BRD-0013", name: "Nothing Phone (2)", createdAt: "2025-01-01T00:00:00.000Z" },
  // Microsoft
  { id: "MDL-00052", brandId: "BRD-0015", name: "Surface Pro 10", createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "MDL-00053", brandId: "BRD-0015", name: "Surface Laptop 6", createdAt: "2025-01-01T00:00:00.000Z" },
];
