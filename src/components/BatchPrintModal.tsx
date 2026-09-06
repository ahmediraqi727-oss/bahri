"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { Product } from "@/lib/types";
import {
  LabelCustomizationOptions,
  DEFAULT_LABEL_CUSTOMIZATION,
  executePrintJob,
  exportPrintableFile,
  generateBarcodeDataURL,
  generateQRDataURL,
  BarcodeSymbology,
  generateTSPLCommands,
  generateZPLCommands,
  connectWebBluetoothPrinter,
  sendTSPLToBluetooth,
  connectWebUSBPrinter,
  sendTSPLToUSB,
  handshakeWithMarklifeApp,
  exportLabelsAsPDF,
  renderLabelToImageBlob,
  MARKLIFE_X4_PRESETS,
} from "@/lib/printer-service";
import { useToast } from "@/components/ToastProvider";

export interface BatchPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: Product[];
}

export default function BatchPrintModal({
  isOpen,
  onClose,
  selectedProducts,
}: BatchPrintModalProps) {
  const { success, error: toastError, loading: toastLoading, dismiss } = useToast();

  const [customization, setCustomization] = useState<LabelCustomizationOptions>({
    ...DEFAULT_LABEL_CUSTOMIZATION,
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
    if (sampleProduct.barcode) {
      const url = generateBarcodeDataURL(
        sampleProduct.barcode,
        customization.barcodeHeight,
        customization.barcodeType || "CODE128"
      );
      setPreviewBarcodeUrl(url);
    } else {
      setPreviewBarcodeUrl("");
    }

    if (sampleProduct.qrCode) {
      generateQRDataURL(sampleProduct.qrCode).then(setPreviewQrUrl);
    } else {
      setPreviewQrUrl("");
    }
  }, [
    sampleProduct,
    customization.barcodeHeight,
    customization.barcodeType,
    customization.showBarcode,
    customization.showQRCode,
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

  // Apply Roll & Format Presets
  const applyPreset = (preset: string) => {
    if (preset in MARKLIFE_X4_PRESETS) {
      setCustomization((prev) => ({
        ...prev,
        ...MARKLIFE_X4_PRESETS[preset],
      }));
      success(`✅ تم تطبيق قوالب رول طابعة Marklife (${preset})`);
      return;
    }

    if (preset === "full") {
      setCustomization((prev) => ({
        ...prev,
        showProductName: true,
        showProductPrice: true,
        showBarcode: true,
        showQRCode: true,
        showFooterText: true,
        presetName: "full",
      }));
    } else if (preset === "codes_only") {
      setCustomization((prev) => ({
        ...prev,
        showProductName: false,
        showProductPrice: false,
        showBarcode: true,
        showQRCode: true,
        showFooterText: false,
        presetName: "codes_only",
      }));
    } else if (preset === "price_code") {
      setCustomization((prev) => ({
        ...prev,
        showProductName: true,
        showProductPrice: true,
        showBarcode: true,
        showQRCode: false,
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
      a.download = `label_${sampleProduct.name.replace(/\s+/g, "_")}.png`;
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

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-5" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />

      {/* Studio Container */}
      <div className="relative bg-[#1e1936] text-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[94vh] overflow-hidden border border-purple-500/40 flex flex-col animate-fadeIn">
        
        {/* Header Bar */}
        <div className="bg-gradient-to-l from-purple-950 via-slate-900 to-indigo-950 px-6 py-4 flex items-center justify-between border-b border-purple-500/30">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-2xl shadow-lg">
              🖨
            </div>
            <div>
              <h2 className="font-black text-base sm:text-lg text-white leading-tight break-words whitespace-normal">
                استوديو الملصقات الحرارية الجاهزة (Marklife X4 Subsystem)
              </h2>
              <p className="text-purple-300 text-xs break-words whitespace-normal leading-tight">
                تحكم مليمتر دقيق، اتصال مباشر بالبلوتوث/USB، وتصدير متعدد الصيغ
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

          {/* Left Column: Controls & Hardware Connection (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            
            {/* 1. Marklife X4 & Roll Presets */}
            <div className="bg-[#15102a]/80 p-4 rounded-2xl border border-purple-500/30">
              <label className="block text-xs font-bold text-purple-300 mb-2">
                ⚡ القوالب المسبقة لرول طابعة Marklife X4 والأحجام القياسية:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { key: "marklife_40x30", label: "Marklife 40×30 mm", icon: "🏷" },
                  { key: "standard_50x30", label: "قياسي 50×30 mm", icon: "📦" },
                  { key: "shipping_60x40", label: "شحن 60×40 mm", icon: "🚚" },
                  { key: "full", label: "كامل التفاصيل", icon: "✨" },
                  { key: "codes_only", label: "الأكواد فقط", icon: "📊" },
                  { key: "price_code", label: "السعر والباركود", icon: "🏷" },
                ].map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    className="px-2.5 py-2 bg-purple-950/40 hover:bg-purple-800/40 border border-purple-500/30 rounded-xl text-xs sm:text-sm font-bold text-white transition-all flex items-center justify-center gap-1.5 shadow-2xs text-center break-words whitespace-normal leading-tight min-w-0"
                  >
                    <span className="shrink-0">{icon}</span>
                    <span className="break-words whitespace-normal leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Direct Hardware Connection Panel (Web Bluetooth / Web USB) */}
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

            {/* 3. Millimeter & Pixel Layout Control Sliders */}
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
                    max={100}
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
                    max={120}
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

            {/* 4. Element Toggles & Barcode Types */}
            <div className="bg-[#15102a]/80 p-4 rounded-2xl border border-purple-500/30 flex flex-col gap-3">
              <label className="block text-xs font-bold text-purple-300">
                👁 إظهار العناصر ونوع الباركود (Symbology):
              </label>

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-purple-200">صيغة الباركود:</span>
                <select
                  value={customization.barcodeType || "CODE128"}
                  onChange={(e) =>
                    setCustomization((prev) => ({
                      ...prev,
                      barcodeType: e.target.value as BarcodeSymbology,
                    }))
                  }
                  className="px-3 py-1.5 bg-purple-950 border border-purple-500/40 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="CODE128">Code 128 (قياسي افتراضي)</option>
                  <option value="EAN13">EAN-13 عالمي</option>
                  <option value="EAN8">EAN-8 قصير</option>
                  <option value="CODE39">Code 39</option>
                  <option value="UPC">UPC-A</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-bold pt-1">
                {[
                  { key: "showProductName", label: "اسم المنتج" },
                  { key: "showProductPrice", label: "سعر المنتج" },
                  { key: "showBarcode", label: "باركود خطي (1D)" },
                  { key: "showQRCode", label: "كود QR (2D)" },
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
            </div>

            {/* 5. Quantity Allocation */}
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

          {/* Right Column: Interactive Live Label Preview & Multi-Format Exports (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            
            {/* Live Interactive Preview Box */}
            <div className="bg-[#15102a]/90 rounded-3xl p-5 border border-purple-500/40 flex flex-col items-center justify-between min-h-[380px] shadow-inner">
              
              <div className="flex items-center justify-between w-full mb-3">
                <span className="text-xs font-extrabold text-purple-300">
                  🔍 معاينة حية بالمليمتر (Marklife X4 Preview)
                </span>
                <span className="text-[11px] font-mono text-purple-400 bg-purple-950 px-2 py-0.5 rounded-full border border-purple-500/30">
                  {customization.rollWidthMM}×{customization.rollHeightMM} mm
                </span>
              </div>

              {sampleProduct ? (
                <div
                  className="bg-white text-gray-900 rounded-2xl p-4 border-2 border-dashed border-gray-400 w-full shadow-2xl flex flex-col items-center justify-between transition-all"
                  style={{
                    maxWidth: `${Math.min(280, customization.rollWidthMM * 6)}px`,
                    minHeight: `${Math.min(240, customization.rollHeightMM * 6)}px`,
                  }}
                >
                  {/* Name */}
                  {customization.showProductName && (
                    <div
                      className="font-extrabold text-center text-gray-900 mb-1 leading-snug break-words whitespace-normal"
                      style={{ fontSize: `${customization.nameFontSize}px` }}
                    >
                      {sampleProduct.name}
                    </div>
                  )}

                  {/* Price */}
                  {customization.showProductPrice && (
                    <div
                      className="font-black text-blue-600 mb-1"
                      style={{ fontSize: `${customization.priceFontSize}px` }}
                    >
                      {sampleProduct.retailPrice.toLocaleString()} IQD
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
                        <img src={previewQrUrl} alt="QR Code" className="w-14 h-14 object-contain block" />
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {customization.showFooterText && customization.footerText && (
                    <div className="text-[10px] text-gray-500 font-bold border-t border-gray-200 pt-1.5 w-full text-center mt-1 break-words whitespace-normal">
                      {customization.footerText}
                    </div>
                  )}
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
