"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Boxes, PlusCircle, BadgeCheck, ArrowLeftRight, ScanBarcode,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const INVENTORY_NAV = [
  { href: "/inventory", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory/item-master", label: "Item Master", icon: Boxes },
  { href: "/inventory/add-item", label: "Add Item", icon: PlusCircle },
  { href: "/inventory/approvals", label: "Approvals", icon: BadgeCheck },
  { href: "/inventory/stock-movement", label: "Stock Movement", icon: ArrowLeftRight },
  { href: "/inventory/barcode", label: "Barcode", icon: ScanBarcode },
] as const;

export function InventorySubNav() {
  const pathname = usePathname();

  return (
    <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <nav className="inline-flex min-w-full items-center gap-1 rounded-2xl border border-border bg-card p-1 shadow-[0_1px_3px_0_rgba(20,30,80,0.05)]">
        {INVENTORY_NAV.map((item) => {
          const active =
            item.href === "/inventory"
              ? pathname === "/inventory"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-colors",
                active ? "text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="inventory-subnav-active"
                  className="absolute inset-0 rounded-xl bg-[#4361EE] shadow-[0_8px_22px_-10px_rgba(67,97,238,0.55)]"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon
                className={cn(
                  "relative h-[15px] w-[15px] shrink-0",
                  active ? "text-white" : "text-zinc-400 group-hover:text-zinc-600"
                )}
              />
              <span className="relative whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
