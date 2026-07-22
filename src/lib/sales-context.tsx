"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase-client";

export interface SaleItem {
  productId: string;
  productName: string;
  costPrice: number;
  retailPrice: number;
  quantity: number;
}

export interface Sale {
  id: string;
  customerName: string;
  customerPhone: string;
  items: SaleItem[];
  total: number;
  cost: number;
  profit: number;
  timestamp: string;
}

interface SalesContextType {
  sales: Sale[];
  loading: boolean;
  addSale: (sale: Omit<Sale, "id" | "timestamp">) => Promise<void>;
  getSalesByPeriod: (start: Date, end: Date) => Sale[];
  getTopProducts: (limit?: number) => { name: string; quantity: number; revenue: number }[];
  getLoyalCustomers: () => { phone: string; name: string; orders: number; totalSpent: number }[];
  getProfitByPeriod: (start: Date, end: Date) => { revenue: number; cost: number; profit: number };
  getDailySales: (days: number) => { date: string; sales: number; profit: number }[];
}

const SalesContext = createContext<SalesContextType | undefined>(undefined);

function rowToSale(row: Record<string, unknown>): Sale {
  return {
    id: row.id as string,
    customerName: row.customer_name as string,
    customerPhone: row.customer_phone as string,
    items: (row.items as SaleItem[]) || [],
    total: Number(row.total) || 0,
    cost: Number(row.cost) || 0,
    profit: Number(row.profit) || 0,
    timestamp: row.created_at as string,
  };
}

export function SalesProvider({ children }: { children: React.ReactNode }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("sales").select("*").order("created_at", { ascending: false });
      if (data) setSales(data.map(rowToSale));
      setLoading(false);
    }
    load();
  }, []);

  const addSale = useCallback(async (data: Omit<Sale, "id" | "timestamp">) => {
    const row = {
      customer_name: data.customerName,
      customer_phone: data.customerPhone,
      items: data.items,
      total: data.total,
      cost: data.cost,
      profit: data.profit,
    };
    const { data: created, error } = await supabase.from("sales").insert(row).select().single();
    if (error) throw error;
    setSales((prev) => [rowToSale(created), ...prev]);
  }, []);

  const getSalesByPeriod = useCallback((start: Date, end: Date) => {
    return sales.filter((s) => {
      const d = new Date(s.timestamp);
      return d >= start && d <= end;
    });
  }, [sales]);

  const getTopProducts = useCallback((limit = 10) => {
    const map = new Map<string, { name: string; quantity: number; revenue: number }>();
    sales.forEach((sale) => {
      sale.items.forEach((item) => {
        const existing = map.get(item.productId);
        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += item.retailPrice * item.quantity;
        } else {
          map.set(item.productId, { name: item.productName, quantity: item.quantity, revenue: item.retailPrice * item.quantity });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
  }, [sales]);

  const getLoyalCustomers = useCallback(() => {
    const map = new Map<string, { phone: string; name: string; orders: number; totalSpent: number }>();
    sales.forEach((sale) => {
      const key = sale.customerPhone;
      const existing = map.get(key);
      if (existing) {
        existing.orders++;
        existing.totalSpent += sale.total;
      } else {
        map.set(key, { phone: sale.customerPhone, name: sale.customerName, orders: 1, totalSpent: sale.total });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.orders - a.orders || b.totalSpent - a.totalSpent);
  }, [sales]);

  const getProfitByPeriod = useCallback((start: Date, end: Date) => {
    const periodSales = getSalesByPeriod(start, end);
    const revenue = periodSales.reduce((s, sale) => s + sale.total, 0);
    const cost = periodSales.reduce((s, sale) => s + sale.cost, 0);
    return { revenue, cost, profit: revenue - cost };
  }, [getSalesByPeriod]);

  const getDailySales = useCallback((days: number) => {
    const result: { date: string; sales: number; profit: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      const daySales = getSalesByPeriod(dayStart, dayEnd);
      const salesTotal = daySales.reduce((s, sale) => s + sale.total, 0);
      const profitTotal = daySales.reduce((s, sale) => s + sale.profit, 0);
      result.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, sales: salesTotal, profit: profitTotal });
    }
    return result;
  }, [getSalesByPeriod]);

  return (
    <SalesContext.Provider value={{ sales, loading, addSale, getSalesByPeriod, getTopProducts, getLoyalCustomers, getProfitByPeriod, getDailySales }}>
      {children}
    </SalesContext.Provider>
  );
}

export function useSales() {
  const ctx = useContext(SalesContext);
  if (!ctx) throw new Error("useSales must be used within SalesProvider");
  return ctx;
}
