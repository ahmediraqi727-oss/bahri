"use client";

import { useState, useEffect, useMemo } from "react";
import { useData } from "@/lib/data-context";
import { useCart } from "@/lib/cart-context";
import { useSettings } from "@/lib/settings-context";
import { useLang } from "@/lib/lang-context";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase-client";
import { Product } from "@/lib/types";
import { CartItem } from "@/lib/order-types";
import { getActiveIdentity, getIsolatedStorageKey } from "@/lib/session";

export function getFavoriteProductIds(user?: any): string[] {
  if (typeof window === "undefined") return [];
  try {
    const key = getIsolatedStorageKey("customer_favorites", user);
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored);
    // Backward compatibility fallback to generic key if isolated key isn't populated yet
    const fallback = localStorage.getItem("customer_favorites");
    if (fallback) return JSON.parse(fallback);
  } catch { /* ignore */ }
  return [];
}

export function toggleFavoriteProductId(productId: string, user?: any): string[] {
  if (typeof window === "undefined") return [];
  const key = getIsolatedStorageKey("customer_favorites", user);
  const current = getFavoriteProductIds(user);
  const exists = current.includes(productId);
  const updated = exists ? current.filter((id) => id !== productId) : [...current, productId];
  localStorage.setItem(key, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent("favorites_updated", { detail: updated }));

  // Async sync with Supabase for registered users
  const identity = getActiveIdentity(user);
  if (identity.isRegistered) {
    if (exists) {
      supabase.from("favorites").delete().eq("user_id", identity.id).eq("product_id", productId).then();
    } else {
      supabase.from("favorites").upsert({ user_id: identity.id, product_id: productId }).then();
    }
  }
  return updated;
}

interface CustomerProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CustomerProductsModal({ isOpen, onClose }: CustomerProductsModalProps) {
  const { user } = useAuth();
  const { products, getEffectiveTiers } = useData();
  const { addItem } = useCart();
  const { settings } = useSettings();
  const { t } = useLang();

  const [tab, setTab] = useState<"purchased" | "favorites">("purchased");
  const [purchasedProducts, setPurchasedProducts] = useState<Product[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

  // Sync favorites state
  useEffect(() => {
    setFavoriteIds(getFavoriteProductIds(user));

    // Also fetch remote favorites for registered user
    const identity = getActiveIdentity(user);
    if (identity.isRegistered) {
      supabase
        .from("favorites")
        .select("product_id")
        .eq("user_id", identity.id)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const dbFavs = data.map((f: any) => f.product_id).filter(Boolean);
            setFavoriteIds((prev) => Array.from(new Set([...prev, ...dbFavs])));
          }
        });
    }

