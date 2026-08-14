"use client";

import { useState, useEffect } from "react";
import type { Product } from "@/lib/types";
import {
  CodePrintType,
  PrintQuantityMode,
  executePrintJob,
  exportPrintableFile,
  PrintItemConfig,
} from "@/lib/printer-service";

interface BatchPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: Product[];
}

export default function BatchPrintModal({
  isOpen,
  onClose,
  selectedProducts,
}: BatchPrintModalProps) {
  const [codeType, setCodeType] = useState<CodePrintType>("both");
  const [qtyMode, setQtyMode] = useState<PrintQuantityMode>("unified");
  const [unifiedQty, setUnifiedQty] = useState<number>(3);
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});
  const [isPrinting, setIsPrinting] = useState(false);

  // Initialize custom quantities state
  useEffect(() => {
    const initial: Record<string, number> = {};
    selectedProducts.forEach((p) => {
      initial[p.id] = customQuantities[p.id] || 3;
    });
    setCustomQuantities(initial);
  }, [selectedProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || selectedProducts.length === 0) return null;

  // Build items array based on mode
  const printItems: PrintItemConfig[] = selectedProducts.map((p) => ({
    product: p,
    quantity: qtyMode === "unified" ? Math.max(1, unifiedQty) : Math.max(1, customQuantities[p.id] || 1),
  }));

  const totalLabelsCount = printItems.reduce((acc, item) => acc + item.quantity, 0);

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await executePrintJob({
        codeType,
        items: printItems,
      });
      onClose();
    } catch (err) {
      alert(String(err));
    }
    setIsPrinting(false);
  };

  const handleExport = async () => {
    try {
      await exportPrintableFile({
        codeType,
        items: printItems,
      });
    } catch (err) {
      alert(String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-fadeIn">
        
        {/* Header */}
        <div className="bg-gradient-to-l from-blue-600 to-indigo-700 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🖨</span>
            <div>
              <h2 className="font-extrabold text-base">إعدادات الطباعة الجماعية</h2>
              <p className="text-blue-100 text-xs">تخصيص نوع الشيفرة وكمية الملصقات لكل منتج</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6 max-h-[80vh] overflow-y-auto">

          {/* 1. Code Type Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
              نوع الشيفرة في الملصق:
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: "barcode", label: "باركود خطي (1D)", icon: "📊" },
                { key: "qr", label: "كود QR مربع", icon: "📱" },
                { key: "both", label: "كلاهما (باركود + QR)", icon: "✨" },
              ] as const).map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCodeType(key)}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-xs font-bold transition-all ${
                    codeType === key
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300"
                  }`}
                >
                  <span className="text-xl mb-1">{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Quantity Allocation Mode */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                توزيع كميات الطباعة:
              </label>
              <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setQtyMode("unified")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    qtyMode === "unified"
                      ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-gray-500"
                  }`}
                >
                  كمية موحدة للكل
                </button>
                <button
                  type="button"
                  onClick={() => setQtyMode("custom")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                    qtyMode === "custom"
                      ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-gray-500"
                  }`}
                >
                  تخصيص لكل منتج
                </button>
              </div>
            </div>

            {/* Unified Mode Input */}
            {qtyMode === "unified" && (
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">عدد الملصقات لكل منتج:</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setUnifiedQty((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-xl bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-xl font-bold flex items-center justify-center text-gray-700 dark:text-gray-200"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={unifiedQty}
                    onChange={(e) => setUnifiedQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 text-center font-extrabold text-base bg-transparent border-b-2 border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setUnifiedQty((q) => q + 1)}
                    className="w-9 h-9 rounded-xl bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-xl font-bold flex items-center justify-center text-blue-600 dark:text-blue-400"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Custom Mode List */}
            {qtyMode === "custom" && (
              <div className="flex flex-col gap-2 max-h-56 overflow-y-auto p-1 border border-gray-200 dark:border-gray-800 rounded-2xl divide-y divide-gray-100 dark:divide-gray-800">
                {selectedProducts.map((product) => {
                  const qty = customQuantities[product.id] || 1;
                  return (
                    <div key={product.id} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2 truncate max-w-[240px]">
                        {product.image && (
                          <img src={product.image} alt={product.name} className="w-8 h-8 rounded-lg object-cover" />
                        )}
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{product.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCustomQuantities((prev) => ({ ...prev, [product.id]: Math.max(1, qty - 1) }))}
                          className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-bold text-xs"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-xs font-mono font-bold">{qty}</span>
                        <button
                          type="button"
                          onClick={() => setCustomQuantities((prev) => ({ ...prev, [product.id]: qty + 1 }))}
                          className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-bold text-xs text-blue-600"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summary Badge */}
          <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-center justify-between text-xs text-blue-800 dark:text-blue-200">
            <span>المنتجات المحددة: <strong>{selectedProducts.length} منتج</strong></span>
            <span>إجمالي الملصقات: <strong className="text-sm text-blue-600 dark:text-blue-400">{totalLabelsCount} ملصق</strong></span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleExport}
              className="flex-1 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <span>📥</span>
              <span>تحميل ملف HTML/PDF</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex-[2] py-3 rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm transition-all disabled:opacity-40 shadow-lg flex items-center justify-center gap-2"
            >
              <span>🖨</span>
              <span>{isPrinting ? "جاري فتح الطابعة..." : `طباعة ${totalLabelsCount} ملصق`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
