"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Organization Store Settings (Supabase-first).

   When Supabase is configured, settings are loaded from the
   `organization_settings` table on mount and kept in sync via Supabase
   Realtime. Every employee in the same org sees the same values. Only admins
   may write changes.

   When Supabase is NOT configured (no env vars), falls back to localStorage
   so the app still runs as a demo/prototype.

   The public API (useStoreSettings) remains identical — consuming components
   don't need to know which mode is active.
   ────────────────────────────────────────────────────────────────────────── */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usePermissions } from "@/lib/permissions-context";

/* ─── Types ──────────────────────────────────────────────────────────── */

export type StoreSettings = {
  /* Basic Information */
  logo: string;
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
  registrationNumber: string;
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
  screenTimeout: number;

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

/* ─── DB ↔ Client field mapping ──────────────────────────────────────── */

// Maps DB snake_case columns → client camelCase fields.
function dbRowToSettings(row: Record<string, unknown>): StoreSettings {
  return {
    logo: (row.logo as string) ?? DEFAULT_STORE_SETTINGS.logo,
    storeName: (row.store_name as string) ?? DEFAULT_STORE_SETTINGS.storeName,
    alternateName: (row.alternate_name as string) ?? DEFAULT_STORE_SETTINGS.alternateName,
    phone: (row.phone as string) ?? DEFAULT_STORE_SETTINGS.phone,
    mobile: (row.mobile as string) ?? DEFAULT_STORE_SETTINGS.mobile,
    fax: (row.fax as string) ?? DEFAULT_STORE_SETTINGS.fax,
    email: (row.email as string) ?? DEFAULT_STORE_SETTINGS.email,
    website: (row.website as string) ?? DEFAULT_STORE_SETTINGS.website,
    address: (row.address as string) ?? DEFAULT_STORE_SETTINGS.address,
    city: (row.city as string) ?? DEFAULT_STORE_SETTINGS.city,
    state: (row.state as string) ?? DEFAULT_STORE_SETTINGS.state,
    postCode: (row.postal_code as string) ?? DEFAULT_STORE_SETTINGS.postCode,
    country: (row.country as string) ?? DEFAULT_STORE_SETTINGS.country,
    registrationNumber: (row.registration_number as string) ?? DEFAULT_STORE_SETTINGS.registrationNumber,
    language: (row.language as string) ?? DEFAULT_STORE_SETTINGS.language,
    timeZone: (row.timezone as string) ?? DEFAULT_STORE_SETTINGS.timeZone,
    timeFormat: (row.time_format as "12h" | "24h") ?? DEFAULT_STORE_SETTINGS.timeFormat,
    startTime: (row.start_time as string) ?? DEFAULT_STORE_SETTINGS.startTime,
    endTime: (row.end_time as string) ?? DEFAULT_STORE_SETTINGS.endTime,
    companyEmail: (row.company_email as string) ?? DEFAULT_STORE_SETTINGS.companyEmail,
    apiKey: (row.api_key as string) ?? DEFAULT_STORE_SETTINGS.apiKey,
    receiveAllEmails: (row.receive_all_emails as boolean) ?? DEFAULT_STORE_SETTINGS.receiveAllEmails,
    accountingMethod: (row.accounting_method as "accrual" | "cash") ?? DEFAULT_STORE_SETTINGS.accountingMethod,
    defaultCurrency: (row.default_currency as string) ?? DEFAULT_STORE_SETTINGS.defaultCurrency,
    priceFormat: (row.price_format as string) ?? DEFAULT_STORE_SETTINGS.priceFormat,
    decimalFormat: (row.decimal_format as "2" | "3" | "0") ?? DEFAULT_STORE_SETTINGS.decimalFormat,
    depositEnabled: (row.deposit_enabled as boolean) ?? DEFAULT_STORE_SETTINGS.depositEnabled,
    depositPercentage: Number(row.deposit_percentage ?? DEFAULT_STORE_SETTINGS.depositPercentage),
    refundPolicy: (row.refund_policy as string) ?? DEFAULT_STORE_SETTINGS.refundPolicy,
    screenTimeout: Number(row.screen_timeout ?? DEFAULT_STORE_SETTINGS.screenTimeout),
    termsAndConditions: (row.terms_and_conditions as string) ?? DEFAULT_STORE_SETTINGS.termsAndConditions,
    warrantyText: (row.warranty_text as string) ?? DEFAULT_STORE_SETTINGS.warrantyText,
    printFooter: (row.print_footer as string) ?? DEFAULT_STORE_SETTINGS.printFooter,
    printSlogan: (row.print_slogan as string) ?? DEFAULT_STORE_SETTINGS.printSlogan,
  };
}

// Maps client camelCase partial → DB snake_case columns for upsert.
function settingsToDbPayload(updates: Partial<StoreSettings>): Record<string, unknown> {
  const map: Record<string, string> = {
    logo: "logo",
    storeName: "store_name",
    alternateName: "alternate_name",
    phone: "phone",
    mobile: "mobile",
    fax: "fax",
    email: "email",
    website: "website",
    address: "address",
    city: "city",
    state: "state",
    postCode: "postal_code",
    country: "country",
    registrationNumber: "registration_number",
    language: "language",
    timeZone: "timezone",
    timeFormat: "time_format",
    startTime: "start_time",
    endTime: "end_time",
    companyEmail: "company_email",
    apiKey: "api_key",
    receiveAllEmails: "receive_all_emails",
    accountingMethod: "accounting_method",
    defaultCurrency: "default_currency",
    priceFormat: "price_format",
    decimalFormat: "decimal_format",
    depositEnabled: "deposit_enabled",
    depositPercentage: "deposit_percentage",
    refundPolicy: "refund_policy",
    screenTimeout: "screen_timeout",
    termsAndConditions: "terms_and_conditions",
    warrantyText: "warranty_text",
    printFooter: "print_footer",
    printSlogan: "print_slogan",
  };
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    const col = map[key];
    if (col) payload[col] = value;
  }
  return payload;
}

