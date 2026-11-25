/* ──────────────────────────────────────────────────────────────────────────
   Sidebar + header colour themes.

   Three INDEPENDENT choices — Sidebar × Header × Active-item pill — so any
   combination can be tried (16 × 16 × 17 ≈ 4,300). `COMBOS` are hand-picked
   starting points that set sidebar + header together.

   The choice is applied as CSS variables on <html> (see the `--chrome-*` block in
   globals.css), stored company-wide in organization_settings.chrome_theme, and
   applied by <ChromeThemeApplier/>. Settings → System → Preferences edits it.
   ────────────────────────────────────────────────────────────────────────── */

export type Tone = "dark" | "light";

export type Sidebar = {
  id: string; name: string; tone: Tone;
  from: string; via: string; to: string; border: string;
  /** Text colour on a LIGHT sidebar (dark tone always uses white). */
  text?: string;
  /** The pill used when the pill choice is "Match sidebar". */
  pill: { from: string; to: string; text: string };
};
export type Header = {
  id: string; name: string; tone: Tone;
  from: string; via: string; to: string; border: string;
  text?: string;
};
export type Pill = { id: string; name: string; from: string; to: string; text: string };

const GLASS = { from: "#FFFFFF40", to: "#FFFFFF26", text: "#FFFFFF" };
const INK = "#1E2A5A";

const dsb = (id: string, name: string, from: string, via: string, to: string, border: string, pill: { from: string; to: string; text?: string } = GLASS): Sidebar =>
  ({ id, name, tone: "dark", from, via, to, border, pill: { from: pill.from, to: pill.to, text: pill.text ?? "#FFFFFF" } });
const lsb = (id: string, name: string, from: string, via: string, to: string, border: string, pf: string, pt: string, ptext = "#2B3FCF"): Sidebar =>
  ({ id, name, tone: "light", from, via, to, border, text: INK, pill: { from: pf, to: pt, text: ptext } });
const dhd = (id: string, name: string, from: string, via: string, to: string, border: string): Header => ({ id, name, tone: "dark", from, via, to, border });
const lhd = (id: string, name: string, from: string, via: string, to: string, border: string): Header => ({ id, name, tone: "light", from, via, to, border, text: INK });

export const SIDEBARS: Sidebar[] = [
  dsb("soft-navy", "Soft Navy", "#4D5C8C", "#455383", "#3C4977", "#33406B", { from: "#6F87FF", to: "#4F6BF5" }),
  dsb("royal", "Royal Blue", "#3F5BE8", "#3A53DA", "#3148C4", "#2A3DA8"),
  dsb("brand-gradient", "Brand Gradient", "#4361EE", "#3A52D8", "#2C3FB0", "#2C3FB0"),
  dsb("azure", "Azure", "#3B78E7", "#3269D2", "#2A5AB9", "#234C99"),
  dsb("sapphire", "Sapphire", "#2F52C9", "#2A47B3", "#243C9B", "#1D3182", { from: "#8FA6FF", to: "#6C86F7" }),
  dsb("cobalt", "Cobalt", "#2A44C2", "#2539AA", "#1E2F90", "#1A2878", { from: "#7C93FF", to: "#5B76F5" }),
  dsb("indigo-blue", "Indigo Blue", "#3F4FD0", "#3846BB", "#303CA3", "#2A3490"),
  dsb("deep-blue", "Deep Blue", "#1E40AF", "#1D3A9C", "#172E7A", "#12266A", { from: "#3B82F6", to: "#2563EB" }),
  dsb("denim", "Denim", "#3C5A99", "#355089", "#2E4577", "#263961", { from: "#7FA0F5", to: "#5C82E6" }),
  dsb("steel", "Steel Blue", "#3E5C8A", "#38537D", "#304869", "#263A58", { from: "#6F9BFF", to: "#4F7DEB" }),
  dsb("ocean", "Ocean Blue", "#1D4E89", "#19437A", "#14376A", "#0F2D57", { from: "#5B8DEF", to: "#3F6FDB" }),
  dsb("teal-blue", "Teal Blue", "#1F6FA8", "#1B6296", "#175482", "#124468", { from: "#7DA7FF", to: "#5A89F0" }),
  lsb("white", "White", "#FFFFFF", "#FFFFFF", "#F8FAFF", "#DDE4F5", "#E3EAFF", "#D4DFFF"),
  lsb("blue-white", "Blue-White", "#F2F5FF", "#EDF1FF", "#E6ECFF", "#D3DCF5", "#D9E3FF", "#C9D8FF"),
  lsb("ice", "Ice Blue", "#EAF3FF", "#E2EEFF", "#D9E8FF", "#C5D9F5", "#CFE2FF", "#BCD6FF", "#174EA6"),
  lsb("mist", "Mist Grey", "#F4F6FA", "#EEF1F7", "#E8ECF4", "#D5DBE8", "#DDE5F7", "#CCD8F2"),
];

