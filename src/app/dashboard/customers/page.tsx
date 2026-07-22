"use client";

import { useSales } from "@/lib/sales-context";
import { useSettings } from "@/lib/settings-context";

export default function CustomersPage() {
  const { sales } = useSales();
  const { settings } = useSettings();
  const theme = settings.roleThemes[settings.currentRole];

  const customerMap = new Map<string, { name: string; phone: string; orders: number; totalSpent: number; lastOrder: string }>();

  sales.forEach((sale) => {
    const key = sale.customerPhone;
    const existing = customerMap.get(key);
    if (existing) {
      existing.orders++;
      existing.totalSpent += sale.total;
      if (sale.timestamp > existing.lastOrder) existing.lastOrder = sale.timestamp;
    } else {
      customerMap.set(key, {
        name: sale.customerName,
        phone: sale.customerPhone,
        orders: 1,
        totalSpent: sale.total,
        lastOrder: sale.timestamp,
      });
    }
  });

  const customers = Array.from(customerMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">👥 الزبائن</h1>
        <span className="px-3 py-1 rounded-full text-sm font-medium text-white" style={{ backgroundColor: theme.primary }}>
          {customers.length} زبون
        </span>
      </div>

      {customers.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-12 border border-gray-200 dark:border-gray-700 text-center">
          <span className="text-5xl block mb-4">👥</span>
          <p className="text-lg font-bold text-gray-700 dark:text-gray-200">لا يوجد زبائن بعد</p>
          <p className="text-sm text-gray-400 mt-1">سيظهر الزبائن هنا عند إتمام الطلبات</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">الاسم</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">الهاتف</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">الطلبات</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">إجمالي المشتريات</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">آخر طلب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {customers.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: theme.primary }}>
                          {c.name?.charAt(0) || "?"}
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400" dir="ltr">{c.phone}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: theme.secondary }}>
                        {c.orders}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold" style={{ color: theme.primary }}>
                      {c.totalSpent.toLocaleString()} د.ع
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">
                      {new Date(c.lastOrder).toLocaleDateString("ar-EG")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
