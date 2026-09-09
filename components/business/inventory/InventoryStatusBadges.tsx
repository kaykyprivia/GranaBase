"use client";

import { Badge } from "@/components/ui/badge";
import { getInventoryStatusTags, type InventoryItem } from "@/lib/business-inventory";

type InventoryStatusBadgesProps = {
  item: InventoryItem;
};

export function InventoryStatusBadges({ item }: InventoryStatusBadgesProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {getInventoryStatusTags(item).map((status) => (
        <Badge key={status.key} variant={status.tone}>
          {status.label}
        </Badge>
      ))}
    </div>
  );
}
