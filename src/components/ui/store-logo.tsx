"use client";

/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — StoreLogo component.

   Displays the store's uploaded logo inside a consistent circular container.
   Falls back to the default RepairOX blue icon when no logo is uploaded.

   Single source of truth: reads from useStoreSettings (organization_settings
   table in Supabase, or localStorage in demo mode). Every role, every page
   sees the same logo. Updating it in Settings → Store Branding automatically
   propagates everywhere via the StoreSettingsProvider context.
   ────────────────────────────────────────────────────────────────────────── */

import { cn } from "@/lib/utils";
import { useStoreSettings } from "@/lib/store-settings";

/* ─── Default RepairOX icon (fallback) ───────────────────────────────── */

function DefaultIcon({ size }: { size: number }) {
  const iconSize = Math.max(size * 0.5, 12);
  return (
    <span
      className="relative grid place-items-center rounded-full brand-gradient shadow-glow"
      style={{ width: size, height: size }}
    >
      <span className="absolute inset-0 rounded-full ring-1 ring-white/30" />
      <svg viewBox="0 0 24 24" fill="none" style={{ width: iconSize, height: iconSize }} className="text-white">
        <path
          d="M5 13l3 3 4-6 3 4 4-7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/* ─── StoreLogo ──────────────────────────────────────────────────────── */

export type StoreLogoSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<StoreLogoSize, number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80,
};

interface StoreLogoProps {
  /** Predefined size token or a number in px */
  size?: StoreLogoSize | number;
  className?: string;
}

/**
 * Renders the store's uploaded logo inside a circular container with white
 * background and a thin neutral border. If no logo is uploaded, renders the
 * default RepairOX blue gradient icon as fallback.
 *
 * Usage:
 *   <StoreLogo />            // default "sm" (32px)
 *   <StoreLogo size="lg" />  // 56px
 *   <StoreLogo size={48} />  // custom 48px
 */
export function StoreLogo({ size = "sm", className }: StoreLogoProps) {
  const { settings } = useStoreSettings();
  const px = typeof size === "number" ? size : SIZE_MAP[size];
  const hasLogo = Boolean(settings.logo);

  if (!hasLogo) {
    return <DefaultIcon size={px} />;
  }

  const padding = Math.max(Math.round(px * 0.15), 4);

  return (
    <span
      className={cn(
        "relative grid place-items-center rounded-full bg-white border border-neutral-300 shadow-[0_1px_4px_0_rgba(0,0,0,0.08)] overflow-hidden shrink-0",
        className
      )}
      style={{ width: px, height: px, padding }}
    >
      <img
        src={settings.logo}
        alt="Store logo"
        className="h-full w-full object-contain rounded-full"
        draggable={false}
      />
    </span>
  );
}
