"use client";

import { useEffect } from "react";

/* Toggles data-scroll-left / data-scroll-right (and the proportional
   --rox-scroll-x fraction) on a data-grid scroll container so the frozen-edge
   shadows (`.rox-frozen-left-edge` / `.rox-frozen-right-edge`) only show when
   there is scrollable content under that edge. rAF-throttled; no layout
   thrash. Same behaviour as the Lead Table grid. */
export function useScrollEdges(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const maxScroll = el.scrollWidth - el.clientWidth;
      el.setAttribute("data-scroll-left", String(el.scrollLeft > 1));
      el.setAttribute("data-scroll-right", String(el.scrollLeft < maxScroll - 1));
      const fraction = maxScroll > 0 ? Math.min(1, Math.max(0, el.scrollLeft / maxScroll)) : 0;
      el.style.setProperty("--rox-scroll-x", fraction.toFixed(4));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // The table inside can change width (column reorder / scale) without the
    // container resizing — observe the first child as well.
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
}
