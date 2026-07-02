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
        background: "rgb(var(--color-background) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--color-surface-2) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        "border-subtle": "rgb(var(--color-border-subtle) / <alpha-value>)",
        "text-primary": "rgb(var(--color-text-primary) / <alpha-value>)",
        "text-secondary": "rgb(var(--color-text-secondary) / <alpha-value>)",
        "text-muted": "rgb(var(--color-text-muted) / <alpha-value>)",
        profit: "rgb(var(--color-profit) / <alpha-value>)",
        "profit-dim": "rgb(var(--color-profit-dim) / <alpha-value>)",
        expense: "rgb(var(--color-expense) / <alpha-value>)",
        "expense-dim": "rgb(var(--color-expense-dim) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        "warning-dim": "rgb(var(--color-warning-dim) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        "accent-dim": "rgb(var(--color-accent-dim) / <alpha-value>)",
        growth: "rgb(var(--color-growth) / <alpha-value>)",
        "growth-dim": "rgb(var(--color-growth-dim) / <alpha-value>)",
        caution: "rgb(var(--color-caution) / <alpha-value>)",
        "caution-dim": "rgb(var(--color-caution-dim) / <alpha-value>)",

        // Semantic surface tokens — context-aware backgrounds for financial state
        "surface-risk": "rgb(var(--color-surface-risk) / <alpha-value>)",
        "surface-growth": "rgb(var(--color-surface-growth) / <alpha-value>)",
        "surface-warning": "rgb(var(--color-surface-warning) / <alpha-value>)",
        "surface-stable": "rgb(var(--color-surface-stable) / <alpha-value>)",

        // shadcn/ui compatible tokens
        card: {
          DEFAULT: "rgb(var(--color-surface-2) / <alpha-value>)",
          foreground: "rgb(var(--color-text-primary) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "rgb(var(--color-surface-2) / <alpha-value>)",
          foreground: "rgb(var(--color-text-primary) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          foreground: "rgb(var(--color-surface) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--color-border) / <alpha-value>)",
          foreground: "rgb(var(--color-text-primary) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--color-border) / <alpha-value>)",
          foreground: "rgb(var(--color-text-secondary) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--color-expense) / <alpha-value>)",
          foreground: "rgb(var(--color-text-primary) / <alpha-value>)",
        },
        input: "rgb(var(--color-border) / <alpha-value>)",
        ring: "rgb(var(--color-accent) / <alpha-value>)",
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
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        elevated: "var(--shadow-elevated)",
        overlay: "var(--shadow-overlay)",
        "glow-accent": "var(--shadow-glow-accent)",
        "glow-profit": "var(--shadow-glow-profit)",
        "glow-expense": "var(--shadow-glow-expense)",
        "glow-warning": "var(--shadow-glow-warning)",
        "inner-top": "var(--shadow-inner-top)",
        input: "var(--shadow-input)",
        "input-focus": "var(--shadow-input-focus)",
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
