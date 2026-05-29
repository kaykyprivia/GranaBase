"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Wallet,
  Zap,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const mobileNavItems = [
  {
    href: "/dashboard",
    label: "Home",
    icon: LayoutDashboard,
    activeColor: "text-accent",
    glowColor: "drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]",
  },
  {
    href: "/timeline",
    label: "Timeline",
    icon: CalendarDays,
    activeColor: "text-profit",
    glowColor: "drop-shadow-[0_0_8px_rgba(34,197,94,0.7)]",
  },
  {
    href: "/investments",
    label: "Carteira",
    icon: Wallet,
    activeColor: "text-growth",
    glowColor: "drop-shadow-[0_0_8px_rgba(167,139,250,0.7)]",
  },
  {
    href: "/intelligence",
    label: "Inteligência",
    icon: Zap,
    activeColor: "text-warning",
    glowColor: "drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]",
  },
  {
    href: "/settings",
    label: "Perfil",
    icon: User,
    activeColor: "text-text-primary",
    glowColor: "drop-shadow-[0_0_8px_rgba(241,245,249,0.5)]",
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 pb-safe">
      {/* Glass background */}
      <div className="glass-deep border-t border-border/40">
        <div className="flex items-center justify-around px-1 py-2">
          {mobileNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-200 min-w-[56px] relative",
                  isActive
                    ? cn("bg-border/30", item.activeColor)
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {isActive && (
                  <div className={cn(
                    "absolute inset-0 rounded-xl opacity-10",
                    item.href === "/dashboard" && "bg-accent",
                    item.href === "/timeline" && "bg-profit",
                    item.href === "/investments" && "bg-growth",
                    item.href === "/intelligence" && "bg-warning",
                    item.href === "/settings" && "bg-text-primary",
                  )} />
                )}
                <item.icon
                  className={cn(
                    "transition-all duration-200 relative z-10",
                    isActive ? cn(item.activeColor, item.glowColor) : "",
                  )}
                  style={{ height: "20px", width: "20px" }}
                />
                <span className={cn(
                  "text-[10px] font-semibold leading-none relative z-10 transition-all duration-200",
                  isActive ? item.activeColor : "text-text-muted"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
