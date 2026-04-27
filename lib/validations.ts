import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

export const registerSchema = z.object({
  full_name: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Senhas não coincidem",
  path: ["confirmPassword"],
});

export const incomeSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.number().positive("Valor deve ser positivo"),
  category: z.string().min(1, "Categoria é obrigatória"),
  received_at: z.string().min(1, "Data é obrigatória"),
  payment_method: z.string().optional(),
  notes: z.string().optional(),
});

export const expenseSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  amount: z.number().positive("Valor deve ser positivo"),
  category: z.string().min(1, "Categoria é obrigatória"),
  spent_at: z.string().min(1, "Data é obrigatória"),
  payment_method: z.string().optional(),
  notes: z.string().optional(),
});

export const billSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  amount: z.number().positive("Valor deve ser positivo"),
  due_date: z.string().min(1, "Vencimento é obrigatório"),
  category: z.string().min(1, "Categoria é obrigatória"),
  is_recurring: z.boolean().default(false),
  notes: z.string().optional(),
});

export const installmentSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  installment_amount: z.number().positive("Valor da parcela deve ser positivo"),
  installment_count: z.number().int().positive("Quantidade de parcelas deve ser positiva"),
  first_due_date: z.string().min(1, "Data da 1ª parcela é obrigatória"),
  notes: z.string().optional(),
});

export const investmentSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  amount: z.number().positive("Valor deve ser positivo"),
  investment_type: z.string().min(1, "Tipo é obrigatório"),
  invested_at: z.string().min(1, "Data é obrigatória"),
  notes: z.string().optional(),
});

export const goalSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  target_amount: z.number().positive("Valor alvo deve ser positivo"),
  current_amount: z.number().min(0, "Valor atual não pode ser negativo").default(0),
  deadline: z.string().optional(),
  category: z.string().min(1, "Categoria é obrigatória"),
  notes: z.string().optional(),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type IncomeFormData = z.infer<typeof incomeSchema>;
export type ExpenseFormData = z.infer<typeof expenseSchema>;
export type BillFormData = z.infer<typeof billSchema>;
export type InstallmentFormData = z.infer<typeof installmentSchema>;
export type InvestmentFormData = z.infer<typeof investmentSchema>;
export type GoalFormData = z.infer<typeof goalSchema>;
