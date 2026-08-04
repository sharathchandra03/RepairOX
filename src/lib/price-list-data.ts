/* ─── Price List Data ─────────────────────────────────────────────── */

export type DeviceCategory = {
  id: string;
  name: string;
  icon: string;
  count: number;
  /** Base64 or URL of the category image. */
  imageUrl?: string;
  /** Whether the category is visible/usable across modules. Defaults to true. */
  enabled?: boolean;
  /** True for built-in sample data; cleared automatically on first import. */
  seed?: boolean;
};

export type PriceListBrand = {
  id: string;
  name: string;
  count: number;
  categoryId: string;
  /** Base64 or URL of the brand logo. */
  logoUrl?: string;
  enabled?: boolean;
  seed?: boolean;
};

export type PriceListModel = {
  id: string;
  brandId: string;
  categoryId: string;
  name: string;
  year: number;
  chip?: string;
  storage?: string;
  displaySize?: string;
  variant?: string;
  modelYear?: number;
  imageUrl?: string;
  status: "active" | "discontinued";
  lastUpdated: string;
  updatedBy: string;
  createdOn: string;
  /** Extra descriptive metadata captured from imports (Series, RAM, Colour…). */
  meta?: Record<string, string>;
  /** True for built-in sample data; cleared automatically on first import. */
  seed?: boolean;
};

export type DevicePart = {
  id: number;
  partName: string;
  partNumber: string;
  price: number;
  warranty: string;
  availability: "In Stock" | "Limited" | "Out of Stock";
  lastUpdated: string;
  modelId: string;
  /** Repair classification (Display, Battery, Camera…) — used for grouping. */
  repairCategory?: string;
  /** False when imported without a price — shown as "N/A" instead of ₹0. */
  priceKnown?: boolean;
  /** Optional part photo (base64/URL) so customers see what they're getting. */
  imageUrl?: string;
  /** True for built-in sample data; cleared automatically on first import. */
  seed?: boolean;
};

/* ─── Categories ─────────────────────────────────────────────────── */

export const deviceCategories: DeviceCategory[] = [
  { id: "cat-mobile", name: "Mobile", icon: "Smartphone", count: 2453 },
  { id: "cat-tablet", name: "Tablet", icon: "Tablet", count: 568 },
  { id: "cat-laptop", name: "Laptop", icon: "Laptop", count: 1280 },
  { id: "cat-mac", name: "Mac", icon: "Monitor", count: 892 },
  { id: "cat-smartwatch", name: "Smart Watch", icon: "Watch", count: 320 },
  { id: "cat-accessories", name: "Accessories", icon: "Headphones", count: 760 },
  { id: "cat-gaming", name: "Gaming Console", icon: "Gamepad2", count: 210 },
  { id: "cat-drone", name: "Drone", icon: "Plane", count: 98 },
  { id: "cat-others", name: "Others", icon: "Box", count: 145 },
];

/* ─── Brands (per category) ──────────────────────────────────────── */

