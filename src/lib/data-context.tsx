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
  return {
    id: row.id as string,
    name: row.name as string,
    image: (row.image as string) || "",
    originalImageUrl: (row.original_image_url as string) || (row.image as string) || "",
    costPrice: Number(row.cost_price) || 0,
    wholesalePrice: Number(row.wholesale_price) || 0,
    profitMargin: Number(row.profit_margin) || 0,
    retailPrice: Number(row.retail_price) || 0,
    stock: Number(row.stock) || 0,
    supplierId: (row.supplier_id as string) || "",
    notes: (row.notes as string) || "",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function productToRow(product: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {
    is_active: true,
    is_published: true,
    status: "active",
    is_deleted: false,
  };
  if ("name" in product) row.name = product.name;
  if ("image" in product) row.image = product.image || "";
  if ("originalImageUrl" in product) row.original_image_url = product.originalImageUrl || product.image || "";
  if ("original_image_url" in product) row.original_image_url = product.original_image_url || "";
  if ("costPrice" in product) row.cost_price = Number(product.costPrice) || 0;
  if ("wholesalePrice" in product) row.wholesale_price = Number(product.wholesalePrice) || 0;
  if ("profitMargin" in product) row.profit_margin = Number(product.profitMargin) || 0;
  if ("retailPrice" in product) row.retail_price = Number(product.retailPrice) || 0;
  if ("stock" in product) row.stock = Number(product.stock) || 0;
  if ("supplierId" in product) {
    const sid = String(product.supplierId || "").trim();
    row.supplier_id = isUUID(sid) ? sid : null;
  }
  if ("category_id" in product && product.category_id) {
    const cid = String(product.category_id).trim();
    if (isUUID(cid)) row.category_id = cid;
  }
  if ("notes" in product) row.notes = product.notes || "";
  return row;
}

function rowToSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: (row.phone as string) || "",
    email: (row.email as string) || "",
    address: (row.address as string) || "",
    notes: (row.notes as string) || "",
    createdAt: row.created_at as string,
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
    image: (row.image as string) || "",
    priority: prio,
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    keywords: (row.keywords as string) || "",
    views: Number(row.views) || 0,
    createdAt: row.created_at as string,
  };
}

