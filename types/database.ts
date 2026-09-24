export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type BillStatus = "pending" | "paid" | "overdue";
export type ReceivableStatus = "pending" | "received" | "overdue";
export type InstallmentStatus = "pending" | "paid" | "paid_with_discount";
export type ConsortiumStatus = "active" | "completed" | "cancelled";
export type ConsortiumPaymentStatus = "pending" | "paid" | "paid_with_discount";
type GoalStatus = "active" | "completed" | "paused";
type InvestmentContributionType = "deposit" | "withdraw";
export type BusinessPurchaseOrderStatus =
  | "DRAFT"
  | "PURCHASED"
  | "IN_TRANSIT"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";
export type BusinessPurchaseOrderPaymentStatus =
  | "PENDING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "REFUNDED";
export type BusinessPurchasePaymentStatus =
  | "PAID"
  | "REFUNDED";
export type BusinessSaleOrderStatus =
  | "DRAFT"
  | "RESERVED"
  | "SEPARATED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURNED";
export type BusinessSalePaymentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "REFUNDED";
export type BusinessSalesChannel = "UNSPECIFIED" | "IN_PERSON" | "WHATSAPP" | "INSTAGRAM" | "FACEBOOK_MARKETPLACE" | "SHOPEE" | "MERCADO_LIVRE" | "WEBSITE" | "OTHER";
export type BusinessDeliveryMethod = "UNSPECIFIED" | "OWN_DELIVERY" | "COURIER_APP" | "CUSTOMER_PICKUP" | "SHIPPING_CARRIER" | "OTHER";
export type BusinessAllocationStatus = "RESERVED" | "RELEASED" | "CONSUMED" | "RETURNED";
export type BusinessInventoryMovementType =
  | "PURCHASE_RECEIPT"
  | "SALE_OUT"
  | "CUSTOMER_RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "LOSS"
  | "DAMAGED";
export type BusinessPaymentStatus = "PENDING" | "PAID" | "REFUNDED";
export type BusinessExpenseCategory =
  | "gasolina"
  | "embalagem"
  | "anuncios"
  | "entrega"
  | "manutencao"
  | "taxas"
  | "outras";
export type BusinessIdempotencyStatus = "PROCESSING" | "COMPLETED";

