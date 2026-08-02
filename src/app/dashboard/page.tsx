"use client";

import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { useTrash } from "@/lib/trash";
import { useData } from "@/lib/data-context";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/permissions";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const { settings } = useSettings();
  const { activities } = useActivityLog();
  const { items: trashItems } = useTrash();
  const { products, suppliers, categories } = useData();
  const { user } = useAuth();

  const currentRole = settings?.currentRole || user?.role || "manager";
  const theme = settings?.roleThemes?.[currentRole] || { primary: "#1e40af", secondary: "#7c3aed", accent: "#f59e0b" };

  const totalValue = products.reduce((sum, p) => sum + p.retailPrice * p.stock, 0);

  // Count products assigned to categories
  const categorisedProductsCount = products.filter(
    (p) => p.notes && (p.notes.toLowerCase().includes("فئة") || p.notes.toLowerCase().includes("قسم"))
  ).length;

  const canManageCategories = hasPermission(currentRole, "categories.manage");

  const handleCategoriesEditClick = (e: React.MouseEvent) => {
    if (!canManageCategories) {
      e.preventDefault();
      alert("⚠️ عذراً! لا تملك صلاحية تعديل وإدارة الأقسام. يرجى طلب التفعيل من مدير النظام في قسم الصلاحيات.");
    } else {
      router.push("/dashboard/settings");
    }
  };

  const stats = [
    { label: "المنتجات", value: products.length.toString(), icon: "📦", color: theme.primary },
    { label: "الأقسام الفعالة", value: categories.length.toString(), icon: "📂", color: "#0284c7" },
    { label: "الموردين", value: suppliers.length.toString(), icon: "🚚", color: theme.secondary },
    { label: "قيمة المخزون", value: `${totalValue.toLocaleString()} د.ع`, icon: "💰", color: theme.accent },
    { label: "سجل الحركات", value: activities.length.toString(), icon: "📝", color: "#8b5cf6" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Banner */}
      <div className="flex items-center gap-4">
        <img src="/logo.jpg" alt="شعار أحمد بحري" className="w-14 h-14 rounded-2xl object-cover shadow-lg" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            مرحباً بك في {settings.siteName}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            القائمة الرئيسية لإدارة متجرك، أقسامك، ومخزونك بالكامل
          </p>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400">{stat.label}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: stat.color }}>
                  {stat.value}
                </p>
              </div>
              <span className="text-3xl">{stat.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Categories Special Analytics Card */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-blue-800/50 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📂</span>
              <h3 className="text-lg font-extrabold text-white">بطاقة إحصائيات وإدارة الأقسام</h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/30 text-blue-200 border border-blue-400/30">
                {categories.length} قسم مُعرّف
              </span>
            </div>
            <p className="text-xs text-blue-200/80">
              متابعة تصنيف منتجات المتجر ونسبة الربط الهيكلي بين المنتجات والأقسام
            </p>
          </div>

          <button
            onClick={handleCategoriesEditClick}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 ${
              canManageCategories
                ? "bg-blue-500 hover:bg-blue-400 text-white active:scale-95 cursor-pointer"
                : "bg-gray-700 text-gray-400 cursor-not-allowed opacity-80"
            }`}
          >
            <span>📁</span>
            <span>تعديل / إدارة الأقسام ➔</span>
          </button>
        </div>

        {/* Detailed Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-blue-800/60">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 border border-white/10">
            <p className="text-[11px] font-bold text-blue-200">إجمالي عدد الأقسام</p>
            <p className="text-xl font-extrabold text-white mt-0.5">{categories.length} أقسام</p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 border border-white/10">
            <p className="text-[11px] font-bold text-blue-200">المنتجات المربوطة بأقسام</p>
            <p className="text-xl font-extrabold text-emerald-300 mt-0.5">{categorisedProductsCount} منتج</p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-3.5 border border-white/10">
            <p className="text-[11px] font-bold text-blue-200">صلاحيات الوصول للتعديل</p>
            <p className={`text-xs font-bold mt-1 ${canManageCategories ? "text-emerald-300" : "text-amber-300"}`}>
              {canManageCategories ? "🛡️ مُصرح لك بالإدارة والتعديل" : "🔒 الصلاحية مقيدة (تتطلب موافقة المدير)"}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Links Section */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">روابط سريعة</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <Link href="/dashboard/products" className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:shadow-md transition-shadow">
            <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-1">📦 المنتجات</h4>
            <p className="text-xs text-blue-600 dark:text-blue-400">إدارة المنتجات والأسعار</p>
          </Link>
          <div
            onClick={handleCategoriesEditClick}
            className={`p-4 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 hover:shadow-md transition-shadow cursor-pointer ${
              !canManageCategories && "opacity-75"
            }`}
          >
            <h4 className="font-medium text-sky-900 dark:text-sky-300 mb-1">📂 الأقسام</h4>
            <p className="text-xs text-sky-600 dark:text-sky-400">تخصيص الأقسام والربط</p>
          </div>
          <Link href="/dashboard/activity" className="p-4 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 hover:shadow-md transition-shadow">
            <h4 className="font-medium text-purple-900 dark:text-purple-300 mb-1">📝 سجل الحركات</h4>
            <p className="text-xs text-purple-600 dark:text-purple-400">تتبع جميع الإجراءات</p>
          </Link>
          <Link href="/dashboard/trash" className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:shadow-md transition-shadow">
            <h4 className="font-medium text-red-900 dark:text-red-300 mb-1">🗑️ سلة المهملات</h4>
            <p className="text-xs text-red-600 dark:text-red-400">استعادة أو حذف العناصر</p>
          </Link>
          <Link href="/dashboard/roles" className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 hover:shadow-md transition-shadow">
            <h4 className="font-medium text-emerald-900 dark:text-emerald-300 mb-1">🔐 الصلاحيات</h4>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">إدارة صلاحيات الإداري</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
