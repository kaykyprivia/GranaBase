export type ProfileRole = "customer" | "admin";

export interface Profile {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  role: ProfileRole;
  created_at: string;
}

export interface ProductSize {
  id: string;
  product_id: string;
  label: string;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string;
  active: boolean;
  created_at: string;
  product_sizes?: ProductSize[];
}

export interface Additional {
  id: string;
  name: string;
  price: number;
  stock_quantity: number | null;
  active: boolean;
}

export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "delivering"
  | "delivered"
  | "cancelled";

export type PaymentMethod = "pix" | "card" | "cash";

export interface OrderAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  zone: string;
  lat?: number;
  lng?: number;
}

export interface OrderItemAdditional {
  id: string;
  name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  size_id: string;
  quantity: number;
  unit_price: number;
  additionals_json: OrderItemAdditional[];
}

export interface Order {
  id: string;
  user_id: string;
  status: OrderStatus;
  zone: string | null;
  delivery_fee: number;
  subtotal: number;
  cashback_used: number;
  total: number;
  payment_method: PaymentMethod;
  address_json: OrderAddress;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
