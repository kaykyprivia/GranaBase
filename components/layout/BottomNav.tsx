"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  FileText,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const mobileNavItems = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/income", label: "Entradas", icon: TrendingUp },
  { href: "/expenses", label: "Gastos", icon: TrendingDown },
  { href: "/bills", label: "Contas", icon: FileText },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-border pb-safe">
      <div className="flex items-center justify-around px-2 py-2">
        {mobileNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all duration-150 min-w-[56px]",
                isActive
                  ? "text-accent"
                  : "text-text-secondary"
              )}
            >
              <item.icon
                style={{ height: "20px", width: "20px" }}
                className={cn(
                  "transition-all",
                  isActive && "drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]"
                )}
              />
              <span className={cn("text-[10px] font-medium leading-none", isActive ? "text-accent" : "")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
