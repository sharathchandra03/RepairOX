"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { logActivity, buildChanges, type ActivitySeverity } from "./activity-log";
import { tickets as SEED_TICKETS, todos as SEED_TODOS, ordersStatus as SEED_ORDERS, revenueMonthly as SEED_REVENUE, TEAM_SEED, invoices as SEED_INVOICES, walkIns as SEED_WALKINS, STATUS_LABEL, type Ticket, type TicketStatus, type TicketPart, type TeamMember, type Invoice, type WalkIn } from "@/lib/mock-data";
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

  // Always-current snapshot so action callbacks can read prior values
  // (for delete-capture and before/after diffs) without stale closures.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;

  /* ── Ticket actions ── */
  const addTicket = useCallback((ticket: Ticket) => {
    setState((s) => ({ ...s, tickets: [ticket, ...s.tickets] }));
    logActivity({
      module: "Ticket", action: "Ticket Created", severity: "success",
      entity: "Ticket", reference: ticket.id,
      description: `Created a new repair ticket for ${ticket.model || ticket.device} (${ticket.customer}).`,
      meta: { Device: ticket.device, Technician: ticket.technician || "Unassigned", Amount: inr(ticket.amount) },
    });
  }, []);

  const updateTicket = useCallback((id: string, updates: Partial<Ticket>) => {
    const prev = stateRef.current.tickets.find((t) => t.id === id);
    setState((s) => ({
      ...s,
      tickets: s.tickets.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
    const statusFmt = (v: unknown) => STATUS_LABEL[v as TicketStatus] ?? String(v ?? "—");
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "status", label: "Status", format: statusFmt },
      { key: "technician", label: "Technician" },
      { key: "priority", label: "Priority" },
      { key: "model", label: "Model" },
      { key: "device", label: "Device" },
      { key: "customer", label: "Customer" },
      { key: "qcStatus", label: "QC Status" },
      { key: "amount", label: "Amount", format: inr },
    ]);
    let action = "Ticket Updated";
    let severity: ActivitySeverity = "info";
    if ("status" in updates && updates.status !== prev?.status) {
      action = "Status Changed";
      if (updates.status === "completed" || updates.status === "delivered") severity = "success";
    } else if ("technician" in updates && updates.technician !== prev?.technician) {
      action = "Technician Changed";
    } else if ("priority" in updates && updates.priority !== prev?.priority) {
      action = "Priority Changed"; severity = "warning";
    }
    logActivity({
      module: "Ticket", action, severity, entity: "Ticket", reference: id,
      description: `Updated ticket ${id}${prev ? ` (${prev.customer})` : ""}.`,
      changes,
    });
  }, []);

  const deleteTicket = useCallback((id: string) => {
    const prev = stateRef.current.tickets.find((t) => t.id === id);
    setState((s) => ({ ...s, tickets: s.tickets.filter((t) => t.id !== id) }));
    logActivity({
      module: "Ticket", action: "Ticket Deleted", severity: "critical",
      entity: "Ticket", reference: id,
      description: prev ? `Deleted ticket for ${prev.model || prev.device} (${prev.customer}).` : `Deleted ticket ${id}.`,
      meta: prev ? { Status: STATUS_LABEL[prev.status] ?? prev.status, Amount: inr(prev.amount) } : undefined,
    });
  }, []);

  const bulkUpdateStatus = useCallback((ids: string[], status: TicketStatus) => {
    setState((s) => ({
      ...s,
      tickets: s.tickets.map((t) => (ids.includes(t.id) ? { ...t, status } : t)),
    }));
    const label = STATUS_LABEL[status] ?? status;
    logActivity({
      module: "Ticket", action: "Status Changed", severity: "info", entity: "Ticket",
      reference: ids.length === 1 ? ids[0] : `${ids.length} tickets`,
      description: `Bulk updated ${ids.length} ticket${ids.length !== 1 ? "s" : ""} to ${label}.`,
      changes: [{ field: "Status", to: label }],
    });
  }, []);

  /* ── Invoice actions ── */
  const addInvoice = useCallback((invoice: Invoice) => {
    setState((s) => ({ ...s, invoices: [invoice, ...s.invoices] }));
    logActivity({
      module: "Invoice", action: "Invoice Created", severity: "success",
      entity: "Invoice", reference: invoice.reference || invoice.id,
      description: `Generated invoice for ${invoice.customer}.`,
      meta: { Total: inr(invoice.total), ...(invoice.ticketId ? { "From Ticket": invoice.ticketId } : {}) },
    });
  }, []);

  const updateInvoice = useCallback((id: string, updates: Partial<Invoice>) => {
    const prev = stateRef.current.invoices.find((inv) => inv.id === id);
    setState((s) => ({
      ...s,
      invoices: s.invoices.map((inv) => (inv.id === id ? { ...inv, ...updates } : inv)),
    }));
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "status", label: "Status" },
      { key: "paidAmount", label: "Paid", format: inr },
      { key: "total", label: "Total", format: inr },
    ]);
    let action = "Invoice Updated";
    let severity: ActivitySeverity = "info";
    if (("paidAmount" in updates && (updates.paidAmount ?? 0) > (prev?.paidAmount ?? 0)) || updates.status === "paid") {
      action = "Payment Added"; severity = "success";
    } else if (updates.status === "cancelled") {
      action = "Cancelled"; severity = "critical";
    }
    logActivity({
      module: "Invoice", action, severity, entity: "Invoice", reference: prev?.reference || id,
      description: `Updated invoice ${prev?.reference || id} (${prev?.customer ?? ""}).`,
      changes,
    });
  }, []);

  const deleteInvoice = useCallback((id: string) => {
    const prev = stateRef.current.invoices.find((inv) => inv.id === id);
    setState((s) => ({ ...s, invoices: s.invoices.filter((inv) => inv.id !== id) }));
    logActivity({
      module: "Invoice", action: "Invoice Deleted", severity: "critical",
      entity: "Invoice", reference: prev?.reference || id,
      description: prev ? `Deleted invoice ${prev.reference} for ${prev.customer}.` : `Deleted invoice ${id}.`,
      meta: prev ? { Total: inr(prev.total) } : undefined,
    });
  }, []);

  /* ── Walk-In actions ── */
  const addWalkIn = useCallback((walkIn: WalkIn) => {
    setState((s) => ({ ...s, walkIns: [walkIn, ...s.walkIns] }));
    logActivity({
      module: "Walk-In", action: "Walk-In Created", severity: "success",
      entity: "Walk-In", reference: walkIn.id,
      description: `Logged a walk-in for ${walkIn.customer} (${walkIn.model}).`,
      meta: { Source: walkIn.source, Category: walkIn.category },
    });
  }, []);

  const updateWalkIn = useCallback((id: string, updates: Partial<WalkIn>) => {
    const prev = stateRef.current.walkIns.find((w) => w.id === id);
    setState((s) => ({ ...s, walkIns: s.walkIns.map((w) => (w.id === id ? { ...w, ...updates } : w)) }));
    const converted = "status" in updates && (updates.status === "converted_ticket" || updates.status === "converted_invoice") && updates.status !== prev?.status;
    logActivity({
      module: "Walk-In",
      action: converted ? "Walk-In Converted" : "Walk-In Updated",
      severity: "info", entity: "Walk-In", reference: id,
      description: converted
        ? `Converted walk-in ${id}${updates.ticketId ? ` to ticket ${updates.ticketId}` : ""}.`
        : `Updated walk-in ${id}${prev ? ` (${prev.customer})` : ""}.`,
      ...(updates.ticketId ? { meta: { "New Ticket": updates.ticketId } } : {}),
    });
  }, []);

  const deleteWalkIn = useCallback((id: string) => {
    const prev = stateRef.current.walkIns.find((w) => w.id === id);
    setState((s) => ({ ...s, walkIns: s.walkIns.filter((w) => w.id !== id) }));
    logActivity({
      module: "Walk-In", action: "Walk-In Deleted", severity: "critical",
      entity: "Walk-In", reference: id,
      description: prev ? `Deleted walk-in for ${prev.customer} (${prev.model}).` : `Deleted walk-in ${id}.`,
    });
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
    const preTicket = stateRef.current.tickets.find((t) => t.id === ticketId);
    setState((s) => {
      const ticket = s.tickets.find((t) => t.id === ticketId);
      if (!ticket) return s;

      // Gather all planned parts — from devices[] if present, else from flat parts
      let partsToDeduct: TicketPart[] = [];
      if (ticket.devices && ticket.devices.length > 0) {
        partsToDeduct = ticket.devices.flatMap((d) => d.parts.filter((p) => p.status === "planned"));
      } else if (ticket.parts && ticket.parts.length > 0) {
        partsToDeduct = ticket.parts.filter((p) => p.status === "planned");
      }
      if (partsToDeduct.length === 0) return s;

      // Deduct from inventory
      const updatedInventory = s.inventory.map((item) => {
        const matchingParts = partsToDeduct.filter((p) => p.inventoryId === item.id);
        if (matchingParts.length === 0) return item;
        const totalQty = matchingParts.reduce((sum, p) => sum + p.qty, 0);
        return { ...item, currentStock: item.currentStock - totalQty };
      });

      // Mark parts as used — both in flat parts and in devices[]
      const updatedTickets = s.tickets.map((t) => {
        if (t.id !== ticketId) return t;
        const updatedDevices = t.devices?.map((d) => ({
          ...d,
          parts: d.parts.map((p) => ({ ...p, status: "used" as const })),
        }));
        return {
          ...t,
          parts: t.parts?.map((p) => ({ ...p, status: "used" as const })),
          devices: updatedDevices,
        };
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
    // Log the deduction (computed from the pre-update ticket snapshot)
    if (preTicket) {
      let planned: TicketPart[] = [];
      if (preTicket.devices && preTicket.devices.length > 0) planned = preTicket.devices.flatMap((d) => d.parts.filter((p) => p.status === "planned"));
      else if (preTicket.parts && preTicket.parts.length > 0) planned = preTicket.parts.filter((p) => p.status === "planned");
      const totalQty = planned.reduce((sum, p) => sum + p.qty, 0);
      if (planned.length > 0) {
        logActivity({
          module: "Inventory", action: "Stock Reduced", severity: "warning",
          entity: "Parts", reference: ticketId,
          description: `Deducted ${totalQty} part unit${totalQty !== 1 ? "s" : ""} for ticket ${ticketId}.`,
          meta: { "Parts consumed": String(planned.length), Units: String(totalQty) },
        });
      }
    }
  }, []);

  const addStockMovement = useCallback((movement: StockMovement) => {
    setState((s) => ({ ...s, stockMovements: [movement, ...s.stockMovements] }));
    const inward = movement.type === "Inward";
    logActivity({
      module: "Inventory", action: inward ? "Stock Increased" : "Stock Reduced",
      severity: inward ? "success" : "warning", entity: "Stock Movement", reference: movement.docNumber,
      description: `${movement.type} movement of ${movement.items} item${movement.items !== 1 ? "s" : ""}: ${movement.fromStore} → ${movement.toStore}.`,
    });
  }, []);

  /* ── Inventory item actions ── */
  const addInventoryItem = useCallback((item: InventoryItem) => {
    setState((s) => ({ ...s, inventory: [item, ...s.inventory] }));
    logActivity({
      module: "Inventory", action: "Item Added", severity: "success",
      entity: "Item", reference: item.id,
      description: `Added new inventory item: ${item.name}.`,
      meta: { Category: item.category, Stock: String(item.currentStock) },
    });
  }, []);

  const updateInventoryItem = useCallback((id: string, updates: Partial<InventoryItem>) => {
    const prev = stateRef.current.inventory.find((i) => i.id === id);
    setState((s) => ({
      ...s,
      inventory: s.inventory.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    }));
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "currentStock", label: "Stock" },
      { key: "name", label: "Name" },
      { key: "defaultPrice", label: "Default Price", format: inr },
      { key: "regularSellingPrice", label: "Selling Price", format: inr },
      { key: "minStock", label: "Min Stock" },
      { key: "maxStock", label: "Max Stock" },
      { key: "active", label: "Active" },
    ]);
    let action = "Item Edited";
    let severity: ActivitySeverity = "info";
    if ("currentStock" in updates && prev && updates.currentStock !== prev.currentStock) {
      const inc = (updates.currentStock ?? 0) > prev.currentStock;
      action = inc ? "Stock Increased" : "Stock Reduced";
      severity = inc ? "success" : "warning";
    }
    logActivity({
      module: "Inventory", action, severity, entity: "Item", reference: id,
      description: `Updated inventory item ${prev?.name || id}.`,
      changes,
    });
  }, []);

  /* ── Customer actions ── */
  const addCustomer = useCallback((customer: Customer) => {
    setState((s) => ({ ...s, customers: [customer, ...s.customers] }));
    logActivity({
      module: "Customer", action: "Customer Created", severity: "success",
      entity: "Customer", reference: customer.id,
      description: `Added new customer ${customer.fullName}.`,
      meta: { Mobile: customer.mobile, ...(customer.company ? { Company: customer.company } : {}) },
    });
  }, []);

  const updateCustomer = useCallback((id: string, updates: Partial<Customer>) => {
    const prev = stateRef.current.customers.find((c) => c.id === id);
    setState((s) => ({
      ...s,
      customers: s.customers.map((c) => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c)),
    }));
    const changes = buildChanges(prev as Record<string, unknown> | undefined, updates as Record<string, unknown>, [
      { key: "fullName", label: "Name" },
      { key: "mobile", label: "Mobile" },
      { key: "email", label: "Email" },
      { key: "company", label: "Company" },
      { key: "status", label: "Status" },
    ]);
    logActivity({
      module: "Customer", action: "Customer Updated", severity: "info",
      entity: "Customer", reference: id,
      description: `Updated customer ${prev?.fullName || id}.`,
      changes,
    });
  }, []);

  const deleteCustomer = useCallback((id: string) => {
    const prev = stateRef.current.customers.find((c) => c.id === id);
    setState((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== id) }));
    logActivity({
      module: "Customer", action: "Customer Deleted", severity: "critical",
      entity: "Customer", reference: id,
      description: prev ? `Deleted customer ${prev.fullName}.` : `Deleted customer ${id}.`,
      meta: prev ? { Mobile: prev.mobile } : undefined,
    });
  }, []);

  /* ── Brand & Model actions ── */
  const addBrand = useCallback((brand: Brand) => {
    setState((s) => ({ ...s, brands: [...s.brands, brand] }));
    logActivity({
      module: "Price List", action: "Brand Added", severity: "success",
      entity: "Brand", reference: brand.name,
      description: `Added device brand ${brand.name}.`,
    });
  }, []);

  const addDeviceModel = useCallback((model: DeviceModel) => {
    const brand = stateRef.current.brands.find((b) => b.id === model.brandId);
    setState((s) => ({ ...s, deviceModels: [...s.deviceModels, model] }));
    logActivity({
      module: "Price List", action: "Model Added", severity: "success",
      entity: "Device Model", reference: model.name,
      description: `Added model ${model.name}${brand ? ` under ${brand.name}` : ""}.`,
    });
  }, []);

  const deleteBrand = useCallback((id: string) => {
    const prev = stateRef.current.brands.find((b) => b.id === id);
    const modelCount = stateRef.current.deviceModels.filter((m) => m.brandId === id).length;
    setState((s) => ({
      ...s,
      brands: s.brands.filter((b) => b.id !== id),
      deviceModels: s.deviceModels.filter((m) => m.brandId !== id), // cascade delete models
    }));
    logActivity({
      module: "Price List", action: "Brand Deleted", severity: "critical",
      entity: "Brand", reference: prev?.name || id,
      description: prev ? `Deleted brand ${prev.name} and ${modelCount} associated model${modelCount !== 1 ? "s" : ""}.` : `Deleted brand ${id}.`,
    });
  }, []);

  const deleteDeviceModel = useCallback((id: string) => {
    const prev = stateRef.current.deviceModels.find((m) => m.id === id);
    setState((s) => ({ ...s, deviceModels: s.deviceModels.filter((m) => m.id !== id) }));
    logActivity({
      module: "Price List", action: "Model Deleted", severity: "critical",
      entity: "Device Model", reference: prev?.name || id,
      description: prev ? `Deleted device model ${prev.name}.` : `Deleted model ${id}.`,
    });
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
