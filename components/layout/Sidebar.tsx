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
  Settings,
  LogOut,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SidebarUserPanel } from "@/components/layout/SidebarUserPanel";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/income", label: "Entradas", icon: TrendingUp },
  { href: "/expenses", label: "Gastos", icon: TrendingDown },
  { href: "/bills", label: "Contas", icon: FileText },
  { href: "/calendar", label: "Calendário", icon: Calendar },
  { href: "/investments", label: "Investimentos", icon: PiggyBank },
  { href: "/goals", label: "Metas", icon: Target },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
  { href: "/settings", label: "Configurações", icon: Settings },
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
    <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-surface border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-border">
        <div className="p-2 rounded-lg bg-accent/20">
          <Wallet className="h-5 w-5 text-accent" />
        </div>
        <div>
          <span className="text-lg font-bold text-text-primary">Grana</span>
          <span className="text-lg font-bold text-accent">Base</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
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
      <div className="px-3 pb-4 border-t border-border pt-3">
        <SidebarUserPanel onLogout={handleLogout} />
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-expense/10 hover:text-expense transition-all duration-150 w-full"
        >
          <LogOut style={{ height: "18px", width: "18px" }} className="shrink-0" />
          Sair
        </button>
      </div>
    </aside>
  );
}
