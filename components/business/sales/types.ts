import type {
  BusinessAuditLog,
  BusinessCustomer,
  BusinessInventoryMovement,
  BusinessInventorySummary,
  BusinessPayment,
  BusinessProduct,
  BusinessSale,
  BusinessSaleItem,
  BusinessSaleReturn,
  BusinessSaleReturnItem,
} from "@/types/database";

export type WorkspaceRpcResult = {
  workspace_id: string;
  name: string;
};

export type SaleItemRow = BusinessSaleItem & {
  product: BusinessProduct | BusinessInventorySummary | null;
  returnedQuantity: number;
};

export type SaleRow = BusinessSale & {
  customer: BusinessCustomer | null;
  items: SaleItemRow[];
  payments: BusinessPayment[];
  returns?: BusinessSaleReturn[];
  returnItems?: BusinessSaleReturnItem[];
};

export type SaleDetail = SaleRow & {
  auditLogs: BusinessAuditLog[];
  movements: BusinessInventoryMovement[];
  returns: BusinessSaleReturn[];
  returnItems: BusinessSaleReturnItem[];
};

export type SaleCreateResult = {
  sale_id: string;
  status: string;
  reserve?: unknown;
};
