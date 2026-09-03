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

/** Per-series invoice numbering config (Retail and Business are independent). */
export type InvoiceNumberingConfig = {
  prefix: string;
  /** The number a fresh sequence starts from when no invoices exist yet. */
  startNumber: number;
  /** Zero-padding width for the numeric portion. */
  digits: number;
};

/**
 * A user-defined print template for future document types (quotation, estimate,
 * delivery note, gate pass, etc.). Each template can either INHERIT the store
 * master default terms/warranty/footer/slogan, or override any of them with its
 * own text. Blank override fields fall back to the master default at print time
 * (see resolveCustomTemplate in print-utils).
 *
 * Ticket and Invoice remain first-class, independent scopes and are NOT part of
 * this list — this is purely the extensible mechanism for NEW document types.
 */
export type CustomPrintTemplate = {
  /** Stable id (used as the key when a document type is wired to a template). */
  id: string;
  /** Human-readable name shown in Settings and pickers (e.g. "Quotation"). */
  name: string;
  /** Optional machine key a future document type can match on (e.g. "quotation"). */
  slug: string;
  /** When true, blank fields below inherit the store master default. */
  inheritFromStore: boolean;
  /** Override text — blank means "use master default" when inheritFromStore. */
  terms: string;
  warrantyText: string;
  footer: string;
  slogan: string;
};

/** Invoice defaults applied to NEW invoices only. Never rewrites history. */
export type InvoiceDefaults = {
  invoiceType: "retail" | "business";
  serviceCategory: "service" | "accessories";
  status: string;
  /** Empty string means "no default — prompt the user". */
  paymentMode: string;
  /** Days added to the created date to compute the default due date. */
  dueDateDays: number;
  /** Default total GST rate (%) pre-selected on new invoices. */
  gstRate: number;
};

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
  /** HSN/SAC code shown on GST/tax documents. Optional — only printed when set. */
  hsnCode: string;
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

  /* Print Settings — STORE-level defaults.
   * NOTE: As of the Terms & Notes separation, these are NO LONGER the source of
   * truth for Ticket or Invoice documents. Tickets read `ticket*` fields and
   * invoices read their own persisted terms + `invoiceWarrantyText`. These
   * store fields remain for genuine store-level printing surfaces. */
  termsAndConditions: string;
  warrantyText: string;
  printFooter: string;
  printSlogan: string;

  /* ── Custom print templates (extensible master-default consumers) ──
   * User-defined templates for future document types. Each inherits from the
   * store master default (the fields above) unless it overrides a field.
   * Tickets & invoices are NOT here — they have their own independent scopes. */
  customPrintTemplates: CustomPrintTemplate[];

  /* ── Ticket Terms & Notes (Settings → Tickets → Terms & Notes) ──
   * Independent, ticket-scoped source of truth for Ticket documents.
   * Seeded from the store print defaults on first migration so existing
   * ticket print output is preserved, then owned by Ticket Settings. */
  ticketTerms: string;
  ticketWarrantyText: string;
  ticketFooter: string;

  /* Ticket Status Colors — configurable from Settings → Tickets */
  statusColors: Record<string, string>;

  /* Default status applied to NEW tickets (Settings → Tickets → Workflow).
   * Affects future tickets only; existing tickets are never rewritten. */
  ticketDefaultStatus: string;
  /* Default resolution time (minutes) for new tickets when none is entered.
   * Historically hardcoded to 59. */
  ticketDefaultResolutionMinutes: number;

  /* ── Invoice configuration (single source of truth for Settings → Invoice) ── */

  /** Invoice status pill colours (hex), keyed by InvoiceStatus. */
  invoiceStatusColors: Record<string, string>;
  /** Independent Retail & Business numbering series. */
  invoiceNumbering: {
    retail: InvoiceNumberingConfig;
    business: InvoiceNumberingConfig;
  };
  /** Defaults applied to newly-created invoices (never touches existing ones). */
  invoiceDefaults: InvoiceDefaults;
  /** Selectable GST rate presets (%) offered in the invoice pricing step. */
  invoiceGstRates: number[];
  /** Ordered list of selectable payment modes. */
  invoicePaymentModes: string[];
  /** Default Terms & Conditions text seeded onto new invoices. */
  invoiceTerms: string;
  /** Default footer text seeded onto new invoices. */
  invoiceFooter: string;
  /** Default slogan text seeded onto new invoices. */
  invoiceSlogan: string;
  /** Invoice warranty block text — independent of Store Information.
   *  Shown on invoice A4/thermal prints. */
  invoiceWarrantyText: string;
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
  hsnCode: "",
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

  /* No custom templates by default — added on demand from Store → Printing. */
  customPrintTemplates: [],

  /* Ticket Terms & Notes defaults — mirror the store print defaults so that,
   * for a fresh install, ticket documents look identical to the previous
   * store-inherited behaviour. From here on these are ticket-owned. */
  ticketTerms: `1. All repairs carry a limited warranty as specified on this document.
2. Devices not collected within 30 days of completion may be recycled or disposed.
3. We are not responsible for data loss during repair. Please backup before handing over.
4. Original parts are used unless otherwise agreed upon with the customer.
5. Payment is due upon completion unless a credit arrangement exists.`,
  ticketWarrantyText: `WARRANTY COVERAGE:
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
  ticketFooter: "Thank you for choosing RepairOX!",

  statusColors: {
    in_progress: "#3B82F6",
    waiting_approval: "#F59E0B",
    waiting_parts: "#F97316",
    repaired: "#10B981",
    repaired_collected: "#059669",
    return: "#F43F5E",
    return_collected: "#71717A",
  },
  ticketDefaultStatus: "in_progress",
  ticketDefaultResolutionMinutes: 59,

  /* Invoice configuration defaults — preserve the current hardcoded behaviour. */
  invoiceStatusColors: {
    draft: "#71717A",
    sent: "#3B82F6",
    paid: "#10B981",
    partial: "#F59E0B",
    overdue: "#F43F5E",
    cancelled: "#A1A1AA",
  },
  invoiceNumbering: {
    // 3 digits matches the existing INV001 / INVG001 series — do NOT widen this
    // without intent, so historical numbers keep formatting.
    retail: { prefix: "INV", startNumber: 1, digits: 3 },
    business: { prefix: "INVG", startNumber: 1, digits: 3 },
  },
  invoiceDefaults: {
    invoiceType: "retail",
    serviceCategory: "service",
    status: "draft",
    paymentMode: "",
    dueDateDays: 7,
    gstRate: 0,
  },
  invoiceGstRates: [0, 12, 18],
  invoicePaymentModes: ["cash", "upi", "bank_transfer", "card", "cheque", "wallet", "other"],
  invoiceTerms:
    "Limited Warranty\nWe stand behind our repair services.\nYour repaired device is covered by a service warranty.",
  invoiceFooter: "THANK YOU FOR CHOOSING FIX IND",
  invoiceSlogan: "",
  invoiceWarrantyText: `WARRANTY COVERAGE:
