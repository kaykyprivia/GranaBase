export interface DisplayExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  spent_at: string;
  payment_method: string | null;
  created_at: string;
  source: "manual" | "bill" | "installment";
  status: "paid" | "pending" | "overdue";
  dueAmount?: number;
  scheduledAmount?: number;
  actualDate?: string;
  dueDateRef?: string;
}
