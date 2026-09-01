"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-client";
import { CartItem } from "@/lib/order-types";

const GUEST_PURCHASES_KEY = "ahmed_bahri_guest_purchases_v1";

interface LocalGuestPurchase {
  orderId?: string;
  productIds: string[];
  timestamp: string;
  total?: number;
}

interface PurchasesContextType {
  purchasedProductIds: string[];
  userOrders: any[];
  loading: boolean;
  recordGuestPurchase: (productIds: string[], orderId?: string, total?: number) => void;
  syncGuestPurchasesToUser: (userId: string) => Promise<void>;
  refetchPurchases: () => Promise<void>;
}

const PurchasesContext = createContext<PurchasesContextType | undefined>(undefined);

export function getGuestLocalPurchases(): LocalGuestPurchase[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GUEST_PURCHASES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return [];
}

export async function syncGuestPurchasesToUser(userId: string): Promise<void> {
  if (typeof window === "undefined" || !userId) return;
  const guestPurchases = getGuestLocalPurchases();
  if (!guestPurchases || guestPurchases.length === 0) return;

  try {
    const orderIdsToUpdate = guestPurchases
      .map((p) => p.orderId)
      .filter((id): id is string => Boolean(id));

    if (orderIdsToUpdate.length > 0) {
      await supabase
        .from("orders")
        .update({ user_id: userId })
        .in("id", orderIdsToUpdate);
    }

    // Safely clear local guest purchases key after handover
    localStorage.removeItem(GUEST_PURCHASES_KEY);
  } catch (err) {
    console.warn("Failed to sync guest purchases to user:", err);
  }
}

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [purchasedProductIds, setPurchasedProductIds] = useState<string[]>([]);
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isRegisteredUser = Boolean(user && user.id && !user.isGuest && !user.id.startsWith("guest-"));

  const loadPurchases = useCallback(async () => {
    setLoading(true);

    if (!isRegisteredUser) {
      // Guest User: LocalStorage ONLY (Zero Database Footprint for customer identity)
      const localPurchases = getGuestLocalPurchases();
      const allProductIds = Array.from(
        new Set(localPurchases.flatMap((p) => p.productIds || []))
      );
      setPurchasedProductIds(allProductIds);
      setUserOrders([]);
      setLoading(false);
      return;
    }

    // Registered User: Query orders strictly by auth user.id
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data) {
        setUserOrders(data);
        const productIdsSet = new Set<string>();
        data.forEach((order: any) => {
          // Extract product IDs from order.items or order.order_items
          const items: CartItem[] = order.items || order.order_items || [];
          items.forEach((item: any) => {
            const pId = item.productId || item.product_id;
            if (pId) productIdsSet.add(pId);
          });
        });
        setPurchasedProductIds(Array.from(productIdsSet));
      } else {
        setUserOrders([]);
        setPurchasedProductIds([]);
      }
    } catch (err) {
      console.warn("Error fetching registered user purchases:", err);
      setUserOrders([]);
      setPurchasedProductIds([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isRegisteredUser]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  const recordGuestPurchase = useCallback(
    (productIds: string[], orderId?: string, total?: number) => {
      if (isRegisteredUser) return; // Only record local guest purchases for guest state

      const existing = getGuestLocalPurchases();
      const newEntry: LocalGuestPurchase = {
        orderId,
        productIds,
        timestamp: new Date().toISOString(),
        total,
      };

      const updated = [newEntry, ...existing];
      localStorage.setItem(GUEST_PURCHASES_KEY, JSON.stringify(updated));

      const updatedPIds = Array.from(
        new Set([...purchasedProductIds, ...productIds])
      );
      setPurchasedProductIds(updatedPIds);
    },
    [isRegisteredUser, purchasedProductIds]
  );

  return (
    <PurchasesContext.Provider
      value={{
        purchasedProductIds,
        userOrders,
        loading,
        recordGuestPurchase,
        syncGuestPurchasesToUser,
        refetchPurchases: loadPurchases,
      }}
    >
      {children}
    </PurchasesContext.Provider>
  );
}

export function usePurchases() {
  const context = useContext(PurchasesContext);
  if (!context) {
    throw new Error("usePurchases must be used within a PurchasesProvider");
  }
  return context;
}
