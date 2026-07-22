"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Product, Supplier } from "./types";
import { supabase } from "./supabase-client";

interface DataContextType {
  products: Product[];
  suppliers: Supplier[];
  loading: boolean;
  addProduct: (product: Omit<Product, "id" | "createdAt" | "updatedAt">) => Promise<Product>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  addSupplier: (supplier: Omit<Supplier, "id" | "createdAt">) => Promise<Supplier>;
  updateSupplier: (id: string, updates: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
  importProducts: (items: Omit<Product, "id" | "createdAt" | "updatedAt">[]) => Promise<number>;
  exportAllData: () => { products: Product[]; suppliers: Supplier[]; exportedAt: string };
  importAllData: (data: { products?: Product[]; suppliers?: Supplier[] }) => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

function rowToProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    image: row.image as string || "",
    costPrice: Number(row.cost_price) || 0,
    wholesalePrice: Number(row.wholesale_price) || 0,
    profitMargin: Number(row.profit_margin) || 0,
    retailPrice: Number(row.retail_price) || 0,
    stock: Number(row.stock) || 0,
    supplierId: (row.supplier_id as string) || "",
    notes: row.notes as string || "",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function productToRow(product: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("name" in product) row.name = product.name;
  if ("image" in product) row.image = product.image;
  if ("costPrice" in product) row.cost_price = product.costPrice;
  if ("wholesalePrice" in product) row.wholesale_price = product.wholesalePrice;
  if ("profitMargin" in product) row.profit_margin = product.profitMargin;
  if ("retailPrice" in product) row.retail_price = product.retailPrice;
  if ("stock" in product) row.stock = product.stock;
  if ("supplierId" in product) row.supplier_id = product.supplierId || null;
  if ("notes" in product) row.notes = product.notes;
  return row;
}

function rowToSupplier(row: Record<string, unknown>): Supplier {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string || "",
    email: row.email as string || "",
    address: row.address as string || "",
    notes: row.notes as string || "",
    createdAt: row.created_at as string,
  };
}

function supplierToRow(supplier: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("name" in supplier) row.name = supplier.name;
  if ("phone" in supplier) row.phone = supplier.phone;
  if ("email" in supplier) row.email = supplier.email;
  if ("address" in supplier) row.address = supplier.address;
  if ("notes" in supplier) row.notes = supplier.notes;
  return row;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [productsRes, suppliersRes] = await Promise.all([
        supabase.from("products").select("*").order("created_at", { ascending: false }),
        supabase.from("suppliers").select("*").order("created_at", { ascending: false }),
      ]);
      if (productsRes.data) setProducts(productsRes.data.map(rowToProduct));
      if (suppliersRes.data) setSuppliers(suppliersRes.data.map(rowToSupplier));
      setLoading(false);
    }
    loadData();
  }, []);

  const addProduct = useCallback(async (data: Omit<Product, "id" | "createdAt" | "updatedAt">) => {
    const row = productToRow(data);
    const { data: created, error } = await supabase.from("products").insert(row).select().single();
    if (error) throw error;
    const product = rowToProduct(created);
    setProducts((prev) => [product, ...prev]);
    return product;
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

  const addSupplier = useCallback(async (data: Omit<Supplier, "id" | "createdAt">) => {
    const row = supplierToRow(data);
    const { data: created, error } = await supabase.from("suppliers").insert(row).select().single();
    if (error) throw error;
    const supplier = rowToSupplier(created);
    setSuppliers((prev) => [supplier, ...prev]);
    return supplier;
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

  const importProducts = useCallback(async (items: Omit<Product, "id" | "createdAt" | "updatedAt">[]) => {
    const rows = items.map((item) => productToRow(item));
    const { data: created, error } = await supabase.from("products").insert(rows).select();
    if (error) throw error;
    if (created) {
      const newProducts = created.map(rowToProduct);
      setProducts((prev) => [...newProducts, ...prev]);
    }
    return items.length;
  }, []);

  const exportAllData = useCallback(() => {
    return { products, suppliers, exportedAt: new Date().toISOString() };
  }, [products, suppliers]);

  const importAllData = useCallback(async (data: { products?: Product[]; suppliers?: Supplier[] }) => {
    if (data.suppliers && data.suppliers.length > 0) {
      const rows = data.suppliers.map((s) => supplierToRow(s as unknown as Record<string, unknown>));
      await supabase.from("suppliers").insert(rows);
    }
    if (data.products && data.products.length > 0) {
      const rows = data.products.map((p) => productToRow(p as unknown as Record<string, unknown>));
      await supabase.from("products").insert(rows);
    }
    const [productsRes, suppliersRes] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("suppliers").select("*").order("created_at", { ascending: false }),
    ]);
    if (productsRes.data) setProducts(productsRes.data.map(rowToProduct));
    if (suppliersRes.data) setSuppliers(suppliersRes.data.map(rowToSupplier));
  }, []);

  return (
    <DataContext.Provider
      value={{
        products, suppliers, loading,
        addProduct, updateProduct, deleteProduct,
        addSupplier, updateSupplier, deleteSupplier,
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
