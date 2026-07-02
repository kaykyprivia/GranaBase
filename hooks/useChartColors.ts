"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export interface ChartColors {
  axis: string;
  grid: string;
  cursor: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  profit: string;
  expense: string;
  warning: string;
  accent: string;
  mutedBar: string;
}

const CHART_PALETTES: Record<"dark" | "light", ChartColors> = {
  dark: {
    axis: "#94A3B8",
    grid: "#1E293B",
    cursor: "rgba(255,255,255,0.04)",
    tooltipBg: "#111827",
    tooltipBorder: "#1F2937",
    tooltipText: "#F8FAFC",
    profit: "#22C55E",
    expense: "#EF4444",
    warning: "#FACC15",
    accent: "#38BDF8",
    mutedBar: "#374151",
  },
  light: {
    axis: "#475569",
    grid: "#D1D9E6",
    cursor: "rgba(15,23,42,0.05)",
    tooltipBg: "#FFFFFF",
    tooltipBorder: "#D1D9E6",
    tooltipText: "#0F172A",
    profit: "#16A34A",
    expense: "#DC2626",
    warning: "#CA8A04",
    accent: "#0369A1",
    mutedBar: "#CBD5E1",
  },
};

export function useChartColors(): ChartColors {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const theme = mounted && resolvedTheme === "light" ? "light" : "dark";
  return CHART_PALETTES[theme];
}
