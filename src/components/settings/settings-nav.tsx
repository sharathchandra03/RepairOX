"use client";

import { useState, useMemo } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ChevronDown, User, Building2, Users, CreditCard,
  Package, Ticket, FileText, UserCheck, Plug, Bell, Settings2,
  ShieldCheck, Printer, Receipt, BarChart3, Palette,
} from "lucide-react";

/* ─── Navigation Structure ───────────────────────────────────────────── */

type NavChild = { label: string; href: string };
type NavSection = { id: string; label: string; icon: any; children: NavChild[] };

const SETTINGS_NAV: NavSection[] = [
  {
    id: "account", label: "Account", icon: User,
    children: [
      { label: "Profile", href: "/settings/account/profile" },
      { label: "Active Sessions", href: "/settings/account/sessions" },
      { label: "Billing", href: "/settings/account/billing" },
    ],
  },
  {
    id: "store", label: "Store", icon: Building2,
    children: [
      { label: "Store Information", href: "/settings/store" },
      { label: "Store Configuration", href: "/settings/store/configuration" },
      { label: "Printing", href: "/settings/store/printing" },
      { label: "Expenses", href: "/settings/store/expenses" },
    ],
  },
  {
    id: "employees", label: "Employees", icon: Users,
    children: [
      { label: "Manage Employees", href: "/settings/users" },
      { label: "Roles & Permissions", href: "/settings/permissions" },
      { label: "Security", href: "/settings/employees/security" },
    ],
  },
  {
    id: "financial", label: "Financial", icon: CreditCard,
    children: [
      { label: "Currency", href: "/settings/financial/currency" },
      { label: "Tax", href: "/settings/financial/tax" },
      { label: "Accounting", href: "/settings/financial/accounting" },
    ],
  },
  {
    id: "inventory", label: "Inventory", icon: Package,
    children: [
      { label: "Inventory Settings", href: "/settings/inventory/general" },
      { label: "Price Lists", href: "/settings/inventory/price-lists" },
      { label: "Barcode", href: "/settings/inventory/barcode" },
    ],
  },
  {
    id: "tickets", label: "Tickets", icon: Ticket,
    children: [
      { label: "Ticket Settings", href: "/settings/tickets/general" },
      { label: "QC Settings", href: "/settings/tickets/qc" },
      { label: "Workflow", href: "/settings/tickets/workflow" },
      { label: "Device Categories", href: "/settings/categories" },
    ],
  },
  {
    id: "invoice", label: "Invoice", icon: FileText,
    children: [
      { label: "Invoice Settings", href: "/settings/invoice/general" },
      { label: "Invoice Templates", href: "/settings/invoice/templates" },
      { label: "Payment", href: "/settings/invoice/payment" },
    ],
  },
  {
    id: "customers", label: "Customers", icon: UserCheck,
    children: [
      { label: "Customer Groups", href: "/settings/customers/groups" },
      { label: "Loyalty", href: "/settings/customers/loyalty" },
    ],
  },
  {
    id: "integrations", label: "Integrations", icon: Plug,
    children: [
      { label: "API", href: "/settings/integrations/api" },
      { label: "Email", href: "/settings/integrations/email" },
      { label: "SMS", href: "/settings/integrations/sms" },
      { label: "WhatsApp", href: "/settings/integrations/whatsapp" },
      { label: "Google", href: "/settings/integrations/google" },
    ],
  },
  {
    id: "notifications", label: "Notifications", icon: Bell,
    children: [
      { label: "Email", href: "/settings/notifications/email" },
      { label: "SMS", href: "/settings/notifications/sms" },
      { label: "Push", href: "/settings/notifications/push" },
    ],
  },
  {
    id: "system", label: "System", icon: Settings2,
    children: [
      { label: "Language", href: "/settings/system/language" },
      { label: "Time Zone", href: "/settings/system/timezone" },
      { label: "Backup", href: "/settings/system/backup" },
      { label: "Preferences", href: "/settings/system/preferences" },
      { label: "Module Access", href: "/settings/module-access" },
      { label: "Branches", href: "/settings/branches" },
      { label: "Dashboard", href: "/settings/dashboard" },
    ],
  },
];

/* ─── Component ──────────────────────────────────────────────────────── */

export function SettingsNav({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const [search, setSearch] = useState("");

  // Determine which section is active based on path
  const activeSection = useMemo(() => {
    for (const section of SETTINGS_NAV) {
      if (section.children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"))) {
        return section.id;
      }
    }
    // Default to store
    return "store";
  }, [pathname]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    init[activeSection] = true;
    return init;
  });

  const toggleSection = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter sections by search
  const filteredNav = useMemo(() => {
    if (!search.trim()) return SETTINGS_NAV;
    const q = search.toLowerCase();
    return SETTINGS_NAV.map((section) => {
      const matchedChildren = section.children.filter(
        (c) => c.label.toLowerCase().includes(q) || section.label.toLowerCase().includes(q)
      );
      if (matchedChildren.length === 0 && !section.label.toLowerCase().includes(q)) return null;
      return { ...section, children: matchedChildren.length > 0 ? matchedChildren : section.children };
    }).filter(Boolean) as NavSection[];
  }, [search]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <h2 className="font-display text-xl font-bold tracking-tight">Settings</h2>
        <p className="text-[12px] text-muted-foreground mt-1">Manage your workspace</p>
      </div>

      {/* Search */}
      <div className="px-5 pb-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search settings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 rounded-lg border border-border bg-muted/50 pl-9 pr-3 text-[13px] placeholder:text-muted-foreground transition focus:border-[#4361EE] focus:ring-2 focus:ring-[#4361EE]/15 focus:outline-none"
          />
        </div>
      </div>

      {/* Navigation accordion */}
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {filteredNav.map((section) => {
          const Icon = section.icon;
          const isExpanded = expanded[section.id] || (search.trim().length > 0);
          const hasActive = section.children.some((c) => pathname === c.href || pathname.startsWith(c.href + "/"));

          return (
            <div key={section.id} className="mb-1">
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  hasActive ? "text-[#4361EE]" : "text-foreground hover:bg-muted/60"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] shrink-0 ${hasActive ? "text-[#4361EE]" : "text-muted-foreground"}`} />
                <span className="flex-1 text-[14px] font-semibold">{section.label}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {/* Children */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="pl-[30px] py-1 space-y-0.5">
                      {section.children.map((child) => {
                        const isActive = pathname === child.href || pathname.startsWith(child.href + "/");
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onNavigate}
                            className={`block rounded-md px-3 py-2 text-[13px] transition-colors ${
                              isActive
                                ? "bg-[#4361EE]/8 text-[#4361EE] font-medium"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
