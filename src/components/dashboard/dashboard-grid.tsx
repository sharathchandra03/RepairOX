"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Responsive, type LayoutItem } from "react-grid-layout";
import { useDashboardSettings } from "@/lib/dashboard-settings-context";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

interface DashboardGridProps {
  children: React.ReactNode[];
  keys: string[];
}

const DEFAULT_LAYOUTS: Record<string, LayoutItem[]> = {
  lg: [
    { i: "revenue",      x: 0, y: 0, w: 8, h: 5, minW: 4, minH: 3 },
    { i: "donut",        x: 8, y: 0, w: 4, h: 5, minW: 3, minH: 3 },
    { i: "devices",      x: 0, y: 5, w: 4, h: 5, minW: 3, minH: 4 },
    { i: "heatmap",      x: 4, y: 5, w: 4, h: 5, minW: 3, minH: 4 },
    { i: "transactions", x: 8, y: 5, w: 4, h: 5, minW: 3, minH: 4 },
  ],
  md: [
    { i: "revenue",      x: 0, y: 0, w: 8, h: 5, minW: 4, minH: 3 },
    { i: "donut",        x: 8, y: 0, w: 4, h: 5, minW: 3, minH: 3 },
    { i: "devices",      x: 0, y: 5, w: 4, h: 5, minW: 3, minH: 4 },
    { i: "heatmap",      x: 4, y: 5, w: 4, h: 5, minW: 3, minH: 4 },
    { i: "transactions", x: 8, y: 5, w: 4, h: 5, minW: 3, minH: 4 },
  ],
  sm: [
    { i: "revenue",      x: 0, y: 0, w: 12, h: 5, minW: 12, minH: 3 },
    { i: "donut",        x: 0, y: 5, w: 12, h: 5, minW: 12, minH: 3 },
    { i: "devices",      x: 0, y: 10, w: 12, h: 5, minW: 12, minH: 4 },
    { i: "heatmap",      x: 0, y: 15, w: 12, h: 5, minW: 12, minH: 4 },
    { i: "transactions", x: 0, y: 20, w: 12, h: 5, minW: 12, minH: 4 },
  ],
};

export function DashboardGrid({ children, keys }: DashboardGridProps) {
  const { resizeEnabled } = useDashboardSettings();
  const [layouts, setLayouts] = useState(DEFAULT_LAYOUTS);
  const [width, setWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const gridChildren = useMemo(
    () =>
      children.map((child, i) => (
        <div key={keys[i]} className="overflow-hidden rounded-2xl">
          {child}
        </div>
      )),
    [children, keys]
  );

  const handleLayoutChange = useCallback((_current: LayoutItem[], allLayouts: Record<string, LayoutItem[]>) => {
    setLayouts(allLayouts);
  }, []);

  return (
    <div ref={containerRef} className="w-full">
      {width > 0 && (
        <Responsive
          className="dashboard-grid"
          layouts={layouts}
          breakpoints={{ lg: 1024, md: 768, sm: 0 }}
          cols={{ lg: 12, md: 12, sm: 12 }}
          rowHeight={60}
          width={width}
          margin={[16, 16]}
          containerPadding={[0, 0]}
          isDraggable={resizeEnabled}
          isResizable={resizeEnabled}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle"
          resizeHandles={["se", "e", "s"]}
          useCSSTransforms
        >
          {gridChildren}
        </Responsive>
      )}
    </div>
  );
}
