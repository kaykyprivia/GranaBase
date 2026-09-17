"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, Gift, LogOut, Menu, Package, Settings, ShoppingCart, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NavigationGroups } from "@/components/layout/NavigationGroups";
import { getNavigationGroups } from "@/components/layout/navigation";
import { MAE_USER_ID } from "@/lib/mae";

interface HeaderProps {
  pageTitle?: string;
}

interface AppNotification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  severity: string;
  action_url: string | null;
  resolved_at: string | null;
  read_at: string | null;
  created_at: string;
}

export function Header({ pageTitle }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMaeUser, setIsMaeUser] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const loadUserAndNotifications = useCallback(
    async (isActive: () => boolean = () => true) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isActive()) return;

      setIsMaeUser(user?.id === MAE_USER_ID);

      if (!user) {
        setNotifications([]);
        setNotificationsLoading(false);
        return;
      }

      const { error: syncError } = await supabase.rpc(
        "sync_business_notifications"
      );

      if (syncError) {
        console.error("Erro ao sincronizar alertas do negocio:", syncError);
      }

      const { data, error } = await supabase
        .from("notifications")
        .select(
          "id,title,message,notification_type,severity,action_url,resolved_at,read_at,created_at"
        )
        .eq("user_id", user.id)
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(30);

      if (!isActive()) return;

      if (error) {
        console.error("Erro ao carregar notificacoes:", error);
        setNotifications([]);
      } else {
        setNotifications((data ?? []) as AppNotification[]);
      }

      setNotificationsLoading(false);
    },
    [supabase]
  );

  useEffect(() => {
    let active = true;

    void loadUserAndNotifications(() => active);

    return () => {
      active = false;
    };
  }, [loadUserAndNotifications]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  const unreadNotifications = notifications.filter(
    (notification) => !notification.read_at
  ).length;

  const markNotificationAsRead = async (id: string) => {
    const notification = notifications.find((item) => item.id === id);

    if (!notification || notification.read_at) {
      return;
    }

    const readAt = new Date().toISOString();

    const { error } = await supabase.rpc(
      "mark_notification_read",
      coerceMutation({
        notification_id: id,
      })
    );

    if (error) {
      toast.error("Nao foi possivel marcar a notificacao como lida.");
      return;
    }

    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, read_at: readAt } : item
      )
    );
  };

  const handleNotificationsToggle = () => {
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);

    if (nextOpen) {
      void loadUserAndNotifications();
    }
  };

  const handleNotificationClick = async (notification: AppNotification) => {
    await markNotificationAsRead(notification.id);
    setNotificationsOpen(false);

    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  const markAllNotificationsAsRead = async () => {
    const unreadIds = notifications
      .filter((notification) => !notification.read_at)
      .map((notification) => notification.id);

    if (unreadIds.length === 0) {
      return;
    }

    const readAt = new Date().toISOString();

    const { error } = await supabase.rpc("mark_all_notifications_read");

    if (error) {
      toast.error("Nao foi possivel marcar as notificacoes como lidas.");
      return;
    }

    setNotifications((current) =>
      current.map((notification) =>
        notification.read_at
          ? notification
          : { ...notification, read_at: readAt }
      )
    );
  };

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
            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                aria-label="Notificações"
                aria-expanded={notificationsOpen}
                onClick={handleNotificationsToggle}
                className="relative flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Bell className="h-[18px] w-[18px]" />

                {unreadNotifications > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-expense px-1 text-[9px] font-bold leading-none text-white">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay">
                  <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        Notificações
                      </p>
                      <p className="text-[11px] text-text-secondary">
                        {unreadNotifications > 0
                          ? `${unreadNotifications} não lida${unreadNotifications === 1 ? "" : "s"}`
                          : "Tudo em dia"}
                      </p>
                    </div>

                    {unreadNotifications > 0 && (
                      <button
                        type="button"
                        onClick={() => void markAllNotificationsAsRead()}
                        className="text-[11px] font-medium text-accent hover:underline"
                      >
                        Marcar todas como lidas
                      </button>
                    )}
                  </div>

                  <div className="max-h-[26rem] overflow-y-auto">
                    {notificationsLoading ? (
                      <div className="px-4 py-6 text-center text-sm text-text-secondary">
                        Carregando...
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <Bell className="mx-auto mb-2 h-5 w-5 text-text-muted" />
                        <p className="text-sm font-medium text-text-primary">
                          Nenhuma notificação
                        </p>
                        <p className="mt-1 text-xs text-text-secondary">
                          Novidades importantes aparecerão aqui.
                        </p>
                      </div>
                    ) : (
                      notifications.map((notification) => {
                        const NotificationIcon =
                          notification.notification_type.startsWith("business_stock")
                            ? Package
                            : notification.notification_type.startsWith("business_purchase")
                              ? ShoppingCart
                              : notification.notification_type === "trial"
                                ? Gift
                                : notification.notification_type === "welcome"
                                  ? Sparkles
                                  : Bell;

                        const notificationTone =
                          notification.severity === "critical"
                            ? "bg-expense/10 text-expense"
                            : notification.severity === "warning"
                              ? "bg-warning/10 text-warning"
                              : "bg-accent/10 text-accent";

                        return (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() => void handleNotificationClick(notification)}
                            className="flex w-full gap-3 border-b border-border/50 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-border/25"
                          >
                            <div
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${notificationTone}`}
                            >
                              <NotificationIcon className="h-4 w-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-text-primary">
                                  {notification.title}
                                </p>

                                {!notification.read_at && (
                                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                                )}
                              </div>

                              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                                {notification.message}
                              </p>

                              {notification.read_at && (
                                <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-text-muted">
                                  <Check className="h-3 w-3" />
                                  Lida
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
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
