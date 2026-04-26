export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type BillStatus = "pending" | "paid" | "overdue";
type GoalStatus = "active" | "completed" | "paused";

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
      installments: {
        Row: {
          id: string;
          user_id: string;
          description: string;
          total_amount: number;
          installment_count: number;
          installment_amount: number;
          first_due_date: string;
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
          status: BillStatus;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          installment_id: string;
          installment_number: number;
          due_date: string;
          amount: number;
          status?: BillStatus;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          installment_id?: string;
          installment_number?: number;
          due_date?: string;
          amount?: number;
          status?: BillStatus;
          paid_at?: string | null;
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
      investments: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          amount: number;
          investment_type: string;
          invested_at: string;
          notes: string | null;
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
      financial_goals: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_amount: number;
          current_amount: number;
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
          current_amount?: number;
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
          current_amount?: number;
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
    Views: {};
    Functions: {};
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
export type IncomeEntry = Tables<"income_entries">;
export type ExpenseEntry = Tables<"expense_entries">;
export type Bill = Tables<"bills">;
export type Installment = Tables<"installments">;
export type InstallmentPayment = Tables<"installment_payments">;
export type Investment = Tables<"investments">;
export type FinancialGoal = Tables<"financial_goals">;

export type InsertIncomeEntry = Inserts<"income_entries">;
export type InsertExpenseEntry = Inserts<"expense_entries">;
export type InsertBill = Inserts<"bills">;
export type InsertInstallment = Inserts<"installments">;
export type InsertInstallmentPayment = Inserts<"installment_payments">;
export type InsertInvestment = Inserts<"investments">;
export type InsertFinancialGoal = Inserts<"financial_goals">;
export type UpdateProfile = Updates<"profiles">;