- Screen repairs: 30 days from date of service
- Battery replacement: 90 days from date of service
- Board-level repairs: 15 days from date of service
- Software/data services: No warranty

CLAIM PROCEDURE:
- Present this invoice along with the device at our service center.
- Warranty covers the specific repair performed, not pre-existing issues.
- Physical/liquid damage after repair voids the warranty.`,
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
    hsnCode: (row.hsn_code as string) ?? DEFAULT_STORE_SETTINGS.hsnCode,
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
    // Custom print templates (extensible; empty array when unset).
    customPrintTemplates: parseJsonColumn(row.custom_print_templates, DEFAULT_STORE_SETTINGS.customPrintTemplates),
    // ── Ticket Terms & Notes ──
    // Migration: when the ticket-specific column is absent (older rows), fall
    // back to the existing STORE value so ticket print keeps its prior text.
    // Once saved from Settings → Tickets → Terms & Notes, the ticket column
    // wins and the two become fully independent.
    ticketTerms: (row.ticket_terms as string) ?? (row.terms_and_conditions as string) ?? DEFAULT_STORE_SETTINGS.ticketTerms,
    ticketWarrantyText: (row.ticket_warranty_text as string) ?? (row.warranty_text as string) ?? DEFAULT_STORE_SETTINGS.ticketWarrantyText,
    ticketFooter: (row.ticket_footer as string) ?? (row.print_footer as string) ?? DEFAULT_STORE_SETTINGS.ticketFooter,
    statusColors: row.status_colors ? (typeof row.status_colors === "string" ? JSON.parse(row.status_colors as string) : row.status_colors as Record<string, string>) : DEFAULT_STORE_SETTINGS.statusColors,
    ticketDefaultStatus: (row.ticket_default_status as string) ?? DEFAULT_STORE_SETTINGS.ticketDefaultStatus,
    ticketDefaultResolutionMinutes: Number(row.ticket_default_resolution_minutes ?? DEFAULT_STORE_SETTINGS.ticketDefaultResolutionMinutes),
    invoiceStatusColors: parseJsonColumn(row.invoice_status_colors, DEFAULT_STORE_SETTINGS.invoiceStatusColors),
    invoiceNumbering: parseJsonColumn(row.invoice_numbering, DEFAULT_STORE_SETTINGS.invoiceNumbering),
    invoiceDefaults: parseJsonColumn(row.invoice_defaults, DEFAULT_STORE_SETTINGS.invoiceDefaults),
    invoiceGstRates: parseJsonColumn(row.invoice_gst_rates, DEFAULT_STORE_SETTINGS.invoiceGstRates),
    invoicePaymentModes: parseJsonColumn(row.invoice_payment_modes, DEFAULT_STORE_SETTINGS.invoicePaymentModes),
    invoiceTerms: (row.invoice_terms as string) ?? DEFAULT_STORE_SETTINGS.invoiceTerms,
    invoiceFooter: (row.invoice_footer as string) ?? DEFAULT_STORE_SETTINGS.invoiceFooter,
    invoiceSlogan: (row.invoice_slogan as string) ?? DEFAULT_STORE_SETTINGS.invoiceSlogan,
    // Invoice warranty is independent of Store Information. Older rows without
    // the column fall back to the built-in default (NOT the store value) so
    // invoices never silently inherit store terms once this feature ships.
    invoiceWarrantyText: (row.invoice_warranty_text as string) ?? DEFAULT_STORE_SETTINGS.invoiceWarrantyText,
  };
}

/** Parse a JSON column that may arrive as a string, an object, or be absent.
 *  Falls back to the provided default so missing columns never break hydration.
 *  Arrays are used as-is; plain objects are shallow-merged over the fallback so
 *  newly-added keys always have a sensible value. */
function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed == null) return fallback;
    // Array fields: only accept an actual array, else keep the default so
    // consumers that call .map()/.length never receive a malformed object.
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    if (Array.isArray(parsed)) return fallback;
    if (typeof parsed === "object") {
      // Deep-merge one level so a partially-stored nested object (e.g.
      // invoice_numbering.retail missing `digits`) still inherits every default.
      const out: Record<string, unknown> = { ...(fallback as Record<string, unknown>) };
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const fv = (fallback as Record<string, unknown>)[k];
        if (fv && typeof fv === "object" && !Array.isArray(fv) && v && typeof v === "object" && !Array.isArray(v)) {
          out[k] = { ...(fv as object), ...(v as object) };
        } else {
          out[k] = v;
        }
      }
      return out as T;
    }
  } catch {
    /* malformed — fall through to default */
  }
  return fallback;
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
    hsnCode: "hsn_code",
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
    customPrintTemplates: "custom_print_templates",
    ticketTerms: "ticket_terms",
    ticketWarrantyText: "ticket_warranty_text",
    ticketFooter: "ticket_footer",
    statusColors: "status_colors",
    ticketDefaultStatus: "ticket_default_status",
    ticketDefaultResolutionMinutes: "ticket_default_resolution_minutes",
    invoiceStatusColors: "invoice_status_colors",
    invoiceNumbering: "invoice_numbering",
    invoiceDefaults: "invoice_defaults",
    invoiceGstRates: "invoice_gst_rates",
    invoicePaymentModes: "invoice_payment_modes",
    invoiceTerms: "invoice_terms",
    invoiceFooter: "invoice_footer",
    invoiceSlogan: "invoice_slogan",
    invoiceWarrantyText: "invoice_warranty_text",
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
  const { isDemoMode, authReady, demoResetCounter } = usePermissions();
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const orgIdRef = useRef<string | null>(null);

  // ── Load settings based on mode (waits for auth to be ready) ──
  useEffect(() => {
    if (!authReady) return;

    // Demo mode: always use clean defaults — fresh on every login.
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
  }, [authReady, isDemoMode, demoResetCounter]);

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
