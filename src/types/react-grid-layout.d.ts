declare module "react-grid-layout" {
  import { Component, ReactNode } from "react";

  export interface LayoutItem {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
    static?: boolean;
  }

  export interface ResponsiveProps {
    className?: string;
    layouts?: Record<string, LayoutItem[]>;
    breakpoints?: Record<string, number>;
    cols?: Record<string, number>;
    rowHeight?: number;
    width?: number;
    margin?: [number, number];
    containerPadding?: [number, number];
    isDraggable?: boolean;
    isResizable?: boolean;
    onLayoutChange?: (current: LayoutItem[], allLayouts: Record<string, LayoutItem[]>) => void;
    draggableHandle?: string;
    resizeHandles?: string[];
    useCSSTransforms?: boolean;
    children?: ReactNode;
  }

  export class Responsive extends Component<ResponsiveProps> {}
  export default class ReactGridLayout extends Component<any> {}
}

declare module "react-grid-layout/css/styles.css" {}
declare module "react-resizable/css/styles.css" {}
