import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const cadastroSchema = z.object({
  name: z.string().min(2, "Informe seu nome completo"),
  email: z.string().email("E-mail inválido"),
  phone: z
    .string()
    .min(10, "Telefone inválido")
    .regex(/^[\d()\s-]+$/, "Telefone inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

export type CadastroInput = z.infer<typeof cadastroSchema>;

export const productSizeSchema = z.object({
  label: z.string().min(1, "Informe o tamanho"),
  price: z.coerce.number().min(0, "Preço inválido"),
});

export const productSchema = z.object({
  name: z.string().min(2, "Informe o nome do produto"),
  description: z.string().optional(),
  image_url: z.string().url("URL inválida").optional().or(z.literal("")),
  category: z.string().min(1, "Informe a categoria"),
  active: z.boolean(),
  sizes: z.array(productSizeSchema).min(1, "Adicione ao menos um tamanho"),
});

export type ProductInput = z.input<typeof productSchema>;
export type ProductOutput = z.output<typeof productSchema>;

export const additionalSchema = z.object({
  name: z.string().min(1, "Informe o nome"),
  price: z.coerce.number().min(0, "Preço inválido"),
  stock_quantity: z.coerce.number().int().optional(),
  active: z.boolean(),
});

export type AdditionalInput = z.input<typeof additionalSchema>;
export type AdditionalOutput = z.output<typeof additionalSchema>;

export const addressSchema = z.object({
  street: z.string().min(2, "Informe a rua"),
  number: z.string().min(1, "Informe o número"),
  complement: z.string().optional(),
  neighborhood: z.string().min(2, "Informe o bairro"),
  city: z.string().min(2, "Informe a cidade"),
});

export type AddressInput = z.infer<typeof addressSchema>;

export const checkoutSchema = z.object({
  address: addressSchema,
  payment_method: z.enum(["pix", "card", "cash"]),
  notes: z.string().optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
