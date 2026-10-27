"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Product, Supplier, CategoryItem } from "./types";
import { supabase } from "./supabase-client";
import {
  ProductPricingOverride,
  GlobalPricingConfig,
  PricingTier,
  DEFAULT_PRICING_CONFIG,
  overrideFromRow,
  getEffectiveTiers as engineGetEffectiveTiers,
} from "./pricing-engine";
import { ALL_CATEGORIES_LABEL, isUniversalCategory, splitCategoryNames } from "./seo";
import { cacheProductThumbnail, getCachedProductThumbnail } from "./image-optimizer";

export function extractCategoryFromNotes(notes: string): string {
  if (!notes) return "عام";
  const str = notes.trim();
  if (str.includes("الفئة:")) {
    const after = str.split("الفئة:")[1];
    if (after) {
      const cat = after.split("|")[0]?.split("\n")[0]?.trim();
      if (cat) return isUniversalCategory(cat) ? ALL_CATEGORIES_LABEL : cat;
    }
  }
  const firstPart = str.split("|")[0]?.split("\n")[0]?.trim();
  if (firstPart && firstPart.length <= 40 && !firstPart.includes(":")) {
    return isUniversalCategory(firstPart) ? ALL_CATEGORIES_LABEL : firstPart;
  }
  return "عام";
}

// دالة مساعدة مركزية لتطبيق العلامة المائية مع إشعارات الخطأ لضمان عدم الفشل الصامت
async function applyWatermarkIfNeeded(imageUrl: string): Promise<string> {
  if (!imageUrl || typeof window === "undefined") return imageUrl;
  try {
    const cachedSettings = localStorage.getItem("app_site_settings_cache");
    if (!cachedSettings) {
      console.warn("تحذير: لم يتم العثور على إعدادات المتجر في LocalStorage لتطبيق العلامة المائية.");
      return imageUrl;
    }

    const parsed = JSON.parse(cachedSettings);
    const wmConfig = parsed?.watermarkConfig;

    if (wmConfig?.enabled && wmConfig?.applyOnUpload && wmConfig?.watermarkUrl) {
      const res = await fetch("/api/watermark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: imageUrl,
          watermarkConfig: wmConfig,
          preview: false,
        }),
      });
      const json = await res.json();
      if (json.success && json.watermarkedUrl) {
        return json.watermarkedUrl;
      } else if (json.error) {
        console.error("فشل دمج العلامة المائية من السيرفر:", json.error);
      }
    }
  } catch (err) {
    console.error("خطأ استثنائي أثناء الاتصال بـ API العلامة المائية:", err);
  }
  return imageUrl;
}

