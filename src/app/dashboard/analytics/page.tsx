"use client";

import { useState, useMemo } from "react";
import { useSales } from "@/lib/sales-context";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";

type Period = "week" | "month" | "year";

function getPeriodRange(period: Period): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let start: Date;
  let label: string;

  switch (period) {
    case "week":
      start = new Date(now);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      label = "آخر 7 أيام";
      break;
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      label = `شهر ${now.toLocaleDateString("ar-EG", { month: "long" })}`;
      break;
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      label = `سنة ${now.getFullYear()}`;
      break;
  }
  return { start, end, label };
}

export default function AnalyticsPage() {
  const { sales, getTopProducts, getLoyalCustomers, getProfitByPeriod, getDailySales } = useSales();
  const { products } = useData();
  const { settings } = useSettings();
  const theme = settings.roleThemes[settings.currentRole];

  const [period, setPeriod] = useState<Period>("month");
  const periodData = useMemo(() => getPeriodRange(period), [period]);
  const profitData = useMemo(() => getProfitByPeriod(periodData.start, periodData.end), [periodData, getProfitByPeriod]);
  const topProducts = useMemo(() => getTopProducts(8), [getTopProducts]);
  const loyalCustomers = useMemo(() => getLoyalCustomers(), [getLoyalCustomers]);
  const dailySales = useMemo(() => getDailySales(period === "week" ? 7 : period === "month" ? 30 : 12), [period, getDailySales]);

  const maxSale = Math.max(...dailySales.map((d) => d.sales), 1);
  const marginPct = profitData.revenue > 0 ? Math.round((profitData.profit / profitData.revenue) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الإحصاءات والتقارير</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{periodData.label}</p>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {(["week", "month", "year"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === p ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {p === "week" ? "أسبوعي" : p === "month" ? "شهري" : "سنوي"}
            </button>
          ))}
        </div>
      </div>

      {/* Profit Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المبيعات", value: `${profitData.revenue.toLocaleString()} د.ع`, icon: "💵", color: theme.primary },
          { label: "التكلفة", value: `${profitData.cost.toLocaleString()} د.ع`, icon: "📦", color: "#ef4444" },
          { label: "صافي الربح", value: `${profitData.profit.toLocaleString()} د.ع`, icon: "📈", color: "#10b981" },
          { label: "نسبة الربح", value: `${marginPct}%`, icon: "🎯", color: theme.accent },
        ].map((card) => (
          <div key={card.label} className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">{card.label}</span>
              <span className="text-xl">{card.icon}</span>
            </div>
            <p className="text-2xl font-extrabold" style={{ color: card.color }}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Chart */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">📈 رسم المبيعات</h3>
          {dailySales.every((d) => d.sales === 0) ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              لا توجد بيانات مبيعات بعد
            </div>
          ) : (
            <div className="h-48 flex items-end gap-1">
              {dailySales.map((d, i) => {
                const h = maxSale > 0 ? (d.sales / maxSale) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                      {d.date}: {d.sales.toLocaleString()} د.ع
                    </div>
                    <div
                      className="w-full rounded-t-md transition-all hover:opacity-80 min-h-[2px]"
                      style={{
                        height: `${Math.max(h, 2)}%`,
                        backgroundColor: d.sales > 0 ? theme.primary : "#e5e7eb",
                      }}
                    />
                    {dailySales.length <= 7 && (
                      <span className="text-[10px] text-gray-400 mt-1">{d.date}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">🏆 المنتجات الأكثر مبيعاً</h3>
          {topProducts.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              لا توجد مبيعات بعد
            </div>
          ) : (
            <div className="space-y-3">
              {topProducts.slice(0, 6).map((p, i) => {
                const maxRev = topProducts[0]?.revenue || 1;
                const pct = (p.revenue / maxRev) * 100;
                const medals = ["🥇", "🥈", "🥉"];
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-900 dark:text-white font-medium">
                        {medals[i] || `${i + 1}.`} {p.name}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">{p.quantity} قطعة</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: theme.primary }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Loyal Customers */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">⭐ الزبائن الدائمين</h3>
          {loyalCustomers.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              لا توجد بيانات زبائن بعد
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="py-2 text-right text-gray-500 font-medium">الزبون</th>
                    <th className="py-2 text-right text-gray-500 font-medium">الهاتف</th>
                    <th className="py-2 text-right text-gray-500 font-medium">الطلبات</th>
                    <th className="py-2 text-right text-gray-500 font-medium">المصروف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loyalCustomers.slice(0, 8).map((c, i) => (
                    <tr key={i} className={`${c.orders >= 3 ? "bg-amber-50 dark:bg-amber-900/10" : ""}`}>
                      <td className="py-2.5 text-gray-900 dark:text-white font-medium">
                        {c.name}
                        {c.orders >= 3 && <span className="mr-1 text-xs">⭐</span>}
                      </td>
                      <td className="py-2.5 text-gray-500 dark:text-gray-400">{c.phone}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.orders >= 3 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          {c.orders}
                        </span>
                      </td>
                      <td className="py-2.5 text-gray-900 dark:text-white font-medium">{c.totalSpent.toLocaleString()} د.ع</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">📊 ملخص سريع</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-sm text-gray-600 dark:text-gray-400">عدد المعاملات</span>
              <span className="font-bold text-gray-900 dark:text-white">{sales.length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-sm text-gray-600 dark:text-gray-400">عدد المنتجات</span>
              <span className="font-bold text-gray-900 dark:text-white">{products.length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-sm text-gray-600 dark:text-gray-400">الزبائن الفريدون</span>
              <span className="font-bold text-gray-900 dark:text-white">{loyalCustomers.length}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <span className="text-sm text-gray-600 dark:text-gray-400">متوسط الطلب</span>
              <span className="font-bold text-gray-900 dark:text-white">
                {sales.length > 0 ? Math.round(profitData.revenue / sales.length).toLocaleString() : 0} د.ع
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
