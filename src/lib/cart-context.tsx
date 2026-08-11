"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { CartItem } from "./order-types";
import {
  PricingTier,
  resolveTierForQty,
  calculateTierPrice,
  getTierLabel,
  DEFAULT_PRICING_CONFIG,
} from "./pricing-engine";

// ─── Add-to-cart payload ──────────────────────────────────────────────────────

export interface AddToCartPayload {
  productId: string;
  name: string;
  image: string;
  retailPrice: number;
  wholesalePrice?: number;
  quantity?: number;           // defaults to 1
  tiers?: PricingTier[];       // resolved effective tiers for this product
}

// ─── Context type ─────────────────────────────────────────────────────────────

interface CartContextType {
  items: CartItem[];
  addItem: (payload: AddToCartPayload) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number, tiers?: PricingTier[]) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const STORAGE_KEY = "ahmed-bahri-cart";

// ─── Persistence helpers ──────────────────────────────────────────────────────

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return [];
}

function saveCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ─── Internal: resolve tier price for a quantity ──────────────────────────────

function resolveTierPrice(
  qty: number,
  retailPrice: number,
  tiers?: PricingTier[]
): { appliedTierPrice: number; appliedTierLabel: string } {
  const effectiveTiers = tiers ?? DEFAULT_PRICING_CONFIG.tiers;
  const tier = resolveTierForQty(qty, effectiveTiers);
  const appliedTierPrice = calculateTierPrice(retailPrice, tier);
  const appliedTierLabel = getTierLabel(qty, effectiveTiers);
  return { appliedTierPrice, appliedTierLabel };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setItems(loadCart());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) saveCart(items);
  }, [items, mounted]);

  const addItem = useCallback((payload: AddToCartPayload) => {
    const { productId, name, image, retailPrice, wholesalePrice, quantity = 1, tiers } = payload;

    setItems((prev) => {
      const existing = prev.find((i) => i.productId === productId);

      if (existing) {
        // Merge: increment quantity, re-resolve tier price
        const newQty = existing.quantity + quantity;
        const { appliedTierPrice, appliedTierLabel } = resolveTierPrice(newQty, retailPrice, tiers);
        return prev.map((i) =>
          i.productId === productId
            ? { ...i, quantity: newQty, appliedTierPrice, appliedTierLabel }
            : i
        );
      }

      // New item
      const { appliedTierPrice, appliedTierLabel } = resolveTierPrice(quantity, retailPrice, tiers);
      return [
        ...prev,
        {
          productId,
          name,
          image,
          retailPrice,
          wholesalePrice,
          quantity,
          appliedTierPrice,
          appliedTierLabel,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const updateQuantity = useCallback(
    (productId: string, quantity: number, tiers?: PricingTier[]) => {
      if (quantity <= 0) {
        setItems((prev) => prev.filter((i) => i.productId !== productId));
      } else {
        setItems((prev) =>
          prev.map((i) => {
            if (i.productId !== productId) return i;
            const { appliedTierPrice, appliedTierLabel } = resolveTierPrice(
              quantity,
              i.retailPrice,
              tiers
            );
            return { ...i, quantity, appliedTierPrice, appliedTierLabel };
          })
        );
      }
    },
    []
  );

  const clearCart = useCallback(() => setItems([]), []);

  // Total uses the resolved appliedTierPrice × qty for each item
  const total = useMemo(
    () => items.reduce((sum, i) => sum + (i.appliedTierPrice ?? i.retailPrice) * i.quantity, 0),
    [items]
  );
  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, total, itemCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
