"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * PinnedRail — a right-hand rail whose internal scroll is DRIVEN by the page's
 * scroll instead of scrolling independently.
 *
 * Behaviour (the "uniformity" the ticket view wants):
 *  - When the page (left column) is scrolled to the very TOP, the rail shows
 *    its top.
 *  - When the page is scrolled to the very BOTTOM, the rail shows its bottom.
 *  - In between, the rail's scroll position is mapped PROPORTIONALLY to the
 *    page's scroll fraction, so the left column and the rail reach their ends
 *    together.
 *
 * The rail is visually pinned (position: sticky) so it stays in view, but it
 * never scrolls on its own — `overflow-hidden` removes the independent
 * scrollbar/wheel interaction while still allowing us to set `scrollTop`
 * programmatically. When the rail is shorter than the viewport there is nothing
 * to scroll and it simply stays put.
 *
 * On small screens (< lg) the rail is a normal stacked block — no pinning, no
 * scroll mapping — so mobile layout is unaffected. The `.rox-pinned-rail`
 * utility (globals.css) applies the lg-only `top` / `max-height`.
 */
export function PinnedRail({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    // Find the nearest scrollable ancestor (the app-shell content container,
    // which owns overflow-y-auto). Fall back to the window/document if none.
    const findScrollParent = (el: HTMLElement | null): HTMLElement | null => {
      let node = el?.parentElement ?? null;
      while (node) {
        const style = window.getComputedStyle(node);
        const oy = style.overflowY;
        if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    };

    const scroller = findScrollParent(rail);

    // Only map scroll on desktop (lg+), where the rail is actually pinned.
    const mq = window.matchMedia("(min-width: 1024px)");

    let raf = 0;
    const sync = () => {
      raf = 0;
      if (!mq.matches) {
        // Mobile / stacked: reset any programmatic offset.
        rail.scrollTop = 0;
        return;
      }
      const railScrollable = rail.scrollHeight - rail.clientHeight;
      if (railScrollable <= 0) {
        rail.scrollTop = 0;
        return;
      }

      let fraction: number;
      if (scroller) {
        const pageScrollable = scroller.scrollHeight - scroller.clientHeight;
        fraction = pageScrollable > 0 ? scroller.scrollTop / pageScrollable : 0;
      } else {
        const doc = document.documentElement;
        const pageScrollable = doc.scrollHeight - doc.clientHeight;
        fraction = pageScrollable > 0 ? (window.scrollY || doc.scrollTop) / pageScrollable : 0;
      }

      // Clamp 0..1 (rubber-band / overscroll safety) and map proportionally.
      const clamped = Math.min(1, Math.max(0, fraction));
      rail.scrollTop = clamped * railScrollable;
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(sync);
    };

    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    // Recompute on resize (viewport height & rail content height both change).
    window.addEventListener("resize", onScroll, { passive: true });
    // Content in the rail can change height after data loads — observe it.
    const ro = new ResizeObserver(onScroll);
    ro.observe(rail);

    // Initial alignment.
    sync();

    return () => {
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={railRef}
      className={cn(
        // Mobile: normal stacked block.
        "space-y-6",
        // Desktop: pinned + height-capped (rox-pinned-rail) with page-driven
        // scroll and NO independent scrollbar (overflow hidden).
        "lg:sticky lg:self-start lg:overflow-hidden rox-pinned-rail",
        className,
      )}
    >
      {children}
    </div>
  );
}
