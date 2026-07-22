"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { tickets as SEED_TICKETS, todos as SEED_TODOS, ordersStatus as SEED_ORDERS, revenueMonthly as SEED_REVENUE, TEAM_SEED, invoices as SEED_INVOICES, walkIns as SEED_WALKINS, type Ticket, type TicketStatus, type TeamMember, type Invoice, type WalkIn } from "@/lib/mock-data";

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
  };

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/* ─── Hook ───────────────────────────────────────────────────────────── */

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
