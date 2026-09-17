"use client";

/**
 * Standalone Price List layout (Leads access point)
 * ------------------------------------------------------------------
 * This route lives OUTSIDE the (app) layout group on purpose. It renders the
 * canonical Price List as a clean, full-screen page — no sidebar, no topbar,
 * no workspace switcher — so a Sales Person opening it in a new tab from Leads
 * sees just the catalog.
 *
 * It is NOT a second Price List: the page component and its live catalog data
 * are the exact same ones used by Shop → Price List. The global providers
 * (auth, catalog, multi-store) live in the ROOT layout, so this route still
 * gets live data, the authenticated session, and store scoping.
 *
 * Security is preserved: this layout runs the same lightweight auth guard the
 * app shell uses — an unauthenticated visitor is bounced to /login. Opening in
 * a new tab reuses the existing persisted session (no second login flow).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/lib/permissions-context";

export default function LeadsPriceListLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { authReady, currentUser } = usePermissions();

  // Route guard — once the session is restored, bounce anyone who isn't
  // signed in to the login screen. Mirrors the app shell's central guard.
  useEffect(() => {
    if (authReady && !currentUser) router.replace("/login");
  }, [authReady, currentUser, router]);

  // Hold rendering until we know who (if anyone) is signed in — avoids a flash
  // of catalog content before the guard above redirects an unauthenticated user.
  if (!authReady || !currentUser) {
    return <div className="h-screen bg-[hsl(var(--background))]" />;
  }

  // Layout notes on the Price List's topbar-relative offsets:
  //
  // The Price List page was built to sit inside the app shell, so it pins some
  // elements just below the ~60px app topbar:
  //   1) The Parts table sticky header measures the scroll container's FIRST
  //      CHILD height as the "topbar" offset. We give this scroll container a
  //      zero-height first child so it measures 0 and pins at the very top.
  //   2) The device-browser panel + reveal handle use hard-coded
  //      `top-[76px]` / `h-[calc(100vh-92px)]` (60px topbar + 16px padding).
  //      Standalone there is no topbar, so we neutralize just those two utility
  //      classes to `top:0` / `height:100vh` — SCOPED to this route only via
  //      `.rox-standalone-pricelist`, so the app shell is never affected.
  return (
    <div className="rox-standalone-pricelist h-screen overflow-y-auto bg-[hsl(var(--background))]">
      {/* Scoped overrides — only active on this chrome-less standalone route. */}
      <style>{`
        .rox-standalone-pricelist .top-\\[76px\\] { top: 0 !important; }
        .rox-standalone-pricelist .h-\\[calc\\(100vh-92px\\)\\] { height: calc(100vh - 24px) !important; }
      `}</style>
      {/* Zero-height topbar sentinel — see note (1) above. */}
      <div aria-hidden className="h-0" />
      <main className="min-w-0 px-4 pt-4 pb-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
