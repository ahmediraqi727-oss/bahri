"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSettings } from "@/lib/settings-context";
import { useData } from "@/lib/data-context";
import { useToast } from "@/components/ToastProvider";
import { WatermarkConfig, WatermarkPosition, DEFAULT_WATERMARK_CONFIG } from "@/lib/types";
import ImageUploader from "./ImageUploader";

export interface WatermarkSettingsProps {
  initialConfig?: WatermarkConfig;
  onSave?: (config: WatermarkConfig) => Promise<void> | void;
}

export default function WatermarkSettings({ initialConfig, onSave }: WatermarkSettingsProps = {}) {
  const { settings, updateSettings } = useSettings();
  const { products, categories, reloadAllData } = useData();
  const { success, error: toastError, warning, loading: toastLoading, resolve: resolveToast } = useToast();

  const [config, setConfig] = useState<WatermarkConfig>(
    initialConfig || settings.watermarkConfig || DEFAULT_WATERMARK_CONFIG
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);

  // Sync draft state when initialConfig or settings context changes
  useEffect(() => {
    if (initialConfig) {
      setConfig({ ...DEFAULT_WATERMARK_CONFIG, ...initialConfig });
    } else if (settings.watermarkConfig) {
      setConfig({ ...DEFAULT_WATERMARK_CONFIG, ...settings.watermarkConfig });
    }
  }, [initialConfig, settings.watermarkConfig]);

  // Sample Preview Product Image state
  const firstProductWithImage = products.find((p) => p.image && p.image.trim())?.image || "";
  const [sampleImage, setSampleImage] = useState<string>(
    firstProductWithImage || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80"
  );

  // Sharp Server Preview state
  const [serverPreviewUrl, setServerPreviewUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Bulk Apply options state
  const [bulkScope, setBulkScope] = useState<"all" | "category">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; message?: string } | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  // Check unsaved changes
  const isDirty = JSON.stringify(config) !== JSON.stringify(initialConfig || settings.watermarkConfig || DEFAULT_WATERMARK_CONFIG);

  const handleConfigChange = <K extends keyof WatermarkConfig>(key: K, value: WatermarkConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setServerPreviewUrl(null); // Clear server preview cache when parameters change
  };

  // Upload logo via local File Input (Base64 or URL)
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toastError("حجم الملف كبير", "يجب أن يكون حجم شعار اللوكو أقل من 2 ميجابايت.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      if (result) {
        handleConfigChange("watermarkUrl", result);
        success("تم تحميل الشعار بنجاح", "تمت معاينة الشعار الجديد فوراً.");
      }
    };
    reader.readAsDataURL(file);
  };

  // ── 1. Save Watermark Settings ─────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveConfig = async () => {
    try {
      setIsSaving(true);
      if (onSave) {
        await onSave(config);
      } else {
        await updateSettings({ watermarkConfig: config });
      }

      // Direct fallback to update watermark_config in settings table
      try {
        const { supabase } = await import("@/lib/supabase-client");
        const existing = await supabase.from("settings").select("id").limit(1).maybeSingle();
        if (existing?.data?.id) {
          await supabase
            .from("settings")
            .update({ watermark_config: config })
            .eq("id", existing.data.id);
        }
      } catch (directErr) {
        console.warn("Direct settings update notice:", directErr);
      }

      success("تم الحفظ بنجاح", "تم تحديث إعدادات العلامة المائية وحفظها في القاعدة.");
    } catch (err: any) {
      toastError("فشل الحفظ", err?.message || "حدث خطأ أثناء حفظ الإعدادات.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── 2. Handle Server-Side Sharp Live Preview ──────────────────────────────
  const handleGenerateServerPreview = async () => {
    if (!config.watermarkUrl) {
      warning("يرجى رفع شعار العلامة المائية أولاً لرؤية المعاينة الحقيقية من Sharp");
      return;
    }

    setGeneratingPreview(true);
    try {
      const res = await fetch("/api/watermark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: sampleImage,
          watermarkConfig: config,
          preview: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "فشلت عملية توليد المعاينة");
      }

      setServerPreviewUrl(data.previewUrl);
    } catch (err: any) {
      console.error("Server preview error:", err);
      toastError("خطأ المعاينة الحية", err?.message || "تعذر معالجة المعاينة بالسيرفر");
    } finally {
      setGeneratingPreview(false);
    }
  };

  // ── 3. Interactive Click & Drag Position Calculation ─────────────────────
  const updateCustomPositionFromMouseEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!previewBoxRef.current) return;
    const rect = previewBoxRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    const y = Math.min(Math.max(0, e.clientY - rect.top), rect.height);

    const customX = Math.round((x / rect.width) * 100);
    const customY = Math.round((y / rect.height) * 100);

    setConfig((prev) => ({
      ...prev,
      position: "custom",
      customX,
      customY,
    }));
    setServerPreviewUrl(null);
  };

  // ── 4. Bulk Processing Execution (Chunked with Progress Bar) ─────────────
  const handleRunBulkWatermark = async (revert: boolean = false) => {
    if (!revert && !config.watermarkUrl) {
      toastError("الشعار مفقود", "يرجى رفع أو تحديد صورة الشعار (Watermark) أولاً.");
      return;
    }

    // Filter target products
    let targetProducts = products.filter((p) => p.image && p.image.trim());

    if (bulkScope === "category") {
      if (!selectedCategory) {
        warning("يرجى اختيار القسم المطلوب تطبيقه أولاً");
        return;
      }
      const catLower = selectedCategory.toLowerCase();
      targetProducts = targetProducts.filter(
        (p) => p.notes && p.notes.toLowerCase().includes(catLower)
      );
    }

    if (targetProducts.length === 0) {
      warning("لا توجد منتجات مطابقة لتطبيق العملية عليها");
      return;
    }

    const actionText = revert ? "استعادة الصور الأصلية وإزالة العلامة" : "تطبيق العلامة المائية";
    const confirmMsg = `هل أنت متأكد من رغبتك في "${actionText}" على ${targetProducts.length} منتج؟ قد تستغرق العملية بضع ثوانٍ.`;
    if (!window.confirm(confirmMsg)) return;

    if (revert) setIsReverting(true);
    else setIsProcessingBulk(true);

    const toastId = toastLoading(`جاري ${actionText}...`, `0 / ${targetProducts.length} منتج`);
    setBulkProgress({ current: 0, total: targetProducts.length, message: "جاري بدء المعالجة..." });

    const CHUNK_SIZE = 15;
    let totalProcessed = 0;
    let totalErrors = 0;

    try {
      for (let i = 0; i < targetProducts.length; i += CHUNK_SIZE) {
        const chunk = targetProducts.slice(i, i + CHUNK_SIZE);
        const payloadItems = chunk.map((p) => ({
          id: p.id,
          image: p.image,
          originalImageUrl: p.originalImageUrl,
        }));

        const res = await fetch("/api/watermark/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: payloadItems,
            watermarkConfig: config,
            options: config,
            revertToOriginal: revert,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "فشل تنفيذ المعالجة الجماعية.");
        }

        totalProcessed += data.processedCount || 0;
        totalErrors += data.errorsCount || data.failedCount || 0;

        const currentCount = Math.min(i + CHUNK_SIZE, targetProducts.length);
        setBulkProgress({ current: currentCount, total: targetProducts.length, message: `تمت معالجة ${currentCount} من ${targetProducts.length} منتج` });
        toastLoading(
          `جاري ${actionText}... (${currentCount} من ${targetProducts.length})`,
          `معالجة Sharp في الخلفية (دفعات 15 عنصر)`,
          toastId
        );
      }

      await reloadAllData();

      resolveToast(
        toastId,
        totalErrors > 0 ? "warning" : "success",
        `🎉 اكتملت المهمة!`,
        `تمت معالجة ${totalProcessed} منتج بنجاح${totalErrors > 0 ? ` (تخطي ${totalErrors} بسبب أخطاء)` : ""}`
      );
    } catch (err: any) {
      console.error("Bulk process error:", err);
      resolveToast(toastId, "error", "خطأ في المعالجة الجماعية", err?.message || "حدث خطأ غير متوقع");
    } finally {
      setIsProcessingBulk(false);
      setIsReverting(false);
      setBulkProgress(null);
    }
  };

  // Preview Overlay CSS Styles
  const getPreviewStyle = (): React.CSSProperties => {
    const pos = config.position || "bottom-right";
    const scale = config.scale || 20;
    const opacity = (config.opacity ?? 80) / 100;

    let style: React.CSSProperties = {
      position: "absolute",
      width: `${scale}%`,
      opacity: opacity,
      pointerEvents: "none",
      transition: "all 0.15s ease-out",
    };

    switch (pos) {
      case "top-left":
        style.top = "4%";
        style.left = "4%";
        break;
      case "top-right":
        style.top = "4%";
        style.right = "4%";
        break;
      case "bottom-left":
        style.bottom = "4%";
        style.left = "4%";
        break;
      case "bottom-right":
        style.bottom = "4%";
        style.right = "4%";
        break;
      case "center":
        style.top = "50%";
        style.left = "50%";
        style.transform = "translate(-50%, -50%)";
        break;
      case "custom":
        style.top = `${config.customY ?? 85}%`;
        style.left = `${config.customX ?? 85}%`;
        style.transform = "translate(-50%, -50%)";
        break;
    }

    return style;
  };

  return (
    <div className="relative bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl shadow-xl overflow-hidden text-right" dir="rtl">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xl shadow-md">
            💧
          </div>
          <div>
            <h2 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
              <span>إدارة العلامة المائية الآلية (Watermark Engine)</span>
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              تحكم في دمج الشعار تلقائياً على صور المنتجات، وتطبيق الإعدادات جماعياً أو أثناء الاستيراد.
            </p>
          </div>
        </div>

        {/* Global Enable Switch */}
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => handleConfigChange("enabled", e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            <span className="mr-3 text-xs font-bold text-gray-700 dark:text-gray-300">
              {config.enabled ? "النظام مَفْعَل ✅" : "النظام مُعطّل ⚪"}
            </span>
          </label>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Settings Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Logo Upload */}
          <div className="space-y-2">
            <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300">
              صورة الشعار (Logo / Watermark)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="أدخل رابط الشعار المباشر (URL) أو ارفع صورة..."
                value={config.watermarkUrl}
                onChange={(e) => handleConfigChange("watermarkUrl", e.target.value)}
                className="flex-1 px-3.5 py-2.5 border border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLogoFileChange}
                accept="image/png, image/svg+xml, image/webp, image/jpeg"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-bold text-xs transition-all whitespace-nowrap shadow-sm"
              >
                📁 رفع شعار
              </button>
            </div>
            <p className="text-[11px] text-gray-400">يُفضل استخدام صيغة PNG بخلفية شفافة أو SVG للحصول على جودة فائقة.</p>
          </div>

          {/* 2. Position Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-extrabold text-gray-700 dark:text-gray-300">
                موضع الشعار على الصورة
              </label>
              {config.position === "custom" && (
                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  مخصص: X={config.customX ?? 85}% | Y={config.customY ?? 85}%
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {(
                [
                  { id: "top-left", label: "أعلى يسار" },
                  { id: "top-right", label: "أعلى يمين" },
                  { id: "bottom-left", label: "أسفل يسار" },
                  { id: "bottom-right", label: "أسفل يمين" },
                  { id: "center", label: "المنتصف" },
                  { id: "custom", label: "مخصص (%)" },
                ] as const
              ).map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => handleConfigChange("position", pos.id as WatermarkPosition)}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all ${
                    config.position === pos.id
                      ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 scale-[1.02]"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Position Sliders */}
          {config.position === "custom" && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-2xl border border-blue-100 dark:border-blue-900/40">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                  الموضع الأفقي (X %): {config.customX ?? 85}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={config.customX ?? 85}
                  onChange={(e) => handleConfigChange("customX", Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                  الموضع العمودي (Y %): {config.customY ?? 85}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={config.customY ?? 85}
                  onChange={(e) => handleConfigChange("customY", Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* 3. Opacity & Scale Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 p-4 bg-gray-50/60 dark:bg-gray-800/40 rounded-2xl border border-gray-200 dark:border-gray-700">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-gray-700 dark:text-gray-300">👁️ درجة الشفافية (Opacity)</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{config.opacity ?? 80}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={config.opacity ?? 80}
                onChange={(e) => handleConfigChange("opacity", Number(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-gray-700 dark:text-gray-300">📐 حجم الشعار بالنسبة للصورة</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">{config.scale ?? 20}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="80"
                value={config.scale ?? 20}
                onChange={(e) => handleConfigChange("scale", Number(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
            </div>
          </div>

          {/* 4. Apply Automatically on New Upload */}
          <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-extrabold text-emerald-900 dark:text-emerald-300">
                ⚡ تطبيق العلامة المائية تلقائياً أثناء رفع الصور
              </h4>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                عند رفع صورة جديدة لمنتج أو استيراد ملفات Excel، يتم تشغيل السيرفر تلقائياً لدمج العلامة
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.applyOnUpload ?? true}
              onChange={(e) => handleConfigChange("applyOnUpload", e.target.checked)}
              className="w-5 h-5 accent-emerald-600 rounded cursor-pointer shrink-0"
            />
          </div>
        </div>

        {/* Right Column: Live Interactive Preview Canvas & Server Test (5 cols) */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center space-y-4 bg-gray-900 p-5 rounded-3xl border border-gray-800 shadow-xl">
          <div className="w-full flex items-center justify-between border-b border-gray-800 pb-3">
            <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
              <span>👁️</span>
              <span>المعاينة التفاعلية الحية</span>
            </span>
            <span className="text-[10px] bg-blue-900/60 text-blue-300 px-2.5 py-0.5 rounded-full font-bold">
              تفاعلي
            </span>
          </div>

          {/* Change Sample Image Bar */}
          <div className="w-full flex items-center justify-between text-xs text-gray-300 bg-gray-800/80 p-2.5 rounded-xl border border-gray-700">
            <span className="truncate max-w-[180px]">صورة الاختبار للعرض</span>
            <button
              type="button"
              onClick={() => {
                const url = window.prompt("أدخل رابط صورة أخرى للمعاينة:", sampleImage);
                if (url && url.trim()) setSampleImage(url.trim());
              }}
              className="text-xs font-bold text-blue-400 hover:underline shrink-0"
            >
              تغيير الصورة 🔄
            </button>
          </div>

          {/* Interactive Preview Canvas Container */}
          <div
            ref={previewBoxRef}
            onClick={updateCustomPositionFromMouseEvent}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onMouseMove={(e) => {
              if (isDragging) updateCustomPositionFromMouseEvent(e);
            }}
            className="relative w-full aspect-square max-w-[280px] rounded-2xl overflow-hidden shadow-md border-2 border-dashed border-gray-700 bg-black cursor-crosshair select-none group"
          >
            <img src={serverPreviewUrl || sampleImage} alt="Product Preview" className="w-full h-full object-contain" />

            {/* Client Live Overlay Preview (Only shown if serverPreviewUrl is not active) */}
            {!serverPreviewUrl && config.watermarkUrl ? (
              <img src={config.watermarkUrl} alt="Watermark Overlay" style={getPreviewStyle()} className="drop-shadow-md" />
            ) : !serverPreviewUrl ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
                <span className="text-white text-xs font-bold bg-black/70 px-3 py-1.5 rounded-xl">
                  الرجاء إدخال رابط الشعار للمعاينة
                </span>
              </div>
            ) : null}

            <div className="absolute inset-x-0 bottom-0 bg-black/80 p-2 text-center text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">
              💡 انقر أو اسحب على أي مكان في الصورة لتحديد موقع الشعار المخصص
            </div>
          </div>

          {/* Server Sharp Preview Trigger Button */}
          <button
            type="button"
            onClick={handleGenerateServerPreview}
            disabled={generatingPreview || !config.watermarkUrl}
            className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {generatingPreview ? (
              <>
                <span className="animate-spin">🔄</span>
                <span>جاري المعالجة بواسطة Sharp...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>معاينة حقيقية جودة سيرفر Sharp</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bottom Actions Bar */}
      <div className="p-4 sm:p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <button
            type="button"
            onClick={() => handleRunBulkWatermark(false)}
            disabled={isProcessingBulk || !config.watermarkUrl}
            className="flex-1 sm:flex-initial px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <span>⚡</span>
            <span>تطبيق على جميع منتجات المتجر</span>
          </button>

          <button
            type="button"
            onClick={() => handleRunBulkWatermark(true)}
            disabled={isProcessingBulk}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
            title="استعادة الصور الأصلية وإزالة العلامة المائية"
          >
            <span>↩️</span>
            <span>استعادة الصور الأصلية</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleSaveConfig}
          disabled={!isDirty}
          className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-extrabold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <span>💾</span>
          <span>حفظ إعدادات العلامة المائية</span>
        </button>
      </div>

      {/* Bulk Progress Overlay Modal */}
      {isProcessingBulk && (
        <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto text-xl animate-spin">
              ⚙️
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">جاري معالجة الصور عبر السيرفر (Sharp Chunk Engine)</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{bulkProgress?.message || "يرجى الانتظار وعدم إغلاق الصفحة..."}</p>
            </div>
            {bulkProgress && (
              <div className="w-full bg-gray-200 dark:bg-gray-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${Math.round((bulkProgress.current / bulkProgress.total) * 100)}%` }}
                ></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
