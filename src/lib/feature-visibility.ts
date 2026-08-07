/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Feature Visibility System

   An extension layer on top of the existing RBAC permission system.
   While permissions control *what actions* a user can perform, Feature
   Visibility controls *whether a page/module is accessible at all*.

   Three visibility modes per feature, per role, per store:
     • visible       → normal access
     • coming_soon   → sidebar shows the item; clicking shows a premium
                       "Coming Soon" page instead of the real module
     • hidden        → completely removed from sidebar/routing

   This module provides:
     1. Types (VisibilityMode, FeatureEntry, etc.)
     2. A dynamic module registry built from the existing navigation data
     3. Content metadata for the Coming Soon page (dynamically generated)
   ────────────────────────────────────────────────────────────────────────── */

import { navItems, navGroups, expandableNavGroups, type NavItem, type ExpandableNavGroup } from "@/lib/mock-data";
import type { WorkspaceId } from "@/lib/permissions";

/* ── Types ───────────────────────────────────────────────────────────────── */

export type VisibilityMode = "visible" | "coming_soon" | "hidden";

/** A single feature entry in the registry — represents one navigable page. */
export interface FeatureEntry {
  /** Unique identifier derived from href, e.g. "dashboard", "tickets", "leads_list" */
  id: string;
  /** Human-readable label from the nav item */
  label: string;
  /** The route path */
  href: string;
  /** Which workspace this feature belongs to */
  workspace: WorkspaceId;
  /** Optional group label (e.g. "Employees", "Accounts") for expandable groups */
  group?: string;
  /** Icon name from the nav item */
  icon: string;
}

/** Per-role visibility configuration: featureId → VisibilityMode */
export type FeatureVisibilityMap = Record<string, VisibilityMode>;

/** The full store/workspace configuration: roleId → featureId → mode */
export type StoreFeatureVisibility = Record<string, FeatureVisibilityMap>;

/* ── Module Registry ─────────────────────────────────────────────────────
   Dynamically builds the feature list from existing navigation data.
   No hardcoded page names — reads directly from navItems + navGroups. */

