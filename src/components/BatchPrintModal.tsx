"use client";

import { useState, useEffect } from "react";
import type { Product } from "@/lib/types";
import {
  PrintQuantityMode,
  executePrintJob,
  exportPrintableFile,
  PrintItemConfig,
  LabelCustomizationOptions,
  DEFAULT_LABEL_CUSTOMIZATION,
  generateBarcodeDataURL,
  generateQRDataURL,
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
  const [qtyMode, setQtyMode] = useState<PrintQuantityMode>("unified");
  const [unifiedQty, setUnifiedQty] = useState<number>(3);
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});
  const [isPrinting, setIsPrinting] = useState(false);

  // Customization Options State
  const [customization, setCustomization] = useState<LabelCustomizationOptions>(
    DEFAULT_LABEL_CUSTOMIZATION
  );

  // Live preview Base64 Data URLs for first selected product
  const [previewBarcodeUrl, setPreviewBarcodeUrl] = useState<string>("");
  const [previewQrUrl, setPreviewQrUrl] = useState<string>("");

  const sampleProduct = selectedProducts[0] || null;

  // Update live preview images whenever sample product or customization changes
  useEffect(() => {
    if (!sampleProduct) return;

    let active = true;

    // 1D Barcode
    if (customization.showBarcode && sampleProduct.barcode) {
      const bUrl = generateBarcodeDataURL(sampleProduct.barcode, customization.barcodeHeight);
      if (active) setPreviewBarcodeUrl(bUrl);
    } else {
      setPreviewBarcodeUrl("");
    }

    // 2D QR Code
    if (customization.showQRCode && sampleProduct.qrCode) {
      generateQRDataURL(sampleProduct.qrCode).then((qUrl) => {
        if (active) setPreviewQrUrl(qUrl);
      });
    } else {
      setPreviewQrUrl("");
    }

    return () => {
      active = false;
    };
  }, [sampleProduct, customization]);

  // Initialize custom quantities state
  useEffect(() => {
    const initial: Record<string, number> = {};
    selectedProducts.forEach((p) => {
      initial[p.id] = customQuantities[p.id] || 3;
    });
    setCustomQuantities(initial);
  }, [selectedProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || selectedProducts.length === 0) return null;

  // Build items array
  const printItems: PrintItemConfig[] = selectedProducts.map((p) => ({
    product: p,
    quantity: qtyMode === "unified" ? Math.max(1, unifiedQty) : Math.max(1, customQuantities[p.id] || 1),
  }));

  const totalLabelsCount = printItems.reduce((acc, item) => acc + item.quantity, 0);

  // Preset Handlers
  const applyPreset = (preset: "full" | "codes_only" | "price_code") => {
    if (preset === "full") {
      setCustomization((prev) => ({
        ...prev,
        showProductName: true,
        showProductPrice: true,
        showBarcode: true,
        showQRCode: true,
        showFooterText: true,
      }));
    } else if (preset === "codes_only") {
      setCustomization((prev) => ({
        ...prev,
        showProductName: false,
        showProductPrice: false,
        showBarcode: true,
        showQRCode: true,
        showFooterText: false,
      }));
    } else if (preset === "price_code") {
      setCustomization((prev) => ({
        ...prev,
        showProductName: true,
        showProductPrice: true,
        showBarcode: true,
        showQRCode: false,
        showFooterText: false,
      }));
    }
  };

  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await executePrintJob({
        items: printItems,
        customization,
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
        items: printItems,
        customization,
      });
    } catch (err) {
      alert(String(err));
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />

      {/* Modal Studio Container */}
      <div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden border border-gray-200 dark:border-gray-800 flex flex-col animate-fadeIn">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-l from-blue-600 via-indigo-600 to-purple-700 px-6 py-4 flex items-center justify-between text-white shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-xl">
              🎨
            </div>
            <div>
              <h2 className="font-extrabold text-lg leading-tight">استوديو مخصص الملصقات والطباعة</h2>
              <p className="text-blue-100 text-xs">تخصيص كامل لعناصر الملصق والمعاينة الفورية قبل الطباعة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Main Body (Grid Layout) */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Customization Controls (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            
            {/* 1. Quick Presets */}
            <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">
                ⚡ إعدادات سريعة جاهزة (Presets):
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "full", label: "كامل التفاصيل", icon: "✨" },
                  { key: "codes_only", label: "الأكواد فقط", icon: "📊" },
                  { key: "price_code", label: "السعر والباركود", icon: "🏷" },
                ].map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key as any)}
                    className="px-3 py-2 bg-white dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-800 dark:text-gray-200 transition-all flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Granular Visibility Toggles */}
            <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col gap-3">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                👁 إظهار / إخفاء العناصر على الملصق:
              </label>

              <div className="grid grid-cols-2 gap-3 text-xs font-bold">
                {[
                  { key: "showProductName", label: "اسم المنتج" },
                  { key: "showProductPrice", label: "سعر المنتج" },
                  { key: "showBarcode", label: "الباركود الخطي (1D)" },
                  { key: "showQRCode", label: "كود QR (2D)" },
                  { key: "showFooterText", label: "نص التذييل/الملاحظات" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-gray-800 dark:text-gray-200">
                    <input
                      type="checkbox"
                      checked={(customization as any)[key]}
                      onChange={(e) =>
                        setCustomization((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 3. Style & Size Adjustments */}
            <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col gap-4">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                📏 الأبعاد وأحجام الخطوط:
              </label>

              {/* Barcode Height Slider */}
              <div>
                <div className="flex justify-between text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">
                  <span>ارتفاع الباركود الخطي:</span>
                  <span>{customization.barcodeHeight}px</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={80}
                  value={customization.barcodeHeight}
                  onChange={(e) =>
                    setCustomization((prev) => ({ ...prev, barcodeHeight: Number(e.target.value) }))
                  }
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              {/* Font Sizes */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">
                    <span>حجم خط الاسم:</span>
                    <span>{customization.nameFontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={20}
                    value={customization.nameFontSize}
                    onChange={(e) =>
                      setCustomization((prev) => ({ ...prev, nameFontSize: Number(e.target.value) }))
                    }
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">
                    <span>حجم خط السعر:</span>
                    <span>{customization.priceFontSize}px</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={24}
                    value={customization.priceFontSize}
                    onChange={(e) =>
                      setCustomization((prev) => ({ ...prev, priceFontSize: Number(e.target.value) }))
                    }
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>
              </div>

              {/* Custom Footer Text Input */}
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 mb-1">
                  نص التذييل / الملاحظات المخصصة:
                </label>
                <input
                  type="text"
                  value={customization.footerText}
                  onChange={(e) =>
                    setCustomization((prev) => ({ ...prev, footerText: e.target.value }))
                  }
                  placeholder="مثال: معرض أحمد بحري — ضمان سنة"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 4. Quantity Allocation */}
            <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">
                  توزيع الكميات:
                </label>
                <div className="flex bg-gray-200 dark:bg-gray-700 p-1 rounded-xl gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setQtyMode("unified")}
                    className={`px-3 py-1 font-bold rounded-lg transition-all ${
                      qtyMode === "unified"
                        ? "bg-white dark:bg-gray-900 text-blue-600 shadow-xs"
                        : "text-gray-500"
                    }`}
                  >
                    كمية موحدة للكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setQtyMode("custom")}
                    className={`px-3 py-1 font-bold rounded-lg transition-all ${
                      qtyMode === "custom"
                        ? "bg-white dark:bg-gray-900 text-blue-600 shadow-xs"
                        : "text-gray-500"
                    }`}
                  >
                    تخصيص لكل منتج
                  </button>
                </div>
              </div>

              {qtyMode === "unified" ? (
                <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">عدد الملصقات لكل منتج:</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setUnifiedQty((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 font-bold text-base flex items-center justify-center"
                    >
                      −
                    </button>
                    <span className="font-extrabold text-sm w-8 text-center">{unifiedQty}</span>
                    <button
                      type="button"
                      onClick={() => setUnifiedQty((q) => q + 1)}
                      className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 font-bold text-base flex items-center justify-center text-blue-600"
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto p-1 border border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                  {selectedProducts.map((product) => {
                    const qty = customQuantities[product.id] || 1;
                    return (
                      <div key={product.id} className="flex items-center justify-between p-2">
                        <span className="text-xs font-bold truncate max-w-[200px]">{product.name}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCustomQuantities((prev) => ({ ...prev, [product.id]: Math.max(1, qty - 1) }))}
                            className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 font-bold text-xs"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-xs font-mono font-bold">{qty}</span>
                          <button
                            type="button"
                            onClick={() => setCustomQuantities((prev) => ({ ...prev, [product.id]: qty + 1 }))}
                            className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-800 font-bold text-xs text-blue-600"
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

          </div>

          {/* Right Column: Live Interactive Label Preview (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className="bg-gray-100 dark:bg-gray-800/80 rounded-3xl p-5 border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-between min-h-[360px] shadow-inner">
              
              <span className="text-xs font-extrabold text-gray-500 dark:text-gray-400 mb-2">
                🔍 معاينة حية للملصق التجريبي (Live Label Preview)
              </span>

              {sampleProduct ? (
                <div className="bg-white text-gray-900 rounded-2xl p-4 border-2 border-dashed border-gray-400 w-full max-w-[250px] shadow-lg flex flex-col items-center justify-between min-h-[220px] transition-all">
                  
                  {/* Name */}
                  {customization.showProductName && (
                    <div
                      className="font-extrabold text-center text-gray-900 mb-1 leading-snug word-break"
                      style={{ fontSize: `${customization.nameFontSize}px` }}
                    >
                      {sampleProduct.name}
                    </div>
                  )}

                  {/* Price */}
                  {customization.showProductPrice && (
                    <div
                      className="font-black text-blue-600 mb-2"
                      style={{ fontSize: `${customization.priceFontSize}px` }}
                    >
                      {sampleProduct.retailPrice.toLocaleString()} د.ع
                    </div>
                  )}

                  {/* Codes Container */}
                  <div className="flex items-center justify-center gap-2 w-full my-2">
                    {customization.showBarcode && previewBarcodeUrl && (
                      <div className="flex flex-col items-center justify-center flex-1">
                        <img
                          src={previewBarcodeUrl}
                          alt="Barcode"
                          style={{ height: `${customization.barcodeHeight}px` }}
                          className="max-w-full object-contain block"
                        />
                      </div>
                    )}

                    {customization.showQRCode && previewQrUrl && (
                      <div className="flex flex-col items-center justify-center">
                        <img src={previewQrUrl} alt="QR Code" className="w-16 h-16 object-contain block" />
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {customization.showFooterText && customization.footerText && (
                    <div className="text-[10px] text-gray-500 font-bold border-t border-gray-100 pt-1.5 w-full text-center mt-1">
                      {customization.footerText}
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-xs text-gray-400">لا يوجد منتج للمعاينة</span>
              )}

              {/* Total Badges */}
              <div className="w-full mt-4 bg-white dark:bg-gray-900 rounded-2xl p-3 border border-gray-200 dark:border-gray-700 flex justify-between items-center text-xs font-bold">
                <span>إجمالي المنتجات: {selectedProducts.length}</span>
                <span className="text-blue-600 dark:text-blue-400 font-extrabold">
                  إجمالي الملصقات: {totalLabelsCount}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 mt-auto">
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPrinting}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-l from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-black text-sm transition-all disabled:opacity-40 shadow-xl flex items-center justify-center gap-2"
              >
                <span>🖨</span>
                <span>{isPrinting ? "جاري تجهيز الطابعة..." : `طباعة ${totalLabelsCount} ملصق مخصص`}</span>
              </button>

              <button
                type="button"
                onClick={handleExport}
                className="w-full py-2.5 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <span>📥</span>
                <span>تحميل ملف الطباعة الشامل (HTML/PDF)</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
