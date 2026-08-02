"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Product, Supplier, CategoryItem } from "./types";
import { supabase } from "./supabase-client";

interface DataContextType {
  products: Product[];
  suppliers: Supplier[];
  categories: CategoryItem[];
  loading: boolean;
  addProduct: (product: Omit<Product, "id" | "createdAt" | "updatedAt">) => Promise<Product>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addSupplier: (supplier: Omit<Supplier, "id" | "createdAt">) => Promise<Supplier>;
  updateSupplier: (id: string, updates: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  addCategory: (cat: Omit<CategoryItem, "id">) => Promise<CategoryItem>;
  updateCategory: (id: string, updates: Partial<CategoryItem>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  incrementCategoryViews: (catIdOrName: string) => Promise<void>;
  persistAllCategoriesAndProducts: (catsToSave: CategoryItem[], prodsToSave: Product[]) => Promise<boolean>;
  reloadAllData: () => Promise<void>;
  importProducts: (items: Omit<Product, "id" | "createdAt" | "updatedAt">[]) => Promise<number>;
  exportAllData: () => { products: Product[]; suppliers: Supplier[]; categories: CategoryItem[]; exportedAt: string };
  importAllData: (data: { products?: Product[]; suppliers?: Supplier[]; categories?: CategoryItem[] }) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

function isUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

function rowToProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    image: (row.image as string) || "",
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

function productToRow(product: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("name" in product) row.name = product.name;
  if ("image" in product) row.image = product.image || "";
  if ("costPrice" in product) row.cost_price = Number(product.costPrice) || 0;
  if ("wholesalePrice" in product) row.wholesale_price = Number(product.wholesalePrice) || 0;
  if ("profitMargin" in product) row.profit_margin = Number(product.profitMargin) || 0;
  if ("retailPrice" in product) row.retail_price = Number(product.retailPrice) || 0;
  if ("stock" in product) row.stock = Number(product.stock) || 0;
  if ("supplierId" in product) {
    const sid = String(product.supplierId || "").trim();
    row.supplier_id = isUUID(sid) ? sid : null;
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

function supplierToRow(supplier: Record<string, unknown>): Record<string, unknown> {
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

function categoryToRow(cat: Record<string, unknown>): Record<string, unknown> {
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

  useEffect(() => {
    async function loadData() {
      try {
        const [productsRes, suppliersRes, categoriesRes] = await Promise.all([
          supabase.from("products").select("*").order("created_at", { ascending: false }),
          supabase.from("suppliers").select("*").order("created_at", { ascending: false }),
          supabase.from("categories").select("*").order("priority", { ascending: true }),
        ]);

        if (productsRes.data) setProducts(productsRes.data.map(rowToProduct));
        if (suppliersRes.data) setSuppliers(suppliersRes.data.map(rowToSupplier));
        if (categoriesRes.data) {
          setCategories(categoriesRes.data.map(rowToCategory));
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
        if (data) setSuppliers(data.map(rowToSupplier));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

  const deleteProduct = useCallback(async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
    setProducts((prev) => prev.filter((p) => p.id !== id));
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

  const addCategory = useCallback(async (cat: Omit<CategoryItem, "id">) => {
    const row = categoryToRow(cat);
    const { data: created, error } = await supabase
      .from("categories")
      .upsert({ ...row, name: cat.name }, { onConflict: "name" })
      .select()
      .maybeSingle();

    if (error || !created) {
      const localCat: CategoryItem = { id: Date.now().toString(), ...cat };
      setCategories((prev) => [...prev, localCat].sort((a, b) => (a.priority || 0) - (b.priority || 0)));
      return localCat;
    }
    const newCat = rowToCategory(created);
    setCategories((prev) => [...prev, newCat].sort((a, b) => (a.priority || 0) - (b.priority || 0)));
    return newCat;
  }, []);

  const updateCategory = useCallback(async (id: string, updates: Partial<CategoryItem>) => {
    const row = categoryToRow(updates);
    let updatedRow: Record<string, unknown> | null = null;

    if (isUUID(id)) {
      const { data, error } = await supabase.from("categories").update(row).eq("id", id).select().maybeSingle();
      if (!error && data) {
        updatedRow = data;
      }
    }

    if (!updatedRow) {
      // Upsert by category name if UUID mismatch or non-UUID id
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
      const { data: upsertData } = await supabase
        .from("categories")
        .upsert(upsertRow, { onConflict: "name" })
        .select()
        .maybeSingle();

      if (upsertData) {
        updatedRow = upsertData;
      }
    }

    if (updatedRow) {
      const cat = rowToCategory(updatedRow);
      setCategories((prev) =>
        prev
          .map((c) => (c.id === id || c.name.toLowerCase() === cat.name.toLowerCase() ? cat : c))
          .sort((a, b) => (a.priority || 0) - (b.priority || 0))
      );
    } else {
      setCategories((prev) =>
        prev
          .map((c) => (c.id === id ? { ...c, ...updates } : c))
          .sort((a, b) => (a.priority || 0) - (b.priority || 0))
      );
    }
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
    if (suppliersRes.data) setSuppliers(suppliersRes.data.map(rowToSupplier));
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
        if (c.id && c.id.length > 20 && !c.id.startsWith("auto-") && !c.id.startsWith("cat-")) {
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

  const importProducts = useCallback(async (items: Omit<Product, "id" | "createdAt" | "updatedAt">[]) => {
    if (!items || items.length === 0) return 0;
    const rows = items.map((item) => productToRow(item));
    const { data: created, error } = await supabase.from("products").insert(rows).select();
    if (error) {
      console.error("Supabase importProducts error:", error);
      throw new Error(error.message);
    }
    if (created) {
      const newProducts = created.map(rowToProduct);
      setProducts((prev) => [...newProducts, ...prev]);
    }
    return items.length;
  }, []);

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
        addProduct, updateProduct, deleteProduct,
        addSupplier, updateSupplier, deleteSupplier,
        addCategory, updateCategory, deleteCategory, incrementCategoryViews,
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
