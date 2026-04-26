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
        background: "#0F172A",
        surface: "#111827",
        border: "#1F2937",
        "text-primary": "#F8FAFC",
        "text-secondary": "#94A3B8",
        profit: "#22C55E",
        expense: "#EF4444",
        warning: "#FACC15",
        accent: "#38BDF8",
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
        "slide-in": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in": "slide-in 0.3s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
