/* ──────────────────────────────────────────────────────────────────────────
   Inventory workspace navigation — the ONE definition used by the dedicated
   Inventory sidebar (components/inventory/inventory-sidebar.tsx).

   Sections keep the sidebar short: each section is a collapsible group and only
   the section holding the current page is open. Plan: docs/inventory-redesign-plan.md
   ────────────────────────────────────────────────────────────────────────── */
import {
  LayoutDashboard, Boxes, PlusCircle, BadgeDollarSign, AlertTriangle,
  TrendingUp, ArrowLeftRight, ShieldAlert, BadgeCheck, ScanBarcode, FileSpreadsheet,
  Truck, ClipboardList, Recycle, ClipboardCheck, Smartphone, Undo2,
  Layers, Wrench, type LucideIcon,
} from "lucide-react";
import { CAP } from "@/lib/capabilities";

export type InvNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** OR-set of permission keys (CAP.*). Omitted = anyone who can open Inventory. */
  permission?: readonly string[];
  /** Live count chip shown beside the label (computed in the sidebar). */
  badge?: "lowStock";
};

export type InvNavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: InvNavItem[];
};

export const INVENTORY_HOME = "/inventory";

export const INVENTORY_NAV: InvNavSection[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      { href: "/inventory", label: "Stock Summary", icon: LayoutDashboard },
    ],
  },
  {
    id: "items",
    label: "Items & Pricing",
    icon: Boxes,
    items: [
      { href: "/inventory/item-master", label: "Item Master", icon: Boxes },
      { href: "/inventory/add-item", label: "Add Item", icon: PlusCircle, permission: CAP.inventory.create },
      { href: "/inventory/price-control", label: "Price List Edit", icon: BadgeDollarSign },
      { href: "/inventory/part-grades", label: "Part Grades & Variants", icon: Layers },
    ],
  },
  {
    id: "control",
    label: "Stock Control",
    icon: AlertTriangle,
    items: [
      { href: "/inventory/low-stock", label: "Low Stock Alerts", icon: AlertTriangle, badge: "lowStock" },
      { href: "/inventory/forecast", label: "Stock Forecast", icon: TrendingUp },
      { href: "/inventory/stock-movement", label: "Stock Transfer", icon: ArrowLeftRight },
      { href: "/inventory/loss-damage", label: "Loss & Damage", icon: ShieldAlert, permission: CAP.lossDamage.view },
      { href: "/inventory/approvals", label: "Approvals", icon: BadgeCheck },
      { href: "/inventory/stock-count", label: "Stock Audit", icon: ClipboardCheck, permission: CAP.stockAudit.view },
    ],
  },
  {
    id: "purchasing",
    label: "Purchasing",
    icon: Truck,
    items: [
      { href: "/inventory/vendors", label: "Vendors", icon: Truck, permission: CAP.inventory.vendors },
      { href: "/inventory/purchase-orders", label: "Purchase Orders", icon: ClipboardList, permission: CAP.inventory.purchase },
      { href: "/inventory/receive-stock", label: "Receive Stock (GRN)", icon: Recycle, permission: CAP.inventory.purchase },
      { href: "/inventory/vendor-returns", label: "Vendor Returns (RMA)", icon: Undo2, permission: CAP.inventory.purchase },
    ],
  },
  {
    id: "repair",
    label: "Repair Tracking",
    icon: Wrench,
    items: [
      { href: "/inventory/serials", label: "Serial / IMEI Units", icon: Smartphone },
      { href: "/inventory/old-parts", label: "Old Part Returns", icon: Recycle },
      { href: "/inventory/warranty-parts", label: "Warranty Part Claims", icon: BadgeCheck },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    icon: ScanBarcode,
    items: [
      { href: "/inventory/barcode", label: "Barcode", icon: ScanBarcode },
      { href: "/inventory/import-export", label: "Bulk Import / Export", icon: FileSpreadsheet },
    ],
  },
];

export function isInventoryPath(pathname: string): boolean {
  return pathname === "/inventory" || pathname.startsWith("/inventory/");
}

/** Which section owns a given pathname (for auto-opening the right group). */
export function sectionForPath(pathname: string): string | null {
  let best: { id: string; len: number } | null = null;
  for (const s of INVENTORY_NAV) {
    for (const it of s.items) {
      const match = it.href === "/inventory" ? pathname === "/inventory" : pathname === it.href || pathname.startsWith(it.href + "/");
      if (match && (!best || it.href.length > best.len)) best = { id: s.id, len: it.href.length };
    }
  }
  return best?.id ?? null;
}
