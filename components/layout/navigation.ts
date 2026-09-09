import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  HandCoins,
  Heart,
  LayoutDashboard,
  PackageCheck,
  PiggyBank,
  PlusCircle,
  ReceiptText,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  children?: NavigationItem[];
};

export type NavigationGroup = {
  id: "finance" | "business";
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
};

export const financeNavItems: NavigationItem[] = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/income", label: "Entradas", icon: TrendingUp },
  { href: "/expenses", label: "Gastos", icon: TrendingDown },
  { href: "/receivables", label: "A Receber", icon: HandCoins },
  {
    href: "/investments",
    label: "Investimentos",
    icon: PiggyBank,
    children: [
      { href: "/investments?tab=overview", label: "Visão geral", icon: LayoutDashboard },
      { href: "/investments?tab=portfolio", label: "Carteira", icon: Wallet },
      { href: "/investments?tab=contributions", label: "Aportes", icon: PlusCircle },
    ],
  },
  { href: "/goals", label: "Metas", icon: Target },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
];

export const maeNavItem: NavigationItem = { href: "/mae", label: "Mãe", icon: Heart };

export const businessNavItems: NavigationItem[] = [
  { href: "/business/purchases", label: "Compras", icon: ShoppingCart },
  { href: "/business/inventory", label: "Estoque", icon: Boxes, disabled: true },
  { href: "/business/sales", label: "Vendas", icon: PackageCheck, disabled: true },
  { href: "/business/customers", label: "Clientes", icon: Users, disabled: true },
  { href: "/business/expenses", label: "Despesas", icon: ReceiptText, disabled: true },
  { href: "/business/reports", label: "Relatórios", icon: BarChart3, disabled: true },
];

export function getNavigationGroups(isMaeUser: boolean): NavigationGroup[] {
  return [
    {
      id: "finance",
      label: "Finanças",
      icon: PiggyBank,
      items: isMaeUser ? [...financeNavItems, maeNavItem] : financeNavItems,
    },
    {
      id: "business",
      label: "Negócio",
      icon: BriefcaseBusiness,
      items: businessNavItems,
    },
  ];
}
