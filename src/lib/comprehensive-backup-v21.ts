/**
 * comprehensive-backup-v21.ts
 *
 * نظام النسخ الاحتياطي والاستعادة الشامل V2.1
 * متجر أحمد بحري - Next.js & Supabase
 *
 * يحتوي هذا الملف على:
 * 1. هيكل JSON Schema v2.1 الشامل لكافة بيانات المتجر (إعدادات، تواصل، مظاهر، منتجات، تصنيفات، موردين).
 * 2. دالة التصدير الشاملة exportComprehensiveBackupV21.
 * 3. دالة الاستعادة المعالِجة المباشرة importComprehensiveBackupV21.
 */

import { supabase } from "./supabase-client";
import { Product, Supplier, CategoryItem, SiteSettings, WatermarkConfig } from "./types";
import { productToRow, categoryToRow, supplierToRow, extractCategoryFromNotes, isUUID } from "./data-context";

// ─── 1. JSON Schema v2.1 Interfaces ──────────────────────────────────────────

export interface StoreGeneralSettingsBackup {
  storeName: string;
  siteName: string;
  phonePrimary: string;
  phoneSecondary?: string;
  email?: string;
  storeAddress: string;
  googleMapsUrl: string;
  storeMapEmbedUrl?: string;
}

export interface SocialMediaLinksBackup {
  whatsapp: string;
  telegram: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  messenger: string;
}

export interface BrandingAndVisualSettingsBackup {
  logo?: string;
  heroImage?: string;
  footerImage?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  watermarkConfig?: WatermarkConfig;
  footerSettings?: {
    footerHeight: number;
    footerRightText: string;
    footerCenterText: string;
    footerLeftText: string;
  };
  categoriesDisplayRules?: {
    showCategoriesCarousel: boolean;
    homeMenuVisibility?: {
      showLogos: boolean;
      showShare: boolean;
      showMap: boolean;
      showContact: boolean;
    };
  };
}

export interface StoreBackupPackageV21 {
  version: "2.1";
  exportDate: string;
  exportedAt: string;
  storeName: string;
  storeSettings: {
    general: StoreGeneralSettingsBackup;
    socialMedia: SocialMediaLinksBackup;
    brandingAndVisual: BrandingAndVisualSettingsBackup;
    allSettingsRaw: Record<string, any>;
  };
  statistics: {
    totalProducts: number;
    totalCategories: number;
    totalSuppliers: number;
  };
  products: Product[];
  categories: CategoryItem[];
  suppliers: Supplier[];
}

export interface BackupProgressInfo {
  stage: string;
  current: number;
  total: number;
  percentage: number;
}

// ─── 2. Export Function (v2.1) ────────────────────────────────────────────────

