"use client";

import React, { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useFavorites } from "@/contexts/FavoritesContext";
import { usePurchases } from "@/contexts/PurchasesContext";
import { useData } from "@/lib/data-context";

interface MyProductsHubProps {
  userId?: string;
}

export default function MyProductsHub({ userId: propUserId }: MyProductsHubProps) {
  const { user } = useAuth();
  const { products } = useData();
  const { favoriteIds, loading: loadingFavs } = useFavorites();
  const { userOrders, purchasedProductIds, loading: loadingPurchases } = usePurchases();

  const favoriteProducts = useMemo(() => {
    return products.filter((p) => favoriteIds.includes(p.id));
  }, [products, favoriteIds]);

  const purchasedProducts = useMemo(() => {
    return products.filter((p) => purchasedProductIds.includes(p.id));
  }, [products, purchasedProductIds]);

  const loading = loadingFavs || loadingPurchases;

  if (loading) {
    return (
      <div className="p-8 text-center text-sm font-bold text-gray-500 dark:text-gray-400 animate-pulse">
        ⏳ جاري تحميل بياناتك الشخصية ومشترياتك...
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 max-w-full overflow-x-auto" dir="rtl">
      {/* قسم المفضلة */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            ⭐ المنتجات المفضلة لديك ({favoriteProducts.length})
          </h3>
        </div>

        {favoriteProducts.length === 0 ? (
          <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-800/40 text-center text-xs text-gray-400">
            لا توجد منتجات مضافة في قائمة المفضلة حالياً.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {favoriteProducts.map((prod) => (
              <div
                key={prod.id}
                className="p-4 border border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-900 shadow-xs hover:shadow-md transition-all"
              >
                <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                  {prod.name}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-extrabold mt-1">
                  {prod.retailPrice ? `${prod.retailPrice.toLocaleString()} د.ع` : "متوفر بالمعرض"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* قسم المشتريات السابقة */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            📦 سجل مشترياتك السابقة ({userOrders.length > 0 ? userOrders.length : purchasedProducts.length})
          </h3>
        </div>

        {userOrders.length === 0 && purchasedProducts.length === 0 ? (
          <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-800/40 text-center text-xs text-gray-400">
            لم تقم بشراء منتجات سابقاً بالحساب الحالي.
          </div>
        ) : userOrders.length > 0 ? (
          <div className="space-y-3">
            {userOrders.map((order) => (
              <div
                key={order.id}
                className="p-4 border border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-900 shadow-xs flex justify-between items-center flex-wrap gap-2"
              >
                <div>
                  <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">
                    رقم الطلب: #{String(order.id).slice(-8)}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    الحالة:{" "}
                    <span className="font-bold text-blue-600 dark:text-blue-400">
                      {order.status || "قيد المعالجة"}
                    </span>
                  </p>
                </div>
                <span className="font-extrabold text-blue-600 dark:text-blue-400 text-xs sm:text-sm">
                  {order.total || order.total_amount
                    ? `${(order.total || order.total_amount).toLocaleString()} د.ع`
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {purchasedProducts.map((prod) => (
              <div
                key={prod.id}
                className="p-4 border border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-900 shadow-xs hover:shadow-md transition-all"
              >
                <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white truncate">
                  {prod.name}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 font-extrabold mt-1">
                  {prod.retailPrice ? `${prod.retailPrice.toLocaleString()} د.ع` : "تم الشراء"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
