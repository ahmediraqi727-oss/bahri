"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { Product } from "@/lib/types";
import {
  LabelCustomizationOptions,
  DEFAULT_LABEL_CUSTOMIZATION,
  DEFAULT_LABEL_ELEMENT_ORDER,
  moveElementOrder,
  LabelElementId,
  LogoPlacement,
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

  // Handle Image Upload for Logo
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setCustomization((prev) => ({
          ...prev,
          logoUrl: result,
          showLogo: true,
        }));
        success("✅ تم إدراج شعار الموقع المخصص بنجاح!");
      }
    };
    reader.readAsDataURL(file);
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
              🎨
            </div>
            <div>
              <h2 className="font-black text-base sm:text-lg text-white leading-tight break-words whitespace-normal">
                استوديو الملصقات الحرارية المتكامل (Ahmed Bahri Thermal Suite)
              </h2>
              <p className="text-purple-300 text-xs break-words whitespace-normal leading-tight">
                مقاسات قياسية عالمية، ألوان مخصصة، إدراج الشعار، وترتيب العناصر الفوري
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

          {/* Left Column: Presets, Colors, Logo & Controls (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            
            {/* ── 1. Expanded Global Thermal Presets & Dropdown Selector ── */}
            <div className="bg-[#15102a]/90 p-4 rounded-2xl border border-purple-500/40 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-extrabold text-purple-300">
                  🌐 مقاسات الرول القياسية العالمية (Global Presets Dropdown):
                </label>
              </div>

              {/* Comprehensive Dropdown Selector */}
              <select
                value={customization.presetName || "marklife_40x30"}
                onChange={(e) => applyPreset(e.target.value)}
                className="w-full px-3 py-2 bg-purple-950 border border-purple-500/50 rounded-xl text-xs sm:text-sm font-bold text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="shipping_100x150">🚚 Standard Shipping (4x6 in / 100×150 mm)</option>
                <option value="logistics_100x75">📦 Medium Logistics (4x3 in / 100×75 mm)</option>
                <option value="standard_50x30">🏷 Retail Price Tag (50×30 mm / 2x1.2 in)</option>
                <option value="marklife_40x30">🏷 Marklife X4 Standard Roll (40×30 mm)</option>
                <option value="jewelry_25x15">💍 Small Jewelry / Strips (25×15 mm)</option>
                <option value="square_50x50">🔲 Square Product Tag (50×50 mm)</option>
                <option value="circular_40x40">⭕ Circular Jar Label (40×40 mm)</option>
                <option value="circular_50x50">⭕ Circular Jar Label (50×50 mm)</option>
                <option value="continuous_100">📜 Continuous / Fanfold Roll (100mm Width)</option>
              </select>

              {/* Quick-Select Size Pills */}
              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  { key: "shipping_100x150", label: "شحن 100×150" },
                  { key: "logistics_100x75", label: "لوجستي 100×75" },
                  { key: "standard_50x30", label: "قياسي 50×30" },
                  { key: "marklife_40x30", label: "Marklife 40×30" },
                  { key: "jewelry_25x15", label: "مجوهرات 25×15" },
                  { key: "square_50x50", label: "مربع 50×50" },
                  { key: "circular_50x50", label: "دائري 50×50" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    className="px-2.5 py-1 bg-purple-950/60 hover:bg-purple-800/50 border border-purple-500/30 rounded-xl text-xs font-bold text-white transition-all"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── 2. Advanced Color Customization Suite ── */}
            <div className="bg-[#15102a]/90 p-4 rounded-2xl border border-purple-500/40 flex flex-col gap-3">
              <label className="block text-xs font-extrabold text-purple-300">
                🎨 تخصيص ألوان الملصق والطباعة (Color Customization Suite):
              </label>

              <div className="grid grid-cols-3 gap-3 text-xs">
                {/* Background Color */}
                <div className="flex flex-col gap-1.5 bg-purple-950/50 p-2.5 rounded-xl border border-purple-500/30">
                  <span className="font-bold text-purple-200">خلفية الملصق:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customization.labelBgColor || "#FFFFFF"}
                      onChange={(e) =>
                        setCustomization((prev) => ({ ...prev, labelBgColor: e.target.value }))
                      }
                      className="w-8 h-8 rounded cursor-pointer border border-purple-500/50 bg-transparent"
                    />
                    <span className="font-mono text-[11px] text-purple-300">{customization.labelBgColor || "#FFFFFF"}</span>
                  </div>
                </div>

                {/* Text Color */}
                <div className="flex flex-col gap-1.5 bg-purple-950/50 p-2.5 rounded-xl border border-purple-500/30">
                  <span className="font-bold text-purple-200">لون النصوص:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customization.textColor || "#000000"}
                      onChange={(e) =>
                        setCustomization((prev) => ({ ...prev, textColor: e.target.value }))
                      }
                      className="w-8 h-8 rounded cursor-pointer border border-purple-500/50 bg-transparent"
                    />
                    <span className="font-mono text-[11px] text-purple-300">{customization.textColor || "#000000"}</span>
                  </div>
                </div>

                {/* Border Color */}
                <div className="flex flex-col gap-1.5 bg-purple-950/50 p-2.5 rounded-xl border border-purple-500/30">
                  <span className="font-bold text-purple-200">لون الإطار:</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={customization.borderColor || "#cbd5e1"}
                      onChange={(e) =>
                        setCustomization((prev) => ({ ...prev, borderColor: e.target.value }))
                      }
                      className="w-8 h-8 rounded cursor-pointer border border-purple-500/50 bg-transparent"
                    />
                    <span className="font-mono text-[11px] text-purple-300">{customization.borderColor || "#cbd5e1"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── 3. Site Logo Integration & Watermarking Engine ── */}
            <div className="bg-[#15102a]/90 p-4 rounded-2xl border border-purple-500/40 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-extrabold text-purple-300">
                  <input
                    type="checkbox"
                    checked={customization.showLogo}
                    onChange={(e) =>
                      setCustomization((prev) => ({ ...prev, showLogo: e.target.checked }))
                    }
                    className="w-4 h-4 rounded accent-purple-600 cursor-pointer"
                  />
                  <span>🖼 إدراج شعار الموقع والعلامة المائية (Brand Logo Integration)</span>
                </label>
              </div>

              {customization.showLogo && (
                <div className="flex flex-col gap-3 pt-1 border-t border-purple-950">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* Logo Placement */}
                    <div>
                      <span className="block text-purple-200 font-bold mb-1">موضع الشعار:</span>
                      <select
                        value={customization.logoPosition || "top_center"}
                        onChange={(e) =>
                          setCustomization((prev) => ({
                            ...prev,
                            logoPosition: e.target.value as LogoPlacement,
                          }))
                        }
                        className="w-full px-3 py-1.5 bg-purple-950 border border-purple-500/40 rounded-xl text-xs font-bold text-white focus:outline-none"
                      >
                        <option value="top_center">أعلى المنتصف</option>
                        <option value="top_left">أعلى اليسار</option>
                        <option value="top_right">أعلى اليمين</option>
                        <option value="background_watermark">علامة مائية بالخلفية</option>
                      </select>
                    </div>

                    {/* Logo Size */}
                    <div>
                      <div className="flex justify-between font-bold text-purple-200 mb-1">
                        <span>حجم الشعار:</span>
                        <span>{customization.logoSizePx || 36}px</span>
                      </div>
                      <input
                        type="range"
                        min={20}
                        max={90}
                        value={customization.logoSizePx || 36}
                        onChange={(e) =>
                          setCustomization((prev) => ({ ...prev, logoSizePx: Number(e.target.value) }))
                        }
                        className="w-full h-1.5 bg-purple-950 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                    </div>
                  </div>

                  {/* Logo Custom File Upload */}
                  <div className="flex items-center gap-3">
                    <label className="px-3 py-1.5 bg-purple-900 hover:bg-purple-800 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shrink-0">
                      <span>📁 رفع شعار مخصص</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                    <input
                      type="text"
                      value={customization.logoUrl}
                      onChange={(e) =>
                        setCustomization((prev) => ({ ...prev, logoUrl: e.target.value }))
                      }
                      placeholder="أو ضع رابط الشعار مباشر..."
                      className="w-full px-3 py-1.5 bg-purple-950 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Shape Switcher */}
            <div className="bg-[#15102a]/90 p-4 rounded-2xl border border-purple-500/40 flex flex-col gap-2">
              <label className="block text-xs font-extrabold text-purple-300">
                🔷 الشكل الهندسي للرول (Label Shape):
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

            {/* Element Positioning & Reordering Engine */}
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

          {/* Right Column: Multi-Shape Live Label Preview with Safe Area & Custom Colors (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            
            {/* Live Interactive Preview Box */}
            <div className="bg-[#15102a]/90 rounded-3xl p-5 border border-purple-500/40 flex flex-col items-center justify-between min-h-[380px] shadow-inner">
              
              <div className="flex items-center justify-between w-full mb-3">
                <span className="text-xs font-extrabold text-purple-300 flex items-center gap-1.5">
                  <span>🔍 معاينة الألوان والشعار</span>
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
                  className={`w-full shadow-2xl flex flex-col items-center justify-between transition-all overflow-hidden relative border-2 ${
                    customization.labelShape === "circle" ? "rounded-full p-6 max-w-[80%]" : "rounded-2xl p-4"
                  }`}
                  style={{
                    backgroundColor: customization.labelBgColor || "#ffffff",
                    borderColor: customization.borderColor || "#cbd5e1",
                    color: customization.textColor || "#0f172a",
                    maxWidth: `${Math.min(280, customization.rollWidthMM * 5.5)}px`,
                    minHeight: `${Math.min(260, (customization.labelShape === "square" || customization.labelShape === "circle" ? customization.rollWidthMM : customization.rollHeightMM) * 5.5)}px`,
                    aspectRatio: customization.labelShape === "circle" || customization.labelShape === "square" ? "1 / 1" : "auto",
                  }}
                >
                  {/* Brand Logo Watermark Background */}
                  {customization.showLogo && customization.logoUrl && customization.logoPosition === "background_watermark" && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none p-4">
                      <img src={customization.logoUrl} alt="Watermark" className="max-w-full max-h-full object-contain" />
                    </div>
                  )}

                  {/* Brand Logo Header */}
                  {customization.showLogo && customization.logoUrl && customization.logoPosition !== "background_watermark" && (
                    <div
                      className={`w-full flex mb-1 ${
                        customization.logoPosition === "top_left"
                          ? "justify-start"
                          : customization.logoPosition === "top_right"
                          ? "justify-end"
                          : "justify-center"
                      }`}
                    >
                      <img
                        src={customization.logoUrl}
                        alt="Brand Logo"
                        style={{ height: `${customization.logoSizePx || 36}px` }}
                        className="max-w-full object-contain"
                      />
                    </div>
                  )}

                  {/* Dynamic Reordering & Strict Conditional Rendering */}
                  {activeOrder.map((elemId) => {
                    if (elemId === "name" && customization.showProductName && sampleProduct.name) {
                      return (
                        <div
                          key="name"
                          className="font-extrabold text-center mb-1 leading-snug break-words whitespace-normal max-w-full"
                          style={{ fontSize: `${customization.nameFontSize}px`, color: customization.textColor || "#0f172a" }}
                        >
                          {sampleProduct.name}
                        </div>
                      );
                    }

                    if (elemId === "price" && customization.showProductPrice && sampleProduct.retailPrice) {
                      return (
                        <div
                          key="price"
                          className="font-black mb-1"
                          style={{ fontSize: `${customization.priceFontSize}px`, color: customization.textColor || "#2563eb" }}
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
                        <div
                          key="footer"
                          className="text-[10px] font-bold border-t border-gray-200/60 pt-1.5 w-full text-center mt-1 break-words whitespace-normal"
                          style={{ color: customization.textColor || "#64748b" }}
                        >
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