type TableDefinition<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          workspace_id: string | null;
          title: string;
          message: string;
          notification_type: string;
          severity: string;
          source_type: string | null;
          source_id: string | null;
          dedupe_key: string | null;
          action_url: string | null;
          metadata: Json;
          read_at: string | null;
          resolved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          workspace_id?: string | null;
          title: string;
          message: string;
          notification_type?: string;
          severity?: string;
          source_type?: string | null;
          source_id?: string | null;
          dedupe_key?: string | null;
          action_url?: string | null;
          metadata?: Json;
          read_at?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          workspace_id?: string | null;
          title?: string;
          message?: string;
          notification_type?: string;
          severity?: string;
          source_type?: string | null;
          source_id?: string | null;
          dedupe_key?: string | null;
          action_url?: string | null;
          metadata?: Json;
          read_at?: string | null;
          resolved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      entitlement_accounts: {
        Row: {
          user_id: string;
          status: "active" | "suspended" | "closed";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          status?: "active" | "suspended" | "closed";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          status?: "active" | "suspended" | "closed";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entitlement_accounts_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      entitlement_grants: {
        Row: {
          id: string;
          user_id: string;
          product: "personal" | "business";
          source:
            | "free"
            | "trial"
            | "bonus"
            | "referral"
            | "subscription"
            | "admin"
            | "legacy";
          status: "active" | "revoked";
          starts_at: string;
          ends_at: string | null;
          external_reference: string | null;
          metadata: Json;
          created_by: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product: "personal" | "business";
          source:
            | "free"
            | "trial"
            | "bonus"
            | "referral"
            | "subscription"
            | "admin"
            | "legacy";
          status?: "active" | "revoked";
          starts_at?: string;
          ends_at?: string | null;
          external_reference?: string | null;
          metadata?: Json;
          created_by?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product?: "personal" | "business";
          source?:
            | "free"
            | "trial"
            | "bonus"
            | "referral"
            | "subscription"
            | "admin"
            | "legacy";
          status?: "active" | "revoked";
          starts_at?: string;
          ends_at?: string | null;
          external_reference?: string | null;
          metadata?: Json;
          created_by?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "entitlement_grants_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "entitlement_accounts";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "entitlement_grants_created_by_fkey";
            columns: ["created_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "entitlement_grants_revoked_by_fkey";
            columns: ["revoked_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      user_settings: {
        Row: {
          user_id: string;
          phone: string | null;
          avatar_url: string | null;
          theme_preference: "dark" | "light";
          currency_format: "BRL" | "USD";
          privacy_mode: boolean;
          week_start: "monday" | "sunday";
          notifications_enabled: boolean;
          primary_currency: "BRL" | "USD";
          monthly_goal_default: number;
          default_expense_category: string;
          custom_categories: string[];
          plan: "free" | "pro";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          phone?: string | null;
          avatar_url?: string | null;
          theme_preference?: "dark" | "light";
          currency_format?: "BRL" | "USD";
          privacy_mode?: boolean;
          week_start?: "monday" | "sunday";
          notifications_enabled?: boolean;
          primary_currency?: "BRL" | "USD";
          monthly_goal_default?: number;
          default_expense_category?: string;
          custom_categories?: string[];
          plan?: "free" | "pro";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          phone?: string | null;
          avatar_url?: string | null;
          theme_preference?: "dark" | "light";
          currency_format?: "BRL" | "USD";
          privacy_mode?: boolean;
          week_start?: "monday" | "sunday";
          notifications_enabled?: boolean;
          primary_currency?: "BRL" | "USD";
          monthly_goal_default?: number;
          default_expense_category?: string;
          custom_categories?: string[];
          plan?: "free" | "pro";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      income_entries: {
        Row: {
          id: string;
          user_id: string;
          description: string;
          amount: number;
          category: string;
          received_at: string;
          payment_method: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          description: string;
          amount: number;
          category: string;
          received_at: string;
          payment_method?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          description?: string;
          amount?: number;
          category?: string;
          received_at?: string;
          payment_method?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "income_entries_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_entries: {
        Row: {
          id: string;
          user_id: string;
          description: string;
          amount: number;
          category: string;
          spent_at: string;
          payment_method: string | null;
          card_due_date: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          description: string;
          amount: number;
          category: string;
          spent_at: string;
          payment_method?: string | null;
          card_due_date?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          description?: string;
          amount?: number;
          category?: string;
          spent_at?: string;
          payment_method?: string | null;
          card_due_date?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_entries_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      bills: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          amount: number;
          due_date: string;
          status: BillStatus;
          category: string;
          is_recurring: boolean;
          paid_at: string | null;
          notes: string | null;
          created_at: string;
          generated_from_bill_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          amount: number;
          due_date: string;
          status?: BillStatus;
          category: string;
          is_recurring?: boolean;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          generated_from_bill_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          amount?: number;
          due_date?: string;
          status?: BillStatus;
          category?: string;
          is_recurring?: boolean;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          generated_from_bill_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bills_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      receivables: {
        Row: {
          id: string;
          user_id: string;
          description: string;
          amount: number;
          expected_date: string;
          status: ReceivableStatus;
          category: string;
          received_at: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          description: string;
          amount: number;
          expected_date: string;
          status?: ReceivableStatus;
          category: string;
          received_at?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          description?: string;
          amount?: number;
          expected_date?: string;
          status?: ReceivableStatus;
          category?: string;
          received_at?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "receivables_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      installments: {
        Row: {
          id: string;
          user_id: string;
          description: string;
          total_amount: number;
          installment_count: number;
          installment_amount: number;
          first_due_date: string;
          category: string | null;
          payment_method: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          description: string;
          total_amount: number;
          installment_count: number;
          installment_amount: number;
          first_due_date: string;
          category?: string | null;
          payment_method?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          description?: string;
          total_amount?: number;
          installment_count?: number;
          installment_amount?: number;
          first_due_date?: string;
          category?: string | null;
          payment_method?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "installments_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      installment_payments: {
        Row: {
          id: string;
          user_id: string;
          installment_id: string;
          installment_number: number;
          due_date: string;
          amount: number;
          paid_amount: number | null;
          status: InstallmentStatus;
          paid_at: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          installment_id: string;
          installment_number: number;
          due_date: string;
          amount: number;
          paid_amount?: number | null;
          status?: InstallmentStatus;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          installment_id?: string;
          installment_number?: number;
          due_date?: string;
          amount?: number;
          paid_amount?: number | null;
          status?: InstallmentStatus;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "installment_payments_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "installment_payments_installment_id_fkey";
            columns: ["installment_id"];
            referencedRelation: "installments";
            referencedColumns: ["id"];
          },
        ];
      };
      consortiums: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          holder_name: string;
          administrator: string | null;
          credit_amount: number;
          total_installments: number;
          current_installment_amount: number;
          first_due_date: string;
          initial_paid_installments: number;
          initial_paid_amount: number;
          due_day: number;
          status: ConsortiumStatus;
          contemplated: boolean;
          contemplated_at: string | null;
          bid_amount: number | null;
          administration_fee_percent: number | null;
          reserve_fund_percent: number | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          holder_name: string;
          administrator?: string | null;
          credit_amount: number;
          total_installments: number;
          current_installment_amount: number;
          first_due_date: string;
          initial_paid_installments?: number;
          initial_paid_amount?: number;
          due_day?: number;
          status?: ConsortiumStatus;
          contemplated?: boolean;
          contemplated_at?: string | null;
          bid_amount?: number | null;
          administration_fee_percent?: number | null;
          reserve_fund_percent?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          holder_name?: string;
          administrator?: string | null;
          credit_amount?: number;
          total_installments?: number;
          current_installment_amount?: number;
          first_due_date?: string;
          initial_paid_installments?: number;
          initial_paid_amount?: number;
          due_day?: number;
          status?: ConsortiumStatus;
          contemplated?: boolean;
          contemplated_at?: string | null;
          bid_amount?: number | null;
          administration_fee_percent?: number | null;
          reserve_fund_percent?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      consortium_payments: {
        Row: {
          id: string;
          user_id: string;
          consortium_id: string;
          installment_number: number;
          due_date: string;
          amount: number;
          status: ConsortiumPaymentStatus;
          paid_amount: number | null;
          paid_at: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          consortium_id: string;
          installment_number: number;
          due_date: string;
          amount: number;
          status?: ConsortiumPaymentStatus;
          paid_amount?: number | null;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          consortium_id?: string;
          installment_number?: number;
          due_date?: string;
          amount?: number;
          status?: ConsortiumPaymentStatus;
          paid_amount?: number | null;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consortium_payments_owner_fkey";
            columns: ["consortium_id", "user_id"];
            referencedRelation: "consortiums";
            referencedColumns: ["id", "user_id"];
          },
        ];
      };
      investments: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          amount: number;
          investment_type: string;
          invested_at: string;
          notes: string | null;
          ticker: string | null;
          quantity: number | null;
          sold_at: string | null;
          sold_amount: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          amount: number;
          investment_type: string;
          invested_at: string;
          notes?: string | null;
          ticker?: string | null;
          quantity?: number | null;
          sold_at?: string | null;
          sold_amount?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          amount?: number;
          investment_type?: string;
          invested_at?: string;
          notes?: string | null;
          ticker?: string | null;
          quantity?: number | null;
          sold_at?: string | null;
          sold_amount?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investments_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_dividends: {
        Row: {
          id: string;
          user_id: string;
          ticker: string;
          asset_name: string | null;
          amount: number;
          per_share: number | null;
          payment_date: string;
          label: "Dividendo" | "JCP" | "Rendimento" | "Outro";
          source: "manual" | "yahoo";
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          ticker: string;
          asset_name?: string | null;
          amount: number;
          per_share?: number | null;
          payment_date: string;
          label?: "Dividendo" | "JCP" | "Rendimento" | "Outro";
          source?: "manual" | "yahoo";
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          ticker?: string;
          asset_name?: string | null;
          amount?: number;
          per_share?: number | null;
          payment_date?: string;
          label?: "Dividendo" | "JCP" | "Rendimento" | "Outro";
          source?: "manual" | "yahoo";
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investment_dividends_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_wallets: {
        Row: {
          id: string;
          user_id: string;
          total_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          total_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          total_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investment_wallets_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      investment_contributions: {
        Row: {
          id: string;
          user_id: string;
          wallet_id: string;
          amount: number;
          type: InvestmentContributionType;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          wallet_id: string;
          amount: number;
          type: InvestmentContributionType;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          wallet_id?: string;
          amount?: number;
          type?: InvestmentContributionType;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "investment_contributions_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "investment_contributions_wallet_id_fkey";
            columns: ["wallet_id"];
            referencedRelation: "investment_wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      business_workspaces: TableDefinition<
        {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_operation_idempotency: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          operation: string;
          idempotency_key: string;
          request_hash: string;
          status: BusinessIdempotencyStatus;
          response: Json | null;
          created_at: string;
          completed_at: string | null;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          operation: string;
          idempotency_key: string;
          request_hash: string;
          status?: BusinessIdempotencyStatus;
          response?: Json | null;
          created_at?: string;
          completed_at?: string | null;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          operation?: string;
          idempotency_key?: string;
          request_hash?: string;
          status?: BusinessIdempotencyStatus;
          response?: Json | null;
          created_at?: string;
          completed_at?: string | null;
        }
      >;
      business_product_categories: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          name: string;
          normalized_name: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          name: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          name?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_products: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          name: string;
          sku: string | null;
          category_id: string | null;
          barcode: string | null;
          image_url: string | null;
          default_sale_price: number | null;
          minimum_stock: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          name: string;
          sku?: string | null;
          category_id?: string | null;
          barcode?: string | null;
          image_url?: string | null;
          default_sale_price?: number | null;
          minimum_stock?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          name?: string;
          sku?: string | null;
          category_id?: string | null;
          barcode?: string | null;
          image_url?: string | null;
          default_sale_price?: number | null;
          minimum_stock?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_purchase_orders: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          purchase_date: string;
          expected_arrival_date: string | null;
          origin: string | null;
          product_subtotal: number;
          shipping_cost: number;
          additional_costs: number;
          total_cost: number;
          status: BusinessPurchaseOrderStatus;
          payment_status: BusinessPurchaseOrderPaymentStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          purchase_date?: string;
          expected_arrival_date?: string | null;
          origin?: string | null;
          product_subtotal?: number;
          shipping_cost?: number;
          additional_costs?: number;
          total_cost?: number;
          status?: BusinessPurchaseOrderStatus;
          payment_status?: BusinessPurchaseOrderPaymentStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          purchase_date?: string;
          expected_arrival_date?: string | null;
          origin?: string | null;
          product_subtotal?: number;
          shipping_cost?: number;
          additional_costs?: number;
          total_cost?: number;
          status?: BusinessPurchaseOrderStatus;
          payment_status?: BusinessPurchaseOrderPaymentStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_purchase_items: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          purchase_order_id: string;
          product_id: string;
          quantity_ordered: number;
          quantity_received: number;
          unit_purchase_cost: number;
          allocated_extra_cost: number;
          real_unit_cost: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          purchase_order_id: string;
          product_id: string;
          quantity_ordered: number;
          quantity_received?: number;
          unit_purchase_cost: number;
          allocated_extra_cost?: number;
          real_unit_cost: number;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          purchase_order_id?: string;
          product_id?: string;
          quantity_ordered?: number;
          quantity_received?: number;
          unit_purchase_cost?: number;
          allocated_extra_cost?: number;
          real_unit_cost?: number;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_inventory_lots: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          product_id: string;
          purchase_item_id: string | null;
          received_quantity: number;
          remaining_quantity: number;
          reserved_quantity: number;
          unit_cost: number;
          received_at: string;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          product_id: string;
          purchase_item_id?: string | null;
          received_quantity: number;
          remaining_quantity: number;
          reserved_quantity?: number;
          unit_cost: number;
          received_at?: string;
          created_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          product_id?: string;
          purchase_item_id?: string | null;
          received_quantity?: number;
          remaining_quantity?: number;
          reserved_quantity?: number;
          unit_cost?: number;
          received_at?: string;
          created_at?: string;
        }
      >;
      business_customers: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          name: string;
          whatsapp: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          name: string;
          whatsapp?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          name?: string;
          whatsapp?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_sales: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          sale_number: number;
          customer_id: string | null;
          order_status: BusinessSaleOrderStatus;
          payment_status: BusinessSalePaymentStatus;
          sales_channel: BusinessSalesChannel;
          delivery_method: BusinessDeliveryMethod;
          delivery_fee: number;
          delivery_cost: number;
          sale_date: string;
          delivered_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          sale_number?: number;
          customer_id?: string | null;
          order_status?: BusinessSaleOrderStatus;
          payment_status?: BusinessSalePaymentStatus;
          sales_channel?: BusinessSalesChannel;
          delivery_method?: BusinessDeliveryMethod;
          delivery_fee?: number;
          delivery_cost?: number;
          sale_date?: string;
          delivered_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          sale_number?: number;
          customer_id?: string | null;
          order_status?: BusinessSaleOrderStatus;
          payment_status?: BusinessSalePaymentStatus;
          sales_channel?: BusinessSalesChannel;
          delivery_method?: BusinessDeliveryMethod;
          delivery_fee?: number;
          delivery_cost?: number;
          sale_date?: string;
          delivered_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_sale_items: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          sale_id: string;
          product_id: string;
          quantity: number;
          unit_sale_price: number;
          gross_amount: number;
          discount_amount: number;
          final_amount: number;
          platform_fee: number;
          shipping_cost: number;
          additional_costs: number;
          cogs_amount: number;
          gross_profit: number;
          net_profit: number;
          margin_pct: number | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          sale_id: string;
          product_id: string;
          quantity: number;
          unit_sale_price: number;
          gross_amount: number;
          discount_amount?: number;
          final_amount: number;
          platform_fee?: number;
          shipping_cost?: number;
          additional_costs?: number;
          cogs_amount?: number;
          gross_profit?: number;
          net_profit?: number;
          margin_pct?: number | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          sale_id?: string;
          product_id?: string;
          quantity?: number;
          unit_sale_price?: number;
          gross_amount?: number;
          discount_amount?: number;
          final_amount?: number;
          platform_fee?: number;
          shipping_cost?: number;
          additional_costs?: number;
          cogs_amount?: number;
          gross_profit?: number;
          net_profit?: number;
          margin_pct?: number | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_sale_item_allocations: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          sale_item_id: string;
          inventory_lot_id: string;
          quantity: number;
          returned_quantity: number;
          unit_cost: number;
          status: BusinessAllocationStatus;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          sale_item_id: string;
          inventory_lot_id: string;
          quantity: number;
          returned_quantity?: number;
          unit_cost: number;
          status?: BusinessAllocationStatus;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          sale_item_id?: string;
          inventory_lot_id?: string;
          quantity?: number;
          returned_quantity?: number;
          unit_cost?: number;
          status?: BusinessAllocationStatus;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_inventory_movements: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          product_id: string;
          inventory_lot_id: string | null;
          movement_type: BusinessInventoryMovementType;
          quantity_delta: number;
          unit_cost: number;
          total_cost: number;
          reference_type: string | null;
          reference_id: string | null;
          notes: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          product_id: string;
          inventory_lot_id?: string | null;
          movement_type: BusinessInventoryMovementType;
          quantity_delta: number;
          unit_cost?: number;
          total_cost?: number;
          reference_type?: string | null;
          reference_id?: string | null;
          notes?: string | null;
          created_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          product_id?: string;
          inventory_lot_id?: string | null;
          movement_type?: BusinessInventoryMovementType;
          quantity_delta?: number;
          unit_cost?: number;
          total_cost?: number;
          reference_type?: string | null;
          reference_id?: string | null;
          notes?: string | null;
          created_at?: string;
        }
      >;
      business_purchase_payments: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          purchase_order_id: string;
          amount: number;
          payment_method: string | null;
          status: BusinessPurchasePaymentStatus;
          paid_at: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          purchase_order_id: string;
          amount: number;
          payment_method?: string | null;
          status: BusinessPurchasePaymentStatus;
          paid_at?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          purchase_order_id?: string;
          amount?: number;
          payment_method?: string | null;
          status?: BusinessPurchasePaymentStatus;
          paid_at?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_payments: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          sale_id: string;
          amount: number;
          payment_method: string | null;
          status: BusinessPaymentStatus;
          paid_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          sale_id: string;
          amount: number;
          payment_method?: string | null;
          status?: BusinessPaymentStatus;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          sale_id?: string;
          amount?: number;
          payment_method?: string | null;
          status?: BusinessPaymentStatus;
          paid_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_sale_returns: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          sale_id: string;
          refund_amount: number;
          notes: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          sale_id: string;
          refund_amount?: number;
          notes?: string | null;
          created_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          sale_id?: string;
          refund_amount?: number;
          notes?: string | null;
          created_at?: string;
        }
      >;
      business_sale_return_items: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          return_id: string;
          sale_item_id: string;
          product_id: string;
          quantity: number;
          restockable: boolean;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          return_id: string;
          sale_item_id: string;
          product_id: string;
          quantity: number;
          restockable?: boolean;
          created_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          return_id?: string;
          sale_item_id?: string;
          product_id?: string;
          quantity?: number;
          restockable?: boolean;
          created_at?: string;
        }
      >;
      business_expenses: TableDefinition<
        {
          id: string;
          user_id: string;
          workspace_id: string;
          description: string;
          category: BusinessExpenseCategory;
          amount: number;
          spent_at: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          workspace_id: string;
          description: string;
          category: BusinessExpenseCategory;
          amount: number;
          spent_at?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          workspace_id?: string;
          description?: string;
          category?: BusinessExpenseCategory;
          amount?: number;
          spent_at?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_audit_logs: TableDefinition<
        {
          id: string;
          user_id: string;
          actor_user_id: string;
          workspace_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          metadata: Json;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          actor_user_id: string;
          workspace_id: string;
          entity_type: string;
          entity_id: string;
          action: string;
          metadata?: Json;
          created_at?: string;
        },
        {
          id?: string;
          user_id?: string;
          actor_user_id?: string;
          workspace_id?: string;
          entity_type?: string;
          entity_id?: string;
          action?: string;
          metadata?: Json;
          created_at?: string;
        }
      >;
      financial_goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_amount: number;
          deadline: string | null;
          status: GoalStatus;
          category: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          target_amount: number;
          deadline?: string | null;
          status?: GoalStatus;
          category: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          target_amount?: number;
          deadline?: string | null;
          status?: GoalStatus;
          category?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_goals_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      business_cash_flow_events: {
        Row: {
          user_id: string | null;
          workspace_id: string | null;
          event_id: string | null;
          occurred_at: string | null;
          event_date: string | null;
          direction: string | null;
          category: string | null;
          amount: number | null;
          signed_amount: number | null;
          title: string | null;
          source_type: string | null;
          source_id: string | null;
          reference_id: string | null;
          payment_method: string | null;
        };
        Relationships: [];
      };
      business_inventory_summary: {
        Row: {
          product_id: string;
          user_id: string;
          workspace_id: string;
          name: string;
          sku: string | null;
          category_id: string | null;
          category_name: string | null;
          default_sale_price: number | null;
          minimum_stock: number;
          on_hand: number;
          reserved: number;
          available: number;
          in_transit: number;
          inventory_value: number;
          average_unit_cost: number;
          estimated_profit: number;
          barcode: string | null;
          image_url: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
          last_movement_at: string | null;
          total_purchased: number;
          total_received: number;
          total_sold: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_my_entitlements: {
        Args: Record<PropertyKey, never>;
        Returns: {
          product: "personal" | "business";
          has_access: boolean;
          access_until: string | null;
          sources: string[];
          account_status: "active" | "suspended" | "closed" | "missing";
          evaluated_at: string;
        }[];
      };
      has_entitlement: {
        Args: {
          p_product: "personal" | "business";
        };
        Returns: boolean;
      };
      create_consortium: {
        Args: {
          p_name: string;
          p_holder_name: string;
          p_credit_amount: number;
          p_total_installments: number;
          p_current_installment_amount: number;
          p_first_due_date: string;
          p_administrator?: string | null;
          p_administration_fee_percent?: number | null;
          p_reserve_fund_percent?: number | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      create_consortium_v2: {
        Args: {
          p_name: string;
          p_holder_name: string;
          p_credit_amount: number;
          p_total_installments: number;
          p_current_installment_amount: number;
          p_current_installment_number: number;
          p_current_due_date: string;
          p_initial_paid_amount?: number;
          p_due_day?: number | null;
          p_administrator?: string | null;
          p_administration_fee_percent?: number | null;
          p_reserve_fund_percent?: number | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      pay_consortium_payment: {
        Args: {
          p_payment_id: string;
          p_paid_amount: number;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      mark_notification_read: {
        Args: {
          notification_id: string;
        };
        Returns: void;
      };
      mark_all_notifications_read: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      sync_business_notifications: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      delete_my_account: {
        Args: Record<PropertyKey, never>;
        Returns: void;
      };
      adjust_business_inventory: {
        Args: {
          p_workspace_id: string;
          p_product_id: string;
          p_quantity_delta: number;
          p_movement_type: BusinessInventoryMovementType;
          p_reason: string;
          p_idempotency_key: string;
          p_unit_cost?: number;
        };
        Returns: Json;
      };
      advance_business_sale_status: {
        Args: {
          p_sale_id: string;
          p_next_status: Extract<BusinessSaleOrderStatus, "SEPARATED" | "SHIPPED">;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      cancel_business_sale: {
        Args: {
          p_sale_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      cancel_business_purchase: {
        Args: {
          p_purchase_order_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      create_business_purchase: {
        Args: {
          p_workspace_id: string;
          p_product_id: string;
          p_quantity: number;
          p_unit_purchase_cost: number;
          p_idempotency_key: string;
          p_shipping_cost?: number;
          p_additional_costs?: number;
          p_purchase_date?: string;
          p_expected_arrival_date?: string | null;
          p_origin?: string | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      create_business_purchase_multi: {
        Args: {
          p_workspace_id: string;
          p_items: Json;
          p_idempotency_key: string;
          p_shipping_cost?: number;
          p_additional_costs?: number;
          p_purchase_date?: string;
          p_expected_arrival_date?: string | null;
          p_origin?: string | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };      create_business_product_and_purchase: {
        Args: {
          p_workspace_id: string;
          p_product_name: string;
          p_quantity: number;
          p_unit_purchase_cost: number;
          p_idempotency_key: string;
          p_product_sku?: string | null;
          p_default_sale_price?: number | null;
          p_minimum_stock?: number;
          p_shipping_cost?: number;
          p_additional_costs?: number;
          p_purchase_date?: string;
          p_expected_arrival_date?: string | null;
          p_origin?: string | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      create_business_sale: {
        Args: {
          p_workspace_id: string;
          p_items: Json;
          p_idempotency_key: string;
          p_customer_id?: string | null;
          p_sale_date?: string;
          p_notes?: string | null;
          p_reserve?: boolean;
          p_sales_channel?: BusinessSalesChannel;
          p_delivery_fee?: number;
          p_delivery_cost?: number;
          p_delivery_method?: BusinessDeliveryMethod;
        };
        Returns: Json;
      };
      deliver_business_sale: {
        Args: {
          p_sale_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      record_business_expense: {
        Args: {
          p_workspace_id: string;
          p_description: string;
          p_category: BusinessExpenseCategory;
          p_amount: number;
          p_idempotency_key: string;
          p_spent_at?: string;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      update_business_expense: {
        Args: {
          p_workspace_id: string;
          p_expense_id: string;
          p_description: string;
          p_category: BusinessExpenseCategory;
          p_amount: number;
          p_idempotency_key: string;
          p_spent_at: string;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      delete_business_expense: {
        Args: {
          p_workspace_id: string;
          p_expense_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      record_business_purchase_payment: {
        Args: {
          p_purchase_order_id: string;
          p_amount: number;
          p_idempotency_key: string;
          p_payment_method?: string | null;
          p_status?: BusinessPurchasePaymentStatus;
          p_paid_at?: string;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      record_business_payment: {
        Args: {
          p_sale_id: string;
          p_amount: number;
          p_idempotency_key: string;
          p_payment_method?: string | null;
          p_status?: Extract<BusinessPaymentStatus, "PAID" | "REFUNDED">;
          p_paid_at?: string;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      create_investment: {
        Args: {
          p_name: string;
          p_amount: number;
          p_investment_type: string;
          p_invested_at: string;
          p_ticker?: string | null;
          p_quantity?: number | null;
          p_notes?: string | null;
        };
        Returns: string;
      };
      update_investment: {
        Args: {
          p_investment_id: string;
          p_name: string;
          p_amount: number;
          p_investment_type: string;
          p_invested_at: string;
          p_ticker?: string | null;
          p_quantity?: number | null;
          p_notes?: string | null;
        };
        Returns: void;
      };
      delete_investment: {
        Args: {
          p_investment_id: string;
        };
        Returns: void;
      };
      sell_investment: {
        Args: {
          p_investment_id: string;
          p_sold_amount?: number | null;
        };
        Returns: void;
      };
      record_investment_contribution: {
        Args: {
          p_amount: number;
          p_type: InvestmentContributionType;
          p_description?: string | null;
        };
        Returns: string;
      };
      get_or_create_business_workspace: {
        Args: {
          p_name?: string;
        };
        Returns: Json;
      };
      get_business_cash_flow: {
        Args: {
          p_workspace_id: string;
          p_start_date?: string | null;
          p_end_date?: string | null;
          p_limit?: number;
        };
        Returns: Json;
      };
      get_business_customers_page: {
        Args: {
          p_workspace_id: string;
          p_page?: number;
          p_page_size?: number;
          p_search?: string | null;
          p_purchase_filter?: "all" | "buyers" | "recurring" | "no_orders";
          p_contact_filter?: "all" | "with_whatsapp" | "without_whatsapp";
          p_sort?: "recent" | "name" | "orders_desc" | "value_desc" | "last_purchase_desc";
        };
        Returns: Json;
      };
      get_business_customer_360: {
        Args: {
          p_workspace_id: string;
          p_customer_id: string;
          p_page?: number;
          p_page_size?: number;
        };
        Returns: Json;
      };
      get_business_expenses_page: {
        Args: {
          p_workspace_id: string;
          p_page?: number;
          p_page_size?: number;
          p_category?: "all" | BusinessExpenseCategory;
          p_start_date?: string | null;
          p_end_date?: string | null;
          p_search?: string | null;
        };
        Returns: Json;
      };
      get_business_inventory_page: {
        Args: {
          p_workspace_id: string;
          p_page?: number;
          p_page_size?: number;
          p_filter?: "all" | "available" | "low" | "empty" | "reserved" | "in_transit" | "reorder" | "no_recent_turnover";
          p_sort?: "name" | "stock_desc" | "stock_asc" | "capital_desc" | "cost_desc" | "recent" | "coverage_asc" | "velocity_desc" | "reorder_desc";
          p_search?: string | null;
          p_category_id?: string | null;
          p_window_days?: number;
          p_target_days?: number;
        };
        Returns: Json;
      };
      search_business_inventory_products: {
        Args: {
          p_workspace_id: string;
          p_search?: string | null;
          p_limit?: number;
        };
        Returns: Json;
      };
      search_business_customers: {
        Args: {
          p_workspace_id: string;
          p_search?: string | null;
          p_limit?: number;
        };
        Returns: Json;
      };
      get_business_dashboard_operations: {
        Args: {
          p_workspace_id: string;
          p_period?: "month" | "3m" | "6m" | "12m" | "all";
          p_today?: string;
        };
        Returns: Json;
      };
      get_business_reports_analytics: {
        Args: {
          p_workspace_id: string;
          p_period?: "month" | "3m" | "6m" | "12m" | "all";
          p_today?: string;
            p_custom_start?: string | null;
            p_custom_end?: string | null;
        };
        Returns: Json;
      };
      get_business_sales_page: {
        Args: {
          p_workspace_id: string;
          p_page?: number;
          p_page_size?: number;
          p_status?: "all" | "open" | BusinessSaleOrderStatus;
          p_payment_status?: "all" | BusinessSalePaymentStatus;
          p_start_date?: string | null;
          p_end_date?: string | null;
          p_search?: string | null;
          p_sales_channel?: "all" | BusinessSalesChannel;
          p_delivery_method?: "all" | BusinessDeliveryMethod;
        };
        Returns: Json;
      };
      get_business_sales_summary: {
        Args: {
          p_workspace_id: string;
          p_status?: "all" | "open" | BusinessSaleOrderStatus;
          p_payment_status?: "all" | BusinessSalePaymentStatus;
          p_start_date?: string | null;
          p_end_date?: string | null;
          p_search?: string | null;
          p_sales_channel?: "all" | BusinessSalesChannel;
          p_delivery_method?: "all" | BusinessDeliveryMethod;
        };
        Returns: Json;
      };
      update_business_purchase_multi: {
        Args: {
          p_purchase_order_id: string;
          p_items: Json;
          p_idempotency_key: string;
          p_shipping_cost?: number;
          p_additional_costs?: number;
          p_purchase_date?: string | null;
          p_expected_arrival_date?: string | null;
          p_origin?: string | null;
          p_notes?: string | null;
          p_clear_expected_arrival_date?: boolean;
          p_clear_origin?: boolean;
          p_clear_notes?: boolean;
        };
        Returns: Json;
      };      receive_business_purchase_items: {
        Args: {
          p_purchase_order_id: string;
          p_items: Json;
          p_idempotency_key: string;
        };
        Returns: Json;
      };      receive_business_purchase: {
        Args: {
          p_purchase_order_id: string;
          p_idempotency_key: string;
          p_quantity?: number | null;
        };
        Returns: Json;
      };
      reserve_business_sale: {
        Args: {
          p_sale_id: string;
          p_idempotency_key: string;
        };
        Returns: Json;
      };
      return_business_sale: {
        Args: {
          p_sale_id: string;
          p_items: Json;
          p_idempotency_key: string;
          p_refund_amount?: number;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      sync_financial_goals_with_wallet: {
        Args: {
          p_user_id: string;
        };
        Returns: void;
      };
      update_business_purchase: {
        Args: {
          p_purchase_order_id: string;
          p_idempotency_key: string;
          p_quantity?: number | null;
          p_unit_purchase_cost?: number | null;
          p_shipping_cost?: number | null;
          p_additional_costs?: number | null;
          p_purchase_date?: string | null;
          p_expected_arrival_date?: string | null;
          p_origin?: string | null;
          p_notes?: string | null;
          p_clear_expected_arrival_date?: boolean;
          p_clear_origin?: boolean;
          p_clear_notes?: boolean;
        };
        Returns: Json;
      };
      update_business_product_metadata: {
        Args: {
          p_workspace_id: string;
          p_product_id: string;
          p_idempotency_key: string;
          p_name: string;
          p_sku?: string | null;
          p_default_sale_price?: number | null;
          p_minimum_stock?: number;
          p_active?: boolean;
          p_category_id?: string | null;
          p_category_name?: string | null;
        };
        Returns: Json;
      };
      attribute_my_referral: {
        Args: { p_referral_code: string };
        Returns: string;
      };
      create_income_entry: {
        Args: {
          p_payload: {
            description: string;
            amount: number;
            category: string;
            received_at: string;
            payment_method: string | null;
            notes: string | null;
          };
        };
        Returns: string;
      };
      update_income_entry: {
        Args: {
          p_id: string;
          p_payload: {
            description?: string;
            amount?: number;
            category?: string;
            received_at?: string;
            payment_method?: string | null;
            notes?: string | null;
          };
        };
        Returns: void;
      };
      delete_income_entry: {
        Args: { p_id: string };
        Returns: void;
      };
      create_expense_entry: {
        Args: {
          p_payload: {
            description: string;
            amount: number;
            category: string;
            spent_at: string;
            payment_method: string | null;
            card_due_date: string | null;
            notes: string | null;
          };
        };
        Returns: string;
      };
      update_expense_entry: {
        Args: {
          p_id: string;
          p_payload: {
            description?: string;
            amount?: number;
            category?: string;
            spent_at?: string;
            payment_method?: string | null;
            card_due_date?: string | null;
            notes?: string | null;
          };
        };
        Returns: void;
      };
      delete_expense_entry: {
        Args: { p_id: string };
        Returns: void;
      };
      create_bill: {
        Args: {
          p_payload: {
            name: string;
            amount: number;
            due_date: string;
            category: string;
            status?: string;
            is_recurring?: boolean;
            paid_at?: string | null;
            notes?: string | null;
            generated_from_bill_id?: string | null;
          };
        };
        Returns: string;
      };
      update_bill: {
        Args: {
          p_id: string;
          p_payload: {
            name?: string;
            amount?: number;
            due_date?: string;
            category?: string;
            status?: string;
            paid_at?: string | null;
          };
        };
        Returns: void;
      };
      delete_bill: {
        Args: { p_id: string };
        Returns: void;
      };
      create_financial_goal: {
        Args: {
          p_payload: {
            name: string;
            target_amount: number;
            deadline: string | null;
            category: string;
            notes: string | null;
            status: string;
          };
        };
        Returns: string;
      };
      update_financial_goal: {
        Args: {
          p_id: string;
          p_payload: {
            name?: string;
            target_amount?: number;
            deadline?: string | null;
            category?: string;
            notes?: string | null;
            status?: string;
          };
        };
        Returns: void;
      };
      delete_financial_goal: {
        Args: { p_id: string };
        Returns: void;
      };
      create_receivable: {
        Args: {
          p_payload: {
            description: string;
            amount: number;
            expected_date: string;
            category: string;
            notes: string | null;
            status: string;
          };
        };
        Returns: string;
      };
      update_receivable: {
        Args: {
          p_id: string;
          p_payload: {
            description?: string;
            amount?: number;
            expected_date?: string;
            category?: string;
            notes?: string | null;
            status?: string;
            received_at?: string | null;
          };
        };
        Returns: void;
      };
      delete_receivable: {
        Args: { p_id: string };
        Returns: void;
      };
      update_installment_payment: {
        Args: {
          p_id: string;
          p_payload: {
            status?: string;
            paid_at?: string | null;
            paid_amount?: number | null;
            amount?: number | null;
            due_date?: string | null;
            notes?: string | null;
          };
        };
        Returns: void;
      };
      delete_installment: {
        Args: { p_id: string };
        Returns: void;
      };
      get_or_create_my_referral_code: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      list_my_referrals: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          referral_id: string;
          referred_user_id: string;
          referred_display_name: string | null;
          referral_code: string;
          attributed_at: string;
          has_active_subscription: boolean;
          active_plan_type: string | null;
          converted_at: string | null;
          commission_earned: number;
        }>;
      };
      get_my_referral_stats: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          total_signups: number;
          total_bonus_grants: number;
          last_signup_at: string | null;
        }>;
      };
      list_my_referral_commissions: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          commission_id: string;
          referred_user_id: string;
          plan_type: string;
          referrer_plan_at_event: string;
          commission_rate: number;
          base_amount: number;
          commission_amount: number;
          status: string;
          available_at: string | null;
          paid_at: string | null;
          cancelled_at: string | null;
          created_at: string;
        }>;
      };
      get_my_commission_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          pending_total: number;
          available_total: number;
          paid_total: number;
          cancelled_total: number;
          can_withdraw: boolean;
          minimum_withdrawal: number;
        }>;
      };
      get_my_subscription: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          subscription_id: string;
          plan: string;
          access_level: string;
          status: string;
          started_at: string;
          current_period_start: string;
          current_period_end: string;
          cancelled_at: string | null;
          provider: string;
          days_remaining: number;
        }>;
      };
      list_my_subscription_payments: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          payment_id: string;
          plan_type: string;
          amount: number;
          status: string;
          mp_preapproval_id: string | null;
          mp_payment_id: string | null;
          environment: string;
          created_at: string;
          updated_at: string;
        }>;
      };
      get_my_withdrawal_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          available_total: number;
          reserved_total: number;
          paid_total: number;
          can_withdraw: boolean;
          minimum_withdrawal: number;
          has_pending_request: boolean;
        }>;
      };
      list_my_withdrawal_requests: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          request_id: string;
          amount: number;
          pix_key: string;
          pix_key_type: string;
          status: string;
          requested_at: string;
          processing_started_at: string | null;
          paid_at: string | null;
          cancelled_at: string | null;
          cancelled_reason: string | null;
          admin_notes: string | null;
          payment_reference: string | null;
        }>;
      };
      is_super_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      create_installment_with_payments: {
        Args: {
          p_payload: {
            description: string;
            total_amount: number;
            installment_count: number;
            installment_amount: number;
            first_due_date: string;
            category?: string | null;
            payment_method?: string | null;
            notes?: string | null;
          };
        };
        Returns: string;
      };
      update_installment_with_payments: {
        Args: {
          p_id: string;
          p_payload: {
            description?: string;
            total_amount?: number;
            installment_count: number;
            installment_amount: number;
            first_due_date: string;
            category?: string | null;
            payment_method?: string | null;
            notes?: string | null;
          };
        };
        Returns: void;
      };
      update_installment: {
        Args: {
          p_id: string;
          p_payload: {
            description?: string;
            total_amount?: number;
            installment_count?: number;
            installment_amount?: number;
            first_due_date?: string;
            category?: string | null;
            payment_method?: string | null;
            notes?: string | null;
          };
        };
        Returns: void;
      };
      bulk_import_entries: {
        Args: {
          p_kind: string;
          p_rows: Array<{
            description: string;
            amount: number;
            category: string;
            received_at?: string;
            spent_at?: string;
            payment_method?: string | null;
            notes?: string | null;
          }>;
        };
        Returns: number;
      };
    };
    Enums: {};
    CompositeTypes: {};
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Inserts<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type Updates<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Profile = Tables<"profiles">;
export type UserSettings = Tables<"user_settings">;
export type IncomeEntry = Tables<"income_entries">;
export type ExpenseEntry = Tables<"expense_entries">;
export type Bill = Tables<"bills">;
export type Receivable = Tables<"receivables">;
export type Installment = Tables<"installments">;
export type InstallmentPayment = Tables<"installment_payments">;
export type Investment = Tables<"investments">;
export type InvestmentDividend = Tables<"investment_dividends">;
export type InvestmentWallet = Tables<"investment_wallets">;
export type InvestmentContribution = Tables<"investment_contributions">;
export type BusinessWorkspace = Tables<"business_workspaces">;
export type BusinessProductCategory = Tables<"business_product_categories">;
export type BusinessProduct = Tables<"business_products">;
export type BusinessPurchaseOrder = Tables<"business_purchase_orders">;
export type BusinessPurchaseItem = Tables<"business_purchase_items">;
export type BusinessInventoryLot = Tables<"business_inventory_lots">;
export type BusinessCustomer = Tables<"business_customers">;
export type BusinessSale = Tables<"business_sales">;
export type BusinessSaleItem = Tables<"business_sale_items">;
export type BusinessSaleItemAllocation = Tables<"business_sale_item_allocations">;
export type BusinessInventoryMovement = Tables<"business_inventory_movements">;
export type BusinessPurchasePayment = Tables<"business_purchase_payments">;
export type BusinessPayment = Tables<"business_payments">;
export type BusinessSaleReturn = Tables<"business_sale_returns">;
export type BusinessSaleReturnItem = Tables<"business_sale_return_items">;
export type BusinessExpense = Tables<"business_expenses">;
export type BusinessAuditLog = Tables<"business_audit_logs">;
export type BusinessCashFlowEvent = Database["public"]["Views"]["business_cash_flow_events"]["Row"];
export type BusinessInventorySummary = Database["public"]["Views"]["business_inventory_summary"]["Row"];
export type FinancialGoal = Tables<"financial_goals">;

export type InsertIncomeEntry = Inserts<"income_entries">;
export type InsertExpenseEntry = Inserts<"expense_entries">;
export type InsertBill = Inserts<"bills">;
export type InsertReceivable = Inserts<"receivables">;
export type InsertInstallment = Inserts<"installments">;
export type InsertInstallmentPayment = Inserts<"installment_payments">;
export type InsertInvestment = Inserts<"investments">;
export type InsertInvestmentDividend = Inserts<"investment_dividends">;
export type InsertInvestmentWallet = Inserts<"investment_wallets">;
export type InsertInvestmentContribution = Inserts<"investment_contributions">;
export type InsertBusinessWorkspace = Inserts<"business_workspaces">;
export type InsertBusinessProductCategory = Inserts<"business_product_categories">;
export type InsertBusinessProduct = Inserts<"business_products">;
export type InsertBusinessPurchaseOrder = Inserts<"business_purchase_orders">;
export type InsertBusinessPurchaseItem = Inserts<"business_purchase_items">;
export type InsertBusinessCustomer = Inserts<"business_customers">;
export type InsertBusinessSale = Inserts<"business_sales">;
export type InsertBusinessSaleItem = Inserts<"business_sale_items">;
export type InsertBusinessPurchasePayment = Inserts<"business_purchase_payments">;
export type InsertBusinessPayment = Inserts<"business_payments">;
export type InsertBusinessSaleReturn = Inserts<"business_sale_returns">;
export type InsertBusinessSaleReturnItem = Inserts<"business_sale_return_items">;
export type InsertBusinessExpense = Inserts<"business_expenses">;
export type InsertFinancialGoal = Inserts<"financial_goals">;
export type InsertUserSettings = Inserts<"user_settings">;
export type UpdateProfile = Updates<"profiles">;
export type UpdateUserSettings = Updates<"user_settings">;
export type UpdateBusinessProductCategory = Updates<"business_product_categories">;
export type UpdateBusinessProduct = Updates<"business_products">;
export type UpdateBusinessPurchaseOrder = Updates<"business_purchase_orders">;
export type UpdateBusinessPurchaseItem = Updates<"business_purchase_items">;
export type UpdateBusinessCustomer = Updates<"business_customers">;
export type UpdateBusinessSale = Updates<"business_sales">;
export type UpdateBusinessSaleItem = Updates<"business_sale_items">;
export type UpdateBusinessPurchasePayment = Updates<"business_purchase_payments">;
export type UpdateBusinessPayment = Updates<"business_payments">;
export type UpdateBusinessSaleReturn = Updates<"business_sale_returns">;
export type UpdateBusinessExpense = Updates<"business_expenses">;