export const HEADERS: Header[] = [
  dhd("soft-navy", "Soft Navy", "#4D5C8C", "#475686", "#3F4C7B", "#33406B"),
  dhd("royal", "Royal Blue", "#3F5BE8", "#3A53DA", "#3148C4", "#2A3DA8"),
  dhd("brand-gradient", "Brand Gradient", "#4361EE", "#3F5AE6", "#3A52D8", "#2C3FB0"),
  dhd("azure", "Azure", "#3B78E7", "#3570DB", "#3269D2", "#234C99"),
  dhd("sapphire", "Sapphire", "#2F52C9", "#2D4DBF", "#2A47B3", "#1D3182"),
  dhd("cobalt", "Cobalt", "#2A44C2", "#2740B8", "#2539AA", "#1A2878"),
  dhd("indigo-blue", "Indigo Blue", "#3F4FD0", "#3C4BC6", "#3846BB", "#2A3490"),
  dhd("deep-blue", "Deep Blue", "#1E40AF", "#1D3EA6", "#1D3A9C", "#12266A"),
  dhd("denim", "Denim", "#3C5A99", "#385492", "#355089", "#263961"),
  dhd("steel", "Steel Blue", "#3E5C8A", "#3A5783", "#38537D", "#263A58"),
  dhd("ocean", "Ocean Blue", "#1D4E89", "#1B4881", "#19437A", "#0F2D57"),
  dhd("teal-blue", "Teal Blue", "#1F6FA8", "#1D6A9F", "#1B6296", "#124468"),
  lhd("white", "White", "#FFFFFF", "#FFFFFF", "#F8FAFF", "#DDE4F5"),
  lhd("blue-white", "Blue-White", "#F8FAFF", "#F5F8FF", "#F2F5FF", "#D3DCF5"),
  lhd("ice", "Ice Blue", "#F0F7FF", "#EAF3FF", "#E4EFFF", "#C5D9F5"),
  lhd("mist", "Mist Grey", "#F7F8FB", "#F3F5F9", "#EFF2F7", "#D5DBE8"),
];

export const PILLS: Pill[] = [
  { id: "indigo", name: "Indigo", from: "#6F87FF", to: "#4F6BF5", text: "#FFFFFF" },
  { id: "brand", name: "Brand blue", from: "#4361EE", to: "#3A52D8", text: "#FFFFFF" },
  { id: "royal-grad", name: "Royal gradient", from: "#4F6BF5", to: "#3A52D8", text: "#FFFFFF" },
  { id: "glass", name: "Glass white", from: "#FFFFFF40", to: "#FFFFFF26", text: "#FFFFFF" },
  { id: "white", name: "Solid white", from: "#FFFFFF", to: "#F1F4FF", text: "#2B3FCF" },
  { id: "tint", name: "Pale blue", from: "#DCE5FF", to: "#C9D8FF", text: "#1E2A78" },
  { id: "soft-indigo", name: "Soft indigo", from: "#E0E7FF", to: "#C7D2FE", text: "#3730A3" },
  { id: "deep", name: "Deep blue", from: "#1E3A8A", to: "#172E6E", text: "#FFFFFF" },
  { id: "navy", name: "Navy", from: "#1E2A78", to: "#162063", text: "#FFFFFF" },
  { id: "ink", name: "Ink", from: "#2B3553", to: "#1B2238", text: "#FFFFFF" },
  { id: "slate", name: "Slate", from: "#475569", to: "#334155", text: "#FFFFFF" },
  { id: "black", name: "Charcoal", from: "#1F2937", to: "#111827", text: "#FFFFFF" },
  { id: "amber", name: "Amber", from: "#FBBF24", to: "#F59E0B", text: "#1E1B4B" },
  { id: "gold", name: "Gold", from: "#F59E0B", to: "#D97706", text: "#FFFFFF" },
  { id: "pale-gold", name: "Pale gold", from: "#FEF3C7", to: "#FDE68A", text: "#92400E" },
  { id: "orange", name: "Orange", from: "#FB923C", to: "#F97316", text: "#FFFFFF" },
];

