"use client";
/* RepairOX — horizontal scroller with "there's more" hints.
   Wrap any strip that can be wider than its space (filter / stage strips).
   • Scrolls naturally: mouse wheel / trackpad / touch all move it sideways
     (a vertical wheel turns into horizontal scroll while it can still move).
   • `framed` draws the strip's pill frame OUTSIDE the scroller, so the border
     never gets clipped — options slide INSIDE a fixed pill (pass the inner
     SegmentedTabs `className="border-0 bg-transparent p-0"`).
   • When content is hidden on a side, that edge fades and a small chevron
     inside the pill blinks to say "more this way"; clicking it is optional.
   Respects prefers-reduced-motion. Presentation only. */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScrollHint({ children, className, framed = false, step = 220 }: {
  children: React.ReactNode; className?: string; framed?: boolean; step?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Vertical wheel → horizontal scroll, only while the strip can still move
    // that way (so the page/table keeps its normal wheel otherwise).
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = el.scrollLeft + e.deltaY;
      if ((e.deltaY > 0 && el.scrollLeft >= max - 1) || (e.deltaY < 0 && el.scrollLeft <= 0)) return;
      e.preventDefault();
      el.scrollLeft = Math.max(0, Math.min(max, next));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { el.removeEventListener("scroll", measure); el.removeEventListener("wheel", onWheel); ro.disconnect(); };
  }, [measure]);

  // Clicking an option near/under an edge slides it fully into view.
  const onClickCapture = (e: React.MouseEvent) => {
    const el = ref.current;
    const btn = (e.target as HTMLElement).closest("button,[role=tab]") as HTMLElement | null;
    if (!el || !btn || !el.contains(btn)) return;
    const box = el.getBoundingClientRect(), b = btn.getBoundingClientRect();
    const pad = 56; // clear the fade + chevron
    if (b.left < box.left + pad || b.right > box.right - pad) {
      const target = el.scrollLeft + (b.left - box.left) - (box.width - b.width) / 2;
      el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
    }
  };
  const go = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * step, behavior: "smooth" });

  return (
    <div className={cn("relative min-w-0", framed && "flex max-w-full overflow-hidden rounded-full border border-[#4361EE]/60 bg-muted p-1", className)}>
      <div ref={ref} onClickCapture={onClickCapture} className={cn("max-w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden", framed ? "min-w-0 flex-1 rounded-full" : "px-0.5 py-1")}>
        <div className="w-max min-w-full">{children}</div>
      </div>
      {edges.left && <Edge side="left" framed={framed} onClick={() => go(-1)} />}
      {edges.right && <Edge side="right" framed={framed} onClick={() => go(1)} />}
    </div>
  );
}

function Edge({ side, framed, onClick }: { side: "left" | "right"; framed: boolean; onClick: () => void }) {
  const left = side === "left";
  const Icon = left ? ChevronLeft : ChevronRight;
  return (
    <div onClick={onClick} className={cn("absolute z-20 flex w-12 cursor-pointer items-center",
      framed ? (left ? "inset-y-1 left-1 rounded-l-full" : "inset-y-1 right-1 rounded-r-full") : (left ? "inset-y-0 left-0" : "inset-y-0 right-0"),
      left ? "justify-start bg-gradient-to-r" : "justify-end bg-gradient-to-l",
      framed ? "from-muted via-muted/90 to-transparent" : "from-background via-background/85 to-transparent")}>
      <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} tabIndex={-1} aria-label={left ? "Show earlier options" : "Show more options"} title={left ? "Scroll left" : "More options — scroll or click"}
        className="grid h-6 w-6 place-items-center rounded-full text-[#4361EE] transition hover:bg-[#4361EE]/10">
        <Icon className={cn("h-4 w-4", left ? "motion-safe:animate-[rox-nudge-left_1.1s_ease-in-out_infinite]" : "motion-safe:animate-[rox-nudge-right_1.1s_ease-in-out_infinite]")} strokeWidth={2.75} />
      </button>
    </div>
  );
}
