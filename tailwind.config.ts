import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        info: { DEFAULT: "hsl(var(--info))", foreground: "hsl(var(--info-foreground))" },
        brand: {
          50: "#EEF1FD",
          100: "#D9DFFA",
          200: "#B3BFF6",
          300: "#8DA0F2",
          400: "#6780EE",
          500: "#4361EE",
          600: "#3B54E8",
          700: "#3347D6",
          800: "#2A3AB8",
          900: "#1E2B8A",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(20,30,80,0.03), 0 2px 8px -2px rgba(20,30,80,0.05), 0 8px 20px -8px rgba(20,30,80,0.06)",
        glow: "0 8px 32px -8px rgba(67,97,238,0.45)",
        ring: "0 0 0 1px rgba(20,30,80,0.05)",
        "card-hover": "0 4px 12px 0 rgba(20,30,80,0.06), 0 12px 32px -8px rgba(20,30,80,0.1)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        breathe: { "0%,100%": { opacity: "0.4", transform: "scale(1)" }, "50%": { opacity: "0.8", transform: "scale(1.04)" } },
        "module-breathe": { "0%,100%": { boxShadow: "0 0 0 0 rgba(67,97,238,0.0), 0 0 0 0 rgba(67,97,238,0.0)" }, "50%": { boxShadow: "0 0 12px 2px rgba(67,97,238,0.15), 0 0 4px 1px rgba(67,97,238,0.10)" } },
        "search-breathe": { "0%,100%": { boxShadow: "0 0 8px 2px rgba(67,97,238,0.0)" }, "50%": { boxShadow: "0 0 14px 4px rgba(67,97,238,0.18)" } },
        "search-intro": {
          "0%": { boxShadow: "0 0 24px 9px rgba(67,97,238,0.34)" },
          "100%": { boxShadow: "0 0 8px 2px rgba(67,97,238,0.0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 240ms ease-out both",
        "fade-up": "fade-up 360ms cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-dot": "pulseDot 1.4s ease-in-out infinite",
        breathe: "breathe 3s ease-in-out infinite",
        "module-breathe": "module-breathe 3s ease-in-out infinite",
        "search-breathe": "search-breathe 4s ease-in-out infinite",
        "search-spotlight": "search-intro 1.6s ease-out 1 both, search-breathe 4s ease-in-out 1.6s infinite",
        "gradient-first": "moveVertical 30s ease infinite",
        "gradient-second": "moveInCircle 20s reverse infinite",
        "gradient-third": "moveInCircle 40s linear infinite",
        "gradient-fourth": "moveHorizontal 40s ease infinite",
        "gradient-fifth": "moveInCircle 20s ease infinite",
      },
      backgroundImage: {
        "grid-faint":
          "linear-gradient(to right, rgba(20,30,80,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(20,30,80,0.04) 1px, transparent 1px)",
        "radial-fade":
          "radial-gradient(60% 60% at 50% 0%, rgba(67,97,238,0.09) 0%, rgba(67,97,238,0) 100%)",
        "gradient-subtle":
          "linear-gradient(135deg, rgba(67,97,238,0.04) 0%, rgba(59,84,232,0.04) 100%)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
