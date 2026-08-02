"use client";

import { useState } from "react";
import { Product } from "@/lib/types";

export type DuplicateActionChoice = "update" | "skip" | "cancel";

interface DuplicateResolutionModalProps {
  existingProduct: Product;
  incomingProduct: Partial<Product>;
  currentIndex: number;
  totalDuplicates: number;
  onResolve: (choice: DuplicateActionChoice, applyToAll: boolean) => void;
}

export default function DuplicateResolutionModal({
  existingProduct,
  incomingProduct,
  currentIndex,
  totalDuplicates,
  onResolve,
}: DuplicateResolutionModalProps) {
  const [applyToAll, setApplyToAll] = useState(false);

  // Helper to extract category from notes string
  const getCategory = (p: Partial<Product>) => {
    if (!p.notes) return "عام";
    if (p.notes.includes("الفئة:")) {
      return p.notes.split("الفئة:")[1]?.split("|")[0]?.trim() || "عام";
    }
    return p.notes.split("|")[0]?.trim() || "عام";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" dir="rtl">
      <div className="bg-white dark:bg-gray-900 rounded-3xl max-w-2xl w-full p-6 sm:p-8 border border-gray-200 dark:border-gray-800 shadow-2xl space-y-6 text-right relative overflow-hidden">
        
        {/* Header Accent Bar */}
        <div className="absolute top-0 right-0 left-0 h-2 bg-amber-500" />

        {/* Modal Title & Progress Badge */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl p-2 bg-amber-50 dark:bg-amber-950/60 rounded-2xl border border-amber-200 dark:border-amber-800">⚠️</span>
            <div>
              <h3 className="font-extrabold text-lg sm:text-xl text-gray-900 dark:text-white">
                تنبيه: تم العثور على منتج مكرر مسبقاً!
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                المنتج &quot;{existingProduct.name}&quot; موجود بالفعل في قاعدة البيانات. اختر الإجراء المناسب.
              </p>
            </div>
          </div>
          
          <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-extrabold text-xs rounded-xl border border-amber-300 dark:border-amber-700">
            تكرار {currentIndex} من {totalDuplicates}
          </span>
        </div>

        {/* Side-by-Side Comparison Box */}
        <div className="grid grid-cols-2 gap-4">
          
          {/* Current Store Version */}
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
              <span className="text-xs font-extrabold text-gray-700 dark:text-gray-300">المنتج الحالي في المتجر</span>
              <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-[10px] font-bold rounded">الحالي</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0 flex items-center justify-center border border-gray-300 dark:border-gray-600">
                {existingProduct.image ? (
                  <img src={existingProduct.image} alt={existingProduct.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">📦</span>
                )}
              </div>
              <div>
                <p className="font-extrabold text-xs text-gray-900 dark:text-white line-clamp-1">{existingProduct.name}</p>
                <p className="text-[11px] text-blue-600 dark:text-blue-400 font-bold mt-0.5">📂 {getCategory(existingProduct)}</p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">سعر التكلفة:</span>
                <span className="font-bold text-gray-900 dark:text-white">{(existingProduct.costPrice || 0).toLocaleString()} د.ع</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">نسبة الفائدة:</span>
                <span className="font-bold text-emerald-600">%{existingProduct.profitMargin || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">سعر الجملة:</span>
                <span className="font-bold text-gray-900 dark:text-white">{(existingProduct.wholesalePrice || 0).toLocaleString()} د.ع</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">سعر المفرد:</span>
                <span className="font-extrabold text-blue-600 dark:text-blue-400">{(existingProduct.retailPrice || 0).toLocaleString()} د.ع</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">المخزون الحالي:</span>
                <span className="font-extrabold text-purple-600 dark:text-purple-400">{existingProduct.stock || 0} قطعة</span>
              </div>
            </div>
          </div>

          {/* Incoming Backup Version */}
          <div className="p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-3">
            <div className="flex items-center justify-between border-b border-blue-200 dark:border-blue-800 pb-2">
              <span className="text-xs font-extrabold text-blue-800 dark:text-blue-300">البيانات الواردة في النسخة</span>
              <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-bold rounded">الجديد</span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900 overflow-hidden flex-shrink-0 flex items-center justify-center border border-blue-300 dark:border-blue-700">
                {incomingProduct.image ? (
                  <img src={incomingProduct.image} alt={incomingProduct.name || ""} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">📦</span>
                )}
              </div>
              <div>
                <p className="font-extrabold text-xs text-blue-900 dark:text-blue-200 line-clamp-1">{incomingProduct.name}</p>
                <p className="text-[11px] text-blue-700 dark:text-blue-300 font-bold mt-0.5">📂 {getCategory(incomingProduct)}</p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">سعر التكلفة:</span>
                <span className="font-bold text-gray-900 dark:text-white">{(incomingProduct.costPrice || 0).toLocaleString()} د.ع</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">نسبة الفائدة:</span>
                <span className="font-bold text-emerald-600">%{incomingProduct.profitMargin || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">سعر الجملة:</span>
                <span className="font-bold text-gray-900 dark:text-white">{(incomingProduct.wholesalePrice || 0).toLocaleString()} د.ع</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">سعر المفرد:</span>
                <span className="font-extrabold text-blue-600 dark:text-blue-400">{(incomingProduct.retailPrice || 0).toLocaleString()} د.ع</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">المخزون الوارد:</span>
                <span className="font-extrabold text-purple-600 dark:text-purple-400">{incomingProduct.stock || 0} قطعة</span>
              </div>
            </div>
          </div>

        </div>

        {/* Checkbox for Bulk Action */}
        <label className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 cursor-pointer"
          />
          <span>تطبيق الخيار المحدد على جميع التكرارات القادمة المتبقية ({totalDuplicates - currentIndex + 1})</span>
        </label>

        {/* 3 Explicit Action Buttons */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <button
            onClick={() => onResolve("update", applyToAll)}
            className="py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
          >
            <span>🔄</span>
            <span>تحديث البيانات بالجديد</span>
          </button>

          <button
            onClick={() => onResolve("skip", applyToAll)}
            className="py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-extrabold text-xs border border-gray-300 dark:border-gray-600 transition-colors flex items-center justify-center gap-1.5"
          >
            <span>⏭</span>
            <span>تخطي الإبقاء على الحالي</span>
          </button>

          <button
            onClick={() => onResolve("cancel", false)}
            className="py-3 bg-red-50 dark:bg-red-950/50 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 rounded-xl font-extrabold text-xs border border-red-200 dark:border-red-800 transition-colors flex items-center justify-center gap-1.5"
          >
            <span>🚫</span>
            <span>إلغاء العملية بالكامل</span>
          </button>
        </div>
      </div>
    </div>
  );
}