export const priceListBrands: PriceListBrand[] = [
  // Mobile
  { id: "plb-apple", name: "Apple", count: 95, categoryId: "cat-mobile" },
  { id: "plb-samsung", name: "Samsung", count: 142, categoryId: "cat-mobile" },
  { id: "plb-google", name: "Google", count: 38, categoryId: "cat-mobile" },
  { id: "plb-oneplus", name: "OnePlus", count: 45, categoryId: "cat-mobile" },
  { id: "plb-xiaomi", name: "Xiaomi", count: 186, categoryId: "cat-mobile" },
  { id: "plb-vivo", name: "Vivo", count: 92, categoryId: "cat-mobile" },
  { id: "plb-oppo", name: "Oppo", count: 78, categoryId: "cat-mobile" },
  { id: "plb-realme", name: "Realme", count: 64, categoryId: "cat-mobile" },
  { id: "plb-nothing", name: "Nothing", count: 12, categoryId: "cat-mobile" },
  { id: "plb-sony-m", name: "Sony", count: 28, categoryId: "cat-mobile" },
  // Laptop
  { id: "plb-apple-l", name: "Apple", count: 95, categoryId: "cat-laptop" },
  { id: "plb-dell", name: "Dell", count: 142, categoryId: "cat-laptop" },
  { id: "plb-hp", name: "HP", count: 186, categoryId: "cat-laptop" },
  { id: "plb-lenovo", name: "Lenovo", count: 210, categoryId: "cat-laptop" },
  { id: "plb-asus", name: "Asus", count: 98, categoryId: "cat-laptop" },
  { id: "plb-acer", name: "Acer", count: 107, categoryId: "cat-laptop" },
  { id: "plb-msi", name: "MSI", count: 56, categoryId: "cat-laptop" },
  { id: "plb-microsoft", name: "Microsoft", count: 42, categoryId: "cat-laptop" },
  // Tablet
  { id: "plb-apple-t", name: "Apple", count: 68, categoryId: "cat-tablet" },
  { id: "plb-samsung-t", name: "Samsung", count: 54, categoryId: "cat-tablet" },
  { id: "plb-lenovo-t", name: "Lenovo", count: 32, categoryId: "cat-tablet" },
  // Mac
  { id: "plb-apple-mac", name: "Apple", count: 892, categoryId: "cat-mac" },
  // Smart Watch
  { id: "plb-apple-w", name: "Apple", count: 120, categoryId: "cat-smartwatch" },
  { id: "plb-samsung-w", name: "Samsung", count: 85, categoryId: "cat-smartwatch" },
  { id: "plb-google-w", name: "Google", count: 24, categoryId: "cat-smartwatch" },
];

/* ─── Models ─────────────────────────────────────────────────────── */

