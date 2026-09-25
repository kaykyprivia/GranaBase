import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  BriefcaseBusiness,
  Crown,
  FileText,
  Gift,
  HandCoins,
  Heart,
  LayoutDashboard,
  MessageSquare,
  Landmark,
  PackageCheck,
  PiggyBank,
  PlusCircle,
  ReceiptText,
  ShieldCheck,
  Sparkles,
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
  id: "finance" | "business" | "subscription" | "admin";
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
};

export const financeNavItems: NavigationItem[] = [
  { href: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { href: "/cash-flow", label: "Fluxo de Caixa", icon: Wallet },
  { href: "/income", label: "Entradas", icon: TrendingUp },
  { href: "/expenses", label: "Gastos", icon: TrendingDown },
  { href: "/receivables", label: "A Receber", icon: HandCoins },
  {
    href: "/investments",
    label: "Investimentos",
    icon: PiggyBank,
    children: [
      { href: "/investments?tab=overview", label: "Visao geral", icon: LayoutDashboard },
      { href: "/investments?tab=portfolio", label: "Carteira", icon: Wallet },
      { href: "/investments?tab=contributions", label: "Aportes", icon: PlusCircle },
      { href: "/investments?tab=consortiums", label: "Consorcios", icon: Landmark },
    ],
  },
  { href: "/goals", label: "Metas", icon: Target },
  { href: "/reports", label: "Relatorios", icon: BarChart3 },
];

export const maeNavItem: NavigationItem = { href: "/mae", label: "Mae", icon: Heart };

export const businessNavItems: NavigationItem[] = [
  { href: "/business", label: "Painel", icon: LayoutDashboard },
  { href: "/business/purchases", label: "Compras", icon: ShoppingCart },
  { href: "/business/inventory", label: "Estoque", icon: Boxes },
  { href: "/business/sales", label: "Vendas", icon: PackageCheck },
  { href: "/business/customers", label: "Clientes", icon: Users },
  { href: "/business/expenses", label: "Despesas", icon: ReceiptText },
  { href: "/business/cash-flow", label: "Fluxo de Caixa", icon: Wallet },
  { href: "/business/reports", label: "Relatorios", icon: BarChart3 },
];

export const subscriptionNavItems: NavigationItem[] = [
  { href: "/onboarding", label: "Comecar", icon: Sparkles },
  { href: "/my-plan", label: "Meu Plano", icon: Wallet },
  { href: "/plans", label: "Planos", icon: Crown },
  { href: "/referrals", label: "Indique e Ganhe", icon: Gift },
  { href: "/withdrawals", label: "Saques", icon: HandCoins },
  { href: "/support", label: "Suporte", icon: MessageSquare },
];

export const adminNavItems: NavigationItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Usuarios", icon: Users },
  { href: "/admin/influencers", label: "Parceiros", icon: Crown },
  { href: "/admin/withdrawals", label: "Saques", icon: HandCoins },
  { href: "/admin/audit", label: "Auditoria", icon: FileText },
];

export function getNavigationGroups(
  isMaeUser: boolean,
  isSuperAdmin: boolean = false
): NavigationGroup[] {
  const groups: NavigationGroup[] = [
    {
      id: "finance",
      label: "Financas",
      icon: PiggyBank,
      items: isMaeUser ? [...financeNavItems, maeNavItem] : financeNavItems,
    },
    {
      id: "business",
      label: "Negocio",
      icon: BriefcaseBusiness,
      items: businessNavItems,
    },
    {
      id: "subscription",
      label: "Assinatura",
      icon: Crown,
      items: subscriptionNavItems,
    },
  ];

  if (isSuperAdmin) {
    groups.push({
      id: "admin",
      label: "Admin",
      icon: ShieldCheck,
      items: adminNavItems,
    });
  }

  return groups;
}