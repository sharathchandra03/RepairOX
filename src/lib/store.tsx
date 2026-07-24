"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { tickets as SEED_TICKETS, todos as SEED_TODOS, ordersStatus as SEED_ORDERS, revenueMonthly as SEED_REVENUE, TEAM_SEED, invoices as SEED_INVOICES, walkIns as SEED_WALKINS, type Ticket, type TicketStatus, type TicketPart, type TeamMember, type Invoice, type WalkIn } from "@/lib/mock-data";
import { inventoryItems as SEED_INVENTORY, stockMovements as SEED_MOVEMENTS, type InventoryItem, type StockMovement } from "@/lib/inventory-data";
import { seedCustomers as SEED_CUSTOMERS, type Customer } from "@/lib/customer-data";
import { seedBrands as SEED_BRANDS, seedModels as SEED_MODELS, type Brand, type DeviceModel } from "@/lib/brand-model-data";

/* ─── Types ──────────────────────────────────────────────────────────── */

export type Todo = { id: number; title: string; desc: string; flag: "info" | "danger" | "warn" };
export type OrderStatus = { detail: string; assigned: number; received: number };
export type RevenueMonth = { m: string; v: number };

interface StoreState {
  tickets: Ticket[];
  invoices: Invoice[];
  walkIns: WalkIn[];
  todos: Todo[];
  orders: OrderStatus[];
  revenue: RevenueMonth[];
  team: TeamMember[];
  inventory: InventoryItem[];
  stockMovements: StockMovement[];
  customers: Customer[];
  brands: Brand[];
  deviceModels: DeviceModel[];
}

interface StoreActions {
  addTicket: (ticket: Ticket) => void;
  updateTicket: (id: string, updates: Partial<Ticket>) => void;
  deleteTicket: (id: string) => void;
  bulkUpdateStatus: (ids: string[], status: TicketStatus) => void;
  addInvoice: (invoice: Invoice) => void;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => void;
  addWalkIn: (walkIn: WalkIn) => void;
  updateWalkIn: (id: string, updates: Partial<WalkIn>) => void;
  deleteWalkIn: (id: string) => void;
  addTodo: (todo: Todo) => void;
  removeTodo: (id: number) => void;
  updateTeamMember: (email: string, updates: Partial<TeamMember>) => void;
  deductPartsForTicket: (ticketId: string) => void;
  addStockMovement: (movement: StockMovement) => void;
  addInventoryItem: (item: InventoryItem) => void;
  updateInventoryItem: (id: string, updates: Partial<InventoryItem>) => void;
  addCustomer: (customer: Customer) => void;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  addBrand: (brand: Brand) => void;
  addDeviceModel: (model: DeviceModel) => void;
  deleteBrand: (id: string) => void;
  deleteDeviceModel: (id: string) => void;
  resetBrandsAndModels: () => void;
}

type Store = StoreState & StoreActions;

/* ─── Context ────────────────────────────────────────────────────────── */

const StoreContext = createContext<Store | null>(null);

const STORAGE_KEY = "repairox-store";

function loadFromStorage(): StoreState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoreState;
  } catch {
    return null;
  }
}

function saveToStorage(state: StoreState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable
  }
}