export const priceListModels: PriceListModel[] = [
  // Apple Laptops (MacBooks)
  {
    id: "plm-mba-m1", brandId: "plb-apple-l", categoryId: "cat-laptop",
    name: "MacBook Air M1", year: 2020, chip: "Apple M1", storage: "256GB",
    displaySize: "13.3 inch", variant: "Base", modelYear: 2020,
    status: "active", lastUpdated: "Today, 10:30 AM", updatedBy: "John Doe",
    createdOn: "15 Jan 2022",
  },
  {
    id: "plm-mba-m2", brandId: "plb-apple-l", categoryId: "cat-laptop",
    name: "MacBook Air M2", year: 2022, chip: "Apple M2", storage: "256GB",
    displaySize: "13.6 inch", variant: "Base", modelYear: 2022,
    status: "active", lastUpdated: "Today, 10:30 AM", updatedBy: "John Doe",
    createdOn: "20 Jun 2022",
  },
  {
    id: "plm-mba-m3", brandId: "plb-apple-l", categoryId: "cat-laptop",
    name: "MacBook Air M3", year: 2024, chip: "Apple M3", storage: "256GB",
    displaySize: "13.6 inch", variant: "Base", modelYear: 2024,
    status: "active", lastUpdated: "Today, 10:30 AM", updatedBy: "John Doe",
    createdOn: "12 Mar 2024",
  },
  {
    id: "plm-mbp13-m1", brandId: "plb-apple-l", categoryId: "cat-laptop",
    name: "MacBook Pro 13\" M1", year: 2020, chip: "Apple M1", storage: "512GB",
    displaySize: "13.3 inch", variant: "Pro", modelYear: 2020,
    status: "active", lastUpdated: "Yesterday, 05:15 PM", updatedBy: "John Doe",
    createdOn: "10 Nov 2020",
  },
  {
    id: "plm-mbp13-m2", brandId: "plb-apple-l", categoryId: "cat-laptop",
    name: "MacBook Pro 13\" M2", year: 2022, chip: "Apple M2", storage: "512GB",
    displaySize: "13.3 inch", variant: "Pro", modelYear: 2022,
    status: "active", lastUpdated: "Today, 10:30 AM", updatedBy: "John Doe",
    createdOn: "15 Jun 2022",
  },
  {
    id: "plm-mbp14-m2pro", brandId: "plb-apple-l", categoryId: "cat-laptop",
    name: "MacBook Pro 14\" M2 Pro", year: 2023, chip: "Apple M2 Pro", storage: "512GB",
    displaySize: "14.2 inch", variant: "Pro", modelYear: 2023,
    status: "active", lastUpdated: "Yesterday, 05:15 PM", updatedBy: "John Doe",
    createdOn: "18 Jan 2023",
  },
  {
    id: "plm-mbp14-m3pro", brandId: "plb-apple-l", categoryId: "cat-laptop",
    name: "MacBook Pro 14\" M3 Pro", year: 2024, chip: "Apple M3 Pro", storage: "512GB",
    displaySize: "14.2 inch", variant: "Pro", modelYear: 2024,
    status: "active", lastUpdated: "Today, 09:45 AM", updatedBy: "John Doe",
    createdOn: "01 Nov 2023",
  },
  {
    id: "plm-mbp16-m2pro", brandId: "plb-apple-l", categoryId: "cat-laptop",
    name: "MacBook Pro 16\" M2 Pro", year: 2023, chip: "Apple M2 Pro", storage: "1TB",
    displaySize: "16.2 inch", variant: "Pro", modelYear: 2023,
    status: "active", lastUpdated: "Today, 09:20 AM", updatedBy: "John Doe",
    createdOn: "18 Jan 2023",
  },
  // Apple Mobile (iPhones)
  {
    id: "plm-ip16pm", brandId: "plb-apple", categoryId: "cat-mobile",
    name: "iPhone 16 Pro Max", year: 2024, chip: "A18 Pro", storage: "256GB",
    displaySize: "6.9 inch", variant: "Pro Max", modelYear: 2024,
    status: "active", lastUpdated: "Today, 11:00 AM", updatedBy: "John Doe",
    createdOn: "20 Sep 2024",
  },
  {
    id: "plm-ip16p", brandId: "plb-apple", categoryId: "cat-mobile",
    name: "iPhone 16 Pro", year: 2024, chip: "A18 Pro", storage: "128GB",
    displaySize: "6.3 inch", variant: "Pro", modelYear: 2024,
    status: "active", lastUpdated: "Today, 11:00 AM", updatedBy: "John Doe",
    createdOn: "20 Sep 2024",
  },
  {
    id: "plm-ip15pm", brandId: "plb-apple", categoryId: "cat-mobile",
    name: "iPhone 15 Pro Max", year: 2023, chip: "A17 Pro", storage: "256GB",
    displaySize: "6.7 inch", variant: "Pro Max", modelYear: 2023,
    status: "active", lastUpdated: "Yesterday, 02:30 PM", updatedBy: "John Doe",
    createdOn: "22 Sep 2023",
  },
  // Samsung Mobile
  {
    id: "plm-gs25u", brandId: "plb-samsung", categoryId: "cat-mobile",
    name: "Galaxy S25 Ultra", year: 2025, chip: "Snapdragon 8 Elite", storage: "256GB",
    displaySize: "6.9 inch", variant: "Ultra", modelYear: 2025,
    status: "active", lastUpdated: "Today, 08:45 AM", updatedBy: "John Doe",
    createdOn: "22 Jan 2025",
  },
  {
    id: "plm-gs24u", brandId: "plb-samsung", categoryId: "cat-mobile",
    name: "Galaxy S24 Ultra", year: 2024, chip: "Snapdragon 8 Gen 3", storage: "256GB",
    displaySize: "6.8 inch", variant: "Ultra", modelYear: 2024,
    status: "active", lastUpdated: "Yesterday, 04:00 PM", updatedBy: "John Doe",
    createdOn: "17 Jan 2024",
  },
  // Dell Laptops
  {
    id: "plm-xps15", brandId: "plb-dell", categoryId: "cat-laptop",
    name: "Dell XPS 15", year: 2024, chip: "Intel Core i7-14700H", storage: "512GB",
    displaySize: "15.6 inch", variant: "Standard", modelYear: 2024,
    status: "active", lastUpdated: "Today, 07:30 AM", updatedBy: "John Doe",
    createdOn: "05 Mar 2024",
  },
  {
    id: "plm-xps13", brandId: "plb-dell", categoryId: "cat-laptop",
    name: "Dell XPS 13", year: 2024, chip: "Intel Core Ultra 7", storage: "512GB",
    displaySize: "13.4 inch", variant: "Standard", modelYear: 2024,
    status: "active", lastUpdated: "Today, 07:30 AM", updatedBy: "John Doe",
    createdOn: "10 Jun 2024",
  },
];

/* ─── Parts & Pricing ────────────────────────────────────────────── */

