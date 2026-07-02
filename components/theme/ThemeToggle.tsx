"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className={cn("h-9 w-9", className)} />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-border/60 hover:text-text-primary transition-colors",
        className
      )}
      title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
    >
      {isDark ? <Sun className="h-4.5 w-4.5" style={{ height: "18px", width: "18px" }} /> : <Moon className="h-4.5 w-4.5" style={{ height: "18px", width: "18px" }} />}
    </button>
  );
}
