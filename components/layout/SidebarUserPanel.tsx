"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronUp, LogOut, Settings, UserCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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

      const { data: profileById } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      const profileData =
        profileById ??
        (
          await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", user.id)
            .maybeSingle()
        ).data ??
        null;

      const profile = (profileData ?? null) as { full_name?: string | null } | null;

      const email = user.email ?? "";
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
      <div className="mb-3 rounded-xl border border-border/60 bg-background/50 p-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!userData) {
    return <div className="mb-2 h-2" />;
  }

  return (
    <div ref={containerRef} className="relative mb-2">
      <button
        type="button"
        onClick={() => setMenuOpen((current) => !current)}
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl border border-border/60 bg-background/50 p-3 text-left transition-all duration-150",
          "hover:border-border hover:bg-background/80",
          menuOpen && "border-border bg-background/80"
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/90 to-sky-500 text-[13px] font-bold text-slate-950 shadow-sm ring-2 ring-accent/20">
          {userData.initials}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary leading-tight">{userData.displayName}</p>
          <p className="truncate text-[11px] text-text-muted mt-0.5">{userData.email}</p>
        </div>

        <ChevronUp
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-200",
            menuOpen ? "rotate-0" : "rotate-180"
          )}
        />
      </button>

      {menuOpen && (
        <div className="animate-fade-in absolute bottom-[calc(100%+0.375rem)] left-0 right-0 z-20 overflow-hidden rounded-xl border border-border/80 bg-surface p-1 shadow-overlay backdrop-blur-md">
          <Link
            href="/settings#profile"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-white/[0.05] hover:text-text-primary"
          >
            <UserCircle2 className="h-4 w-4 shrink-0" />
            Meu Perfil
          </Link>
          <Link
            href="/settings"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-white/[0.05] hover:text-text-primary"
          >
            <Settings className="h-4 w-4 shrink-0" />
            Configurações
          </Link>
          <div className="my-1 mx-1 border-t border-border/60" />
          <button
            type="button"
            onClick={async () => {
              setMenuOpen(false);
              await onLogout();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-expense/10 hover:text-expense"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
