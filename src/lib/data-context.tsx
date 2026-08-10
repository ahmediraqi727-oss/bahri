"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Product, Supplier, CategoryItem } from "./types";
import { supabase } from "./supabase-client";

export function extractCategoryFromNotes(notes: string): string {
  if (!notes) return "عام";
  const str = notes.trim();
  if (str.includes("الفئة:")) {
    const after = str.split("الفئة:")[1];
    if (after) {
      const cat = after.split("|")[0]?.split("\n")[0]?.trim();
      if (cat) return cat;
    }
  }
  const firstPart = str.split("|")[0]?.split("\n")[0]?.trim();
  if (firstPart && firstPart.length <= 40 && !firstPart.includes(":")) {
    return firstPart;
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
  exportAllData: () => { products: Product[]; suppliers: Supplier[]; categories: CategoryItem[]; exportedAt: string };
  importAllData: (data: { products?: Product[]; suppliers?: Supplier[]; categories?: CategoryItem[] }) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

function rowToProduct(row: Record<string, unknown>): Product {
  const image = (row.image as string) || "";
  const origImage = (row.original_image_url as string) || image || "";
  return {
    id: row.id as string,
    name: (row.name as string) || "",
    image,
    originalImageUrl: origImage,
    costPrice: Number(row.cost_price) || 0,
    wholesalePrice: Number(row.wholesale_price) || 0,
    profitMargin: Number(row.profit_margin) || 0,
    retailPrice: Number(row.retail_price) || 0,
    stock: Number(row.stock) || 0,
    supplierId: (row.supplier_id as string) || "",
    notes: (row.notes as string) || "",
    createdAt: (row.created_at as string) || new Date().toISOString(),
    updatedAt: (row.updated_at as string) || new Date().toISOString(),
  };
}

export function productToRow(product: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  if ("name" in product) row.name = product.name;
  if ("image" in product) row.image = product.image || "";

  if ("originalImageUrl" in product && product.originalImageUrl !== undefined) {
    row.original_image_url = product.originalImageUrl || product.image || "";
  } else if ("original_image_url" in product && product.original_image_url !== undefined) {
    row.original_image_url = product.original_image_url || product.image || "";
  } else if ("image" in product && product.image && !("id" in product)) {
    row.original_image_url = product.image;
  }

  if ("costPrice" in product || "cost_price" in product) {
    row.cost_price = Number(product.costPrice ?? product.cost_price) || 0;
  }
  if ("wholesalePrice" in product || "wholesale_price" in product) {
    row.wholesale_price = Number(product.wholesalePrice ?? product.wholesale_price) || 0;
  }
  if ("profitMargin" in product || "profit_margin" in product) {
    row.profit_margin = Number(product.profitMargin ?? product.profit_margin) || 0;
  }
  if ("retailPrice" in product || "retail_price" in product) {
    row.retail_price = Number(product.retailPrice ?? product.retail_price) || 0;
  }
  if ("stock" in product) row.stock = Number(product.stock) || 0;

  if ("supplierId" in product || "supplier_id" in product) {
    const sid = String(product.supplierId ?? product.supplier_id ?? "").trim();
    row.supplier_id = isUUID(sid) ? sid : null;
  }
  if ("category_id" in product && product.category_id) {
    const cid = String(product.category_id).trim();
    if (isUUID(cid)) row.category_id = cid;
  }
  if ("notes" in product) row.notes = product.notes || "";

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
  const [loading, setLoading] = useState(true);

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

      const { data: prodsData } = await supabase.from("products").select("notes, image");
      if (!prodsData || prodsData.length === 0) return [];

      const categoryMap = new Map<string, { name: string; image: string }>();

      for (const p of prodsData) {
        const notes = (p.notes as string) || "";
        const catName = extractCategoryFromNotes(notes);
        if (catName && catName !== "عام" && catName !== "غير محدد") {
          const existingImg = existingImageMap.get(catName.trim().toLowerCase());
          if (!categoryMap.has(catName)) {
            categoryMap.set(catName, { 
              name: catName, 
              image: existingImg || (p.image as string) || "" 
            });
          }
        }
      }

      if (categoryMap.size === 0) return [];

      const catRows = Array.from(categoryMap.values()).map((cat, idx) => {
        const existingImg = existingImageMap.get(cat.name.trim().toLowerCase()) || cat.image;
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
        const [productsRes, suppliersRes, categoriesRes] = await Promise.all([
          supabase.from("products").select("*").order("created_at", { ascending: false }),
          supabase.from("suppliers").select("*").order("created_at", { ascending: false }),
          supabase.from("categories").select("*").order("priority", { ascending: true }),
        ]);

        const loadedProducts = productsRes.data ? productsRes.data.map(rowToProduct) : [];
        const loadedCategories = categoriesRes.data ? categoriesRes.data.map(rowToCategory) : [];
        const loadedSuppliers = suppliersRes.data ? suppliersRes.data.map(rowToSupplier) : [];

        if (productsRes.data) setProducts(loadedProducts);
        if (suppliersRes.data) setSuppliers(loadedSuppliers);
        if (loadedCategories.length > 0) setCategories(loadedCategories);

        if (loadedProducts.length > 0) {
          const distinctFromProducts = new Set<string>();
          loadedProducts.forEach((p) => {
            const cat = extractCategoryFromNotes(p.notes || "");
            if (cat && cat !== "عام" && cat !== "غير محدد") distinctFromProducts.add(cat);
          });

          if (loadedCategories.length === 0 || loadedCategories.length < distinctFromProducts.size) {
            const existingImageMap = new Map<string, string>();
            loadedCategories.forEach((c) => {
              if (c.image && c.image.trim()) {
                existingImageMap.set(c.name.trim().toLowerCase(), c.image.trim());
              }
            });

            const catRows = Array.from(distinctFromProducts).map((catName, idx) => {
              const existingImg = existingImageMap.get(catName.trim().toLowerCase());
              const sampleProduct = loadedProducts.find((p) => (p.notes || "").includes(catName));
              const finalImg = existingImg || sampleProduct?.image || "";
              return {
                name: catName,
                image: finalImg,
                image_url: finalImg,
                priority: idx + 1,
                display_order: idx + 1,
                sort_order: idx + 1,
                is_active: true,
                keywords: catName,
              };
            });

            supabase.from("categories").upsert(catRows, { onConflict: "name" }).then(async () => {
              const { data: fresh } = await supabase.from("categories").select("*").order("priority", { ascending: true });
              if (fresh && fresh.length > 0) setCategories(fresh.map(rowToCategory));
            });
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
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, async () => {
        const { data } = await supabase.from("categories").select("*").order("priority", { ascending: true });
        if (data) setCategories(data.map(rowToCategory));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, async () => {
        const { data } = await supabase.from("products").select("*").order("created_at", { ascending: false });
        if (data) setProducts(data.map(rowToProduct));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers" }, async () => {
        const { data } = await supabase.from("suppliers").select("*").order("created_at", { ascending: false });
        if (data) setSuppliers(data.map(rowToSupplier));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addProduct = useCallback(async (product: Omit<Product, "id" | "createdAt" | "updatedAt">) => {
    let finalImageUrl = product.image || "";
    const originalImageUrl = product.originalImageUrl || product.image || "";

    if (finalImageUrl) {
      finalImageUrl = await applyWatermarkIfNeeded(finalImageUrl);
    }

    const row = productToRow({
      ...product,
      image: finalImageUrl,
      originalImageUrl: originalImageUrl,
    } as Record<string, unknown>);

    const { data: created, error } = await supabase.from("products").insert(row).select().single();
    if (error) throw error;
    const newProduct = rowToProduct(created);
    setProducts((prev) => [newProduct, ...prev]);
    return newProduct;
  }, []);

  const updateProduct = useCallback(async (id: string, updates: Partial<Product>) => {
    let finalUpdates = { ...updates };

    if (updates.image) {
      const existingProduct = products.find((p) => p.id === id);
      const originalToKeep = updates.originalImageUrl || existingProduct?.originalImageUrl || updates.image;
      const watermarkedImg = await applyWatermarkIfNeeded(updates.image);

      finalUpdates.image = watermarkedImg;
      finalUpdates.originalImageUrl = originalToKeep;
    }

    const row = productToRow(finalUpdates as Record<string, unknown>);

    const { data: updated, error } = await supabase.from("products").update(row).eq("id", id).select().single();
    if (error) throw error;
    const product = rowToProduct(updated);
    setProducts((prev) => prev.map((p) => (p.id === id ? product : p)));
  }, [products]);

  const bulkUpdateProducts = useCallback(async (ids: string[], updates: Partial<Product>) => {
    if (!ids || ids.length === 0) return;
    const row = productToRow(updates as Record<string, unknown>);
    const chunkSize = 200;
    const updatedRows: Record<string, unknown>[] = [];

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data: updated, error } = await supabase.from("products").update(row).in("id", chunk).select();
      if (error) throw error;
      if (updated) updatedRows.push(...updated);
    }

    if (updatedRows.length > 0) {
      const updatedMap = new Map(updatedRows.map((r) => [r.id as string, rowToProduct(r)]));
      setProducts((prev) =>
        prev.map((p) => (updatedMap.has(p.id) ? updatedMap.get(p.id)! : p))
      );
    }
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

    // تنفيذ التحديث مباشرة في قاعدة البيانات للقسم المحدّد عبر الـ ID
    const { data: updatedData, error } = await supabase
      .from("categories")
      .update(row)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("خطأ في تحديث القسم بقاعدة البيانات:", error.message);
    }

    let finalCat: CategoryItem = updatedData ? rowToCategory(updatedData) : { 
      id, 
      name: updates.name || "", 
      image: updates.image || "", 
      priority: updates.priority || 1, 
      isActive: updates.isActive !== false, 
      keywords: updates.keywords || "" 
    };

    if (!updatedData && updates.name) {
      const { data: upsertData } = await supabase
        .from("categories")
        .upsert({ ...row, name: updates.name }, { onConflict: "name" })
        .select()
        .maybeSingle();
      if (upsertData) {
        finalCat = rowToCategory(upsertData);
      }
    }

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
    if (!catIdOrName) return;
    setCategories((prev) => {
      const target = prev.find(
        (c) => c.id === catIdOrName || c.name.toLowerCase() === catIdOrName.toLowerCase()
      );
      if (!target) return prev;
      const newViews = (target.views || 0) + 1;
      supabase.from("categories").update({ views: newViews }).eq("id", target.id).then(() => {});
      return prev.map((c) => (c.id === target.id ? { ...c, views: newViews } : c));
    });
  }, []);

  const reloadAllData = useCallback(async () => {
    const [productsRes, suppliersRes, categoriesRes] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("suppliers").select("*").order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("priority", { ascending: true }),
    ]);
    if (productsRes.data) setProducts(productsRes.data.map(rowToProduct));
    if (suppliersRes.data) setSuppliers(suppliersRes.data.map(rowToSupplier));
    if (categoriesRes.data) setCategories(categoriesRes.data.map(rowToCategory));
  }, []);

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
      const prodRows = prodsToSave.map((p) => productToRow(p as unknown as Record<string, unknown>));
      await supabase.from("products").upsert(prodRows);
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
          if (catName && !["عام", "غير محدد", "غير مصنف"].includes(catName)) {
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
    return { products, suppliers, categories, exportedAt: new Date().toISOString() };
  }, [products, suppliers, categories]);

  const importAllData = useCallback(async (data: { products?: Product[]; suppliers?: Supplier[]; categories?: CategoryItem[] }) => {
    if (data.suppliers && data.suppliers.length > 0) {
      const rows = data.suppliers.map((s) => supplierToRow(s as unknown as Record<string, unknown>));
      await supabase.from("suppliers").upsert(rows);
    }
    if (data.products && data.products.length > 0) {
      const rows = data.products.map((p) => productToRow(p as unknown as Record<string, unknown>));
      await supabase.from("products").upsert(rows);
    }
    if (data.categories && data.categories.length > 0) {
      const rows = data.categories.map((c) => categoryToRow(c as unknown as Record<string, unknown>));
      await supabase.from("categories").upsert(rows);
    }
    await reloadAllData();
  }, [reloadAllData]);

  return (
    <DataContext.Provider
      value={{
        products, suppliers, categories, loading,
        addProduct, updateProduct, bulkUpdateProducts, deleteProduct, bulkDeleteProducts,
        addSupplier, updateSupplier, deleteSupplier,
        addCategory, updateCategory, deleteCategory, incrementCategoryViews,
        autoSyncCategoriesFromProducts,
        persistAllCategoriesAndProducts, reloadAllData,
        importProducts, exportAllData, importAllData,
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
