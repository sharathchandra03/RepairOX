"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-aware collapse driver.
 *
 * Watches the nearest scrollable ancestor of `anchorRef` and reports whether a
 * scroll-driven collapse should be active, based on scroll position and
 * direction — never on every scroll event.
 *
 * Design notes:
 *  - Uses a passive scroll listener + requestAnimationFrame so we read layout
 *    once per frame and update React state only when the boolean flips.
 *  - Hysteresis (separate collapse/expand thresholds) avoids jitter from tiny
 *    scroll movements around a single threshold.
 *  - Falls back to `window` when no scrollable ancestor exists.
 *  - Fully cleans up its listener + rAF on unmount / ref change.
 *
 * Manual override lives in the consumer: this hook only reports the scroll
 * *suggestion*. The consumer decides how to reconcile it with a manual state.
 */

export type UseScrollCollapseOptions = {
  /**
   * Scroll distance (px) past which the card should collapse. A clear downward
   * scroll beyond this recovers vertical space. Default 96px.
   */
  collapseAt?: number;
  /**
   * Scroll distance (px) below which the card re-expands as the user returns
   * toward the top. Kept lower than `collapseAt` to create a dead-band and
   * prevent flicker. Default 32px.
   */
  expandAt?: number;
  /** Disable the listener entirely (e.g. no model selected). */
  enabled?: boolean;
};

/** Walk up the DOM to find the nearest vertically-scrollable ancestor. */
function findScrollParent(node: HTMLElement | null): HTMLElement | Window {
  let el = node?.parentElement ?? null;
  while (el) {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const scrollable = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    if (scrollable && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return window;
}

function getScrollTop(target: HTMLElement | Window): number {
  return target instanceof Window
    ? window.scrollY || document.documentElement.scrollTop || 0
    : target.scrollTop;
}

export function useScrollCollapse({
  collapseAt = 96,
  expandAt = 32,
  enabled = true,
}: UseScrollCollapseOptions = {}) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const [shouldCollapse, setShouldCollapse] = useState(false);

  // Latest boolean kept in a ref so the rAF callback can compare without being
  // in the effect deps (prevents re-subscribing the listener on every flip).
  const collapsedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setShouldCollapse(false);
      collapsedRef.current = false;
      return;
    }

    const scrollTarget = findScrollParent(anchorRef.current);
    let frame = 0;
    let ticking = false;
    let lastTop = getScrollTop(scrollTarget);

    const evaluate = () => {
      ticking = false;
      const top = getScrollTop(scrollTarget);
      const goingDown = top > lastTop;
      lastTop = top;

      let next = collapsedRef.current;
      // Clear downward scroll past the collapse threshold → collapse.
      if (!next && goingDown && top > collapseAt) next = true;
      // Return near the top → expand. (Upward direction not required, so
      // reaching the top always restores the card.)
      else if (next && top <= expandAt) next = false;

      if (next !== collapsedRef.current) {
        collapsedRef.current = next;
        setShouldCollapse(next);
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      frame = requestAnimationFrame(evaluate);
    };

    // Sync once in case the container is already scrolled (e.g. navigation back).
    evaluate();

    const opts: AddEventListenerOptions = { passive: true };
    if (scrollTarget instanceof Window) {
      window.addEventListener("scroll", onScroll, opts);
    } else {
      scrollTarget.addEventListener("scroll", onScroll, opts);
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (scrollTarget instanceof Window) {
        window.removeEventListener("scroll", onScroll);
      } else {
        scrollTarget.removeEventListener("scroll", onScroll);
      }
    };
  }, [collapseAt, expandAt, enabled]);

  return { anchorRef, shouldCollapse };
}