export function exportComprehensiveBackupV21(params: {
  products: Product[];
  categories: CategoryItem[];
  suppliers: Supplier[];
  settings: Partial<SiteSettings>;
}): StoreBackupPackageV21 {
  const { products, categories, suppliers, settings } = params;

  // أ. إنشاء خرائط الربط المطابقة للتصنيفات
  const categoryIdToName = new Map<string, string>();
  const categoryNameToId = new Map<string, string>();

  categories.forEach((c) => {
    if (c.id && c.name) {
      categoryIdToName.set(c.id, c.name);
      categoryNameToId.set(c.name.trim().toLowerCase(), c.id);
    }
  });

  // ب. إثراء ومعالجة كافة المنتجات بالباروكود والتصنيفات والأسعار المحدثة
  const enrichedProducts: Product[] = products.map((p) => {
    const catNameFromNotes = extractCategoryFromNotes(p.notes || "");
    const resolvedCatName =
      p.categoryName ||
      (p.categoryId ? categoryIdToName.get(p.categoryId) : null) ||
      (catNameFromNotes !== "عام" ? catNameFromNotes : null);

    const resolvedCatId =
      p.categoryId ||
      (resolvedCatName ? categoryNameToId.get(resolvedCatName.trim().toLowerCase()) : null) ||
      null;

    const rawP = p as Record<string, any>;
    const retailP = Number(rawP.retailPrice ?? rawP.price ?? rawP.retail_price) || 0;
    const costP = Number(rawP.costPrice ?? rawP.cost_price) || 0;
    const wholesaleP = Number(rawP.wholesalePrice ?? rawP.wholesale_price) || 0;
    const profitM = Number(rawP.profitMargin ?? rawP.profit_margin) || 0;
    const stockVal = Number(rawP.stock ?? rawP.stockQuantity ?? rawP.stock_quantity) || 0;
    const qrVal = (rawP.qrCodeData ?? rawP.qrCode ?? rawP.qr_code ?? null) as string | null;
    const barcodeVal = (rawP.barcode ?? null) as string | null;
    const skuVal = (rawP.sku ?? rawP.id ? String(rawP.sku ?? rawP.id) : "") as string;

    return {
      id: p.id,
      name: p.name || "",
      image: p.image || "",
      originalImageUrl: p.originalImageUrl || p.image || "",
      price: retailP,
      costPrice: costP,
      wholesalePrice: wholesaleP,
      profitMargin: profitM,
      retailPrice: retailP,
      stockQuantity: stockVal,
      stock: stockVal,
      barcode: barcodeVal,
      qrCodeData: qrVal,
      qrCode: qrVal,
      sku: skuVal,
      categoryId: resolvedCatId,
      categoryName: resolvedCatName,
      supplierId: p.supplierId || "",
      notes: p.notes || "",
      createdAt: p.createdAt || new Date().toISOString(),
      updatedAt: p.updatedAt || new Date().toISOString(),
    } as Product;
  });

  // ج. تجميع الهيكل الشامل v2.1
  const generalSettings: StoreGeneralSettingsBackup = {
    storeName: settings.storeName || settings.siteName || "متجر أحمد بحري",
    siteName: settings.siteName || "موقع أحمد بحري",
    phonePrimary: settings.phonePrimary || settings.phoneLink || "07706166725",
    phoneSecondary: settings.phoneSecondary || settings.phoneLink2 || "",
    email: (settings as any).email || "info@ahmedbahri.com",
    storeAddress: settings.storeAddress || "العراق - كركوك - احمد اغا",
    googleMapsUrl: settings.googleMapsUrl || settings.storeMapLink || "https://maps.google.com",
    storeMapEmbedUrl: settings.storeMapEmbedUrl || "",
  };

  const socialMediaLinks: SocialMediaLinksBackup = {
    whatsapp: settings.whatsappLink || settings.whatsapp || "",
    telegram: settings.telegramLink || "",
    facebook: settings.facebookLink || settings.facebook || "",
    instagram: settings.instagramLink || settings.instagram || "",
    tiktok: settings.tiktokLink || settings.tiktok || "",
    youtube: settings.youtubeLink || "",
    messenger: settings.messengerLink || "",
  };

  const brandingAndVisual: BrandingAndVisualSettingsBackup = {
    logo: settings.logo || "",
    heroImage: settings.heroImage || "",
    footerImage: settings.footerImage || "",
    primaryColor: settings.primaryColor || "#2563eb",
    secondaryColor: settings.secondaryColor || "#7c3aed",
    accentColor: settings.accentColor || "#f59e0b",
    fontFamily: settings.fontFamily || "Cairo",
    watermarkConfig: settings.watermarkConfig,
    footerSettings: {
      footerHeight: settings.footerHeight || 120,
      footerRightText: settings.footerRightText || "جميع الحقوق محفوظة © 2026 موقع أحمد بحري",
      footerCenterText: settings.footerCenterText || "أفضل المنتجات والخدمات لعملائنا الكرام",
      footerLeftText: settings.footerLeftText || "للطلب والتواصل: 07706166725",
    },
    categoriesDisplayRules: {
      showCategoriesCarousel: settings.showCategoriesCarousel !== undefined ? Boolean(settings.showCategoriesCarousel) : true,
      homeMenuVisibility: settings.homeMenuVisibility,
    },
  };

  return {
    version: "2.1",
    exportDate: new Date().toISOString(),
    exportedAt: new Date().toISOString(),
    storeName: generalSettings.storeName,
    storeSettings: {
      general: generalSettings,
      socialMedia: socialMediaLinks,
      brandingAndVisual: brandingAndVisual,
      allSettingsRaw: settings as Record<string, any>,
    },
    statistics: {
      totalProducts: enrichedProducts.length,
      totalCategories: categories.length,
      totalSuppliers: suppliers.length,
    },
    products: enrichedProducts,
    categories,
    suppliers,
  };
}

