import {
  ArrowLeftRight,
  ChartPie,
  FileChartColumn,
  Goal,
  Landmark,
  LayoutDashboard,
  type LucideIcon,
  Menu,
  PiggyBank,
  Scale,
  Settings,
  TrendingUp,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile?: boolean };

/** The ten modules from docs/01-product-requirements.md, in sidebar order. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, mobile: true },
  { href: "/accounts", label: "Accounts", icon: Landmark, mobile: true },
  { href: "/budgets", label: "Budgets", icon: ChartPie },
  { href: "/investments", label: "Investments", icon: TrendingUp, mobile: true },
  { href: "/goals", label: "Savings goals", icon: Goal },
  { href: "/net-worth", label: "Net worth", icon: Scale },
  { href: "/reports", label: "Reports", icon: FileChartColumn },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Mobile bottom bar: the main modules plus a page listing everything. */
export const MOBILE_ITEMS: NavItem[] = [
  ...NAV_ITEMS.filter((i) => i.mobile),
  { href: "/more", label: "More", icon: Menu },
];

export const BRAND_ICON = PiggyBank;

/** True when `pathname` is inside the section `href` (Dashboard matches only "/"). */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
