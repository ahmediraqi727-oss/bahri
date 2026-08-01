"use client";

import { useState } from "react";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import ImageUploader from "@/components/ImageUploader";
import { CategoryItem } from "@/lib/types";

export default function CategoriesManager() {
  const { categories, addCategory, updateCategory, deleteCategory } = useData();
  const { settings, updateSettings } = useSettings();

  const [newCatName, setNewCatName] = useState("");
  const [newCatImage, setNewCatImage] = useState("");
  const [newCatPriority, setNewCatPriority] = useState(1);
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newCatName.trim()) {
      alert("يرجى إدخال اسم القسم!");
      return;
    }
    setAdding(true);
    try {
      await addCategory({
        name: newCatName.trim(),
        image: newCatImage,
        priority: newCatPriority,
        isActive: true,
      });
      setNewCatName("");
      setNewCatImage("");
      setNewCatPriority(categories.length + 2);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء إضافة القسم";
      alert(msg);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* 1. Toggle Switch for Carousel */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl">
        <div className="space-y-1">
          <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
            <span>🎞️</span> إظهار شريط الأقسام المتحرك في الصفحة الرئيسية
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            عند التفعيل، يتم عرض شريط أفقي متحرك (Carousel) للأقسام بالصور والأسماء في واجهة المتجر للزبائن
          </p>
        </div>

        <button
          onClick={() => updateSettings({ showCategoriesCarousel: !settings.showCategoriesCarousel })}
          className={`relative w-14 h-7 rounded-full transition-colors flex-shrink-0 ${
            settings.showCategoriesCarousel ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <div
            className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-transform flex items-center justify-center text-xs font-bold ${
              settings.showCategoriesCarousel ? "right-0.5" : "right-7"
            }`}
          >
            {settings.showCategoriesCarousel ? "✓" : "✕"}
          </div>
        </button>
      </div>

      {/* 2. Add New Category Form */}
      <div className="bg-gray-50 dark:bg-gray-800/70 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
        <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
          <span>➕</span> إضافة قسم جديد للمتجر
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              اسم القسم
            </label>
            <input
              type="text"
              placeholder="مثال: فلاتر وزيوت"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              ترتيب / أولوية الظهور (Order Number)
            </label>
            <input
              type="number"
              min="1"
              value={newCatPriority}
              onChange={(e) => setNewCatPriority(Number(e.target.value))}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none font-medium"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={adding || !newCatName.trim()}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
            >
              {adding ? "جاري الإضافة..." : "حفظ إضافة القسم ➕"}
            </button>
          </div>
        </div>

        <div className="pt-2">
          <ImageUploader
            label="صورة / أيقونة القسم المميزة (اختياري)"
            image={newCatImage}
            onUpload={(img) => setNewCatImage(img)}
            aspect="aspect-square"
          />
        </div>
      </div>

      {/* 3. Existing Categories List */}
      <div className="space-y-3">
        <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center justify-between">
          <span>📁 قائمة الأقسام الحالية ({categories.length})</span>
          <span className="text-xs text-gray-400 font-normal">مرتبة بحسب رقم الأولوية</span>
        </h4>

        {categories.length === 0 ? (
          <div className="p-8 text-center bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-200 dark:border-gray-700 text-gray-400 text-sm">
            لا توجد أقسام معرفة بعد. يمكنك إضافة قسم جديد من النموذج أعلاه!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-3 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1">
                    {cat.image ? (
                      <img src={cat.image} alt={cat.name} className="w-12 h-12 rounded-xl object-cover border border-gray-200 dark:border-gray-700 shadow-sm" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl font-bold border border-blue-200 dark:border-blue-800">
                        📁
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        type="text"
                        value={cat.name}
                        onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                        className="w-full font-bold text-gray-900 dark:text-white bg-transparent border-b border-gray-200 dark:border-gray-700 focus:border-blue-500 outline-none text-sm py-1"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (confirm(`هل أنت تأكد من حذف قسم "${cat.name}"؟`)) {
                        deleteCategory(cat.id);
                      }
                    }}
                    className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-xs transition-colors"
                    title="حذف القسم"
                  >
                    🗑️
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-gray-700/60 items-center">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 mb-1">
                      رقم الأولوية:
                    </label>
                    <input
                      type="number"
                      value={cat.priority}
                      onChange={(e) => updateCategory(cat.id, { priority: Number(e.target.value) })}
                      className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-xs font-bold text-gray-900 dark:text-white outline-none"
                    />
                  </div>

                  <div className="text-left pt-3">
                    <ImageUploader
                      label="تغيير الصورة"
                      image={cat.image}
                      onUpload={(img) => updateCategory(cat.id, { image: img })}
                      aspect="aspect-square"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
