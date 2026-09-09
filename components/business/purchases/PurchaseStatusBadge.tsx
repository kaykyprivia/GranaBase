import { Badge } from "@/components/ui/badge";
import { getPurchaseStatusMeta } from "@/lib/business-purchases";
import type { BusinessPurchaseOrderStatus } from "@/types/database";

export function PurchaseStatusBadge({ status }: { status: BusinessPurchaseOrderStatus }) {
  const meta = getPurchaseStatusMeta(status);

  return (
    <Badge variant={meta.tone === "secondary" ? "secondary" : meta.tone} className="whitespace-nowrap">
      {meta.label}
    </Badge>
  );
}
