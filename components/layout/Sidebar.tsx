"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  FileText,
  PiggyBank,
  Target,
  BarChart3,
  Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SidebarUserPanel } from "@/components/layout/SidebarUserPanel";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { MAE_USER_ID } from "@/lib/mae";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/income", label: "Entradas", icon: TrendingUp },
  { href: "/expenses", label: "Gastos", icon: TrendingDown },
  { href: "/bills", label: "Contas", icon: FileText },
  { href: "/investments", label: "Investimentos", icon: PiggyBank },
  { href: "/goals", label: "Metas", icon: Target },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
];

const maeNavItem = { href: "/mae", label: "Mãe", icon: Heart };

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isMaeUser, setIsMaeUser] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsMaeUser(user?.id === MAE_USER_ID);
    });
  }, [supabase]);

  const items = isMaeUser ? [...navItems, maeNavItem] : navItems;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    router.push("/login");
  };

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-64 flex-col bg-surface border-r border-border shadow-[1px_0_0_rgba(255,255,255,0.03)]">
      {/* Logo */}
      <div className="shrink-0 flex items-center px-5 py-5 border-b border-border/70">
        <BrandLogo className="h-14 rounded-xl" priority />
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 px-2 py-4 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-accent" />
              )}
              <item.icon
                className={cn("shrink-0", isActive ? "text-accent" : "text-text-muted")}
                style={{ height: "17px", width: "17px" }}
                strokeWidth={isActive ? 2 : 1.75}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 px-2 pb-4 border-t border-border/70 pt-3">
        <SidebarUserPanel onLogout={handleLogout} />
      </div>
    </aside>
  );
}
