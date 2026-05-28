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
        card: "0 2px 4px 0 rgba(20,30,80,0.04), 0 4px 12px 0 rgba(20,30,80,0.06), 0 16px 40px -16px rgba(20,30,80,0.10)",
        glow: "0 10px 40px -12px rgba(67,97,238,0.50)",
        ring: "0 0 0 1px rgba(20,30,80,0.06)",
        "card-hover": "0 6px 20px 0 rgba(20,30,80,0.09), 0 20px 48px -16px rgba(20,30,80,0.14)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
      },
      animation: {
        "fade-in": "fade-in 240ms ease-out both",
        "fade-up": "fade-up 360ms cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 1.6s infinite",
        "pulse-dot": "pulseDot 1.4s ease-in-out infinite",
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
