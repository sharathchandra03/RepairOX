/* ──────────────────────────────────────────────────────────────────────────
   Inventory Management — mock data + domain model
   Lives separate from mock-data.ts to keep the CRM core lean and to make the
   inventory module self-contained. All money values are INR (formatINR).
   ────────────────────────────────────────────────────────────────────────── */

/* ── Stock health classification ──────────────────────────────────────────
   Derived from currentStock vs min/max levels. Drives badges, filters and
   the dashboard health overview. */
export type StockHealth =
  | "negative"
  | "low"
  | "reorder"
  | "optimum"
  | "high"
  | "excess";

export const STOCK_HEALTH_LABEL: Record<StockHealth, string> = {
  negative: "Negative Stock",
  low: "Low Stock",
  reorder: "Reorder",
  optimum: "Optimum",
  high: "High Stock",
  excess: "Excess Stock",
};

/* tone keys map to Badge tones / chip classes used across the module */
export const STOCK_HEALTH_TONE: Record<
  StockHealth,
  { badge: "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "violet"; dot: string; bar: string }
> = {
  negative: { badge: "danger", dot: "bg-rose-500", bar: "bg-rose-500" },
  low: { badge: "warning", dot: "bg-amber-500", bar: "bg-amber-500" },
  reorder: { badge: "info", dot: "bg-blue-500", bar: "bg-blue-500" },
  optimum: { badge: "success", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  high: { badge: "violet", dot: "bg-violet-500", bar: "bg-violet-500" },
  excess: { badge: "brand", dot: "bg-[#4361EE]", bar: "bg-[#4361EE]" },
};

export function classifyStock(current: number, min: number, max: number): StockHealth {
  if (current < 0) return "negative";
  if (current === 0 || current < min) return "low";
  if (current < min * 1.5) return "reorder";
  if (current > max) return "excess";
  if (current > max * 0.85) return "high";
  return "optimum";
}

/* ── Item Master ──────────────────────────────────────────────────────── */
export type ItemType = "Product" | "Service";
export type ItemMode = "Buy" | "Sell" | "Both";

export type InventoryItem = {
  id: string;            // SKU / Item ID
  name: string;
  category: string;
  type: ItemType;
  mode: ItemMode;
  uom: string;
  store: string;
  active: boolean;
  currentStock: number;
  defaultPrice: number;
  regularBuyingPrice: number;
  wholesaleBuyingPrice: number;
  regularSellingPrice: number;
  mrp: number;
  dealerPrice: number;
  distributorPrice: number;
  hsnCode: string;
  tax: number;           // GST %
  minStock: number;
  maxStock: number;
  reservedStock: number;  // reserved by tickets (not yet consumed)
  soldUnits: number;     // for top-selling
  purchasedUnits: number;// for top-purchased
};

export const STORES = ["All Stores", "Main Store", "Service Counter", "Warehouse A", "Branch — Andheri"];
export const CATEGORIES = [
  "Display Modules", "Batteries", "Charging Ports", "Cameras", "Logic Boards",
  "Accessories", "Tools & Consumables", "Speakers & Mics", "Back Glass", "Services",
];
export const UOMS = ["Piece", "Set", "Box", "Pack", "Metre", "Unit", "Hour"];

const NAMES: [string, string, ItemType, ItemMode][] = [
  ["iPhone 15 Pro OLED Assembly", "Display Modules", "Product", "Both"],
  ["Samsung S24 Ultra AMOLED", "Display Modules", "Product", "Both"],
  ["iPhone 14 Battery (3279mAh)", "Batteries", "Product", "Both"],
  ["Pixel 9 Type-C Flex", "Charging Ports", "Product", "Both"],
  ["iPhone 13 Rear Camera", "Cameras", "Product", "Both"],
  ["MacBook Air M2 Logic Board", "Logic Boards", "Product", "Buy"],
  ["Tempered Glass — Universal", "Accessories", "Product", "Sell"],
  ["Silicone Case — Clear", "Accessories", "Product", "Sell"],
  ["Precision Screwdriver Kit", "Tools & Consumables", "Product", "Buy"],
  ["Isopropyl Alcohol 500ml", "Tools & Consumables", "Product", "Buy"],
  ["iPhone 12 Earpiece Speaker", "Speakers & Mics", "Product", "Both"],
  ["S23 Loudspeaker Module", "Speakers & Mics", "Product", "Both"],
  ["iPhone 15 Back Glass", "Back Glass", "Product", "Both"],
  ["OnePlus 12 Display", "Display Modules", "Product", "Both"],
  ["iPad Air Digitizer", "Display Modules", "Product", "Both"],
  ["AirPods Pro Charging Case", "Accessories", "Product", "Sell"],
  ["iWatch S8 Battery", "Batteries", "Product", "Both"],
  ["USB-C 65W Adapter", "Accessories", "Product", "Sell"],
  ["Diagnostics — Level 2", "Services", "Service", "Sell"],
  ["Water Damage Treatment", "Services", "Service", "Sell"],
  ["Nano SIM Tray — Mixed", "Tools & Consumables", "Product", "Both"],
  ["Galaxy A55 Charging Port", "Charging Ports", "Product", "Both"],
  ["iPhone 11 LCD (Incell)", "Display Modules", "Product", "Both"],
  ["Heat Gun Nozzle Set", "Tools & Consumables", "Product", "Buy"],
];

// Deterministic generator (no Math.random at module load — stable SSR/CSR).
function seeded(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export const inventoryItems: InventoryItem[] = NAMES.map(([name, category, type, mode], i) => {
  const r = seeded(i + 1);
  const r2 = seeded(i + 50);
  const isService = type === "Service";
  const base = 400 + Math.round(r * 18000);
  const min = isService ? 0 : 5 + Math.round(r2 * 10);
  const max = isService ? 0 : min + 40 + Math.round(r * 80);
  // engineer a spread of stock states for realistic dashboards
  const buckets = [-3, 0, Math.round(min * 0.6), Math.round(min * 1.2), Math.round((min + max) / 2), Math.round(max * 0.95), Math.round(max * 1.3)];
  const currentStock = isService ? 0 : buckets[i % buckets.length];
  const regBuy = Math.round(base * 0.62);
  return {
    id: `SKU-${(1024 + i * 7).toString().padStart(4, "0")}`,
    name,
    category,
    type,
    mode,
    uom: isService ? "Hour" : UOMS[i % 5],
    store: STORES[1 + (i % (STORES.length - 1))],
    active: i % 11 !== 0,
    currentStock,
    defaultPrice: base,
    regularBuyingPrice: regBuy,
    wholesaleBuyingPrice: Math.round(regBuy * 0.92),
    regularSellingPrice: Math.round(base * 1.08),
    mrp: Math.round(base * 1.25),
    dealerPrice: Math.round(base * 0.97),
    distributorPrice: Math.round(base * 0.9),
    hsnCode: isService ? "998713" : `8517${(70 + (i % 9))}`,
    tax: isService ? 18 : [12, 18, 28][i % 3],
    minStock: min,
    maxStock: max,
    reservedStock: 0,
    soldUnits: Math.round(r * 240),
    purchasedUnits: Math.round(r2 * 300),
  };
});

export function itemHealth(it: InventoryItem): StockHealth {
  return classifyStock(it.currentStock, it.minStock, it.maxStock);
}

/* ── Dashboard aggregates ─────────────────────────────────────────────── */
export function inventoryStats() {
  const products = inventoryItems.filter((i) => i.type === "Product");
  const value = inventoryItems.reduce((s, i) => s + i.currentStock * i.regularBuyingPrice, 0);
  const count = inventoryItems.length;
  const by = (h: StockHealth) => products.filter((i) => itemHealth(i) === h).length;
  return {
    value,
    count,
    totalUnits: products.reduce((s, i) => s + Math.max(i.currentStock, 0), 0),
    low: by("low"),
    excess: by("excess"),
    negative: by("negative"),
    reorder: by("reorder"),
    optimum: by("optimum"),
    high: by("high"),
    pendingApprovals: approvals.filter((a) => a.status === "pending").length,
  };
}

export const topSelling = [...inventoryItems]
  .filter((i) => i.type === "Product")
  .sort((a, b) => b.soldUnits - a.soldUnits)
  .slice(0, 5);

export const topPurchased = [...inventoryItems]
  .filter((i) => i.type === "Product")
  .sort((a, b) => b.purchasedUnits - a.purchasedUnits)
  .slice(0, 5);

/* ── Inventory Approvals ──────────────────────────────────────────────── */
export type ApprovalStatus = "pending" | "approved" | "rejected";
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};
export const APPROVAL_STATUS_TONE: Record<ApprovalStatus, "warning" | "success" | "danger"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

export type Approval = {
  id: string;
  docType: "Purchase" | "Stock Transfer" | "Adjustment" | "Write-off" | "Return";
  docNumber: string;
  action: "Create" | "Update" | "Delete";
  status: ApprovalStatus;
  createdBy: string;
  actionBy: string;
  actionDate: string;
  barcodeAdded: boolean;
  items: number;
  amount: number;
};

const APPR_USERS = ["Anand", "Vikas", "Pooja", "Shubham", "Ravi", "Shop Owner"];
export const approvals: Approval[] = Array.from({ length: 14 }).map((_, i) => {
  const r = seeded(i + 7);
  const status: ApprovalStatus = i % 3 === 0 ? "pending" : i % 3 === 1 ? "approved" : "rejected";
  return {
    id: `APR-${(401 + i).toString()}`,
    docType: (["Purchase", "Stock Transfer", "Adjustment", "Write-off", "Return"] as const)[i % 5],
    docNumber: `DOC-${(2200 + i * 3).toString()}`,
    action: (["Create", "Update", "Delete"] as const)[i % 3],
    status,
    createdBy: APPR_USERS[i % APPR_USERS.length],
    actionBy: status === "pending" ? "—" : APPR_USERS[(i + 2) % APPR_USERS.length],
    actionDate: status === "pending" ? "—" : `${10 + (i % 18)}/01/2026`,
    barcodeAdded: i % 2 === 0,
    items: 1 + Math.round(r * 12),
    amount: 2000 + Math.round(r * 60000),
  };
});

/* ── Stock Movement ───────────────────────────────────────────────────── */
export type MovementType = "Transfer" | "Inward" | "Outward" | "Adjustment" | "Return";
export type MovementStatus = "completed" | "in-transit" | "draft" | "cancelled";
export const MOVEMENT_STATUS_LABEL: Record<MovementStatus, string> = {
  completed: "Completed",
  "in-transit": "In Transit",
  draft: "Draft",
  cancelled: "Cancelled",
};
export const MOVEMENT_STATUS_TONE: Record<MovementStatus, "success" | "info" | "neutral" | "danger"> = {
  completed: "success",
  "in-transit": "info",
  draft: "neutral",
  cancelled: "danger",
};

export type StockMovement = {
  docNumber: string;
  fromStore: string;
  toStore: string;
  items: number;
  date: string;
  user: string;
  type: MovementType;
  status: MovementStatus;
};

export const stockMovements: StockMovement[] = Array.from({ length: 16 }).map((_, i) => {
  const r = seeded(i + 19);
  const type = (["Transfer", "Inward", "Outward", "Adjustment", "Return"] as const)[i % 5];
  const status = (["completed", "in-transit", "draft", "cancelled"] as const)[i % 4];
  const from = type === "Inward" ? "Supplier" : STORES[1 + (i % (STORES.length - 1))];
  const to = type === "Outward" ? "Customer" : STORES[1 + ((i + 2) % (STORES.length - 1))];
  return {
    docNumber: `MOV-${(7100 + i * 4).toString()}`,
    fromStore: from,
    toStore: to,
    items: 1 + Math.round(r * 22),
    date: `${5 + (i % 22)}/01/2026`,
    user: APPR_USERS[i % APPR_USERS.length],
    type,
    status,
  };
});

/* ── Barcode register ─────────────────────────────────────────────────── */
export type BarcodeStatus = "active" | "consumed" | "expired" | "returned";
export const BARCODE_STATUS_LABEL: Record<BarcodeStatus, string> = {
  active: "Active",
  consumed: "Consumed",
  expired: "Expired",
  returned: "Returned",
};
export const BARCODE_STATUS_TONE: Record<BarcodeStatus, "success" | "neutral" | "danger" | "warning"> = {
  active: "success",
  consumed: "neutral",
  expired: "danger",
  returned: "warning",
};

export type BarcodeRow = {
  itemId: string;
  itemName: string;
  qtyOut: number;
  balanceQty: number;
  returnQty: number;
  createdBy: string;
  creationDate: string;
  mfgDate: string;
  expiryDate: string;
  info1: string;
  info2: string;
  fromStore: string;
  toStore: string;
  lastModifiedBy: string;
  lastModifiedDate: string;
  status: BarcodeStatus;
};

export const barcodes: BarcodeRow[] = inventoryItems.slice(0, 12).map((it, i) => {
  const r = seeded(i + 31);
  const qtyOut = 2 + Math.round(r * 14);
  const ret = i % 4 === 0 ? Math.round(r * 3) : 0;
  return {
    itemId: it.id,
    itemName: it.name,
    qtyOut,
    balanceQty: Math.max(it.currentStock - qtyOut, 0),
    returnQty: ret,
    createdBy: APPR_USERS[i % APPR_USERS.length],
    creationDate: `${4 + (i % 20)}/01/2026`,
    mfgDate: `${1 + (i % 12)}/2025`,
    expiryDate: `${1 + (i % 12)}/2027`,
    info1: it.category,
    info2: it.uom,
    fromStore: STORES[1 + (i % (STORES.length - 1))],
    toStore: STORES[1 + ((i + 1) % (STORES.length - 1))],
    lastModifiedBy: APPR_USERS[(i + 1) % APPR_USERS.length],
    lastModifiedDate: `${6 + (i % 18)}/01/2026`,
    status: (["active", "consumed", "expired", "returned"] as const)[i % 4],
  };
});

/* ── Recent inventory activity (dashboard feed) ───────────────────────── */
export type ActivityKind = "inward" | "outward" | "adjust" | "approval" | "alert";
export const recentActivity: { id: number; kind: ActivityKind; title: string; meta: string; time: string }[] = [
  { id: 1, kind: "inward", title: "32 units received", meta: "iPhone 15 Pro OLED · Main Store", time: "12m ago" },
  { id: 2, kind: "alert", title: "Low stock alert", meta: "Pixel 9 Type-C Flex hit reorder level", time: "48m ago" },
  { id: 3, kind: "outward", title: "8 units issued", meta: "Service Counter · Ticket T-1837", time: "1h ago" },
  { id: 4, kind: "approval", title: "Purchase approved", meta: "DOC-2206 by Shop Owner", time: "2h ago" },
  { id: 5, kind: "adjust", title: "Stock adjusted", meta: "−3 Galaxy A55 Charging Port", time: "3h ago" },
  { id: 6, kind: "inward", title: "Transfer completed", meta: "Warehouse A → Branch Andheri", time: "5h ago" },
];

/* ── Smart recommendations (dashboard) ────────────────────────────────── */
export const recommendations: { id: number; tone: "danger" | "warning" | "info"; title: string; detail: string }[] = [
  { id: 1, tone: "danger", title: "Reorder 5 critical SKUs", detail: "Below minimum level — est. ₹84,000 purchase order." },
  { id: 2, tone: "warning", title: "Rebalance excess stock", detail: "3 SKUs overstocked at Warehouse A vs demand at Service Counter." },
  { id: 3, tone: "info", title: "Review 4 pending approvals", detail: "2 purchases waiting since yesterday." },
];

export const LAST_UPDATED = "Today, 09:42 AM";
