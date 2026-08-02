"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import ImageUploader from "@/components/ImageUploader";
import { CategoryItem, getCategoryDisplayImage } from "@/lib/types";

function helperUpdateNotes(notes: string | undefined, categoryName: string, assign: boolean): string {
  const current = (notes || "").trim();
  const catTag = `الفئة: ${categoryName}`;
  const hasTag = current.toLowerCase().includes(catTag.toLowerCase());

  if (assign) {
    if (hasTag) return current;
    if (!current) return catTag;
    if (current.includes("الفئة:")) {
      return current.replace(/الفئة:\s*[^|,\n]+/g, catTag);
    }
    return `${current} | ${catTag}`;
  } else {
    if (!hasTag) return current;
    let updated = current.replace(new RegExp(`\\|?\\s*${catTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), "").trim();
    if (updated.startsWith("|")) updated = updated.slice(1).trim();
    return updated;
  }
}

export default function CategoriesManager() {
  const { categories, products, addCategory, updateCategory, deleteCategory, updateProduct, autoSyncCategoriesFromProducts } = useData();
  const { settings, updateSettings } = useSettings();
  const comboboxRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Mode: "" (none chosen), "new" or category id
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [catSearchQuery, setCatSearchQuery] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  // Form State
  const [catName, setCatName] = useState("");
  const [catImage, setCatImage] = useState("");
  const [catPriority, setCatPriority] = useState(1);
  const [catKeywords, setCatKeywords] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [productSearch, setProductSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [syncingCategories, setSyncingCategories] = useState(false);
  const [successMsg, setSuccessMsg] = useState(false);

  // Auto Sync Categories on Mount if categories are empty
  useEffect(() => {
    if (categories.length === 0 && products.length > 0) {
      autoSyncCategoriesFromProducts();
    }
  }, [categories.length, products.length, autoSyncCategoriesFromProducts]);

  const handleManualAutoSync = async () => {
    setSyncingCategories(true);
    try {
      const synced = await autoSyncCategoriesFromProducts();
      alert(`تمت مزامنة وتجميع ${synced.length} قسم بنجاح في قاعدة البيانات!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`حدث خطأ أثناء التزامن: ${msg}`);
    } finally {
      setSyncingCategories(false);
    }
  };

  // Sorted Categories by Priority Ascending
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }, [categories]);

  // Active Category object if editing
  const activeCategory = useMemo(() => {
    return categories.find((c) => c.id === selectedCategoryId);
  }, [categories, selectedCategoryId]);

  // Handle click outside for combobox dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (comboboxRef.current && !comboboxRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setCatSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load category values when selectedCategoryId changes
  useEffect(() => {
    if (selectedCategoryId === "new") {
      setCatName("");
      setCatImage("");
      setCatPriority(categories.length + 1);
      setCatKeywords("");
      setSelectedProductIds(new Set());
    } else if (selectedCategoryId === "") {
      setCatName("");
      setCatImage("");
      setCatPriority(categories.length + 1);
      setCatKeywords("");
      setSelectedProductIds(new Set());
    } else if (activeCategory) {
      setCatName(activeCategory.name);
      setCatImage(activeCategory.image || "");
      setCatPriority(activeCategory.priority || 1);
      setCatKeywords(activeCategory.keywords || "");

      // Find products belonging to this category
      const assigned = new Set<string>();
      products.forEach((p) => {
        if (p.notes && p.notes.toLowerCase().includes(activeCategory.name.toLowerCase())) {
          assigned.add(p.id);
        }
      });
      setSelectedProductIds(assigned);
    }
    setSuccessMsg(false);
  }, [selectedCategoryId, activeCategory, categories.length, products]);

  const handleSelectCategoryToEdit = (catId: string) => {
    setSelectedCategoryId(catId);
    setCatSearchQuery("");
    setIsDropdownOpen(false);
    if (editorRef.current) {
      editorRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Filtered Categories List for Combobox
  const filteredCategoriesList = useMemo(() => {
    if (!catSearchQuery.trim()) return sortedCategories;
    const q = catSearchQuery.trim().toLowerCase();
    return sortedCategories.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.keywords && c.keywords.toLowerCase().includes(q))
    );
  }, [sortedCategories, catSearchQuery]);

  // Filter products by search term
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.notes && p.notes.toLowerCase().includes(q)));
  }, [products, productSearch]);

  const handleSelectAll = () => {
    const allIds = new Set(products.map((p) => p.id));
    setSelectedProductIds(allIds);
  };

  const handleDeselectAll = () => {
    setSelectedProductIds(new Set());
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!catName.trim()) {
      alert("يرجى إدخال اسم القسم!");
      return;
    }

    setSaving(true);
    try {
      let catObj: CategoryItem;

      if (selectedCategoryId === "new" || selectedCategoryId === "") {
        catObj = await addCategory({
          name: catName.trim(),
          image: catImage,
          priority: catPriority,
          keywords: catKeywords.trim(),
          isActive: true,
        });
        setSelectedCategoryId(catObj.id);
      } else if (activeCategory) {
        await updateCategory(activeCategory.id, {
          name: catName.trim(),
          image: catImage,
          priority: catPriority,
          keywords: catKeywords.trim(),
        });
        catObj = { ...activeCategory, name: catName.trim(), image: catImage, priority: catPriority, keywords: catKeywords.trim() };
      } else {
        return;
      }

      // Update product tags in notes for associated products
      const nameTag = catObj.name;
      const updatesPromises = products.map(async (p) => {
        const isAssigned = selectedProductIds.has(p.id);
        const newNotes = helperUpdateNotes(p.notes, nameTag, isAssigned);
        if (newNotes !== (p.notes || "")) {
          await updateProduct(p.id, { notes: newNotes });
        }
      });

      await Promise.all(updatesPromises);

      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء حفظ القسم والمنتجات";
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (selectedCategoryId === "new" || selectedCategoryId === "") {
      setCatName("");
      setCatImage("");
      setCatPriority(categories.length + 1);
      setCatKeywords("");
      setCatSearchQuery("");
      setSelectedProductIds(new Set());
    } else if (activeCategory) {
      setCatName(activeCategory.name);
      setCatImage(activeCategory.image || "");
      setCatPriority(activeCategory.priority || 1);
      setCatKeywords(activeCategory.keywords || "");
      setCatSearchQuery("");
      const assigned = new Set<string>();
      products.forEach((p) => {
        if (p.notes && p.notes.toLowerCase().includes(activeCategory.name.toLowerCase())) {
          assigned.add(p.id);
        }
      });
      setSelectedProductIds(assigned);
    }
  };

  const inputValue = isDropdownOpen
    ? catSearchQuery
    : activeCategory
    ? activeCategory.name
    : selectedCategoryId === "new"
    ? "✨ قسم جديد"
    : "";

  return (
    <div className="space-y-8" dir="rtl">
      {/* 1. Toggle Switch for Homepage Carousel */}
      <div className="flex items-center justify-between p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl shadow-sm">
        <div className="space-y-1">
          <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
            <span>🎞️</span> إظهار شريط الأقسام المتحرك في الصفحة الرئيسية
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            عند التفعيل، يتم عرض شريط أفقي متحرك للأقسام بالصور والأسماء للزبائن
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

      {/* 2. Top Interactive Categories Horizontal Carousel Bar */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📂</span>
            <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
              الأقسام التفاعلية السريعة ({sortedCategories.length})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualAutoSync}
              disabled={syncingCategories}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              title="تجميع كافة الأقسام وحفظها بصفة دائمة في قاعدة البيانات"
            >
              <span>🔄</span>
              <span>{syncingCategories ? "جاري التزامن..." : "تزامن الأقسام التلقائي وقاعدة البيانات"}</span>
            </button>
            <span className="text-xs text-gray-400 font-medium hidden md:inline">اضغط على أي قسم لاستحضاره وتعديله فوراً</span>
          </div>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto py-2 no-scrollbar scroll-smooth" style={{ scrollbarWidth: "none" }}>
          {sortedCategories.map((c) => {
            const isSelected = selectedCategoryId === c.id;
            const catProds = products.filter((p) => p.notes && p.notes.toLowerCase().includes(c.name.toLowerCase()));
            const displayImg = getCategoryDisplayImage(c, products);
            return (
              <button
                key={c.id}
                onClick={() => handleSelectCategoryToEdit(c.id)}
                className={`flex-shrink-0 flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 shadow-md scale-105"
                    : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 hover:border-blue-300 text-gray-800 dark:text-gray-200"
                }`}
              >
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                  {displayImg ? (
                    <img src={displayImg} alt={c.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg">📁</span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs font-extrabold line-clamp-1">{c.name}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mt-0.5">
                    أولوية: {c.priority} • [{catProds.length} منتج]
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Category Analytics & Dynamic Alert Cards Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
            <span>📊</span> إحصائيات الأقسام والتنبيهات الذكية للمخزون والزيارات
          </h3>
          <span className="text-xs text-gray-400">تحديث تلقائي لحالة مخزون المنتجات وعدد الزيارات</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedCategories.map((c) => {
            const catProds = products.filter((p) => p.notes && p.notes.toLowerCase().includes(c.name.toLowerCase()));
            const totalCount = catProds.length;
            const lowStockCount = catProds.filter((p) => p.stock > 0 && p.stock <= 5).length;
            const outOfStockCount = catProds.filter((p) => p.stock === 0).length;
            const viewsCount = c.views || 0;
            const displayImg = getCategoryDisplayImage(c, products);

            // Border Alert Logic: Red if out of stock, Yellow if low stock, Normal if healthy
            let borderStyle = "border-emerald-300 dark:border-emerald-800 bg-white dark:bg-gray-800/90";
            let alertBadge = <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/40 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">✅ المخزون متوفر</span>;

            if (outOfStockCount > 0) {
              borderStyle = "border-red-500 dark:border-red-600 bg-red-50/40 dark:bg-red-950/20 text-red-900 dark:text-red-200 ring-2 ring-red-500/20";
              alertBadge = <span className="text-[11px] font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50 px-2.5 py-0.5 rounded-full border border-red-300 dark:border-red-800 animate-pulse">🚨 منتجات منفذة بالكامل</span>;
            } else if (lowStockCount > 0) {
              borderStyle = "border-amber-400 dark:border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 ring-2 ring-amber-400/20";
              alertBadge = <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-2.5 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">⚠️ وشيكة على النفاد</span>;
            }

            return (
              <div
                key={c.id}
                className={`p-5 rounded-2xl border transition-all duration-300 shadow-sm space-y-4 flex flex-col justify-between ${borderStyle}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center shadow-inner flex-shrink-0">
                        {displayImg ? (
                          <img src={displayImg} alt={c.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl">📁</span>
                        )}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">{c.name}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">رقم الأولوية: {c.priority}</p>
                      </div>
                    </div>
                    {alertBadge}
                  </div>

                  {/* Analytics Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-3">
                    <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700 text-center">
                      <span className="block text-xs font-bold text-gray-500 dark:text-gray-400">إجمالي المنتجات</span>
                      <span className="text-base font-extrabold text-blue-600 dark:text-blue-400 mt-0.5 block">{totalCount} منتج</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700 text-center">
                      <span className="block text-xs font-bold text-gray-500 dark:text-gray-400">عدد الزوار</span>
                      <span className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5 block">👁️ {viewsCount} زيارة</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-center">
                      <span className="block text-[11px] font-bold text-amber-700 dark:text-amber-300">وشيكة النفاد</span>
                      <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400 mt-0.5 block">{lowStockCount} منتج</span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-red-50/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
                      <span className="block text-[11px] font-bold text-red-700 dark:text-red-300">نفذت بالكامل</span>
                      <span className="text-sm font-extrabold text-red-600 dark:text-red-400 mt-0.5 block">{outOfStockCount} منتج</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleSelectCategoryToEdit(c.id)}
                  className="w-full py-2 bg-gray-100 dark:bg-gray-700 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 text-gray-700 dark:text-gray-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm mt-2"
                >
                  <span>✏️</span>
                  <span>استحضار وتعديل بيانات هذا القسم</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMsg && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-2xl flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-sm font-bold animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎉</span>
            <span>تم حفظ بيانات القسم وتحديث ربط المنتجات بنجاح!</span>
          </div>
          <button onClick={() => setSuccessMsg(false)} className="text-emerald-600 hover:text-emerald-800 text-xs">✕</button>
        </div>
      )}

      {/* 4. Searchable Combobox Category Selector & Editor Section */}
      <div ref={editorRef} className="bg-white dark:bg-gray-800/80 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div ref={comboboxRef} className="relative flex-1">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center justify-between">
              <span>📂 اختر قسماً حالياً لتعديله أو استحضار بياناته:</span>
              {selectedCategoryId && selectedCategoryId !== "new" && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryId("");
                    setCatSearchQuery("");
                  }}
                  className="text-[11px] text-gray-400 hover:text-gray-600 underline font-normal"
                >
                  إلغاء التحديد
                </button>
              )}
            </label>

            <div
              className="relative cursor-pointer"
              onClick={() => {
                setIsDropdownOpen(true);
              }}
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => {
                  setCatSearchQuery(e.target.value);
                  setIsDropdownOpen(true);
                }}
                onFocus={() => {
                  setCatSearchQuery("");
                  setIsDropdownOpen(true);
                }}
                placeholder="اختر قسماً من القائمة أو ابحث باسم القسم..."
                className="w-full px-4 py-2.5 pl-12 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 cursor-text"
              />

              <div className="absolute left-3 top-2.5 flex items-center gap-1.5 text-gray-400">
                {selectedCategoryId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCatSearchQuery("");
                      setSelectedCategoryId("");
                    }}
                    className="hover:text-gray-600 text-xs font-bold px-1"
                    title="مسح الإدخال"
                  >
                    ✕
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isDropdownOpen) {
                      setCatSearchQuery("");
                    }
                    setIsDropdownOpen((prev) => !prev);
                  }}
                  className="hover:text-gray-600 text-xs font-bold px-1 transition-transform"
                  title="فتح/إغلاق القائمة"
                >
                  {isDropdownOpen ? "▲" : "▼"}
                </button>
              </div>
            </div>

            {/* Dropdown Options List */}
            {isDropdownOpen && (
              <div className="absolute top-full right-0 left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 animate-fadeIn">
                {/* Independent First Option: Create New Category */}
                <div
                  onClick={() => {
                    setSelectedCategoryId("new");
                    setCatSearchQuery("");
                    setIsDropdownOpen(false);
                  }}
                  className="p-3 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 cursor-pointer flex items-center gap-2"
                >
                  <span>✨</span>
                  <span>[+ إنشاء وإضافة قسم جديد]</span>
                </div>

                {/* Filtered Existing Categories List */}
                {filteredCategoriesList.length > 0 ? (
                  filteredCategoriesList.map((c) => {
                    const count = products.filter(
                      (p) => p.notes && p.notes.toLowerCase().includes(c.name.toLowerCase())
                    ).length;
                    const isSelected = selectedCategoryId === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCategoryId(c.id);
                          setCatSearchQuery("");
                          setIsDropdownOpen(false);
                        }}
                        className={`p-3 text-xs font-bold cursor-pointer flex items-center justify-between transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                            : "text-gray-800 dark:text-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>📁</span>
                          <span>{c.name}</span>
                          <span className="text-[10px] text-gray-400 font-normal">(أولوية: {c.priority})</span>
                        </div>
                        <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                          {count} منتج
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 text-xs text-gray-400 text-center">
                    لا يطابق أي قسم حالي
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSelectedCategoryId("new");
                setCatSearchQuery("");
                setIsDropdownOpen(false);
              }}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2 ${
                selectedCategoryId === "new"
                  ? "bg-blue-600 text-white ring-2 ring-blue-300"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200"
              }`}
            >
              <span>✨</span>
              <span>+ إضافة قسم جديد</span>
            </button>
          </div>
        </div>

        {/* Delete Category Button if editing an existing one */}
        {selectedCategoryId && selectedCategoryId !== "new" && activeCategory && (
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-end">
            <button
              onClick={() => {
                if (confirm(`هل أنت تأكد من حذف قسم "${activeCategory.name}" بالكامل؟`)) {
                  deleteCategory(activeCategory.id);
                  setSelectedCategoryId("new");
                }
              }}
              className="text-xs text-red-600 dark:text-red-400 font-bold hover:underline flex items-center gap-1"
            >
              <span>🗑️</span>
              <span>حذف هذا القسم بالكامل</span>
            </button>
          </div>
        )}
      </div>

      {/* 5. Category Metadata Inputs */}
      <div className="bg-white dark:bg-gray-800/80 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
        <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-3">
          <span>✏️</span> {selectedCategoryId === "new" || !selectedCategoryId ? "بيانات القسم الجديد" : `تعديل بيانات قسم: ${catName}`}
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              اسم القسم *
            </label>
            <input
              type="text"
              placeholder="مثال: محركات وفلاتر"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              رقم الأولوية / الترتيب (Order Number)
            </label>
            <input
              type="number"
              min="1"
              value={catPriority}
              onChange={(e) => setCatPriority(Number(e.target.value))}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Keywords Input Field */}
        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
            <span>🏷️ الكلمات المفتاحية للاقتراح والتقسيم التلقائي (Keywords / Tags)</span>
            <span className="text-[10px] text-gray-400 font-normal">افصل بين الكلمات بفاصلة ( , )</span>
          </label>
          <input
            type="text"
            placeholder="مثال لقسم العجلات: إطار, تائر, عجلات, تريب"
            value={catKeywords}
            onChange={(e) => setCatKeywords(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            💡 يعتمد النظام على هذه الكلمات لاقتراح هذا القسم تلقائياً للمنتج ولعمل التقسيم التلقائي الجماعي للمتجر.
          </p>
        </div>

        <div className="pt-2">
          <ImageUploader
            label="صورة أو أيقونة القسم المميزة"
            image={catImage}
            onUpload={(img) => setCatImage(img)}
            aspect="aspect-square"
          />
        </div>
      </div>

      {/* 6. Category Products Picker & Bulk Select (منتجات القسم والتحديد الجماعي) */}
      <div className="bg-white dark:bg-gray-800/80 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-700 pb-3">
          <div>
            <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <span>📦</span> منتجات هذا القسم (التحديد والربط الجماعي)
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              تم تحديد <span className="font-bold text-blue-600 dark:text-blue-400">{selectedProductIds.size}</span> من أصل <span className="font-bold">{products.length}</span> منتج لهذا القسم
            </p>
          </div>

          {/* Quick Action Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 border border-blue-200 dark:border-blue-800"
            >
              <span>☑️</span>
              <span>تحديد الكل ({products.length})</span>
            </button>

            <button
              onClick={handleDeselectAll}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
            >
              <span>🔳</span>
              <span>إلغاء تحديد الكل</span>
            </button>
          </div>
        </div>

        {/* Product Search Input inside Category Picker */}
        <div>
          <input
            type="text"
            placeholder="بحث وتصفية القائمة بالاسم لحصر المنتجات..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white text-xs font-medium outline-none"
          />
        </div>

        {/* Products Grid Checklist */}
        {filteredProducts.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs bg-gray-50 dark:bg-gray-900/50 rounded-xl">
            لا توجد منتجات مطابقة لعملية البحث.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto p-1 custom-scrollbar">
            {filteredProducts.map((product) => {
              const isChecked = selectedProductIds.has(product.id);
              return (
                <div
                  key={product.id}
                  onClick={() => toggleProductSelection(product.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 select-none ${
                    isChecked
                      ? "border-blue-500 bg-blue-50/70 dark:bg-blue-900/30 ring-1 ring-blue-500"
                      : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}} // handled by parent div onClick
                    className="w-4 h-4 text-blue-600 rounded accent-blue-600 cursor-pointer"
                  />

                  {product.image ? (
                    <img src={product.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm">📦</div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{product.name}</p>
                    <p className="text-[11px] text-blue-600 dark:text-blue-400 font-extrabold mt-0.5">
                      {product.retailPrice.toLocaleString()} د.ع
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 7. Save & Cancel Action Bar (أزرار الحفظ والإلغاء) */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleCancel}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-bold text-sm hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
        >
          إلغاء التعديلات ❌
        </button>

        <button
          onClick={handleSave}
          disabled={saving || !catName.trim()}
          className="px-8 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg disabled:opacity-40 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
        >
          {saving ? (
            <>
              <span className="animate-spin text-base">🔄</span>
              <span>جاري حفظ وتحديث الربط...</span>
            </>
          ) : (
            <>
              <span>حفظ التغيرات 💾</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