export function categoryToRow(cat: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("name" in cat) row.name = cat.name;
  if ("image" in cat) row.image = cat.image || "";
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
      const { data: prodsData } = await supabase.from("products").select("notes, image");
      if (!prodsData || prodsData.length === 0) return [];

      const categoryMap = new Map<string, { name: string; image: string }>();

      for (const p of prodsData) {
        const notes = (p.notes as string) || "";
        const catName = extractCategoryFromNotes(notes);
        if (catName && catName !== "عام" && catName !== "غير محدد") {
          if (!categoryMap.has(catName)) {
            categoryMap.set(catName, { name: catName, image: (p.image as string) || "" });
          } else if (!categoryMap.get(catName)?.image && p.image) {
            categoryMap.get(catName)!.image = (p.image as string) || "";
          }
        }
      }

      if (categoryMap.size === 0) return [];

      const catRows = Array.from(categoryMap.values()).map((cat, idx) => ({
        name: cat.name,
        image: cat.image || "",
        priority: idx + 1,
        display_order: idx + 1,
        sort_order: idx + 1,
        is_active: true,
        keywords: cat.name,
      }));

      const { error } = await supabase
        .from("categories")
        .upsert(catRows, { onConflict: "name" });

      if (error) {
        console.warn("Bulk category upsert warning, trying individual upserts:", error.message);
        for (const row of catRows) {
          await supabase.from("categories").upsert(row, { onConflict: "name" });
        }
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

        if (productsRes.data) setProducts(loadedProducts);
        if (suppliersRes.data) setSuppliers(loadedSuppliersFromRow(suppliersRes.data));
        if (loadedCategories.length > 0) setCategories(loadedCategories);

        // Auto Populate categories if missing
        if (loadedProducts.length > 0) {
          const distinctFromProducts = new Set<string>();
          loadedProducts.forEach((p) => {
            const cat = extractCategoryFromNotes(p.notes || "");
            if (cat && cat !== "عام" && cat !== "غير محدد") distinctFromProducts.add(cat);
          });

          if (loadedCategories.length === 0 || loadedCategories.length < distinctFromProducts.size) {
            const catRows = Array.from(distinctFromProducts).map((catName, idx) => {
              const sampleProduct = loadedProducts.find((p) => (p.notes || "").includes(catName));
              return {
                name: catName,
                image: sampleProduct?.image || "",
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

    // Supabase Real-Time Listeners
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
        if (data) setSuppliers(loadedSuppliersFromRow(data));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function loadedSuppliersFromRow(data: Record<string, unknown>[]): Supplier[] {
    return data.map(rowToSupplier);
  }

  const addProduct = useCallback(async (product: Omit<Product, "id" | "createdAt" | "updatedAt">) => {
    const row = productToRow(product);
    const { data: created, error } = await supabase.from("products").insert(row).select().single();
    if (error) throw error;
    const newProduct = rowToProduct(created);
    setProducts((prev) => [newProduct, ...prev]);
    return newProduct;
  }, []);

  const updateProduct = useCallback(async (id: string, updates: Partial<Product>) => {
    const row = productToRow(updates);
    const { data: updated, error } = await supabase.from("products").update(row).eq("id", id).select().single();
    if (error) throw error;
    const product = rowToProduct(updated);
    setProducts((prev) => prev.map((p) => (p.id === id ? product : p)));
  }, []);

  const bulkUpdateProducts = useCallback(async (ids: string[], updates: Partial<Product>) => {
    if (!ids || ids.length === 0) return;
    const row = productToRow(updates);
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
    const row = supplierToRow(supplier);
    const { data: created, error } = await supabase.from("suppliers").insert(row).select().single();
    if (error) throw error;
    const newSupplier = rowToSupplier(created);
    setSuppliers((prev) => [newSupplier, ...prev]);
    return newSupplier;
  }, []);

  const updateSupplier = useCallback(async (id: string, updates: Partial<Supplier>) => {
    const row = supplierToRow(updates);
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
    const row = categoryToRow(cat);
    let createdRow: Record<string, unknown> | null = null;

    const { data: created, error } = await supabase
      .from("categories")
      .upsert({ ...row, name: cat.name }, { onConflict: "name" })
      .select()
      .maybeSingle();

    if (!error && created) {
      createdRow = created;
    } else if (error) {
      console.warn("Primary addCategory error, attempting fallback with image_url column:", error.message);
      const altRow: Record<string, unknown> = { ...row, name: cat.name, image_url: cat.image };
      delete altRow.image;
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
    const row = categoryToRow(updates);
    let updatedRow: Record<string, unknown> | null = null;

    if (isUUID(id)) {
      const { data, error } = await supabase.from("categories").update(row).eq("id", id).select().maybeSingle();
      if (!error && data) {
        updatedRow = data;
      } else if (error) {
        console.warn("Primary updateCategory error, trying image_url column fallback:", error.message);
        const altRow: Record<string, unknown> = { ...row };
        if ("image" in altRow) {
          altRow.image_url = altRow.image;
          delete altRow.image;
        }
        const { data: altData } = await supabase.from("categories").update(altRow).eq("id", id).select().maybeSingle();
        if (altData) updatedRow = altData;
      }
    }

    if (!updatedRow) {
      const catName = updates.name || "";
      const upsertRow: Record<string, unknown> = {
        name: catName,
        image: updates.image !== undefined ? updates.image : "",
        priority: Number(updates.priority) || 1,
        display_order: Number(updates.priority) || 1,
        sort_order: Number(updates.priority) || 1,
        is_active: updates.isActive !== false,
        keywords: updates.keywords || "",
      };

      const { data: upsertData, error: upsertError } = await supabase
        .from("categories")
        .upsert(upsertRow, { onConflict: "name" })
        .select()
        .maybeSingle();

      if (!upsertError && upsertData) {
        updatedRow = upsertData;
      } else if (upsertError) {
        console.warn("Primary category upsert error, trying image_url fallback:", upsertError.message);
        const altUpsert: Record<string, unknown> = { ...upsertRow, image_url: upsertRow.image };
        delete altUpsert.image;
        const { data: altUpsertData } = await supabase
          .from("categories")
          .upsert(altUpsert, { onConflict: "name" })
          .select()
          .maybeSingle();
        if (altUpsertData) updatedRow = altUpsertData;
      }
    }

    let finalCat: CategoryItem;
    if (updatedRow) {
      finalCat = rowToCategory(updatedRow);
    } else {
      finalCat = { id, name: updates.name || "", image: updates.image || "", priority: updates.priority || 1, isActive: updates.isActive !== false, keywords: updates.keywords || "" };
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
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
      return;
    }
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
    if (suppliersRes.data) setSuppliers(productsRes.data ? loadedSuppliersFromRow(suppliersRes.data) : []);
    if (categoriesRes.data) setCategories(categoriesRes.data.map(rowToCategory));
  }, []);

  const persistAllCategoriesAndProducts = useCallback(async (catsToSave: CategoryItem[], prodsToSave: Product[]) => {
    if (catsToSave.length > 0) {
      const catRows = catsToSave.map((c) => {
        const r: Record<string, unknown> = {
          name: c.name,
          image: c.image || "",
          priority: Number(c.priority) || 1,
          is_active: c.isActive !== false,
          keywords: c.keywords || "",
        };
        if (c.id && isUUID(c.id)) {
          r.id = c.id;
        }
        return r;
      });

      const { error: catErr } = await supabase.from("categories").upsert(catRows, { onConflict: "name" });
      if (catErr) {
        console.warn("Bulk category upsert warning, trying individual upserts:", catErr.message);
        for (const r of catRows) {
          await supabase.from("categories").upsert(r, { onConflict: "name" });
        }
      }
    }

    if (prodsToSave.length > 0) {
      const prodRows = prodsToSave.map((p) => productToRow(p as unknown as Record<string, unknown>));
      const { error: prodErr } = await supabase.from("products").upsert(prodRows);
      if (prodErr) {
        console.error("Error persisting products to Supabase:", prodErr);
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

      // 1. Deduplicate array in memory while keeping latest row per name
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

      // 2. Collect and upsert categories and extract their IDs (category_id)
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

      const categoryIdMap = new Map<string, string>(); // Map (name -> UUID)

      if (categoryNames.size > 0) {
        const catRows = Array.from(categoryNames).map((cName, idx) => ({
          name: cName,
          priority: idx + 1,
          display_order: idx + 1,
          sort_order: idx + 1,
          is_active: true,
          keywords: cName,
        }));

        const { data: catData, error: catErr } = await supabase
          .from("categories")
          .upsert(catRows, { onConflict: "name" })
          .select("id, name");

        if (!catErr && catData) {
          catData.forEach((c) => {
            if (c.id && c.name) {
              categoryIdMap.set(c.name.trim().toLowerCase(), c.id);
            }
          });
        }
      }

      // 3. Map products to rows and collect Many-to-Many category relationships
      const productCategoryPairs: { productName: string; categoryId: string }[] = [];

      const rows = items.map((item) => {
        const row = productToRow(item);

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
      });

      // 4. Send product rows in batch chunks (CHUNK_SIZE = 50) using upsert by name
      const CHUNK_SIZE = 50;
      let processed = 0;
      const total = rows.length;
      const createdProductMap = new Map<string, string>(); // Map (cleanName -> product_id)

      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);

        const { data: insertedProducts, error } = await supabase
          .from("products")
          .upsert(chunk, { onConflict: "name" })
          .select("id, name");

        if (error) {
          console.error("خطأ Supabase أثناء إدخال الدفعة:", error);
          throw new Error(`فشل حفظ المنتجات في Supabase: ${error.message} [Code: ${error.code}]`);
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

      // 5. Populate Many-to-Many product-category relationships in 'product_categories'
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
            const { error: jErr } = await supabase
              .from("product_categories")
              .upsert(jChunk, { onConflict: "product_id,category_id", ignoreDuplicates: true });

            if (jErr) {
              try {
                await supabase
                  .from("product_categories")
                  .insert(jChunk);
              } catch {
                // ignore duplicate error if insert fails
              }
            }
          }
        } catch (jError) {
          console.warn("إشعار تحديث الجدول الوسيط (product_categories):", jError);
        }
      }

      // 6. Server revalidation
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
