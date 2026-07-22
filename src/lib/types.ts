export type UserRole = "manager" | "admin" | "customer";

export interface RoleTheme {
  primary: string;
  secondary: string;
  accent: string;
}

export interface SiteSettings {
  siteName: string;
  logo: string;
  heroImage: string;
  footerImage: string;
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  darkMode: boolean;
  currentRole: UserRole;
  roleThemes: {
    manager: RoleTheme;
    admin: RoleTheme;
    customer: RoleTheme;
  };
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "موقع أحمد بحري",
  logo: "",
  heroImage: "",
  footerImage: "",
  fontFamily: "Cairo",
  fontSize: 16,
  primaryColor: "#2563eb",
  secondaryColor: "#7c3aed",
  accentColor: "#f59e0b",
  darkMode: false,
  currentRole: "manager",
  roleThemes: {
    manager: { primary: "#1e40af", secondary: "#7c3aed", accent: "#f59e0b" },
    admin: { primary: "#059669", secondary: "#0891b2", accent: "#f97316" },
    customer: { primary: "#2563eb", secondary: "#6366f1", accent: "#ec4899" },
  },
};

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: UserRole[];
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  image: string;
  costPrice: number;
  wholesalePrice: number;
  profitMargin: number;
  retailPrice: number;
  stock: number;
  supplierId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function calculateRetailPrice(costPrice: number, profitMargin: number): number {
  return Math.round((costPrice + (costPrice * profitMargin) / 100) * 100) / 100;
}
