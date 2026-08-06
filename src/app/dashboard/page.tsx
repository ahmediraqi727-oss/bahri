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

        {/* Per-Category Breakdown */}
        {categories.length > 0 && (
          <div className="pt-2 border-t border-blue-800/60 space-y-1.5">
            <p className="text-[11px] font-bold text-blue-300">تفاصيل عدد المنتجات المندرجة تحت كل قسم:</p>
            <div className="flex items-center gap-2 flex-wrap">
              {categories.map((c) => {
                const count = products.filter((p) => p.notes && p.notes.toLowerCase().includes(c.name.toLowerCase())).length;
                return (
                  <span key={c.id} className="px-2.5 py-1 rounded-lg bg-white/10 text-white border border-white/10 text-xs font-bold flex items-center gap-1.5">
                    <span>📁 {c.name}:</span>
                    <span className="text-emerald-300 font-extrabold">{count} منتج</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 1. Top Categories Priority Carousel Bar */}
      {categories.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="flex items-center justify-between px-1 mb-3">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <span>📂</span>
              <span>حاوية الأقسام العلوية بالأولويات</span>
            </span>
            <span className="text-[11px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-bold px-2.5 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
              {categories.length} قسم
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 overflow-x-auto p-1 scrollbar-thin">
            {categories.map((cat) => (
              <div
                key={cat.id}
                onClick={handleCategoriesEditClick}
                className="flex flex-col items-center bg-gray-50 dark:bg-gray-900/90 p-3 rounded-xl border border-gray-200 dark:border-gray-800 min-w-[120px] hover:border-blue-500/50 hover:shadow-md transition-all cursor-pointer group"
              >
                {cat.image ? (
                  <img src={cat.image} alt={cat.name} className="w-12 h-12 object-cover rounded-lg mb-1.5 shadow-sm group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xl font-bold mb-1.5">📂</div>
                )}
                <span className="text-xs font-bold text-gray-900 dark:text-white text-center truncate w-full">{cat.name}</span>
                <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 mt-1">أولوية: {cat.priority || 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Responsive Live Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full my-4">
        {/* Visit Count Card */}
        <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow">
          <span className="text-gray-500 dark:text-gray-400 text-xs font-bold mb-1">عدد الزوار والنشاط</span>
          <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-extrabold text-lg">
            <span>👁️ {activities.length} زيارة</span>
          </div>
        </div>

        {/* Total Products Card */}
        <div className="bg-white dark:bg-gray-900/80 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow">
          <span className="text-gray-500 dark:text-gray-400 text-xs font-bold mb-1">إجمالي المنتجات</span>
          <span className="text-purple-600 dark:text-purple-400 font-extrabold text-lg">{products.length} منتج</span>
        </div>

        {/* Low Stock Warning Card */}
        <div className="bg-white dark:bg-gray-900/80 border border-amber-500/40 rounded-xl p-4 flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow sm:col-span-2 lg:col-span-1 bg-amber-50/20">
          <span className="text-amber-600 dark:text-amber-400 text-xs font-bold mb-1">وشيكة النفاد</span>
          <span className="text-amber-500 font-extrabold text-lg">{products.filter((p) => p.stock <= 5).length} منتج</span>
        </div>
      </div>

      {/* 3. Quick Action Buttons Bar */}
      <div className="flex flex-wrap items-center gap-3 my-4">
        <button
          onClick={() => router.push("/dashboard/products")}
          className="flex-1 min-w-[140px] bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-2.5 px-4 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
        >
          📥 استيراد المنتجات
        </button>
        <button
          onClick={() => alert("✅ جاري تجهيز النسخة الاحتياطية الشاملة لجميع منتجات وأقسام المتجر...")}
          className="flex-1 min-w-[140px] bg-purple-600 hover:bg-purple-700 active:scale-95 text-white py-2.5 px-4 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
        >
          💾 نسخة احتياطية
        </button>
        <button
          onClick={() => alert("🔄 جاري استعادة آخر نسخة احتياطية سابقة من الأرشيف...")}
          className="flex-1 min-w-[140px] bg-amber-600 hover:bg-amber-700 active:scale-95 text-white py-2.5 px-4 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
        >
          ↺ استعادة النسخة
        </button>
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
