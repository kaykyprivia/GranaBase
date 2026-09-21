"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { SidebarUserPanel } from "@/components/layout/SidebarUserPanel";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { MAE_USER_ID } from "@/lib/mae";
import { NavigationGroups } from "@/components/layout/NavigationGroups";
import { getNavigationGroups } from "@/components/layout/navigation";

export function Sidebar() {
  const router = useRouter();
  const supabase = createClient();
  const [isMaeUser, setIsMaeUser] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsMaeUser(user?.id === MAE_USER_ID);
    });

    supabase.rpc("is_super_admin").then(({ data }) => {
      setIsSuperAdmin(data === true);
    });
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessao encerrada");
    router.push("/login");
  };

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-64 flex-col bg-surface border-r border-border shadow-[1px_0_0_rgba(15,23,42,0.04)] dark:shadow-[1px_0_0_rgba(255,255,255,0.03)]">
      <div className="shrink-0 flex items-center px-5 py-5 border-b border-border/70">
        <BrandLogo className="h-14 rounded-2xl" priority />
      </div>

      <nav className="flex-1 min-h-0 px-2 py-4 overflow-y-auto">
        <NavigationGroups groups={getNavigationGroups(isMaeUser, isSuperAdmin)} />
      </nav>

      <div className="shrink-0 px-2 pb-4 border-t border-border/70 pt-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-xs font-medium text-text-muted">Tema</span>
          <ThemeToggle />
        </div>
        <SidebarUserPanel onLogout={handleLogout} />
      </div>
    </aside>
  );
}
