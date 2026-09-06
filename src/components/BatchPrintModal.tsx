"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { Product } from "@/lib/types";
import {
  LabelCustomizationOptions,
  DEFAULT_LABEL_CUSTOMIZATION,
  DEFAULT_LABEL_ELEMENT_ORDER,
  moveElementOrder,
  LabelElementId,
  executePrintJob,
  generateBarcodeDataURL,
  generateQRDataURL,
  BarcodeSymbology,
  LabelShape,
  QRErrorCorrection,
  QRTargetMode,
  generateTSPLCommands,
  generateZPLCommands,
  connectWebBluetoothPrinter,
  sendTSPLToBluetooth,
  connectWebUSBPrinter,
  sendTSPLToUSB,
  handshakeWithMarklifeApp,
  exportLabelsAsPDF,
  renderLabelToImageBlob,
  GLOBAL_THERMAL_PRESETS,
  resolveQRPayload,
} from "@/lib/printer-service";
import { useToast } from "@/components/ToastProvider";

export interface BatchPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: Product[];
}

const ELEMENT_LABELS: Record<LabelElementId, { title: string; icon: string }> = {
  name: { title: "اسم المنتج", icon: "🏷" },
  price: { title: "سعر المنتج", icon: "💰" },
  codes: { title: "الأكواد والباركود (1D / 2D)", icon: "📊" },
  footer: { title: "نص التذييل والملاحظات", icon: "✍️" },
};

