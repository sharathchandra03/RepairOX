"use client";

/*
   ModalPortal — the ONE way every full-screen "black mask" / backdrop overlay
   in RepairOX escapes the app-shell stacking context.

   WHY THIS EXISTS
   The app shell (app/src/components/layout/app-shell.tsx) renders page content
   inside a scroll container (`overflow-y-auto`) whose `<motion.main>` (and the
   framer-motion wrappers around dialogs themselves) apply a `transform` during
   their enter/exit animation. A CSS transform makes that element the
   *containing block* for any descendant `position: fixed` node — so a backdrop
   written as `fixed inset-0` no longer resolves against the viewport, it
   resolves against the animated ancestor, which starts BELOW the sticky topbar.
   The result is the glitch where the dark mask covers the page but leaves the
   topbar strip (and any area outside the animated box) uncovered.

   THE FIX
   Render the overlay through a React portal into `document.body`. `document.body`
   has no transformed ancestor, so `fixed inset-0` once again covers the entire
   viewport — topbar included — every time, on every screen.

   USAGE
     <ModalPortal>
       {open && (
         <motion.div className="fixed inset-0 z-[9998] ...backdrop..." />
         <motion.div className="fixed inset-0 z-[9999] grid place-items-center ...">
           ...dialog...
         </motion.div>
       )}
     </ModalPortal>

   It is SSR-safe (renders nothing until mounted on the client) and is a thin
   wrapper — it does not add its own markup, z-index, or backdrop, so existing
   dialog classNames keep working unchanged. Use the shared z-index tokens in
   the `Z` export so overlays stack predictably.
*/

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Canonical overlay z-index tiers. Prefer these over ad-hoc `z-50` / `z-[60]`
 * so every mask lands above the app chrome (topbar sits at `z-20`).
 *   overlay  — standard modals / confirm dialogs / device pickers.
 *   high     — overlays that must sit above another open modal.
 *   top      — fullscreen takeovers (completion / scanner).
 */
export const Z = {
  overlay: "z-[9998]",
  overlayPanel: "z-[9999]",
  high: "z-[10050]",
  top: "z-[10060]",
} as const;

export function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(<>{children}</>, document.body);
}
