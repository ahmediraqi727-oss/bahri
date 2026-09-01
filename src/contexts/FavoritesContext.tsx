"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-client";

const GUEST_FAV_KEY = "ahmed_bahri_guest_favs_v1";
const LEGACY_FAV_KEY = "customer_favorites";

interface FavoritesContextType {
  favoriteIds: string[];
  loading: boolean;
  isFavorite: (productId: string) => boolean;
  toggleFavorite: (productId: string) => Promise<string[]>;
  syncGuestFavoritesToUser: (userId: string) => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export function getGuestLocalFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const primary = localStorage.getItem(GUEST_FAV_KEY);
    if (primary) return JSON.parse(primary);
    const legacy = localStorage.getItem(LEGACY_FAV_KEY);
    if (legacy) return JSON.parse(legacy);
  } catch {
    /* ignore */
  }
  return [];
}

export async function syncGuestFavoritesToUser(userId: string): Promise<void> {
  if (typeof window === "undefined" || !userId) return;
  const localFavs = getGuestLocalFavorites();
  if (!localFavs || localFavs.length === 0) return;

  try {
    const payload = localFavs.map((pid) => ({
      user_id: userId,
      product_id: pid,
    }));

    // Try upserting into user_favorites
    const { error } = await supabase
      .from("user_favorites")
      .upsert(payload, { onConflict: "user_id,product_id" });

    if (error) {
      // Fallback to legacy favorites table if user_favorites table is not present
      await supabase.from("favorites").upsert(payload);
    }

    // Safely clear local guest favorites keys to prevent duplicate handover
    localStorage.removeItem(GUEST_FAV_KEY);
    localStorage.removeItem(LEGACY_FAV_KEY);
  } catch (err) {
    console.warn("Failed to sync guest favorites to user:", err);
  }
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const isRegisteredUser = Boolean(user && user.id && !user.isGuest && !user.id.startsWith("guest-"));

  // Fetch or sync favorites based on active identity
  const loadFavorites = useCallback(async () => {
    setLoading(true);
    if (!isRegisteredUser) {
      // Guest User: LocalStorage ONLY (Zero Database Footprint)
      const local = getGuestLocalFavorites();
      setFavoriteIds(local);
      setLoading(false);
      return;
    }

    // Registered User: Supabase strict query by user.id
    try {
      let { data, error } = await supabase
        .from("user_favorites")
        .select("product_id")
        .eq("user_id", user!.id);

      if (error || !data) {
        // Fallback to legacy favorites table
        const fallbackRes = await supabase
          .from("favorites")
          .select("product_id")
          .eq("user_id", user!.id);
        data = fallbackRes.data || [];
      }

      const remoteFavs = data.map((item: any) => item.product_id).filter(Boolean);
      setFavoriteIds(remoteFavs);
    } catch (err) {
      console.warn("Error fetching registered user favorites:", err);
      setFavoriteIds([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isRegisteredUser]);

  useEffect(() => {
    loadFavorites();

    const handleUpdated = (e: CustomEvent<string[]>) => {
      if (e.detail && Array.isArray(e.detail)) {
        setFavoriteIds(e.detail);
      }
    };

    window.addEventListener("favorites_updated" as any, handleUpdated);
    return () => window.removeEventListener("favorites_updated" as any, handleUpdated);
  }, [loadFavorites]);

  const isFavorite = useCallback(
    (productId: string) => favoriteIds.includes(productId),
    [favoriteIds]
  );

  const toggleFavorite = useCallback(
    async (productId: string): Promise<string[]> => {
      const exists = favoriteIds.includes(productId);
      const updated = exists
        ? favoriteIds.filter((id) => id !== productId)
        : [...favoriteIds, productId];

      setFavoriteIds(updated);
      window.dispatchEvent(new CustomEvent("favorites_updated", { detail: updated }));

      if (!isRegisteredUser) {
        // Guest: Persist to localStorage ONLY
        localStorage.setItem(GUEST_FAV_KEY, JSON.stringify(updated));
      } else {
        // Registered User: Write directly to Supabase
        const userId = user!.id;
        try {
          if (exists) {
            const { error } = await supabase
              .from("user_favorites")
              .delete()
              .eq("user_id", userId)
              .eq("product_id", productId);

            if (error) {
              await supabase
                .from("favorites")
                .delete()
                .eq("user_id", userId)
                .eq("product_id", productId);
            }
          } else {
            const { error } = await supabase
              .from("user_favorites")
              .upsert({ user_id: userId, product_id: productId }, { onConflict: "user_id,product_id" });

            if (error) {
              await supabase
                .from("favorites")
                .upsert({ user_id: userId, product_id: productId });
            }
          }
        } catch (err) {
          console.warn("Error persisting user favorite:", err);
        }
      }

      return updated;
    },
    [favoriteIds, isRegisteredUser, user?.id]
  );

  return (
    <FavoritesContext.Provider
      value={{
        favoriteIds,
        loading,
        isFavorite,
        toggleFavorite,
        syncGuestFavoritesToUser,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return context;
}
