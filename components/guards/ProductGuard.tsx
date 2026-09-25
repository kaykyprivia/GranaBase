"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ProductExpiredScreen } from "./ProductExpiredScreen";

type Product = "personal" | "business";

interface ProductGuardProps {
  product: Product;
  productLabel: string;
  children: React.ReactNode;
}

export function ProductGuard({
  product,
  productLabel,
  children,
}: ProductGuardProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(true);
  const [endsAt, setEndsAt] = useState<string | null>(null);

  const checkAccess = useCallback(async () => {
    setLoading(true);
    try {
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
      setHasAccess(true); // fail-open para nao travar a UI por erro de rede
    } finally {
      setLoading(false);
    }
  }, [supabase, product]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!hasAccess) {
    return <ProductExpiredScreen productLabel={productLabel} endsAt={endsAt} />;
  }

  return <>{children}</>;
}