// ─── 3. Import / Restore Function (v2.1 & Backward Compatible) ──────────────

export async function importComprehensiveBackupV21(
  backupData: any,
  options?: {
    onProgress?: (progress: BackupProgressInfo) => void;
    updateSettingsFn?: (settings: Partial<SiteSettings>) => Promise<void>;
    reloadAllDataFn?: () => Promise<void>;
  }
): Promise<{ productsCount: number; categoriesCount: number; suppliersCount: number }> {
  const { onProgress, updateSettingsFn, reloadAllDataFn } = options || {};

  // 1. استخراج واستعادة إعدادات الموقع وتحديث الكاش المباشر
  const rawSettings =
    backupData.storeSettings?.allSettingsRaw ||
    backupData.settings ||
    backupData.storeSettings ||
    null;

  if (rawSettings) {
    onProgress?.({ stage: "جاري استعادة إعدادات وتصاميم الهوية والمظهر...", current: 1, total: 4, percentage: 5 });
    try {
      localStorage.setItem("app_site_settings_cache", JSON.stringify(rawSettings));
      window.dispatchEvent(new Event("storage"));
      if (updateSettingsFn) {
        await updateSettingsFn(rawSettings);
      }
    } catch (err) {
      console.warn("[BackupV21] Could not sync site settings:", err);
    }
  }

  // 2. استخراج الأقسام الصريحة والضمنية (من المنتجات والملاحظات) أولاً
  onProgress?.({ stage: "جاري استعادة وتوثيق الأقسام والتصنيفات...", current: 2, total: 4, percentage: 15 });

  const rawCategories: CategoryItem[] = backupData.categories || [];
  const rawProducts: any[] = backupData.products || [];
  const rawSuppliers: Supplier[] = backupData.suppliers || [];

  const catMapToUpsert = new Map<string, { name: string; priority: number; is_active: boolean }>();

  rawCategories.forEach((c) => {
    if (c.name && c.name.trim()) {
      catMapToUpsert.set(c.name.trim().toLowerCase(), {
        name: c.name.trim(),
        priority: c.priority || 1,
        is_active: c.isActive !== undefined ? Boolean(c.isActive) : true,
      });
    }
  });

  // اكتشاف الأقسام الضمنية في المنتجات وحقل الملاحظات
  rawProducts.forEach((p) => {
    const rawCatName = p.categoryName || p.category_name;
    const notesCatName = extractCategoryFromNotes(p.notes || "");
    const candidateCat = (rawCatName || (notesCatName !== "عام" ? notesCatName : null)) as string | null;
    if (candidateCat && candidateCat.trim()) {
      const key = candidateCat.trim().toLowerCase();
      if (!catMapToUpsert.has(key)) {
        catMapToUpsert.set(key, {
          name: candidateCat.trim(),
          priority: 1,
          is_active: true,
        });
      }
    }
  });

  if (catMapToUpsert.size > 0) {
    const catRows = Array.from(catMapToUpsert.values());
    const { error: catErr } = await supabase.from("categories").upsert(catRows, { onConflict: "name" });
    if (catErr) console.warn("[BackupV21] Error upserting categories:", catErr.message);
  }

  // 3. استعادة الموردين
  if (rawSuppliers.length > 0) {
    onProgress?.({ stage: "جاري استعادة سجل الموردين...", current: 3, total: 4, percentage: 25 });
    const supRows = rawSuppliers.map((s) => supplierToRow(s as unknown as Record<string, unknown>));
    const { error: supErr } = await supabase.from("suppliers").upsert(supRows, { onConflict: "name" });
    if (supErr) console.warn("[BackupV21] Error upserting suppliers:", supErr.message);
  }

  // جلب معرفات UUID الحديثة للتصنيفات من Supabase
  const { data: freshCats } = await supabase.from("categories").select("id, name");
  const categoryNameToIdMap = new Map<string, string>();
  freshCats?.forEach((c) => {
    if (c.name && c.id) categoryNameToIdMap.set(c.name.trim().toLowerCase(), c.id);
  });

  // 4. استعادة المنتجات بدفعات مجزأة مع شريط التقدم اللحظي
  const totalProducts = rawProducts.length;
  if (totalProducts > 0) {
    const productRowsToUpsert = rawProducts.map((p) => {
      const costPrice = Number(p.costPrice ?? p.cost_price) || 0;
      const retailPrice = Number(p.price ?? p.retailPrice ?? p.retail_price) || 0;
      const wholesalePrice = Number(p.wholesalePrice ?? p.wholesale_price) || 0;
      const stockVal = Number(p.stockQuantity ?? p.stock_quantity ?? p.stock) || 0;
      const barcodeVal = (p.barcode as string | null) ?? null;
      const qrVal = ((p.qrCodeData ?? p.qrCode ?? p.qr_code) as string | null) ?? null;
      const skuVal = (p.sku as string | null) ?? null;

      // Category ID Resolution
      let catId = p.categoryId && isUUID(p.categoryId) ? p.categoryId : null;
      if (!catId) {
        const rawCatName = p.categoryName || p.category_name;
        const notesCatName = extractCategoryFromNotes(p.notes || "");
        const candidateCat = rawCatName || (notesCatName !== "عام" ? notesCatName : "");
        if (candidateCat) {
          catId = categoryNameToIdMap.get(String(candidateCat).trim().toLowerCase()) || null;
        }
      }

      return productToRow({
        ...p,
        costPrice,
        retailPrice,
        wholesalePrice,
        stock: stockVal,
        barcode: barcodeVal,
        qrCode: qrVal,
        sku: skuVal,
        categoryId: catId,
      } as Record<string, unknown>);
    });

    const CHUNK_SIZE = 50;
    const totalChunks = Math.ceil(totalProducts / CHUNK_SIZE);

    for (let i = 0; i < totalProducts; i += CHUNK_SIZE) {
      const chunk = productRowsToUpsert.slice(i, i + CHUNK_SIZE);
      const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
      const processedCount = Math.min(i + CHUNK_SIZE, totalProducts);
      const percentage = Math.round(25 + (processedCount / totalProducts) * 75);

      onProgress?.({
        stage: `جاري استعادة الدفعة ${chunkIndex} من ${totalChunks} (${processedCount}/${totalProducts} منتج)...`,
        current: processedCount,
        total: totalProducts,
        percentage,
      });

      const { error: prodErr } = await supabase.from("products").upsert(chunk, { onConflict: "name" });
      if (prodErr) {
        throw new Error(`فشل إدخال دفعة المنتجات (${chunkIndex}): ${prodErr.message}`);
      }
    }
  }

  // 5. تحديث كافة البيانات في السياق العام
  if (reloadAllDataFn) {
    await reloadAllDataFn();
  }

  return {
    productsCount: totalProducts,
    categoriesCount: catMapToUpsert.size,
    suppliersCount: rawSuppliers.length,
  };
}
