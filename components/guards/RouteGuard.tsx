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

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = createClient();

  const product = detectProduct(pathname);

  const [loading, setLoading] = useState(product !== null);
  const [hasAccess, setHasAccess] = useState(true);
  const [endsAt, setEndsAt] = useState<string | null>(null);

  const checkAccess = useCallback(async () => {
    if (!product) {
      setLoading(false);
      setHasAccess(true);
      return;
    }

    setLoading(true);
    try {
      // 1. SUPER_ADMIN sempre tem acesso total (bypass)
      const adminRes = await supabase.rpc("is_super_admin");
      if (adminRes.data === true) {
        setHasAccess(true);
        return;
      }

      // 2. Checa entitlement normal
      const [entRes, statusRes] = await Promise.all([
        supabase.rpc("has_entitlement", { p_product: product }),
        supabase.rpc("get_my_free_activation_status"),
      ]);

      setHasAccess(entRes.data === true);

      if (!entRes.data && statusRes.data) {
        const row = statusRes.data.find((r) => r.product === product);
        setEndsAt(row?.activation_ends_at ?? null);
      }
    } catch (error) {
      console.error("Erro ao verificar acesso:", error);
      setHasAccess(true); // fail-open
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

  if (!hasAccess) {
    return (
      <ProductExpiredScreen
        productLabel={PRODUCT_LABELS[product]}
        endsAt={endsAt}
      />
    );
  }

  return <>{children}</>;
}
