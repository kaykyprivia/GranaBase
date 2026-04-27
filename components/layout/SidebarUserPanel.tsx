"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronUp, LogOut, Settings, UserCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface SidebarUserPanelProps {
  onLogout: () => Promise<void>;
}

interface SidebarUserState {
  email: string;
  displayName: string;
  initials: string;
  planLabel: string;
  planTone: "free" | "pro";
}

function toTitleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getDisplayName(email: string, fullName?: string | null, fallbackName?: string | null) {
  if (fullName?.trim()) {
    return toTitleCase(fullName);
  }

  if (fallbackName?.trim()) {
    return toTitleCase(fallbackName);
  }

  const emailPrefix = email.split("@")[0] ?? "";
  return toTitleCase(emailPrefix.replace(/[._-]+/g, " "));
}

function getInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "GB";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getPlanState(rawPlan?: string | null) {
  return rawPlan?.toLowerCase() === "pro"
    ? { planLabel: "Plano Pro", planTone: "pro" as const }
    : { planLabel: "Plano Free", planTone: "free" as const };
}

export function SidebarUserPanel({ onLogout }: SidebarUserPanelProps) {
  const [supabase] = useState(() => createClient());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userData, setUserData] = useState<SidebarUserState | null>(null);

  useEffect(() => {
    let active = true;

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      if (!user) {
        setUserData(null);
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();
      const profile = (profileData ?? null) as Pick<Profile, "full_name" | "email"> | null;

      const email = profile?.email ?? user.email ?? "";
      const displayName = getDisplayName(
        email,
        profile?.full_name,
        user.user_metadata?.full_name ?? user.user_metadata?.name ?? null
      );
      const initials = getInitials(displayName);
      const plan = getPlanState(
        user.user_metadata?.plan ??
          user.user_metadata?.subscription_tier ??
          user.app_metadata?.plan ??
          null
      );

      setUserData({
        email,
        displayName,
        initials,
        ...plan,
      });
      setLoading(false);
    };

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadUser();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener("mousedown", handlePointerDown);
    }

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  if (loading) {
    return (
      <div className="mb-3 rounded-2xl border border-border/80 bg-background/30 p-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return <div className="mb-3 h-2" />;
  }

  return (
    <div ref={containerRef} className="relative mb-3">
      <button
        type="button"
        onClick={() => setMenuOpen((current) => !current)}
        className={cn(
          "group flex w-full items-center gap-3 rounded-2xl border border-border/80 bg-gradient-to-br from-background/80 via-surface to-accent/5 p-3 text-left transition-all duration-200",
          "hover:border-accent/30 hover:bg-accent/5 hover:shadow-[0_0_0_1px_rgba(56,189,248,0.08)]"
        )}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent via-sky-400 to-cyan-300 text-sm font-bold text-slate-950 shadow-sm">
          {userData.initials}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{userData.displayName}</p>
          <p className="truncate text-xs text-text-secondary">{userData.email}</p>
          <span
            className={cn(
              "mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
              userData.planTone === "pro"
                ? "border-warning/40 bg-warning/15 text-warning"
                : "border-accent/25 bg-accent/10 text-accent"
            )}
          >
            {userData.planLabel}
          </span>
        </div>

        <ChevronUp
          className={cn(
            "h-4 w-4 shrink-0 text-text-secondary transition-transform duration-200",
            menuOpen ? "rotate-0 text-text-primary" : "rotate-180"
          )}
        />
      </button>

      {menuOpen && (
        <div className="absolute bottom-[calc(100%+0.5rem)] left-0 right-0 z-20 overflow-hidden rounded-2xl border border-border/80 bg-surface/95 p-1.5 shadow-xl backdrop-blur-md">
          <Link
            href="/settings#profile"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-background/70 hover:text-text-primary"
          >
            <UserCircle2 className="h-4 w-4" />
            Meu Perfil
          </Link>
          <Link
            href="/settings"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-background/70 hover:text-text-primary"
          >
            <Settings className="h-4 w-4" />
            Configuracoes
          </Link>
          <button
            type="button"
            onClick={async () => {
              setMenuOpen(false);
              await onLogout();
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-expense/10 hover:text-expense"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
