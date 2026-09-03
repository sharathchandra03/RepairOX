"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useStore } from "@/lib/store";
import type { Ticket, TicketStatus } from "@/lib/mock-data";
import type { Invoice, InvoiceStatus } from "@/lib/mock-data";

/* ─── Search Scope ───────────────────────────────────────────────────── */

export type SearchScope = "tickets" | "invoices" | "settings";

export const SEARCH_SCOPES: { id: SearchScope; label: string }[] = [
  { id: "tickets", label: "Tickets" },
  { id: "invoices", label: "Invoices" },
  { id: "settings", label: "Settings" },
];

/* ─── Result Types ───────────────────────────────────────────────────── */

export type TicketResult = {
  type: "ticket";
  id: string;
  /** Human-readable ticket number for display; `id` stays the routing key. */
  displayId?: string;
  customer: string;
  phone: string;
  device: string;
  model: string;
  issue: string;
  status: TicketStatus;
  amount: number;
  dueDate?: string;
  imei?: string;
  href: string;
};

export type InvoiceResult = {
  type: "invoice";
  id: string;
  /** Human-readable linked ticket number (T-045), or empty when unlinked. */
  linkedTicketNo: string;
  customer: string;
  phone: string;
  invoiceType: string;
  category?: string;
  amount: number;
  status: InvoiceStatus;
  href: string;
};

export type SettingsResult = {
  type: "settings";
  id: string;
  label: string;
  section: string;
  description: string;
  href: string;
};

export type SearchResult = TicketResult | InvoiceResult | SettingsResult;

/* ─── Settings Data ──────────────────────────────────────────────────── */

type SettingsEntry = { label: string; section: string; description: string; href: string };

const SETTINGS_ENTRIES: SettingsEntry[] = [
  { label: "Profile", section: "Account", description: "Manage your profile information", href: "/settings/account/profile" },
  { label: "Active Sessions", section: "Account", description: "View and manage sessions", href: "/settings/account/sessions" },
  { label: "Billing", section: "Account", description: "Billing and subscription", href: "/settings/account/billing" },
  { label: "Store Information", section: "Store", description: "Store name, contact, address", href: "/settings/store" },
  { label: "Store Configuration", section: "Store", description: "Business hours, currency, format", href: "/settings/store/configuration" },
  { label: "Printing", section: "Store", description: "Store, ticket & invoice print terms, warranty, footer", href: "/settings/store/printing" },
  { label: "Expenses", section: "Store", description: "Expense categories and tracking", href: "/settings/store/expenses" },
  { label: "Currency", section: "Financial", description: "Default currency and format", href: "/settings/financial/currency" },
  { label: "Tax", section: "Financial", description: "Tax rates and configuration", href: "/settings/financial/tax" },
  { label: "Accounting", section: "Financial", description: "Accounting method and settings", href: "/settings/financial/accounting" },
  { label: "Inventory Settings", section: "Inventory", description: "Stock management preferences", href: "/settings/inventory/general" },
  { label: "Price List", section: "Inventory", description: "Manage price lists and tiers", href: "/settings/inventory/price-lists" },
  { label: "Barcode", section: "Inventory", description: "Barcode format and scanning", href: "/settings/inventory/barcode" },
  { label: "Ticket Settings", section: "Tickets", description: "Ticket numbering, defaults", href: "/settings/tickets/general" },
  { label: "Quality Check", section: "Tickets", description: "Quality control checklists and inspection items", href: "/settings/tickets/qc" },
  { label: "Workflow", section: "Tickets", description: "Status workflow and transitions", href: "/settings/tickets/workflow" },
  { label: "Assigned By & To", section: "Tickets", description: "Manage assignment options", href: "/settings/tickets/assigned" },
  { label: "Device Categories", section: "Tickets", description: "Device types and categories", href: "/settings/categories" },
  { label: "Invoice Settings", section: "Invoice", description: "Invoice defaults and status colours", href: "/settings/invoice/general" },
  { label: "Invoice Numbering", section: "Invoice", description: "Retail and business series", href: "/settings/invoice/numbering" },
  { label: "Invoice Tax", section: "Invoice", description: "GST rates and default", href: "/settings/invoice/tax" },
  { label: "Invoice Payment", section: "Invoice", description: "Payment modes and default", href: "/settings/invoice/payment" },
  { label: "Manage Customers", section: "Customers", description: "Customer records and groups", href: "/settings/customers/manage" },
  { label: "Customer Groups", section: "Customers", description: "Segment customers into groups", href: "/settings/customers/groups" },
  { label: "Loyalty", section: "Customers", description: "Loyalty program and rewards", href: "/settings/customers/loyalty" },
  { label: "API", section: "Integrations", description: "API keys and webhooks", href: "/settings/integrations/api" },
  { label: "Email Integration", section: "Integrations", description: "Email service provider", href: "/settings/integrations/email" },
  { label: "SMS Integration", section: "Integrations", description: "SMS gateway configuration", href: "/settings/integrations/sms" },
  { label: "WhatsApp", section: "Integrations", description: "WhatsApp Business integration", href: "/settings/integrations/whatsapp" },
  { label: "Google", section: "Integrations", description: "Google services integration", href: "/settings/integrations/google" },
  { label: "Email Notifications", section: "Notifications", description: "Email notification rules", href: "/settings/notifications/email" },
  { label: "SMS Notifications", section: "Notifications", description: "SMS notification rules", href: "/settings/notifications/sms" },
  { label: "Push Notifications", section: "Notifications", description: "Push notification settings", href: "/settings/notifications/push" },
  { label: "Language", section: "System", description: "Interface language preference", href: "/settings/system/language" },
  { label: "Time Zone", section: "System", description: "Time zone configuration", href: "/settings/system/timezone" },
  { label: "Backup", section: "System", description: "Data backup and restore", href: "/settings/system/backup" },
  { label: "Preferences", section: "System", description: "General system preferences", href: "/settings/system/preferences" },
  { label: "Module Access", section: "System", description: "Module visibility settings", href: "/settings/module-access" },
  { label: "Branches", section: "System", description: "Branch/location management", href: "/settings/branches" },
  { label: "Dashboard", section: "System", description: "Dashboard layout and widgets", href: "/settings/dashboard" },
  { label: "Roles & Permissions", section: "Roles & Permissions", description: "Manage roles, permissions and users", href: "/settings/roles-permissions" },
  { label: "Add User", section: "Roles & Permissions", description: "Create a staff member and login", href: "/settings/roles-permissions/add-user" },
];