    const handleUpdated = (e: CustomEvent<string[]>) => {
      setFavoriteIds(e.detail || []);
    };
    window.addEventListener("favorites_updated" as any, handleUpdated);
    return () => window.removeEventListener("favorites_updated" as any, handleUpdated);
  }, [user]);

  // Fetch customer purchase history strictly scoped by identity
  useEffect(() => {
    if (!isOpen) return;

    async function fetchPurchasedItems() {
      setLoadingHistory(true);
      try {
        const identity = getActiveIdentity(user);
        let customerPhone = "";
        if (typeof window !== "undefined") {
          const guestCookie = document.cookie.match(/app_guest_user=([^;]+)/);
          if (guestCookie) {
            try {
              const parsed = JSON.parse(decodeURIComponent(guestCookie[1]));
              customerPhone = parsed.phone || "";
            } catch { /* ignore */ }
          }
        }

        let ordersData: any[] = [];
        if (identity.isRegistered) {
          const res = await supabase
            .from("orders")
            .select("items")
            .eq("user_id", identity.id)
            .order("created_at", { ascending: false })
            .limit(50);
          ordersData = res.data || [];
        } else {
          // Scope guest orders strictly by guest session or guest phone
          let guestFilter = `session_id.eq.${identity.id},guest_session_id.eq.${identity.id}`;
          if (customerPhone && customerPhone.length > 5) {
            guestFilter += `,customer_phone.eq.${customerPhone}`;
          }
          const res = await supabase
            .from("orders")
            .select("items")
            .or(guestFilter)
            .order("created_at", { ascending: false })
            .limit(50);
          ordersData = res.data || [];
        }

        if (ordersData && ordersData.length > 0) {
          const matchedItemIds = new Set<string>();
          ordersData.forEach((order) => {
            const items = (order.items as CartItem[]) || [];
            items.forEach((item) => {
              if (item.productId) matchedItemIds.add(item.productId);
            });
          });

          const foundProducts = products.filter((p) => matchedItemIds.has(p.id));
          setPurchasedProducts(foundProducts);
        } else {
          setPurchasedProducts([]);
        }
      } catch (err) {
        console.warn("Failed to load customer purchased products:", err);
        setPurchasedProducts([]);
      } finally {
        setLoadingHistory(false);
      }
    }

    fetchPurchasedItems();
  }, [isOpen, products, user]);

  const favoriteProducts = useMemo(
    () => products.filter((p) => favoriteIds.includes(p.id)),
    [products, favoriteIds]
  );

  const handleAddToCart = (product: Product) => {
    const tiers = getEffectiveTiers(product.id, settings.pricingTiers);
    addItem({
      productId: product.id,
      name: product.name,
      image: product.image,
      retailPrice: product.retailPrice,
      wholesalePrice: product.wholesalePrice,
      quantity: 1,
      tiers,
    });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1200);
  };

  const handleToggleFav = (productId: string) => {
    const updated = toggleFavoriteProductId(productId);
    setFavoriteIds(updated);
  };

  if (!isOpen) return null;

  const displayList = tab === "purchased" ? purchasedProducts : favoriteProducts;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={onClose} dir="rtl">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 w-full max-w-2xl shadow-2xl overflow-hidden animate-scaleUp max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl font-bold shadow-md">
              🛍️
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">منتجاتي والمفضلة</h3>
              <p className="text-xs text-gray-400">سجل منتجاتك المشتراة وقائمة المنتجات المفضلة</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg">✕</button>
        </div>

        {/* Tab Buttons */}
        <div className="flex rounded-2xl bg-gray-100 dark:bg-gray-800 p-1 mb-4">
          <button
            onClick={() => setTab("purchased")}
            className={`flex-1 py-2.5 px-4 text-xs sm:text-sm font-bold rounded-xl transition-all ${
              tab === "purchased"
                ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
            }`}
          >
            📦 المنتجات المشتراة ({purchasedProducts.length})
          </button>
          <button
            onClick={() => setTab("favorites")}
            className={`flex-1 py-2.5 px-4 text-xs sm:text-sm font-bold rounded-xl transition-all ${
              tab === "favorites"
                ? "bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
            }`}
          >
            ❤️ المفضلة ({favoriteProducts.length})
          </button>
        </div>

        {/* Body List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loadingHistory ? (
            <div className="py-12 text-center space-y-2">
              <span className="text-3xl animate-bounce block">⏳</span>
              <p className="text-xs text-gray-400">جارٍ جلب السجل والمفضلات...</p>
            </div>
          ) : displayList.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <span className="text-5xl block">{tab === "purchased" ? "🛍️" : "🤍"}</span>
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                {tab === "purchased"
                  ? "لم تقم بشراء منتجات سابقاً"
                  : "لا توجد منتجات مضافة في القائمة المفضلة حالياً"}
              </p>
              <p className="text-xs text-gray-400">
                {tab === "purchased"
                  ? "عند إكمال طلبيات جديدة، ستظهر جميع منتجاتك المشتراة هنا للطلب السريع."
                  : "اضغط على رمز القلب ❤️ على أي منتج لإضافته إلى قائمتك المفضلة."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {displayList.map((product) => {
                const isFav = favoriteIds.includes(product.id);
                const isAdded = addedId === product.id;

                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60 hover:shadow-md transition-shadow relative"
                  >
                    {/* Image */}
                    <div className="w-16 h-16 rounded-xl bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                        {product.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-extrabold text-blue-600 dark:text-blue-400">
                          {product.retailPrice.toLocaleString()} {t.dinar}
                        </span>
                        {product.wholesalePrice > 0 && product.wholesalePrice < product.retailPrice && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                            جملة: {product.wholesalePrice.toLocaleString()}
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => handleAddToCart(product)}
                          disabled={isAdded}
                          className={`px-3 py-1 rounded-lg text-[11px] font-bold text-white transition-all shadow-xs ${
                            isAdded ? "bg-emerald-600" : "bg-blue-600 hover:bg-blue-700"
                          }`}
                        >
                          {isAdded ? "✓ أضيف" : "أضف للسلة 🛒"}
                        </button>
                        <button
                          onClick={() => handleToggleFav(product.id)}
                          className={`p-1.5 rounded-lg text-sm transition-colors ${
                            isFav
                              ? "bg-red-50 dark:bg-red-950/40 text-red-600"
                              : "bg-gray-200 dark:bg-gray-700 text-gray-400 hover:text-red-500"
                          }`}
                          title={isFav ? "إزالة من المفضلة" : "إضافة للمفضلة"}
                        >
                          {isFav ? "❤️" : "🤍"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
