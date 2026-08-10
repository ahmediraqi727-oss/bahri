export type UserRole = "manager" | "admin" | "customer";

export interface RoleTheme {
  primary: string;
  secondary: string;
  accent: string;
}

export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "custom";

export interface WatermarkConfig {
  enabled: boolean;
  watermarkUrl: string;
  position: WatermarkPosition;
  customX: number; // percentage 0 - 100%
  customY: number; // percentage 0 - 100%
  opacity: number; // 0 - 100
  scale: number;   // 5 - 80 (% of base image width)
  applyOnUpload: boolean;
  targetBucket?: string;
}

export type WatermarkOptions = WatermarkConfig;

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  enabled: false,
  watermarkUrl: "",
  position: "bottom-right",
  customX: 85,
  customY: 85,
  opacity: 80,
  scale: 20,
  applyOnUpload: true,
  targetBucket: "watermarked-products",
};

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
  whatsappLink?: string;
  telegramLink?: string;
  messengerLink?: string;
  phoneLink?: string;
  // Header Custom Icons & Sizes
  homeIcon?: string;
  homeIconSize?: number;
  searchIcon?: string;
  searchIconSize?: number;
  cartIcon?: string;
  cartIconSize?: number;
  // Footer Customization
  footerHeight?: number;
  footerRightText?: string;
  footerCenterText?: string;
  footerLeftText?: string;
  // Categories Carousel Toggle
  showCategoriesCarousel?: boolean;
  // Delivery Default Settings
  defaultDeliveryFee?: number;
  defaultDeliveryDuration?: string;
  // Eye Protection Mode
  eyeProtection?: boolean;
  // Watermark Engine Configuration
  watermarkConfig?: WatermarkConfig;
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
  eyeProtection: false,
  currentRole: "manager",
  whatsappLink: "",
  telegramLink: "",
  messengerLink: "",
  phoneLink: "07800000000",
  homeIcon: "",
  homeIconSize: 28,
  searchIcon: "",
  searchIconSize: 28,
  cartIcon: "",
  cartIconSize: 28,
  footerHeight: 120,
  footerRightText: "جميع الحقوق محفوظة © 2026 موقع أحمد بحري",
  footerCenterText: "أفضل المنتجات والخدمات لعملائنا الكرام",
  footerLeftText: "للطلب والتواصل: 07800000000",
  showCategoriesCarousel: true,
  defaultDeliveryFee: 5000,
  defaultDeliveryDuration: "2 - 3 أيام عمل",
  watermarkConfig: DEFAULT_WATERMARK_CONFIG,
  roleThemes: {
    manager: { primary: "#1e40af", secondary: "#7c3aed", accent: "#f59e0b" },
    admin: { primary: "#059669", secondary: "#0891b2", accent: "#f97316" },
    customer: { primary: "#2563eb", secondary: "#6366f1", accent: "#ec4899" },
  },
};

export interface CategoryItem {
  id: string;
  name: string;
  image: string;
  priority: number;
  isActive: boolean;
  keywords?: string;
  views?: number;
  createdAt?: string;
}

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
  originalImageUrl?: string;
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

export function getCategoryDisplayImage(cat: CategoryItem, products: Product[]): string {
  // 1. Manager Custom Uploaded Image (Highest Priority)
  if (cat.image && cat.image.trim()) {
    return cat.image.trim();
  }

  // 2. Dynamic Fallback: Image of First Product tagged under this Category
  const catNameLower = cat.name.toLowerCase();
  const categoryProducts = products.filter((p) => {
    if (!p.notes) return false;
    const notesLower = p.notes.toLowerCase();
    return (
      notesLower.includes(`الفئة: ${catNameLower}`) ||
      notesLower.includes(catNameLower) ||
      notesLower.includes(`فئة: ${catNameLower}`)
    );
  });

  const productWithImage = categoryProducts.find((p) => p.image && p.image.trim());
  if (productWithImage && productWithImage.image.trim()) {
    return productWithImage.image.trim();
  }

  // 3. Fallback to any product in store with image
  const globalProductWithImage = products.find((p) => p.image && p.image.trim());
  if (globalProductWithImage && globalProductWithImage.image.trim()) {
    return globalProductWithImage.image.trim();
  }

  return "";
}

export interface CustomerRecord {
  id: string;
  visitorId: string;
  name: string;
  phone: string;
  city: string;
  governorate: string;
  address: string;
  email: string;
  userId?: string;
  deviceType: string;
  visitCount: number;
  lastActiveAt: string;
  visitedPages: string[];
  isBlocked: boolean;
  isRegistered: boolean;
  isSuspicious: boolean;
  changeCount: number;
  nameHistory: string[];
  phoneHistory: string[];
  addressHistory: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