export default function BatchPrintModal({
  isOpen,
  onClose,
  selectedProducts,
}: BatchPrintModalProps) {
  const { success, error: toastError, loading: toastLoading, dismiss } = useToast();

  const [customization, setCustomization] = useState<LabelCustomizationOptions>({
    ...DEFAULT_LABEL_CUSTOMIZATION,
    elementOrder: [...DEFAULT_LABEL_ELEMENT_ORDER],
  });

  const [qtyMode, setQtyMode] = useState<"unified" | "custom">("unified");
  const [unifiedQty, setUnifiedQty] = useState<number>(1);
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({});
  const [isPrinting, setIsPrinting] = useState(false);

  // Hardware Connection State (Web Bluetooth / Web USB)
  const [connectedDevice, setConnectedDevice] = useState<{
    type: "bluetooth" | "usb" | "none";
    name: string | null;
    bluetoothChar?: any;
    usbDevice?: any;
  }>({
    type: "none",
    name: null,
  });

  // Pre-generate sample URLs for live preview
  const sampleProduct = selectedProducts[0] || null;
  const [previewBarcodeUrl, setPreviewBarcodeUrl] = useState<string>("");
  const [previewQrUrl, setPreviewQrUrl] = useState<string>("");

  useEffect(() => {
    if (!sampleProduct) return;
    if (sampleProduct.barcode && customization.showBarcode) {
      const url = generateBarcodeDataURL(
        sampleProduct.barcode,
        customization.barcodeHeight,
        customization.barcodeType || "CODE128"
      );
      setPreviewBarcodeUrl(url);
    } else {
      setPreviewBarcodeUrl("");
    }

    const qrPayload = resolveQRPayload(sampleProduct, customization);
    if (qrPayload && (customization.showQRCode || customization.showStoreURLQR)) {
      generateQRDataURL(qrPayload, customization.qrErrorCorrection || "M").then(
        setPreviewQrUrl
      );
    } else {
      setPreviewQrUrl("");
    }
  }, [
    sampleProduct,
    customization.barcodeHeight,
    customization.barcodeType,
    customization.showBarcode,
    customization.showQRCode,
    customization.showStoreURLQR,
    customization.qrTargetMode,
    customization.qrErrorCorrection,
    customization.storeUrl,
  ]);

  // Compute print items list with quantities
  const printItems = useMemo(() => {
    return selectedProducts.map((product) => ({
      product,
      quantity: qtyMode === "unified" ? unifiedQty : customQuantities[product.id] || 1,
    }));
  }, [selectedProducts, qtyMode, unifiedQty, customQuantities]);

  const totalLabelsCount = useMemo(() => {
    return printItems.reduce((acc, item) => acc + item.quantity, 0);
  }, [printItems]);

  if (!isOpen) return null;

  // Handle Element Order Movement
  const handleShiftElement = (id: LabelElementId, direction: "up" | "down") => {
    const currentOrder = customization.elementOrder || DEFAULT_LABEL_ELEMENT_ORDER;
    const nextOrder = moveElementOrder(currentOrder, id, direction);
    setCustomization((prev) => ({ ...prev, elementOrder: nextOrder }));
  };

  // Apply Roll & Format Presets
  const applyPreset = (presetKey: string) => {
    if (presetKey in GLOBAL_THERMAL_PRESETS) {
      setCustomization((prev) => ({
        ...prev,
        ...GLOBAL_THERMAL_PRESETS[presetKey],
      }));
      success(`✅ تم تطبيق قالب الأحجام القياسية (${presetKey})`);
      return;
    }

    if (presetKey === "full") {
      setCustomization((prev) => ({
        ...prev,
        showProductName: true,
        showProductPrice: true,
        showBarcode: true,
        showQRCode: true,
        showStoreURLQR: true,
        showFooterText: true,
        presetName: "full",
      }));
    } else if (presetKey === "codes_only") {
      setCustomization((prev) => ({
        ...prev,
        showProductName: false,
        showProductPrice: false,
        showBarcode: true,
        showQRCode: true,
        showStoreURLQR: true,
        showFooterText: false,
        presetName: "codes_only",
      }));
    } else if (presetKey === "price_code") {
      setCustomization((prev) => ({
        ...prev,
        showProductName: true,
        showProductPrice: true,
        showBarcode: true,
        showQRCode: false,
        showStoreURLQR: false,
        showFooterText: false,
        presetName: "price_code",
      }));
    }
  };

  // Connect Web Bluetooth Printer (Marklife X4)
  const handleConnectBluetooth = async () => {
    const toastId = toastLoading("جاري البحث عن طابعات البلوتوث المجاورة (Marklife X4)...");
    try {
      const conn = await connectWebBluetoothPrinter();
      setConnectedDevice({
        type: "bluetooth",
        name: conn.name,
        bluetoothChar: conn.characteristic,
      });
      dismiss(toastId);
      success(`✅ تم الاتصال بطابعة البلوتوث: ${conn.name}`);
    } catch (err) {
      dismiss(toastId);
      toastError("فشل اتصال البلوتوث: " + String(err));
    }
  };

  // Connect Web USB Printer
  const handleConnectUSB = async () => {
    const toastId = toastLoading("جاري البحث عن طابعة كابل USB...");
    try {
      const usbDev = await connectWebUSBPrinter();
      setConnectedDevice({
        type: "usb",
        name: usbDev.productName || "Marklife USB Printer",
        usbDevice: usbDev,
      });
      dismiss(toastId);
      success(`✅ تم الاتصال بطابعة USB: ${usbDev.productName || "Direct USB"}`);
    } catch (err) {
      dismiss(toastId);
      toastError("فشل اتصال USB: " + String(err));
    }
  };

  // Direct Hardware TSPL Print
  const handleDirectHardwarePrint = async () => {
    if (connectedDevice.type === "none") {
      toastError("الرجاء الاتصال بطابعة البلوتوث أو USB أولاً.");
      return;
    }

    const tsplScript = generateTSPLCommands(printItems, customization);
    const toastId = toastLoading("جاري إرسال أوامر TSPL للطابعة الحرارية...");

    try {
      if (connectedDevice.type === "bluetooth" && connectedDevice.bluetoothChar) {
        await sendTSPLToBluetooth(connectedDevice.bluetoothChar, tsplScript);
      } else if (connectedDevice.type === "usb" && connectedDevice.usbDevice) {
        await sendTSPLToUSB(connectedDevice.usbDevice, tsplScript);
      }
      dismiss(toastId);
      success("✅ تم إرسال أمر الطباعة المباشر إلى Marklife X4 بنجاح!");
    } catch (err) {
      dismiss(toastId);
      toastError("خطأ إرسال الأوامر للطابعة: " + String(err));
    }
  };

  // Handshake with Marklife Mobile App via Web Share / Deep Link
  const handleMarklifeAppHandshake = async () => {
    const tsplScript = generateTSPLCommands(printItems, customization);
    let imageBlob: Blob | undefined;

    if (sampleProduct) {
      try {
        imageBlob = await renderLabelToImageBlob(sampleProduct, customization, "image/png");
      } catch (e) {
        console.warn("[Modal] Failed blob render:", e);
      }
    }

    const shared = await handshakeWithMarklifeApp(tsplScript, imageBlob, "bahri_label_payload");
    if (shared) {
      success("📲 تم فتح وتمرير بيانات الملصق إلى تطبيق الطباعة المساعد.");
    } else {
      toastError("تعذّر فتح التطبيق المساعد تلقائياً. تم تجهيز ملف الأوامر.");
    }
  };

  // Standard Browser Print
  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await executePrintJob({
        items: printItems,
        customization,
      });
      onClose();
    } catch (err) {
      toastError(String(err));
    }
    setIsPrinting(false);
  };

  // Export PDF
  const handleExportPDF = async () => {
    const toastId = toastLoading("جاري توليد ملف PDF أبعاد حرارية مخصصة...");
    try {
      await exportLabelsAsPDF(printItems, customization, `marklife_labels_${customization.rollWidthMM}x${customization.rollHeightMM}mm.pdf`);
      dismiss(toastId);
      success("✅ تم تحميل ملف PDF بنجاح!");
    } catch (err) {
      dismiss(toastId);
      toastError("فشل تصدير PDF: " + String(err));
    }
  };

  // Export PNG High-DPI
  const handleExportPNG = async () => {
    if (!sampleProduct) return;
    const toastId = toastLoading("جاري استخراج صورة الملصق عالية الدقة (300 DPI)...");
    try {
      const blob = await renderLabelToImageBlob(sampleProduct, customization, "image/png");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `label_${sampleProduct.name.replace(/\s+/g, "_")}_${customization.labelShape}.png`;
      a.click();
      URL.revokeObjectURL(url);
      dismiss(toastId);
      success("✅ تم استخراج صورة PNG بنجاح!");
    } catch (err) {
      dismiss(toastId);
      toastError("فشل تصدير PNG: " + String(err));
    }
  };

  // Export Raw TSPL / ZPL Files
  const handleExportCommands = (type: "TSPL" | "ZPL") => {
    const script =
      type === "TSPL"
        ? generateTSPLCommands(printItems, customization)
        : generateZPLCommands(printItems, customization);

    const blob = new Blob([script], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `label_commands_${type.toLowerCase()}.tspl`;
    link.click();
    URL.revokeObjectURL(url);
    success(`✅ تم تحميل ملف أوامر ${type} بنجاح!`);
  };

  const activeOrder = customization.elementOrder && customization.elementOrder.length > 0
    ? customization.elementOrder
    : DEFAULT_LABEL_ELEMENT_ORDER;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-5" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />

      {/* Studio Container */}
      <div className="relative bg-[#1e1936] text-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[94vh] overflow-hidden border border-purple-500/40 flex flex-col animate-fadeIn">
        
        {/* Header Bar */}
        <div className="bg-gradient-to-l from-purple-950 via-slate-900 to-indigo-950 px-6 py-4 flex items-center justify-between border-b border-purple-500/30">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-2xl shadow-lg">
              🖨
            </div>
            <div>
              <h2 className="font-black text-base sm:text-lg text-white leading-tight break-words whitespace-normal">
                استوديو الملصقات الحرارية المتطور (Marklife X4 Studio)
              </h2>
              <p className="text-purple-300 text-xs break-words whitespace-normal leading-tight">
                أشكال متعددة، منطقة آمنة دائرية، ترتيب ديناميكي، وإظهار مشروط صارم
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Studio Body (Grid Layout) */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left Column: Controls, Order Engine & Shape Switcher (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            
            {/* ── Multi-Shape Label Roll Switcher ── */}
            <div className="bg-[#15102a]/90 p-4 rounded-2xl border border-purple-500/40 flex flex-col gap-2">
              <label className="block text-xs font-extrabold text-purple-300">
                🔷 الشكل الهندسي للرول (Label Roll Shape & Circular Bounds):
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "rectangle", label: "مستطيل ▭", desc: "أبعاد قياسية" },
                  { key: "square", label: "مربع 🔲", desc: "متساوي الأضلاع" },
                  { key: "circle", label: "دائري ⭕", desc: "أغطية وقناني Safe-Area" },
                ].map(({ key, label, desc }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setCustomization((prev) => ({
                        ...prev,
                        labelShape: key as LabelShape,
                      }))
                    }
                    className={`p-2.5 rounded-xl border text-xs sm:text-sm font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
                      customization.labelShape === key
                        ? "bg-gradient-to-l from-purple-600 to-indigo-600 border-purple-400 text-white shadow-lg"
                        : "bg-purple-950/40 border-purple-500/30 text-purple-200 hover:bg-purple-900/40"
                    }`}
                  >
                    <span>{label}</span>
                    <span className="text-[10px] text-purple-300 font-normal">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── 3. Element Positioning & Reordering Engine ── */}
            <div className="bg-[#15102a]/90 p-4 rounded-2xl border border-purple-500/40 flex flex-col gap-3">
              <label className="block text-xs font-extrabold text-purple-300">
                ↕ ترتيب تموضع العناصر على الملصق (Element Vertical Reordering):
              </label>
              <div className="flex flex-col gap-2">
                {activeOrder.map((elemId, index) => {
                  const meta = ELEMENT_LABELS[elemId];
                  return (
                    <div
                      key={elemId}
                      className="flex items-center justify-between bg-purple-950/60 p-2.5 rounded-xl border border-purple-500/30 text-xs font-bold text-white"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-purple-800 text-purple-200 flex items-center justify-center text-[10px]">
                          {index + 1}
                        </span>
                        <span>{meta.icon}</span>
                        <span>{meta.title}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleShiftElement(elemId, "up")}
                          className="px-2 py-1 bg-purple-900 hover:bg-purple-700 disabled:opacity-30 rounded text-xs text-white transition-all font-mono"
                        >
                          ▲ أعلى
                        </button>
                        <button
                          type="button"
                          disabled={index === activeOrder.length - 1}
                          onClick={() => handleShiftElement(elemId, "down")}
                          className="px-2 py-1 bg-purple-900 hover:bg-purple-700 disabled:opacity-30 rounded text-xs text-white transition-all font-mono"
                        >
                          ▼ أسفل
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 2. Strict Conditional Visibility Binding ── */}
            <div className="bg-[#15102a]/80 p-4 rounded-2xl border border-purple-500/30 flex flex-col gap-3">
              <label className="block text-xs font-extrabold text-purple-300">
                👁 إظهار / إخفاء العناصر (Strict Conditional Visibility):
              </label>

              <div className="grid grid-cols-2 gap-2 text-xs font-bold pt-1">
                {[
                  { key: "showProductName", label: "اسم المنتج" },
                  { key: "showProductPrice", label: "سعر المنتج" },
                  { key: "showBarcode", label: "باركود خطي (1D)" },
                  { key: "showQRCode", label: "كود 2D QR للمنتج" },
                  { key: "showStoreURLQR", label: "QR متجر أحمد بحري" },
                  { key: "showFooterText", label: "نص التذييل" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer text-purple-200">
                    <input
                      type="checkbox"
                      checked={(customization as any)[key]}
                      onChange={(e) =>
                        setCustomization((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      className="w-4 h-4 rounded accent-purple-600 cursor-pointer"
                    />
                    <span className="break-words whitespace-normal leading-tight">{label}</span>
                  </label>
                ))}
              </div>

              {/* Custom Footer Input */}
              {customization.showFooterText && (
                <div className="pt-2">
                  <input
                    type="text"
                    value={customization.footerText}
                    onChange={(e) =>
                      setCustomization((prev) => ({ ...prev, footerText: e.target.value }))
                    }
                    placeholder="نص التذييل المخصص (مثال: معرض أحمد بحري)..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-purple-500/30 bg-purple-950/60 text-white placeholder-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              )}
            </div>

            {/* Global Standard Thermal Roll Size Presets */}
            <div className="bg-[#15102a]/80 p-4 rounded-2xl border border-purple-500/30 flex flex-col gap-2">
              <label className="block text-xs font-bold text-purple-300">
                ⚡ مقاسات الرول القياسية العالمية (Global Presets):
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "marklife_40x30", label: "Marklife 40×30 mm" },
                  { key: "standard_50x30", label: "قياسي 50×30 mm" },
                  { key: "strips_25x50", label: "شريط 25×50 mm" },
                  { key: "medium_75x100", label: "شاشة 75×100 mm" },
                  { key: "shipping_100x150", label: "شحن 100×150 mm" },
                  { key: "circular_50x50", label: "دائري 50×50 mm" },
                  { key: "square_50x50", label: "مربع 50×50 mm" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    className="px-3 py-1.5 bg-purple-950/50 hover:bg-purple-800/40 border border-purple-500/30 rounded-xl text-xs font-bold text-white transition-all text-center break-words whitespace-normal leading-tight"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Direct Hardware Connection Panel (Web Bluetooth / Web USB) */}
            <div className="bg-gradient-to-l from-indigo-950/80 to-purple-950/80 p-4 rounded-2xl border border-indigo-500/40 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📶</span>
                  <span className="text-xs font-extrabold text-white">الاتصال المباشر بالطابعة (Marklife X4 Hardware)</span>
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                    connectedDevice.type !== "none"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-purple-900/40 text-purple-300 border border-purple-700/40"
                  }`}
                >
                  {connectedDevice.type !== "none"
                    ? `متصل: ${connectedDevice.name}`
                    : "غير متصل"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleConnectBluetooth}
                  className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-1.5 text-center break-words whitespace-normal leading-tight shadow-md"
                >
                  <span>📶</span>
                  <span>اتصال بلوتوث</span>
                </button>

                <button
                  type="button"
                  onClick={handleConnectUSB}
                  className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-1.5 text-center break-words whitespace-normal leading-tight shadow-md"
                >
                  <span>🔌</span>
                  <span>اتصال كابل USB</span>
                </button>

                <button
                  type="button"
                  onClick={handleMarklifeAppHandshake}
                  className="py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-1 text-center break-words whitespace-normal leading-tight"
                >
                  <span>📲</span>
                  <span>تطبيق Marklife</span>
                </button>
              </div>

              {connectedDevice.type !== "none" && (
                <button
                  type="button"
                  onClick={handleDirectHardwarePrint}
                  className="w-full py-2.5 bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs sm:text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 text-center break-words whitespace-normal leading-tight mt-1"
                >
                  <span>⚡</span>
                  <span>طباعة حرارية مباشرة فورية (TSPL Output)</span>
                </button>
              )}
            </div>

            {/* Millimeter & Pixel Layout Control Sliders */}
            <div className="bg-[#15102a]/80 p-4 rounded-2xl border border-purple-500/30 flex flex-col gap-4">
              <label className="block text-xs font-bold text-purple-300">
                📏 أبعاد الرول بالمليمتر وقوة الحرق (Millimeter & Burn Control):
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="flex justify-between font-bold text-purple-200 mb-1">
                    <span>العرض:</span>
                    <span>{customization.rollWidthMM} mm</span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={150}
                    value={customization.rollWidthMM}
                    onChange={(e) =>
                      setCustomization((prev) => ({ ...prev, rollWidthMM: Number(e.target.value) }))
                    }
                    className="w-full h-1.5 bg-purple-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between font-bold text-purple-200 mb-1">
                    <span>الارتفاع:</span>
                    <span>{customization.rollHeightMM} mm</span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={200}
                    value={customization.rollHeightMM}
                    onChange={(e) =>
                      setCustomization((prev) => ({ ...prev, rollHeightMM: Number(e.target.value) }))
                    }
                    className="w-full h-1.5 bg-purple-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between font-bold text-purple-200 mb-1">
                    <span>كثافة الحرق:</span>
                    <span>{customization.density}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={15}
                    value={customization.density}
                    onChange={(e) =>
                      setCustomization((prev) => ({ ...prev, density: Number(e.target.value) }))
                    }
                    className="w-full h-1.5 bg-purple-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                </div>
              </div>
            </div>

            {/* Quantity Allocation */}
            <div className="bg-[#15102a]/80 p-4 rounded-2xl border border-purple-500/30">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold text-purple-300">
                  توزيع الكميات:
                </label>
                <div className="flex bg-purple-950 p-1 rounded-xl gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setQtyMode("unified")}
                    className={`px-3 py-1 font-bold rounded-lg transition-all text-xs sm:text-sm text-center break-words whitespace-normal leading-tight ${
                      qtyMode === "unified"
                        ? "bg-purple-600 text-white shadow-xs"
                        : "text-purple-300"
                    }`}
                  >
                    كمية موحدة للكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setQtyMode("custom")}
                    className={`px-3 py-1 font-bold rounded-lg transition-all text-xs sm:text-sm text-center break-words whitespace-normal leading-tight ${
                      qtyMode === "custom"
                        ? "bg-purple-600 text-white shadow-xs"
                        : "text-purple-300"
                    }`}
                  >
                    تخصيص لكل منتج
                  </button>
                </div>
              </div>

              {qtyMode === "unified" ? (
                <div className="flex items-center justify-between bg-purple-950/50 p-3 rounded-xl border border-purple-500/30">
                  <span className="text-xs font-bold text-purple-200">عدد الملصقات لكل منتج:</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setUnifiedQty((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-lg bg-purple-900 font-bold text-base flex items-center justify-center text-white"
                    >
                      −
                    </button>
                    <span className="font-extrabold text-sm w-8 text-center text-white">{unifiedQty}</span>
                    <button
                      type="button"
                      onClick={() => setUnifiedQty((q) => q + 1)}
                      className="w-8 h-8 rounded-lg bg-purple-900 font-bold text-base flex items-center justify-center text-purple-300"
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto p-1 border border-purple-500/30 rounded-xl divide-y divide-purple-900/60 bg-purple-950/50">
                  {selectedProducts.map((product) => {
                    const qty = customQuantities[product.id] || 1;
                    return (
                      <div key={product.id} className="flex items-center justify-between p-2">
                        <span className="text-xs font-bold truncate max-w-[200px] text-purple-200">{product.name}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCustomQuantities((prev) => ({ ...prev, [product.id]: Math.max(1, qty - 1) }))}
                            className="w-6 h-6 rounded bg-purple-900 font-bold text-xs text-white"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-xs font-mono font-bold text-white">{qty}</span>
                          <button
                            type="button"
                            onClick={() => setCustomQuantities((prev) => ({ ...prev, [product.id]: qty + 1 }))}
                            className="w-6 h-6 rounded bg-purple-900 font-bold text-xs text-purple-300"
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

          {/* Right Column: Multi-Shape Live Label Preview with Safe Area (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            
            {/* Live Interactive Preview Box */}
            <div className="bg-[#15102a]/90 rounded-3xl p-5 border border-purple-500/40 flex flex-col items-center justify-between min-h-[380px] shadow-inner">
              
              <div className="flex items-center justify-between w-full mb-3">
                <span className="text-xs font-extrabold text-purple-300 flex items-center gap-1.5">
                  <span>🔍 معاينة حية (Reordered Safe-Area)</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-950 border border-purple-500/30 text-purple-300 font-mono">
                    {customization.labelShape === "circle" ? "⭕ دائري" : customization.labelShape === "square" ? "🔲 مربع" : "▭ مستطيل"}
                  </span>
                </span>
                <span className="text-[11px] font-mono text-purple-400 bg-purple-950 px-2 py-0.5 rounded-full border border-purple-500/30">
                  {customization.rollWidthMM}×{customization.labelShape === "square" || customization.labelShape === "circle" ? customization.rollWidthMM : customization.rollHeightMM} mm
                </span>
              </div>

              {sampleProduct ? (
                <div
                  className={`bg-white text-gray-900 border-2 border-dashed border-gray-400 w-full shadow-2xl flex flex-col items-center justify-between transition-all overflow-hidden ${
                    customization.labelShape === "circle" ? "rounded-full p-6 max-w-[80%]" : "rounded-2xl p-4"
                  }`}
                  style={{
                    maxWidth: `${Math.min(280, customization.rollWidthMM * 5.5)}px`,
                    minHeight: `${Math.min(260, (customization.labelShape === "square" || customization.labelShape === "circle" ? customization.rollWidthMM : customization.rollHeightMM) * 5.5)}px`,
                    aspectRatio: customization.labelShape === "circle" || customization.labelShape === "square" ? "1 / 1" : "auto",
                  }}
                >
                  {/* Dynamic Reordering & Strict Conditional Rendering */}
                  {activeOrder.map((elemId) => {
                    if (elemId === "name" && customization.showProductName && sampleProduct.name) {
                      return (
                        <div
                          key="name"
                          className="font-extrabold text-center text-gray-900 mb-1 leading-snug break-words whitespace-normal max-w-full"
                          style={{ fontSize: `${customization.nameFontSize}px` }}
                        >
                          {sampleProduct.name}
                        </div>
                      );
                    }

                    if (elemId === "price" && customization.showProductPrice && sampleProduct.retailPrice) {
                      return (
                        <div
                          key="price"
                          className="font-black text-blue-600 mb-1"
                          style={{ fontSize: `${customization.priceFontSize}px` }}
                        >
                          {sampleProduct.retailPrice.toLocaleString()} IQD
                        </div>
                      );
                    }

                    if (elemId === "codes") {
                      const hasBarcode = customization.showBarcode && previewBarcodeUrl;
                      const hasQR = (customization.showQRCode || customization.showStoreURLQR) && previewQrUrl;

                      if (!hasBarcode && !hasQR) return null;

                      return (
                        <div key="codes" className="flex flex-wrap items-center justify-center gap-2 w-full my-1.5 max-w-full">
                          {hasBarcode && (
                            <div className="flex flex-col items-center justify-center flex-1 min-w-[90px] max-w-full">
                              <img
                                src={previewBarcodeUrl}
                                alt="Barcode"
                                style={{ height: `${customization.barcodeHeight}px` }}
                                className="max-w-full object-contain block"
                              />
                            </div>
                          )}

                          {hasQR && (
                            <div className="flex flex-col items-center justify-center">
                              <img
                                src={previewQrUrl}
                                alt="QR Code"
                                style={{ width: `${customization.qrSizePx || 56}px`, height: `${customization.qrSizePx || 56}px` }}
                                className="object-contain block"
                              />
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (elemId === "footer" && customization.showFooterText && customization.footerText) {
                      return (
                        <div key="footer" className="text-[10px] text-gray-500 font-bold border-t border-gray-200 pt-1.5 w-full text-center mt-1 break-words whitespace-normal">
                          {customization.footerText}
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              ) : (
                <span className="text-xs text-purple-400">لا يوجد منتج للمعاينة</span>
              )}

              {/* Total Badges */}
              <div className="w-full mt-4 bg-purple-950/70 rounded-2xl p-3 border border-purple-500/30 flex justify-between items-center text-xs font-bold text-purple-200">
                <span>إجمالي المنتجات: {selectedProducts.length}</span>
                <span className="text-emerald-400 font-black">
                  إجمالي الملصقات: {totalLabelsCount}
                </span>
              </div>
            </div>

            {/* Multi-Format Export Action Bar */}
            <div className="flex flex-col gap-2 mt-auto">
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPrinting}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-l from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-black text-xs sm:text-sm transition-all disabled:opacity-40 shadow-xl flex items-center justify-center gap-2 text-center break-words whitespace-normal leading-tight"
              >
                <span>🖨</span>
                <span>{isPrinting ? "جاري التجهيز..." : `طباعة عبر النظام (${totalLabelsCount} ملصق)`}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleExportPDF}
                  className="py-2.5 px-3 rounded-2xl bg-purple-950 hover:bg-purple-900 border border-purple-500/40 text-purple-200 font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 text-center break-words whitespace-normal leading-tight shadow-md"
                >
                  <span>📄</span>
                  <span>تصدير PDF (mm)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPNG}
                  className="py-2.5 px-3 rounded-2xl bg-purple-950 hover:bg-purple-900 border border-purple-500/40 text-purple-200 font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 text-center break-words whitespace-normal leading-tight shadow-md"
                >
                  <span>🖼</span>
                  <span>تصدير صورة PNG</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleExportCommands("TSPL")}
                  className="py-2 px-3 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 font-bold text-xs text-center break-words whitespace-normal leading-tight"
                >
                  <span>📜</span>
                  <span>أوامر TSPL</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportCommands("ZPL")}
                  className="py-2 px-3 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/30 text-purple-300 font-bold text-xs text-center break-words whitespace-normal leading-tight"
                >
                  <span>📜</span>
                  <span>أوامر ZPL</span>
                </button>
              </div>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
