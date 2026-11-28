"use client";
/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — EMPTY-CELL ALIGNER (app-wide)
   Any table cell whose whole content is an empty-value placeholder ("—", "-",
   "N/A") is centred in its column, so a run of empty values reads as a tidy
   vertical line instead of hugging the left edge. Done once here (a `td` is
   tagged `data-empty-cell`, and globals.css centres it) so every existing and
   future table follows the rule without per-page changes. Presentation only —
   it never changes data. Zero values (0 / ₹0) are NOT placeholders.
   ────────────────────────────────────────────────────────────────────────── */
import { useEffect } from "react";

const PLACEHOLDERS = new Set(["—", "–", "-", "--", "N/A", "n/a", "NA"]);

function tag(td: HTMLTableCellElement) {
  const text = (td.textContent ?? "").trim();
  const isPlaceholder = PLACEHOLDERS.has(text);
  // A plain placeholder, or an "N/A" dropdown PILL (a single button) — both centre.
  const hasLink = !!td.querySelector("a, input, select, textarea");
  const hasButton = !!td.querySelector("button");
  if (isPlaceholder && !hasLink) {
    td.setAttribute("data-empty-cell", "");
    if (hasButton) td.setAttribute("data-empty-pill", "");
    else td.removeAttribute("data-empty-pill");
  } else {
    td.removeAttribute("data-empty-cell");
    td.removeAttribute("data-empty-pill");
  }
}

function scan(root: Node) {
  if (root.nodeType !== Node.ELEMENT_NODE) {
    const cell = root.parentElement?.closest("td");
    if (cell) tag(cell as HTMLTableCellElement);
    return;
  }
  const el = root as Element;
  const own = el.closest("td");
  if (own) tag(own as HTMLTableCellElement);
  el.querySelectorAll("td").forEach((td) => tag(td as HTMLTableCellElement));
}

export function EmptyCellAligner() {
  useEffect(() => {
    let queued = new Set<Node>();
    let raf = 0;
    const flush = () => {
      raf = 0;
      const batch = queued;
      queued = new Set();
      batch.forEach((n) => { if (n.isConnected) scan(n); });
    };
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "childList") r.addedNodes.forEach((n) => queued.add(n));
        queued.add(r.target);
      }
      if (!raf) raf = requestAnimationFrame(flush);
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    scan(document.body);
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return null;
}
