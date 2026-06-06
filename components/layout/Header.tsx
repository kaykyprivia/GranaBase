"use client";

import { useState } from "react";
import { Menu, X, Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, TrendingUp, TrendingDown, FileText,
  Calendar, PiggyBank, Target, BarChart3, Settings, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BrandLogo } from "@/components/shared/BrandLogo";

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

interface HeaderProps {
  pageTitle?: string;
}

export function Header({ pageTitle }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    router.push("/login");
  };

  return (
    <>
      <header className="sticky top-0 z-30 lg:hidden bg-surface/90 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-lg text-text-secondary hover:bg-border transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <BrandLogo className="h-11 rounded-lg" priority />
          </div>
          <div className="flex items-center gap-2">
            {pageTitle && (
              <span className="text-sm font-medium text-text-secondary">{pageTitle}</span>
            )}
            <button className="p-2 rounded-lg text-text-secondary hover:bg-border transition-colors">
              <Bell className="h-4.5 w-4.5" style={{ height: "18px", width: "18px" }} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-10 w-72 h-full bg-surface border-r border-border flex flex-col animate-slide-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <BrandLogo className="h-12 rounded-xl" priority />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-text-secondary hover:bg-border"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                      isActive
                        ? "bg-accent/15 text-accent border border-accent/20"
                        : "text-text-secondary hover:bg-border/50 hover:text-text-primary"
                    )}
                  >
                    <item.icon style={{ height: "18px", width: "18px" }} className="shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="px-3 pb-4 border-t border-border pt-3">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-expense/10 hover:text-expense transition-all w-full"
              >
                <LogOut style={{ height: "18px", width: "18px" }} className="shrink-0" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
