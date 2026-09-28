"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProductExpiredScreen } from "./ProductExpiredScreen";

type Product = "personal" | "business";

const PERSONAL_ROUTES = [
  "/dashboard",
  "/cash-flow",
  "/income",
  "/expenses",
  "/receivables",
  "/investments",
  "/goals",
  "/reports",
];

const BUSINESS_ROUTES = ["/business"];

function detectProduct(pathname: string): Product | null {
  for (const route of BUSINESS_ROUTES) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return "business";
    }
  }
  for (const route of PERSONAL_ROUTES) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return "personal";
    }
  }
  return null;
}

const PRODUCT_LABELS: Record<Product, string> = {
  personal: "Pessoal",
  business: "Negocio",
};

type AccessState = {
  hasAccess: boolean;
  endsAt: string | null;
  daysRemaining: number | null;
  source: string | null;
  hasFreeActivated: boolean;
  canActivateFree: boolean;
};

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = createClient();

  const product = detectProduct(pathname);

  const [loading, setLoading] = useState(product !== null);
  const [access, setAccess] = useState<AccessState>({
    hasAccess: true,
    endsAt: null,
    daysRemaining: null,
    source: null,
    hasFreeActivated: false,
    canActivateFree: true,
  });

  const checkAccess = useCallback(async () => {
    if (!product) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. SUPER_ADMIN sempre tem acesso total (bypass)
      const adminRes = await supabase.rpc("is_super_admin");
      if (adminRes.data === true) {
        setAccess({
          hasAccess: true,
          endsAt: null,
          daysRemaining: null,
          source: "super_admin",
          hasFreeActivated: false,
          canActivateFree: false,
        });
        return;
      }

      // 2. Checa status consolidado (todos os grants)
      const statusRes = await supabase.rpc("get_my_product_access_status");

      if (statusRes.data) {
        const row = statusRes.data.find((r) => r.product === product);
        if (row) {
          setAccess({
            hasAccess: row.has_access,
            endsAt: row.access_until,
            daysRemaining: row.days_remaining,
            source: row.source,
            hasFreeActivated: row.has_free_activated,
            canActivateFree: row.can_activate_free,
          });
          return;
        }
      }

      // Fallback: sem acesso
      setAccess({
        hasAccess: false,
        endsAt: null,
        daysRemaining: null,
        source: null,
        hasFreeActivated: false,
        canActivateFree: true,
      });
    } catch (error) {
      console.error("Erro ao verificar acesso:", error);
      // fail-open para nao travar a UI por erro de rede
      setAccess((prev) => ({ ...prev, hasAccess: true }));
    } finally {
      setLoading(false);
    }
  }, [supabase, product]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  if (!product) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!access.hasAccess) {
    return (
      <ProductExpiredScreen
        productLabel={PRODUCT_LABELS[product]}
        endsAt={access.endsAt}
        daysRemaining={access.daysRemaining}
        hasFreeActivated={access.hasFreeActivated}
        canActivateFree={access.canActivateFree}
      />
    );
  }

  return <>{children}</>;
}
