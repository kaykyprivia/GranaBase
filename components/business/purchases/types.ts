import type {
  BusinessAuditLog,
  BusinessInventoryMovement,
  BusinessProduct,
  BusinessPurchaseItem,
  BusinessPurchaseOrder,
} from "@/types/database";

export type BusinessWorkspaceContext = {
  userId: string;
  workspaceId: string;
  workspaceName: string;
};

export type PurchaseLine = {
  item: BusinessPurchaseItem;
  product: BusinessProduct | null;
};

export type PurchaseRow = BusinessPurchaseOrder & {
  items: PurchaseLine[];
  item: BusinessPurchaseItem | null;
  product: BusinessProduct | null;
};

export type PurchaseReceiptInput = {
  purchase_item_id: string;
  quantity: number;
};
export type PurchaseDetail = PurchaseRow & {
  movements: BusinessInventoryMovement[];
  auditLogs: BusinessAuditLog[];
};

export type PurchaseCreateResult = {
  purchase_order_id: string;
  purchase_item_id: string;
  product_id?: string;
  status: string;
  total_cost: number;
  real_unit_cost: number;
};

export type WorkspaceRpcResult = {
  workspace_id: string;
  name: string;
};
