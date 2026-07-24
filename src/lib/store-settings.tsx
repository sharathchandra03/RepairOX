"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

/* ─── Types ──────────────────────────────────────────────────────────── */

export type StoreSettings = {
  /* Basic Information */
  logo: string; // base64 data URL or empty
  storeName: string;
  alternateName: string;

  /* Contact Information */
  phone: string;
  mobile: string;
  fax: string;
  email: string;
  website: string;

  /* Store Location */
  address: string;
  city: string;
  state: string;
  postCode: string;
  country: string;

  /* Store Details */
  registrationNumber: string; // GSTIN / UIN
  language: string;
  timeZone: string;
  timeFormat: "12h" | "24h";
  startTime: string;
  endTime: string;

  /* Email and Access */
  companyEmail: string;
  apiKey: string;
  receiveAllEmails: boolean;

  /* Configuration */
  accountingMethod: "accrual" | "cash";
  defaultCurrency: string;
  priceFormat: string;
  decimalFormat: "2" | "3" | "0";
  depositEnabled: boolean;
  depositPercentage: number;
  refundPolicy: string;
  screenTimeout: number; // minutes

  /* Print Settings */
  termsAndConditions: string;
  warrantyText: string;
  printFooter: string;
  printSlogan: string;
};

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  logo: "",
  storeName: "RepairOX Service Center",
  alternateName: "",

  phone: "+91 91089 55544",
  mobile: "+91 98765 43210",
  fax: "",
  email: "abc@gmail.com",
  website: "www.repairox.in",

  address: "2nd Floor, 100ft Road",
  city: "Bengaluru",
  state: "Karnataka",
  postCode: "560076",
  country: "India",

  registrationNumber: "29AABCU9603R1ZP",
  language: "English",
  timeZone: "Asia/Kolkata",
  timeFormat: "12h",
  startTime: "09:00",
  endTime: "20:00",

  companyEmail: "admin@repairox.in",
  apiKey: "",
  receiveAllEmails: true,

  accountingMethod: "accrual",
  defaultCurrency: "INR",
  priceFormat: "symbol_before",
  decimalFormat: "2",
  depositEnabled: false,
  depositPercentage: 30,
  refundPolicy: "Refunds are processed within 7 business days of approval.",
  screenTimeout: 15,

  termsAndConditions: `1. All repairs carry a limited warranty as specified on this document.
2. Devices not collected within 30 days of completion may be recycled or disposed.
3. We are not responsible for data loss during repair. Please backup before handing over.
4. Original parts are used unless otherwise agreed upon with the customer.
5. Payment is due upon completion unless a credit arrangement exists.`,
  warrantyText: `WARRANTY COVERAGE:
- Screen repairs: 30 days from date of service
- Battery replacement: 90 days from date of service
- Board-level repairs: 15 days from date of service
- Software/data services: No warranty

CLAIM PROCEDURE:
- Present this receipt along with the device at our service center.
- Warranty covers the specific repair performed, not pre-existing issues.
- Physical/liquid damage after repair voids the warranty.

WARRANTY IS VOID IF:
- Device shows signs of tampering by unauthorized personnel.
- Physical damage or liquid ingress occurred after the repair.
- Receipt is not presented at time of claim.`,
  printFooter: "Thank you for choosing RepairOX!",
  printSlogan: "Your device, our expertise.",
};

/* ─── Context ────────────────────────────────────────────────────────── */

interface StoreSettingsContextType {
  settings: StoreSettings;
  updateSettings: (updates: Partial<StoreSettings>) => void;
  resetSettings: () => void;
  hydrated: boolean;
}

const StoreSettingsContext = createContext<StoreSettingsContextType | null>(null);

const STORAGE_KEY = "repairox-store-settings";

function loadSettings(): StoreSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...DEFAULT_STORE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

function saveSettings(settings: StoreSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage full or unavailable
  }
}

/* ─── Provider ───────────────────────────────────────────────────────── */

export function StoreSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    const saved = loadSettings();
    if (saved) {
      setSettings(saved);
    }
    setHydrated(true);
  }, []);

  // Persist on every change (but only after hydration)
  useEffect(() => {
    if (hydrated) {
      saveSettings(settings);
    }
  }, [settings, hydrated]);

  const updateSettings = useCallback((updates: Partial<StoreSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_STORE_SETTINGS);
  }, []);

  return (
    <StoreSettingsContext.Provider value={{ settings, updateSettings, resetSettings, hydrated }}>
      {children}
    </StoreSettingsContext.Provider>
  );
}

/* ─── Hook ───────────────────────────────────────────────────────────── */

export function useStoreSettings(): StoreSettingsContextType {
  const ctx = useContext(StoreSettingsContext);
  if (!ctx) throw new Error("useStoreSettings must be used within a StoreSettingsProvider");
  return ctx;
}