/** The thin line that sweeps in under a menu item on hover. */
export type Line = { id: string; name: string; color: string | null };
export const LINES: Line[] = [
  { id: "brand", name: "Brand blue", color: "#4361EE" },
  { id: "match", name: "Match pill", color: null },
  { id: "bright", name: "Bright blue", color: "#6F87FF" },
  { id: "sky", name: "Light blue", color: "#93C5FD" },
  { id: "pale", name: "Pale blue", color: "#C9D8FF" },
  { id: "lilac", name: "Lilac", color: "#A5B4FC" },
  { id: "white", name: "White", color: "#FFFFFF" },
  { id: "amber", name: "Amber", color: "#FBBF24" },
  { id: "gold", name: "Gold", color: "#F59E0B" },
  { id: "orange", name: "Orange", color: "#FB923C" },
  { id: "navy", name: "Navy", color: "#1E2A78" },
  { id: "charcoal", name: "Charcoal", color: "#1F2937" },
  { id: "none", name: "No line", color: "transparent" },
];
export const lineById = (id?: string | null) => LINES.find((l) => l.id === id) ?? LINES[0];

export type ChromeChoice = { sidebar: string; header: string; pill: string | null; line?: string | null };
export const DEFAULT_CHROME: ChromeChoice = { sidebar: "soft-navy", header: "soft-navy", pill: null };
export const CHROME_CACHE_KEY = "repairox-chrome-choice";

/** Hand-picked starting points (sidebar + header + pill together). */
export type Combo = { id: string; name: string; note: string; choice: ChromeChoice };
const c = (id: string, name: string, note: string, sidebar: string, header: string, pill: string | null = null): Combo => ({ id, name, note, choice: { sidebar, header, pill } });
export const COMBOS: Combo[] = [
  c("soft-navy", "Soft Navy (current)", "What you have today", "soft-navy", "soft-navy"),
  c("royal", "Royal Blue", "Brand blue, bright and simple", "royal", "royal"),
  c("brand-gradient", "Brand Gradient", "Brand blue fading deeper", "brand-gradient", "brand-gradient"),
  c("azure", "Azure", "Lighter, friendlier blue", "azure", "azure"),
  c("sapphire", "Sapphire", "Rich blue with a lilac pill", "sapphire", "sapphire"),
  c("cobalt", "Cobalt", "Deep, confident blue", "cobalt", "cobalt", "indigo"),
  c("deep-blue", "Deep Blue", "Strong contrast", "deep-blue", "deep-blue", "royal-grad"),
  c("denim", "Denim", "Muted, professional", "denim", "denim"),
  c("royal-white", "Royal sidebar · White header", "Blue sidebar, clean top bar", "royal", "white"),
  c("deep-white", "Deep Blue sidebar · White header", "Strong sidebar, white top bar", "deep-blue", "white", "royal-grad"),
  c("navy-white", "Soft Navy sidebar · White header", "Today's sidebar, white top bar", "soft-navy", "white"),
  c("cobalt-blue-white", "Cobalt sidebar · Blue-White header", "Deep sidebar, soft top bar", "cobalt", "blue-white", "indigo"),
  c("white", "Pure White", "White all round, blue accents", "white", "white"),
  c("blue-white", "Soft Blue-White", "Very light blue tint", "blue-white", "blue-white"),
  c("ice", "Ice Blue", "Fresh, light and airy", "ice", "ice"),
  c("white-royal", "White sidebar · Royal header", "Light sidebar under a blue bar", "white", "royal", "tint"),
  c("white-navy-ink", "White sidebar · Soft Navy header", "Light sidebar, dark top bar, ink pill", "white", "soft-navy", "navy"),
  c("royal-amber", "Royal Blue · Amber pill", "Blue with a warm highlight", "royal", "royal", "amber"),
  c("deep-gold", "Deep Blue · Gold pill", "Premium feel", "deep-blue", "deep-blue", "gold"),
  c("white-charcoal", "White · Charcoal pill", "Minimal black and white with blue content", "white", "white", "black"),
];