interface DataContextType {
  products: Product[];
  suppliers: Supplier[];
  categories: CategoryItem[];
  loading: boolean;
  addProduct: (product: Omit<Product, "id" | "createdAt" | "updatedAt">) => Promise<Product>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  bulkUpdateProducts: (ids: string[], updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  bulkDeleteProducts: (ids: string[]) => Promise<void>;
  addSupplier: (supplier: Omit<Supplier, "id" | "createdAt">) => Promise<Supplier>;
  updateSupplier: (id: string, updates: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  addCategory: (cat: Omit<CategoryItem, "id">) => Promise<CategoryItem>;
  updateCategory: (id: string, updates: Partial<CategoryItem>) => Promise<CategoryItem>;
  deleteCategory: (id: string) => Promise<void>;
  incrementCategoryViews: (catIdOrName: string) => Promise<void>;
  autoSyncCategoriesFromProducts: () => Promise<CategoryItem[]>;
  persistAllCategoriesAndProducts: (catsToSave: CategoryItem[], prodsToSave: Product[]) => Promise<boolean>;
  reloadAllData: () => Promise<void>;
  importProducts: (items: Omit<Product, "id" | "createdAt" | "updatedAt">[], onProgress?: (processed: number, total: number) => void) => Promise<number>;
  exportAllData: () => {
    version: string;
    exportDate: string;
    storeName: string;
    settings?: any;
    totalProducts: number;
    totalCategories: number;
    totalSuppliers: number;
    products: Product[];
    categories: CategoryItem[];
    suppliers: Supplier[];
    exportedAt: string;
  };
  importAllData: (data: { products?: any[]; suppliers?: Supplier[]; categories?: CategoryItem[]; settings?: any }) => Promise<void>;
  // ─ Pricing overrides ──────────────────────────────────────────
  productPricingOverrides: Record<string, ProductPricingOverride>;
  getEffectiveTiers: (productId: string, globalConfig?: GlobalPricingConfig) => PricingTier[];
  upsertPricingOverride: (override: ProductPricingOverride) => Promise<void>;
  // ─ Barcode / QR Code ──────────────────────────────────────────
  /** Instant in-memory lookup — O(1). Falls back to DB if not found locally. */
  lookupProductByBarcode: (code: string) => Product | null;
  /** Hydrates images on demand for visible product IDs in chunks without blocking initial load */
  hydrateProductImages: (ids: string[]) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

const BATCH_STOCK_STORAGE_KEY = "ahmed_bahri_batch_stock_map";

function getLocalBatchStock(productId: string): number | undefined {
  if (typeof window === "undefined" || !productId) return undefined;
  try {
    const raw = localStorage.getItem(BATCH_STOCK_STORAGE_KEY);
    if (!raw) return undefined;
    const map = JSON.parse(raw) as Record<string, number>;
    return typeof map[productId] === "number" ? map[productId] : undefined;
  } catch {
    return undefined;
  }
}

function setLocalBatchStock(productId: string, batchStock: number) {
  if (typeof window === "undefined" || !productId) return;
  try {
    const raw = localStorage.getItem(BATCH_STOCK_STORAGE_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[productId] = Math.max(0, Number(batchStock) || 0);
    localStorage.setItem(BATCH_STOCK_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function rowToProduct(row: Record<string, unknown>): Product {
  const idStr = (row.id as string) || "";
  const rawImg =
    (row.image as string) ||
    (row.image_url as string) ||
    (row.imageUrl as string) ||
    (row.original_image_url as string) ||
    (row.thumbnail_url as string) ||
    "";
  const image = typeof rawImg === "string" ? rawImg.trim() : "";
  const origImage = ((row.original_image_url as string) || image || "").trim();
  const cachedThumb = getCachedProductThumbnail(idStr, image);
  const thumbUrl =
    (row.thumbnail_url as string | null) ??
    (row.thumbnailUrl as string | null) ??
    cachedThumb?.thumbnail ??
    null;
  const blurUrl =
    (row.blur_data_url as string | null) ??
    (row.blurDataUrl as string | null) ??
    cachedThumb?.blur ??
    null;
  const costP = Number(row.cost_price ?? row.costPrice) || 0;
  const retailP = Number(row.retail_price ?? row.retailPrice ?? row.price) || 0;
  const wholesaleP = Number(row.wholesale_price ?? row.wholesalePrice) || 0;
  const profitM = Number(row.profit_margin ?? row.profitMargin) || 0;
  const stockVal = Number(row.stock ?? row.stockQuantity ?? row.stock_quantity) || 0;
  const dbBatchVal = row.batch_stock ?? row.batchStock;
  const localBatchVal = getLocalBatchStock(idStr);
  const resolvedBatch =
    dbBatchVal !== undefined && dbBatchVal !== null && Number(dbBatchVal) > 0
      ? Math.max(Number(dbBatchVal), stockVal)
      : localBatchVal !== undefined && localBatchVal > 0
      ? Math.max(localBatchVal, stockVal)
      : Math.max(stockVal, 0);
  const qrVal = (row.qr_code as string | null) ?? (row.qrCodeData as string | null) ?? (row.qr_code_data as string | null) ?? (row.qrCode as string | null) ?? null;
  const barcodeVal = (row.barcode as string | null) ?? null;
  const skuVal = (row.sku as string | null) ?? (row.id as string | null) ?? null;
  const rawNotes = (row.notes as string) || "";
  const rawCatName = (row.category_name as string | null) ?? (row.categoryName as string | null) ?? null;
  const notesCat = extractCategoryFromNotes(rawNotes);
  const hasExplicitNotesTag = rawNotes.includes("الفئة:") && notesCat && notesCat !== "عام";

  // إذا كان حقل الملاحظات يحتوي على وسم فئة صريح (مثل "الفئة: بطاريات")، نعطيه الأولوية
  // لمنع أي قيمة قديمة مخزنة في عمود is_all_categories أو category_name من إعادة قفل المنتج على "جميع الاقسام"
  const isAllCats = hasExplicitNotesTag
    ? isUniversalCategory(notesCat)
    : Boolean(row.is_all_categories ?? row.isAllCategories) ||
      isUniversalCategory(rawCatName) ||
      isUniversalCategory(notesCat);

  const catId = isAllCats
    ? null
    : ((row.category_id as string | null) ?? (row.categoryId as string | null) ?? null);
  const catName = isAllCats
    ? ALL_CATEGORIES_LABEL
    : hasExplicitNotesTag
    ? notesCat
    : rawCatName || (notesCat !== "عام" ? notesCat : null);

  const hasImageColumnInRow =
    "image" in row ||
    "image_url" in row ||
    "imageUrl" in row ||
    "original_image_url" in row ||
    "thumbnail_url" in row;

  return {
    id: idStr,
    name: (row.name as string) || "",
    image,
    originalImageUrl: origImage,
    thumbnailUrl: thumbUrl,
    blurDataUrl: blurUrl,
    imageChecked: Boolean(image || thumbUrl || hasImageColumnInRow),
    costPrice: costP,
    wholesalePrice: wholesaleP,
    profitMargin: profitM,
    retailPrice: retailP,
    stock: stockVal,
    batchStock: resolvedBatch,
    supplierId: (row.supplier_id as string) || "",
    notes: rawNotes,
    createdAt: (row.created_at as string) || new Date().toISOString(),
    updatedAt: (row.updated_at as string) || new Date().toISOString(),
    // Comprehensive dual-naming & alias fields
    price: retailP,
    stockQuantity: stockVal,
    qrCodeData: qrVal,
    sku: skuVal,
    categoryId: catId,
    categoryName: catName,
    isAllCategories: isAllCats,
    // Barcode & QR Code fields
    barcode: barcodeVal,
    qrCode: qrVal,
    scanCount: Number(row.scan_count) || 0,
    lastScannedAt: (row.last_scanned_at as string | null) ?? null,
    isBarcodeActive: row.is_barcode_active !== undefined ? Boolean(row.is_barcode_active) : true,
  };
}

export function productToRow(product: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  if ("id" in product && product.id && isUUID(String(product.id))) {
    row.id = product.id;
  }
  if ("name" in product) row.name = product.name;
  if ("image" in product) row.image = product.image || "";

  if ("thumbnailUrl" in product && product.thumbnailUrl !== undefined) {
    row.thumbnail_url = product.thumbnailUrl || null;
  } else if ("thumbnail_url" in product && product.thumbnail_url !== undefined) {
    row.thumbnail_url = product.thumbnail_url || null;
  }

  if ("originalImageUrl" in product && product.originalImageUrl !== undefined) {
    row.original_image_url = product.originalImageUrl || product.image || "";
  } else if ("original_image_url" in product && product.original_image_url !== undefined) {
    row.original_image_url = product.original_image_url || product.image || "";
  } else if ("image" in product && product.image && !("id" in product)) {
    row.original_image_url = product.image;
  }

  // Cost, Wholesale, Retail, Profit Margin — only set when present so partial updates never wipe existing columns
  if ("costPrice" in product || "cost_price" in product) {
    row.cost_price = Number(product.costPrice ?? product.cost_price) || 0;
  }
  if ("price" in product || "retailPrice" in product || "retail_price" in product) {
    row.retail_price = Number(product.price ?? product.retailPrice ?? product.retail_price) || 0;
  }
  if ("wholesalePrice" in product || "wholesale_price" in product) {
    row.wholesale_price = Number(product.wholesalePrice ?? product.wholesale_price) || 0;
  }
  if ("profitMargin" in product || "profit_margin" in product) {
    row.profit_margin = Number(product.profitMargin ?? product.profit_margin) || 0;
  }

  // Stock & Batch Stock Quantity
  if ("stock" in product || "stockQuantity" in product || "stock_quantity" in product) {
    row.stock = Number(product.stockQuantity ?? product.stock_quantity ?? product.stock) || 0;
  }
  if ("batchStock" in product || "batch_stock" in product) {
    row.batch_stock = Math.max(0, Number(product.batchStock ?? product.batch_stock) || 0);
  }

  if ("supplierId" in product || "supplier_id" in product) {
    const sid = String(product.supplierId ?? product.supplier_id ?? "").trim();
    row.supplier_id = isUUID(sid) ? sid : null;
  }

  const hasCategoryOrNotesUpdate =
    "isAllCategories" in product ||
    "is_all_categories" in product ||
    "categoryName" in product ||
    "category_name" in product ||
    "categoryId" in product ||
    "category_id" in product ||
    "notes" in product;

  const notesStr = "notes" in product ? String(product.notes || "") : "";
  const explicitCatName =
    "categoryName" in product
      ? (product.categoryName as string | null)
      : "category_name" in product
      ? (product.category_name as string | null)
      : undefined;

  const notesExtractedCat = "notes" in product ? extractCategoryFromNotes(notesStr) : "";

  let isAllCats = false;
  if ("isAllCategories" in product || "is_all_categories" in product) {
    isAllCats = Boolean(product.isAllCategories ?? product.is_all_categories);
  } else if (explicitCatName !== undefined) {
    isAllCats = isUniversalCategory(explicitCatName);
  } else if ("notes" in product) {
    isAllCats = isUniversalCategory(notesExtractedCat);
  }

  if (hasCategoryOrNotesUpdate) {
    row.is_all_categories = isAllCats;
    if (isAllCats) {
      row.category_name = ALL_CATEGORIES_LABEL;
      row.category_id = null;
    } else {
      const resolvedCatName =
        explicitCatName !== undefined
          ? explicitCatName || null
          : notesExtractedCat && notesExtractedCat !== "عام"
          ? notesExtractedCat
          : null;
      row.category_name = resolvedCatName;

      if (("categoryId" in product && product.categoryId) || ("category_id" in product && product.category_id)) {
        const cid = String(product.categoryId ?? product.category_id ?? "").trim();
        row.category_id = isUUID(cid) ? cid : null;
      } else if ("categoryId" in product && product.categoryId === null) {
        row.category_id = null;
      }
    }
  }

  if ("notes" in product) row.notes = product.notes || "";

  // Barcode & QR Code columns & tracking & SKU
  if ("barcode" in product) row.barcode = product.barcode ?? null;
  
  const qrVal = product.qrCodeData ?? product.qrCode ?? product.qr_code ?? product.qr_code_data;
  if (qrVal !== undefined) row.qr_code = qrVal ?? null;

  if ("sku" in product) row.sku = (product.sku as string | null) ?? null;

  if ("scanCount" in product || "scan_count" in product) {
    row.scan_count = Number(product.scanCount ?? product.scan_count) || 0;
  }
  if ("lastScannedAt" in product || "last_scanned_at" in product) {
    row.last_scanned_at = product.lastScannedAt ?? product.last_scanned_at ?? null;
  }
  if ("isBarcodeActive" in product || "is_barcode_active" in product) {
    row.is_barcode_active = Boolean(product.isBarcodeActive ?? product.is_barcode_active);
  }

  if ("is_active" in product) row.is_active = Boolean(product.is_active);
  if ("is_published" in product) row.is_published = Boolean(product.is_published);
  if ("status" in product) row.status = product.status || "active";
  if ("is_deleted" in product) row.is_deleted = Boolean(product.is_deleted);

  return row;
}

function rowToSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: row.id as string,
    name: (row.name as string) || "",
    phone: (row.phone as string) || "",
    email: (row.email as string) || "",
    address: (row.address as string) || "",
    notes: (row.notes as string) || "",
    createdAt: (row.created_at as string) || new Date().toISOString(),
  };
}

export function supplierToRow(supplier: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("name" in supplier) row.name = supplier.name;
  if ("phone" in supplier) row.phone = supplier.phone || "";
  if ("email" in supplier) row.email = supplier.email || "";
  if ("address" in supplier) row.address = supplier.address || "";
  if ("notes" in supplier) row.notes = supplier.notes || "";
  return row;
}

function rowToCategory(row: Record<string, unknown>): CategoryItem {
  const prio = Number(row.priority) || Number(row.display_order) || Number(row.sort_order) || 1;
  return {
    id: row.id as string,
    name: (row.name as string) || "",
    image: (row.image as string) || (row.image_url as string) || "",
    priority: prio,
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    keywords: (row.keywords as string) || "",
    views: Number(row.views) || 0,
    createdAt: (row.created_at as string) || new Date().toISOString(),
  };
}

export function categoryToRow(cat: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("name" in cat) row.name = cat.name;

  const imgValue = cat.image !== undefined ? cat.image : (cat.image_url !== undefined ? cat.image_url : "");
  row.image = imgValue;
  row.image_url = imgValue;

  if ("priority" in cat) {
    const pVal = Number(cat.priority) || 1;
    row.priority = pVal;
    row.display_order = pVal;
    row.sort_order = pVal;
  }
  if ("isActive" in cat) row.is_active = Boolean(cat.isActive);
  if ("keywords" in cat) row.keywords = cat.keywords || "";
  if ("views" in cat) row.views = Number(cat.views) || 0;
  return row;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [productPricingOverrides, setProductPricingOverrides] = useState<Record<string, ProductPricingOverride>>({});
  const [loading, setLoading] = useState(true);

  // ذاكرة تخزين مؤقت للصور المحملة تدريجياً لتفادي إعادة جلبها أو فقدانها عند تحديث البيانات الخفيفة
  const hydratedImagesRef = React.useRef<
    Map<string, { image: string; originalImageUrl: string; thumbnailUrl?: string | null; blurDataUrl?: string | null }>
  >(new Map());
  const inflightImageIdsRef = React.useRef<Set<string>>(new Set());

  const hydrateProductImages = useCallback(async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const missingIds = Array.from(new Set(ids)).filter(
      (id) => id && !hydratedImagesRef.current.has(id) && !inflightImageIdsRef.current.has(id)
    );
    if (missingIds.length === 0) return;

    missingIds.forEach((id) => inflightImageIdsRef.current.add(id));

    try {
      const CHUNK_SIZE = 20;
      for (let i = 0; i < missingIds.length; i += CHUNK_SIZE) {
        const chunk = missingIds.slice(i, i + CHUNK_SIZE);
        let { data, error } = await supabase
          .from("products")
          .select("id, image, thumbnail_url")
          .in("id", chunk);

        if (error) {
          const fallback = await supabase
            .from("products")
            .select("id, image")
            .in("id", chunk);
          data = fallback.data as any;
        }

        const batchMap = new Map<
          string,
          { image: string; originalImageUrl: string; thumbnailUrl?: string | null; blurDataUrl?: string | null }
        >();

        if (data && data.length > 0) {
          data.forEach((row: Record<string, unknown>) => {
            const pid = row.id as string;
            const img = ((row.image as string) || "").trim();
            const cachedThumb = getCachedProductThumbnail(pid, img);
            const thumb = (row.thumbnail_url as string | null) ?? cachedThumb?.thumbnail ?? null;
            const blur = cachedThumb?.blur ?? null;
            const entry = { image: img, originalImageUrl: img, thumbnailUrl: thumb, blurDataUrl: blur };
            hydratedImagesRef.current.set(pid, entry);
            batchMap.set(pid, entry);
          });
        }

        // Mark any ID in the chunk that returned empty as checked so we never re-query it endlessly
        chunk.forEach((cid) => {
          if (!hydratedImagesRef.current.has(cid)) {
            const emptyEntry = { image: "", originalImageUrl: "", thumbnailUrl: null, blurDataUrl: null };
            hydratedImagesRef.current.set(cid, emptyEntry);
            batchMap.set(cid, emptyEntry);
          }
        });

        if (batchMap.size > 0) {
          setProducts((prev) =>
            prev.map((p) => {
              const hydrated = batchMap.get(p.id);
              if (!hydrated) return p;
              if (
                p.imageChecked === true &&
                p.image === hydrated.image &&
                p.thumbnailUrl === hydrated.thumbnailUrl
              ) {
                return p;
              }
              return {
                ...p,
                image: hydrated.image || p.image,
                originalImageUrl: hydrated.originalImageUrl || p.originalImageUrl || hydrated.image,
                thumbnailUrl: hydrated.thumbnailUrl || p.thumbnailUrl || null,
                blurDataUrl: hydrated.blurDataUrl || p.blurDataUrl || null,
                imageChecked: true,
              };
            })
          );
        }
      }
    } catch (err) {
      console.warn("Lazy image hydration warning:", err);
    } finally {
      missingIds.forEach((id) => inflightImageIdsRef.current.delete(id));
    }
  }, []);

  const fetchAllLightweightProducts = useCallback(async (): Promise<Product[]> => {
    // Strictly lightweight metadata columns (no heavy image/original_image_url Base64 blobs across 5,000 rows)
    const LIGHTWEIGHT_META_COLS =
      "id, name, cost_price, wholesale_price, retail_price, profit_margin, stock, batch_stock, supplier_id, notes, category_id, category_name, is_all_categories, barcode, qr_code, sku, scan_count, last_scanned_at, is_barcode_active, created_at, updated_at";
    const FALLBACK_META_COLS =
      "id, name, cost_price, wholesale_price, retail_price, profit_margin, stock, supplier_id, notes, category_id, barcode, qr_code, created_at, updated_at";

    let rows: Record<string, unknown>[] | null = null;

    const firstTry = await supabase
      .from("products")
      .select(LIGHTWEIGHT_META_COLS)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (!firstTry.error && firstTry.data) {
      rows = firstTry.data as Record<string, unknown>[];
    } else {
      const secondTry = await supabase
        .from("products")
        .select(FALLBACK_META_COLS)
        .order("created_at", { ascending: false })
        .limit(5000);

      if (!secondTry.error && secondTry.data) {
        rows = secondTry.data as Record<string, unknown>[];
      } else {
        const chunkedRows: Record<string, unknown>[] = [];
        const PAGE = 500;
        let offset = 0;
        while (offset < 5000) {
          const { data: pageData, error: pageErr } = await supabase
            .from("products")
            .select(FALLBACK_META_COLS)
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE - 1);

          if (pageErr || !pageData || pageData.length === 0) break;
          chunkedRows.push(...(pageData as unknown as Record<string, unknown>[]));
          if (pageData.length < PAGE) break;
          offset += PAGE;
        }
        rows = chunkedRows;
      }
    }

    const parsed = (rows || []).map((r) => {
      const prod = rowToProduct(r);
      const cachedImg = hydratedImagesRef.current.get(prod.id);
      if (cachedImg) {
        prod.image = cachedImg.image || prod.image;
        prod.originalImageUrl = cachedImg.originalImageUrl || prod.originalImageUrl;
        prod.thumbnailUrl = cachedImg.thumbnailUrl || prod.thumbnailUrl || null;
        prod.blurDataUrl = cachedImg.blurDataUrl || prod.blurDataUrl || null;
        prod.imageChecked = true;
      } else {
        prod.imageChecked = Boolean(prod.image || prod.thumbnailUrl);
      }
      return prod;
    });

    return parsed;
  }, []);

  const autoSyncCategoriesFromProducts = useCallback(async () => {
    try {
      const { data: existingCats } = await supabase.from("categories").select("id, name, image, image_url");
      const existingImageMap = new Map<string, string>();
      if (existingCats) {
        existingCats.forEach((c) => {
          const img = (c.image as string) || (c.image_url as string);
          if (img && img.trim()) {
            existingImageMap.set(c.name.trim().toLowerCase(), img.trim());
          }
        });
      }

      const { data: prodsData } = await supabase.from("products").select("id, notes, category_name");
      if (!prodsData || prodsData.length === 0) return [];

      const categoryMap = new Map<string, { name: string; image: string; sampleProductId?: string }>();

      for (const p of prodsData) {
        const notes = (p.notes as string) || "";
        const rawCat = (p.category_name as string) || extractCategoryFromNotes(notes);
        const catNames = splitCategoryNames(rawCat);
        for (const catName of catNames) {
          if (
            catName &&
            catName !== "عام" &&
            catName !== "غير محدد" &&
            !isUniversalCategory(catName)
          ) {
            const existingImg = existingImageMap.get(catName.trim().toLowerCase());
            if (!categoryMap.has(catName)) {
              categoryMap.set(catName, {
                name: catName,
                image: existingImg || "",
                sampleProductId: existingImg ? undefined : (p.id as string),
              });
            }
          }
        }
      }

      if (categoryMap.size === 0) return [];

      // جلب صور عينات الأقسام التي لا تملك صورة فقط في استعلام خفيف
      const sampleIds = Array.from(categoryMap.values())
        .map((c) => c.sampleProductId)
        .filter((id): id is string => Boolean(id));

      const sampleImgMap = new Map<string, string>();
      if (sampleIds.length > 0) {
        const { data: sampleImgs } = await supabase
          .from("products")
          .select("id, image")
          .in("id", sampleIds.slice(0, 50));
        sampleImgs?.forEach((s) => {
          if (s.id && s.image) sampleImgMap.set(s.id as string, s.image as string);
        });
      }

      const catRows = Array.from(categoryMap.values()).map((cat, idx) => {
        const existingImg =
          existingImageMap.get(cat.name.trim().toLowerCase()) ||
          cat.image ||
          (cat.sampleProductId ? sampleImgMap.get(cat.sampleProductId) || "" : "");
        return {
          name: cat.name,
          image: existingImg,
          image_url: existingImg,
          priority: idx + 1,
          display_order: idx + 1,
          sort_order: idx + 1,
          is_active: true,
          keywords: cat.name,
        };
      });

      const { error } = await supabase
        .from("categories")
        .upsert(catRows, { onConflict: "name" });

      if (error) {
        console.warn("Bulk category upsert warning:", error.message);
      }

      const { data: freshCats } = await supabase.from("categories").select("*").order("priority", { ascending: true });
      if (freshCats && freshCats.length > 0) {
        const parsed = freshCats.map(rowToCategory);
        setCategories(parsed);
        return parsed;
      }
    } catch (err) {
      console.error("Auto sync categories exception:", err);
    }
    return [];
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [loadedProducts, suppliersRes, categoriesRes] = await Promise.all([
          fetchAllLightweightProducts(),
          supabase.from("suppliers").select("*").order("created_at", { ascending: false }),
          supabase.from("categories").select("*").order("priority", { ascending: true }),
        ]);

        const loadedCategories = categoriesRes.data ? categoriesRes.data.map(rowToCategory) : [];
        const loadedSuppliers = suppliersRes.data ? suppliersRes.data.map(rowToSupplier) : [];

        setProducts(loadedProducts);
        if (suppliersRes.data) setSuppliers(loadedSuppliers);
        if (loadedCategories.length > 0) setCategories(loadedCategories);

        if (loadedProducts.length > 0) {
          // ترطيب صور الدفعة الأولى في الخلفية بدون حجب العرض الفوري
          const initialIds = loadedProducts.slice(0, 40).map((p) => p.id);
          hydrateProductImages(initialIds);

          if (loadedCategories.length === 0) {
            const distinctFromProducts = new Set<string>();
            loadedProducts.forEach((p) => {
              const rawCat = p.categoryName || extractCategoryFromNotes(p.notes || "");
              const catList = splitCategoryNames(rawCat);
              catList.forEach((cat) => {
                if (cat && cat !== "عام" && cat !== "غير محدد" && !isUniversalCategory(cat)) {
                  distinctFromProducts.add(cat);
                }
              });
            });

            if (distinctFromProducts.size > 0) {
              const catRows = Array.from(distinctFromProducts).map((catName, idx) => ({
                name: catName,
                image: "",
                image_url: "",
                priority: idx + 1,
                display_order: idx + 1,
                sort_order: idx + 1,
                is_active: true,
                keywords: catName,
              }));

              supabase.from("categories").upsert(catRows, { onConflict: "name" }).then(async () => {
                const { data: fresh } = await supabase.from("categories").select("*").order("priority", { ascending: true });
                if (fresh && fresh.length > 0) setCategories(fresh.map(rowToCategory));
              });
            }
          }
        }
      } catch (err) {
        console.error("DataProvider loadData error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();

    const channel = supabase
      .channel("public:all_data")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "categories" }, async () => {
        const { data } = await supabase.from("categories").select("*").order("priority", { ascending: true });
        if (data) setCategories(data.map(rowToCategory));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "categories" }, async () => {
        const { data } = await supabase.from("categories").select("*").order("priority", { ascending: true });
        if (data) setCategories(data.map(rowToCategory));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, async () => {
        const refreshed = await fetchAllLightweightProducts();
        if (refreshed.length > 0) setProducts(refreshed);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers" }, async () => {
        const { data } = await supabase.from("suppliers").select("*").order("created_at", { ascending: false });
        if (data) setSuppliers(data.map(rowToSupplier));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAllLightweightProducts, hydrateProductImages]);

  // مزامنة جدول الربط المتعدد (product_categories) في الخلفية بدون إبطاء الحفظ
  const syncProductCategoriesJunction = useCallback(
    async (productId: string, categoryNameStr: string | null | undefined, isAllCats: boolean | undefined) => {
      if (!productId || !isUUID(productId)) return;
      try {
        await supabase.from("product_categories").delete().eq("product_id", productId);
        if (isAllCats || !categoryNameStr || isUniversalCategory(categoryNameStr)) return;
        const names = splitCategoryNames(categoryNameStr);
        if (names.length === 0) return;

        const catIds = names
          .map((n) => categories.find((c) => c.name.trim().toLowerCase() === n.toLowerCase())?.id)
          .filter((cid): cid is string => Boolean(cid && isUUID(cid)));

        if (catIds.length > 0) {
          const rows = Array.from(new Set(catIds)).map((category_id) => ({
            product_id: productId,
            category_id,
          }));
          await supabase.from("product_categories").upsert(rows, { onConflict: "product_id,category_id" });
        }
      } catch {
        // جدول product_categories اختياري إلى حين تشغيل كود SQL من قبل المستخدم
      }
    },
    [categories]
  );

  const addProduct = useCallback(async (product: Omit<Product, "id" | "createdAt" | "updatedAt">) => {
    let finalImageUrl = product.image || "";
    const originalImageUrl = product.originalImageUrl || product.image || "";
    const thumbnailUrl = product.thumbnailUrl || null;
    const blurDataUrl = product.blurDataUrl || null;

    if (finalImageUrl) {
      finalImageUrl = await applyWatermarkIfNeeded(finalImageUrl);
    }

    const effectiveBatch = Math.max(Number(product.batchStock ?? product.stock) || 0, Number(product.stock) || 0);
    const row = productToRow({
      ...product,
      batchStock: effectiveBatch,
      image: finalImageUrl,
      originalImageUrl: originalImageUrl,
      thumbnailUrl: thumbnailUrl,
    } as Record<string, unknown>);

    let { data: created, error } = await supabase.from("products").insert(row).select().single();
    if (
      error &&
      (error.message?.includes("batch_stock") ||
        error.message?.includes("is_all_categories") ||
        error.message?.includes("category_name") ||
        error.message?.includes("thumbnail_url") ||
        error.code === "PGRST204")
    ) {
      const fallbackRow = { ...row };
      if (error.message?.includes("batch_stock") || error.code === "PGRST204") delete fallbackRow.batch_stock;
      if (error.message?.includes("is_all_categories") || error.code === "PGRST204") delete fallbackRow.is_all_categories;
      if (error.message?.includes("category_name") || error.code === "PGRST204") delete fallbackRow.category_name;
      if (error.message?.includes("thumbnail_url") || error.code === "PGRST204") delete fallbackRow.thumbnail_url;
      const retry = await supabase.from("products").insert(fallbackRow).select().single();
      created = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    if (created?.id) {
      const createdId = String(created.id);
      setLocalBatchStock(createdId, effectiveBatch);
      if (thumbnailUrl) {
        cacheProductThumbnail(createdId, thumbnailUrl, blurDataUrl || undefined);
      }
      if (finalImageUrl) {
        hydratedImagesRef.current.set(createdId, {
          image: finalImageUrl,
          originalImageUrl,
          thumbnailUrl,
          blurDataUrl,
        });
      }
      syncProductCategoriesJunction(createdId, product.categoryName, product.isAllCategories);
    }
    const parsedCreated = rowToProduct(created);
    const newProduct: Product = {
      ...parsedCreated,
      thumbnailUrl: thumbnailUrl || parsedCreated.thumbnailUrl || null,
      blurDataUrl: blurDataUrl || parsedCreated.blurDataUrl || null,
      categoryName: product.categoryName !== undefined ? product.categoryName : parsedCreated.categoryName,
      categoryId: product.categoryId !== undefined ? product.categoryId : parsedCreated.categoryId,
      isAllCategories: product.isAllCategories !== undefined ? product.isAllCategories : parsedCreated.isAllCategories,
      batchStock: effectiveBatch,
    };
    setProducts((prev) => [newProduct, ...prev]);
    return newProduct;
  }, [syncProductCategoriesJunction]);

  const updateProduct = useCallback(async (id: string, updates: Partial<Product>) => {
    let finalUpdates = { ...updates };
    const existingProduct = products.find((p) => p.id === id);

    if (updates.thumbnailUrl) {
      cacheProductThumbnail(id, updates.thumbnailUrl, updates.blurDataUrl || undefined);
    }

    if (updates.image) {
      const originalToKeep = updates.originalImageUrl || existingProduct?.originalImageUrl || updates.image;
      const watermarkedImg = await applyWatermarkIfNeeded(updates.image);
      const resolvedThumb =
        updates.thumbnailUrl !== undefined
          ? updates.thumbnailUrl
          : existingProduct?.thumbnailUrl ?? null;
      const resolvedBlur =
        updates.blurDataUrl !== undefined
          ? updates.blurDataUrl
          : existingProduct?.blurDataUrl ?? null;

      finalUpdates.image = watermarkedImg;
      finalUpdates.originalImageUrl = originalToKeep;
      hydratedImagesRef.current.set(id, {
        image: watermarkedImg,
        originalImageUrl: originalToKeep,
        thumbnailUrl: resolvedThumb,
        blurDataUrl: resolvedBlur,
      });
    }

    if (finalUpdates.batchStock !== undefined) {
      setLocalBatchStock(id, finalUpdates.batchStock);
    } else if (finalUpdates.stock !== undefined && existingProduct) {
      const currentBatch = existingProduct.batchStock ?? existingProduct.stock ?? 0;
      if (finalUpdates.stock > currentBatch) {
        finalUpdates.batchStock = finalUpdates.stock;
        setLocalBatchStock(id, finalUpdates.stock);
      }
    }

    const row = productToRow(finalUpdates as Record<string, unknown>);

    let { data: updated, error } = await supabase.from("products").update(row).eq("id", id).select().single();
    if (
      error &&
      (error.message?.includes("batch_stock") ||
        error.message?.includes("is_all_categories") ||
        error.message?.includes("category_name") ||
        error.message?.includes("thumbnail_url") ||
        error.code === "PGRST204")
    ) {
      const fallbackRow = { ...row };
      if (error.message?.includes("batch_stock") || error.code === "PGRST204") delete fallbackRow.batch_stock;
      if (error.message?.includes("is_all_categories") || error.code === "PGRST204") delete fallbackRow.is_all_categories;
      if (error.message?.includes("category_name") || error.code === "PGRST204") delete fallbackRow.category_name;
      if (error.message?.includes("thumbnail_url") || error.code === "PGRST204") delete fallbackRow.thumbnail_url;
      const retry = await supabase.from("products").update(fallbackRow).eq("id", id).select().single();
      updated = retry.data;
      error = retry.error;
    }
    if (error) throw error;

    if (
      "categoryName" in finalUpdates ||
      "isAllCategories" in finalUpdates ||
      "notes" in finalUpdates
    ) {
      const resolvedCatName =
        finalUpdates.categoryName !== undefined
          ? finalUpdates.categoryName
          : finalUpdates.notes !== undefined
          ? extractCategoryFromNotes(finalUpdates.notes)
          : existingProduct?.categoryName;
      const resolvedAll =
        finalUpdates.isAllCategories !== undefined
          ? finalUpdates.isAllCategories
          : isUniversalCategory(resolvedCatName);
      syncProductCategoriesJunction(id, resolvedCatName, resolvedAll);
    }

    const parsedUpdated = rowToProduct(updated);
    const resolvedBatch =
      finalUpdates.batchStock !== undefined
        ? finalUpdates.batchStock
        : parsedUpdated.batchStock;
    const cachedImg = hydratedImagesRef.current.get(id);
    const product: Product = {
      ...parsedUpdated,
      categoryName:
        finalUpdates.categoryName !== undefined
          ? finalUpdates.categoryName
          : parsedUpdated.categoryName,
      categoryId:
        finalUpdates.categoryId !== undefined
          ? finalUpdates.categoryId
          : parsedUpdated.categoryId,
      isAllCategories:
        finalUpdates.isAllCategories !== undefined
          ? finalUpdates.isAllCategories
          : parsedUpdated.isAllCategories,
      image: parsedUpdated.image || cachedImg?.image || existingProduct?.image || "",
      originalImageUrl:
        parsedUpdated.originalImageUrl ||
        cachedImg?.originalImageUrl ||
        existingProduct?.originalImageUrl ||
        "",
      thumbnailUrl:
        finalUpdates.thumbnailUrl !== undefined
          ? finalUpdates.thumbnailUrl
          : parsedUpdated.thumbnailUrl || cachedImg?.thumbnailUrl || existingProduct?.thumbnailUrl || null,
      blurDataUrl:
        finalUpdates.blurDataUrl !== undefined
          ? finalUpdates.blurDataUrl
          : parsedUpdated.blurDataUrl || cachedImg?.blurDataUrl || existingProduct?.blurDataUrl || null,
      batchStock: resolvedBatch,
    };
    setProducts((prev) => prev.map((p) => (p.id === id ? product : p)));
  }, [products, syncProductCategoriesJunction]);

  const bulkUpdateProducts = useCallback(async (ids: string[], updates: Partial<Product>) => {
    if (!ids || ids.length === 0) return;
    const row = productToRow(updates as Record<string, unknown>);
    const chunkSize = 150;

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      let { error } = await supabase.from("products").update(row).in("id", chunk);
      if (
        error &&
        (error.message?.includes("batch_stock") ||
          error.message?.includes("is_all_categories") ||
          error.message?.includes("category_name") ||
          error.message?.includes("thumbnail_url") ||
          error.code === "PGRST204")
      ) {
        const fallbackRow = { ...row };
        if (error.message?.includes("batch_stock") || error.code === "PGRST204") delete fallbackRow.batch_stock;
        if (error.message?.includes("is_all_categories") || error.code === "PGRST204") delete fallbackRow.is_all_categories;
        if (error.message?.includes("category_name") || error.code === "PGRST204") delete fallbackRow.category_name;
        if (error.message?.includes("thumbnail_url") || error.code === "PGRST204") delete fallbackRow.thumbnail_url;
        const retry = await supabase.from("products").update(fallbackRow).in("id", chunk);
        error = retry.error;
      }
      if (error) throw error;
    }

    const idSet = new Set(ids);
    setProducts((prev) =>
      prev.map((p) => (idSet.has(p.id) ? { ...p, ...updates } : p))
    );
  }, []);

  const deleteProduct = useCallback(async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const bulkDeleteProducts = useCallback(async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { error } = await supabase.from("products").delete().in("id", chunk);
      if (error) throw error;
    }
    const idSet = new Set(ids);
    setProducts((prev) => prev.filter((p) => !idSet.has(p.id)));
  }, []);

  const addSupplier = useCallback(async (supplier: Omit<Supplier, "id" | "createdAt">) => {
    const row = supplierToRow(supplier as Record<string, unknown>);
    const { data: created, error } = await supabase.from("suppliers").insert(row).select().single();
    if (error) throw error;
    const newSupplier = rowToSupplier(created);
    setSuppliers((prev) => [newSupplier, ...prev]);
    return newSupplier;
  }, []);

  const updateSupplier = useCallback(async (id: string, updates: Partial<Supplier>) => {
    const row = supplierToRow(updates as Record<string, unknown>);
    const { data: updated, error } = await supabase.from("suppliers").update(row).eq("id", id).select().single();
    if (error) throw error;
    const supplier = rowToSupplier(updated);
    setSuppliers((prev) => prev.map((s) => (s.id === id ? supplier : s)));
  }, []);

  const deleteSupplier = useCallback(async (id: string) => {
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) throw error;
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const addCategory = useCallback(async (cat: Omit<CategoryItem, "id">): Promise<CategoryItem> => {
    const row = categoryToRow(cat as Record<string, unknown>);
    let createdRow: Record<string, unknown> | null = null;

    const { data: created, error } = await supabase
      .from("categories")
      .upsert({ ...row, name: cat.name }, { onConflict: "name" })
      .select()
      .maybeSingle();

    if (!error && created) {
      createdRow = created;
    } else if (error) {
      console.warn("Primary addCategory error:", error.message);
      const altRow: Record<string, unknown> = { ...row, name: cat.name, image_url: cat.image };
      const { data: altCreated } = await supabase
        .from("categories")
        .upsert(altRow, { onConflict: "name" })
        .select()
        .maybeSingle();
      if (altCreated) createdRow = altCreated;
    }

    if (!createdRow) {
      const localCat: CategoryItem = { id: Date.now().toString(), ...cat };
      setCategories((prev) => [...prev.filter((c) => c.name.toLowerCase() !== localCat.name.toLowerCase()), localCat].sort((a, b) => (a.priority || 0) - (b.priority || 0)));
      return localCat;
    }

    const newCat = rowToCategory(createdRow);
    setCategories((prev) => {
      const filtered = prev.filter((c) => c.name.toLowerCase() !== newCat.name.toLowerCase());
      return [...filtered, newCat].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    });

    return newCat;
  }, []);

  const updateCategory = useCallback(async (id: string, updates: Partial<CategoryItem>): Promise<CategoryItem> => {
    const row = categoryToRow(updates as Record<string, unknown>);

    // ضمان توفر كلا الحقلين في الحمولة المرسلة لقاعدة البيانات
    if (updates.image !== undefined) {
      row.image = updates.image;
      row.image_url = updates.image;
    }

    let updatedRow: Record<string, unknown> | null = null;

    if (isUUID(id)) {
      const { data, error } = await supabase.from("categories").update(row).eq("id", id).select().maybeSingle();
      if (!error && data) {
        updatedRow = data;
      }
    }

    if (!updatedRow && updates.name) {
      const { data: upsertData } = await supabase
        .from("categories")
        .upsert({ ...row, name: updates.name }, { onConflict: "name" })
        .select()
        .maybeSingle();
      if (upsertData) updatedRow = upsertData;
    }

    const finalCat: CategoryItem = updatedRow ? rowToCategory(updatedRow) : { 
      id, 
      name: updates.name || "", 
      image: updates.image || "", 
      priority: updates.priority || 1, 
      isActive: updates.isActive !== false, 
      keywords: updates.keywords || "" 
    };

    setCategories((prev) => {
      const existingIdx = prev.findIndex((c) => c.id === id || c.name.toLowerCase() === finalCat.name.toLowerCase());
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], ...finalCat };
        return next.sort((a, b) => (a.priority || 0) - (b.priority || 0));
      }
      return [...prev, finalCat].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    });

    return finalCat;
  }, []);

  const deleteCategory = useCallback(async (id: string) => {
    await supabase.from("categories").delete().eq("id", id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const incrementCategoryViews = useCallback(async (catIdOrName: string) => {
    if (!catIdOrName || catIdOrName.startsWith("auto-")) return;
    try {
      const target = categories.find(
        (c) => c.id === catIdOrName || c.name.toLowerCase() === catIdOrName.toLowerCase()
      );
      if (!target || !isUUID(target.id)) return;
      const newViews = (target.views || 0) + 1;
      await supabase.from("categories").update({ views: newViews }).eq("id", target.id);
    } catch {
      /* non-blocking view tracking */
    }
  }, [categories]);

  const reloadAllData = useCallback(async () => {
    const [loadedProducts, suppliersRes, categoriesRes, overridesRes] = await Promise.all([
      fetchAllLightweightProducts(),
      supabase.from("suppliers").select("*").order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("priority", { ascending: true }),
      supabase.from("product_pricing_overrides").select("*"),
    ]);
    setProducts(loadedProducts);
    if (loadedProducts.length > 0) {
      hydrateProductImages(loadedProducts.slice(0, 40).map((p) => p.id));
    }
    if (suppliersRes.data) setSuppliers(suppliersRes.data.map(rowToSupplier));
    if (categoriesRes.data) setCategories(categoriesRes.data.map(rowToCategory));
    if (overridesRes.data) {
      const map: Record<string, ProductPricingOverride> = {};
      overridesRes.data.forEach((row) => {
        const override = overrideFromRow(row as Record<string, unknown>);
        map[override.productId] = override;
      });
      setProductPricingOverrides(map);
    }
  }, [fetchAllLightweightProducts, hydrateProductImages]);

  const persistAllCategoriesAndProducts = useCallback(async (catsToSave: CategoryItem[], prodsToSave: Product[]) => {
    if (catsToSave.length > 0) {
      const { data: currentCats } = await supabase.from("categories").select("name, image, image_url");
      const imgMap = new Map<string, string>();
      currentCats?.forEach(c => {
        const img = (c.image as string) || (c.image_url as string);
        if (img) imgMap.set(c.name.trim().toLowerCase(), img);
      });

      const catRows = catsToSave.map((c) => {
        const existingImg = imgMap.get(c.name.trim().toLowerCase());
        const finalImg = (c.image && c.image.trim()) ? c.image.trim() : (existingImg || "");
        const r: Record<string, unknown> = {
          name: c.name,
          image: finalImg,
          image_url: finalImg,
          priority: Number(c.priority) || 1,
          is_active: c.isActive !== false,
          keywords: c.keywords || "",
        };
        if (c.id && isUUID(c.id)) {
          r.id = c.id;
        }
        return r;
      });

      await supabase.from("categories").upsert(catRows, { onConflict: "name" });
    }

    if (prodsToSave.length > 0) {
      const CHUNK_SIZE = 50;
      const prodRows = prodsToSave.map((p) => {
        const rawCopy: Record<string, unknown> = { ...(p as unknown as Record<string, unknown>) };
        // عدم مسح الصورة في قاعدة البيانات إذا لم تكن قد حُملت كسولاً بعد في الذاكرة
        if (!rawCopy.image && !hydratedImagesRef.current.has(p.id)) {
          delete rawCopy.image;
          delete rawCopy.originalImageUrl;
        }
        return productToRow(rawCopy);
      });
      for (let i = 0; i < prodRows.length; i += CHUNK_SIZE) {
        await supabase.from("products").upsert(prodRows.slice(i, i + CHUNK_SIZE));
      }
    }

    await reloadAllData();
    return true;
  }, [reloadAllData]);

  const importProducts = useCallback(
    async (
      rawItems: Omit<Product, "id" | "createdAt" | "updatedAt">[],
      onProgress?: (processed: number, total: number) => void
    ) => {
      if (!rawItems || rawItems.length === 0) return 0;

      const uniqueItemsMap = new Map<string, Omit<Product, "id" | "createdAt" | "updatedAt">>();
      rawItems.forEach((item) => {
        if (item.name) {
          const cleanName = item.name.trim();
          if (cleanName) {
            uniqueItemsMap.set(cleanName.toLowerCase(), { ...item, name: cleanName });
          }
        }
      });
      const items = Array.from(uniqueItemsMap.values());

      const { data: existingCatsForImport } = await supabase.from("categories").select("name, image, image_url");
      const importImgMap = new Map<string, string>();
      existingCatsForImport?.forEach(c => {
        const img = (c.image as string) || (c.image_url as string);
        if (img) importImgMap.set(c.name.trim().toLowerCase(), img);
      });

      const categoryNames = new Set<string>();
      items.forEach((item) => {
        const match = (item.notes || "").match(/الفئة:\s*([^|]+)/);
        if (match && match[1]) {
          const catName = match[1].trim();
          if (catName && !["عام", "غير محدد", "غير مصنف"].includes(catName) && !isUniversalCategory(catName)) {
            categoryNames.add(catName);
          }
        }
      });

      const categoryIdMap = new Map<string, string>();

      if (categoryNames.size > 0) {
        const catRows = Array.from(categoryNames).map((cName, idx) => {
          const existingImg = importImgMap.get(cName.trim().toLowerCase()) || "";
          return {
            name: cName,
            image: existingImg,
            image_url: existingImg,
            priority: idx + 1,
            display_order: idx + 1,
            sort_order: idx + 1,
            is_active: true,
            keywords: cName,
          };
        });

        const { data: catData } = await supabase
          .from("categories")
          .upsert(catRows, { onConflict: "name" })
          .select("id, name");

        if (catData) {
          catData.forEach((c) => {
            if (c.id && c.name) {
              categoryIdMap.set(c.name.trim().toLowerCase(), c.id);
            }
          });
        }
      }

      const productCategoryPairs: { productName: string; categoryId: string }[] = [];

      const rows = await Promise.all(
        items.map(async (item) => {
          let finalImg = item.image || "";
          const origImg = item.originalImageUrl || item.image || "";

          if (finalImg) {
            finalImg = await applyWatermarkIfNeeded(finalImg);
          }

          const row = productToRow({
            ...item,
            image: finalImg,
            originalImageUrl: origImg,
          } as Record<string, unknown>);

          const match = (item.notes || "").match(/الفئة:\s*([^|]+)/);
          if (match && match[1]) {
            const catNameClean = match[1].trim().toLowerCase();
            const mappedCatId = categoryIdMap.get(catNameClean);
            if (mappedCatId) {
              row.category_id = mappedCatId;
              productCategoryPairs.push({
                productName: item.name.trim(),
                categoryId: mappedCatId,
              });
            }
          }
          return row;
        })
      );

      const CHUNK_SIZE = 50;
      let processed = 0;
      const total = rows.length;
      const createdProductMap = new Map<string, string>();

      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);

        const { data: insertedProducts, error } = await supabase
          .from("products")
          .upsert(chunk, { onConflict: "name" })
          .select("id, name");

        if (error) {
          throw new Error(`فشل حفظ المنتجات في Supabase: ${error.message}`);
        }

        if (insertedProducts) {
          insertedProducts.forEach((p) => {
            if (p.id && p.name) {
              createdProductMap.set(p.name.trim().toLowerCase(), p.id);
            }
          });
        }

        processed += chunk.length;
        if (onProgress) {
          onProgress(processed, total);
        }
      }

      const junctionRowsToInsert: { product_id: string; category_id: string }[] = [];
      productCategoryPairs.forEach((pair) => {
        const productId = createdProductMap.get(pair.productName.toLowerCase());
        if (productId && pair.categoryId) {
          junctionRowsToInsert.push({
            product_id: productId,
            category_id: pair.categoryId,
          });
        }
      });

      if (junctionRowsToInsert.length > 0) {
        try {
          for (let j = 0; j < junctionRowsToInsert.length; j += CHUNK_SIZE) {
            const jChunk = junctionRowsToInsert.slice(j, j + CHUNK_SIZE);
            await supabase
              .from("product_categories")
              .upsert(jChunk, { onConflict: "product_id,category_id", ignoreDuplicates: true });
          }
        } catch (jError) {
          console.warn("تحذير الجدول الوسيط:", jError);
        }
      }

      await reloadAllData();
      return items.length;
    },
    [reloadAllData]
  );

  const exportAllData = useCallback(() => {
    const categoryIdToName = new Map<string, string>();
    const categoryNameToId = new Map<string, string>();
    categories.forEach((c) => {
      if (c.id && c.name) {
        categoryIdToName.set(c.id, c.name);
        categoryNameToId.set(c.name.trim().toLowerCase(), c.id);
      }
    });

    // جلب إعدادات المتجر ومعلومات التواصل والسوشيال ميديا من الكاش المحلي إن وجدت
    let siteSettings = {};
    try {
      const cached = localStorage.getItem("app_site_settings_cache");
      if (cached) siteSettings = JSON.parse(cached);
    } catch (e) {
      console.warn("Could not load settings cache for backup", e);
    }

    const enrichedProducts = products.map((p) => {
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
      };
    });

    return {
      version: "2.0",
      exportDate: new Date().toISOString(),
      storeName: "موقع أحمد بحري",
      settings: siteSettings, // تضمين إعدادات الموقع، التواصل، والسوشيال ميديا بالكامل
      totalProducts: enrichedProducts.length,
      totalCategories: categories.length,
      totalSuppliers: suppliers.length,
      products: enrichedProducts as Product[],
      categories,
      suppliers,
      exportedAt: new Date().toISOString(),
    };
  }, [products, suppliers, categories]);

  const importAllData = useCallback(
    async (
      data: { products?: any[]; suppliers?: Supplier[]; categories?: CategoryItem[]; settings?: any },
      onProgress?: (info: { stage: string; current: number; total: number; percentage: number }) => void
    ) => {
      // 1. استعادة إعدادات المتجر ومعلومات التواصل والسوشيال ميديا إن وجدت في النسخة
      if (data.settings) {
        try {
          localStorage.setItem("app_site_settings_cache", JSON.stringify(data.settings));
          window.dispatchEvent(new Event("storage"));
        } catch (e) {
          console.error("Failed to restore settings cache", e);
        }
      }

      // 2. تجميع واستكمال التصنيفات الضمنية (من أسماء التصنيفات والملاحظات) أولاً
      const catMapToUpsert = new Map<string, { name: string; priority: number; is_active: boolean }>();

      if (data.categories && data.categories.length > 0) {
        data.categories.forEach((c) => {
          if (c.name && c.name.trim() && !isUniversalCategory(c.name)) {
            catMapToUpsert.set(c.name.trim().toLowerCase(), {
              name: c.name.trim(),
              priority: c.priority || 1,
              is_active: c.isActive !== undefined ? Boolean(c.isActive) : true,
            });
          }
        });
      }

      if (data.products && data.products.length > 0) {
        data.products.forEach((p) => {
          const rawCatName = p.categoryName || p.category_name;
          const notesCatName = extractCategoryFromNotes(p.notes || "");
          const candidateCat = (rawCatName || (notesCatName !== "عام" ? notesCatName : null)) as string | null;
          if (candidateCat && candidateCat.trim() && !isUniversalCategory(candidateCat)) {
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
      }

      if (catMapToUpsert.size > 0) {
        onProgress?.({ stage: "جاري رفع واستعادة التصنيفات الأقسام...", current: 1, total: 3, percentage: 10 });
        const catRows = Array.from(catMapToUpsert.values());
        await supabase.from("categories").upsert(catRows, { onConflict: "name" });
      }

      if (data.suppliers && data.suppliers.length > 0) {
        onProgress?.({ stage: "جاري استعادة الموردين...", current: 2, total: 3, percentage: 20 });
        const supRows = data.suppliers.map((s) => supplierToRow(s as unknown as Record<string, unknown>));
        await supabase.from("suppliers").upsert(supRows, { onConflict: "name" });
      }

      // جلب التصنيفات المحدثة من Supabase لمطابقة الـ UUIDs
      const { data: freshCats } = await supabase.from("categories").select("id, name");
      const categoryNameToId = new Map<string, string>();
      freshCats?.forEach((c) => {
        if (c.name && c.id) categoryNameToId.set(c.name.trim().toLowerCase(), c.id);
      });

      // 3. استعادة المنتجات بكافة حقولها وتوزيعها على دفعات لضمان عدم ثقل المتصفح
      if (data.products && data.products.length > 0) {
        const totalProds = data.products.length;
        const rows = data.products.map((p) => {
          const row = productToRow(p as Record<string, unknown>);
          if (!row.category_id) {
            const rawCatName = p.categoryName || p.category_name;
            const notesCatName = extractCategoryFromNotes(p.notes || "");
            const candidateCat = rawCatName || (notesCatName !== "عام" ? notesCatName : "");
            if (candidateCat) {
              const mappedId = categoryNameToId.get(String(candidateCat).trim().toLowerCase());
              if (mappedId) row.category_id = mappedId;
            }
          }
          return row;
        });

        const CHUNK_SIZE = 50;
        for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_SIZE);
          const currentCount = Math.min(i + CHUNK_SIZE, totalProds);
          const percentage = Math.round(20 + (currentCount / totalProds) * 80);

          onProgress?.({
            stage: `جاري استعادة المنتجات (الدفعة ${Math.floor(i / CHUNK_SIZE) + 1} من ${Math.ceil(totalProds / CHUNK_SIZE)})...`,
            current: currentCount,
            total: totalProds,
            percentage,
          });

          const { error: upsertErr } = await supabase.from("products").upsert(chunk, { onConflict: "name" });
          if (upsertErr) {
            console.error("Batch upsert error during backup restore:", upsertErr.message);
          }
        }
      }

      await reloadAllData();
    },
    [reloadAllData]
  );

  // ─ Pricing override operations ──────────────────────────────────────────

  const upsertPricingOverride = useCallback(async (override: ProductPricingOverride) => {
    const { overrideToRow } = await import("./pricing-engine");
    const row = overrideToRow(override);
    const { error } = await supabase
      .from("product_pricing_overrides")
      .upsert(row, { onConflict: "product_id" });
    if (error) {
      console.error("Error upserting pricing override:", error.message);
      return;
    }
    setProductPricingOverrides((prev) => ({
      ...prev,
      [override.productId]: override,
    }));
  }, []);

  const getEffectiveTiers = useCallback(
    (productId: string, globalConfig?: GlobalPricingConfig) => {
      const cfg = globalConfig ?? DEFAULT_PRICING_CONFIG;
      const override = productPricingOverrides[productId];
      return engineGetEffectiveTiers(cfg, override);
    },
    [productPricingOverrides]
  );

  return (
    <DataContext.Provider
      value={{
        products, suppliers, categories, loading,
        addProduct, updateCategory: updateCategory, updateProduct, bulkUpdateProducts, deleteProduct, bulkDeleteProducts,
        addSupplier, updateSupplier, deleteSupplier,
        addCategory, deleteCategory, incrementCategoryViews,
        autoSyncCategoriesFromProducts,
        persistAllCategoriesAndProducts, reloadAllData,
        importProducts, exportAllData, importAllData,
        productPricingOverrides, getEffectiveTiers, upsertPricingOverride,
        // ─ Barcode / QR instant in-memory lookup ────────────────────────────
        lookupProductByBarcode: (code: string): Product | null => {
          if (!code?.trim()) return null;
          const cleaned = code.trim();
          return (
            products.find(
              (p) =>
                (p.barcode && p.barcode === cleaned) ||
                (p.qrCode && p.qrCode === cleaned)
            ) ?? null
          );
        },
        hydrateProductImages,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) throw new Error("useData must be used within DataProvider");
  return context;
}
