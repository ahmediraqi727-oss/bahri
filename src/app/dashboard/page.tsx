"use client";

import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { useTrash } from "@/lib/trash";
import { useData } from "@/lib/data-context";
import Link from "next/link";

export default function DashboardPage() {
  const { settings } = useSettings();
  const { activities } = useActivityLog();
  const { items: trashItems } = useTrash();
  const { products, suppliers } = useData();
  const theme = settings.roleThemes[settings.currentRole];

  const totalValue = products.reduce((sum, p) => sum + p.retailPrice * p.stock, 0);

  const stats = [
    { label: "المنتجات", value: products.length.toString(), icon: "📦", color: theme.primary },
    { label: "الموردين", value: suppliers.length.toString(), icon: "🚚", color: theme.secondary },
    { label: "قيمة المخزون", value: `${totalValue.toLocaleString()} د.ع`, icon: "💰", color: theme.accent },
    { label: "سجل الحركات", value: activities.length.toString(), icon: "📝", color: "#8b5cf6" },
    { label: "سلة المهملات", value: trashItems.length.toString(), icon: "🗑️", color: "#ef4444" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <img src="/logo.jpg" alt="شعار أحمد بحري" className="w-14 h-14 rounded-2xl object-cover shadow-lg" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            مرحباً بك في {settings.siteName}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            القائمة الرئيسية لإدارة متجرك ومخزونك
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>
                  {stat.value}
                </p>
              </div>
              <span className="text-2xl">{stat.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">روابط سريعة</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link href="/dashboard/products" className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:shadow-md transition-shadow">
            <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-1">📦 المنتجات</h4>
            <p className="text-sm text-blue-600 dark:text-blue-400">إدارة المنتجات والأسعار</p>
          </Link>
          <Link href="/dashboard/activity" className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 hover:shadow-md transition-shadow">
            <h4 className="font-medium text-purple-900 dark:text-purple-300 mb-1">📝 سجل الحركات</h4>
            <p className="text-sm text-purple-600 dark:text-purple-400">تتبع جميع الإجراءات</p>
          </Link>
          <Link href="/dashboard/trash" className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:shadow-md transition-shadow">
            <h4 className="font-medium text-red-900 dark:text-red-300 mb-1">🗑️ سلة المهملات</h4>
            <p className="text-sm text-red-600 dark:text-red-400">استعادة أو حذف العناصر</p>
          </Link>
          <Link href="/dashboard/roles" className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 hover:shadow-md transition-shadow">
            <h4 className="font-medium text-emerald-900 dark:text-emerald-300 mb-1">🔐 الصلاحيات</h4>
            <p className="text-sm text-emerald-600 dark:text-emerald-400">إدارة صلاحيات الإداري</p>
          </Link>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">مراحل التطوير</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { phase: "1", title: "التأسيس والإعدادات", done: true },
            { phase: "2", title: "الصلاحيات والأمان", done: true },
            { phase: "3", title: "المنتجات والموردين", done: true },
          ].map((item) => (
            <div key={item.phase} className={`p-4 rounded-lg border ${item.done ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"}`}>
              <h4 className={`font-medium mb-2 ${item.done ? "text-emerald-900 dark:text-emerald-300" : "text-gray-900 dark:text-white"}`}>
                المرحلة {item.phase} {item.done ? "✓" : ""}
              </h4>
              <p className={`text-sm ${item.done ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}>{item.title}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
