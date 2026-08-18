"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/lib/auth-context";

interface MyProductsHubProps {
  userId?: string;
}

export default function MyProductsHub({ userId: propUserId }: MyProductsHubProps) {
  const { user } = useAuth();
  const userId = propUserId || (user && !user.isGuest && !user.id?.startsWith("guest-") ? user.id : "");

  const [favorites, setFavorites] = useState<any[]>([]);
  const [purchased, setPurchased] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCustomerData() {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 1. جلب المفضلة الخاصة بالزبون حصرياً
        const { data: favData, error: favErr } = await supabase
          .from("favorites")
          .select("*")
          .eq("user_id", userId);

        if (favData) setFavorites(favData);
        if (favErr) console.warn("Notice: favorites query:", favErr.message);

        // 2. جلب المشتريات السابقة الخاصة بالزبون حصرياً
        const { data: orderData, error: orderErr } = await supabase
          .from("orders")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (orderData) setPurchased(orderData);
        if (orderErr) console.warn("Notice: orders query:", orderErr.message);
      } catch (err) {
        console.error("Error fetching personal hub data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchCustomerData();
  }, [userId]);

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
            ⭐ المنتجات المفضلة لديك ({favorites.length})
          </h3>
        </div>

        {favorites.length === 0 ? (
          <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-800/40 text-center text-xs text-gray-400">
            لا توجد منتجات مضافة في قائمة المفضلة حالياً.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {favorites.map((fav) => (
              <div key={fav.id} className="p-4 border border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-900 shadow-xs hover:shadow-md transition-all">
                <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white truncate">{fav.product_name || fav.product_id || "منتج مفضل"}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-extrabold mt-1">{fav.price ? `${fav.price} د.ع` : "متوفر بالمعرض"}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* قسم المشتريات السابقة */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
            📦 سجل مشترياتك السابقة ({purchased.length})
          </h3>
        </div>

        {purchased.length === 0 ? (
          <div className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-800/40 text-center text-xs text-gray-400">
            لم تقم بشراء منتجات سابقاً بالحساب الحالي.
          </div>
        ) : (
          <div className="space-y-3">
            {purchased.map((order) => (
              <div key={order.id} className="p-4 border border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-900 shadow-xs flex justify-between items-center flex-wrap gap-2">
                <div>
                  <p className="font-bold text-xs sm:text-sm text-gray-900 dark:text-white">رقم الطلب: #{String(order.id).slice(-8)}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">الحالة: <span className="font-bold text-blue-600 dark:text-blue-400">{order.status || "قيد المعالجة"}</span></p>
                </div>
                <span className="font-extrabold text-blue-600 dark:text-blue-400 text-xs sm:text-sm">
                  {order.total || order.total_amount ? `${(order.total || order.total_amount).toLocaleString()} د.ع` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
