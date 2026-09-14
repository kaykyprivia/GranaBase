import type {
  BusinessInventoryLot,
  BusinessInventoryMovement,
  BusinessInventorySummary,
  BusinessProduct,
} from "@/types/database";

export type WorkspaceRpcResult = {
  workspace_id: string;
  name: string;
};

export type InventoryLotWithOrigin = BusinessInventoryLot & {
  origin: string | null;
  purchase_order_id: string | null;
};

export type InventoryProductDetail = {
  product: BusinessProduct;
  summary: BusinessInventorySummary | null;
  lots: InventoryLotWithOrigin[];
  lotsCount: number;
  movements: BusinessInventoryMovement[];
  movementsCount: number;
};
