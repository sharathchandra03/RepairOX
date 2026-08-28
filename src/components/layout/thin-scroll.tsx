"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * ThinScroll — a scroll container with a hidden native scrollbar and a very thin
 * custom overlay thumb (1px wide, royal blue). Gives exact pixel control that the
 * native scrollbar can't provide.
 */
export function ThinScroll({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ startY: number; startScroll: number } | null>(null);
  const [thumb, setThumb] = useState<{ top: number; height: number; visible: boolean }>({
    top: 0,
    height: 0,
    visible: false,
  });
  const [hovering, setHovering] = useState(false);

  const recompute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight + 1) {
      setThumb((t) => (t.visible ? { ...t, visible: false } : t));
      return;
    }
    const trackPad = 4; // vertical breathing room top & bottom
    const trackHeight = clientHeight - trackPad * 2;
    const minThumb = 28;
    const height = Math.max(minThumb, (clientHeight / scrollHeight) * trackHeight);
    const maxTop = trackHeight - height;
    const top = trackPad + (scrollTop / (scrollHeight - clientHeight)) * maxTop;
    setThumb({ top, height, visible: true });
  }, []);

  useLayoutEffect(() => {
    recompute();
  }, [recompute, children]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => recompute();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => recompute());
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [recompute]);

  // Drag the thumb to scroll
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const el = scrollRef.current;
      const drag = draggingRef.current;
      if (!el || !drag) return;
      const { scrollHeight, clientHeight } = el;
      const trackPad = 4;
      const trackHeight = clientHeight - trackPad * 2;
      const thumbHeight = Math.max(28, (clientHeight / scrollHeight) * trackHeight);
      const maxTop = trackHeight - thumbHeight;
      const deltaY = e.clientY - drag.startY;
      const scrollRatio = (scrollHeight - clientHeight) / maxTop;
      el.scrollTop = drag.startScroll + deltaY * scrollRatio;
    }
    function onUp() {
      draggingRef.current = null;
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const onThumbDown = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    draggingRef.current = { startY: e.clientY, startScroll: el.scrollTop };
    document.body.style.userSelect = "none";
  };

  return (
    <div
      className="relative min-h-0 flex-1"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div ref={scrollRef} className={cn("sidebar-scroll h-full overflow-y-auto", className)}>
        {children}
      </div>
      {thumb.visible && (
        <div
          onMouseDown={onThumbDown}
          className="absolute right-[2px] w-[2px] cursor-pointer rounded-full bg-[hsl(var(--primary))] transition-[opacity,background-color] duration-150"
          style={{
            top: thumb.top,
            height: thumb.height,
            opacity: hovering ? 0.7 : 0.5,
          }}
        />
      )}
    </div>
  );
}
