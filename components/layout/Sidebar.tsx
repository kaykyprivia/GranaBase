"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  FileText,
  Calendar,
  PiggyBank,
  Target,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SidebarUserPanel } from "@/components/layout/SidebarUserPanel";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { GlobalContributionButton } from "@/components/wallet/WalletContributionProvider";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/income", label: "Entradas", icon: TrendingUp },
  { href: "/expenses", label: "Gastos", icon: TrendingDown },
  { href: "/bills", label: "Contas", icon: FileText },
  { href: "/calendar", label: "Calendário", icon: Calendar },
  { href: "/investments", label: "Investimentos", icon: PiggyBank },
  { href: "/goals", label: "Metas", icon: Target },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    router.push("/login");
  };

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-64 flex-col bg-surface border-r border-border">
      {/* Logo */}
      <div className="shrink-0 flex items-center gap-2.5 px-5 py-5 border-b border-border">
        <BrandLogo className="h-14 rounded-xl" priority />
      </div>

      <div className="px-3 pt-4">
        <GlobalContributionButton className="w-full" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-accent/15 text-accent border border-accent/20"
                  : "text-text-secondary hover:bg-border/50 hover:text-text-primary"
              )}
            >
              <item.icon className={cn("h-4.5 w-4.5 shrink-0", isActive ? "text-accent" : "")} style={{ height: "18px", width: "18px" }} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 px-3 pb-4 border-t border-border pt-3">
        <SidebarUserPanel onLogout={handleLogout} />
      </div>
    </aside>
  );
}