/* ─── Provider ───────────────────────────────────────────────────────── */

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(() => {
    const saved = loadFromStorage();
    if (saved) {
      // Ensure newer fields have defaults if missing from older localStorage data
      return {
        ...saved,
        invoices: (saved.invoices ?? SEED_INVOICES).map((inv: any) => ({ ...inv, invoiceType: inv.invoiceType ?? "retail" })),
        walkIns: saved.walkIns ?? SEED_WALKINS,
        inventory: (saved.inventory ?? SEED_INVENTORY).map((i: any) => ({ ...i, reservedStock: i.reservedStock ?? 0 })),
        stockMovements: saved.stockMovements ?? SEED_MOVEMENTS,
        customers: saved.customers ?? SEED_CUSTOMERS,
        brands: saved.brands ?? SEED_BRANDS,
        deviceModels: saved.deviceModels ?? SEED_MODELS,
      };
    }
    return {
      tickets: SEED_TICKETS,
      invoices: SEED_INVOICES,
      walkIns: SEED_WALKINS,
      todos: SEED_TODOS,
      orders: SEED_ORDERS,
      revenue: SEED_REVENUE,
      team: TEAM_SEED,
      inventory: SEED_INVENTORY,
      stockMovements: SEED_MOVEMENTS,
      customers: SEED_CUSTOMERS,
      brands: SEED_BRANDS,
      deviceModels: SEED_MODELS,
    };
  });

  // Persist on every change
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  /* ── Ticket actions ── */
  const addTicket = useCallback((ticket: Ticket) => {
    setState((s) => ({ ...s, tickets: [ticket, ...s.tickets] }));
  }, []);

  const updateTicket = useCallback((id: string, updates: Partial<Ticket>) => {
    setState((s) => ({
      ...s,
      tickets: s.tickets.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  }, []);

  const deleteTicket = useCallback((id: string) => {
    setState((s) => ({ ...s, tickets: s.tickets.filter((t) => t.id !== id) }));
  }, []);

  const bulkUpdateStatus = useCallback((ids: string[], status: TicketStatus) => {
    setState((s) => ({
      ...s,
      tickets: s.tickets.map((t) => (ids.includes(t.id) ? { ...t, status } : t)),
    }));
  }, []);

  /* ── Invoice actions ── */
  const addInvoice = useCallback((invoice: Invoice) => {
    setState((s) => ({ ...s, invoices: [invoice, ...s.invoices] }));
  }, []);

  const updateInvoice = useCallback((id: string, updates: Partial<Invoice>) => {
    setState((s) => ({
      ...s,
      invoices: s.invoices.map((inv) => (inv.id === id ? { ...inv, ...updates } : inv)),
    }));
  }, []);

  const deleteInvoice = useCallback((id: string) => {
    setState((s) => ({ ...s, invoices: s.invoices.filter((inv) => inv.id !== id) }));
  }, []);

  /* ── Walk-In actions ── */
  const addWalkIn = useCallback((walkIn: WalkIn) => {
    setState((s) => ({ ...s, walkIns: [walkIn, ...s.walkIns] }));
  }, []);

  const updateWalkIn = useCallback((id: string, updates: Partial<WalkIn>) => {
    setState((s) => ({ ...s, walkIns: s.walkIns.map((w) => (w.id === id ? { ...w, ...updates } : w)) }));
  }, []);

  const deleteWalkIn = useCallback((id: string) => {
    setState((s) => ({ ...s, walkIns: s.walkIns.filter((w) => w.id !== id) }));
  }, []);

  /* ── Todo actions ── */
  const addTodo = useCallback((todo: Todo) => {
    setState((s) => ({ ...s, todos: [...s.todos, todo] }));
  }, []);

  const removeTodo = useCallback((id: number) => {
    setState((s) => ({ ...s, todos: s.todos.filter((t) => t.id !== id) }));
  }, []);

  /* ── Team actions ── */
  const updateTeamMember = useCallback((email: string, updates: Partial<TeamMember>) => {
    setState((s) => ({
      ...s,
      team: s.team.map((m) => (m.email === email ? { ...m, ...updates } : m)),
    }));
  }, []);

  /* ── Inventory actions ── */
  const deductPartsForTicket = useCallback((ticketId: string) => {
    setState((s) => {
      const ticket = s.tickets.find((t) => t.id === ticketId);
      if (!ticket || !ticket.parts || ticket.parts.length === 0) return s;

      // Only deduct parts that are still "planned"
      const partsToDeduct = ticket.parts.filter((p) => p.status === "planned");
      if (partsToDeduct.length === 0) return s;

      // Deduct from inventory
      const updatedInventory = s.inventory.map((item) => {
        const part = partsToDeduct.find((p) => p.inventoryId === item.id);
        if (!part) return item;
        return { ...item, currentStock: item.currentStock - part.qty };
      });

      // Mark parts as used
      const updatedTickets = s.tickets.map((t) => {
        if (t.id !== ticketId) return t;
        return { ...t, parts: t.parts?.map((p) => ({ ...p, status: "used" as const })) };
      });

      // Create stock movements
      const newMovements: StockMovement[] = partsToDeduct.map((part, i) => ({
        docNumber: `MOV-TC-${Date.now()}-${i}`,
        fromStore: "Main Store",
        toStore: `Ticket ${ticketId}`,
        items: part.qty,
        date: new Date().toLocaleDateString("en-IN"),
        user: ticket.technician,
        type: "Outward" as const,
        status: "completed" as const,
      }));

      return {
        ...s,
        tickets: updatedTickets,
        inventory: updatedInventory,
        stockMovements: [...newMovements, ...s.stockMovements],
      };
    });
  }, []);

  const addStockMovement = useCallback((movement: StockMovement) => {
    setState((s) => ({ ...s, stockMovements: [movement, ...s.stockMovements] }));
  }, []);

  /* ── Inventory item actions ── */
  const addInventoryItem = useCallback((item: InventoryItem) => {
    setState((s) => ({ ...s, inventory: [item, ...s.inventory] }));
  }, []);

  const updateInventoryItem = useCallback((id: string, updates: Partial<InventoryItem>) => {
    setState((s) => ({
      ...s,
      inventory: s.inventory.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }));
  }, []);

  /* ── Customer actions ── */
  const addCustomer = useCallback((customer: Customer) => {
    setState((s) => ({ ...s, customers: [customer, ...s.customers] }));
  }, []);

  const updateCustomer = useCallback((id: string, updates: Partial<Customer>) => {
    setState((s) => ({
      ...s,
      customers: s.customers.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c)),
    }));
  }, []);

  const deleteCustomer = useCallback((id: string) => {
    setState((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== id) }));
  }, []);

  /* ── Brand & Model actions ── */
  const addBrand = useCallback((brand: Brand) => {
    setState((s) => ({ ...s, brands: [...s.brands, brand] }));
  }, []);

  const addDeviceModel = useCallback((model: DeviceModel) => {
    setState((s) => ({ ...s, deviceModels: [...s.deviceModels, model] }));
  }, []);

  const deleteBrand = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      brands: s.brands.filter((b) => b.id !== id),
      deviceModels: s.deviceModels.filter((m) => m.brandId !== id), // cascade delete models
    }));
  }, []);

  const deleteDeviceModel = useCallback((id: string) => {
    setState((s) => ({ ...s, deviceModels: s.deviceModels.filter((m) => m.id !== id) }));
  }, []);

  const resetBrandsAndModels = useCallback(() => {
    setState((s) => ({ ...s, brands: SEED_BRANDS, deviceModels: SEED_MODELS }));
  }, []);

  const store: Store = {
    ...state,
    addTicket,
    updateTicket,
    deleteTicket,
    bulkUpdateStatus,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    addWalkIn,
    updateWalkIn,
    deleteWalkIn,
    addTodo,
    removeTodo,
    updateTeamMember,
    deductPartsForTicket,
    addStockMovement,
    addInventoryItem,
    updateInventoryItem,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addBrand,
    addDeviceModel,
    deleteBrand,
    deleteDeviceModel,
    resetBrandsAndModels,
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/* ─── Hook ───────────────────────────────────────────────────────────── */

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
