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
  enabled: true,
  watermarkUrl: "/watermark.png",
  position: "top-left",
  customX: 10,
  customY: 10,
  opacity: 90,
  scale: 22,
  applyOnUpload: true,
  targetBucket: "watermarked-products",
};

export interface ThemePreset {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  description: string;
  isBuiltIn?: boolean;
}

export const PRESET_THEMES: ThemePreset[] = [
  {
    id: "classic-blue",
    name: "أزرق كلاسيكي Classic Blue",
    primary: "#2563eb",
    secondary: "#7c3aed",
    accent: "#f59e0b",
    description: "الهوية الرسمية الكلاسيكية المريحة للعين",
    isBuiltIn: true,
  },
  {
    id: "emerald-pro",
    name: "زمردي احترافي Emerald Pro",
    primary: "#059669",
    secondary: "#065f46",
    accent: "#f97316",
    description: "ثيم زاهي وراقٍ يعكس الحيوية والجودة",
    isBuiltIn: true,
  },
  {
    id: "royal-purple",
    name: "بنفسجي ملكي Royal Purple",
    primary: "#7c3aed",
    secondary: "#5b21b6",
    accent: "#ec4899",
    description: "طابع عصري وجذاب ومناسب للتصاميم الحديثة",
    isBuiltIn: true,
  },
  {
    id: "dark-gold",
    name: "ذهبي فاخر Dark Gold",
    primary: "#d97706",
    secondary: "#92400e",
    accent: "#3b82f6",
    description: "ثيم فخم وأنيق يناسب المتجر الفاخر",
    isBuiltIn: true,
  },
  {
    id: "cyber-neon",
    name: "سايبر نيون Cyber Neon",
    primary: "#06b6d4",
    secondary: "#0e7490",
    accent: "#a855f7",
    description: "ثيم عصري جداً بألوان النيون المستقبلي",
    isBuiltIn: true,
  },
];

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
  phoneLink2?: string;
  // Social Media Channels
  facebookLink?: string;
  instagramLink?: string;
  tiktokLink?: string;
  youtubeLink?: string;
  // Location & Map Info
  storeAddress?: string;
  storeMapLink?: string;
  storeMapEmbedUrl?: string;
  // App Download Links
  appDownloadUrl?: string;
  androidAppUrl?: string;
  iosAppUrl?: string;
  // Custom Themes & Active Theme Preset
  customThemes?: ThemePreset[];
  activeThemePreset?: string;
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
  // Home Menu Custom Visibility Toggles
  homeMenuVisibility?: HomeMenuVisibilitySettings;
  roleThemes: {
    manager: RoleTheme;
    admin: RoleTheme;
    customer: RoleTheme;
  };
}

export interface HomeMenuVisibilitySettings {
  showLogos: boolean;
  showShare: boolean;
  showMap: boolean;
  showContact: boolean;
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
  phoneLink2: "",
  facebookLink: "",
  instagramLink: "",
  tiktokLink: "",
  youtubeLink: "",
  storeAddress: "العراق - بغداد - الشارع التجاري الرئيسي",
  storeMapLink: "https://maps.google.com",
  storeMapEmbedUrl: "",
  appDownloadUrl: "",
  androidAppUrl: "",
  iosAppUrl: "",
  customThemes: [],
  activeThemePreset: "classic-blue",
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
  homeMenuVisibility: {
    showLogos: true,
    showShare: true,
    showMap: true,
    showContact: true,
  },
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

/**
 * Returns a stable, deterministic category image.
 * Manager custom uploaded image is 100% top priority.
 * Fallbacks are sorted deterministically so category images NEVER shift randomly on refresh!
 */
export function getCategoryDisplayImage(cat: CategoryItem, products: Product[]): string {
  // 1. Manager Custom Uploaded Image (Top Priority - Strictly Preserved)
  if (cat.image && cat.image.trim()) {
    return cat.image.trim();
  }

  // 2. Deterministic Dynamic Fallback: Top product image tagged under this category
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

  // Sort deterministically by ID to ensure static consistency across page reloads
  const sortedCatProducts = [...categoryProducts].sort((a, b) => a.id.localeCompare(b.id));
  const productWithImage = sortedCatProducts.find((p) => p.image && p.image.trim());
  if (productWithImage && productWithImage.image.trim()) {
    return productWithImage.image.trim();
  }

  // 3. Fallback to any product in store with image (sorted deterministically)
  const sortedProducts = [...products].sort((a, b) => a.id.localeCompare(b.id));
  const globalProductWithImage = sortedProducts.find((p) => p.image && p.image.trim());
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