/* ─── Context ────────────────────────────────────────────────────────── */

interface StoreSettingsContextType {
  settings: StoreSettings;
  updateSettings: (updates: Partial<StoreSettings>) => void;
  resetSettings: () => void;
  hydrated: boolean;
}

const StoreSettingsContext = createContext<StoreSettingsContextType | null>(null);

const STORAGE_KEY = "repairox-store-settings";

/* ─── localStorage fallback helpers (used only when Supabase is off) ── */

function loadSettingsLocal(): StoreSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...DEFAULT_STORE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

function saveSettingsLocal(settings: StoreSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* storage full or unavailable */ }
}

/* ─── Provider ───────────────────────────────────────────────────────── */

export function StoreSettingsProvider({ children }: { children: ReactNode }) {
  const { isDemoMode, authReady } = usePermissions();
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const orgIdRef = useRef<string | null>(null);

  // ── Load settings based on mode (waits for auth to be ready) ──
  useEffect(() => {
    if (!authReady) return;

    // Demo mode: always use clean defaults — never load from DB.
    if (isDemoMode) {
      setSettings({ ...DEFAULT_STORE_SETTINGS, storeName: "RepairOX Demo Store", email: "demo@repairox.in" });
      setHydrated(true);
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      // Local fallback
      const saved = loadSettingsLocal();
      if (saved) setSettings(saved);
      setHydrated(true);
      return;
    }

    let active = true;

    (async () => {
      // Get current user's organization id via their staff record
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user) {
        // Not signed in yet — use defaults until auth fires
        if (active) setHydrated(true);
        return;
      }

      const { data: staffRow } = await supabase
        .from("staff")
        .select("organization_id")
        .eq("auth_user_id", sessionData.session.user.id)
        .maybeSingle();

      const orgId = staffRow?.organization_id as string | null;
      orgIdRef.current = orgId;

      if (!orgId) {
        if (active) setHydrated(true);
        return;
      }

      // Load the settings row for this org
      const { data: row } = await supabase
        .from("organization_settings")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();

      if (row && active) {
        setSettings(dbRowToSettings(row));
      }
      if (active) setHydrated(true);
    })();

    // Listen to auth state changes (login/logout)
    const { data: authSub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setSettings(DEFAULT_STORE_SETTINGS);
        orgIdRef.current = null;
        return;
      }
      const { data: staffRow } = await supabase!
        .from("staff")
        .select("organization_id")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      const orgId = staffRow?.organization_id as string | null;
      orgIdRef.current = orgId;
      if (!orgId) return;

      const { data: row } = await supabase!
        .from("organization_settings")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();

      if (row) setSettings(dbRowToSettings(row));
    });

    return () => {
      active = false;
      authSub.subscription.unsubscribe();
    };
  }, [authReady, isDemoMode]);

  // ── Supabase Realtime subscription for organization_settings ──
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || isDemoMode) return;

    const channel = supabase
      .channel("org-settings-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "organization_settings" },
        (payload) => {
          const row = payload.new as Record<string, unknown> | undefined;
          if (!row) return;
          // Only apply if it's our org
          if (orgIdRef.current && row.organization_id === orgIdRef.current) {
            setSettings(dbRowToSettings(row));
          }
        }
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
  }, [isDemoMode]);

  // ── localStorage persistence (only when Supabase is NOT configured) ──
  useEffect(() => {
    if ((isSupabaseConfigured && !isDemoMode) || !hydrated) return;
    saveSettingsLocal(settings);
  }, [settings, hydrated, isDemoMode]);

  // ── Update handler ──
  const updateSettings = useCallback((updates: Partial<StoreSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };

      if (isSupabaseConfigured && supabase && orgIdRef.current && !isDemoMode) {
        // Write to DB. Uses the authenticated user's session (RLS-enforced:
        // only admins can write to organization_settings).
        const dbPayload = settingsToDbPayload(updates);
        supabase
          .from("organization_settings")
          .upsert(
            { organization_id: orgIdRef.current, ...dbPayload },
            { onConflict: "organization_id" }
          )
          .then(({ error }) => {
            if (error) {
              console.error("[StoreSettings] DB write failed:", error.message);
            }
          });
      }

      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_STORE_SETTINGS);
    if (isSupabaseConfigured && supabase && orgIdRef.current && !isDemoMode) {
      const dbPayload = settingsToDbPayload(DEFAULT_STORE_SETTINGS);
      supabase
        .from("organization_settings")
        .upsert(
          { organization_id: orgIdRef.current, ...dbPayload },
          { onConflict: "organization_id" }
        )
        .then(({ error }) => {
          if (error) console.error("[StoreSettings] DB reset failed:", error.message);
        });
    }
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
