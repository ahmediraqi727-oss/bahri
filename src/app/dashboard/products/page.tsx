"use client";

import { useState, useMemo } from "react";
import { useData } from "@/lib/data-context";
import { useSettings } from "@/lib/settings-context";
import { useActivityLog } from "@/lib/activity-log";
import { useTrash } from "@/lib/trash";
import ProductModal from "@/components/ProductModal";
import { Product, calculateRetailPrice } from "@/lib/types";
import { hasPermission } from "@/lib/permissions";
import { getAdminPermissionsConfig } from "@/components/PermissionGate";
import ImportExportBar from "@/components/ImportExportBar";

export default function ProductsPage() {
  const { products, suppliers, categories, addCategory, deleteProduct, updateProduct } = useData();
  const { settings } = useSettings();
  const { logActivity } = useActivityLog();
  const { softDelete } = useTrash();
  const config = getAdminPermissionsConfig();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Selection & Bulk Edits
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkModal, setBulkModal] = useState<"category" | "supplier" | "margin" | "price" | "delete" | null>(null);

  // Bulk Edit Form Inputs
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkSupplierId, setBulkSupplierId] = useState("");
  const [bulkMargin, setBulkMargin] = useState<number>(20);
  const [bulkPriceMode, setBulkPriceMode] = useState<"fixed" | "add_amount" | "add_percent">("fixed");
  const [bulkPriceVal, setBulkPriceVal] = useState<number>(0);
  const [submittingBulk, setSubmittingBulk] = useState(false);

  const canCreate = hasPermission(settings.currentRole, "products.create", config);
  const canEdit = hasPermission(settings.currentRole, "products.edit", config);
  const canDelete = hasPermission(settings.currentRole, "products.delete", config);

  const filtered = useMemo(() => {
    if (!searchQuery) return products;
    const q = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.notes.toLowerCase().includes(q) ||
        suppliers.find((s) => s.id === p.supplierId)?.name.toLowerCase().includes(q)
    );
  }, [products, searchQuery, suppliers]);

  const getSupplierName = (id: string) => suppliers.find((s) => s.id === id)?.name || "—";

  // Checkboxes Selection logic
  const isAllSelected = filtered.length > 0 && filtered.every((p) => selectedIds.includes(p.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((p) => p.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDelete = async (product: Product) => {
    await softDelete("product", product.id, product.name, { ...product }, settings.currentRole);
    await deleteProduct(product.id);
    await logActivity({
      user: settings.currentRole,
      action: "delete",
      entity: "منتج",
      entityId: product.id,
      details: `حذف المنتج "${product.name}"`,
    });
    setDeleteConfirm(null);
  };

  const handleInlineEdit = async (id: string, field: keyof Product, value: number) => {
    await updateProduct(id, { [field]: value });
    const product = products.find((p) => p.id === id);
    await logActivity({
      user: settings.currentRole,
      action: "update",
      entity: "منتج",
      entityId: id,
      details: `تعديل ${field === "costPrice" ? "سعر التكلفة" : field === "wholesalePrice" ? "سعر الجملة" : field === "retailPrice" ? "سعر المفرد" : field === "stock" ? "الكمية" : field} للمنتج "${product?.name}"`,
      newValue: value.toString(),
    });
  };

  // Bulk Operations Handlers
  const handleBulkCategorySave = async () => {
    if (!bulkCategory.trim()) return;
    setSubmittingBulk(true);
    try {
      for (const id of selectedIds) {
        await updateProduct(id, { notes: bulkCategory.trim() });
      }
      await logActivity({
        user: settings.currentRole,
        action: "update",
        entity: "منتجات",
        details: `تعديل قسم/فئة ${selectedIds.length} منتج إلى "${bulkCategory.trim()}"`,
      });
      alert(`🎉 تم تعديل الفئة لـ ${selectedIds.length} منتج بنجاح!`);
      setBulkModal(null);
      setBulkCategory("");
      setSelectedIds([]);
    } catch (err) {
      alert("حدث خطأ أثناء التعديل الجماعي");
    } finally {
      setSubmittingBulk(false);
    }
  };

  const handleBulkSupplierSave = async () => {
    if (!bulkSupplierId) return;
    setSubmittingBulk(true);
    try {
      const supName = getSupplierName(bulkSupplierId);
      for (const id of selectedIds) {
        await updateProduct(id, { supplierId: bulkSupplierId });
      }
      await logActivity({
        user: settings.currentRole,
        action: "update",
        entity: "منتجات",
        details: `تعديل المورد لـ ${selectedIds.length} منتج إلى "${supName}"`,
      });
      alert(`🎉 تم تعديل المورد لـ ${selectedIds.length} منتج بنجاح!`);
      setBulkModal(null);
      setBulkSupplierId("");
      setSelectedIds([]);
    } catch (err) {
      alert("حدث خطأ أثناء تعديل الموردين");
    } finally {
      setSubmittingBulk(false);
    }
  };

  const handleBulkMarginSave = async () => {
    setSubmittingBulk(true);
    try {
      for (const id of selectedIds) {
        const p = products.find((pr) => pr.id === id);
        if (!p) continue;
        const newRetail = calculateRetailPrice(p.costPrice, bulkMargin);
        await updateProduct(id, { profitMargin: bulkMargin, retailPrice: newRetail });
      }
      await logActivity({
        user: settings.currentRole,
        action: "update",
        entity: "منتجات",
        details: `تعديل نسبة الربح لـ ${selectedIds.length} منتج إلى ${bulkMargin}% ومفرد جديد`,
      });
      alert(`🎉 تم تحديث نسبة الربح وسعر المفرد لـ ${selectedIds.length} منتج بنجاح!`);
      setBulkModal(null);
      setSelectedIds([]);
    } catch (err) {
      alert("حدث خطأ أثناء تعديل نسبة الربح");
    } finally {
      setSubmittingBulk(false);
    }
  };

  const handleBulkPriceSave = async () => {
    if (bulkPriceVal <= 0 && bulkPriceMode === "fixed") return;
    setSubmittingBulk(true);
    try {
      for (const id of selectedIds) {
        const p = products.find((pr) => pr.id === id);
        if (!p) continue;
        let newPrice = p.retailPrice;
        if (bulkPriceMode === "fixed") {
          newPrice = bulkPriceVal;
        } else if (bulkPriceMode === "add_amount") {
          newPrice = p.retailPrice + bulkPriceVal;
        } else if (bulkPriceMode === "add_percent") {
          newPrice = Math.round(p.retailPrice + (p.retailPrice * bulkPriceVal) / 100);
        }
        await updateProduct(id, { retailPrice: Math.max(0, newPrice) });
      }
      await logActivity({
        user: settings.currentRole,
        action: "update",
        entity: "منتجات",
        details: `تعديل سعر المفرد لـ ${selectedIds.length} منتج`,
      });
      alert(`🎉 تم تحديث الأسعار لـ ${selectedIds.length} منتج بنجاح!`);
      setBulkModal(null);
      setSelectedIds([]);
    } catch (err) {
      alert("حدث خطأ أثناء تعديل الأسعار");
    } finally {
      setSubmittingBulk(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    setSubmittingBulk(true);
    try {
      for (const id of selectedIds) {
        const p = products.find((pr) => pr.id === id);
        if (p) {
          await softDelete("product", p.id, p.name, { ...p }, settings.currentRole);
          await deleteProduct(p.id);
        }
      }
      await logActivity({
        user: settings.currentRole,
        action: "delete",
        entity: "منتجات",
        details: `حذف جماعي لـ ${selectedIds.length} منتج`,
      });
      alert(`🗑️ تم نقل ${selectedIds.length} منتج إلى سلة المهملات بنجاح`);
      setBulkModal(null);
      setSelectedIds([]);
    } catch (err) {
      alert("حدث خطأ أثناء الحذف الجماعي");
    } finally {
      setSubmittingBulk(false);
    }
  };

  const handleBulkAutoCategorize = async () => {
    if (products.length === 0) return;
    setSubmittingBulk(true);
    try {
      let categorizedCount = 0;
      let newCategoriesCreated = 0;
      const currentCategories = [...categories];

      for (const p of products) {
        // Extract existing category tag
        const existingMatch = p.notes ? p.notes.match(/الفئة:\s*([^|,\n]+)/) : null;
        const existingCat = existingMatch && existingMatch[1] ? existingMatch[1].trim() : "";

        if (existingCat && currentCategories.some((c) => c.name.toLowerCase() === existingCat.toLowerCase())) {
          continue;
        }

        let matchedCatName: string | null = null;
        const q = p.name.trim().toLowerCase();

        for (const cat of currentCategories) {
          if (q.includes(cat.name.toLowerCase()) || cat.name.toLowerCase().includes(q)) {
            matchedCatName = cat.name;
            break;
          }
          if (cat.keywords) {
            const words = cat.keywords.split(/[,،\s]+/).map((w) => w.trim().toLowerCase()).filter(Boolean);
            if (words.some((w) => w.length >= 2 && (q.includes(w) || w.includes(q)))) {
              matchedCatName = cat.name;
              break;
            }
          }
        }

        if (!matchedCatName) {
          const tokens = q.split(/\s+/).filter((w) => w.length >= 3);
          const mainWord = tokens[0] || "منتجات عامة";
          const inferredName = `قسم ${mainWord}`;
          
          let foundExisting = currentCategories.find((c) => c.name.toLowerCase() === inferredName.toLowerCase());
          if (!foundExisting) {
            const createdCat = await addCategory({
              name: inferredName,
              image: "",
              priority: currentCategories.length + 1,
              keywords: mainWord,
              isActive: true,
            });
            currentCategories.push(createdCat);
            matchedCatName = createdCat.name;
            newCategoriesCreated++;
          } else {
            matchedCatName = foundExisting.name;
          }
        }

        if (matchedCatName) {
          const currentNotes = (p.notes || "").trim();
          const tag = `الفئة: ${matchedCatName}`;
          let updatedNotes = "";
          if (currentNotes.includes("الفئة:")) {
            updatedNotes = currentNotes.replace(/الفئة:\s*[^|,\n]+/g, tag);
          } else if (!currentNotes) {
            updatedNotes = tag;
          } else {
            updatedNotes = `${currentNotes} | ${tag}`;
          }

          if (updatedNotes !== currentNotes) {
            await updateProduct(p.id, { notes: updatedNotes });
            categorizedCount++;
          }
        }
      }

      await logActivity({
        user: settings.currentRole,
        action: "update",
        entity: "منتجات والأقسام",
        details: `تنفيذ التقسيم التلقائي الجماعي: تم تصنيف ${categorizedCount} منتج وإنشاء ${newCategoriesCreated} قسم جديد`,
      });

      alert(`🎉 تم التقسيم التلقائي الجماعي بنجاح!\n• تم تصنيف وتحديث: ${categorizedCount} منتج\n• تم إنشاء: ${newCategoriesCreated} قسم جديد تلقائياً`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء التقسيم التلقائي";
      alert(msg);
    } finally {
      setSubmittingBulk(false);
    }
  };

  const totalValue = filtered.reduce((sum, p) => sum + p.retailPrice * p.stock, 0);
  const isAdminOrManager = settings.currentRole === "manager" || settings.currentRole === "admin";

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Title & Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">المنتجات والبحث والتعديل</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {filtered.length} منتج {isAdminOrManager && `| إجمالي القيمة: ${totalValue.toLocaleString()} د.ع`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit && (
            <button
              onClick={handleBulkAutoCategorize}
              disabled={submittingBulk || products.length === 0}
              className="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 rounded-lg shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5 active:scale-95"
              title="فحص كافة المنتجات غير المصنفة ومطابقتها مع الأقسام والكلمات المفتاحية تلقائياً"
            >
              <span>⚡</span>
              <span>{submittingBulk ? "جاري التقسيم..." : "التقسيم التلقائي للمنتجات"}</span>
            </button>
          )}

          {canCreate && (
            <button
              onClick={() => { setEditingProduct(null); setModalOpen(true); }}
              className="px-4 py-2 text-sm font-bold text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2 shadow-sm"
              style={{ backgroundColor: "var(--primary)" }}
            >
              <span>+</span> إضافة منتج جديد
            </button>
          )}
        </div>
      </div>

      {isAdminOrManager && <ImportExportBar />}

      {/* Search Input Box */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <input
            type="text"
            placeholder="🔍 ابحث بالاسم، الفئة/القسم، المورد..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[var(--primary)] outline-none text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute left-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm"
            >
              ✕
            </button>
          )}
        </div>

        {isAdminOrManager && filtered.length > 0 && (
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={toggleSelectAll}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isAllSelected ? "إلغاء تحديد الكل" : "تحديد كافة نتائج البحث"}
            </button>
          </div>
        )}
      </div>

      {/* Sticky Floating Bulk Action Bar */}
      {isAdminOrManager && selectedIds.length > 0 && (
        <div className="sticky top-4 z-40 bg-blue-900 text-white p-4 rounded-2xl shadow-2xl border border-blue-700 animate-fadeIn flex flex-wrap items-center justify-between gap-3" dir="rtl">
          <div className="flex items-center gap-2 font-bold text-sm">
            <span className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs">
              محدد {selectedIds.length} منتج
            </span>
            <span>خيارات التعديل والحذف الجماعي:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {canEdit && (
              <>
                <button
                  onClick={() => setBulkModal("category")}
                  className="px-3 py-2 bg-blue-700 hover:bg-blue-600 rounded-xl font-bold transition-colors flex items-center gap-1 shadow-sm"
                >
                  📁 تعديل القسم / الفئة
                </button>

                <button
                  onClick={() => setBulkModal("supplier")}
                  className="px-3 py-2 bg-indigo-700 hover:bg-indigo-600 rounded-xl font-bold transition-colors flex items-center gap-1 shadow-sm"
                >
                  🏬 تعديل المورد
                </button>

                <button
                  onClick={() => setBulkModal("margin")}
                  className="px-3 py-2 bg-teal-700 hover:bg-teal-600 rounded-xl font-bold transition-colors flex items-center gap-1 shadow-sm"
                >
                  📈 تعديل نسبة الربح %
                </button>

                <button
                  onClick={() => setBulkModal("price")}
                  className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 rounded-xl font-bold transition-colors flex items-center gap-1 shadow-sm"
                >
                  💰 تعديل السعر والقيمة المضافة
                </button>
              </>
            )}

            {canDelete && (
              <button
                onClick={() => setBulkModal("delete")}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-xl font-bold transition-colors flex items-center gap-1 shadow-sm"
              >
                🗑️ حذف المحددة
              </button>
            )}

            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl font-medium transition-colors text-gray-300"
            >
              إلغاء التحديد
            </button>
          </div>
        </div>
      )}

      {/* Products Data Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <span className="text-4xl block mb-3">📦</span>
            <p>{searchQuery ? "لا توجد نتائج تطابق البحث" : "لا توجد منتجات بعد"}</p>
            {canCreate && !searchQuery && (
              <button onClick={() => setModalOpen(true)} className="mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg" style={{ backgroundColor: "var(--primary)" }}>
                أضف أول منتج
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  {isAdminOrManager && (
                    <th className="px-4 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                        title="تحديد الكل"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">المنتج والوصف</th>
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">القسم</th>
                  {isAdminOrManager && <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">التكاليف</th>}
                  {isAdminOrManager && <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">الجملة</th>}
                  {isAdminOrManager && <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">فائدة %</th>}
                  <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">سعر المفرد</th>
                  {isAdminOrManager && <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">الكمية</th>}
                  {isAdminOrManager && <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">المورد</th>}
                  {isAdminOrManager && canEdit && <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((product) => {
                  const isSelected = selectedIds.includes(product.id);
                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                        isSelected ? "bg-blue-50/50 dark:bg-blue-900/20" : ""
                      }`}
                    >
                      {isAdminOrManager && (
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(product.id)}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {product.image ? (
                            <img src={product.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 text-lg">📦</div>
                          )}
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white">{product.name}</p>
                            {product.notes && <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[220px]">{product.notes}</p>}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {(() => {
                          const match = product.notes ? product.notes.match(/الفئة:\s*([^|,\n]+)/) : null;
                          const catName = match && match[1] ? match[1].trim() : null;
                          return catName ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold text-xs whitespace-nowrap">
                              📁 {catName}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-xs italic">
                              غير مصنف
                            </span>
                          );
                        })()}
                      </td>

                      {isAdminOrManager && (
                        <td className="px-4 py-3">
                          {canEdit ? (
                            <InlineNumber value={product.costPrice} onSave={(v) => handleInlineEdit(product.id, "costPrice", v)} />
                          ) : (
                            <span className="text-gray-900 dark:text-white font-medium">{product.costPrice.toLocaleString()}</span>
                          )}
                        </td>
                      )}

                      {isAdminOrManager && (
                        <td className="px-4 py-3">
                          {canEdit ? (
                            <InlineNumber value={product.wholesalePrice} onSave={(v) => handleInlineEdit(product.id, "wholesalePrice", v)} />
                          ) : (
                            <span className="text-gray-900 dark:text-white font-medium">{product.wholesalePrice.toLocaleString()}</span>
                          )}
                        </td>
                      )}

                      {isAdminOrManager && (
                        <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-bold">
                          {product.profitMargin || 0}%
                        </td>
                      )}

                      <td className="px-4 py-3 font-extrabold text-blue-600 dark:text-blue-400 text-base">
                        {product.retailPrice.toLocaleString()} د.ع
                      </td>

                      {isAdminOrManager && (
                        <td className="px-4 py-3">
                          {canEdit ? (
                            <InlineNumber value={product.stock} onSave={(v) => handleInlineEdit(product.id, "stock", v)} isInteger />
                          ) : (
                            <span className="text-gray-900 dark:text-white font-bold">{product.stock}</span>
                          )}
                        </td>
                      )}

                      {isAdminOrManager && (
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs font-medium">
                          {getSupplierName(product.supplierId)}
                        </td>
                      )}

                      {isAdminOrManager && canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setEditingProduct(product); setModalOpen(true); }}
                              className="px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-xs font-semibold"
                            >
                              تعديل
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => setDeleteConfirm(product.id)}
                                className="px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-xs font-semibold"
                              >
                                حذف
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Product Modal */}
      <ProductModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingProduct(null); }} product={editingProduct} />

      {/* Single Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-2xl text-right" dir="rtl">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">🗑️ حذف المنتج</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              هل أنت تأكد من نقل "{products.find((p) => p.id === deleteConfirm)?.name}" إلى سلة المهملات؟
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl">إلغاء</button>
              <button onClick={() => { const p = products.find((pr) => pr.id === deleteConfirm); if (p) handleDelete(p); }} className="px-4 py-2 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700">تأكيد الحذف</button>
            </div>
          </div>
        </div>
      )}

      {/* BULK ACTION MODALS */}

      {/* 1. Bulk Category / Department Modal */}
      {bulkModal === "category" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-2xl text-right space-y-4">
            <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">📁 تعديل الفئة / القسم لـ ({selectedIds.length}) منتج</h3>
              <button onClick={() => setBulkModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">اسم الفئة أو القسم الجديد:</label>
              <input
                type="text"
                placeholder="مثال: قطع غيار، بطاريات، زيوت..."
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setBulkModal(null)} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl">إلغاء</button>
              <button
                onClick={handleBulkCategorySave}
                disabled={submittingBulk || !bulkCategory.trim()}
                className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                {submittingBulk ? "جاري الحفظ..." : "تطبيق التعديل"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Bulk Supplier Modal */}
      {bulkModal === "supplier" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-2xl text-right space-y-4">
            <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">🏬 تعديل المورد لـ ({selectedIds.length}) منتج</h3>
              <button onClick={() => setBulkModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">اختر المورد الجديد:</label>
              <select
                value={bulkSupplierId}
                onChange={(e) => setBulkSupplierId(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- حدد المورد --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.phone || "بدون هاتف"})</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setBulkModal(null)} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl">إلغاء</button>
              <button
                onClick={handleBulkSupplierSave}
                disabled={submittingBulk || !bulkSupplierId}
                className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50"
              >
                {submittingBulk ? "جاري الحفظ..." : "تطبيق المورد"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Bulk Profit Margin % Modal */}
      {bulkModal === "margin" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-2xl text-right space-y-4">
            <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">📈 تعديل نسبة الربح % لـ ({selectedIds.length}) منتج</h3>
              <button onClick={() => setBulkModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">نسبة الربح المئوية (%):</label>
              <input
                type="number"
                value={bulkMargin}
                onChange={(e) => setBulkMargin(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 bg-teal-50 dark:bg-teal-900/20 p-2.5 rounded-lg border border-teal-200 dark:border-teal-800">
                💡 سيتم تلقائياً إعادة حساب سعر المفرد لجميع المنتجات المحددة بناءً على سعر التكلفة ونسبة الربح الجديدة.
              </p>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setBulkModal(null)} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl">إلغاء</button>
              <button
                onClick={handleBulkMarginSave}
                disabled={submittingBulk}
                className="px-5 py-2.5 text-sm font-bold text-white bg-teal-600 rounded-xl hover:bg-teal-700 disabled:opacity-50"
              >
                {submittingBulk ? "جاري الحفظ..." : "حساب وتطبيق نسبة الربح"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Bulk Price & Value Added Modal */}
      {bulkModal === "price" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-2xl text-right space-y-4">
            <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">💰 تعديل السعر / القيمة المضافة لـ ({selectedIds.length}) منتج</h3>
              <button onClick={() => setBulkModal(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">طريقة تعديل سعر المفرد:</label>
              <select
                value={bulkPriceMode}
                onChange={(e: any) => setBulkPriceMode(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none"
              >
                <option value="fixed">تحديد سعر مفرد ثابت لجميع المنتجات</option>
                <option value="add_amount">إضافة مبلغ ثابت على السعر الحالي (د.ع)</option>
                <option value="add_percent">إضافة نسبة مئوية على السعر الحالي (%)</option>
              </select>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  {bulkPriceMode === "fixed" ? "السعر الثابت الجديدة (د.ع):" : bulkPriceMode === "add_amount" ? "المبلغ المضاف (د.ع):" : "النسبة المضافة (%):"}
                </label>
                <input
                  type="number"
                  value={bulkPriceVal}
                  onChange={(e) => setBulkPriceVal(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setBulkModal(null)} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl">إلغاء</button>
              <button
                onClick={handleBulkPriceSave}
                disabled={submittingBulk}
                className="px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50"
              >
                {submittingBulk ? "جاري الحفظ..." : "تطبيق تعديل الأسعار"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Bulk Delete Confirmation Modal */}
      {bulkModal === "delete" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-md w-full border border-gray-200 dark:border-gray-700 shadow-2xl text-right space-y-4">
            <h3 className="text-lg font-bold text-red-600 dark:text-red-400">⚠️ حذف المنتجات المحددة</h3>
            <p className="text-gray-700 dark:text-gray-300 text-sm">
              هل أنت تأكد من نقل <b>({selectedIds.length}) منتج</b> إلى سلة المهملات وحذفها؟
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setBulkModal(null)} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl">إلغاء</button>
              <button
                onClick={handleBulkDeleteConfirm}
                disabled={submittingBulk}
                className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50"
              >
                {submittingBulk ? "جاري الحذف..." : "تأكيد حذف المحددة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InlineNumber({ value, onSave, isInteger = false }: { value: number; onSave: (v: number) => void; isInteger?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value.toString());

  const handleSave = () => {
    const parsed = isInteger ? parseInt(temp) : parseFloat(temp);
    if (!isNaN(parsed) && parsed !== value) onSave(parsed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        type="number" autoFocus value={temp}
        onChange={(e) => setTemp(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
        className="w-24 px-2 py-1 border border-[var(--primary)] rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-1 focus:ring-[var(--primary)] outline-none"
      />
    );
  }

  return (
    <span onClick={() => { setTemp(value.toString()); setEditing(true); }} className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded text-gray-900 dark:text-white" title="اضغط للتعديل">
      {isInteger ? value : value.toLocaleString()}
    </span>
  );
}
