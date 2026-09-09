"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, LogOut, Menu, Settings, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NavigationGroups } from "@/components/layout/NavigationGroups";
import { getNavigationGroups } from "@/components/layout/navigation";
import { MAE_USER_ID } from "@/lib/mae";

interface HeaderProps {
  pageTitle?: string;
}

export function Header({ pageTitle }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMaeUser, setIsMaeUser] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsMaeUser(user?.id === MAE_USER_ID);
    });
  }, [supabase]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        return;
      }

      if (event.key === "Tab") {
        const focusableElements = getFocusableElements(drawerRef.current);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (!firstElement || !lastElement) {
          return;
        }

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    const triggerButton = menuButtonRef.current;
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      triggerButton?.focus();
    };
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    router.push("/login");
  };

  return (
    <>
      <header className="sticky top-0 z-30 lg:hidden bg-surface/90 backdrop-blur-md border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2 min-w-0">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label="Abrir menu"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Menu className="h-5 w-5" />
            </button>
            <BrandLogo className="h-11 rounded-2xl" priority />
          </div>
          <div className="flex items-center gap-2">
            {pageTitle && (
              <span className="max-w-[7rem] truncate text-sm font-medium text-text-secondary">{pageTitle}</span>
            )}
            <ThemeToggle />
            <button
              type="button"
              aria-label="Notificações"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Bell className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu principal">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div ref={drawerRef} className="relative z-10 flex h-full w-[min(19rem,calc(100vw-2.5rem))] flex-col bg-surface border-r border-border shadow-overlay animate-slide-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/70">
              <BrandLogo className="h-12 rounded-2xl" priority />
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="Fechar menu"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 min-h-0 px-2 py-4 overflow-y-auto">
              <NavigationGroups
                groups={getNavigationGroups(isMaeUser)}
                storageKey="granabase-mobile-nav-groups"
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </nav>

            <div className="space-y-1 px-3 pb-4 border-t border-border pt-3">
              <Link
                href="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-all hover:bg-border/50 hover:text-text-primary"
              >
                <Settings className="h-4 w-4 shrink-0" />
                Configurações
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-secondary transition-all hover:bg-expense/10 hover:text-expense"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getFocusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) {
    return [];
  }

  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}
