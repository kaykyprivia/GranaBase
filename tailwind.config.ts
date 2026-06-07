import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0A0F1E",
        surface: "#0F172A",
        "surface-2": "#111827",
        border: "#1E293B",
        "border-subtle": "#1a2535",
        "text-primary": "#F1F5F9",
        "text-secondary": "#94A3B8",
        "text-muted": "#475569",
        profit: "#22C55E",
        "profit-dim": "#16A34A",
        expense: "#EF4444",
        "expense-dim": "#DC2626",
        warning: "#FACC15",
        "warning-dim": "#EAB308",
        accent: "#38BDF8",
        "accent-dim": "#0284C7",
        growth: "#A78BFA",
        "growth-dim": "#7C3AED",

        // Semantic surface tokens — context-aware backgrounds for financial state
        "surface-risk":    "#130a0a",   // deep red — critical financial state
        "surface-growth":  "#0a1310",   // deep green — healthy/positive state
        "surface-warning": "#13100a",   // deep amber — attention needed
        "surface-stable":  "#0a0f1e",   // deep blue — default (mirrors background)

        // shadcn/ui compatible tokens
        card: {
          DEFAULT: "#111827",
          foreground: "#F8FAFC",
        },
        popover: {
          DEFAULT: "#111827",
          foreground: "#F8FAFC",
        },
        primary: {
          DEFAULT: "#38BDF8",
          foreground: "#0F172A",
        },
        secondary: {
          DEFAULT: "#1F2937",
          foreground: "#F8FAFC",
        },
        muted: {
          DEFAULT: "#1F2937",
          foreground: "#94A3B8",
        },
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#F8FAFC",
        },
        input: "#1F2937",
        ring: "#38BDF8",
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "'Fira Code'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)",
        elevated: "0 8px 32px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)",
        overlay: "0 24px 64px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        "glow-accent": "0 0 0 1px rgba(56,189,248,0.15), 0 0 24px rgba(56,189,248,0.18)",
        "glow-profit": "0 0 0 1px rgba(34,197,94,0.12), 0 0 24px rgba(34,197,94,0.15)",
        "glow-expense": "0 0 0 1px rgba(239,68,68,0.12), 0 0 24px rgba(239,68,68,0.15)",
        "glow-warning": "0 0 0 1px rgba(250,204,21,0.12), 0 0 24px rgba(250,204,21,0.15)",
        "inner-top": "inset 0 1px 0 rgba(255,255,255,0.06)",
        input: "0 1px 2px rgba(0,0,0,0.4)",
        "input-focus": "0 0 0 3px rgba(56,189,248,0.18), 0 1px 2px rgba(0,0,0,0.4)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        "count-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "bar-fill": {
          from: { width: "0%" },
          to: { width: "var(--bar-width)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "fade-up": "fade-up 0.5s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
        "scale-in": "scale-in 0.25s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "count-up": "count-up 0.4s ease-out",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
