"use client";

import { useState, useEffect, useMemo } from "react";
import { Product } from "@/lib/types";

export interface IncompleteImportItem {
  rowIndex: number; // 1-based index in Excel/CSV
  rawRow: Record<string, any>;
  name: string;
  costPrice: number;
  wholesalePrice: number;
  retailPrice: number;
  stock: number;
  supplierId: string;
  notes: string;
  image: string;
  missingFields: {
    name: boolean;
    retailPrice: boolean;
    costPrice: boolean;
    stock: boolean;
  };
}

interface MissingDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  validCount: number;
  incompleteItems: IncompleteImportItem[];
  onConfirmImport: (correctedProducts: Partial<Product>[], importOnlyValid: boolean) => void;
}

export default function MissingDataModal({
  isOpen,
  onClose,
  fileName,
  validCount,
  incompleteItems,
  onConfirmImport,
}: MissingDataModalProps) {
  const [items, setItems] = useState<IncompleteImportItem[]>([]);
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<Set<number>>(new Set());
  const [bulkStockInput, setBulkStockInput] = useState<string>("");
  const [showBulkStockPrompt, setShowBulkStockPrompt] = useState<boolean>(false);

  useEffect(() => {
    setItems(incompleteItems);
    // By default, select all incomplete rows
    setSelectedRowIndexes(new Set(incompleteItems.map((i) => i.rowIndex)));
  }, [incompleteItems]);

  if (!isOpen) return null;

  // ── Selection Logic ──
  const isAllSelected = useMemo(() => {
    return items.length > 0 && items.every((i) => selectedRowIndexes.has(i.rowIndex));
  }, [items, selectedRowIndexes]);

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRowIndexes(new Set());
    } else {
      setSelectedRowIndexes(new Set(items.map((i) => i.rowIndex)));
    }
  };

  const toggleSelectRow = (rowIndex: number) => {
    setSelectedRowIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) {
        next.delete(rowIndex);
      } else {
        next.add(rowIndex);
      }
      return next;
    });
  };

  const handleFieldChange = (
    index: number,
    field: keyof Omit<IncompleteImportItem, "missingFields" | "rawRow" | "rowIndex">,
    val: any
  ) => {
    setItems((prev) => {
      const next = [...prev];
      const target = { ...next[index] };
      (target as any)[field] = val;

      // Recalculate missing state for target
      const nameMissing = !target.name || !target.name.trim();
      const retailMissing = !target.retailPrice || target.retailPrice <= 0 || isNaN(target.retailPrice);
      const costMissing = !target.costPrice || target.costPrice <= 0 || isNaN(target.costPrice);
      const stockMissing = target.stock === undefined || target.stock < 0 || isNaN(target.stock);

      target.missingFields = {
        name: nameMissing,
        retailPrice: retailMissing,
        costPrice: costMissing,
        stock: stockMissing,
      };

      next[index] = target;
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    const targetRowIndex = items[index].rowIndex;
    setItems((prev) => prev.filter((_, i) => i !== index));
    setSelectedRowIndexes((prev) => {
      const next = new Set(prev);
      next.delete(targetRowIndex);
      return next;
    });
  };

  // ── Bulk Actions ──
  const handleBulkRemoveSelected = () => {
    if (selectedRowIndexes.size === 0) return;
    setItems((prev) => prev.filter((item) => !selectedRowIndexes.has(item.rowIndex)));
    setSelectedRowIndexes(new Set());
  };

  const handleBulkAutoFillDefaults = () => {
    setItems((prev) =>
      prev.map((item) => {
        // Only apply to selected items if any selected, otherwise all
        if (selectedRowIndexes.size > 0 && !selectedRowIndexes.has(item.rowIndex)) {
          return item;
        }

        let name = item.name.trim();
        if (!name) name = `منتج غير معنون #${item.rowIndex}`;

        let retail = item.retailPrice;
        let cost = item.costPrice;
        let wholesale = item.wholesalePrice;
        let stock = item.stock;

        if (stock <= 0 || isNaN(stock)) stock = 10;

        if (retail > 0 && (cost <= 0 || isNaN(cost))) {
          cost = Math.round(retail * 0.75); // 25% margin default
        } else if (cost > 0 && (retail <= 0 || isNaN(retail))) {
          retail = Math.round(cost * 1.3); // 30% margin default
        } else if (retail <= 0 && cost <= 0) {
          retail = 10000;
          cost = 7000;
        }

        if (wholesale <= 0 || isNaN(wholesale)) {
          wholesale = Math.round(cost * 1.15);
        }

        return {
          ...item,
          name,
          retailPrice: retail,
          costPrice: cost,
          wholesalePrice: wholesale,
          stock,
          missingFields: {
            name: false,
            retailPrice: false,
            costPrice: false,
            stock: false,
          },
        };
      })
    );
  };

  const handleApplyBulkStock = () => {
    const newStockNum = parseInt(bulkStockInput);
    if (isNaN(newStockNum) || newStockNum < 0) {
      alert("يرجى إدخال رقم كمية صالح!");
      return;
    }

    setItems((prev) =>
      prev.map((item) => {
        if (!selectedRowIndexes.has(item.rowIndex)) return item;
        const target = { ...item, stock: newStockNum };

        const nameMissing = !target.name || !target.name.trim();
        const retailMissing = !target.retailPrice || target.retailPrice <= 0 || isNaN(target.retailPrice);
        const costMissing = !target.costPrice || target.costPrice <= 0 || isNaN(target.costPrice);

        return {
          ...target,
          missingFields: {
            name: nameMissing,
            retailPrice: retailMissing,
            costPrice: costMissing,
            stock: false,
          },
        };
      })
    );
    setShowBulkStockPrompt(false);
    setBulkStockInput("");
  };

  // ── Filtered & Count Calculations ──
  const selectedItems = useMemo(() => {
    return items.filter((i) => selectedRowIndexes.has(i.rowIndex));
  }, [items, selectedRowIndexes]);

  const selectedAndValidFixedItems = useMemo(() => {
    return selectedItems.filter(
      (i) => !i.missingFields.name && !i.missingFields.retailPrice && !i.missingFields.costPrice && !i.missingFields.stock
    );
  }, [selectedItems]);

  const totalImportingCount = validCount + selectedAndValidFixedItems.length;

  const handleSaveAndImport = () => {
    // Collect valid items from SELECTED fixed items
    const correctedProducts: Partial<Product>[] = selectedAndValidFixedItems.map((i) => ({
      name: i.name.trim(),
      costPrice: Number(i.costPrice) || 0,
      wholesalePrice: Number(i.wholesalePrice) || Number(i.costPrice) || 0,
      profitMargin: 0,
      retailPrice: Number(i.retailPrice) || 0,
      stock: Number(i.stock) || 0,
      supplierId: i.supplierId || "",
      notes: i.notes || "",
      image: i.image || "",
    }));

    onConfirmImport(correctedProducts, false);
  };

  const handleImportOnlyValid = () => {
    onConfirmImport([], true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" dir="rtl">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-right">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-4 bg-gray-50/70 dark:bg-gray-800/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <h2 className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-white">
                تدقيق واستكمال بيانات المنتجات ({items.length} صف بحاجة لتدقيق)
              </h2>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              الملف: <span className="font-bold text-gray-700 dark:text-gray-300">{fileName}</span> — حدد الصفوف المراد معالجتها وإكمال بياناتها مباشرة.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-gray-200 dark:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center justify-center text-sm font-bold transition-all shrink-0"
            title="إغلاق"
          >
            ✕
          </button>
        </div>

        {/* Summary Stats & Select All Control Bar */}
        <div className="p-3.5 bg-blue-50/50 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-900/50 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Master Select All Checkbox */}
            {items.length > 0 && (
              <label className="flex items-center gap-2 font-extrabold text-blue-700 dark:text-blue-300 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 cursor-pointer shadow-sm active:scale-95 transition-all select-none">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="whitespace-nowrap">تحديد الكل ({items.length})</span>
              </label>
            )}

            <span className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-800 whitespace-nowrap shrink-0">
              ✅ مكتمل بالملف: {validCount}
            </span>

            <span className="px-3 py-1 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800 whitespace-nowrap shrink-0">
              ⚠️ محدد للتدقيق: {selectedRowIndexes.size} من {items.length}
            </span>

            {selectedAndValidFixedItems.length > 0 && (
              <span className="px-3 py-1 rounded-lg bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800 whitespace-nowrap shrink-0">
                ✨ جاهز من المحدد: {selectedAndValidFixedItems.length}
              </span>
            )}
          </div>

          <button
            onClick={handleBulkAutoFillDefaults}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95"
            title="تعبئة قيم افتراضية تلقائياً للأسعار والمخزون المفقود في الصفوف المحددة"
          >
            <span>🪄</span>
            <span>تعبئة افتراضية تلقائية</span>
          </button>
        </div>

        {/* ── Bulk Actions Toolbar Bar (Appears when 1+ rows selected) ── */}
        {selectedRowIndexes.size > 0 && (
          <div className="mx-4 mt-3 p-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl shadow-md flex flex-wrap items-center justify-between gap-2.5 animate-fadeIn text-xs border border-blue-400/30">
            <div className="flex items-center gap-2 font-bold whitespace-nowrap shrink-0">
              <span>☑️</span>
              <span>الإجراءات الجماعية لـ ({selectedRowIndexes.size}) صف محدد:</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Bulk Unified Stock */}
              {!showBulkStockPrompt ? (
                <button
                  onClick={() => setShowBulkStockPrompt(true)}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg font-bold transition-all whitespace-nowrap shrink-0 active:scale-95"
                >
                  📦 تعيين كمية موحدة
                </button>
              ) : (
                <div className="flex items-center gap-1 bg-white p-1 rounded-lg text-gray-900">
                  <input
                    type="number"
                    min="0"
                    placeholder="الكمية..."
                    value={bulkStockInput}
                    onChange={(e) => setBulkStockInput(e.target.value)}
                    className="w-20 px-2 py-0.5 border border-gray-300 rounded font-bold text-xs outline-none"
                  />
                  <button
                    onClick={handleApplyBulkStock}
                    className="px-2 py-0.5 bg-emerald-600 text-white rounded font-bold hover:bg-emerald-700 text-[11px]"
                  >
                    تطبيق
                  </button>
                  <button
                    onClick={() => setShowBulkStockPrompt(false)}
                    className="px-1.5 py-0.5 text-gray-500 hover:text-gray-700 text-[11px]"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Bulk Auto Fill */}
              <button
                onClick={handleBulkAutoFillDefaults}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg font-bold transition-all whitespace-nowrap shrink-0 active:scale-95"
              >
                🪄 تعبئة أسعار ومخزون
              </button>

              {/* Bulk Remove */}
              <button
                onClick={handleBulkRemoveSelected}
                className="px-3 py-1.5 bg-red-500/80 hover:bg-red-600 text-white rounded-lg font-bold transition-all whitespace-nowrap shrink-0 active:scale-95"
              >
                🗑️ استبعاد الصفوف المحددة ({selectedRowIndexes.size})
              </button>

              {/* Clear Selection */}
              <button
                onClick={() => setSelectedRowIndexes(new Set())}
                className="px-2 py-1.5 text-white/80 hover:text-white font-medium text-[11px] underline whitespace-nowrap shrink-0"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>
        )}

        {/* Incomplete Items Interactive List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {items.length === 0 ? (
            <div className="py-12 text-center text-gray-500 dark:text-gray-400 space-y-2">
              <span className="text-4xl block">🎉</span>
              <p className="font-bold text-sm">تم إكمال أو استبعاد جميع الصفوف الناقصة!</p>
              <p className="text-xs">يمكنك الآن الضغط على "حفظ ومتابعة الاستيراد" أدناه.</p>
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = selectedRowIndexes.has(item.rowIndex);
              const isFullyValid =
                !item.missingFields.name &&
                !item.missingFields.retailPrice &&
                !item.missingFields.costPrice &&
                !item.missingFields.stock;

              return (
                <div
                  key={item.rowIndex}
                  className={`p-4 rounded-xl border transition-all space-y-3 ${
                    isSelected
                      ? isFullyValid
                        ? "bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 shadow-sm"
                        : "bg-amber-50/40 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 shadow-sm"
                      : "bg-gray-50/50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-800 opacity-60"
                  }`}
                >
                  {/* Row Header with Checkbox */}
                  <div className="flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-700/80 pb-2.5">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(item.rowIndex)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer shrink-0"
                      />

                      <span className="font-extrabold text-xs text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-lg whitespace-nowrap">
                        صف #{item.rowIndex}
                      </span>

                      {isFullyValid ? (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                          <span>✅</span> مكتمل وجاهز
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 whitespace-nowrap">
                          <span>⚠️</span> ينقصه بيانات أساسية
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="text-xs font-bold text-red-500 hover:text-red-700 dark:hover:text-red-300 hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
                      title="استبعاد هذا الصف"
                    >
                      <span>🗑️</span>
                      <span>استبعاد</span>
                    </button>
                  </div>

                  {/* Interactive Fields Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    {/* 1. Name Input */}
                    <div className="md:col-span-2">
                      <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
                        <span>اسم المنتج *</span>
                        {item.missingFields.name && (
                          <span className="text-[10px] text-red-500 font-bold">مطلوب</span>
                        )}
                      </label>
                      <input
                        type="text"
                        placeholder="أدخل اسم المنتج..."
                        value={item.name}
                        onChange={(e) => handleFieldChange(idx, "name", e.target.value)}
                        className={`w-full px-3 py-2 border rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-bold outline-none focus:ring-2 ${
                          item.missingFields.name
                            ? "border-red-400 focus:ring-red-400 bg-red-50/30 dark:bg-red-950/20"
                            : "border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                        }`}
                      />
                    </div>

                    {/* 2. Retail Price */}
                    <div>
                      <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
                        <span>سعر المفرد *</span>
                        {item.missingFields.retailPrice && (
                          <span className="text-[10px] text-red-500 font-bold">مطلوب</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="مثال: 15000"
                        value={item.retailPrice || ""}
                        onChange={(e) => handleFieldChange(idx, "retailPrice", parseFloat(e.target.value) || 0)}
                        className={`w-full px-3 py-2 border rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-bold outline-none focus:ring-2 ${
                          item.missingFields.retailPrice
                            ? "border-red-400 focus:ring-red-400 bg-red-50/30 dark:bg-red-950/20"
                            : "border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                        }`}
                      />
                    </div>

                    {/* 3. Cost Price */}
                    <div>
                      <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
                        <span>سعر التكلفة *</span>
                        {item.missingFields.costPrice && (
                          <span className="text-[10px] text-red-500 font-bold">مطلوب</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="مثال: 10000"
                        value={item.costPrice || ""}
                        onChange={(e) => handleFieldChange(idx, "costPrice", parseFloat(e.target.value) || 0)}
                        className={`w-full px-3 py-2 border rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-bold outline-none focus:ring-2 ${
                          item.missingFields.costPrice
                            ? "border-red-400 focus:ring-red-400 bg-red-50/30 dark:bg-red-950/20"
                            : "border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                        }`}
                      />
                    </div>

                    {/* 4. Stock / Quantity */}
                    <div>
                      <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
                        <span>الكمية / المخزون *</span>
                        {item.missingFields.stock && (
                          <span className="text-[10px] text-red-500 font-bold">مطلوب</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="مثال: 10"
                        value={item.stock !== undefined ? item.stock : ""}
                        onChange={(e) => handleFieldChange(idx, "stock", parseInt(e.target.value) || 0)}
                        className={`w-full px-3 py-2 border rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-bold outline-none focus:ring-2 ${
                          item.missingFields.stock
                            ? "border-red-400 focus:ring-red-400 bg-red-50/30 dark:bg-red-950/20"
                            : "border-gray-300 dark:border-gray-600 focus:ring-blue-500"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-bold text-xs transition-all whitespace-nowrap shrink-0"
          >
            إلغاء الاستيراد
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap justify-end">
            {validCount > 0 && (
              <button
                onClick={handleImportOnlyValid}
                className="flex-1 sm:flex-initial min-h-[40px] px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs transition-all shadow-sm active:scale-95 whitespace-nowrap shrink-0"
                title="استيراد المنتجات المكتملة أصلاً بالملف فقط"
              >
                ⏭️ استيراد السليمة بالملف فقط ({validCount} منتج)
              </button>
            )}

            <button
              onClick={handleSaveAndImport}
              disabled={totalImportingCount === 0}
              className={`flex-1 sm:flex-initial min-h-[40px] px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-2 whitespace-nowrap shrink-0 active:scale-95 ${
                totalImportingCount > 0
                  ? "bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-400/50"
                  : "bg-gray-300 dark:bg-gray-800 text-gray-500 cursor-not-allowed"
              }`}
            >
              <span>✅</span>
              <span>حفظ البيانات المكتملة ومتابعة الاستيراد ({totalImportingCount} منتج)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