export const deviceParts: DevicePart[] = [
  // MacBook Air M3 parts
  { id: 1, partName: "Display Assembly", partNumber: "661-28751", price: 18500, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 10:30 AM", modelId: "plm-mba-m3" },
  { id: 2, partName: "Battery", partNumber: "661-28752", price: 6500, warranty: "6 Months", availability: "In Stock", lastUpdated: "Today, 10:30 AM", modelId: "plm-mba-m3" },
  { id: 3, partName: "Keyboard", partNumber: "661-28753", price: 11000, warranty: "3 Months", availability: "Limited", lastUpdated: "Yesterday, 05:15 PM", modelId: "plm-mba-m3" },
  { id: 4, partName: "Trackpad", partNumber: "661-28754", price: 7200, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 09:45 AM", modelId: "plm-mba-m3" },
  { id: 5, partName: "Motherboard (256GB)", partNumber: "661-28755", price: 42000, warranty: "6 Months", availability: "Limited", lastUpdated: "Yesterday, 11:20 AM", modelId: "plm-mba-m3" },
  { id: 6, partName: "Camera", partNumber: "661-28756", price: 3800, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 09:20 AM", modelId: "plm-mba-m3" },
  { id: 7, partName: "Charging Port", partNumber: "661-28757", price: 2400, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 8, partName: "Speaker (Left)", partNumber: "661-28758", price: 2100, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 9, partName: "Speaker (Right)", partNumber: "661-28759", price: 2100, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 10, partName: "Fan", partNumber: "661-28760", price: 1450, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 11, partName: "Hinge Set", partNumber: "661-28761", price: 3200, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 12, partName: "SSD Flex Cable", partNumber: "661-28762", price: 1800, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 13, partName: "WiFi Antenna", partNumber: "661-28763", price: 1200, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 14, partName: "Bottom Case", partNumber: "661-28764", price: 4500, warranty: "3 Months", availability: "Limited", lastUpdated: "Yesterday, 03:00 PM", modelId: "plm-mba-m3" },
  { id: 15, partName: "Top Case Assembly", partNumber: "661-28765", price: 15800, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 10:30 AM", modelId: "plm-mba-m3" },
  { id: 16, partName: "Power Button", partNumber: "661-28766", price: 980, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 17, partName: "Touch ID Sensor", partNumber: "661-28767", price: 5600, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 09:00 AM", modelId: "plm-mba-m3" },
  { id: 18, partName: "Display Hinge Cover", partNumber: "661-28768", price: 890, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 19, partName: "MagSafe Board", partNumber: "661-28769", price: 3100, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 09:15 AM", modelId: "plm-mba-m3" },
  { id: 20, partName: "Audio Jack Board", partNumber: "661-28770", price: 1650, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 21, partName: "USB-C Port Board", partNumber: "661-28771", price: 2800, warranty: "3 Months", availability: "Limited", lastUpdated: "Yesterday, 11:20 AM", modelId: "plm-mba-m3" },
  { id: 22, partName: "Microphone Assembly", partNumber: "661-28772", price: 1450, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 23, partName: "Display Cable", partNumber: "661-28773", price: 2200, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 24, partName: "Thermal Pad Set", partNumber: "661-28774", price: 450, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 25, partName: "Screw Set (Complete)", partNumber: "661-28775", price: 380, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 26, partName: "Rubber Feet Set", partNumber: "661-28776", price: 290, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 27, partName: "Display Gasket", partNumber: "661-28777", price: 650, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  { id: 28, partName: "Keyboard Backlight", partNumber: "661-28778", price: 1800, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m3" },
  // MacBook Air M2 parts
  { id: 29, partName: "Display Assembly", partNumber: "661-27501", price: 17200, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 10:30 AM", modelId: "plm-mba-m2" },
  { id: 30, partName: "Battery", partNumber: "661-27502", price: 5800, warranty: "6 Months", availability: "In Stock", lastUpdated: "Today, 10:30 AM", modelId: "plm-mba-m2" },
  { id: 31, partName: "Keyboard", partNumber: "661-27503", price: 9800, warranty: "3 Months", availability: "In Stock", lastUpdated: "Yesterday, 05:15 PM", modelId: "plm-mba-m2" },
  { id: 32, partName: "Trackpad", partNumber: "661-27504", price: 6800, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 09:45 AM", modelId: "plm-mba-m2" },
  { id: 33, partName: "Motherboard (256GB)", partNumber: "661-27505", price: 38000, warranty: "6 Months", availability: "Limited", lastUpdated: "Yesterday, 11:20 AM", modelId: "plm-mba-m2" },
  { id: 34, partName: "Camera", partNumber: "661-27506", price: 3200, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 09:20 AM", modelId: "plm-mba-m2" },
  { id: 35, partName: "Charging Port", partNumber: "661-27507", price: 2200, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m2" },
  { id: 36, partName: "Speaker (Left)", partNumber: "661-27508", price: 1900, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m2" },
  { id: 37, partName: "Speaker (Right)", partNumber: "661-27509", price: 1900, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m2" },
  { id: 38, partName: "Fan", partNumber: "661-27510", price: 1200, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-mba-m2" },
  // iPhone 16 Pro Max parts
  { id: 39, partName: "Display Assembly (OLED)", partNumber: "661-30001", price: 28500, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 11:00 AM", modelId: "plm-ip16pm" },
  { id: 40, partName: "Battery", partNumber: "661-30002", price: 4800, warranty: "6 Months", availability: "In Stock", lastUpdated: "Today, 11:00 AM", modelId: "plm-ip16pm" },
  { id: 41, partName: "Rear Camera Module", partNumber: "661-30003", price: 15200, warranty: "3 Months", availability: "Limited", lastUpdated: "Yesterday, 02:30 PM", modelId: "plm-ip16pm" },
  { id: 42, partName: "Front Camera", partNumber: "661-30004", price: 5600, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 10:00 AM", modelId: "plm-ip16pm" },
  { id: 43, partName: "Charging Port Assembly", partNumber: "661-30005", price: 3200, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-ip16pm" },
  { id: 44, partName: "Ear Speaker", partNumber: "661-30006", price: 1800, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-ip16pm" },
  { id: 45, partName: "Loudspeaker", partNumber: "661-30007", price: 2100, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-ip16pm" },
  { id: 46, partName: "Back Glass", partNumber: "661-30008", price: 8900, warranty: "3 Months", availability: "In Stock", lastUpdated: "Today, 09:30 AM", modelId: "plm-ip16pm" },
  { id: 47, partName: "SIM Tray", partNumber: "661-30009", price: 450, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-ip16pm" },
  { id: 48, partName: "Taptic Engine", partNumber: "661-30010", price: 2800, warranty: "1 Month", availability: "In Stock", lastUpdated: "Today, 08:50 AM", modelId: "plm-ip16pm" },
];

/* ─── Helpers ────────────────────────────────────────────────────── */

export function getBrandsForCategory(categoryId: string): PriceListBrand[] {
  return priceListBrands.filter((b) => b.categoryId === categoryId);
}

export function getModelsForBrand(brandId: string): PriceListModel[] {
  return priceListModels.filter((m) => m.brandId === brandId);
}

export function getPartsForModel(modelId: string): DevicePart[] {
  return deviceParts.filter((p) => p.modelId === modelId);
}

export function searchModelsInBrand(brandId: string, query: string): PriceListModel[] {
  const models = getModelsForBrand(brandId);
  if (!query.trim()) return models;
  const q = query.toLowerCase();
  return models.filter((m) => m.name.toLowerCase().includes(q));
}

/* ─── ID Generators ──────────────────────────────────────────────── */
// Monotonic counters seeded past the static data so generated IDs never clash.

let _catCounter = 1000;
let _brandCounter = 1000;
let _modelCounter = 1000;
let _partCounter = 100000;

export function generateCategoryId(): string {
  _catCounter += 1;
  return `cat-${Date.now().toString(36)}-${_catCounter}`;
}

export function generatePriceListBrandId(): string {
  _brandCounter += 1;
  return `plb-${Date.now().toString(36)}-${_brandCounter}`;
}

export function generatePriceListModelId(): string {
  _modelCounter += 1;
  return `plm-${Date.now().toString(36)}-${_modelCounter}`;
}

export function generatePartId(): number {
  _partCounter += 1;
  return _partCounter;
}

/** Human-friendly "last updated" stamp matching the seed-data style. */
export function nowStamp(): string {
  return new Date().toLocaleString("en-US", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
