/* ──────────────────────────────────────────────────────────────────────────
   RepairOX — Reports V2 · Semantic color system (presentation only)
   ──────────────────────────────────────────────────────────────────────────
   A fixed meaning per metric family, used consistently across every section
   so the eye learns the language of the dashboard instantly:

     Revenue      → Deep Emerald     Collection → Blue      Pending → Amber
     Overdue      → Coral Red        Expenses   → Orange    GST     → Purple
     Inventory    → Teal             Neutral    → Slate

   This file changes ONLY how things look. No calculation, filter, export or
   report-builder logic lives here.
   ────────────────────────────────────────────────────────────────────────── */

export type MetricTone =
  | "revenue" | "collection" | "pending" | "overdue"
  | "expenses" | "gst" | "inventory" | "neutral" | "profit";

export interface ToneStyle {
  solid: string;
  soft: string;
  text: string;
  bg: string;
  ring: string;
  bar: string;
  chipBg: string;
  chipText: string;
  gradient: string;
}

export const TONE: Record<MetricTone, ToneStyle> = {
  revenue: {
    solid: "#059669", soft: "#ECFDF5", text: "text-emerald-700", bg: "bg-emerald-50",
    ring: "ring-emerald-200", bar: "bg-emerald-500", chipBg: "bg-emerald-100", chipText: "text-emerald-700",
    gradient: "linear-gradient(135deg,#059669 0%,#10B981 100%)",
  },
  collection: {
    solid: "#2563EB", soft: "#EFF6FF", text: "text-blue-700", bg: "bg-blue-50",
    ring: "ring-blue-200", bar: "bg-blue-500", chipBg: "bg-blue-100", chipText: "text-blue-700",
    gradient: "linear-gradient(135deg,#2563EB 0%,#3B82F6 100%)",
  },
  pending: {
    solid: "#D97706", soft: "#FFFBEB", text: "text-amber-700", bg: "bg-amber-50",
    ring: "ring-amber-200", bar: "bg-amber-500", chipBg: "bg-amber-100", chipText: "text-amber-700",
    gradient: "linear-gradient(135deg,#D97706 0%,#F59E0B 100%)",
  },
  overdue: {
    solid: "#E11D48", soft: "#FFF1F2", text: "text-rose-700", bg: "bg-rose-50",
    ring: "ring-rose-200", bar: "bg-rose-500", chipBg: "bg-rose-100", chipText: "text-rose-700",
    gradient: "linear-gradient(135deg,#E11D48 0%,#FB7185 100%)",
  },
  expenses: {
    solid: "#EA580C", soft: "#FFF7ED", text: "text-orange-700", bg: "bg-orange-50",
    ring: "ring-orange-200", bar: "bg-orange-500", chipBg: "bg-orange-100", chipText: "text-orange-700",
    gradient: "linear-gradient(135deg,#EA580C 0%,#FB923C 100%)",
  },
  gst: {
    solid: "#7C3AED", soft: "#F5F3FF", text: "text-violet-700", bg: "bg-violet-50",
    ring: "ring-violet-200", bar: "bg-violet-500", chipBg: "bg-violet-100", chipText: "text-violet-700",
    gradient: "linear-gradient(135deg,#7C3AED 0%,#A78BFA 100%)",
  },
  inventory: {
    solid: "#0D9488", soft: "#F0FDFA", text: "text-teal-700", bg: "bg-teal-50",
    ring: "ring-teal-200", bar: "bg-teal-500", chipBg: "bg-teal-100", chipText: "text-teal-700",
    gradient: "linear-gradient(135deg,#0D9488 0%,#2DD4BF 100%)",
  },
  profit: {
    solid: "#4361EE", soft: "#EEF1FD", text: "text-[#3347D6]", bg: "bg-[#EEF1FD]",
    ring: "ring-[#B3BFF6]/60", bar: "bg-[#4361EE]", chipBg: "bg-[#EEF1FD]", chipText: "text-[#3347D6]",
    gradient: "linear-gradient(135deg,#4361EE 0%,#7C8CF5 100%)",
  },
  neutral: {
    solid: "#475569", soft: "#F8FAFC", text: "text-slate-700", bg: "bg-slate-50",
    ring: "ring-slate-200", bar: "bg-slate-500", chipBg: "bg-slate-100", chipText: "text-slate-700",
    gradient: "linear-gradient(135deg,#475569 0%,#94A3B8 100%)",
  },
};

/** Multi-series palettes for donuts / stacked visuals, ordered for meaning
 *  where the mapping is contextual (e.g. revenue split slices). */
export const CATEGORICAL_PALETTE = ["#059669", "#2563EB", "#7C3AED", "#D97706", "#0D9488", "#E11D48", "#4361EE", "#94A3B8"];