/* ─── Search Providers ───────────────────────────────────────────────── */

function searchTickets(tickets: Ticket[], query: string): TicketResult[] {
  const q = query.toLowerCase();
  const results: TicketResult[] = [];

  for (const t of tickets) {
    // Build a searchable string from all relevant fields
    const imei = t.items?.map((i) => i.serial || "").join(" ") || "";
    const deviceInfo = t.devices?.map((d) => `${d.brand} ${d.model} ${d.imei} ${d.issue}`).join(" ") || "";
    const searchable = `${t.ticketNo || ""} ${t.id} ${t.customer} ${t.phone} ${t.device} ${t.model} ${t.issue} ${imei} ${deviceInfo} ${t.status} ${t.service || ""}`.toLowerCase();

    if (searchable.includes(q)) {
      results.push({
        type: "ticket",
        id: t.id,
        displayId: t.ticketNo ?? t.id,
        customer: t.customer,
        phone: t.phone,
        device: t.device,
        model: t.model,
        issue: t.issue,
        status: t.status,
        amount: t.amount,
        dueDate: t.dueDate,
        imei: t.items?.[0]?.serial || t.devices?.[0]?.imei || undefined,
        href: `/tickets/${t.id}`,
      });
    }
    if (results.length >= 20) break;
  }

  return results;
}

function searchInvoices(invoices: Invoice[], query: string, tickets: Ticket[]): InvoiceResult[] {
  const q = query.toLowerCase();
  const results: InvoiceResult[] = [];
  // Resolve an invoice's linked ticket (stored as the ticket's primary key) to
  // its human-readable number (T-045) for search + display.
  const ticketNoById = new Map<string, string>();
  for (const t of tickets) ticketNoById.set(t.id, t.ticketNo ?? t.id);

  for (const inv of invoices) {
    const linkedTicketNo = inv.ticketId ? (ticketNoById.get(inv.ticketId) ?? inv.ticketId) : "";
    const searchable = `${inv.id} ${linkedTicketNo} ${inv.customer} ${inv.phone} ${inv.invoiceType} ${inv.serviceCategory || ""} ${inv.status} ${inv.total}`.toLowerCase();

    if (searchable.includes(q)) {
      results.push({
        type: "invoice",
        id: inv.id,
        linkedTicketNo,
        customer: inv.customer,
        phone: inv.phone,
        invoiceType: inv.invoiceType,
        category: inv.serviceCategory,
        amount: inv.total,
        status: inv.status,
        href: `/invoice/${inv.id}`,
      });
    }
    if (results.length >= 20) break;
  }

  return results;
}

function searchSettings(query: string): SettingsResult[] {
  const q = query.toLowerCase();
  const results: SettingsResult[] = [];

  for (const entry of SETTINGS_ENTRIES) {
    const searchable = `${entry.label} ${entry.section} ${entry.description}`.toLowerCase();
    if (searchable.includes(q)) {
      results.push({
        type: "settings",
        id: entry.href,
        label: entry.label,
        section: entry.section,
        description: entry.description,
        href: entry.href,
      });
    }
    if (results.length >= 15) break;
  }

  return results;
}

/* ─── Hook ───────────────────────────────────────────────────────────── */

export function useUniversalSearch() {
  const { tickets, invoices } = useStore();
  const [scope, setScope] = useState<SearchScope>("tickets");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Debounce the query (250ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setDebouncedQuery("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setIsLoading(false);
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const results: SearchResult[] = useMemo(() => {
    if (!debouncedQuery) return [];

    switch (scope) {
      case "tickets":
        return searchTickets(tickets, debouncedQuery);
      case "invoices":
        return searchInvoices(invoices, debouncedQuery, tickets);
      case "settings":
        return searchSettings(debouncedQuery);
      default:
        return [];
    }
  }, [scope, debouncedQuery, tickets, invoices]);

  const resetSearch = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  return {
    scope,
    setScope,
    query,
    setQuery,
    results,
    isLoading,
    resetSearch,
  };
}
