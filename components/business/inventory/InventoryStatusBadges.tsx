"use client";

import { Badge } from "@/components/ui/badge";
import {
  getInventoryIntelligenceMeta,
  getInventoryStatusTags,
  type InventoryIntelligenceItem,
  type InventoryItem,
} from "@/lib/business-inventory";

type InventoryStatusBadgesProps = {
  item: InventoryItem | InventoryIntelligenceItem;
};

function hasInventoryIntelligence(
  item: InventoryItem | InventoryIntelligenceItem
): item is InventoryIntelligenceItem {
  return "intelligence_status" in item;
}

export function InventoryStatusBadges({ item }: InventoryStatusBadgesProps) {
  const intelligence =
    hasInventoryIntelligence(item) && item.intelligence_status !== "out_of_stock"
      ? getInventoryIntelligenceMeta(item.intelligence_status)
      : null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {getInventoryStatusTags(item).map((status) => (
        <Badge key={status.key} variant={status.tone}>
          {status.label}
        </Badge>
      ))}

      {intelligence && (
        <Badge variant={intelligence.tone}>
          {intelligence.label}
        </Badge>
      )}
    </div>
  );
}