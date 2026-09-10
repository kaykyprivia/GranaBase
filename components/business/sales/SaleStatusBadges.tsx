"use client";

import { Badge } from "@/components/ui/badge";
import { getSalePaymentStatusMeta, getSaleStatusMeta } from "@/lib/business-sales";
import type { BusinessSaleOrderStatus, BusinessSalePaymentStatus } from "@/types/database";

type BadgeVariant = "default" | "profit" | "expense" | "warning" | "secondary";

export function SaleOrderStatusBadge({ status }: { status: BusinessSaleOrderStatus }) {
  const meta = getSaleStatusMeta(status);
  return (
    <Badge variant={meta.tone as BadgeVariant} title={meta.description}>
      {meta.label}
    </Badge>
  );
}

export function SalePaymentStatusBadge({ status }: { status: BusinessSalePaymentStatus }) {
  const meta = getSalePaymentStatusMeta(status);
  return (
    <Badge variant={meta.tone as BadgeVariant} title={meta.description}>
      {meta.label}
    </Badge>
  );
}
