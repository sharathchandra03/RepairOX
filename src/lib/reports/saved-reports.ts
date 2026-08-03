"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reporting · Saved custom reports
   ──────────────────────────────────────────────────────────────────────────
   Persists user-built report configurations (from the Custom Report Builder).
   Uses the same lightweight useSyncExternalStore singleton pattern as the rest
   of the app. Persisted to localStorage so a user's report library survives
   refreshes. (Ready to be promoted to a `saved_reports` DB table later without
   changing the consuming UI.)
   ────────────────────────────────────────────────────────────────────────── */

import { useSyncExternalStore } from "react";
import type { CustomReportConfig } from "./types";

const STORAGE_KEY = "repairox-saved-reports";

let reports: CustomReportConfig[] = [];
let hydrated = false;
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  for (const l of listeners) l();
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch {
    /* storage full */
  }
}

function ensureHydrated() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) reports = JSON.parse(raw) as CustomReportConfig[];
  } catch {
    reports = [];
  }
}

function genId(): string {
  return `RPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

export function saveReport(config: Omit<CustomReportConfig, "id" | "createdAt" | "updatedAt"> & { id?: string }): CustomReportConfig {
  ensureHydrated();
  const now = new Date().toISOString();
  if (config.id) {
    const existing = reports.find((r) => r.id === config.id);
    if (existing) {
      const updated: CustomReportConfig = { ...existing, ...config, id: existing.id, updatedAt: now };
      reports = reports.map((r) => (r.id === existing.id ? updated : r));
      persist();
      emit();
      return updated;
    }
  }
  const created: CustomReportConfig = {
    ...config,
    id: config.id ?? genId(),
    createdAt: now,
    updatedAt: now,
  };
  reports = [created, ...reports];
  persist();
  emit();
  return created;
}

export function deleteReport(id: string) {
  ensureHydrated();
  reports = reports.filter((r) => r.id !== id);
  persist();
  emit();
}

export function toggleFavorite(id: string) {
  ensureHydrated();
  reports = reports.map((r) => (r.id === id ? { ...r, favorite: !r.favorite, updatedAt: new Date().toISOString() } : r));
  persist();
  emit();
}

export function togglePinned(id: string) {
  ensureHydrated();
  reports = reports.map((r) => (r.id === id ? { ...r, pinned: !r.pinned, updatedAt: new Date().toISOString() } : r));
  persist();
  emit();
}

export function getSavedReports(): CustomReportConfig[] {
  ensureHydrated();
  return reports;
}

let snapshot: CustomReportConfig[] = [];
let snapshotVersion = -1;

function subscribe(cb: () => void) {
  ensureHydrated();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): CustomReportConfig[] {
  ensureHydrated();
  if (snapshotVersion !== version) {
    snapshot = reports;
    snapshotVersion = version;
  }
  return snapshot;
}

export function useSavedReports(): CustomReportConfig[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => []);
}