export const sidebarById = (id?: string | null) => SIDEBARS.find((s) => s.id === id) ?? SIDEBARS[0];
export const headerById = (id?: string | null) => HEADERS.find((h) => h.id === id) ?? HEADERS[0];
export const pillById = (id?: string | null) => PILLS.find((p) => p.id === id) ?? null;
export const sameChoice = (a: ChromeChoice, b: ChromeChoice) => a.sidebar === b.sidebar && a.header === b.header && (a.pill ?? null) === (b.pill ?? null) && (a.line ?? "brand") === (b.line ?? "brand");

/** Accepts the current shape and the first version ({ palette, pill }) saved earlier. */
export function normalizeChoice(raw: unknown): ChromeChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { sidebar?: unknown; header?: unknown; pill?: unknown; palette?: unknown; line?: unknown };
  const pill = typeof r.pill === "string" ? r.pill : null;
  const line = typeof r.line === "string" ? r.line : null;
  if (typeof r.sidebar === "string" && typeof r.header === "string") return { sidebar: r.sidebar, header: r.header, pill, line };
  if (typeof r.palette === "string") {
    const legacy = COMBOS.find((x) => x.id === r.palette);
    if (legacy) return { ...legacy.choice, pill: pill ?? legacy.choice.pill };
  }
  return null;
}

/** Apply a saved / previewed choice to the document. */
export function applyChrome(choice: ChromeChoice | null | undefined) {
  if (typeof document === "undefined") return;
  const ch = choice ?? DEFAULT_CHROME;
  const sb = sidebarById(ch.sidebar), hd = headerById(ch.header);
  const pill = pillById(ch.pill);
  const root = document.documentElement;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set("--chrome-side-from", sb.from); set("--chrome-side-via", sb.via); set("--chrome-side-to", sb.to); set("--chrome-side-border", sb.border);
  set("--chrome-head-from", hd.from); set("--chrome-head-via", hd.via); set("--chrome-head-to", hd.to); set("--chrome-head-border", hd.border);
  set("--chrome-side-text", sb.text ?? "#FFFFFF"); set("--chrome-head-text", hd.text ?? "#FFFFFF");
  const ln = lineById(ch.line);
  const pillFrom = pill?.from ?? sb.pill.from;
  set("--chrome-line", ln.color ?? pillFrom.slice(0, 7));
  // Always-visible accent from the same choice (for borders): the hover-line colour,
  // or the active-pill colour when the user picked "No line" (transparent).
  set("--chrome-accent", !ln.color || ln.color === "transparent" ? pillFrom.slice(0, 7) : ln.color);
  set("--chrome-pill-from", pillFrom); set("--chrome-pill-to", pill?.to ?? sb.pill.to); set("--chrome-pill-text", pill?.text ?? sb.pill.text);
  root.dataset.chromeSide = sb.tone; root.dataset.chromeHead = hd.tone;
}

/** A random but sensible combination for exploring ("Surprise me"). */
export function randomChoice(): ChromeChoice {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  const sidebar = pick(SIDEBARS), header = pick(HEADERS);
  return { sidebar: sidebar.id, header: header.id, pill: Math.random() < 0.35 ? null : pick(PILLS).id, line: pick(LINES).id };
}