function hrefToId(href: string): string {
  // "/leads/kanban" → "leads_kanban", "/dashboard" → "dashboard"
  return href
    .replace(/^\//, "")
    .replace(/\//g, "_")
    .replace(/-/g, "_");
}

/** Determine which workspace a href belongs to by scanning navGroups. */
function resolveWorkspace(href: string): WorkspaceId {
  for (const [wsId, groups] of Object.entries(navGroups) as [WorkspaceId, { label: string; items: string[] }[]][]) {
    for (const g of groups) {
      if (g.items.includes(href)) return wsId;
    }
  }
  // Check expandable nav groups
  for (const [wsId, groups] of Object.entries(expandableNavGroups) as [WorkspaceId, ExpandableNavGroup[]][]) {
    for (const g of groups) {
      if (g.children.some((c) => c.href === href)) return wsId;
    }
  }
  // Heuristic: path prefix
  if (href.startsWith("/leads") || href.startsWith("/lead-management")) return "leads";
  if (href.startsWith("/operations") || href.startsWith("/stock")) return "operations";
  return "shop";
}

/** Build the complete feature registry from existing navigation data. */
function buildFeatureRegistry(): FeatureEntry[] {
  const seen = new Set<string>();
  const entries: FeatureEntry[] = [];

  // 1. Process all navItems
  for (const item of navItems) {
    const id = hrefToId(item.href);
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({
      id,
      label: item.label,
      href: item.href,
      workspace: resolveWorkspace(item.href),
      icon: item.icon,
    });
  }

  // 2. Process expandable nav group children
  for (const [wsId, groups] of Object.entries(expandableNavGroups) as [WorkspaceId, ExpandableNavGroup[]][]) {
    for (const group of groups) {
      for (const child of group.children) {
        const id = hrefToId(child.href);
        if (seen.has(id)) continue;
        seen.add(id);
        entries.push({
          id,
          label: child.label,
          href: child.href,
          workspace: wsId,
          group: group.label,
          icon: child.icon,
        });
      }
    }
  }

  return entries;
}

/** The immutable feature registry — built once from navigation data. */
export const FEATURE_REGISTRY: FeatureEntry[] = buildFeatureRegistry();

/** Lookup map: href → FeatureEntry for O(1) route checks. */
export const FEATURE_BY_HREF: Record<string, FeatureEntry> = Object.fromEntries(
  FEATURE_REGISTRY.map((f) => [f.href, f])
);

/** Lookup map: featureId → FeatureEntry. */
export const FEATURE_BY_ID: Record<string, FeatureEntry> = Object.fromEntries(
  FEATURE_REGISTRY.map((f) => [f.id, f])
);

/** Group features by workspace for the visibility matrix UI. */
export function featuresByWorkspace(): Record<WorkspaceId, FeatureEntry[]> {
  const map: Record<WorkspaceId, FeatureEntry[]> = { shop: [], leads: [], operations: [] };
  for (const f of FEATURE_REGISTRY) {
    map[f.workspace].push(f);
  }
  return map;
}

/* ── Default visibility ──────────────────────────────────────────────────
   By default everything is visible. The system only stores overrides. */

export function getDefaultVisibility(): FeatureVisibilityMap {
  const map: FeatureVisibilityMap = {};
  for (const f of FEATURE_REGISTRY) {
    map[f.id] = "visible";
  }
  return map;
}

/** Resolve the visibility of a feature for a given role.
 *  Falls back to "visible" when no override is stored. */
export function resolveVisibility(
  config: StoreFeatureVisibility | null | undefined,
  roleId: string,
  featureId: string
): VisibilityMode {
  if (!config) return "visible";
  const roleMap = config[roleId];
  if (!roleMap) return "visible";
  return roleMap[featureId] ?? "visible";
}

/** Resolve visibility by href path — convenience for sidebar/routing. */
export function resolveVisibilityByHref(
  config: StoreFeatureVisibility | null | undefined,
  roleId: string,
  href: string
): VisibilityMode {
  const feature = FEATURE_BY_HREF[href];
  if (!feature) return "visible"; // unknown routes pass through
  return resolveVisibility(config, roleId, feature.id);
}

/* ── Coming Soon Dynamic Content ─────────────────────────────────────────
   Generates contextual content based on the module/feature the user tried
   to access. Uses intelligent mapping rather than one-size-fits-all. */

export interface ComingSoonContent {
  headline: string;
  description: string;
  highlights: string[];
  illustration: "rocket" | "chart" | "shield" | "gear" | "map" | "inbox" | "stack" | "calendar";
}

/** Content map keyed by feature id patterns. When no exact match exists,
 *  the system falls back to intelligent matching by workspace/keyword. */
const CONTENT_MAP: Record<string, ComingSoonContent> = {
  // Inventory & Stock
  inventory: {
    headline: "Inventory Management",
    description: "Powerful inventory tracking, barcode management, stock movements and intelligent inventory insights are currently being prepared.",
    highlights: ["Smart Inventory Tracking", "Barcode Management", "Stock Intelligence", "Purchase Workflow"],
    illustration: "stack",
  },
  stock: {
    headline: "Stock Levels",
    description: "Real-time stock monitoring with alerts, reorder points, and warehouse management are on their way.",
    highlights: ["Real-Time Stock Levels", "Low Stock Alerts", "Multi-Location Tracking", "Reorder Automation"],
    illustration: "stack",
  },
  // Reports
  reports: {
    headline: "Advanced Reports",
    description: "Business intelligence with interactive dashboards, scheduled reports, and deep analytics are being built for you.",
    highlights: ["Business Intelligence", "Interactive Dashboards", "Scheduled Reports", "Advanced Analytics"],
    illustration: "chart",
  },
  operations_reports: {
    headline: "Operations Reports",
    description: "Comprehensive field operations analytics, technician performance metrics, and route efficiency reports.",
    highlights: ["Technician Performance", "Route Efficiency", "Job Completion Analytics", "Cost Analysis"],
    illustration: "chart",
  },
  leads_reports: {
    headline: "Sales Reports",
    description: "Pipeline analytics, conversion tracking, revenue forecasting, and team performance dashboards.",
    highlights: ["Pipeline Analytics", "Conversion Tracking", "Revenue Forecasting", "Team Performance"],
    illustration: "chart",
  },
  // Accounts & Finance
  accounts_ledger: {
    headline: "Daily Ledger",
    description: "Complete day-by-day financial tracking with automated entries, reconciliation, and audit trails.",
    highlights: ["Daily Ledger", "Auto Reconciliation", "Financial Reports", "Audit Trail"],
    illustration: "chart",
  },
  accounts_banking: {
    headline: "Banking & Transfers",
    description: "Bank account management, inter-account transfers, and payment reconciliation made effortless.",
    highlights: ["Bank Account Management", "Inter-Account Transfers", "Payment Reconciliation", "Transaction History"],
    illustration: "shield",
  },
  accounts_management: {
    headline: "Account Management",
    description: "Chart of accounts, financial categorization, and accounting workflow management.",
    highlights: ["Chart of Accounts", "Category Management", "Financial Workflows", "Compliance Tools"],
    illustration: "shield",
  },
  // Expenses
  expenses: {
    headline: "Expense Tracking",
    description: "Smart expense management with receipt scanning, approval workflows, and category-based reporting.",
    highlights: ["Expense Tracking", "Receipt Management", "Approval Workflows", "Category Reports"],
    illustration: "chart",
  },
  // Operations / Field
  operations: {
    headline: "Field Operations",
    description: "Technician tracking, route optimization, job scheduling, and service analytics are currently being prepared.",
    highlights: ["Technician Tracking", "Route Optimization", "Job Scheduling", "Service Analytics"],
    illustration: "map",
  },
  operations_vendors: {
    headline: "Vendor Management",
    description: "Comprehensive vendor directory, performance tracking, and procurement workflow management.",
    highlights: ["Vendor Directory", "Performance Tracking", "Procurement Workflow", "Payment Management"],
    illustration: "gear",
  },
  operations_purchase_orders: {
    headline: "Purchase Orders",
    description: "End-to-end purchase order management with approval chains, delivery tracking, and invoice matching.",
    highlights: ["PO Creation & Approval", "Delivery Tracking", "Invoice Matching", "Budget Control"],
    illustration: "gear",
  },
  operations_transfers: {
    headline: "Parts Transfers",
    description: "Inter-branch inventory transfers with tracking, approval workflows, and automated stock updates.",
    highlights: ["Inter-Branch Transfers", "Transfer Tracking", "Approval Workflows", "Stock Sync"],
    illustration: "stack",
  },
  operations_products: {
    headline: "Product Items",
    description: "Product catalogue management with pricing, variants, and inventory linkage.",
    highlights: ["Product Catalogue", "Price Management", "Variant Support", "Inventory Linkage"],
    illustration: "stack",
  },
  // Leads / Sales
  lead_management: {
    headline: "Sales Dashboard",
    description: "Pipeline overview, conversion metrics, and team performance at a glance.",
    highlights: ["Pipeline Overview", "Conversion Metrics", "Team Leaderboard", "Revenue Tracking"],
    illustration: "chart",
  },
  leads_list: {
    headline: "Lead Management",
    description: "Capture, score, and convert every enquiry with intelligent lead management tools.",
    highlights: ["Lead Capture", "Smart Scoring", "Auto Assignment", "Conversion Tracking"],
    illustration: "inbox",
  },
  leads_kanban: {
    headline: "Sales Pipeline",
    description: "Visual Kanban board for managing deals through every stage of your sales process.",
    highlights: ["Visual Pipeline", "Drag & Drop Stages", "Deal Tracking", "Win/Loss Analysis"],
    illustration: "chart",
  },
  leads_contacts: {
    headline: "Contact Management",
    description: "Unified contact directory with communication history, segmentation, and smart lists.",
    highlights: ["Contact Directory", "Communication History", "Smart Segmentation", "Activity Timeline"],
    illustration: "inbox",
  },
  leads_companies: {
    headline: "Company Management",
    description: "B2B account management with org hierarchy, deal tracking, and relationship mapping.",
    highlights: ["Company Profiles", "Org Hierarchy", "Deal Tracking", "Relationship Map"],
    illustration: "inbox",
  },
  leads_deals: {
    headline: "Deals & Revenue",
    description: "Full deal lifecycle management from qualification to close with revenue tracking.",
    highlights: ["Deal Pipeline", "Revenue Tracking", "Win Probability", "Deal Analytics"],
    illustration: "chart",
  },
  leads_quotations: {
    headline: "Quotations",
    description: "Professional quotation builder with templates, e-signatures, and conversion tracking.",
    highlights: ["Quote Builder", "Template Library", "E-Signatures", "Conversion Tracking"],
    illustration: "gear",
  },
  leads_inbox: {
    headline: "Unified Inbox",
    description: "All customer communications in one place — email, WhatsApp, SMS, and calls.",
    highlights: ["Unified Inbox", "Multi-Channel", "Thread Tracking", "Quick Responses"],
    illustration: "inbox",
  },
  leads_tasks: {
    headline: "Task Management",
    description: "Sales task tracking with deadlines, assignments, and productivity insights.",
    highlights: ["Task Tracking", "Deadline Management", "Team Assignment", "Productivity Insights"],
    illustration: "calendar",
  },
  leads_meetings: {
    headline: "Meeting Scheduler",
    description: "Schedule, track, and follow up on meetings with calendar integration and notes.",
    highlights: ["Meeting Scheduler", "Calendar Integration", "Meeting Notes", "Follow-Up Automation"],
    illustration: "calendar",
  },
  leads_activities: {
    headline: "Activity Feed",
    description: "Complete activity timeline across your sales team — calls, emails, meetings, and notes.",
    highlights: ["Activity Timeline", "Team Activity", "Performance Metrics", "Activity Reports"],
    illustration: "chart",
  },
  leads_calls: {
    headline: "Call Management",
    description: "Click-to-call, call logging, recording integrations, and call analytics.",
    highlights: ["Click-to-Call", "Call Logging", "Recording Integration", "Call Analytics"],
    illustration: "inbox",
  },
  leads_email: {
    headline: "Email Campaigns",
    description: "Email sequences, templates, tracking, and campaign analytics for your sales team.",
    highlights: ["Email Sequences", "Template Builder", "Open/Click Tracking", "Campaign Analytics"],
    illustration: "inbox",
  },
  leads_whatsapp: {
    headline: "WhatsApp Business",
    description: "WhatsApp Business integration with templates, automation, and conversation tracking.",
    highlights: ["WhatsApp Integration", "Message Templates", "Automation Flows", "Conversation Tracking"],
    illustration: "inbox",
  },
  leads_smart_lists: {
    headline: "Smart Lists",
    description: "Dynamic lead segmentation with saved filters, auto-updating lists, and bulk actions.",
    highlights: ["Dynamic Segments", "Saved Filters", "Auto-Update Lists", "Bulk Actions"],
    illustration: "gear",
  },
  leads_map_view: {
    headline: "Map View",
    description: "Geographic visualization of leads, customers, and field activity on an interactive map.",
    highlights: ["Geographic View", "Proximity Search", "Route Planning", "Area Analytics"],
    illustration: "map",
  },
  leads_campaigns: {
    headline: "Campaign Management",
    description: "Multi-channel campaign management with tracking, automation, and ROI analytics.",
    highlights: ["Multi-Channel Campaigns", "Automation Flows", "ROI Tracking", "A/B Testing"],
    illustration: "rocket",
  },
  // Tickets & Shop
  tickets: {
    headline: "Ticket Management",
    description: "End-to-end repair ticket management from intake to delivery with full traceability.",
    highlights: ["Repair Tracking", "Status Workflow", "QC Integration", "Customer Notifications"],
    illustration: "gear",
  },
  invoice: {
    headline: "Invoice Management",
    description: "Professional invoicing with templates, payment tracking, and automated reminders.",
    highlights: ["Invoice Builder", "Payment Tracking", "Auto Reminders", "Multi-Currency"],
    illustration: "chart",
  },
  walk_in: {
    headline: "Walk-In POS",
    description: "Quick point-of-sale for walk-in customers with inventory lookup and instant billing.",
    highlights: ["Quick Billing", "Inventory Lookup", "Receipt Printing", "Customer Lookup"],
    illustration: "gear",
  },
  price_list: {
    headline: "Price List & Catalog",
    description: "Device catalog management with service pricing, parts pricing, and brand/model hierarchy.",
    highlights: ["Device Catalog", "Service Pricing", "Parts Pricing", "Brand/Model Hierarchy"],
    illustration: "stack",
  },
  // Employees
  employees_directory: {
    headline: "Employee Directory",
    description: "Complete staff directory with profiles, departments, and organizational hierarchy.",
    highlights: ["Staff Profiles", "Department Structure", "Contact Directory", "Org Chart"],
    illustration: "inbox",
  },
  employees_payroll: {
    headline: "Payroll & Salary",
    description: "Automated payroll processing with salary calculations, deductions, and pay slip generation.",
    highlights: ["Payroll Processing", "Salary Calculations", "Deductions & Benefits", "Pay Slip Generation"],
    illustration: "chart",
  },
  employees_salary_advances: {
    headline: "Salary Advances",
    description: "Employee advance management with approval workflows, EMI tracking, and balance reporting.",
    highlights: ["Advance Requests", "Approval Workflow", "EMI Tracking", "Balance Reports"],
    illustration: "chart",
  },
  // Settings & Activity
  settings: {
    headline: "System Settings",
    description: "Complete platform configuration including organization, store, invoice, and integration settings.",
    highlights: ["Organization Profile", "Store Configuration", "Invoice Settings", "Integrations"],
    illustration: "gear",
  },
  leads_settings: {
    headline: "Sales Settings",
    description: "Configure your sales pipeline, lead scoring rules, assignment logic, and team preferences.",
    highlights: ["Pipeline Stages", "Scoring Rules", "Assignment Logic", "Team Preferences"],
    illustration: "gear",
  },
  activity: {
    headline: "Activity Log",
    description: "Complete audit trail of all system activities with filtering, search, and export capabilities.",
    highlights: ["Audit Trail", "Activity Search", "User Tracking", "Export Logs"],
    illustration: "shield",
  },
  // Roles & Permissions (itself — should never be hidden from owner)
  roles_permissions: {
    headline: "Roles & Permissions",
    description: "Access control management with role definitions, permission matrix, and user assignment.",
    highlights: ["Role Management", "Permission Matrix", "User Assignment", "Access Audit"],
    illustration: "shield",
  },
  // Shop sub-pages
  shop_technicians: {
    headline: "Employees Overview",
    description: "Technician workload view with assignments, availability, and performance tracking.",
    highlights: ["Workload View", "Assignment Tracking", "Availability Status", "Performance Metrics"],
    illustration: "gear",
  },
  shop_notes: {
    headline: "Notes & Documents",
    description: "Internal notes and document management for repair jobs and customer communication.",
    highlights: ["Internal Notes", "Document Upload", "Team Collaboration", "Attachment Management"],
    illustration: "inbox",
  },
  shop_payments: {
    headline: "Payment Management",
    description: "Payment collection, tracking, and reconciliation across all channels.",
    highlights: ["Payment Collection", "Multi-Channel Payments", "Reconciliation", "Payment Reports"],
    illustration: "chart",
  },
  contacts: {
    headline: "Customer Accounts",
    description: "Complete customer management with profiles, history, and communication tracking.",
    highlights: ["Customer Profiles", "Service History", "Communication Log", "Loyalty Tracking"],
    illustration: "inbox",
  },
  dashboard: {
    headline: "Dashboard",
    description: "Business overview with KPIs, charts, and real-time activity monitoring.",
    highlights: ["KPI Cards", "Interactive Charts", "Activity Feed", "Quick Actions"],
    illustration: "chart",
  },
};

/** Workspace-level fallback content when no specific content exists for a feature. */
const WORKSPACE_FALLBACK: Record<WorkspaceId, ComingSoonContent> = {
  shop: {
    headline: "Shop Feature",
    description: "This powerful shop management feature is currently being prepared for you. Stay tuned for an amazing experience.",
    highlights: ["Enhanced Workflow", "Smart Automation", "Real-Time Updates", "Beautiful Interface"],
    illustration: "gear",
  },
  leads: {
    headline: "Sales Feature",
    description: "This advanced sales management feature is being built to supercharge your pipeline. Coming soon.",
    highlights: ["Pipeline Enhancement", "Smart Insights", "Team Collaboration", "Performance Tracking"],
    illustration: "rocket",
  },
  operations: {
    headline: "Operations Feature",
    description: "This powerful operations feature is being developed to streamline your field management workflow.",
    highlights: ["Streamlined Workflow", "Smart Scheduling", "Performance Insights", "Resource Optimization"],
    illustration: "map",
  },
};

/** Get dynamic Coming Soon content for a feature. Falls back gracefully. */
export function getComingSoonContent(featureId: string): ComingSoonContent {
  // Direct match
  if (CONTENT_MAP[featureId]) return CONTENT_MAP[featureId];

  // Try to resolve from the feature registry for workspace fallback
  const feature = FEATURE_BY_ID[featureId];
  if (feature) {
    // Use the feature's label to build a personalized fallback
    const ws = feature.workspace;
    const fallback = WORKSPACE_FALLBACK[ws];
    return {
      headline: feature.label,
      description: `${feature.label} is currently being prepared. This powerful feature will enhance your ${ws === "leads" ? "sales" : ws === "operations" ? "field operations" : "shop management"} workflow.`,
      highlights: fallback.highlights,
      illustration: fallback.illustration,
    };
  }

  // Ultimate fallback
  return {
    headline: "Feature Coming Soon",
    description: "This feature is currently being developed. Stay tuned for something amazing.",
    highlights: ["Enhanced Workflow", "Smart Automation", "Beautiful Design", "Powerful Insights"],
    illustration: "rocket",
  };
}

/** Get content for a Coming Soon page by href path. */
export function getComingSoonContentByHref(href: string): ComingSoonContent {
  const feature = FEATURE_BY_HREF[href];
  if (!feature) {
    // Try to generate a featureId from the href
    const id = hrefToId(href);
    return getComingSoonContent(id);
  }
  return getComingSoonContent(feature.id);
}
